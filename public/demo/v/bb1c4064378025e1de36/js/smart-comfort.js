/* Smart Comfort is an HA read model. This client never chooses a mode or schedules work. */
(function () {
  'use strict';
  const O=window.OW, valid=s=>s&&!['unknown','unavailable'].includes(s.state);
  const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const settings={
    comfort_auto:['Auto heat & cool','Switches between heat and cool for you.'],
    comfort_manual_hold:['Manual changes last','Until the next period, or sooner.'],
    comfort_fresh_air_suggest:['Suggest fresh-air days','Advice from the house, when the weather is right.'],
    fresh_air_outside_low:['Outside between · low'],fresh_air_outside_high:['Outside between · high'],
    fresh_air_humidity:['Humidity'],fresh_air_inside_low:['Tell me if inside drops below'],fresh_air_inside_high:['Tell me if inside rises above'],
    comfort_notify_phone:['Phone notifications','Requires a connected phone notification service.'],
    comfort_switch_margin:['Switch heat/cool after'],fresh_air_gust_max:['Fresh-air gust limit'],
    comfort_focus_room:['Comfort for'],comfort_room_bias:['Aim for the rooms, not the thermostat','Starts off. Turn on after reviewing the room readings.'],
    comfort_rh_high:['Humidity: run the AC above'],comfort_ai_plan:['Use AI plan','AI suggestions are checked by the house rules.']
  };
  const ids={comfort_auto:'input_boolean',comfort_manual_hold:'input_select',comfort_fresh_air_suggest:'input_boolean',fresh_air_humidity:'input_select',comfort_notify_phone:'input_boolean',comfort_focus_room:'input_select',comfort_room_bias:'input_boolean',comfort_ai_plan:'input_boolean'};
  Object.keys(settings).forEach(k=>ids[k]=(ids[k]||'input_number')+'.'+k);
  const labels={next_period:'Until next period','1':'1 h','2':'2 h','4':'4 h',dry:'Dry only',normal:'Normal',relaxed:'Relaxed',whole_home:'Whole home',office:'Office',kitchen:'Kitchen'};
  const actions={fresh_air:['Fresh air mode','comfort_fresh_air_start'],close_up:['Close up · Auto','comfort_fresh_air_end'],resume:['Resume Auto','comfort_resume'],keep_open:['Keep open 1 h','comfort_keep_open'],not_today:['Not today','comfort_dismiss'],just_off:['Just off','comfort_dismiss'],keep_off:['Keep off','comfort_dismiss'],leave_it:['Leave it','comfort_dismiss'],skip:['Skip today','comfort_plan_skip']};
  const stateNames=['auto','manual_hold','manual_off','fresh_air','door_pause','fault','disabled'];
  function read(states,connected) {
    const s=states['sensor.comfort_status'],a=s?.attributes||{},available=!!(connected&&valid(s)&&stateNames.includes(s.state));
    const helpers={};
    for(const [key,id] of Object.entries(ids)){
      const h=states[id],type=id.split('.')[0],at=h?.attributes||{},value=type==='input_number'?num(h?.state):type==='input_boolean'?h?.state==='on':h?.state;
      helpers[key]={id,type,value,min:num(at.min),max:num(at.max),step:num(at.step),options:at.options||[],ready:!!(connected&&valid(h)&&(type==='input_boolean'?['on','off'].includes(h.state):type==='input_select'?Array.isArray(at.options)&&at.options.includes(h.state):value!==null&&num(at.min)!==null&&num(at.max)!==null&&num(at.step)>0&&value>=num(at.min)&&value<=num(at.max)))};
    }
    const ps=states['sensor.comfort_plan'],raw=a.plan|| (valid(ps)?{...ps.attributes,state:ps.state}:null);
    const plan={...(raw?.plan||{}),...(raw||{}),state:['active','suggested','skipped','rejected','failed','none','stale'].includes(raw?.state)?raw.state:'none',available:!!(connected&&raw),summary:typeof (raw?.summary??raw?.plan?.summary)==='string'?(raw.summary??raw.plan.summary):'',items:Array.isArray(raw?.items)?raw.items:[],insights:Array.isArray(raw?.insights)?raw.insights:[],proposals:Array.isArray(raw?.proposals)?raw.proposals:[]};
    const indoor={...(a.indoor||{})},scriptReady={};
    for(const [key,action]of Object.entries(actions))scriptReady[key]=!!(connected&&valid(states['script.'+action[1]]));
    let rooms=Array.isArray(indoor.rooms)?indoor.rooms:[];
    const model=O.data?.client?.model;
    if(O.data?.contract===3&&!rooms.length){rooms=(model?.config?.roles?.indoor_temperature||[]).map(r=>{const t=states[r.temperature],h=states[r.humidity],value=valid(t)?num(t.state):null,at=Date.parse(t?.last_updated||t?.last_changed),temp=value===null?null:O.climate.convert(value,t.attributes?.unit_of_measurement||'°F','°F');return {room:r.area,label:model.rooms?.[r.area]?.name||String(r.area||'Room').replaceAll('_',' '),temp,rh:valid(h)?num(h.state):null,weight:r.weight,fresh:connected&&Number.isFinite(at)&&O.nowMs()-at<90*60000,age_min:Number.isFinite(at)?Math.max(0,(O.nowMs()-at)/60000):null};});indoor.used=rooms.filter(r=>r.fresh&&r.temp!==null).map(r=>({room:r.room,weight:r.weight??1}));const used=rooms.filter(r=>r.fresh&&r.temp!==null),weight=used.reduce((n,r)=>n+(r.weight??1),0);indoor.temp=weight?used.reduce((n,r)=>n+r.temp*(r.weight??1),0)/weight:null;}
    const schedule=states[model?.entities?.comfort_status],period=model?.config?.roles?.thermostat&&['night','wake','day'].includes(schedule?.state)?schedule.state:null,configuredLine=period?'Comfort · '+period[0].toUpperCase()+period.slice(1)+' schedule':'Comfort · not set up';
    plan.controls={};for(const key of ['replan','dismiss']){const id=raw?.actions?.[key];if(typeof id==='string'&&/^script\.comfort_/.test(id)&&valid(states[id])&&connected)plan.controls[key]=id;}
    return {available,state:available?s.state:null,statusLine:available&&typeof a.status_line==='string'?a.status_line:connected?configuredLine:'Comfort offline',sleeping:states['input_boolean.sleep_mode']?.state==='on',notice:available&&a.notice&&typeof a.notice.text==='string'?a.notice:null,briefingLine:available&&typeof a.briefing_line==='string'?a.briefing_line:'',shadow:a.shadow===true,door:a.door,helpers,scriptReady,plan,indoor:{...indoor,rooms},sourceCredit:a.source_credit||'',roomNotice:connected?(indoor.notice||states["binary_sensor.roomSpeaker_sensors_ok"]?.attributes?.notice||(!rooms.some(r=>num(r.temp)!==null)?'Room sensors · none yet':'')):'Room sensors offline',lastEvent:a.last_event||''};
  }
  function quiet(m=O.data.state.smartComfort){return /bed/i.test(O.config.get('room')||'')&&!!(m?.sleeping||O.app?.night||O.app?.shutdown);}
  function command(action,p,states,connected) {
    if(!connected)throw Error('Home Assistant is offline');
    const m=read(states,true),by=O.app.deviceId();
    if(action==='comfort.action'){
      const route=actions[p.kind];if(!route||!m.scriptReady[p.kind])throw Error('Comfort action is unavailable');
      const fields={by};if(route[1]==='comfort_dismiss')fields.kind=p.kind;if(p.kind==='keep_open')fields.minutes=60;
      return {domain:'script',service:route[1],service_data:fields};
    }
    if(action==='comfort.setting'){
      const h=m.helpers[p.key];if(!h?.ready)throw Error('Comfort setting is unavailable');
      if(h.type==='input_boolean'){
        if(typeof p.value!=='boolean')throw Error('Choose On or Off');
        return {domain:h.type,service:p.value?'turn_on':'turn_off',target:{entity_id:h.id},service_data:{}};
      }
      if(h.type==='input_select'){
        if(!h.options.includes(p.value))throw Error('Choose an available option');
        return {domain:h.type,service:'select_option',target:{entity_id:h.id},service_data:{option:p.value}};
      }
      const value=p.delta!==undefined?h.value+p.delta*h.step:p.value;
      if((p.delta!==undefined&&![-1,1].includes(p.delta))||typeof value!=='number'||!Number.isFinite(value)||value<h.min||value>h.max||Math.abs((value-h.min)/h.step-Math.round((value-h.min)/h.step))>1e-6)throw Error('Temperature or limit is outside its range');
      return {domain:h.type,service:'set_value',target:{entity_id:h.id},service_data:{value:+value.toFixed(3)}};
    }
    if(action==='comfort.replan'){
      if(!m.plan.controls.replan)throw Error('AI plan unavailable — on schedule');
      return {domain:'script',service:m.plan.controls.replan.slice(7),service_data:{by}};
    }
    if(action==='comfort.proposal'){
      const proposal=m.plan.proposals.find(row=>row.key===p.key&&row.value===p.value);
      if(!proposal)throw Error('Suggestion is no longer available');
      if(p.dismiss){
        if(!m.plan.controls.dismiss)throw Error('Suggestion dismissal is unavailable');
        return {domain:'script',service:m.plan.controls.dismiss.slice(7),service_data:{by,key:p.key,value:p.value}};
      }
      const extra={night_temperature:'input_number.night_temperature',wake_temperature:'input_number.wake_temperature',day_temperature:'input_number.day_temperature',day_temperature_time:'input_datetime.day_temperature_time'};
      const allowed=['day_temperature','night_temperature','wake_temperature','day_temperature_time','comfort_switch_margin','fresh_air_humidity','fresh_air_outside_low','fresh_air_outside_high','comfort_rh_high','comfort_room_bias'];
      const id=extra[p.key]||ids[p.key],h=states[id];
      if(!allowed.includes(p.key)||!valid(h))throw Error('Suggestion is unavailable');
      if(p.key==='day_temperature_time'){
        const minute=v=>/^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(v)?+v.slice(0,2)*60 + +v.slice(3,5):null;
        const a=minute(h.state),b=minute(p.value);
        if(a===null||b===null||Math.min(Math.abs(a-b),1440-Math.abs(a-b))>15)throw Error('Suggestion exceeds one step');
        return {domain:'input_datetime',service:'set_datetime',target:{entity_id:id},service_data:{time:p.value.slice(0,5)+':00'}};
      }
      if(id.startsWith('input_number.')){
        const value=p.value,at=h.attributes||{},current=num(h.state),step=num(at.step),min=num(at.min),max=num(at.max);
        if(typeof value!=='number'||current===null||!(step>0)||min===null||max===null||value<min||value>max||Math.abs(value-current)>step+1e-6||Math.abs((value-min)/step-Math.round((value-min)/step))>1e-6)throw Error('Suggestion exceeds the helper range or one step');
        return {domain:'input_number',service:'set_value',target:{entity_id:id},service_data:{value}};
      }
      return command('comfort.setting',p,states,connected);
    }
    throw Error('Comfort action is unavailable');
  }
  const esc=v=>O.esc(String(v??''));
  function button(kind,label,prefix='comfort'){
    const off=O.data.contract===3&&O.data.state.climate?.mode==='off';
    if(off&&['fresh_air','close_up','keep_open','skip'].includes(kind))return '';
    const m=O.data.state.smartComfort,locked=!!O.app?.comfortPending||!m?.scriptReady[kind];
    return '<button class="btn" data-focus data-fid="'+prefix+'-'+kind+'" data-act="comfort.action" data-arg="'+kind+'"'+(locked?' disabled':'')+'>'+esc(label||actions[kind]?.[0]||kind)+'</button>';
  }
  function notice(prefix='comfort'){
    const m=O.data.state.smartComfort,n=m?.notice;
    if(!m?.available||m.sleeping||quiet(m)||!n||n.kind==='none'||!n.text)return '';
    return '<div class="comfort-notice" role="status"><p>'+esc(n.text)+'</p><div class="comfort-actions">'+(Array.isArray(n.actions)?n.actions:[]).filter(k=>actions[k]).map(k=>button(k,n.kind==='hold'&&k==='resume'?'Resume':n.kind==='info'&&k==='close_up'?'Close up':null,prefix)).join('')+'</div></div>';
  }
  function planHtml(prefix='comfort'){
    const m=O.data.state.smartComfort,p=m?.plan;if(quiet(m)||!p?.available&&O.data.contract===3)return '';
    const messages={skipped:'AI plan skipped today — on schedule',rejected:'AI plan rejected — on schedule',failed:'AI plan unavailable — on schedule',none:'AI plan unavailable — on schedule',stale:'AI plan expired — on schedule'};
    if(!p?.available||!['active','suggested'].includes(p.state))return '<p class="comfort-plan muted">'+esc(messages[p?.state]||messages.none)+(p?.reason?' · '+esc(p.reason):'')+'</p>';
    return '<section class="comfort-plan"><p>'+esc(p.state==='suggested'?'Plan (not applied) · ':'Plan · ')+esc(p.summary)+'</p><button class="btn" data-focus data-fid="'+prefix+'-why" data-act="comfort.why">'+(O.app?.comfortWhy?'Hide why':'Why ›')+'</button> '+button('skip',null,prefix)+(p.state==='suggested'?settingToggle('comfort_ai_plan','Use AI plan',prefix):'')+(O.app?.comfortWhy?'<div class="comfort-why">'+p.items.map(i=>'<p>'+esc(i.time?O.time.text(i.time)+' · ':'')+esc(i.text)+'</p>').join('')+(p.reason?'<p>'+esc(p.reason)+'</p>':'')+(p.confidence?'<p>Confidence · '+esc(p.confidence)+'</p>':'')+'<small>AI suggestion, checked by the house rules</small></div>':'')+'</section>';
  }
  function settingToggle(key,label,prefix){const h=O.data.state.smartComfort?.helpers[key];return '<button class="btn" data-focus data-fid="'+prefix+'-'+key+'" data-act="comfort.setting" data-arg="'+esc(JSON.stringify({key,value:!h?.value}))+'"'+(!h?.ready||O.app?.comfortPending?' disabled':'')+'>'+esc(label||(!h?.ready?'Unavailable':h.value?'On':'Off'))+'</button>';}
  function card(){
    const m=O.data.state.smartComfort;if(!m)return '';
    if(quiet(m))return '<p class="comfort-status">Comfort is quiet for the night</p>';
    const off=O.data.contract===3&&O.data.state.climate?.mode==='off';
    if(off)return '<div role="status">Thermostat is Off. Tap Resume to hand it back to Smart Comfort.</div>'+button('resume','Resume')+notice()+planHtml();
    const banner=m.state==='manual_hold'?button('resume','Resume'):m.state==='manual_off'?button('resume'):'';
    const fresh=m.state==='fresh_air'?button('close_up','Close up'):['auto','manual_hold','manual_off'].includes(m.state)?button('fresh_air'):'';
    const inside=m.indoor,secondary=num(inside.temp)!==null&&inside.used?.some(r=>r.room!=='thermostat')?'<p class="comfort-room-line">Rooms '+num(inside.temp).toFixed(1)+'°'+(num(inside.rh)!==null?' · '+Math.round(inside.rh)+'%':'')+'</p>':'';
    return '<div class="comfort-status" role="status">'+esc(m.statusLine)+banner+'</div>'+secondary+'<div class="comfort-actions">'+fresh+'</div>'+notice()+planHtml();
  }
  function roomsHtml(){
    const m=O.data.state.smartComfort;if(!m||quiet(m))return '';
    const rows=m.indoor.rooms,have=rows.some(r=>num(r.temp)!==null),age=r=>num(r.age_min)===null?'Waiting for a reading':Math.floor(r.age_min)+' min ago';
    return '<section class="comfort-rooms"><h3>Rooms</h3>'+(!have?'<p class="muted">'+esc(m.roomNotice||'Room sensors · none yet')+'</p>':rows.map(r=>'<div data-focus tabindex="0" data-fid="comfort-room-'+esc(r.room)+'" class="comfort-room '+(!r.fresh?'stale':'')+'"><b>'+esc(r.label||r.room)+'</b><span>'+(num(r.temp)===null?'—':num(r.temp).toFixed(1)+'°')+' · '+(num(r.rh)===null?'—':Math.round(r.rh)+'%')+'</span><small>'+esc(age(r))+(!r.fresh?' · not counted':'')+(r.room==='porch'&&!r.in_blend?(m.door==='closed'?' · door closed — not counted':' · not counted'):'')+(r.suspect?' · speaker warmth':'')+'</small></div>').join(''))+'<p class="comfort-basis">Comfort uses: '+esc((m.indoor.used||[]).map(r=>(r.room==='thermostat'?'Thermostat':r.room.charAt(0).toUpperCase()+r.room.slice(1).replaceAll('_',' '))+(r.weight!==1?' ×'+r.weight:'')).join(', ')||'none yet')+(num(m.indoor.temp)!==null?' · indoor '+num(m.indoor.temp).toFixed(1)+'°':'')+'</p></section>';
  }
  function settingsHtml(){
    const m=O.data.state.smartComfort;if(!m)return '<p>Comfort · not set up</p>';
    const rows=Object.entries(settings).map(([key,[label,hint]])=>{
      const h=m.helpers[key],locked=!h.ready||O.app?.comfortPending,attrs=' data-focus data-act="comfort.setting"'+(locked?' disabled':'');
      const b=(value,text,suffix)=>'<button class="btn'+(h.value===value?' on':'')+'"'+attrs+' data-fid="comfort-set-'+key+'-'+suffix+'" data-arg="'+esc(JSON.stringify({key,value}))+'">'+esc(text)+'</button>';
      let control=h.type==='input_boolean'?settingToggle(key,null,'comfort-set'):h.type==='input_select'?h.options.map(v=>b(v,labels[v]||v,v)).join(''): '<button class="btn"'+attrs+' data-fid="comfort-set-'+key+'-minus" data-arg="'+esc(JSON.stringify({key,delta:-1}))+'"'+(h.value<=h.min?' disabled':'')+'>−</button><b class="mono">'+(h.ready?h.value+(key==='comfort_rh_high'?'%':key==='fresh_air_gust_max'?' mph':'°'):'—')+'</b><button class="btn"'+attrs+' data-fid="comfort-set-'+key+'-plus" data-arg="'+esc(JSON.stringify({key,delta:1}))+'"'+(h.value>=h.max?' disabled':'')+'>+</button>';
      if(!h.ready&&h.type==='input_select')control='<span>Unavailable</span>';
      return '<div class="climate-routine"><div><b>'+esc(label)+'</b><small>'+esc(!h.ready?'Not set up':hint||'')+'</small></div><div class="climate-options">'+control+'</div></div>';
    }).join('');
    return '<section class="smart-comfort-settings">'+(O.data.contract===3&&O.data.state.climate?.mode==='off'?'<p role="status">Thermostat is Off. Tap Resume to hand it back to Smart Comfort.</p>'+button('resume','Resume','settings-comfort'):'')+rows+'<p class="muted">'+esc(m.shadow?'Auto is watching only. Manual Heat, Cool and Off still work.':'')+'</p>'+planHtml('settings-plan')+(m.plan.available&&m.plan.received_at?'<p class="muted">Last plan '+esc(O.time.text(m.plan.received_at))+(m.plan.model?' · '+esc(m.plan.model):'')+(['active','suggested'].includes(m.plan.state)?' · checked ✓':'')+'</p>':'')+(O.data.contract===3?'':'<button class="btn" data-focus data-fid="comfort-replan" data-act="comfort.replan"'+(!m.plan.controls.replan||O.app?.comfortPending?' disabled':'')+'>Re-plan now</button>')+'<h3>What I’ve noticed</h3>'+m.plan.insights.map(text=>'<p>'+esc(text)+'</p>').join('')+m.plan.proposals.map(row=>'<div class="comfort-proposal"><p>Suggestion: '+esc(settings[row.key]?.[0]||row.key.replaceAll('_',' '))+' · '+esc(row.value)+' — '+esc(row.why)+'</p>'+(O.data.contract===3?[false]:[false,true]).map(dismiss=>'<button class="btn" data-focus data-act="comfort.proposal" data-arg="'+esc(JSON.stringify({key:row.key,value:row.value,dismiss}))+'"'+(O.app?.comfortPending||(dismiss&&!m.plan.controls.dismiss)?' disabled':'')+'>'+(dismiss?'Dismiss':'Apply')+'</button>').join('')+'</div>').join('')+(!m.plan.insights.length&&!m.plan.proposals.length?'<p class="muted">No observations yet</p>':'')+'</section>';
  }
  function briefing(){const m=O.data.state.smartComfort;if(!m?.available||quiet(m))return '';const priority=['fresh_air','manual_off'].includes(m.state);return priority?m.briefingLine:m.plan.available&&['active','suggested'].includes(m.plan.state)&&m.plan.summary?m.plan.summary:m.briefingLine;}
  function nightLine(){const m=O.data.state.smartComfort,c=O.data.state.climate,t=c?.night?.temperatureF,night=t==null?'Night target':('Night '+t+'°');if(O.data.contract===3&&c?.mode==='off')return {text:'Thermostat is Off. Tap Resume to hand it back to Smart Comfort.',kinds:['resume','keep_off']};if(!m?.available)return {text:'Comfort · not set up',kinds:[]};return m.state==='fresh_air'?{text:'Fresh air is on — the door may be open. '+night+" won’t run.",kinds:['close_up','leave_it']}:m.state==='manual_off'?{text:'Thermostat is off. '+night+" won’t run.",kinds:['resume','keep_off']}:{text:m.state==='disabled'?'Comfort schedule off':m.state==='fault'?m.statusLine:night+' · '+(m.shadow?'Auto (watching only)':'Auto'),kinds:[]};}
  O.smartComfort={read,command,quiet,button,notice,card,roomsHtml,settingsHtml,briefing,nightLine,planHtml,settings,ids};
})();
