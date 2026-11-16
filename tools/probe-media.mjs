#!/usr/bin/env node
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {infra,retired,sha,keyCheck} from '../media/lib.mjs';

export async function request(key, options={}) {
  keyCheck(key);
  const r=await fetch('https://'+infra.domain+'/'+key,{...options,redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(r.headers.has('set-cookie'))throw new Error('Set-Cookie received for '+key);
  if(r.headers.has('access-control-allow-credentials'))throw new Error('Access-Control-Allow-Credentials received for '+key);
  return r;
}
export async function probeRetired() {
  const keys=await retired();
  for(const key of keys) {
    const r=await request(key); await r.arrayBuffer();
    if(r.status!==404)throw new Error(`RETIRED KEY NOT 404: ${key} (${r.status})`);
  }
  console.log(`PASS ${keys.size} retired keys return 404`);
}
export function validateIndex(index) {
  if(index?.schema!==1||!Array.isArray(index.packs))throw new Error('Index schema requires {schema:1,packs:[]}');
  if(Object.keys(index).some(k=>!['schema','packs'].includes(k)))throw new Error('Unknown index fields');
  const seen=new Set();
  for(const p of index.packs) {
    if(!/^[a-z0-9][a-z0-9-]*$/.test(p.pack)&&p.pack!=='_probe')throw new Error('Invalid pack in index');
    if(Object.keys(p).some(k=>!['pack','version','manifest','sha256'].includes(k)))throw new Error('Unknown index pack fields');
    if(seen.has(p.pack)||typeof p.version!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(p.version)||!/^[a-f0-9]{64}$/.test(p.sha256))throw new Error('Index requires unique packs, version and manifest SHA-256');
    seen.add(p.pack);
    if(p.manifest!==`https://${infra.domain}/packs/v1/${p.pack}/${p.version}/manifest.json`)throw new Error('Index manifest URL is not versioned first-party');
  }
}
export const corsOriginAllowed=origin=>origin==='https://flightday.app'||origin==='https://appassets.androidplatform.net';
export async function probeNullDenied(key) {
  const r=await request(key,{headers:{Origin:'null'}});await r.arrayBuffer();
  if(r.status!==200||r.headers.has('access-control-allow-origin'))throw new Error('Origin null must have no ACAO: '+key);
  console.log('PASS Origin null on '+key+': 200; no ACAO, ACAC or Set-Cookie');
}
export async function probe({indexKey='packs/v1/index.json',retiredOnly=false,allowEmpty=false,allVariants=false}={}) {
  await probeRetired(); if(retiredOnly)return;
  const r=await request(indexKey), cc=r.headers.get('cache-control')||'';
  if(r.status!==200||!/(?:^|[, ])max-age=3600(?:$|[, ])/.test(cc)||!r.headers.get('content-type')?.includes('application/json'))throw new Error('Index status/cache/type failed');
  const index=await r.json(); validateIndex(index);
  console.log('PASS index 200; Cache-Control '+cc+'; no Set-Cookie');
  await probeNullDenied(indexKey);
  await probeCors(indexKey,{range:false});
  let mediaKey,mediaRecord,posterKey;
  for(const entry of index.packs) {
    const key=new URL(entry.manifest).pathname.slice(1), mr=await request(key), bytes=Buffer.from(await mr.arrayBuffer());
    if(mr.status!==200||!/(?:^|[, ])max-age=3600(?:$|[, ])/.test(mr.headers.get('cache-control')||'')||sha(bytes)!==entry.sha256)throw new Error('Manifest status/cache/hash failed');
    const manifest=JSON.parse(bytes);
    if(manifest.pack!==entry.pack||manifest.version!==entry.version||!manifest.clips?.length)throw new Error('Manifest schema failed');
    console.log('PASS manifest 200; max-age=3600; SHA-256 verified; no Set-Cookie');
    await probeNullDenied(key);
    await probeCors(key,{range:false});
    if(allVariants)for(const clip of manifest.clips)for(const variant of clip.variants) {
      const variantKey=new URL(variant.url).pathname.slice(1), response=await request(variantKey), body=Buffer.from(await response.arrayBuffer());
      if(response.status!==200||body.length!==variant.bytes||sha(body)!==variant.sha256||!response.headers.get('content-type')?.includes('video/mp4')||!response.headers.get('cache-control')?.includes('immutable')||(response.headers.has('content-length')&&Number(response.headers.get('content-length'))!==variant.bytes))throw new Error('Variant status/length/hash/type/cache failed: '+variantKey);
      console.log('PASS variant GET 200; '+body.length+' bytes; SHA-256 verified; immutable: '+variantKey);
    }
    if(!mediaKey){
      mediaRecord=manifest.clips[0].variants[0];mediaKey=new URL(mediaRecord.url).pathname.slice(1);
      const findUrl=value=>{if(value&&typeof value==='object'){if(value.url)return value.url;for(const child of Object.values(value)){const url=findUrl(child);if(url)return url;}}};
      const poster=findUrl(manifest.clips[0].poster);if(poster)posterKey=new URL(poster).pathname.slice(1);
    }
  }
  if(!mediaKey){if(allowEmpty){await probeCors(indexKey);console.log('PENDING first real pack: discovery index is empty; manifest/media checks require a pack (transport proof recorded separately)');return;}throw new Error('No pack exists to prove media transport');}
  const media=await request(mediaKey), full=Buffer.from(await media.arrayBuffer());
  if(media.status!==200||!media.headers.get('cache-control')?.includes('immutable')||!media.headers.get('content-type')?.includes('video/mp4'))throw new Error('Media status/cache/type failed');
  if(sha(full)!==mediaRecord.sha256||full.length!==mediaRecord.bytes)throw new Error('Media SHA-256/size mismatch');
  console.log('PASS media 200; '+media.headers.get('cache-control')+'; video/mp4; no Set-Cookie');
  const range=await request(mediaKey,{headers:{Range:'bytes=0-15'}}), partial=Buffer.from(await range.arrayBuffer());
  if(range.status!==206||range.headers.get('content-range')!==`bytes 0-15/${full.length}`||!partial.equals(full.subarray(0,16)))throw new Error('Range 206 or content failed');
  console.log('PASS Range bytes=0-15: 206; Content-Range '+range.headers.get('content-range'));
  await probeNullDenied(mediaKey);
  await probeCors(mediaKey);
  if(!posterKey)throw new Error('No poster exists to prove WebP CORS');
  const poster=await request(posterKey,{method:'HEAD'});
  if(poster.status!==200||!poster.headers.get('cache-control')?.includes('immutable')||!poster.headers.get('content-type')?.includes('image/webp'))throw new Error('Poster status/cache/type failed');
  console.log('PASS poster 200; immutable; image/webp; no Set-Cookie or ACAC');
  await probeNullDenied(posterKey);
  await probeCors(posterKey);
  console.log('PASS media host probe');
}
export async function probeCors(mediaKey,{range=true}={}) {
  for(const origin of ['https://flightday.app','https://appassets.androidplatform.net','null','https://disallowed.example']) {
    const cr=await request(mediaKey,{method:'HEAD',headers:{Origin:origin}});
    const allowed=corsOriginAllowed(origin);
    if(cr.status!==200||cr.headers.get('access-control-allow-origin')!==(allowed?origin:null))throw new Error('CORS origin test failed: '+origin);
    const get=await request(mediaKey,{headers:{Origin:origin,...(range?{Range:'bytes=0-15'}:{})}});await get.arrayBuffer();
    if(get.status!==(range?206:200)||get.headers.get('access-control-allow-origin')!==(allowed?origin:null))throw new Error('CORS ranged GET failed: '+origin);
    console.log('PASS CORS '+origin+': '+(cr.headers.get('access-control-allow-origin')??'absent')+'; HEAD 200, '+(range?'GET Range 206':'GET 200')+'; no Set-Cookie');
  }
  const baseline=await fetch('https://flightday.app/',{method:'HEAD',signal:AbortSignal.timeout(30000)});
  const main=await fetch('https://flightday.app/',{method:'HEAD',headers:{Origin:'null'},signal:AbortSignal.timeout(30000)});
  if(main.status!==baseline.status||main.headers.get('access-control-allow-origin')!==baseline.headers.get('access-control-allow-origin')||main.headers.has('access-control-allow-credentials'))throw new Error('Main site affected by media CORS rule');
  console.log('PASS flightday.app unaffected: baseline and Origin null ACAO both '+(main.headers.get('access-control-allow-origin')??'absent')+'; no ACAC');
  console.log('PASS CORS probe responses have no Set-Cookie or Access-Control-Allow-Credentials');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))probe({indexKey:process.argv.find(a=>a.startsWith('--index='))?.slice(8),retiredOnly:process.argv.includes('--retired-only'),allowEmpty:process.argv.includes('--allow-empty'),allVariants:process.argv.includes('--all-variants')}).catch(e=>{console.error(e.message);process.exitCode=1;});
