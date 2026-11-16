/* Display-only clock formatting. HA helper/native alarm values remain HH:MM[:SS]. */
(function(){
 const O=window.OW,formats=['12h','24h','both'];
 function parts(value){
  if(typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)){const [h,m,s=0]=value.split(':').map(Number);return {h,m,s};}
  if(value==null||value==='')return null;
  const d=new Date(value);return Number.isFinite(+d)?{h:d.getHours(),m:d.getMinutes(),s:d.getSeconds()}:null;
 }
 const shared=()=>O.data?.state?.timeFormat?.available===false?'12h':formats.includes(O.data?.state?.timeFormat?.value)?O.data.state.timeFormat.value:'12h';
 const mode=()=>formats.includes(O.config.get('display.timeFormat'))?O.config.get('display.timeFormat'):shared();
 function raw(value,seconds=false){const p=parts(value);return p?O.fmt.pad(p.h)+':'+O.fmt.pad(p.m)+(seconds?':'+O.fmt.pad(p.s):''):'—';}
 function text(value,{format=mode(),seconds=false}={}){const p=parts(value);if(!p)return '—';const h12=(p.h%12||12)+':'+O.fmt.pad(p.m)+(seconds?':'+O.fmt.pad(p.s):'')+' '+(p.h<12?'AM':'PM'),h24=raw(value,seconds);return format==='24h'?h24:format==='both'?h24+' ('+h12+')':h12;}
 // Only call for clock-bearing human summaries (weather/deadline reason), never durations or wire data.
 function inline(value){return String(value??'').replace(/\b([0-2]?\d:[0-5]\d)(?:\s*(AM|PM))?(?:\s*\(\d{1,2}:[0-5]\d [AP]M\))?/gi,(match,clock,period)=>{let [h,m]=clock.split(':').map(Number);if(h>23)return match;if(period){if(h<1||h>12)return match;h=h%12+(period.toUpperCase()==='PM'?12:0);}return text(O.fmt.pad(h)+':'+O.fmt.pad(m));});}
 function read(states={},connected=false){const s=states['input_select.time_format'];return {value:formats.includes(s?.state)?s.state:'12h',available:!!connected&&formats.includes(s?.state)&&formats.every(v=>s.attributes?.options?.includes(v))};}
 function command(states,connected,value){if(!connected)throw Error('Home Assistant is offline');if(!formats.includes(value))throw Error('Invalid time format');if(!read(states,connected).available)throw Error('Shared time format is unavailable');return {type:'call_service',domain:'input_select',service:'select_option',target:{entity_id:'input_select.time_format'},service_data:{option:value}};}
 function decorate(root){
  if(!window.document||!root||!document.createTreeWalker)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){
   const parent=node.parentElement;if(!parent||parent.closest('.time-reading,.time-secondary,.time-period,script,style,textarea,input,[data-cd],[data-pos]'))continue;
   const pattern=mode()==='both'?/\((\d{1,2}:[0-5]\d(?::[0-5]\d)? [AP]M)\)/g:/\b(\d{1,2}:[0-5]\d(?::[0-5]\d)?)( )(AM|PM)\b/g;
   let match,last=0,found=false;const frag=document.createDocumentFragment();
   while((match=pattern.exec(node.data))){found=true;frag.append(document.createTextNode(node.data.slice(last,match.index)));let span=document.createElement('span');if(mode()==='both'){span.className='time-secondary';span.textContent=match[0];}else{const reading=document.createElement('time');reading.className='time-reading';const [hour,...rest]=match[1].split(':');reading.dateTime=String(Number(hour)%12+(match[3].toUpperCase()==='PM'?12:0)).padStart(2,'0')+':'+rest.join(':');reading.append(document.createTextNode(match[1]+' '));span.className='time-period';span.textContent=match[3];reading.append(span);span=reading;}frag.append(span);last=pattern.lastIndex;}
   if(found){frag.append(document.createTextNode(node.data.slice(last)));node.replaceWith(frag);}
  }
 }
 // Calendar days on this screen, not 24-hour durations (DST must not change the count).
 function countdownText(date=O.now(),surface='night'){
  if(!O.model.config.modules.countdowns)return '';
  const today=Date.UTC(date.getFullYear(),date.getMonth(),date.getDate());
  return O.model.config.countdowns.filter(c=>c.show.includes(surface)).map(c=>{const [y,m,d]=c.date.split('-').map(Number),days=(Date.UTC(y,m-1,d)-today)/86400000;return days>0?c.title+' in '+days+' '+(days===1?'day':'days'):'';}).filter(Boolean).join(' · ');
 }
 function countdownHtml(surface='night'){const line=countdownText(O.now(),surface);return '<p class="schedule-note" data-countdown'+(line?'':' hidden')+'>'+O.esc(line)+'</p>';}
 O.time={formats,mode,shared,parts,raw,text,inline,read,command,decorate,countdownText,countdownHtml};
 O.fmt.time24=raw;O.fmt.hm=value=>text(value);
 const root=document.getElementById('stage');if(root&&window.MutationObserver){const observer=new MutationObserver(rows=>{for(const row of rows){if(row.type==='characterData')decorate(row.target.parentElement);else for(const n of row.addedNodes)if(n.nodeType===1)decorate(n);else if(n.nodeType===3)decorate(n.parentElement);}});observer.observe(root,{childList:true,subtree:true,characterData:true});}
})();
