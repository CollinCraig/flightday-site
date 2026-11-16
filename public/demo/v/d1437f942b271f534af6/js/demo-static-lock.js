/* Runs immediately after fake transport installation, before any data client. */
(function () {
  'use strict';
  const O=window.OW,D=O.demo;
  if(!O.demoBuild||!D.active)throw Error('Static demo transport required');
  Object.defineProperty(D,'active',{value:true,writable:false});
  Object.defineProperty(D,'spaceMode',{value:'snapshot',writable:false});
  Object.defineProperty(window,'WebSocket',{value:window.WebSocket,writable:false,configurable:false});
  const get=O.config.get.bind(O.config),set=O.config.set.bind(O.config);
  const fixed={provider:'ha','ha.url':'https://demo.invalid','ha.token':'sample','wallhub.url':'https://demo.invalid','wallhub.token':'sample','launch.api':'prod','bg.apod':false,'bg.nasa':false};
  O.config.get=p=>Object.hasOwn(fixed,p)?fixed[p]:get(p);
  O.config.set=(p,v)=>{if(Object.hasOwn(fixed,p))return;return set(p,v);};
  O.model.load=()=>Promise.resolve();
  const img=O.net.img.bind(O.net);O.net.img=(url,w)=>img(O.staticAsset(url),w);
  D.openWebcast=url=>{
    let u;try{u=new URL(url);}catch(_){return;}if(u.protocol!=='https:')return;
    const sheet=document.getElementById('popup');sheet.hidden=false;
    sheet.innerHTML='<div class="pop-in"><p>Watch on the provider’s website</p><a class="btn" target="_blank" rel="noopener noreferrer" href="'+O.esc(u.href)+'">Open webcast</a><button class="btn" data-focus>Done</button></div>';
    sheet.querySelector('button').onclick=()=>{sheet.hidden=true;sheet.innerHTML='';};
  };
})();
