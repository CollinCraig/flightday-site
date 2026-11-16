/* Shared HA schedule model. Bedtime is a target before that wake day, never a trigger. No timers/actions here. */
(function(){
 const OW=window.OW, DAYS=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'], JS=['sunday',...DAYS.slice(0,6)];
 const time=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)?value.slice(0,5):null;
 const usable=s=>!!s&&!['unknown','unavailable'].includes(s.state);
 const dateKey=at=>{const d=new Date(at);return d.getFullYear()+'-'+OW.fmt.pad(d.getMonth()+1)+'-'+OW.fmt.pad(d.getDate());};
 const clock=t=>OW.time.text(t);
 const minutes=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
 const shift=(t,delta)=>{const n=((minutes(t)+delta)%1440+1440)%1440;return OW.fmt.pad(Math.floor(n/60))+':'+OW.fmt.pad(n%60);};
 function read(states={},connected=false){
  const days=DAYS.map(key=>{const wake=states['input_datetime.launch_time_'+key],alarm=states['input_boolean.launch_alarm_'+key],bed=states['input_datetime.bedtime_'+key];return {key,name:key[0].toUpperCase()+key.slice(1),wake:time(wake?.state),bedtime:time(bed?.state),enabled:usable(alarm)&&alarm.state==='on',ready:!!connected&&!!time(wake?.state)&&!!time(bed?.state)&&['on','off'].includes(alarm?.state)};});
  const weekdays=days.slice(0,5),signature=d=>[d.wake,d.bedtime,d.enabled].join('|');
  const raw=states['input_datetime.launch_override'],overrideAt=usable(raw)?Date.parse(raw.state):NaN;
  return {days,connected:!!connected,weekdaysDiffer:weekdays.some(d=>signature(d)!==signature(weekdays[0])),overrideAt:Number.isFinite(overrideAt)?overrideAt:null,overrideReady:!!connected&&usable(raw)};
 }
 function groups(model,custom=false){const blocks=custom||model.weekdaysDiffer?DAYS.map(day=>[day]):[DAYS.slice(0,5),['saturday'],['sunday']];return blocks.map(keys=>{const rows=keys.map(key=>model.days.find(d=>d.key===key));return {...rows[0],key:keys.length===5?'weekdays':keys[0],name:keys.length===5?'Mon–Fri':rows[0].name,days:keys,ready:rows.every(d=>d.ready)};});}
 function target(model,now=Date.now(),launch){
  if(launch?.at){const day=model.days.find(d=>d.key===launch.key);return day?{...day,...launch,wakeAt:launch.at,bedAt:bedAt(launch.at,day.bedtime)}:null;}
  for(let off=0;off<8;off++){const date=new Date(now);date.setDate(date.getDate()+off);const day=model.days.find(d=>d.key===JS[date.getDay()]);if(!day?.wake)continue;const [h,m]=day.wake.split(':').map(Number);date.setHours(h,m,0,0);if(+date>now)return {...day,wakeAt:+date,at:+date,bedAt:bedAt(+date,day.bedtime)};}return null;
 }
 function bedAt(wakeAt,bedtime){if(!time(bedtime))return null;const wake=new Date(wakeAt),bed=new Date(wakeAt),[h,m]=bedtime.split(':').map(Number);bed.setHours(h,m,0,0);if(+bed>=+wake)bed.setDate(bed.getDate()-1);return +bed;}
 function targetLine(model,launch,master=true,now=Date.now()){
  const t=target(model,now,launch);if(!t?.bedAt)return '';
  const total=Math.round((t.wakeAt-t.bedAt)/60000),hours=Math.floor(total/60),mins=total%60;
  return 'Bedtime '+clock(t.bedtime)+' · '+(master&&t.on!==false&&t.enabled!==false?hours+'h'+(mins?' '+mins+'m':'')+' until launch':'alarm off');
 }
 function command(states,connected,p,now=Date.now()){
  if(!connected)throw Error('Home Assistant is offline');
  if(p.field==='override'||p.field==='override.clear'){
   if(!usable(states['input_datetime.launch_override']))throw Error('Tomorrow override is unavailable');
   let datetime='2000-01-01 00:00:00';if(p.field==='override'){if(!time(p.value))throw Error('Choose a valid time');const d=new Date(now);d.setDate(d.getDate()+1);datetime=dateKey(d)+' '+p.value.slice(0,5)+':00';}
   return {type:'call_service',domain:'input_datetime',service:'set_datetime',target:{entity_id:'input_datetime.launch_override'},service_data:{datetime}};
  }
  if(!Array.isArray(p.days)||!p.days.length||new Set(p.days).size!==p.days.length||p.days.some(d=>!DAYS.includes(d)))throw Error('Invalid schedule days');
  if(!['wake','bedtime','enabled'].includes(p.field))throw Error('Invalid schedule setting');
  if(p.field==='enabled'?typeof p.value!=='boolean':!time(p.value))throw Error('Invalid schedule value');
  const prefix=p.field==='wake'?'input_datetime.launch_time_':p.field==='bedtime'?'input_datetime.bedtime_':'input_boolean.launch_alarm_';
  const ids=p.days.map(d=>prefix+d);if(ids.some(id=>!usable(states[id])||(p.field==='enabled'?!['on','off'].includes(states[id].state):!time(states[id].state))))throw Error('Schedule helpers are unavailable');
  return {type:'call_service',domain:p.field==='enabled'?'input_boolean':'input_datetime',service:p.field==='enabled'?(p.value?'turn_on':'turn_off'):'set_datetime',target:{entity_id:ids},service_data:p.field==='enabled'?{}:{time:p.value.slice(0,5)+':00'}};
 }
 const stamp=row=>{const raw=row.lc??row.last_changed??row.lu??row.last_updated;return typeof raw==='number'?raw*1000:Date.parse(raw);};
 const value=row=>row.s??row.state;
 function starts(rows=[]){let previous;return rows.filter(row=>{const state=value(row),on=state==='on'&&previous==='off';previous=state;return on&&Number.isFinite(stamp(row));}).map(stamp);}
 function historicalTarget(history,states,key,at){const id='input_datetime.bedtime_'+key;const candidates=(history[id]||[]).filter(r=>stamp(r)<=at&&time(value(r))).sort((a,b)=>stamp(b)-stamp(a));if(candidates.length)return time(value(candidates[0]));const current=states[id];return current&&Date.parse(current.last_changed)<=at?time(current.state):null;}
 function comparison(actual,wakeAt,bedtime){const planned=bedAt(wakeAt,bedtime),delta=planned==null?null:Math.round((actual-planned)/60000);return {goodnightAt:actual,bedtimeTarget:bedtime||null,bedtimeAt:planned,bedtimeDeltaMinutes:delta};}
 function history(history={},states={},mornings=[],now=Date.now()){
  const goodnights=starts(history['script.goodnight']).filter(at=>at<=now).sort((a,b)=>a-b);
  const enriched=mornings.map(m=>{const wakeAt=Date.parse(m.id.slice(0,10)+'T'+(time(m.liftoff)||m.id.slice(11,16))+':00');const actual=goodnights.filter(at=>at<wakeAt&&at>=wakeAt-24*3600000).at(-1);if(!actual)return {...m};const key=JS[new Date(wakeAt).getDay()];return {...m,...comparison(actual,wakeAt,historicalTarget(history,states,key,actual))};});
  const log=goodnights.slice(-14).reverse().map(actual=>{const recorded=enriched.find(m=>m.goodnightAt===actual);if(recorded)return {wakeDate:recorded.id.slice(0,10),...recorded};const pastStates={...states};for(const key of DAYS){const id='input_datetime.launch_time_'+key,rows=(history[id]||[]).filter(r=>stamp(r)<=actual&&time(value(r))).sort((a,b)=>stamp(b)-stamp(a));if(rows.length)pastStates[id]={state:value(rows[0])};}const t=target(read(pastStates,true),actual);if(!t)return {goodnightAt:actual};return {wakeDate:dateKey(t.wakeAt),...comparison(actual,t.wakeAt,historicalTarget(history,states,t.key,actual))};});
  const seen=new Set();return {mornings:enriched,log:log.filter(r=>{if(seen.has(r.wakeDate))return false;seen.add(r.wakeDate);return true;}).slice(0,7)};
 }
 function comparisonText(row){if(!row.goodnightAt)return '';const when='Goodnight '+OW.fmt.hm(row.goodnightAt);if(row.bedtimeDeltaMinutes==null)return when+' · target not recorded';const d=row.bedtimeDeltaMinutes;return when+' · target '+clock(row.bedtimeTarget)+' · '+(d===0?'on target':Math.abs(d)+' min '+(d>0?'late':'early'));}
 OW.sleepSchedule={days:DAYS,time,clock,shift,read,groups,target,bedAt,targetLine,command,history,comparisonText,dateKey};
})();
