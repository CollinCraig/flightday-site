#!/usr/bin/env node
// Fixed synthetic bytes for HTTP transport verification only; no footage or local encoding.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {media,sha,atomic,json,locked} from '../media/lib.mjs';
import {upload,publishIndex} from './media-upload.mjs';
import {probe} from './probe-media.mjs';
import {retireKey} from './media-retire.mjs';
export const probeVersion='transport-20261115-05';

export async function fixture() {
  const root=path.join(media,'packs/_probe');
  const video=Buffer.from('000000206674797069736f6d0000020069736f6d69736f32617663316d703431','hex');
  const poster=Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==','base64');
  const credit='Generated · Flight Day synthetic transport probe';
  const provenance={source_url:'https://flightday.app/',creator:'Flight Day',licence:'CC0-1.0',licence_checked:'2026-11-14',fetched_utc:'2026-11-15T00:00:00Z',original_bytes:video.length,original_sha256:sha(video),processing:['Fixed synthetic MP4 ftyp bytes; transport only, no playable footage or encoding.','Fixed one-pixel WebP test fixture.'],notice:credit,no_endorsement:'No agency footage, marks or endorsement.'};
  const record=(url,body,height)=>({url,bytes:body.length,sha256:sha(body),height});
  const manifest={pack:'_probe',version:probeVersion,title:'Synthetic HTTP transport probe',licence_summary:'CC0 synthetic test bytes; no footage',clips:[{id:'transport',title:'Transport only; not a playable wallpaper',credit,licence:'CC0-1.0',source_url:provenance.source_url,duration_s:1,provenance,poster:record('transport.webp',poster,1),variants:[{...record('transport.mp4',video,1),codec:'h264',fps:1,kbps:1}]}]};
  await fs.mkdir(root,{recursive:true});
  await atomic(path.join(root,'transport.mp4'),video);await atomic(path.join(root,'transport.webp'),poster);
  await atomic(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await atomic(path.join(root,'PROVENANCE.md'),'# Synthetic transport probe\n\n'+JSON.stringify(provenance,null,2)+'\n\n| Output | Bytes | SHA-256 |\n| --- | ---: | --- |\n'+`| transport.mp4 | ${video.length} | ${sha(video)} |\n| transport.webp | ${poster.length} | ${sha(poster)} |\n`);
  console.log('Prepared fixed synthetic transport fixture; no encoding.');
}
export async function runFixture(apply=false,retire=false) {
  if(!retire){await fixture();await upload('_probe',apply);}
  if(!apply)return;
  const state=await json(path.join(media,'key-ledger.json'));
  const indexKey=`packs/v1/_probe/${probeVersion}/index.json`;
  if(!retire) {
    await publishIndex({schema:1,packs:[state.packs._probe]},'missing',state,indexKey);
    await probe({indexKey});
  } else {
    for(const key of Object.keys(state.keys).filter(k=>k.startsWith(`packs/v1/_probe/${probeVersion}/`)))await retireKey(key,true);
    console.log('PASS all throwaway originals archived, deleted, purged and 404; names burned forever');
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))locked(()=>runFixture(process.argv.includes('--apply'),process.argv.includes('--retire'))).catch(e=>{console.error(e.message);process.exitCode=1;});
