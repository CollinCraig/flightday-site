/* Read-only briefing adapter. Receipt time never replaces a source observation time. */
(function(){
 'use strict';
 const O=window.OW,G=O.goNoGo;
 let provider=null,weather=null,forecast=null,weatherKey=null;
 const valid=v=>v!=null&&Number.isFinite(typeof v==='number'?v:Date.parse(v));
 const timestamp=v=>typeof v==='number'?v:Date.parse(v);
 function enabled(){const local=O.config.get('briefing.showGoNoGo');if(typeof local==='boolean')return local;const screen=O.model.screen(),value=O.config.get('houseScreenPrefs')?.[screen?.id]?.showGoNoGo;return typeof value==='boolean'?value:true;}
 function originalWake(){
  const a=O.app?.alarm,L=O.data.state?.launch||{},now=O.now();
  if(typeof a?.alarm_id==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(a.alarm_id)){const original=new Date(a.alarm_id);if(original.toDateString()===now.toDateString())return +original;}
  const day=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][now.getDay()],time=L.days?.find(d=>d.key===day)?.time||L.time||O.config.get('schedule.launch');
  if(!/^\d\d:\d\d/.test(time||''))return null;const [h,m]=time.split(':').map(Number),date=new Date(now);date.setHours(h,m,0,0);return +date;
 }
 function alerts(state,p,roles){
  const feeds=[];if(state.weatherAlerts?.source)feeds.push(state.weatherAlerts);
  for(const id of roles.weather||[]){const st=p?.states?.[id],a=st?.attributes;if(Array.isArray(a?.alerts))feeds.push({source:true,as_of:a.alerts_as_of||st.last_updated,items:a.alerts});}
  if(!feeds.length)return {source:false,items:[]};
  const seen=new Set(),items=[];for(const feed of feeds)for(const raw of feed.items||[]){const item={event:raw.event,severity:String(raw.severity||'').toLowerCase(),starts:raw.starts||raw.onset||raw.effective||raw.sent,ends:raw.ends||raw.expires},key=[String(item.event).toLowerCase(),item.severity,timestamp(item.starts),timestamp(item.ends)].join('|');if(!seen.has(key)){seen.add(key);items.push(item);}}
  return {source:true,as_of:feeds.every(f=>valid(f.as_of))?Math.min(...feeds.map(f=>timestamp(f.as_of))):null,items};
 }
 function inputs(){
  const s=O.data.state||{},p=O.data.provider,status=O.data.status||{},now=O.nowMs(),key=JSON.stringify(O.model.config.roles.weather);if(provider!==p||weatherKey!==key){provider=p;weatherKey=key;weather=null;forecast=null;}
  const w=s.weather;if(w&&valid(w.observedAt??w.at))weather={as_of:w.observedAt??w.at,condition:w.condition};
  if(w&&valid(w.forecastAt)&&Array.isArray(w.forecastHours))forecast={as_of:w.forecastAt,hourly:w.forecastHours};
  // Cold starts can still report the timestamp of a stale source discarded by the weather card.
  if(!weather){const base=p?.openMeteoWeather;if(valid(base?.observedAt??base?.at))weather={as_of:base.observedAt??base.at,condition:base.condition};else for(const id of O.model.config.roles.weather||[]){const st=p?.states?.[id];if(st&&!['unknown','unavailable'].includes(st.state)&&valid(st.last_updated)&&O.weatherSource.number(st.attributes?.temperature)!==null){weather={as_of:st.last_updated,condition:st.state};break;}}}
  if(!forecast){const candidates=[];const base=p?.openMeteoWeather;if(valid(base?.forecastAt))candidates.push({as_of:base.forecastAt,hourly:base.forecastHours||[]});for(const id of O.model.config.roles.weather||[]){const cache=p?.weatherForecasts?.[id]?.hourly;if(valid(cache?.at))candidates.push(O.weatherSource.forecastEvidence(cache,p?.states?.[id]?.attributes?.precipitation_unit));}forecast=candidates.sort((a,b)=>timestamp(b.as_of)-timestamp(a.as_of))[0]||null;}
  const crew=O.app?.briefAlarm?O.app.alarm?.crew:null,roles=O.model.config.roles,wakeIds=(roles.wake_rule_calendars||[]).filter(id=>!O.model.privateSource(id,crew)),agendaIds=(roles.agenda_calendars||[]).filter(id=>!O.model.privateSource(id,crew)),evidence=p?.calendarEvidence||{},required=wakeIds.length>0;
  const exclude=e=>!O.model.privateSource(e.calendar,crew),event=e=>({summary:e.title||e.summary||'(busy)',start:e.start,end:e.end,allDay:!!e.allDay});
  const rows=ids=>ids.flatMap(id=>evidence[id]?.events||[]).filter(exclude).map(event),stamps=wakeIds.map(id=>evidence[id]?.at);
  const calendar={required,as_of:stamps.length&&stamps.every(valid)?Math.min(...stamps.map(timestamp)):null,wake_rule_events:rows(wakeIds),agenda_events:rows(agendaIds)};
  if(!agendaIds.length&&p?.name==='local')calendar.agenda_events=(s.events||[]).filter(exclude).map(event);
  const modelChecks=O.model.source==='v3',checks=modelChecks?O.model.checks:s.goNoGoChecks;
  return {now,time_zone:Intl.DateTimeFormat().resolvedOptions().timeZone,time_format:O.time.mode(),wake:originalWake(),disconnected_s:p?.name!=='ha'&&status.provider!=='ha'?Infinity:status.connected?0:valid(status.disconnectedAt)?Math.max(0,(now-timestamp(status.disconnectedAt))/1000):Infinity,weather,forecast,alerts:alerts(s,p,roles),calendar,house_check_on:!!O.model.config.modules.house_check,checks:Array.isArray(checks)?checks:[],checks_available:modelChecks?O.data.client?.checksAvailable!==false:Array.isArray(s.goNoGoChecks),crew};
 }
 function result(){if(!O.data?.state)return null;const input=inputs(),app=O.app||{};return G.visible({...input,show:enabled(),night:!!(app.night||app.shutdown||O.data.state?.launch?.sleeping),ambient:!!app.ambient})?G.inspect(input):null;}
 function html(){const value=result();if(!value)return '';const details=(value.checked.length?'Checked: '+value.checked.join(', '):'')+(value.notChecked.length?(value.checked.length?' · ':'')+'Not checked: '+value.notChecked.join(', '):'');return '<strong class="gng-line '+value.verdict+'" data-verdict="'+value.verdict+'">'+O.esc(value.text)+'</strong><small class="gng-details">'+O.esc(details)+'</small>';}
 function refresh(){const element=document.querySelector('[data-go-no-go]');if(!element)return;const markup=html();if(element.dataset.content!==markup){element.dataset.content=markup;element.hidden=!markup;element.innerHTML=markup;}}
 O.goNoGoView={enabled,originalWake,inputs,result,html,refresh};
})();
