/* Device-only demo audio. Household/native controls remain unreachable. */
(function(){
 const O=window.OW,D=O?.demo;if(!D?.active)return;
 let bed=null,shots=[];
 let previewUntil=0;
 document.addEventListener('click',e=>{if(e.target.closest('[data-ob="preview"], [data-act="alarm.test"], [data-act="seq.preview"]'))previewUntil=O.nowMs()+65000;},true);
 const allowed=()=>{const targets=O.app?.alarm?.audio_screens||D.audioScreens||D.engine?.launch.audio_screens||[];const hour=O.now().getHours();return O.nowMs()<previewUntil&&hour>=6&&hour<21&&targets.includes(D.engine?.screenId);};
 D.canPreviewAudio=()=>{const hour=O.now().getHours();return allowed()&&hour>=6&&hour<21;};
 const stop=a=>{if(a){a.pause();a.src='';}};
 D.audio=(method,raw)=>{
  if(method==='stop'){stop(bed);shots.forEach(stop);bed=null;shots=[];return;}
  let options={};try{options=typeof raw==='string'?JSON.parse(raw):raw||{};}catch(_){return;}
  if(method==='bedLevel'){if(bed)bed.volume=Math.max(0,Math.min(1,options.level??1));return;}
  if(!['play','shot'].includes(method))return;
  if(!allowed())return;
  const source=String(options.url||'').replace('asset:///web/',''),url=new URL(O.asset?O.asset(source):source,location.href);
  if(url.origin!==location.origin||!url.pathname.startsWith(new URL(O.asset?O.asset('audio/'):'audio/',location.href).pathname))return;
  const a=new Audio(url.href);a.loop=method==='play';a.volume=Math.max(0,Math.min(1,options.level??1));
  if(method==='play'){stop(bed);bed=a;}else{shots.push(a);a.addEventListener('ended',()=>{shots=shots.filter(s=>s!==a);});}
  a.play().catch(()=>{D.audioNeedsTap=true;});
 };
 document.addEventListener('pointerdown',()=>{if(!D.audioNeedsTap||!allowed())return;D.audioNeedsTap=false;for(const a of [bed,...shots])if(a?.src)a.play().catch(()=>{D.audioNeedsTap=true;});},{passive:true});
})();
