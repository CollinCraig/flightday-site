import test from 'node:test';import assert from 'node:assert/strict';import {developmentCopyProblems as check} from './development-copy.mjs';
test('development, demo, negative availability and unchanged URL links are valid',()=>assert.deepEqual(check('<p>In development. Not available to install yet.</p><a href="https://flightday.app/demo/">Try the demo house</a>'),[]));
test('finished-product buttons and availability claims are rejected',()=>{
 for(const text of ['<a href="/install/">Install now</a>','<button>Download now</button>','<p>Flight Day is available now.</p>','<span class="st st-live">Live</span>'])assert.ok(check(text).length);
});
test('public beta requires approval and a bare visible domain leaves link targets alone',()=>{
 const beta='<a href="https://testflight.apple.com/join/example">Join the public beta on TestFlight</a>';
 assert.ok(check(beta).length);assert.deepEqual(check(beta,{betaApproved:true}),[]);
 assert.ok(check('<p>https://flightday.app</p>').length);assert.deepEqual(check('<a href="https://flightday.app">flightday.app</a>'),[]);
});

test('technical example URLs remain intact',()=>assert.deepEqual(check('<pre><code>documentation: https://flightday.app/integrations</code></pre>'),[]));
