#!/usr/bin/env node
import {auth,account,json,media} from '../media/lib.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const classA=new Set(['ListBuckets','PutBucket','ListObjects','PutObject','CopyObject','CreateMultipartUpload','UploadPart','UploadPartCopy','CompleteMultipartUpload','PutBucketEncryption','PutBucketCors','PutBucketLifecycleConfiguration','ListMultipartUploads','ListParts']);
const classB=new Set(['HeadBucket','HeadObject','GetObject','UsageSummary','GetBucketEncryption','GetBucketCors','GetBucketLifecycleConfiguration']);
const free=new Set(['DeleteObject','DeleteObjects','DeleteBucket','AbortMultipartUpload','DeleteBucketCors','DeleteBucketLifecycleConfiguration']);
export function classify(action) {return classA.has(action)?'A':classB.has(action)?'B':free.has(action)?'free':'unknown';}
export async function usage(now=new Date()) {
  const id=await account(), credential=await auth();
  const config=await json(path.join(media,'usage.json'));
  const cycleDay=config.billingCycleDayUTC;
  if(!Number.isInteger(cycleDay)||cycleDay<1||cycleDay>28)throw new Error('Invalid billing-cycle day');
  const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-(now.getUTCDate()<cycleDay?1:0),cycleDay));
  const next=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,cycleDay)),days=(next-start)/86400000;
  let A=0,B=0,gbDays=0,currentGB=0,unknownCount=0,sampleDays=0;const unknown=new Set();
  for(let day=start;day<now;day=new Date(day.getTime()+86400000)) {
    const end=new Date(Math.min(day.getTime()+86400000,now.getTime()));
    const query=`query($accountTag:string!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$accountTag}){
      ops:r2OperationsAdaptiveGroups(limit:10000,filter:{datetime_geq:$start,datetime_lt:$end}){sum{requests} dimensions{actionType}}
      storage:r2StorageAdaptiveGroups(limit:10000,filter:{datetime_geq:$start,datetime_lt:$end}){max{payloadSize metadataSize} dimensions{bucketName}}
    }}}`;
    const r=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{Authorization:['Bearer', credential].join(' '),'Content-Type':'application/json'},body:JSON.stringify({query,variables:{accountTag:id,start:day.toISOString(),end:end.toISOString()}}),signal:AbortSignal.timeout(30000)});
    const body=await r.json();
    if(!r.ok||body.errors?.length||body.data?.viewer?.accounts?.length!==1)throw new Error(`R2 analytics unavailable (HTTP ${r.status}); no usage assumed. Existing login may need Account Analytics Read. Raw response withheld.`);
    const data=body.data.viewer.accounts[0];
    if(data.ops.length>=10000||data.storage.length>=10000)throw new Error('Analytics result cap reached; usage incomplete');
    for(const row of data.ops){const cls=classify(row.dimensions.actionType), n=row.sum.requests;if(cls==='A')A+=n;else if(cls==='B')B+=n;else if(cls==='unknown'&&n){unknown.add(row.dimensions.actionType);unknownCount+=n;}}
    const peak=data.storage.reduce((sum,row)=>sum+row.max.payloadSize+row.max.metadataSize,0)/1e9;
    if(data.storage.length){sampleDays++;currentGB=peak;gbDays+=peak*(end-day)/86400000;}
  }
  console.log(`Account-wide R2 usage, billing cycle ${start.toISOString().slice(0,10)} to ${next.toISOString().slice(0,10)} (analytics estimate; not an invoice):`);
  console.log(sampleDays?`Storage sampled-day peak estimate: ${(gbDays/days).toFixed(6)} / 10 GB-month accrued; latest daily peak ${currentGB.toFixed(6)} GB; ${sampleDays} days with samples`:'Storage: awaiting analytics samples; allowance 10 GB-month (not assumed zero)');
  console.log(`Class A conservative bound: ${A+unknownCount} / 1000000; Class B conservative bound: ${B+unknownCount} / 10000000 (includes reported errors)`);
  console.log('Free allowances are shared across all Standard buckets. Counts include all reported storage/classes conservatively; reconcile in Billing > Billable usage.');
  if(unknown.size)console.log(`${unknownCount} management/unclassified requests counted against BOTH bounds conservatively: `+[...unknown].join(', '));
  if(A+unknownCount>=500000||B+unknownCount>=5000000||gbDays/days>=5){console.log('ALERT: conservative usage bound reached 50% of a monthly free allowance');process.exitCode=1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))usage().catch(e=>{console.error(e.message);process.exitCode=1;});
