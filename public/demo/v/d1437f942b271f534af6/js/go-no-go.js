/* FE-D7. Pure verdict rules; no clock reads, network, storage or household actions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root?.OW)root.OW.goNoGo=api;})(typeof window==='object'?window:null,function(){
 'use strict';
 const MIN=60000,HOUR=60*MIN;
 const offset=c=>typeof c.now==='string'?(c.now.match(/(?:Z|[+-]\d\d:\d\d)$/)?.[0]||'Z'):'Z';
 function stamp(value,c){if(typeof value==='number')return Number.isFinite(value)?value:NaN;if(typeof value!=='string')return NaN;return Date.parse(/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(value)?value+offset(c):value);}
 function local(value,c){const t=stamp(value,c);if(!Number.isFinite(t))return null;if(c.time_zone){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:c.time_zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(t).map(p=>[p.type,p.value]));return {day:parts.year+'-'+parts.month+'-'+parts.day,h:+parts.hour,m:+parts.minute};}const zone=offset(c),sign=zone[0]==='-'?-1:1,mins=zone==='Z'?0:sign*(+zone.slice(1,3)*60 + +zone.slice(4,6)),d=new Date(t+mins*MIN);return {day:d.toISOString().slice(0,10),h:d.getUTCHours(),m:d.getUTCMinutes()};}
 function format(value,c){const p=local(value,c);if(!p)return '—';const mm=String(p.m).padStart(2,'0');return ['24h','both'].includes(c.time_format)?String(p.h).padStart(2,'0')+':'+mm:(p.h%12||12)+':'+mm+' '+(p.h<12?'AM':'PM');}
 const timed=e=>!e.allDay&&e.start!=null&&(typeof e.start==='number'||String(e.start).includes('T'));
 function inspect(c){
  const now=stamp(c.now,c),wake=stamp(c.wake,c),stale=[],blockers=[],checked=[],notChecked=[];
  const freshness=(name,value,minutes)=>{const at=stamp(value?.as_of,c),age=now-at;if(!Number.isFinite(at)){stale.push('no '+name);return false;}if(age>minutes*MIN||age< -5*MIN){stale.push(name+' as of '+format(at,c));return false;}return true;};
  const weatherFresh=freshness('weather',c.weather,90),forecastFresh=freshness('forecast',c.forecast,360);
  if(forecastFresh&&(!Array.isArray(c.forecast.hourly)||!c.forecast.hourly.length)){stale.push('no forecast');}
  if(weatherFresh&&forecastFresh&&!stale.includes('no forecast'))checked.push('weather');else notChecked.push('weather (incomplete)');
  if(c.alerts?.source){if(freshness('weather alerts',c.alerts,30))checked.push('weather alerts');else notChecked.push('weather alerts (incomplete)');}else notChecked.push('weather alerts (no source)');
  if(c.calendar?.required){if(freshness('calendar',c.calendar,30))checked.push('calendar');else notChecked.push('calendar (incomplete)');}else notChecked.push('calendar (no source)');
  const offline=c.disconnected_s>=120||!Number.isFinite(c.disconnected_s);
  if(offline)blockers.push('Home Assistant offline · retrying');
  if(c.house_check_on){if(c.checks_available===false||!Array.isArray(c.checks)){stale.push('no house checks');notChecked.push('house (no source)');}else if(!offline)checked.push('house');else notChecked.push('house (offline)');}else notChecked.push('house (off)');
  for(const a of c.alerts?.items||[]){if(['severe','extreme'].includes(String(a.severity).toLowerCase())&&stamp(a.starts,c)<now+3*HOUR&&stamp(a.ends,c)>now)blockers.push(String(a.event||'Weather alert').toLowerCase()+' until '+format(a.ends,c));}
  if(c.house_check_on)for(const check of c.checks||[])if(check.status==='problem'&&check.morning===true)blockers.push(check.title);
  for(const e of c.calendar?.wake_rule_events||[])if(timed(e)&&!e.private_excluded&&stamp(e.start,c)<wake&&stamp(e.end,c)>now)blockers.push(e.summary+' started '+format(e.start,c));
  let verdict,text;
  if(blockers.length){verdict='no_go';text='No-Go: '+blockers[0]+(blockers.length>1?' · +'+(blockers.length-1)+' more':'')+(stale.length?' · checks incomplete':'');}
  else if(stale.length){verdict='incomplete';text='Checks incomplete · '+stale[0];}
  else{
   const day=local(now,c)?.day,rows=c.forecast.hourly.filter(r=>Number.isFinite(stamp(r.t,c))&&stamp(r.t,c)+HOUR>now&&local(r.t,c)?.day===day).slice().sort((a,b)=>stamp(a.t,c)-stamp(b.t,c));
   const wet=r=>r.precip_prob>=40||r.precip_mm>=.1,next=rows.find(wet),current=rows.find(r=>stamp(r.t,c)<=now&&stamp(r.t,c)+HOUR>now),amount=(next?.precip_mm||0)/4,band=amount>4?'heavy':amount>=1?'moderate':'light';
   const weather=current&&wet(current)?'Rain now, '+band:next&&stamp(next.t,c)-now<=3*HOUR?'Rain from '+format(next.t,c)+', '+band:next?'Dry until '+format(next.t,c):'Dry all day';
   const event=(c.calendar?.agenda_events||[]).filter(e=>timed(e)&&!e.private_excluded&&stamp(e.start,c)>=now&&local(e.start,c)?.day===day).slice().sort((a,b)=>stamp(a.start,c)-stamp(b.start,c))[0];
   verdict='go';text='Go. '+weather+' · '+(event?'first event '+format(event.start,c):'nothing on the calendar');
  }
  return {verdict,text,checked,notChecked};
 }
 function evaluate(input){const {verdict,text}=inspect(input);return {verdict,text};}
 function visible(c){const now=stamp(c.now,c),wake=stamp(c.wake,c),p=local(now,c);return c.show!==false&&!c.night&&!c.ambient&&!!p&&p.h<12&&local(wake,c)?.day===p.day&&Number.isFinite(wake)&&now>=wake-10*MIN;}
 return {evaluate,inspect,visible,format,stamp};
});
