import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

export const media = path.dirname(fileURLToPath(import.meta.url));
export const site = path.dirname(media);
export const project = path.dirname(site);
export const infra = JSON.parse(await fs.readFile(path.join(media, 'infra.json')));
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
export const lines = text => text.split(/\r?\n/).map(s=>s.trim()).filter(s=>s && !s.startsWith('#'));
export async function retired() { return new Set(lines(await fs.readFile(path.join(media,'retired-keys.txt'),'utf8'))); }
export function keyCheck(key) {
  if (typeof key !== 'string' || !/^packs\/v1\/[a-zA-Z0-9_./-]+$/.test(key) || key.split('/').some(s=>!s || s==='.' || s==='..')) throw new Error('Invalid media key');
  return key;
}
export function wrangler(args) {
  const r=spawnSync(path.join(site,'node_modules/.bin/wrangler'), args, {cwd:site, encoding:'utf8', maxBuffer:4*1024*1024, env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  if (r.status!==0) throw new Error(`Wrangler ${args.slice(0,3).join(' ')} failed; no credentials or raw response logged`);
  return r.stdout;
}
// Reuse the existing Wrangler login in memory only. Never persist or print credentials.
export async function auth(zone=false) {
  if(zone) {
    const file=process.env.FLIGHTDAY_CF_MEDIA_TOKEN_FILE;
    if(!file)throw new Error('Set FLIGHTDAY_CF_MEDIA_TOKEN_FILE to the approved private token file');
    const st=await fs.lstat(file);
    if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))throw new Error('Media token must be a regular private file (mode 600)');
    const token=(await fs.readFile(file,'utf8')).trim();
    if(!token||/\s/.test(token))throw new Error('Invalid token file; value withheld');
    return token;
  }
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  for (const root of [path.join(os.homedir(),'.wrangler'),path.join(os.homedir(),'Library/Preferences/.wrangler'),path.join(os.homedir(),'.config/.wrangler')]) {
    try {
      let text=await fs.readFile(path.join(root,'config/default.toml'),'utf8');
      const expiry=text.match(/^expiration_time\s*=\s*"([^"\n]+)"/m)?.[1];
      if(expiry && Date.parse(expiry)<Date.now()+60000) {
        wrangler(['r2','bucket','list']);
        text=await fs.readFile(path.join(root,'config/default.toml'),'utf8');
      }
      const m=text.match(/^oauth_token\s*=\s*"([^"\n]+)"/m);
      if (m) return m[1];
    } catch (e) { if(e.code!=='ENOENT') throw new Error('Cannot read existing Wrangler login'); }
  }
  throw new Error('Existing Wrangler login unavailable; authenticate through Wrangler');
}
export async function api(route, options={}) {
  const zoneOperation=/^\/zones\/[^/]+\/(purge_cache|rulesets)/.test(route);
  const r=await fetch('https://api.cloudflare.com/client/v4'+route,{...options,headers:{Authorization:`Bearer ${await auth(zoneOperation)}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(30000)});
  const body=await r.json();
  if(!r.ok || body.success===false || body.errors?.length) throw new Error(`Cloudflare API failed (HTTP ${r.status}; codes ${(body.errors||[]).map(e=>e.code).join(',')}); raw response withheld`);
  return body.result ?? body;
}
let cachedAccount;
export async function account() {
  if(process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
  if(cachedAccount)return cachedAccount;
  const a=await api('/accounts');
  if(!Array.isArray(a)||a.length!==1) throw new Error('Set CLOUDFLARE_ACCOUNT_ID to select the approved account');
  return cachedAccount=a[0].id;
}
export async function purge(keys) {
  const zones=await api('/zones?name='+infra.zone);
  if(zones.length!==1)throw new Error('Expected one approved zone');
  for(const key of keys) {
    keyCheck(key);
    await api(`/zones/${zones[0].id}/purge_cache`,{method:'POST',body:JSON.stringify({files:['https://'+infra.domain+'/'+key]})});
    console.log('PURGED exact media URL '+key);
  }
}
export async function guard(dir) {
  const {scan}=await import(path.join(project,'oss/privacy-guard/guard.mjs'));
  const r=await scan([dir]);
  const errors=r.findings.filter(f=>f.severity==='error');
  if(errors.length) throw new Error(`Privacy guard failed (${errors.length} error findings); review locally, no source values logged`);
  console.log('PASS privacy-guard');
  return r;
}
export async function atomic(file, value) {
  await fs.mkdir(path.dirname(file),{recursive:true});
  const tmp=file+'.tmp-'+process.pid;
  await fs.writeFile(tmp,value,{mode:0o600}); await fs.rename(tmp,file);
}
export async function locked(fn) {
  const lock=path.join(media,'.operation-lock');
  try { await fs.mkdir(lock); } catch { throw new Error('Another media operation holds the lock; inspect before removing a stale .operation-lock'); }
  try { return await fn(); } finally { await fs.rmdir(lock); }
}
