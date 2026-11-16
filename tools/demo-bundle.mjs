import {createHash} from 'node:crypto';
// Format-2 delivery checks. No staging, account changes or implicit receipt approval.
export function demoBundleProblems(man, entry) {
  if (man.format !== 2) return [];
  const errors = [], prefix = `v/${man.version}/`;
  if (!/^[a-f0-9]{20}$/.test(man.version) || man.assetPrefix !== prefix) errors.push('invalid content-addressed demo namespace');
  const seen = new Set();
  for (const f of man.files || []) {
    if (typeof f.path !== 'string' || !f.path || f.path.includes('\\') || f.path.split('/').some(x => !x || x === '.' || x === '..')) { errors.push('unsafe demo receipt path'); continue; }
    if (seen.has(f.path)) errors.push(`duplicate demo receipt path: ${f.path}`);
    seen.add(f.path);
    if (!/^[a-f0-9]{64}$/.test(f.sha256) || !Number.isSafeInteger(f.bytes) || f.bytes < 0) errors.push(`invalid content hash/size: ${f.path}`);
    if (!['index.html', '_headers', 'img/PROVENANCE.md', 'assets.sha256.json'].includes(f.path) && !f.path.startsWith(prefix)) errors.push(`unversioned demo asset: ${f.path}`);
    if (f.path.startsWith(prefix) && f.logical !== f.path.slice(prefix.length)) errors.push(`demo logical path mismatch: ${f.path}`);
  }
  for (const required of ['index.html', '_headers', 'img/PROVENANCE.md']) if (!seen.has(required)) errors.push(`missing demo record: ${required}`);
  if (![...seen].some(p => p.startsWith(prefix) && p.endsWith('/ORIGINALS.json'))) errors.push('missing versioned ORIGINALS.json');
  for (const m of entry.matchAll(/\s(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi)) {
    const ref = m[1];
    if (ref.startsWith('#') || ref === '/') continue; // same-site Back link
    const clean = ref.replace(/^\.\//, '').split(/[?#]/)[0];
    if (!clean.startsWith(prefix) || !seen.has(clean)) errors.push(`entry reference must name an existing hashed asset: ${ref}`);
  }
  for (const m of entry.matchAll(/\ssrcset\s*=\s*["']([^"']+)["']/gi)) for (const item of m[1].split(',')) {
    const ref = item.trim().split(/\s+/)[0].split(/[?#]/)[0];
    if (!ref.startsWith(prefix) || !seen.has(ref)) errors.push(`srcset must name an existing hashed asset: ${ref}`);
  }
  if (man.assetManifest === 'assets.sha256.json' && demoNamespace(man.files, prefix) !== man.version) errors.push('version directory does not match its content hash recipe');
  return errors;
}
export const demoCacheHeaders = `/demo/v/*\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable, no-transform\n`;
export function withDemoCacheHeaders(headers) {
  if (/^\/demo\/v\/\*/m.test(headers)) throw new Error('demo version cache block already present; review instead of duplicating');
  return headers.trimEnd() + '\n\n# Content-addressed demo assets; entry and metadata keep /demo/* no-cache.\n' + demoCacheHeaders;
}
// Model matching relative _headers blocks in file order, including inherited policies.
export function demoHeaderProblems(blocks, csp, asset) {
  const problems = [], seen = new Set();
  for (const b of blocks) {if (seen.has(b.pattern)) problems.push(`duplicate header path: ${b.pattern}`);seen.add(b.pattern);}
  const connect = csp.split(';').map(s => s.trim()).filter(s => /^connect-src(?:\s|$)/.test(s));
  if (connect.length !== 1 || connect[0] !== "connect-src 'self'") problems.push("demo connect-src must be exactly 'self'");
  for (const target of ['/demo/', asset]) {
    let policies = [];
    for (const b of blocks) {
      if (!b.pattern.startsWith('/')) continue;
      const pattern = '^' + b.pattern.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$';
      if (!new RegExp(pattern).test(target)) continue;
      for (const line of b.lines) {
        if (/^\s*!\s+Content-Security-Policy\s*$/i.test(line)) policies = [];
        const value = line.match(/^\s*Content-Security-Policy:\s*(.*)$/i);
        if (value) policies.push(value[1]);
      }
    }
    if (policies.length !== 1 || policies[0] !== csp) problems.push(`${target}: effective demo CSP differs from receipt`);
  }
  return problems;
}

// The sole exclusion is self-referential provenance; rule 11 still checks its raw-byte hash.
export function demoNamespace(files, prefix) {
 const included=files.filter(f=>f.path.startsWith(prefix)&&f.path.slice(prefix.length)!=='PROVENANCE.md').map(f=>({path:f.path.slice(prefix.length),sha256:f.sha256})).sort((a,b)=>Buffer.compare(Buffer.from(a.path),Buffer.from(b.path)));
 return createHash('sha256').update(Buffer.concat(included.map(f=>Buffer.from(f.path+'\0'+f.sha256+'\n')))).digest('hex').slice(0,20);
}
