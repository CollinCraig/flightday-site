#!/usr/bin/env node
import {s3,s3Get} from '../media/s3.mjs';
import {media,json,sha} from '../media/lib.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export async function casProbe() {
  // Identical bytes only: even the success test does not mutate an immutable probe key.
  const key='packs/v1/_probe/transport-20261115-05/index.json';
  const ledger=await json(path.join(media,'key-ledger.json')), object=await s3Get(key);
  if(!object||!object.etag||sha(object.body)!==ledger.keys[key]?.sha256)throw new Error('Verified throwaway index required before CAS test');
  const headers={'Content-Type':'application/json','Cache-Control':'max-age=3600','x-amz-storage-class':'STANDARD'};
  const wrong=await s3('PUT',key,object.body,{...headers,'If-Match':'"00000000000000000000000000000000"'});await wrong.arrayBuffer();
  if(wrong.status!==412)throw new Error('Wrong If-Match did not fail with 412; CAS is not accepted');
  console.log('PASS S3 wrong If-Match: 412 PreconditionFailed');
  const correct=await s3('PUT',key,object.body,{...headers,'If-Match':object.etag});await correct.arrayBuffer();
  if(correct.status!==200)throw new Error('Correct If-Match failed');
  const after=await s3Get(key);
  if(!after||sha(after.body)!==sha(object.body))throw new Error('CAS test bytes changed');
  console.log('PASS S3 correct If-Match: 200; SHA-256 unchanged');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))casProbe().catch(e=>{console.error(e.message);process.exitCode=1;});
