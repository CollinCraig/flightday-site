import fs from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import {infra,account,sha} from './lib.mjs';

const hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
export async function s3(method,key,body=Buffer.alloc(0),extra={}) {
  if(!/^(?:packs\/v1|retired\/packs\/v1)\/[A-Za-z0-9_./-]+$/.test(key)||key.split('/').some(s=>!s||s==='.'||s==='..'))throw new Error('Invalid S3 key');
  const file=process.env.FLIGHTDAY_R2_ENV_FILE;
  if(!file)throw new Error('Set FLIGHTDAY_R2_ENV_FILE to the approved private r2-media.env file');
  const st=await fs.lstat(file);
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))throw new Error('R2 credential file must be regular and private (mode 600)');
  const text=await fs.readFile(file,'utf8');
  const read=name=>text.match(new RegExp('^'+name+'=([A-Za-z0-9_+/=-]+)$','m'))?.[1];
  const access=read('AWS_ACCESS_KEY_ID'), secret=read('AWS_SECRET_ACCESS_KEY');
  if(!access||!secret)throw new Error('R2 credential file lacks the two required entries; values withheld');
  const host=(await account())+'.r2.cloudflarestorage.com';
  const uri='/'+infra.bucket+'/'+key.split('/').map(encodeURIComponent).join('/');
  const stamp=new Date().toISOString().replace(/[:-]|\.\d{3}/g,''), date=stamp.slice(0,8), scope=date+'/auto/s3/aws4_request';
  // Identity encoding keeps S3 ETags strong: edge compression otherwise returns W/ validators for JSON.
  const headers={'host':host,'accept-encoding':'identity','x-amz-date':stamp,'x-amz-content-sha256':sha(body),...Object.fromEntries(Object.entries(extra).map(([k,v])=>[k.toLowerCase(),v]))};
  const names=Object.keys(headers).sort(), signed=names.join(';');
  const canonical=[method,uri,'',names.map(n=>n+':'+headers[n].trim().replace(/\s+/g,' ')+'\n').join(''),signed,sha(body)].join('\n');
  const signing=hmac(hmac(hmac(hmac('AWS4'+secret,date),'auto'),'s3'),'aws4_request');
  const signature=createHmac('sha256',signing).update('AWS4-HMAC-SHA256\n'+stamp+'\n'+scope+'\n'+sha(canonical)).digest('hex');
  headers.authorization=`AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
  try {return await fetch('https://'+host+uri,{method,headers,...(['GET','HEAD'].includes(method)?{}:{body}),redirect:'error',signal:AbortSignal.timeout(60000)});}
  catch {throw new Error('S3 transport failed; credentials and raw request withheld');}
}
export async function s3Get(key) {
  const r=await s3('GET',key);
  if(r.status===404)return null;
  if(!r.ok)throw new Error(`S3 GET failed HTTP ${r.status}; not treated as absent`);
  const bytes=Buffer.from(await r.arrayBuffer());
  if(bytes.length>infra.maxObjectBytes)throw new Error('Remote object exceeds 25 MiB');
  return {body:bytes,etag:r.headers.get('etag')};
}
export async function s3Put(key,body,type,cache,condition) {
  if(body.length>infra.maxObjectBytes)throw new Error('Object exceeds 25 MiB');
  if(!condition||!('If-Match' in condition||'If-None-Match' in condition))throw new Error('Every S3 PUT requires an atomic precondition');
  const r=await s3('PUT',key,body,{'Content-Type':type,'Cache-Control':cache,'x-amz-storage-class':'STANDARD',...condition});
  await r.arrayBuffer();
  if(!r.ok)throw new Error(`S3 conditional PUT failed HTTP ${r.status}; no overwrite performed on 412`);
  return r.headers.get('etag');
}
