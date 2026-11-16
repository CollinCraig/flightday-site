/* One capped loop, visibility/power lifecycle, poster fallback. No network data fetches. */
(function(){'use strict';const O=window.OW,W=O.wallpaper;let layer,canvas,ctx,earth,track,trackCtx,surface,outgoing,fadeTimer,fadeEnd,posterRequest='',posterLoaded='',posterGeneration=0,probeLast=0,raf=0,last=-Infinity,start=0,unpluggedAt=null,wasActive=false,cleared=0,blocked=false,low=false,power={},occluded=false,failed=false,selected='',guard=new W.Guard(m=>O.host?.log(m));
W.metrics={frames:0,drawMs:[],steps:()=>guard.level};
W.power=value=>{power={...power,...value};if(O.app?.syncAmbientBackground)O.app.syncAmbientBackground();else W.refresh();};
W.occluded=value=>{occluded=!!value;W.refresh();};
function input(){if(O.app?.ambient&&!wasActive)start=performance.now();wasActive=!!O.app?.ambient;if(!wasActive||power.charging!==false)unpluggedAt=null;else if(unpluggedAt===null)unpluggedAt=performance.now();const now=O.nowMs(),app=O.app||{},m=O.views?.sleepModel?.()||{},prefs=W.prefs(O.config.get('ambient')),wx=W.weather(O.data?.state?.weather,now),lat=O.config.get('home.lat'),lon=O.config.get('home.lon'),sun=W.sun(now,lat,lon),target=O.data?.state?.sleepSchedule?.days?O.sleepSchedule?.target(O.data.state.sleepSchedule,now,m.target):null,night=!!(m.sleeping||app.night||app.ws==='night'||target?.bedAt&&now>=target.bedAt&&now<target.wakeAt),tier=O.isTV||O.isDream?"televisionAdapter":'panel';
if(power.charging===false&&Number.isFinite(power.level)){if(power.level<.30)low=true;else if(power.level>=.35)low=false;}else low=false;
const s={now,lat,lon,sun,wx,night,tier,scene:W.scene(prefs.wallpaper.scene,sun&&{...sun,nearEvent:(W.sun(now-3600000,lat,lon).el+.833)*(W.sun(now+3600000,lat,lon).el+.833)<=0},wx),bedroom:!!O.model?.isBedroom?.(),active:!!app.ambient,hidden:document.hidden,occluded:occluded||O.host?.foreground?.()===false,reduce:!!O.reduceMotion?.(),powerSaver:!!power.powerSaver,thermal:Number(power.thermal)||0,lowBattery:low,charging:power.charging!==false,pauseBattery:prefs.pause_on_battery,ambientMs:unpluggedAt===null?0:performance.now()-unpluggedAt};
s.iss=O.space?.iss?.fixAt&&Math.abs(now-O.space.iss.fixAt)<90*60000?O.space.issAt(now):null;return {...s,prefs,policy:W.policy(s)};}
W.state=input;
W.allowStream=s=>{if(!s.policy.run){blocked=true;cleared=0;return false;}if(blocked){cleared||=performance.now();if(performance.now()-cleared<120000)return false;blocked=false;cleared=0;}return true;};
function cancel(){if(raf)cancelAnimationFrame(raf);raf=0;}
function disposeSurface(el){if(!el)return;el.dispose?.();el.remove();}
function cancelFade(){clearTimeout(fadeTimer);if(surface&&fadeEnd)surface.removeEventListener('transitionend',fadeEnd);fadeEnd=null;}
function retire(){disposeSurface(outgoing);outgoing=null;}
function finishFade(){cancelFade();retire();if(layer&&!layer.classList.contains('wallpaper-poster'))layer.style.backgroundImage='none';}
function reveal(s){
 cancelFade();
 if(s.reduce){surface.style.opacity='1';finishFade();return;}
 // Flush the incoming zero-opacity state only after its first complete draw.
 surface.style.opacity='0';void surface.offsetWidth;
 surface.style.opacity='1';
 const current=surface;
 fadeEnd=e=>{if(e.target===current&&e.propertyName==='opacity'&&surface===current)finishFade();};
 current.addEventListener('transitionend',fadeEnd);
 fadeTimer=setTimeout(()=>{if(surface===current)finishFade();},1100);
}
function cleanup(){W.video?.stop();cancel();cancelFade();posterGeneration++;posterRequest='';posterLoaded='';disposeSurface(surface);retire();surface=null;earth=null;layer?.remove();layer=null;canvas=null;track=null;selected='';}
W.stop=()=>{cleanup();blocked=false;cleared=0;document.getElementById('ambient')?.classList.remove('wallpaper-black');};
function credit(s){const name={sky:'Sky now, sun from your location',stars:W.catalogInfo?.credit||'Star field (not the real sky)',earth:'Earth now'+(s.iss?' · ISS from '+(O.demo?.active?'Sample data':O.space?.via?.iss==='wallhub'?'wallhub':'wheretheiss.at')+' as of '+new Date(O.space.iss.fixAt).toISOString():' · ISS unavailable'),weather:'Weather now, '+(O.demo?.active?'Sample data':O.data?.state?.weather?.source||'weather unavailable')+' as of '+(s.wx.at?new Date(s.wx.at).toISOString():'unknown')};return 'Generated · '+(s.scene==='sky'&&!s.sun?'Sky now · location unavailable':name[s.scene]);}
function probe(t){raf=0;const s=input();if(!s.policy.run||s.policy.hard){W.refresh();return;}if(probeLast)guard.add(Math.max(0,t-probeLast-16.67),t);probeLast=t;if(guard.level<2){W.refresh();return;}raf=requestAnimationFrame(probe);}
function poster(s){
 if(!layer)return;
 const url=O.asset?O.asset('js/wallpaper/'+s.scene+'.webp'):'js/wallpaper/'+s.scene+'.webp';
 function commit(background){
  if(!layer)return;
  cancelFade();
  // The poster is decoded before fading any retained scene away.
  layer.style.backgroundImage=background;
  layer.classList.add('wallpaper-poster');
  if(s.reduce){disposeSurface(surface);surface=null;retire();canvas=null;earth=null;selected='';}
 }
 if(posterLoaded===url){commit('url('+JSON.stringify(url)+')');return;}
 if(posterRequest===url)return;
 posterRequest=url;const generation=++posterGeneration,current=layer,img=new Image();
 const valid=()=>generation===posterGeneration&&current===layer&&current.isConnected;
 img.onload=()=>{if(!valid())return;posterLoaded=url;commit('url('+JSON.stringify(url)+')');};
 img.onerror=()=>{if(!valid())return;const photo=O.bg?.currentUrl;if(photo){const fallback=new Image();fallback.onload=()=>{if(valid())commit('url('+JSON.stringify(photo)+')');};fallback.onerror=()=>{if(valid())commit('linear-gradient(#060912,#111524)');};fallback.src=photo;}else commit('linear-gradient(#060912,#111524)');};
 img.src=url;
}
function prepare(s){
 if(selected===s.scene&&canvas&&canvas.width===Math.max(1,Math.round(layer.clientWidth*.5))&&canvas.height===Math.max(1,Math.round(layer.clientHeight*.5)))return false;
 cancelFade();
 // An interrupted transition is completed before replacing its outgoing surface.
 if(surface?.drawn){surface.style.transition='none';surface.style.opacity='1';void surface.offsetWidth;surface.style.transition='';retire();}
 else if(surface){disposeSurface(surface);surface=outgoing;outgoing=null;}
 outgoing=surface;surface=document.createElement('div');surface.className='wallpaper-surface';surface.style.opacity='0';layer.append(surface);
 earth=null;canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');surface.append(canvas);
 canvas.width=Math.max(1,Math.round(layer.clientWidth*.5));canvas.height=Math.max(1,Math.round(layer.clientHeight*.5));selected=s.scene;track=null;
 if(s.scene==='earth'){earth=W.earth(canvas);const renderer=earth;surface.dispose=()=>renderer.dispose();track=document.createElement('canvas');track.width=canvas.width;track.height=canvas.height;track.setAttribute('aria-hidden','true');surface.append(track);trackCtx=track.getContext('2d');}else ctx=canvas.getContext('2d');
 return true;
}
function frame(t){raf=0;const s=input(),p=s.policy;if(p.hard){W.refresh();return;}if(!p.run||failed||guard.level>=2){W.refresh();return;}let fps=Math.min(p.fps,guard.level?15:20);if(t-last>=1000/fps-.01){last=t;const before=performance.now();try{const changed=prepare({...s,scene:p.scene});s.scene=p.scene;if((s.scene==='stars')&&(!Number.isFinite(s.lat)||!Number.isFinite(s.lon)))throw Error('Location unavailable');canvas.hidden=false;const resuming=layer.classList.contains('wallpaper-poster');if(earth){earth.draw(s);track.hidden=false;W.drawTrack(trackCtx,canvas.width,canvas.height,s);}else W.draw(ctx,canvas.width,canvas.height,s);surface.drawn=true;if(changed||resuming){posterGeneration++;posterRequest='';layer.classList.remove('wallpaper-poster');reveal(s);}W.metrics.frames++;const cost=performance.now()-before;W.metrics.drawMs.push(cost);if(W.metrics.drawMs.length>1200)W.metrics.drawMs.shift();guard.add(cost,t);}catch(e){failed=true;O.host?.log('Wallpaper poster fallback: '+e.message);poster(s);return;}}raf=requestAnimationFrame(frame);}
W.refresh=()=>{const s=input(),p=s.policy;if(!s.active){W.stop();return;}const mode=O.app?.debugAmbMode||s.prefs.mode,wanted=mode==='wallpaper'||mode==='stream'&&!document.querySelector('#ambient .amb-live');if(!wanted){cleanup();document.getElementById('ambient')?.classList.remove('wallpaper-black');return;}cancel();if(p.black){blocked=true;cleared=0;cleanup();const host=document.getElementById('ambient');host?.classList.add('wallpaper-black');return;}document.getElementById('ambient')?.classList.remove('wallpaper-black');if(!layer||!layer.isConnected){earth=null;selected='';layer=document.createElement('div');layer.className='wallpaper-layer';document.getElementById('ambient').prepend(layer);canvas=null;}
s.scene=p.scene;layer.classList.toggle('wallpaper-night',s.night);layer.setAttribute('role','img');layer.setAttribute('aria-label','Background: generated scene, '+s.scene);const c=document.querySelector('#ambient .ac-credit');if(c){c.textContent=credit(s);c.style.opacity=s.night?'.15':'';}
if(p.hard){W.video?.sync(s,false);blocked=true;cleared=0;poster(s);return;}
if(!p.run){blocked=true;cleared=0;}else if(blocked){cleared||=performance.now();if(performance.now()-cleared>=120000){blocked=false;cleared=0;}}
if(W.video?.sync(s,p.run&&!blocked&&!failed&&guard.level<2))return;
layer.classList.toggle('wallpaper-animated',p.run&&!blocked&&!failed&&guard.level===2&&!s.night);
if(!p.run||blocked||failed||guard.level>=2){poster(s);if(p.run&&!blocked&&!failed&&guard.level>=2){probeLast=0;raf=requestAnimationFrame(probe);}return;}raf=requestAnimationFrame(frame);
};
W.sync=()=>W.refresh();
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();if(O.app?.syncAmbientBackground)O.app.syncAmbientBackground();else W.refresh();});
window.addEventListener('resize',()=>{selected='';W.refresh();});
O.onNative?.((name,value)=>{if(name==='wallpaper-power')W.power(typeof value==='string'?JSON.parse(value):value);if(name==='pause')W.occluded(true);if(name==='resume')W.occluded(false);});
O.config.on(path=>{if(path.startsWith('ambient.')||path.startsWith('home.')){failed=false;W.refresh();}});
window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change',()=>W.refresh());
// Native builder supplies wallpaperPower() -> {charging,level:0..1,powerSaver,thermal:0..6}.
setInterval(()=>{const value=O.onboardingNative?.wallpaperPower?.()||O.host?.wallpaperPower?.();if(value?.then)value.then(v=>{if(v)W.power(v);}).catch(()=>{});else if(value)power=value;if(O.app?.syncAmbientBackground&&(O.app.debugAmbMode||O.config.get('ambient.mode'))==='stream')O.app.syncAmbientBackground();else W.refresh();},1000);
if(!O.demo?.active&&navigator.getBattery)navigator.getBattery().then(b=>{const update=()=>W.power({charging:b.charging,level:b.level});b.addEventListener('chargingchange',update);b.addEventListener('levelchange',update);update();}).catch(()=>{});
})();
