/* Static-site entry point. Loaded before every application script by build-demo.
 * Deliberately drops the browser's network/socket capabilities before app boot. */
(function () {
  'use strict';
  const O=window.OW=window.OW||{};
  Object.defineProperty(O,'demoBuild',{value:true});
  const base=new URL('.',location.href),fetchAsset=window.fetch.bind(window),script=window.document?.currentScript?.src;
  const assetBase=script?new URL('../',script):base;O.assetBase=assetBase.href;O.asset=p=>new URL(p,assetBase).href;
  window.fetch=(input,options={})=>{
    const target=typeof input==='string'&&!/^(?:[a-z]+:|\/)/i.test(input)?O.asset(input):input;
    const u=new URL(typeof target==='string'?target:target instanceof URL?target.href:target.url,location.href);
    const method=(options.method||input.method||'GET').toUpperCase();
    if(u.origin!==base.origin||!u.pathname.startsWith(base.pathname)||method!=='GET'||/(?:^|\/)(?:auth|api|net)(?:\/|$)|\.local(?:\.|\/|$)/.test(u.pathname))return Promise.reject(Error('Static demo permits bundled assets only'));
    return fetchAsset(target,{...options,credentials:'omit',redirect:'error'});
  };
  // demo.js replaces this with its fake socket; the real constructor is discarded.
  window.WebSocket=class { constructor(){throw Error('Static demo has no network sockets');} };
  for(const name of ['XMLHttpRequest','EventSource','WebTransport','RTCPeerConnection','webkitRTCPeerConnection','Worker','SharedWorker'])Object.defineProperty(window,name,{value:class {constructor(){throw Error('Unavailable in the static demo');}},writable:false});
  Object.defineProperty(navigator,'sendBeacon',{value:()=>false});
  O.staticAsset=url=>{if(!url)return '';try{const u=new URL(url,assetBase);return u.origin===assetBase.origin&&u.pathname.startsWith(assetBase.pathname)?u.href:'';}catch(_){return '';}};
})();
