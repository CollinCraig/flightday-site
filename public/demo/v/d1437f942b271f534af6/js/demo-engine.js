/* Canonical FE-D3 time grammar and session-only simulation. No network or platform bridge. */
(function (root) {
  'use strict';
  const clone=v=>JSON.parse(JSON.stringify(v)),DAY=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const TOKEN=/^@(?:(local):)?(now|today|tomorrow|day[+-]\d+|hour[+-]\d+|lastwake)((?:[+-]\d+[dhms])*)(?: (\d\d):(\d\d))?$/;
  function clock(zone){
    const f=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    const parts=t=>Object.fromEntries(f.formatToParts(new Date(t)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
    const utc=p=>Date.UTC(p.year,p.month-1,p.day,p.hour||0,p.minute||0,p.second||0);
    const epoch=p=>{let t=utc(p);for(let i=0;i<4;i++)t+=utc(p)-utc(parts(t));return t;};
    const date=t=>{const p=parts(t);return p.year+'-'+String(p.month).padStart(2,'0')+'-'+String(p.day).padStart(2,'0');};
    const local=t=>{const p=parts(t);return date(t)+'T'+String(p.hour).padStart(2,'0')+':'+String(p.minute).padStart(2,'0');};
    const iso=t=>{const off=Math.round((utc(parts(t))-Math.floor(t/1000)*1000)/60000),a=Math.abs(off);return local(t)+':'+String(parts(t).second).padStart(2,'0')+(off<0?'-':'+')+String(Math.floor(a/60)).padStart(2,'0')+':'+String(a%60).padStart(2,'0');};
    const day=(t,n=0,h=0,m=0)=>{const p=parts(t),d=new Date(Date.UTC(p.year,p.month-1,p.day+n));return epoch({year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),hour:h,minute:m});};
    return {parts,epoch,date,local,iso,day};
  }
  class Engine {
    constructor(raw,{now=Date.now(),scenario='clear',mode='panel',explicitNow=false,assetBase='https://demo.invalid/fixtures/demo-house/'}={}){
      raw=clone(raw);if(!raw.model?.entity_info||typeof raw.model.entity_info!=='object'||Array.isArray(raw.model.entity_info))throw Error('Demo fixture requires entity_info');this.raw=raw;this.scenario=raw.scenarios[scenario]?scenario:raw.manifest.default_scenario;this.sc=raw.scenarios[this.scenario];if(this.sc.config_override){raw.model.config.roles=clone(this.sc.config_override.roles);raw.model.config.modules=clone(this.sc.config_override.modules);raw.model.lists={lights:[],scenes:[],speakers:[],tvs:[]};}
      this.clock=clock(raw.ha.config.time_zone);this.base=now;
      this.assetBase=assetBase;if(this.sc.clock&&!explicitNow){const [h,m]=this.sc.clock.split(':').map(Number);this.base=this.clock.day(now,0,h,m);}
      this.elapsed=0;this.listeners=[];this.screenId=raw.manifest.this_screen[mode==='tv'?'android_tv':'web'];this.revision=1;this.seq=0;this.transitions=[];this.ramps=[];this.vacuum=null;this.playCache=new Map();this.bellFired=false;
      this.rawStates=Object.fromEntries(raw.ha.states.map(s=>[s.entity_id,s]));this.entities=raw.model.entities;this.roles=raw.model.config.roles;
      const weather=id=>typeof raw.scenarios[id].weather==='string'?weather(raw.scenarios[id].weather):raw.scenarios[id].weather;
      this.weather=this.walk(weather(this.scenario));this.states=Object.fromEntries(this.walk(raw.ha.states).map(s=>[s.entity_id,s]));
      this.commands=this.walk(raw.commands||{});this.calendars=this.walk(raw.calendars);this.todo=this.walk(raw.todo);this.admin=this.walk(raw.model);this.configureCore();this.hub=this.walk(raw.hub);this.replayExtensions();this.configureCore();this.applyScenario();this.decorateImages();this.timeline=this.walk(this.sc.timeline||[]);
    }
    now(){return this.base+this.elapsed;}
    schedule(t=this.now(),next=false){for(let off=next?0:-1;off<(next?8:1);off++){
      const dt=this.clock.day(t,off,12),p=this.clock.parts(dt),key=DAY[new Date(Date.UTC(p.year,p.month-1,p.day)).getUTCDay()],get=k=>(this.states||this.rawStates)[this.entities[k]]?.state;
      const [h,m]=String(get('wake_'+key.slice(0,3))||'06:45').split(':').map(Number),at=this.clock.day(t,off,h,m),armed=get('alarm_enabled')==='on'&&get('alarm_'+key.slice(0,3))==='on';
      if(next?(at>t&&armed):(at<=t&&off===0))return {at,day:key,crew:get('crew_'+key.slice(0,3))==='everyone'?this.raw.model.config.people.filter(p=>p.wakes).map(p=>p.id):[get('crew_'+key.slice(0,3))],armed};
      if(!next&&off===-1)this.previous={at,day:key,crew:[],armed};
    }return next?null:this.previous;}
    token(value,path=''){
      if(!value.startsWith('@'))return value;
      if(value==='@derived'){
        if(path.endsWith('next_rising'))return this.clock.iso(this.sunTimes().rise);
        if(path.endsWith('next_setting'))return this.clock.iso(this.sunTimes().set);
        if(path.endsWith('.day'))return this.schedule(this.now(),true)?.day||null;
        if(path.endsWith('.crew'))return this.schedule(this.now(),true)?.crew||[];
        if(path.endsWith('.state'))return this.schedule(this.now(),true)?this.clock.iso(this.schedule(this.now(),true).at):'unknown';
        return this.derivedLaunch();
      }
      if(value.startsWith('@scenario.')){const v=value.slice(10).split('.').reduce((o,k)=>o?.[k],{...this.sc,weather:this.weather});return v===undefined?null:this.walk(v,path);}
      const m=TOKEN.exec(value);if(!m){this.invalid=(this.invalid||[]).concat(value);return null;}
      const [,local,anchor,offsets,hh,mm]=m;let t=this.now();
      if(anchor==='lastwake')t=this.schedule(t,false)?.at||t;
      else if(anchor.startsWith('hour')){const p=this.clock.parts(t);t=this.clock.epoch({...p,minute:0,second:0})+Number(anchor.slice(4))*3600000;}
      else if(anchor==='today'||anchor==='tomorrow'||anchor.startsWith('day')){const n=anchor==='today'?0:anchor==='tomorrow'?1:Number(anchor.slice(3));t=this.clock.day(t,n,Number(hh||0),Number(mm||0));if(!hh&&!offsets)return this.clock.date(t);}
      if(hh&&!/^(today|tomorrow|day)/.test(anchor)){const p=this.clock.parts(t);t=this.clock.epoch({...p,hour:+hh,minute:+mm,second:0});}
      for(const [,sign,n,u]of offsets.matchAll(/([+-])(\d+)([dhms])/g))t+=(sign==='-'?-1:1)*Number(n)*{d:86400000,h:3600000,m:60000,s:1000}[u];
      return local?this.clock.local(t):this.clock.iso(t);
    }
    walk(v,path=''){return typeof v==='string'&&v.startsWith('@')?this.token(v,path):Array.isArray(v)?v.map((x,i)=>this.walk(x,path+'.'+i)):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,this.walk(x,path+'.'+k)])):v;}
    sunTimes(){
      const rad=Math.PI/180,lat=this.raw.ha.config.latitude*rad,lon=this.raw.ha.config.longitude;
      const calculate=offset=>{const at=this.clock.day(this.now(),offset),p=this.clock.parts(at),day=(Date.UTC(p.year,p.month-1,p.day)-Date.UTC(p.year,0,0))/86400000,g=2*Math.PI/365*(day-1),eq=229.18*(.000075+.001868*Math.cos(g)-.032077*Math.sin(g)-.014615*Math.cos(2*g)-.040849*Math.sin(2*g)),dec=.006918-.399912*Math.cos(g)+.070257*Math.sin(g)-.006758*Math.cos(2*g)+.000907*Math.sin(2*g)-.002697*Math.cos(3*g)+.00148*Math.sin(3*g),angle=Math.acos(Math.cos(90.833*rad)/(Math.cos(lat)*Math.cos(dec))-Math.tan(lat)*Math.tan(dec))/rad,noon=720-4*lon-eq,base=Date.UTC(p.year,p.month-1,p.day);return {rise:base+(noon-4*angle)*60000,set:base+(noon+4*angle)*60000};};
      const today=calculate(0),tomorrow=calculate(1);return {rise:today.rise>this.now()?today.rise:tomorrow.rise,set:today.set>this.now()?today.set:tomorrow.set};
    }
    configureCore(){if(!this.sc.config_override)return;
      this.admin.config.screens=this.admin.config.screens.map(s=>({...s,tv:this.roles.tvs.some(t=>t.media_player===s.tv)?s.tv:null}));
      const labels={comfort_schedule:'Add a thermostat',smart_comfort:'Add a thermostat',room_sensors:'Add room readings',cameras:'Add a camera',vacuum:'Add a robot vacuum',ai_brief:'Add an AI model',flight_plan:'Add an AI model',builder_desk:'Add a usage collector',learning:'Add Continue training',x_bin_day:'Add a community integration'};
      this.admin.integrations=this.admin.integrations.map(i=>({...i,status:this.admin.config.modules[i.id]?'on':'off',enabled:!!this.admin.config.modules[i.id],reason:null,summary:labels[i.id]||(i.id==='launch_alarm'?'Alarm and dawn on this screen':i.id==='goodnight'?'Sleep sound on this device':i.summary)}));
    }
    audioTargets(screens,quiet=false){if(quiet)return screens.filter(id=>this.raw.model.config.screens.find(s=>s.id===id)?.kind==='phone');const mode=this.roles.sleep_sound_on,targets=mode==='screens'?screens:mode?.startsWith('screen:')?[mode.slice(7)]:[];return targets.filter(id=>screens.includes(id)&&!(quiet&&this.raw.model.config.screens.find(s=>s.id===id)?.area===this.roles.bedroom));}
    derivedLaunch(){const next=this.schedule(this.now(),true),today=this.schedule(this.clock.day(this.now(),0,23,59),false),at=today?.at||this.now(),crew=today?.crew||['sam','riley'],quiet=crew.length===1,screens=this.sc.config_override?[this.screenId]:this.raw.model.config.screens.filter(s=>s.alarm&&(!quiet||s.area!==this.roles.bedroom||crew.includes(s.wakes_person))).map(s=>s.id);return {state:this.sc.launch_state||'idle',alarm_id:this.clock.local(at),seq:this.seq,test:false,launch_at:this.clock.iso(at),count_at:this.clock.iso(at-600000),deadline:this.clock.iso(at+1800000),deadline_reason:{kind:'window',minutes:30},crew,quiet,bedroom:quiet?'silent':'full',snoozes:0,can_snooze:true,screens,audio_screens:this.audioTargets(screens,quiet),up_at:null,sleep_scope:'house',back_to_bed:false,next_liftoff:next?this.clock.iso(next.at):null};}
    entityArea(id){const e=this.raw.ha.entities.find(e=>e.entity_id===id);return e?.area_id||this.raw.ha.devices.find(d=>d.id===e?.device_id)?.area_id||null;}
    alarmLights(ids){return ids.filter(id=>!this.launch.quiet||this.entityArea(id)!==this.roles.bedroom);}
    applyScenario(){
      this.launch={...this.derivedLaunch(),...this.walk(this.sc.launch||{})};this.launch.state=this.sc.launch_state||'idle';if(this.launch.state==='snoozed')this.launch.note=this.raw.simulation.snooze_note;this.setSetting('snooze_minutes',String(this.raw.simulation.snooze_minutes_in_demo),false);
      for(const [id,v]of Object.entries(this.sc.states||{}))if(this.states[id]&&!(this.launch.quiet&&id.startsWith('light.')&&this.entityArea(id)===this.roles.bedroom))this.states[id]={...this.states[id],...this.walk(v),attributes:{...this.states[id].attributes,...this.walk(v.attributes||{})}};
      if(this.states['weather.home'])this.states['weather.home']={...this.states['weather.home'],state:this.weather.current.condition,attributes:{...this.states['weather.home'].attributes,...this.weather.current,temperature_unit:'°F'},last_updated:this.clock.iso(this.now())};
      this.setSetting('sleep_mode',this.sc.sleep_mode?'on':'off',false);this.syncLaunch(false);
    }
    decorateImages(){const pictures={'camera.front_door':'front-door.svg','image.front_door_last_event':'front-door.svg','camera.driveway':'driveway.svg','image.driveway_last_event':'driveway.svg','image.robot_map':'robot-map.svg'};for(const [id,name]of Object.entries(pictures))if(this.states[id])this.states[id].attributes.entity_picture=new URL('stills/'+name,this.assetBase).href;}
    replayExtensions(){
      const calls=this.walk(this.raw.extensions?.calls||[]);
      for(const c of calls){const d=c.data;
        if(c.service==='register_integration'){const id='x_'+d.id;this.admin.integrations=this.admin.integrations.filter(i=>i.id!==id).concat({id,name:d.name,kind:'external',provider:c.provider,enabled:true,status:'on',summary:d.description,reason:null,uses:[],docs:null});}
        if(c.service==='post_line')this.postLine({...d,person:d.person||null,posted_at:c.at},false);
        if(c.service==='report_check'){this.admin.checks=this.admin.checks.filter(x=>x.source!==d.source||x.key!==d.key).concat({...d,action:d.action||null});}
      }
    }
    postLine(line,publish=true){this.admin.lines=this.admin.lines.filter(x=>x.source!==line.source||x.key!==line.key).concat(line);if(publish){const integration=this.admin.integrations.find(i=>i.id===line.source);if(integration?.kind==='external')integration.status=this.admin.config.modules[line.source]?'on':'off';this.changed();}}
    entityInfo(model){
      const ids=new Set(Object.values(model.lists||{}).flat()),refs=(value,into=ids)=>{if(typeof value==='string'&&/^[a-z_]+\.[a-z0-9_]+$/.test(value))into.add(value);else if(Array.isArray(value))value.forEach(v=>refs(v,into));else if(value&&typeof value==='object')Object.values(value).forEach(v=>refs(v,into));};
      refs(model.config.roles);model.config.screens.forEach(screen=>refs(screen.tv));
      const screen=model.config.screens.find(s=>s.id===this.screenId),roles=model.config.roles,display=new Set(),add=value=>refs(value,display);
      for(const key of ['weather','weather_feels_like','agenda_calendars','wake_rule_calendars','due','security'])add(roles[key]);
      if(['comfort_schedule','smart_comfort','room_sensors'].some(key=>model.config.modules[key]))for(const key of ['thermostat','thermostat_sensor','indoor_temperature'])add(roles[key]);
      if(model.config.modules.cameras)for(const key of ['cameras','doorbell'])add(roles[key]);
      if(model.config.modules.vacuum)for(const key of ['vacuum','vacuum_map'])add(roles[key]);
      if(screen?.area&&screen.area===roles.bedroom)for(const key of ['sleep_speaker','alarm_speaker'])add(roles[key]);
      const entities=new Map(this.raw.ha.entities.map(row=>[row.entity_id,row])),devices=new Map(this.raw.ha.devices.map(row=>[row.id,row])),result={};
      for(const id of ids){const e=entities.get(id)||{},st=this.states[id],base=this.admin.entity_info[id]||{},domain=id.split('.')[0],inScope=this.inScope(id)&&['light','switch','scene','media_player','remote','climate','vacuum'].includes(domain);if(!inScope&&!display.has(id))continue;
        let reason=inScope?null:'display_only';if(inScope&&domain==='scene'){const scene=this.raw.ha.scenes?.[id];if(!scene||scene.opaque||scene.readable===false||!scene.states||!Object.keys(scene.states).length)reason='scene_opaque';else if(Object.keys(scene.states).some(member=>!this.inScope(member)||!['light','switch','media_player'].includes(member.split('.')[0])))reason='out_of_scope';}
        result[id]={...base,name:e.name||st?.attributes?.friendly_name||base.name||id,domain,area_id:e.area_id||devices.get(e.device_id)?.area_id||null,platform:e.platform||null,controllable:reason===null,reason,...(domain==='scene'?{scene:{opaque:reason==='scene_opaque'}}:{})};
      }return result;
    }
    projectModel(model){
      const screen=model.config.screens.find(s=>s.id===this.screenId),visible=new Set(Object.keys(model.entity_info));
      for(const [key,values]of Object.entries(model.lists))model.lists[key]=screen?.control==='none'?[]:values.filter(id=>visible.has(id));
      model.entities=Object.fromEntries(Object.entries(model.entities).filter(([key])=>!key.startsWith('screen_')||key.startsWith('screen_'+this.screenId+'_')));
      const keep=new Set([...visible,...Object.values(model.entities),model.config.home.zone]),known=new Set([...this.raw.ha.entities.map(e=>e.entity_id),...Object.keys(this.states)]);
      const clean=value=>{if(Array.isArray(value))return value.filter(v=>typeof v!=='string'||!known.has(v)||keep.has(v)).map(clean);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!known.has(key)||keep.has(key)).map(([key,v])=>[key,clean(v)]));return typeof value==='string'&&known.has(value)&&!keep.has(value)?null:value;};
      return clean(model);
    }
    model(){const m=clone(this.admin);m.revision=this.revision;m.launch=clone(this.launch);m.hub&&delete m.hub.token;for(const p of m.config.people){delete p.notify;delete p.legacy_key;}for(const p of Object.values(m.people||{}))delete p.user_id;m.issues=(m.issues||[]).map(({key,severity})=>({key,severity}));const enabled=id=>m.config.modules[id]!==false;m.integrations=(m.integrations||[]).map(i=>({...i,enabled:enabled(i.id),status:enabled(i.id)?i.status:'off'}));m.lines=(m.lines||[]).filter(l=>enabled(l.source)&&(!l.until||Date.parse(l.until)>this.now()));m.checks=(m.checks||[]).filter(c=>c.person==null&&enabled(c.source)&&!(c.key==='porch_lights_late'&&this.states['switch.porch_string_lights']?.state==='off'));m.entity_info=this.entityInfo(m);delete m.scene_info;return this.projectModel(m);}
    info(){return {contract:3,contract_minor:0,version:'1.0.0',min_client:{web:'2.0.0',android:'2.0.0',apple:'2.0'},legacy_v2:false,principal:'screen',screen_id:this.screenId,pairing:true};}
    on(fn){this.listeners.push(fn);}emit(type,data){for(const fn of this.listeners)fn(type,clone(data));}
    changed(){this.revision++;this.emit('model',this.model());}
    set(id,state,attributes={},publish=true){const old=this.states[id];if(!old)return;const merged={...old.attributes,...attributes};if(old.state===String(state)&&JSON.stringify(merged)===JSON.stringify(old.attributes))return;this.states[id]={...old,state:String(state),attributes:{...old.attributes,...attributes},last_changed:this.clock.iso(this.now()),last_updated:this.clock.iso(this.now())};if(publish)this.emit('state_changed',{entity_id:id,old_state:old,new_state:this.states[id]});}
    setSetting(key,value,publish=true){this.set(this.entities[key],value,{},publish);}
    syncLaunch(publish=true){this.set(this.entities.launch_state,this.launch.state,{launch:this.launch},publish);this.admin.launch=this.launch;if(publish){this.emit('launch',this.launch);this.changed();}}
    event(action,extra={}){this.seq++;this.launch.seq=this.seq;this.emit('event',{v:3,action,alarm_id:this.launch.alarm_id,seq:this.seq,by:this.screenId,time_fired:this.clock.iso(this.now()),...this.launch,...extra});}
    inScope(id){const screen=this.admin.config.screens.find(s=>s.id===this.screenId),list=new Set([...Object.values(this.admin.lists).flat(),this.roles.thermostat,this.roles.vacuum,...this.roles.tvs.flatMap(t=>[t.media_player,t.remote,t.streamer]).filter(Boolean)]),ownTv=this.roles.tvs.filter(t=>t.media_player===screen?.tv).flatMap(t=>[t.media_player,t.remote,t.streamer]).filter(Boolean),audio=screen?.area===this.roles.bedroom?[this.roles.sleep_speaker,this.roles.alarm_speaker].filter(Boolean):[];return !!(screen&&screen.control!=='none'&&this.states[id]&&list.has(id)&&!this.roles.hidden.includes(id)&&(screen.control==='house'||ownTv.includes(id)||audio.includes(id)||(()=>{const e=this.raw.ha.entities.find(e=>e.entity_id===id);return screen.area!=null&&(e?.area_id||this.raw.ha.devices.find(d=>d.id===e?.device_id)?.area_id||null)===screen.area;})()));}
    readCommand(m){
      if(!this.inScope(m.entity_id))throw Object.assign(Error('Outside this screen’s controls'),{code:'policy_denied',reason:'out_of_scope'});
      let result=clone(this.commands[m.type]?.[m.entity_id]||null);if(!result)throw Object.assign(Error('Read unavailable'),{code:'not_supported'});
      if(m.type==='flightday/vacuum/rooms'){if(m.entity_id!==this.roles.vacuum)throw Error('Choose the robot vacuum');return result;}
      if(m.type==='flightday/media/browse'&&m.media_content_id){result=(result.children||[]).find(i=>i.media_content_id===m.media_content_id&&(!m.media_content_type||i.media_content_type===m.media_content_type));if(!result)throw Error('Media item unavailable');}
      for(const item of m.type.endsWith('/favorites')?result.items:[result,...(result.children||[])])if(m.type.endsWith('/favorites')||item.can_play)this.playCache.set(this.screenId+'|'+m.entity_id+'|'+item.media_content_type+'|'+item.media_content_id,{until:this.now()+600000,item});
      return result;
    }
    thermostatWrite(){
      if(this.lastThermostatWrite!=null&&this.now()-this.lastThermostatWrite<5000)throw Object.assign(Error('Please wait five seconds before another thermostat change.'),{code:'rate_limited'});
      this.lastThermostatWrite=this.now();
    }
    control({domain,service,target,data={}}){
      const screen=this.admin.config.screens.find(s=>s.id===this.screenId),ids=Array.isArray(target?.entity_id)?target.entity_id:[target?.entity_id];
      const allowed={light:['turn_on','turn_off','toggle'],switch:['turn_on','turn_off','toggle'],scene:['turn_on'],media_player:['media_play','media_pause','media_play_pause','media_next_track','media_previous_track','volume_set','volume_mute','turn_on','turn_off','select_source','play_media'],remote:['send_command','turn_on'],climate:['set_temperature','set_hvac_mode'],vacuum:['start','pause','return_to_base','locate','clean_rooms']};
      const inScope=id=>this.inScope(id);
      const deny=reason=>{throw Object.assign(Error(reason==='scene_opaque'?'Run this scene from Home Assistant':'This control is unavailable'),{code:'policy_denied',reason});};
      if(!allowed[domain]?.includes(service)||ids.some(id=>!(domain==='scene'?screen&&screen.control!=='none'&&this.admin.lists.scenes?.includes(id)&&!this.roles.hidden.includes(id):inScope(id))||!id.startsWith(domain+'.')))deny('out_of_scope');
      if(domain==='scene')for(const id of ids){const scene=this.raw.ha.scenes?.[id];if(!scene||scene.opaque||scene.readable===false||!scene.states||!Object.keys(scene.states).length)deny('scene_opaque');for(const member of Object.keys(scene.states))if(!inScope(member)||!['light','switch','media_player'].includes(member.split('.')[0]))deny('out_of_scope');}
      if(domain==='media_player'&&service==='play_media'&&ids.some(id=>(this.playCache.get(this.screenId+'|'+id+'|'+data.media_content_type+'|'+data.media_content_id)?.until||0)<=this.now()))deny('media_not_browsed');
      if(domain==='vacuum'&&service==='clean_rooms'){const rooms=this.commands['flightday/vacuum/rooms']?.[this.roles.vacuum];if(!rooms?.adapter)deny('no_adapter');if(!Array.isArray(data.rooms)||!data.rooms.length||data.rooms.some(id=>typeof id!=='string'||!rooms.rooms.some(r=>r.id===id)))deny('out_of_scope');}
      if(domain==='climate')this.thermostatWrite();
      for(const id of ids)this.simulate(domain,service,id,data);this.changed();return {};
    }
    simulate(domain,service,id,data){const s=this.states[id],a=s.attributes;
      if(domain==='scene'){for(const [entity,v]of Object.entries(this.raw.ha.scenes[id]?.states||{})){const domain=entity.split('.')[0];this.simulate(domain,['on','playing','idle'].includes(v.state)?'turn_on':'turn_off',entity,v);if(domain==='media_player')this.set(entity,this.states[entity].state,Object.fromEntries(Object.entries(v).filter(([k])=>['volume_level','source'].includes(k))));}return;}
      if(domain==='light'||domain==='switch'){const on=service==='toggle'?s.state!=='on':service==='turn_on',attrs=domain==='light'?{brightness:data.brightness_pct!=null?Math.round(Math.max(0,Math.min(100,data.brightness_pct))*2.55):data.brightness??a.brightness,color_temp_kelvin:a.min_color_temp_kelvin||2200}:{};this.ramps=this.ramps.filter(r=>r.id!==id);if(domain==='light'&&on){this.ramps.push({id,from:Number(a.brightness)||0,to:Number(attrs.brightness)||255,start:this.now(),duration:this.raw.simulation.light_transition_s*1000});attrs.brightness=Number(a.brightness)||0;}this.set(id,on?'on':'off',attrs);return;}
      if(domain==='climate'){if(service==='set_temperature'&&(!Number.isFinite(data.temperature)||data.temperature<a.min_temp||data.temperature>a.max_temp))throw Error('Invalid setpoint');if(service==='set_hvac_mode'&&!a.hvac_modes.includes(data.hvac_mode))throw Error('Invalid climate mode');this.set(id,service==='set_hvac_mode'?data.hvac_mode:s.state,service==='set_temperature'?{temperature:data.temperature}:{});return;}
      if(domain==='vacuum'){if(service==='pause'){if(this.vacuum){this.vacuum.paused=true;this.vacuum.pausedAt=this.now();}this.set(id,'paused');this.vacuumStatus('Paused');}else if(service==='return_to_base'){this.vacuum={start:this.now(),returning:true};this.set(id,'returning');this.vacuumStatus('Returning');}else if(service!=='locate'){if(this.vacuum?.paused){this.vacuum.start+=this.now()-this.vacuum.pausedAt;this.vacuum.paused=false;this.set(id,this.vacuum.returning?'returning':'cleaning');}else{this.vacuum={start:this.now(),paused:false,route:service==='clean_rooms'?data.rooms.map(id=>this.commands['flightday/vacuum/rooms'][this.roles.vacuum].rooms.find(r=>r.id===id).name):this.raw.simulation.vacuum.route};this.set(id,'cleaning');this.vacuumStatus('Cleaning · '+this.vacuum.route[0].replaceAll('_',' ').replace(/^./,s=>s.toUpperCase()));}}return;}
      if(domain==='media_player'){let state=s.state,attrs={};if(service==='media_play_pause')state=s.state==='playing'?'paused':'playing';else if(service==='media_play'||service==='play_media'){state='playing';if(service==='play_media'){const item=this.playCache.get(this.screenId+'|'+id+'|'+data.media_content_type+'|'+data.media_content_id)?.item;attrs={media_content_id:data.media_content_id,media_content_type:data.media_content_type,media_title:item?.title||a.media_title,media_position:0};}}else if(service==='media_pause')state='paused';else if(service==='turn_off')state='off';else if(service==='turn_on')state='idle';else if(service==='volume_set')attrs.volume_level=Math.max(0,Math.min(1,data.volume_level));else if(service==='volume_mute')attrs.is_volume_muted=!!data.is_volume_muted;else if(service==='select_source')attrs.source=data.source;this.set(id,state,attrs);return;}
    }
    vacuumStatus(status){const id=this.raw.ha.entities.find(e=>e.device_id===this.raw.ha.entities.find(x=>x.entity_id===this.roles.vacuum)?.device_id&&e.entity_id.endsWith('_status'))?.entity_id;if(id)this.set(id,status);else this.set(this.roles.vacuum,this.states[this.roles.vacuum].state,{status});}
    configUpdate({base_revision,patch}){
      if(base_revision!==this.revision)throw Object.assign(Error('Configuration changed'),{code:'revision_conflict'});
      if(Object.keys(patch||{}).some(k=>k!=='modules'))throw Error('Unsupported configuration patch');
      for(const [id,value]of Object.entries(patch.modules||{})){if(!(id in this.admin.config.modules)||typeof value!=='boolean')throw Error('Invalid integration');this.admin.config.modules[id]=value;}
      this.changed();return {revision:this.revision,model:this.model()};
    }
    action({action,data={}}){const active=['countdown','ringing','snoozed'].includes(this.launch.state),result=()=>({result:'ok',launch:clone(this.launch)});
      if(['comfort_resume','comfort_fresh_air_start','comfort_fresh_air_end','comfort_keep_open','comfort_dismiss','comfort_plan_skip','house_check_dismiss'].includes(action)){
        const fail=(code,message)=>{throw Object.assign(Error(message),{code});},screen=this.admin.config.screens.find(s=>s.id===this.screenId),thermostat=this.states[this.roles.thermostat];
        if(screen?.control!=='house')fail('policy_denied','House controls are unavailable');
        const fields={comfort_resume:[],comfort_fresh_air_start:[],comfort_fresh_air_end:[],comfort_keep_open:['minutes'],comfort_dismiss:['kind'],comfort_plan_skip:[],house_check_dismiss:['fid','days']}[action];
        if(Object.keys(data).some(k=>!fields.includes(k)))fail('invalid','Unexpected action field');
        if(action==='comfort_dismiss'&&!['not_today','just_off','keep_off','leave_it'].includes(data.kind)||action==='comfort_keep_open'&&data.minutes!==undefined&&(!Number.isInteger(data.minutes)||data.minutes<1||data.minutes>240)||action==='house_check_dismiss'&&(typeof data.fid!=='string'||! /^[A-Za-z0-9_.:-]{1,64}$/.test(data.fid)||!Number.isInteger(data.days)||data.days<1||data.days>30))fail('invalid','Invalid action data');
        if(!['comfort_dismiss','house_check_dismiss'].includes(action)){
          if(!thermostat||!this.inScope(this.roles.thermostat))fail('policy_denied','Thermostat unavailable');
          if(action!=='comfort_resume'&&thermostat.state==='off')fail('domain','Thermostat is Off. Tap Resume to hand it back to Smart Comfort.');
          this.thermostatWrite();
        }
        // Demo changes are session-only; never invoke a script or a platform bridge.
        this.comfort=this.comfort||{};
        if(action==='comfort_resume'){
          this.set(thermostat.entity_id,this.comfort.previousMode||'cool');this.comfort.state='auto';
        }else if(action==='comfort_fresh_air_start'){
          this.comfort.previousMode=thermostat.state;this.set(thermostat.entity_id,'off');this.comfort.state='fresh_air';
        }else if(action==='comfort_fresh_air_end')this.comfort.state='auto';
        else if(action==='comfort_keep_open')this.comfort.keepOpenUntil=this.now()+(data.minutes??60)*60000;
        else if(action==='comfort_plan_skip')this.comfort.plan='skipped';
        else if(action==='comfort_dismiss')this.comfort.dismissed=data.kind;
        else {this.dismissedFindings=this.dismissedFindings||{};this.dismissedFindings[data.fid]=this.now()+data.days*86400000;const sensor=this.states['sensor.house_check'];if(sensor)this.set(sensor.entity_id,sensor.state,{findings:(sensor.attributes.findings||[]).filter(f=>f.fid!==data.fid)});this.admin.checks=(this.admin.checks||[]).filter(c=>c.fid!==data.fid);}
        this.changed();return result();
      }
      if(action==='set'){if(!/^(?:(?:wake|alarm|bedtime|up_by|crew)_(?:mon|tue|wed|thu|fri|sat|sun)|alarm_enabled|sleep_sound|sleep_timer|sleep_volume|alarm_max_volume|briefing_hours|time_format|comfort_schedule|temp_night|temp_wake|temp_day|day_starts)$/.test(data.key)&&!['screen_'+this.screenId+'_night','screen_'+this.screenId+'_alarm'].includes(data.key))throw Object.assign(Error('This setting is unavailable'),{code:'policy_denied'});const id=this.entities[data.key],s=this.states[id];if(!s)throw Error('Unknown setting');const a=s.attributes;if(id.startsWith('time.')&&!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(data.value))throw Error('Invalid time');if(id.startsWith('switch.')&&typeof data.value!=='boolean')throw Error('Invalid switch value');if(id.startsWith('number.')&&(typeof data.value!=='number'||!Number.isFinite(data.value)))throw Error('Invalid number');if(a.options&&!a.options.includes(data.value)||typeof data.value==='number'&&(data.value<a.min||data.value>a.max))throw Error('Invalid setting');this.set(id,typeof data.value==='boolean'?(data.value?'on':'off'):data.value);this.changed();return result();}
      if(action==='test_alarm'){if(active||this.states[this.entities.sleep_mode]?.state==='on')return {result:'noop',launch:this.launch};this.launch={...this.derivedLaunch(),state:'countdown',test:true,screens:[this.screenId],deadline:this.clock.iso(this.now()+this.raw.simulation.alarm_preview_s*1000+1800000),launch_at:this.clock.iso(this.now()+this.raw.simulation.alarm_preview_s*1000),count_at:this.clock.iso(this.now()),alarm_id:this.clock.local(this.now())+'-preview'};this.launch.audio_screens=this.audioTargets(this.launch.screens);this.syncLaunch();this.event('launch_sequence',{duration_s:60});return result();}
      if(action==='goodnight'||action==='back_to_bed'){if(action==='back_to_bed'&&(this.launch.state!=='up'||this.clock.parts(this.now()).hour>=12))return {result:'noop',launch:this.launch};this.transitions.push({at:this.now()+this.raw.simulation.goodnight_delay_s*1000,run:()=>{const off=this.roles.goodnight_off,protectedIds=[...off.except,...this.roles.hidden,this.roles.sleep_speaker,this.roles.alarm_speaker];for(const [id,s]of Object.entries(this.states))if(!protectedIds.includes(id)&&((id.startsWith('light.')&&off.lights==='all')||off.switches.includes(id)))this.set(id,'off');if(off.media==='all')for(const id of this.admin.lists.speakers.concat(this.admin.lists.tvs))if(!protectedIds.includes(id))this.set(id,'off');this.setSetting('sleep_mode','on');const sound=data.sound||this.states[this.entities.sleep_sound]?.state,volume=Number(this.states[this.entities.sleep_volume]?.state)/100;this.set(this.roles.sleep_speaker,sound==='Off'?'off':'playing',{media_title:sound,volume_level:volume,is_volume_muted:false});this.launch={...this.launch,state:'idle',snoozes:0,sleep_scope:action==='back_to_bed'?'bedroom':data.scope||'house',back_to_bed:action==='back_to_bed'};this.setSetting('sleep_scope',this.launch.sleep_scope);const thermostat=this.states[this.roles.thermostat];if(this.states[this.entities.comfort_schedule]?.state==='on'&&thermostat&&thermostat.state!=='off')this.set(thermostat.entity_id,thermostat.state,{temperature:Number(this.states[this.entities.temp_night]?.state)||70});this.syncLaunch();const audioScreens=this.roles.sleep_sound_on==='screens'?this.admin.config.screens.filter(s=>s.alarm&&s.area&&s.area===this.roles.bedroom).map(s=>s.id):this.audioTargets(this.launch.screens);this.event(action,{scope:this.launch.sleep_scope,sound,sound_url:sound==='Off'?null:new URL('audio/demo-'+sound.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.wav',new URL('../../',this.assetBase)).href,audio_screens:audioScreens.length?audioScreens:this.roles.sleep_sound_on==='screens'?[this.screenId]:[],volume:volume*100,timer_min:data.timer_min??(Number(this.states[this.entities.sleep_timer]?.state)||0)});}});return result();}
      if(action==='wake_now'){this.setSetting('sleep_mode','off');if(active)return this.action({action:'up'});this.changed();this.event('wake_now');return result();}
      if(action==='set_override'){this.setSetting('wake_override',data.at||'unknown');this.changed();return result();}
      if(!active)return {result:'noop',launch:this.launch};
      if(action==='snooze'){if(this.launch.state==='snoozed')return {result:'noop',launch:this.launch};if(Date.parse(this.launch.deadline)-this.now()<60000)return {result:'denied',launch:this.launch};this.launch.state='snoozed';this.launch.snoozes++;this.launch.launch_at=this.clock.iso(Math.min(this.now()+this.raw.simulation.snooze_minutes_in_demo*60000,Date.parse(this.launch.deadline)));this.launch.count_at=this.clock.iso(this.now()+30000);this.launch.kind='relaunch';this.launch.note=this.raw.simulation.snooze_note;}
      else if(action==='up'||action==='scrub'){this.launch.state=action==='up'?'up':'scrubbed';this.launch.up_at=action==='up'?this.clock.iso(this.now()):null;if(action==='up')this.setSetting('sleep_mode','off');}
      else if(action==='advance'&&this.launch.state==='countdown'){const at=data.now?this.now()+10000:Math.max(this.now()+60000,Date.parse(this.launch.launch_at)-(data.minutes||1)*60000);this.launch.launch_at=this.clock.iso(Math.min(at,Date.parse(this.launch.launch_at)));}
      else throw Error('Unknown demo action');this.syncLaunch();this.event(action,action==='snooze'?{until:this.launch.count_at}:{});return result();
    }
    advance(ms){if(ms<=0)return;this.elapsed+=ms;
      for(const r of this.ramps){const p=Math.min(1,(this.now()-r.start)/r.duration);this.set(r.id,'on',{brightness:Math.round(r.from+(r.to-r.from)*p)});}this.ramps=this.ramps.filter(r=>this.now()<r.start+r.duration);
      const ready=this.transitions.filter(t=>t.at<=this.now());this.transitions=this.transitions.filter(t=>t.at>this.now());for(const t of ready)t.run();
      const climate=this.states[this.roles.thermostat];if(climate&&['heat','cool'].includes(climate.state)){const a=climate.attributes,delta=a.temperature-a.current_temperature;this.set(climate.entity_id,climate.state,{current_temperature:Number((a.current_temperature+Math.sign(delta)*Math.min(Math.abs(delta),this.raw.simulation.thermostat_drift_f_per_min*ms/60000)).toFixed(3))});}
      for(const id of this.admin.lists.speakers){const s=this.states[id];if(s?.state==='playing')this.set(id,s.state,{media_position:(Number(s.attributes.media_position)||0)+ms/1000});}
      if(['countdown','snoozed'].includes(this.launch.state)){
        if(this.launch.state==='snoozed'&&this.now()>=Date.parse(this.launch.count_at)){this.launch.state='countdown';this.syncLaunch();this.event('launch_sequence',{duration_s:30});}
        if(this.now()>=Date.parse(this.launch.launch_at)){this.launch.state='ringing';for(const id of this.alarmLights(this.roles.ring_lights))this.simulate('light','turn_on',id,{brightness:255});this.syncLaunch();this.event('wake');}
        else if(this.launch.state==='countdown')for(const id of this.alarmLights(this.roles.wake_lights))this.set(id,'on',{color_temp_kelvin:this.states[id].attributes.min_color_temp_kelvin||2200,brightness:Math.round(255*Math.max(0,Math.min(1,(this.now()-Date.parse(this.launch.count_at))/(Date.parse(this.launch.launch_at)-Date.parse(this.launch.count_at)))))});
      }
      if(this.vacuum&&!this.vacuum.paused){
        const v=this.vacuum,cfg=this.raw.simulation.vacuum,route=v.route||cfg.route,elapsed=(this.now()-v.start)/60000,total=v.returning?cfg.return_minutes:route.length*cfg.minutes_per_room+cfg.return_minutes;
        const used=Math.max(0,Math.min(ms/60000,total-Math.max(0,elapsed-ms/60000))),battery=this.raw.ha.entities.find(e=>e.entity_id.endsWith('_battery')&&e.device_id===this.raw.ha.entities.find(e=>e.entity_id===this.roles.vacuum)?.device_id)?.entity_id;
        if(battery)this.set(battery,Math.max(0,Number(this.states[battery].state)-cfg.battery_drop_per_min*used));
        if(elapsed>=total){this.set(this.roles.vacuum,'docked');this.vacuumStatus('Docked');this.vacuum=null;}
        else if(v.returning||elapsed>=route.length*cfg.minutes_per_room){if(!v.returning){v.returning=true;v.start+=route.length*cfg.minutes_per_room*60000;}this.set(this.roles.vacuum,'returning');this.vacuumStatus('Returning');}
        else this.vacuumStatus('Cleaning · '+route[Math.floor(elapsed/cfg.minutes_per_room)].replaceAll('_',' ').replace(/^./,s=>s.toUpperCase()));
      }
      for(const t of this.timeline)if(!this.bellFired&&this.now()>=Date.parse(t.at)){this.bellFired=true;this.set(this.roles.doorbell,this.clock.iso(this.now()),{event_type:t.fire.event_type});this.changed();}
    }
  }
  root.FDDemo={Engine,clock,TOKEN};
})(typeof window==='object'?window:globalThis);
