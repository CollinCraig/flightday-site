import {test} from 'node:test';
import assert from 'node:assert/strict';
import {STARFIELD_CREDIT,starfieldCreditProblems as check} from './starfield-credit.mjs';
test('future Starfield mentions require the exact HYG credit',()=>{
  assert(check('<p>Starfield · Concept</p>').length);
  assert.deepEqual(check(`<figure><img alt="Starfield"><figcaption>${STARFIELD_CREDIT}</figcaption></figure>`),[]);
  assert(check("<p>Generated · Tonight's sky, HYG star data</p>").length);
});
test('Yale and public-domain star attribution fail even beside a correct credit',()=>{
  for(const wrong of ['Starfield: Yale BSC','Starfield: Yale Bright Star Catalogue','Star data is public domain'])assert(check(`<p>Starfield</p><p>${wrong}</p><p>${STARFIELD_CREDIT}</p>`).length);
});
test('one correct credit cannot cover a second incorrectly credited preview',()=>{
  assert(check(`<figure>Starfield<figcaption>${STARFIELD_CREDIT}</figcaption></figure><figure>Starfield<figcaption>Generated · Tonight's sky, HYG star data (CC0)</figcaption></figure>`).length);
});
test('HTML entity rendering is accepted; unrelated NASA licences remain allowed',()=>{
  assert.deepEqual(check(`<p>Starfield · Concept</p><p>${STARFIELD_CREDIT.replace('·','&middot;').replace("'",'&#39;')}</p><p>NASA footage is public domain.</p>`),[]);
  assert.deepEqual(check('<p>NASA footage is public domain.</p>'),[]);
  assert.deepEqual(check('<!-- Starfield Yale BSC --><p>Other content</p>'),[]);
});
