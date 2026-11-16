/* Local curated history and opt-in notice cue. No external data or audio requests. */
(function(){'use strict';const O=window.OW;let days={},audio,seen=null;
function sleeping(){const raw=O.data?.client?.setting?.('sleep_mode')||O.data?.provider?.states?.['input_boolean.sleep_mode'];return O.data?.state?.launch?.sleeping!==false||(raw&&raw.state!=='off');}
function quiet(){const s=O.data?.state||{},a=O.app||{};return sleeping()||O.now().getHours()<7||O.now().getHours()>=22||/bedroom/i.test(O.config.get('room')||'')||O.model?.isBedroom?.()===true||O.isDream||a.night||a.shutdown||a.seq||!!a.alarm;}
function allowed(){return O.config.get('sounds.notice')==='quindar'&&!quiet();}
function stop(){if(audio){audio.pause();audio.currentTime=0;}}
function play(){if(!allowed())return;audio=audio||new Audio(O.asset?O.asset('audio/quindar.m4a'):'audio/quindar.m4a');audio.currentTime=0;audio.play().catch(()=>{});}
function eligible(x){return !x.person&&x.priority==='normal'&&Array.isArray(x.show)&&x.show.some(s=>['home','briefing'].includes(s))&&Date.parse(x.until)>O.now().getTime();}
function observe(){const rows=O.data?.state?.lines;if(!Array.isArray(rows)){stop();return;}const current=new Set(rows.map(x=>JSON.stringify([x.id,x.text,x.at])));if(seen&&rows.some(x=>!seen.has(JSON.stringify([x.id,x.text,x.at]))&&eligible(x)))play();seen=current;if(!allowed())stop();}
function anniversaryHtml(){if(sleeping()||!O.model?.config?.modules?.space)return '';const d=O.now(),e=days[String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')];if(!e)return '';return '<p class="on-this-day">On this day in '+e.year+': '+O.esc(e.event)+'<small> · <a href="'+O.esc(e.source_url)+'" target="_blank" rel="noopener">Source: '+O.esc(e.source)+'</a></small></p>';}
O.themeFeatures={allowed,observe,anniversaryHtml,stop,eligible};
fetch('fixtures/on-this-day.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{days=data;O.views?.update('launches');}).catch(()=>{});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
O.data?.on(observe);
})();
