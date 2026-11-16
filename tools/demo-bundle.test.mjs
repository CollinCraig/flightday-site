import test from 'node:test';
import assert from 'node:assert/strict';
import {demoBundleProblems, withDemoCacheHeaders, demoHeaderProblems} from './demo-bundle.mjs';
const version='a'.repeat(20), prefix=`v/${version}/`;
const record=p=>({path:p,logical:p.startsWith(prefix)?p.slice(prefix.length):p,bytes:12,sha256:'b'.repeat(64)});
const bundle=()=>({format:2,version,assetPrefix:prefix,files:['index.html','_headers','img/PROVENANCE.md',prefix+'js/app.js',prefix+'fixtures/ORIGINALS.json'].map(record)});
test('versioned delivery with existing entry resources passes',()=>assert.deepEqual(demoBundleProblems(bundle(),`<script src="${prefix}js/app.js"></script>`),[]));
test('stale, external, missing and traversal entry resources fail',()=>{
 for(const ref of ['js/app.js','https://example.com/a.js',prefix+'missing.js',prefix+'../app.js']) assert.ok(demoBundleProblems(bundle(),`<script src="${ref}"></script>`).length);
});
test('mixed namespaces, duplicate records and missing provenance fail',()=>{
 for(const mutate of [m=>m.files.push(record('v/'+'c'.repeat(20)+'/old.js')),m=>m.files.push(m.files[3]),m=>m.files=m.files.filter(f=>!f.path.endsWith('ORIGINALS.json')),m=>m.files[3].sha256='bad',m=>m.assetPrefix='v/other/']) {const m=bundle();mutate(m);assert.ok(demoBundleProblems(m,'').length);}
});
test('srcset cannot escape the pinned version',()=>assert.ok(demoBundleProblems(bundle(),'<img srcset="old.webp 1x">').length));
test('cache preparation preserves CSP and refuses duplicate paths',()=>{
 const csp="/demo/*\n  ! Content-Security-Policy\n  Content-Security-Policy: default-src 'none'\n  ! Cache-Control\n  Cache-Control: no-cache, no-transform\n";
 const prepared=withDemoCacheHeaders(csp);assert.ok(prepared.startsWith(csp));assert.match(prepared,/max-age=31536000, immutable, no-transform/);assert.throws(()=>withDemoCacheHeaders(prepared),/already present/);
});

test('entry and versioned asset inherit only the demo CSP; catch missing detach and duplicates',()=>{
 const csp="default-src 'none'; connect-src 'self'",asset='/demo/v/'+version+'/js/app.js';
 const blocks=[{pattern:'/*',lines:["  Content-Security-Policy: default-src 'none'; connect-src 'none'"]},{pattern:'/demo/*',lines:['  ! Content-Security-Policy','  Content-Security-Policy: '+csp]},{pattern:'/demo/v/*',lines:['  Cache-Control: immutable']}];
 assert.deepEqual(demoHeaderProblems(blocks,csp,asset),[]);
 const missing=structuredClone(blocks);missing[1].lines.shift();assert.ok(demoHeaderProblems(missing,csp,asset).length);
 const override=structuredClone(blocks);override[2].lines.push("  Content-Security-Policy: connect-src 'none'");assert.ok(demoHeaderProblems(override,csp,asset).some(x=>x.startsWith(asset)));
 assert.ok(demoHeaderProblems([...blocks,blocks[1]],csp,asset).some(x=>x.includes('duplicate')));
 assert.ok(demoHeaderProblems(blocks,csp+"; connect-src *",asset).some(x=>x.includes('exactly')));
});

test('namespace binds versioned hashes and only excludes exact self-referential provenance', async()=>{
 const {demoNamespace}=await import('./demo-bundle.mjs');
 const files=[{path:prefix+'z.js',sha256:'1'.repeat(64)},{path:prefix+'a.js',sha256:'2'.repeat(64)},{path:prefix+'PROVENANCE.md',sha256:'3'.repeat(64)}];
 const expected=demoNamespace(files,prefix);assert.equal(demoNamespace([...files].reverse(),prefix),expected);
 const proof=structuredClone(files);proof[2].sha256='4'.repeat(64);assert.equal(demoNamespace(proof,prefix),expected);
 const changed=structuredClone(files);changed[0].sha256='5'.repeat(64);assert.notEqual(demoNamespace(changed,prefix),expected);
});
