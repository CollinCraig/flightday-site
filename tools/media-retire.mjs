#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {media,infra,sha,keyCheck,retired,atomic,locked,wrangler,purge,json} from '../media/lib.mjs';
import {remoteGet} from './media-upload.mjs';
import {probeRetired} from './probe-media.mjs';
import {s3Put} from '../media/s3.mjs';

export async function retireKey(key,apply=false) {
  keyCheck(key);
  if(key==='packs/v1/index.json')throw new Error('Discovery index cannot be retired');
  if(!apply){console.log('PLAN archive + SHA verify, burn name, delete original, exact URL purge, require 404: '+key);return;}
  const set=await retired(), ledgerFile=path.join(media,'key-ledger.json'), state=await json(ledgerFile);
  const record=state.keys[key];
  if(!record)throw new Error('Unknown key: retirement requires the published SHA-256 ledger');
  const archive='retired/'+key, source=await remoteGet(key);
  if(source) {
    if(sha(source)!==record.sha256)throw new Error('Source no longer matches published ledger');
    const existing=await remoteGet(archive);
    if(existing && sha(existing)!==record.sha256)throw new Error('Archive contains different bytes');
    if(!existing) {
      await s3Put(archive,source,'application/octet-stream','no-store',{'If-None-Match':'*'});
    }
    if(sha(await remoteGet(archive)??Buffer.alloc(0))!==record.sha256)throw new Error('Archive verification failed; original preserved');
    console.log('PASS retired/ archive SHA-256 verified');
    state.keys[key].archived=true;
    await atomic(ledgerFile,JSON.stringify(state,null,2)+'\n');
    set.add(key);
    await atomic(path.join(media,'retired-keys.txt'),'# Permanently burned R2 keys. Never remove entries.\n'+[...set].sort().join('\n')+'\n');
    wrangler(['r2','object','delete',infra.bucket+'/'+key,'--remote']);
    console.log('DELETED original after verified archive: '+key);
  } else if(!set.has(key)||!record.archived)throw new Error('Original missing without a completed verified archive receipt');
  await purge([key]);
  await probeRetired();
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))locked(()=>retireKey(process.argv[2],process.argv.includes('--apply'))).catch(e=>{console.error(e.message);process.exitCode=1;});
