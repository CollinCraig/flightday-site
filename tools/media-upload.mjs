#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {infra,media,sha,json,retired,keyCheck,guard,atomic,locked,wrangler,account,auth,purge} from '../media/lib.mjs';
import {probeRetired,validateIndex} from './probe-media.mjs';
import {s3Get,s3Put} from '../media/s3.mjs';

export const MAX=25*1024*1024;
const ledgerFile=path.join(media,'key-ledger.json');
async function ledger() { try{return await json(ledgerFile);}catch(e){if(e.code==='ENOENT')return {schema:1,keys:{},packs:{}};throw e;} }
export async function regular(file, root) {
  const relative=path.relative(root,file);
  if(relative.startsWith('..')||path.isAbsolute(relative)) throw new Error('Source escapes pack directory');
  let cursor=root;
  for(const part of ['.',...relative.split(path.sep)]) {
    cursor=path.resolve(cursor,part);
    if((await fs.lstat(cursor)).isSymbolicLink()) throw new Error('Symlinks are forbidden');
  }
  const st=await fs.stat(file);
  if(!st.isFile()||st.size>MAX) throw new Error('Media file is not regular or exceeds 25 MiB');
  return fs.readFile(file);
}
function localPath(url,root) {
  if(typeof url!=='string') throw new Error('Missing media URL');
  if(url.startsWith('https://')) {
    const u=new URL(url);
    if(u.origin!=='https://'+infra.domain||u.search||u.hash) throw new Error('Hotlinked media URL refused');
    return path.join(root,path.posix.basename(u.pathname));
  }
  if(url.includes(':')||url.includes('\\')||url.startsWith('/')) throw new Error('Invalid relative media file');
  return path.resolve(root,url);
}
export function verifyProvenance(text,file,hash,size) {
  // One output per Markdown table row (or line). Association must be unambiguous.
  const escaped=file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const name=new RegExp('(?:^|[\\s`|/])'+escaped+'(?=$|[\\s`|])');
  if(!text.split(/\r?\n/).some(line=>name.test(line)&&line.includes(hash)&&new RegExp('\\b'+size+'\\b').test(line))) throw new Error('PROVENANCE output row must contain exact filename, bytes and SHA-256');
}
export function assertImmutable(old, key, hash, burned=new Set()) {
  keyCheck(key);
  if(burned.has(key)) throw new Error('Burned media name refused');
  if(old[key] && old[key].sha256!==hash) throw new Error('Different bytes under an existing key refused; use a new version');
}
export async function stagePack(pack) {
  if(!/^[a-z0-9][a-z0-9-]*$/.test(pack) && pack!=='_probe') throw new Error('Invalid pack slug');
  const root=path.join(media,'packs',pack);
  const input=JSON.parse(await regular(path.join(root,'manifest.json'),root));
  const provenance=await regular(path.join(root,'PROVENANCE.md'),root);
  const text=provenance.toString('utf8');
  if(input.pack!==pack||!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(input.version)||!input.title||!input.licence_summary||!input.clips?.length) throw new Error('Manifest requires pack, version, title, licence_summary and clips');
  const prefix=`packs/v1/${pack}/${input.version}/`;
  const outputs=[], seen=new Set(), sourceFiles=new Set();
  for(const clip of input.clips) {
    if(!/^[a-z0-9][a-z0-9-]*$/.test(clip.id)||!clip.title||!(pack==='_probe'?/^Generated · .+/:/^Real footage · .+/).test(clip.credit)||!clip.licence||!/^https:\/\//.test(clip.source_url)||!(clip.duration_s>0)||!clip.variants?.length||!clip.poster) throw new Error('Clip metadata/honesty credit incomplete');
    // Provenance carries the required source and processing evidence, retained alongside the manifest.
    for(const field of ['source_url','creator','licence','licence_checked','fetched_utc','original_bytes','original_sha256','processing','notice','no_endorsement']) {
      if(!clip.provenance?.[field]) throw new Error('Clip provenance requires '+field);
    }
    if(clip.provenance.source_url!==clip.source_url || clip.provenance.licence!==clip.licence || clip.provenance.notice!==clip.credit || !/^[a-f0-9]{64}$/.test(clip.provenance.original_sha256)) throw new Error('Clip provenance disagrees with manifest');
    const posters=[];
    function walk(value) { if(value&&typeof value==='object') { if(typeof value.url==='string')posters.push(value); else for(const v of Object.values(value))walk(v); } }
    walk(clip.poster);
    if(!posters.length) throw new Error('Poster records require url, bytes, sha256 and height');
    for(const [record,isPoster] of [...clip.variants.map(v=>[v,false]),...posters.map(v=>[v,true])]) {
      if(!Number.isInteger(record.height)||record.height<1||!Number.isInteger(record.bytes)||!/^[a-f0-9]{64}$/.test(record.sha256)) throw new Error('Output requires height, bytes and SHA-256');
      if(!isPoster && (!['av1','hevc','h264'].includes(record.codec)||!(record.fps>0&&record.fps<=30)||!(record.kbps>0))) throw new Error('Invalid variant');
      const source=localPath(record.url,root), bytes=await regular(source,root), hash=sha(bytes);
      if(bytes.length!==record.bytes||hash!==record.sha256) throw new Error('Manifest size or SHA-256 mismatch');
      verifyProvenance(text,path.basename(source),hash,bytes.length);
      const key=prefix+`${clip.id}-${hash}-${record.height}.${isPoster?'webp':record.codec+'.mp4'}`;
      if(isPoster && !source.endsWith('.webp') || !isPoster && !source.endsWith('.mp4')) throw new Error('Wrong media extension');
      if(seen.has(key)) throw new Error('Duplicate output key');
      seen.add(key);sourceFiles.add(source);
      record.url='https://'+infra.domain+'/'+key;
      outputs.push({key,sha256:hash,bytes:bytes.length,body:bytes,type:isPoster?'image/webp':'video/mp4',cache:'public, max-age=31536000, immutable'});
    }
  }
  async function walkFiles(dir) {
    for(const ent of await fs.readdir(dir,{withFileTypes:true})) {
      const file=path.join(dir,ent.name);
      if(ent.isSymbolicLink()) throw new Error('Symlinks are forbidden');
      if(ent.isDirectory()) await walkFiles(file);
      else {
        if((await fs.stat(file)).size>MAX)throw new Error('Pack file exceeds 25 MiB');
        if(/\.(mp4|webp|png|jpe?g|mov|webm)$/i.test(ent.name)&&!sourceFiles.has(file)) throw new Error('Unreferenced media has no verified PROVENANCE association');
      }
    }
  }
  await walkFiles(root);
  await guard(root);
  const provenanceKey=prefix+'PROVENANCE.md';
  outputs.push({key:provenanceKey,sha256:sha(provenance),bytes:provenance.length,body:provenance,type:'text/markdown; charset=utf-8',cache:'public, max-age=31536000, immutable'});
  input.provenance_url='https://'+infra.domain+'/'+provenanceKey;
  input.provenance_sha256=sha(provenance);
  const manifestBody=Buffer.from(JSON.stringify(input,null,2)+'\n');
  if(manifestBody.length>MAX)throw new Error('Generated manifest exceeds 25 MiB');
  outputs.push({key:prefix+'manifest.json',sha256:sha(manifestBody),bytes:manifestBody.length,body:manifestBody,type:'application/json',cache:'max-age=3600'});
  const state=await ledger(), burned=await retired();
  for(const out of outputs)assertImmutable(state.keys,out.key,out.sha256,burned);
  const stage=path.join(media,'staged',pack);
  await fs.mkdir(stage,{recursive:true});
  for(const out of outputs) await atomic(path.join(stage,path.posix.basename(out.key)),out.body);
  const plan={pack,version:input.version,manifest:'https://'+infra.domain+'/'+prefix+'manifest.json',objects:outputs.map(({body,...r})=>r)};
  await atomic(path.join(stage,'plan.json'),JSON.stringify(plan,null,2)+'\n');
  console.log(`PASS staged ${pack}/${input.version}: ${outputs.length} verified objects (no account changes)`);
  return {plan,outputs,state};
}
export async function remoteGet(key) {
  return (await s3Get(key))?.body??null;
}
export async function putImmutable(out,state) {
  if(out.key==='packs/v1/index.json')throw new Error('Index must use the guarded publishIndex path');
  if(out.bytes>MAX) throw new Error('Object exceeds 25 MiB');
  assertImmutable(state.keys,out.key,out.sha256,await retired());
  const existing=await remoteGet(out.key);
  if(existing) {
    if(sha(existing)!==out.sha256)throw new Error('Remote key contains different bytes; overwrite refused');
    state.keys[out.key]={sha256:out.sha256,bytes:out.bytes};
    await atomic(ledgerFile,JSON.stringify(state,null,2)+'\n');
    console.log('UNCHANGED '+out.key); return;
  }
  // Record before writing, so interrupted operations still burn the name. A process-wide lock serializes the sole writer.
  state.keys[out.key]={sha256:out.sha256,bytes:out.bytes};
  await atomic(ledgerFile,JSON.stringify(state,null,2)+'\n');
  await s3Put(out.key,out.body,out.type,out.cache,{'If-None-Match':'*'});
  if(sha(await remoteGet(out.key)??Buffer.alloc(0))!==out.sha256)throw new Error('Remote SHA-256 verification failed');
  console.log('UPLOADED '+out.key);
}
export async function publishIndex(index,expected,state,key='packs/v1/index.json') {
  validateIndex(index);
  if(key==='packs/v1/index.json'&&index.packs.some(p=>p.pack==='_probe'))throw new Error('Synthetic probe cannot enter production discovery');
  const burned=await retired();
  for(const entry of index.packs) {
    const manifestKey=new URL(entry.manifest).pathname.slice(1);
    if(burned.has(manifestKey))throw new Error('Index references a retired manifest');
    const body=await remoteGet(manifestKey);
    if(!body||sha(body)!==entry.sha256)throw new Error('Referenced manifest absent or SHA-256 mismatch');
    const manifest=JSON.parse(body);
    if(manifest.pack!==entry.pack||manifest.version!==entry.version)throw new Error('Index and manifest disagree');
    const records=[];
    const visit=value=>{if(value&&typeof value==='object'){if(typeof value.url==='string')records.push(value);else for(const v of Object.values(value))visit(v);}};
    for(const c of manifest.clips){visit(c.variants);visit(c.poster);}
    records.push({url:manifest.provenance_url,sha256:manifest.provenance_sha256});
    for(const record of records) {
      const url=new URL(record.url);
      if(url.origin!=='https://'+infra.domain||url.search||url.hash)throw new Error('Index references hotlinked media');
      const objectKey=keyCheck(url.pathname.slice(1));
      if(burned.has(objectKey))throw new Error('Index references a retired object');
      const bytes=await remoteGet(objectKey);
      if(!bytes||sha(bytes)!==record.sha256||record.bytes!==undefined&&bytes.length!==record.bytes)throw new Error('Referenced media/provenance absent or SHA-256 mismatch');
    }
  }
  await probeRetired();
  const body=Buffer.from(JSON.stringify(index,null,2)+'\n'), hash=sha(body);
  if(body.length>MAX)throw new Error('Index exceeds 25 MiB');
  const current=await s3Get(key), currentHash=current?sha(current.body):'missing';
  if(currentHash===hash){console.log('UNCHANGED index');return;}
  if(currentHash!==expected)throw new Error('Index compare-and-swap refused: expected SHA-256 does not match current object');
  if(key!=='packs/v1/index.json') {
    await putImmutable({key,sha256:hash,bytes:body.length,body,type:'application/json',cache:'max-age=3600'},state);return;
  }
  // R2 S3 evaluates this condition atomically with the committed write; REST/Wrangler PUT does not.
  if(current&&(!current.etag||current.etag.startsWith('W/')))throw new Error('Current index lacks a strong ETag; CAS refused');
  await s3Put(key,body,'application/json','max-age=3600',current?{'If-Match':current.etag}:{'If-None-Match':'*'});
  if(sha(await remoteGet(key)??Buffer.alloc(0))!==hash)throw new Error('Index verification failed');
  state.keys[key]={sha256:hash,bytes:body.length};await atomic(ledgerFile,JSON.stringify(state,null,2)+'\n');
  await purge([key]);console.log('PASS index expected-hash update; all references verified');
}
export async function upload(pack,apply=false,expected='missing') {
  const {plan,outputs,state}=await stagePack(pack);
  if(!apply)return;
  await probeRetired();
  for(const out of outputs)await putImmutable(out,state);
  state.packs[pack]={pack,version:plan.version,manifest:plan.manifest,sha256:outputs.at(-1).sha256};
  await atomic(ledgerFile,JSON.stringify(state,null,2)+'\n');
  if(pack!=='_probe') {
    await publishIndex({schema:1,packs:Object.values(state.packs).filter(p=>p.pack!=='_probe').sort((a,b)=>a.pack.localeCompare(b.pack))},expected,state);
  }
  await probeRetired();
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const pack=process.argv[2];
  if(pack==='--index-hash') {
    try {const r=await fetch('https://'+infra.domain+'/packs/v1/index.json',{signal:AbortSignal.timeout(30000)});if(r.status!==200)throw new Error('Discovery index unavailable');console.log(sha(Buffer.from(await r.arrayBuffer())));}catch(e){console.error(e.message);process.exitCode=1;}
  }
  else if(!pack) {console.error('Usage: node tools/media-upload.mjs <pack> [--apply] [--index-expected=<sha256|missing>]');process.exitCode=1;}
  else locked(()=>upload(pack,process.argv.includes('--apply'),process.argv.find(a=>a.startsWith('--index-expected='))?.slice(17)??'missing')).catch(e=>{console.error(e.message);process.exitCode=1;});
}
