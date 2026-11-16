/* HA contract boundary. Legacy calls stay in data.js; screen writes never use HA services. */
(function () {
  'use strict';
  const FEATURES=Object.freeze({mediaReads:false,vacuumRooms:false});
  const O = window.OW, VERSION = '2.0.0', DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const wireKey=key=>key.replace(/^(wake|alarm|bedtime|up_by|crew)_(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/,(m,prefix,day)=>prefix+'_'+day.slice(0,3));
  const usable = s => !!s && !['unknown','unavailable'].includes(s.state);
  const numeric=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const number = s => usable(s) && s.state !== '' && Number.isFinite(+s.state) ? +s.state : null;
  const error = (code, message) => Object.assign(new Error(message), {code});
  const newer = (a, b) => { const x=String(a).split('.').map(Number), y=String(b).split('.').map(Number);for(let i=0;i<Math.max(x.length,y.length);i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0);}return false; };
  const bytes = v => new TextEncoder().encode(JSON.stringify(v)).length;
  const reasonText = r => {
    if(typeof r==='string')return O.time.inline(r);
    if(!r||typeof r!=='object')return '';
    if(['event','due'].includes(r.kind))return [r.title,Number.isFinite(Date.parse(r.at))?O.fmt.hm(r.at):'',Number.isFinite(r.lead_min)?'− '+r.lead_min+' min':''].filter(Boolean).join(' ');
    if(r.kind==='up_by')return 'up by ('+String(r.day||'day')+' setting)';
    if(r.kind==='window'&&Number.isFinite(r.minutes))return r.minutes+' min after wake';
    return 'Unknown deadline reason';
  };
  const isHouse = () => !O.onboardingBrowser?.active&&!O.config.get('ha.paired')&&(O.config.get('ha.flavor')==='house'||O.config.get('house')?.screens?.some(s=>s.legacy_id));
  // A page-session tracker survives HA reconnects. Only foreground input advances its clock.
  const presence={
    started:false,lastInput:null,
    foreground(){
      const android=!O.demo?.active&&(O.host?.available||!!window.flightdayNative||location.hostname==='appassets.androidplatform.net');
      if(!android)return document.visibilityState==='visible';
      try{const value=O.host?.foreground?.();return typeof value==='boolean'?value:null;}catch(_){return null;}
    },
    input(){
      if(O.data?.contract===2||presence.foreground()!==true)return;
      const now=performance.now();presence.lastInput=Number.isFinite(now)?now:null;
    },
    start(){
      if(this.started)return;this.started=true;
      for(const name of ['keydown','pointerdown','pointermove','pointerup','touchstart','touchmove','touchend'])window.addEventListener(name,this.input,{capture:true,passive:true});
      O.onNative?.(name=>{if(name==='input')presence.input();});
    },
    snapshot(){
      this.start();const foreground=this.foreground(),now=performance.now(),age=this.lastInput===null?null:now-this.lastInput;
      // An older native bridge cannot attest foreground. Omission keeps the server guard closed.
      if(foreground===null)return {last_input_s:null};
      return {foreground,last_input_s:age===null||!Number.isFinite(age)||age<0?null:Math.min(86400,Math.floor(age/1000))};
    }
  };
  class LegacyBackend {
    constructor(client){this.client=client;this.contract=2;this.kind='v2';}
    async open(hello){await this.client.p.onLegacyReady(hello);}
    call(action,data){return this.client.p.callLegacy(action,data);}
    service(...args){return this.client.p.svcLegacy(...args);}
  }
  class V3Backend {
    constructor(client){this.client=client;this.contract=3;this.kind='v3';}
    async open(){await this.client.openV3();}
    call(action,data){return this.client.callV3(action,data);}
    service(domain,service,id,data,fields){if(fields)return Promise.reject(error('policy_denied','Scripts are unavailable on paired screens'));return this.client.control(domain,service,id,data);}
  }
  class DemoBackend extends V3Backend { constructor(client){super(client);this.kind='demo';} }
  class Client {
    constructor(provider,options={}){this.features={...FEATURES,...options.features};this.mediaCache=new Map();this.favorites=new Map();this.objectUrls=new Set();this.gestureDepth=0;this.p=provider;this.contract=null;this.info=null;this.backend=null;this.epoch=0;this.events=new Map();this.launch=null;this.model=null;this.prefs=null;this.ready=false;this.readOnly=true;this.revision=-1;this.readSerial=0;this.credentials=O.screenCredentials?.create(this);}
    get version(){return /^\d+\.\d+/.test(O.host?.info?.version||'')?O.host.info.version:VERSION;}
    async ask(message,listener){
      if(this.info?.principal==='screen'&&!O.screenCommandAllowed(message))throw error('policy_denied','Paired screens use Flight Day commands');
      if(this.active===false&&this.contract!==null)throw error('closed','Connection changed');
      const epoch=this.epoch;let timer;
      try{const value=await Promise.race([this.p.send(message,listener),new Promise((_,reject)=>{timer=setTimeout(()=>reject(error('timeout','Home Assistant did not answer')),10000);})]);if(epoch!==this.epoch)throw error('closed','Connection changed');return value;}catch(e){if(this.info?.principal==='screen'&&['unauthorized','auth_invalid','invalid_auth','not_authenticated','repair_needed'].includes(e?.code)){this.disconnect();this.p.setStatus(false,e.code==='repair_needed'?'Pair this screen again':'This screen was removed from Flight Day');this.p.hub.emit('auth-required',{reason:e.code==='repair_needed'?'repair_needed':'removed',url:this.p.base,screen:this.model?.config.screens.find(s=>s.id===this.info.screen_id)});}throw e;}finally{clearTimeout(timer);}
    }
    async open(hello){
      const screenCredential=this.info?.principal==='screen'||O.onboardingNative?.credential?.principal==='screen'||O.config.get('ha.paired')===true;
      this.disconnect();this.active=true;this.ready=false;this.readOnly=true;this.contract=null;this.backend=null;this.revision=-1;this.model=null;
      let info;
      try{info=await this.ask({type:'flightday/info'});}catch(e){
        const absent=['unknown_command','not_found'].includes(e?.code);
        if(O.demo?.active && O.demo.fixture?.model?.contract===3 && (absent||e?.code==='not_supported')){
          const model=O.demo.fixture.model,screen=model.config.screens.find(s=>s.kind===O.mode);
          info={contract:3,principal:'screen',screen_id:screen?.id||null,min_client:{},demo:true};
        }else if(absent&&!screenCredential&&isHouse())info={contract:2};else throw e;
      }
      if(info?.contract===2 && !screenCredential && isHouse())this.backend=new LegacyBackend(this);
      else if(info?.contract===3&&['admin','user','screen'].includes(info.principal))this.backend=O.demo?.active?new DemoBackend(this):new V3Backend(this);
      else throw error('unsupported_contract','Update Flight Day');
      this.info=info;this.contract=this.backend.contract;
      if(this.contract===3)presence.start();
      if(this.contract===3)O.config.clearLegacyTvPsk?.();
      O.model.setConnection?.({contract:this.contract,screenId:this.contract===3?info.screen_id:null});
      const platform=O.host?.available?'android':'web';this.readOnly=this.contract===3&&(newer(info.min_client?.[platform]||'0',this.version)||(info.principal==='screen'&&!info.screen_id));
      await this.backend.open(hello);
      this.ready=true;this.p.status.contract=this.contract;this.p.hub.emit('client',this);
      this.heartbeat();this.heartbeatTimer=setInterval(()=>this.heartbeat(),60000);
      this.credentials?.maintain();
    }
    disconnect(){this.viewerUserId=null;this.mediaCache.clear();this.favorites.clear();this.roomList=null;this.roomEntity=null;for(const url of this.objectUrls)URL.revokeObjectURL(url);this.objectUrls.clear();this.active=false;this.epoch++;this.ready=false;clearInterval(this.heartbeatTimer);this.heartbeatTimer=null;}
    async heartbeat(){
      if(!this.ready||!this.p.status.connected)return;
      const a=O.app,state=a?.seq||a?.briefAlarm?'alarm':a?.night||a?.blackout?'night':a?.ambient?'ambient':'day';
      try{await this.ask({type:'flightday/screen/heartbeat',state,app_version:this.version,contract:this.contract,...(this.contract===3?presence.snapshot():{})});if(this.contract===3){await this.refreshReadings();await this.credentials?.maintain();if(this.currentSpeaker&&O.app?.ws==='house'&&this.featureReady('mediaReads')&&Date.now()-(this.favorites.get(this.currentSpeaker)?.at||0)>=600000)await this.openSpeakerCard(this.currentSpeaker).catch(()=>{});if((this.beats=(this.beats||0)+1)%5===0){await this.readCalendars();this.publish();}}}catch(_){/* v2 without the integration has no heartbeat receiver */}
    }
    async readStates(){
      const epoch=this.epoch,serial=++this.readSerial,rows=await this.ask({type:'get_states'});
      if(serial!==this.readSerial||epoch!==this.epoch)return;
      if(!Array.isArray(rows))throw error('invalid_model','Device readings are unavailable');
      this.p.states=this.projectStates(rows);
    }
    projectStates(rows){
      // HA exposes house states to screens. Keep projected entities, Flight Day settings
      // and the configured home location (public weather); none widens control lists.
      const screen=this.info?.principal==='screen',settings=new Set(Object.values(this.model?.entities||{})),zone=this.model?.config.home?.zone;
      return Object.fromEntries(rows.filter(s=>s&&typeof s.entity_id==='string'&&(!screen||Object.hasOwn(this.p.reg,s.entity_id)||settings.has(s.entity_id)||s.entity_id===zone)).map(s=>[s.entity_id,s]));
    }
    get hasEntityInfo(){return !!this.model&&Object.hasOwn(this.model,'entity_info');}
    permission(id){
      const entry=this.model?.entity_info?.[id];return {blocked:entry?.controllable!==true||entry?.reason!=null,reason:entry?.reason||'out_of_scope',copy:entry?.reason==='scene_opaque'?'Run this scene from Home Assistant':'View only on this screen'};
    }
    applyEntityInfo(){
      const info=this.model.entity_info,valid=!!info&&typeof info==='object'&&!Array.isArray(info);
      this.p.reg=Object.fromEntries(Object.entries(valid?info:{}).filter(([id,row])=>typeof row==='object'&&row!==null&&!Array.isArray(row)).map(([id,row])=>[id,{platform:typeof row.platform==='string'?row.platform:null,areaId:row.area_id||null,area:this.model.rooms?.[row.area_id]?.name||'',hidden:row.reason==='hidden',name:row.name,model:''}]));
      this.metadataReady=valid;this.p.states=this.projectStates(Object.values(this.p.states||{}));this.p.houseCheckDevices=[];O.model.registry=this.p.reg;
    }
    acceptModel(model){
      if(model?.contract!==3||model.config?.version!==1||!O.model.validateModules(model.config.modules)||!Array.isArray(model.config.people)||!O.model.validateScreens(model.config)||!model.config.roles||!model.entities||!model.lists||!Number.isSafeInteger(model.revision))throw error('unsupported_contract','Update Flight Day');
      if(model.revision<this.revision)return false;
      for(const key of ['integrations','lines','checks'])if(model[key]!=null&&!Array.isArray(model[key]))throw error('invalid_model','Flight Day model is unavailable');
      if(model.tvs_status!=null&&(typeof model.tvs_status!=='object'||Array.isArray(model.tvs_status)))throw error('invalid_model','TV status is unavailable');
      const tvs_status={};
      for(const tv of model.config.roles.tvs||[]){const value=model.tvs_status?.[tv.media_player]?.picture_off;if(value)tvs_status[tv.media_player]={picture_off:{configured:value.configured===true,owned:value.owned===true}};}
      this.checksAvailable=Array.isArray(model.checks);
      this.model={...model,tvs_status,config:O.model.normalizeConfig(model.config),integrations:model.integrations||[],lines:model.lines||[],checks:(model.checks||[]).filter(row=>row.person==null||this.info.principal!=='screen'&&!!this.viewerUserId&&model.people?.[row.person]?.user_id===this.viewerUserId)};
      // A screen projection never imports a shared secret, even from a broken server projection.
      if(this.info.principal==='screen'&&this.model.hub){this.model.hub={...this.model.hub};delete this.model.hub.token;}
      const own=model.screens?.[this.info.screen_id];
      if(this.info.principal==='screen'&&(own?.repair_needed||own?.state==='repair_needed')){this.disconnect();this.p.hub.emit('auth-required',{reason:'repair_needed',url:this.p.base,screen:this.model.config.screens.find(s=>s.id===this.info.screen_id)});throw error('repair_needed','Pair this screen again');}
      delete this.model.scene_info;
      if(this.hasEntityInfo&&this.info.principal==='screen'&&this.model.config.screens.find(s=>s.id===this.info.screen_id)?.control==='none')this.model.lists={...this.model.lists,lights:[],scenes:[],speakers:[],tvs:[]};
      this.applyEntityInfo();
      this.revision=model.revision;O.model.accept(this.model);
      this.p.haTimeZone=model.home?.time_zone||null;this.p.temperatureUnit=model.home?.units==='metric'?'°C':'°F';
      if(model.launch)this.acceptLaunch(model.launch);
      return true;
    }
    acceptLaunch(launch){
      if(!launch||typeof launch!=='object')return false;
      if(this.launch?.alarm_id===launch.alarm_id&&Number.isSafeInteger(this.launch.seq)&&Number.isSafeInteger(launch.seq)&&launch.seq<this.launch.seq)return false;
      this.launch={...launch,audio_screens:Array.isArray(launch.audio_screens)?launch.audio_screens:[],state:['idle','countdown','ringing','snoozed','up','scrubbed'].includes(launch.state)?launch.state:'unknown',crew:Array.isArray(launch.crew)?launch.crew:[],deadline_reason:launch.deadline_reason||null};if(this.model){this.model={...this.model,launch:this.launch};O.model.accept(this.model);}return true;
    }
    publish(){if(this.active!==false&&this.model){this.p.apply();this.p.hub.emit('model',this.model);}}
    receive(message){
      if(!message||!this.model)return;
      try{
        if(message.kind==='snapshot'){if(message.model)this.acceptModel(message.model);if(message.launch)this.acceptLaunch(message.launch);this.publish();}
        else if(message.kind==='model'){if(this.acceptModel(message.model)){this.publish();this.refreshReadings();}}
        else if(message.kind==='launch'){if(this.acceptLaunch(message.launch)){this.publish();this.refreshReadings();}}
        else if(message.kind==='event')this.event(message.event);
      }catch(_){this.readOnly=true;this.p.setStatus(true,'Update Flight Day');}
    }
    event(event){
      if(event?.v!==3||!Number.isSafeInteger(event.seq)||event.seq<0)return;
      if(this.launch?.alarm_id===event.alarm_id&&Number.isSafeInteger(this.launch.seq)&&event.seq<this.launch.seq)return;
      const key=event.alarm_id??'house',last=this.events.get(key);
      if(last!=null&&event.seq<=last)return;
      this.events.set(key,event.seq);if(this.events.size>128)this.events.delete(this.events.keys().next().value);
      if(!['launch_sequence','wake','snooze','snooze_denied','up','scrub','back_to_bed','goodnight','wake_now','ping'].includes(event.action))return;
      if(event.action==='ping')return;
      const same=this.launch?.alarm_id===event.alarm_id,previous=same?this.launch:{};
      const merged={...previous,...event,crew:Array.isArray(event.crew)?event.crew:previous.crew||[],deadline_reason:event.deadline_reason??previous.deadline_reason??null};
      if(['launch_sequence','goodnight'].includes(event.action))merged.audio_screens=Array.isArray(event.audio_screens)?event.audio_screens:[];
      const states={launch_sequence:'countdown',wake:'ringing',snooze:'snoozed',up:'up',scrub:'scrubbed'};
      if(states[event.action])this.acceptLaunch({...merged,state:states[event.action],...(event.action==='snooze'?{count_at:event.until}:{})});
      this.p.hub.emit('wall-event',merged);this.publish();this.refreshReadings();
    }
    async refreshReadings(){const epoch=this.epoch;try{await this.readStates();if(epoch===this.epoch)this.publish();}catch(_){/* retain the observed readings with their timestamps */}}
    async openV3(){
      this.acceptModel(await this.ask({type:'flightday/model'}));
      await this.readStates();
      this.p.wallEvents=true;this.p.setStatus(true,this.readOnly?'Update Flight Day · read only':'Flight Day v3');this.publish();
      const epoch=this.epoch;
      await this.ask({type:'flightday/subscribe',include:['model','launch','events']},m=>{if(epoch===this.epoch)this.receive(m);});
      try{const r=await this.ask({type:'flightday/screen/prefs/get'});this.prefs=this.validatePrefs(r?.prefs||{});this.p.hub.emit('screen-prefs',this.prefs);}catch(_){this.prefs=null;}
      try{this.p.mornings=await this.ask({type:'flightday/history/mornings',days:7});}catch(_){this.p.mornings=[];}
      await this.readCalendars();
      // The home location becomes available after states/model connect; keep the normal public fallback warm.
      await this.p.loadWeather();
      this.publish();
    }
    async readCalendars(){
      const epoch=this.epoch;
      const ids=[...new Set([...(this.model.config.roles.agenda_calendars||[]),...(this.model.config.roles.wake_rule_calendars||[]),...(this.model.config.roles.due||[])])].filter(id=>id.startsWith('calendar.')&&(this.info?.principal!=='screen'||!!this.p.reg[id]));
      const todoIds=this.info?.principal==='screen'?[]:this.model.config.roles.due.filter(id=>id.startsWith('todo.'));
      if(!ids.length&&!todoIds.length){this.p.haEvents=[];this.p.haDue=[];this.p.hub.state.events=[];this.p.hub.state.due=null;return;}
      const start=O.now();start.setHours(0,0,0,0);const end=new Date(+start+7*86400000),events=[],due=[];let received=0,todosReceived=0;
      for(const id of ids){try{const rows=await this.p.rest('calendars/'+encodeURIComponent(id)+'?start='+encodeURIComponent(start.toISOString())+'&end='+encodeURIComponent(end.toISOString()));
        if(epoch!==this.epoch)return;
        if(!Array.isArray(rows))throw error('invalid','Calendar unavailable');received++;const evidence=[];
        for(const e of rows){const rawStart=typeof e.start==='object'?e.start.dateTime||e.start.date:e.start,rawEnd=typeof e.end==='object'?e.end.dateTime||e.end.date:e.end,allDay=!/T/.test(rawStart||''),at=Date.parse(rawStart+(allDay?'T00:00:00':'')),until=Date.parse(rawEnd+(allDay?'T00:00:00':''));if(!Number.isFinite(at)||!Number.isFinite(until))continue;
          const base={id:id+'|'+rawStart+'|'+e.summary,calendar:id,start:at,end:until,allDay};evidence.push({...base,title:e.summary||'(busy)'});
          if(this.model.config.roles.due.includes(id)){const tag=/^\s*\[([^\]]+)\]\s*/.exec(e.summary||'');due.push({...base,at:allDay?until-60000:at,title:(e.summary||'').replace(/^\s*\[[^\]]+\]\s*/,''),course:tag?.[1]||'',raw:e.summary||''});}
          else if(this.model.config.roles.agenda_calendars.includes(id))events.push({...base,title:e.summary||'(busy)',where:(e.location||'').split(',')[0].slice(0,40),css:'#7aa2f7'});
        }
        this.p.calendarEvidence=this.p.calendarEvidence||{};this.p.calendarEvidence[id]={at:O.nowMs(),events:evidence};
      }catch(_){/* inaccessible calendar remains unavailable, never invented */}}
      // HA's read-only todo websocket endpoint (core/components/todo).
      for(const id of todoIds)try{const response=await this.ask({type:'todo/item/list',entity_id:id});if(!Array.isArray(response?.items))continue;todosReceived++;for(const item of response.items){if(item.status==='completed'||!item.due)continue;const allDay=/^\d{4}-\d\d-\d\d$/.test(item.due),at=Date.parse(item.due+(allDay?'T23:59:00':''));if(Number.isFinite(at)){const tag=/^\s*\[([^\]]+)\]\s*/.exec(item.summary||'');due.push({id:id+'|'+item.uid,calendar:id,title:(item.summary||'').replace(/^\s*\[[^\]]+\]\s*/,''),course:tag?.[1]||'',at,start:at,allDay,raw:item.summary});}}}catch(_){}
      if(epoch!==this.epoch)return;
      if(!received&&!todosReceived){this.p.hub.state.calendar={available:false,count:0};return;}
      this.p.haEvents=events;this.p.haDue=due;this.p.hub.state.events=events.sort((a,b)=>a.start-b.start);this.p.hub.state.due=due.length?due.sort((a,b)=>a.at-b.at):null;this.p.hub.state.calendar={available:!!received,count:events.length,partial:received!==ids.length};
    }
    setting(key){return this.p.states[this.model?.entities?.[wireKey(key)]];}
    decorateUI(){
      if(this.contract!==3||!this.model)return;
      const s=this.p.hub.state,st=key=>this.setting(key),on=key=>st(key)?.state==='on',clock=key=>O.sleepSchedule.time(st(key)?.state),connected=this.p.status.connected;
      const days=DAYS.map(key=>({key,name:key[0].toUpperCase()+key.slice(1),short:key.slice(0,3),time:clock('wake_'+key),bedtime:clock('bedtime_'+key),crew:st('crew_'+key)?.state||'everyone',upBy:clock('up_by_'+key)||'00:00',on:on('alarm_'+key)})).filter(d=>d.time);
      let target=null;const n=O.now(),js=['sunday',...DAYS.slice(0,6)];
      for(let off=0;off<8&&!target;off++){const date=new Date(n.getFullYear(),n.getMonth(),n.getDate()+off),day=days.find(d=>d.key===js[date.getDay()]);if(!day)continue;const [h,m]=day.time.split(':').map(Number);date.setHours(h,m,0,0);if(+date>+n+60000)target={...day,at:+date,offset:off,label:off===0?'Today':off===1?'Tomorrow':day.name};}
      const override=usable(st('wake_override'))?Date.parse(st('wake_override').state):NaN;
      if(target&&override>+n&&new Date(override).toDateString()===new Date(target.at).toDateString())target={...target,at:override,time:O.fmt.time24(override),override:true};
      const speaker=this.p.states[O.roles.get('sleep_speaker')],vol=speaker?.attributes?.volume_level,launch=this.launch||{},scope=st('sleep_scope')?.state||launch.sleep_scope;
      s.launch={days,master:on('alarm_enabled'),target,time:target?.time||days[0]?.time||null,enabled:!!(on('alarm_enabled')&&target?.on),sleeping:on('sleep_mode')&&(scope!=='bedroom'||O.model.isBedroom()),backToBed:!!launch.back_to_bed,firing:false,scrubbed:false,alarm:launch,
        snoozeMinutes:number(st('snooze_minutes'))??10,snoozeWindow:number(st('snooze_window'))??30,readyLead:number(st('ready_lead'))??45,
        phones:Object.fromEntries(this.model.config.people.map(p=>[p.id,!!this.model.people?.[p.id]?.phone_ready])),muted:!!speaker?.attributes?.is_volume_muted,mornings:this.p.mornings||[],scheduleLog:[],sound:usable(st('sleep_sound'))?st('sleep_sound').state:null,sounds:st('sleep_sound')?.attributes?.options||[],volume:vol!=null?Math.round(vol*100):null,nightVolume:number(st('sleep_volume')),volMin:st('sleep_volume')?.attributes?.min??0,volMax:st('sleep_volume')?.attributes?.max??100,volStep:st('sleep_volume')?.attributes?.step??1,scripts:!!this.model.config.modules.goodnight,events:true,alarmMax:number(st('alarm_max_volume')),audioAdapterVol:vol!=null?Math.round(vol*100):null};
      s.sleepSchedule={days:DAYS.map(key=>{const d=days.find(d=>d.key===key);return {key,name:key[0].toUpperCase()+key.slice(1),wake:d?.time||null,bedtime:d?.bedtime||null,enabled:!!d?.on,ready:!!connected&&!!d?.time&&!!d?.bedtime&&['on','off'].includes(st('alarm_'+key)?.state)};}),connected,weekdaysDiffer:days.slice(0,5).some(d=>[d.time,d.bedtime,d.on].join('|')!==[days[0]?.time,days[0]?.bedtime,days[0]?.on].join('|')),overrideAt:Number.isFinite(override)?override:null,overrideReady:!!connected&&!!st('wake_override')};
      const time=st('time_format'),hours=st('briefing_hours');s.timeFormat={value:['12h','24h','both'].includes(time?.state)?time.state:'12h',available:!!connected&&usable(time)};s.briefing={hours:['1','2','3','noon'].includes(hours?.state)?hours.state:'2',available:!!connected&&usable(hours)};
      if(s.climate){const c=s.climate;for(const period of ['night','wake','day']){const row=st('temp_'+period),a=row?.attributes||{},from=a.unit_of_measurement||c.unit,toF=v=>O.climate.convert(v,from,'°F'),value=number(row),min=numeric(a.min),max=numeric(a.max),step=numeric(a.step);c[period]={temperatureF:toF(value),minF:toF(min),maxF:toF(max),stepF:step==null?null:from==='°C'?step*9/5:step,ready:!!connected&&value!=null&&min!=null&&max!=null&&min<=value&&value<=max&&step>0};}c.comfort={enabled:on('comfort_schedule'),ready:!!connected&&['on','off'].includes(st('comfort_schedule')?.state),period:['night','wake','day'].includes(st('comfort_status')?.state)?st('comfort_status').state:null,dayTime:clock('day_starts'),timeReady:!!connected&&!!clock('day_starts')};}
      s.scenes=(s.scenes||[]).filter(sc=>!sc.ha||sc.id.startsWith('scene.')).map(sc=>{const p=this.permission(sc.id);return sc.ha?{...sc,name:this.model.entity_info?.[sc.id]?.name||sc.name,blocked:p.blocked,blockedReason:p.blocked?p.copy:null}:sc;});
      s.audioAdapter=(this.model.lists.speakers||[]).map(id=>this.p.states[id]).filter(Boolean).map(st=>({id:st.entity_id,name:st.attributes?.friendly_name||'Speaker',model:st.attributes?.friendly_name||'Speaker',kind:'speaker',state:['playing','paused','idle','off','unavailable'].includes(st.state)?st.state:'unknown',volume:st.attributes?.volume_level!=null?Math.round(st.attributes.volume_level*100):null}));if(!s.audioAdapter.length)s.audioAdapter=null;
      const favorite=this.model.lists.speakers?.includes(this.currentSpeaker)?this.favorites.get(this.currentSpeaker):null,freshFavorite=favorite&&Date.now()-favorite.at>=0&&Date.now()-favorite.at<600000;s.favorites=freshFavorite?favorite.value.items.map(item=>({id:item.media_content_id,name:item.title,kind:item.media_content_type,player:this.currentSpeaker,thumbnail:item.thumbnailUrl||null})):null;s.favoriteStatus=this.favoriteStatus||{state:'unavailable',message:this.features.mediaReads === true?'Open a speaker to load favourites':'Favourites unavailable · browsing support is not enabled'};
      if(s.robotVacuum){const roomList=this.roomEntity===this.model.config.roles.vacuum?this.roomList:null;s.robotVacuum.rooms=roomList?.rooms||[];s.robotVacuum.roomsReady=!!roomList?.adapter&&!!roomList.rooms.length;s.robotVacuum.hideRoomCleaning=roomList?.adapter===null;s.robotVacuum.roomsUnavailableReason=this.roomStatus?.message||'Room cleaning unavailable · discovery is not enabled';}
      if(this.info.principal==='screen'){const known=id=>!!this.p.reg[id];s.lights=s.lights?.filter(row=>known(row.id))||null;s.scenes=s.scenes?.filter(row=>!row.ha||known(row.id))||null;s.audioAdapter=s.audioAdapter?.filter(row=>known(row.id))||null;if(s.nowPlaying&&!known(s.nowPlaying.id))s.nowPlaying=null;if(s.climate&&!known(s.climate.id))s.climate=null;if(s.robotVacuum&&!known(this.model.config.roles.vacuum))s.robotVacuum=null;if(s.tv&&!known(s.tv.id))s.tv=null;if(s.bedroomTv&&!known(s.bedroomTv.id))s.bedroomTv=null;if(s.handoff&&!known(s.handoff.id))s.handoff=null;if(s.cameras)s.cameras=s.cameras.filter(row=>known(row.id));if(s.security&&!known(this.model.config.roles.security))s.security=null;const role=this.model.config.roles,comfortOn=['comfort_schedule','smart_comfort','room_sensors'].some(key=>this.model.config.modules[key]);if(!comfortOn||![role.thermostat,role.thermostat_sensor,...(role.indoor_temperature||[]).flatMap(row=>[row.temperature,row.humidity])].some(known))s.smartComfort=null;if(s.camEvents)s.camEvents=s.camEvents.filter(row=>known(row.id));const visible=row=>!row.calendar||!/^(calendar|todo)\./.test(row.calendar)||known(row.calendar);if(s.events)s.events=s.events.filter(visible);if(s.due)s.due=s.due.filter(visible);}
      if(this.info.principal==='screen'&&!this.metadataReady){s.lights=null;s.scenes=null;s.audioAdapter=null;s.nowPlaying=null;s.climate=null;s.robotVacuum=null;s.tv=null;s.bedroomTv=null;s.handoff=null;s.cameras=null;}
      if(this.hasEntityInfo){const decorate=row=>{if(!row?.id)return row;const p=this.permission(row.id);return {...row,name:this.model.entity_info?.[row.id]?.name||row.name,controllable:!p.blocked,blocked:p.blocked,blockedReason:p.blocked?p.copy:null};};for(const key of ['lights',"audioAdapter"])if(Array.isArray(s[key]))s[key]=s[key].map(decorate);for(const key of ['climate',"robotVacuum",'tv','bedroomTv','nowPlaying','handoff'])if(s[key])s[key]=decorate(s[key]);}
      s.integrations=this.model.integrations;s.lines=this.model.lines;s.checks=this.model.checks;
    }
    requireWrite(){if(!this.ready||!this.p.status.connected)throw error('offline','Home Assistant is offline');if(this.readOnly)throw error('update_required','Update Flight Day · read only');}
    async action(action,data={}){
      this.requireWrite();
      const fields={goodnight:['sound','timer_min','scope'],snooze:[],up:[],scrub:[],advance:['minutes','now'],back_to_bed:[],wake_now:[],set_override:['at'],test_alarm:['seconds','screens'],set:['key','value'],comfort_resume:[],comfort_fresh_air_start:[],comfort_fresh_air_end:[],comfort_keep_open:['minutes'],comfort_dismiss:['kind'],comfort_plan_skip:[],house_check_dismiss:['fid','days']}[action];if(!fields)throw error('policy_denied','This action is unavailable');data=Object.fromEntries(fields.filter(k=>data[k]!==undefined).map(k=>[k,data[k]]));
      if(action==='set'&&this.info.principal==='screen'){const key=data.key,own='screen_'+this.info.screen_id;const valid=/^(wake|alarm|bedtime|up_by|crew)_(mon|tue|wed|thu|fri|sat|sun)$/.test(key)||['alarm_enabled','sleep_sound','sleep_timer','sleep_volume','alarm_max_volume','briefing_hours','time_format','comfort_schedule','temp_night','temp_wake','temp_day','day_starts',own+'_night',own+'_alarm'].includes(key);if(!valid)throw error('policy_denied','This setting is unavailable on this screen');}
      if(['comfort_resume','comfort_fresh_air_start','comfort_fresh_air_end','comfort_keep_open','comfort_plan_skip'].includes(action)){
        if(!this.gestureDepth)throw error('policy_denied','Use the Comfort controls to change this setting');
        if(action!=='comfort_resume'&&this.p.states[this.model.config.roles.thermostat]?.state==='off')throw error('domain','Thermostat is Off. Tap Resume to hand it back to Smart Comfort.');
        this.thermostatWrite();
      }
      let result;
      try{result=await this.ask({type:'flightday/action',action,data});}
      catch(e){if(e.code==='rate_limited'||e.reason==='rate_limited')throw error('rate_limited','Please wait five seconds before another thermostat change.');if(e.reason==='domain'||e.code==='domain')throw error('domain','Thermostat is Off. Tap Resume to hand it back to Smart Comfort.');throw e;}
      if(result?.launch){this.acceptLaunch(result.launch);this.publish();}
      if(result?.result==='denied')throw error('denied','The house declined this action');
      await this.refreshReadings();return result;
    }
    thermostatWrite(){
      if(this.lastClimateWrite!=null&&Date.now()-this.lastClimateWrite<5000)throw error('rate_limited','Please wait five seconds before another thermostat change.');
      this.lastClimateWrite=Date.now();
    }
    async set(key,value){key=wireKey(key);if(!this.model.entities[key])throw error('unavailable','This setting is unavailable');return this.action('set',{key,value});}
    async control(domain,service,entity,data={}){
      this.requireWrite();
      if(domain==='flightday'&&service==='tv_picture'){if(entity!=null||Object.keys(data).some(k=>k!=='on'))throw error('invalid','Picture control uses this screen’s own TV');return this.tvPicture(data.on);}
      if(this.info.principal==='screen'&&!this.metadataReady)throw error('policy_denied','Device controls are unavailable without screen metadata');
      const ids=Array.isArray(entity)?entity:[entity];if(!ids.length||ids.some(id=>typeof id!=='string'))throw error('invalid','Choose a device');
      const allowed={light:['turn_on','turn_off','toggle'],switch:['turn_on','turn_off','toggle'],scene:['turn_on'],media_player:['media_play','media_pause','media_play_pause','media_next_track','media_previous_track','volume_set','volume_mute','turn_on','turn_off','select_source','play_media'],remote:['send_command','turn_on'],climate:['set_temperature','set_hvac_mode'],vacuum:['start','pause','return_to_base','locate','clean_rooms']};
      if(!allowed[domain]?.includes(service))throw error('policy_denied','This control is unavailable');
      const role=this.model.config.roles,screen=this.model.config.screens.find(s=>s.id===this.info.screen_id),lists=Object.values(this.model.lists||{}).flat();
      if(ids.some(id=>role.hidden.includes(id)))throw error('policy_denied','This device is hidden');
      if(this.info.principal==='screen'){
        if(this.hasEntityInfo&&ids.some(id=>this.permission(id).blocked)){const p=this.permission(ids.find(id=>this.permission(id).blocked));throw Object.assign(error('policy_denied',p.copy),{reason:p.reason});}
        if(ids.some(id=>!this.p.reg[id]))throw error('policy_denied','Device metadata is unavailable');
        if(!screen||!['room','house'].includes(screen.control))throw error('policy_denied','Controls are off for this screen');
        const ownTv=role.tvs.filter(tv=>tv.media_player===screen.tv).flatMap(tv=>[tv.media_player,tv.remote,tv.streamer]).filter(Boolean),ownAudio=screen.area&&screen.area===role.bedroom?[role.sleep_speaker,role.alarm_speaker].filter(Boolean):[];
        const allRole=[role.thermostat,role.vacuum,...role.tvs.flatMap(t=>[t.media_player,t.remote,t.streamer])].filter(Boolean);
        if(ids.some(id=>screen.control==='house'?![...lists,...allRole].includes(id):![...ownTv,...ownAudio].includes(id)&&!(screen.area&&this.p.reg[id]?.areaId===screen.area&&[...lists,...allRole].includes(id))))throw error('policy_denied','This device is outside this screen’s controls');
      }
      if(domain==='climate'&&ids.some(id=>id!==role.thermostat)||domain==='vacuum'&&ids.some(id=>id!==role.vacuum)||domain==='switch'&&ids.some(id=>!this.model.lists?.lights?.includes(id))||domain==='remote'&&ids.some(id=>!role.tvs.some(t=>t.remote===id)))throw error('policy_denied','This device is outside its role');
      for(const id of ids){const p=this.permission(id);if(p.blocked)throw Object.assign(error('policy_denied',p.copy),{reason:p.reason});}
      if(this.info.principal==='screen'&&domain==='remote'&&screen.control==='room'&&ids.some(id=>!role.tvs.some(tv=>tv.media_player===screen.tv&&tv.remote===id)))throw error('policy_denied','This remote is outside this screen’s controls');
      if(this.info.principal==='screen'&&domain==='media_player'&&ids.some(id=>this.isMediaGroup(id)))throw error('policy_denied','Player groups are unavailable on paired screens');
      const clean={...data};if(domain==='light')for(const key of Object.keys(clean))if(!['brightness_pct','transition'].includes(key))delete clean[key];
      if(domain==='media_player'&&service==='play_media'&&ids.some(id=>!this.cachedMedia(id,clean.media_content_type,clean.media_content_id)))throw error('media_not_browsed','Open this speaker’s favourites before playing');
      if(domain==='vacuum'&&service==='clean_rooms'){this.requireFeature('vacuumRooms');if(this.roomEntity!==role.vacuum||!this.roomList?.adapter||!Array.isArray(clean.rooms)||!clean.rooms.length||clean.rooms.some(id=>typeof id!=='string'||!this.roomList.rooms.some(r=>r.id===id))||Object.keys(clean).some(k=>k!=='rooms'))throw error('no_adapter','Choose a room from this vacuum’s current list');}
      if(this.info.principal==='screen'&&domain==='climate'){if(!this.gestureDepth)throw error('policy_denied','Use the thermostat controls to change this setting');this.thermostatWrite();}
      const result=this.info.principal==='screen'?await this.ask({type:'flightday/control',domain,service,target:{entity_id:entity},data:clean}):await this.ask({type:'call_service',domain,service,target:{entity_id:entity},service_data:clean});
      await this.refreshReadings();return result;
    }
    pictureStatus(){
      const screen=this.model?.config.screens.find(s=>s.id===this.info?.screen_id),role=this.model?.config.roles;
      const tv=role?.tvs.find(t=>t.media_player===screen?.tv&&t.extras?.includes("tvAdapter_picture_off"));
      if(this.contract!==3||this.info?.principal!=='screen'||!tv||role.hidden.includes(tv.media_player))return null;
      const status=this.model.tvs_status?.[tv.media_player]?.picture_off;
      return {configured:status?.configured===true,owned:status?.owned===true};
    }
    async tvPicture(on,{idle=false}={}){
      this.requireWrite();
      if(typeof on!=='boolean')throw error('invalid','Choose Picture on or off');
      const screen=this.model.config.screens.find(s=>s.id===this.info.screen_id),status=this.pictureStatus();
      if(!status||!['room','house'].includes(screen.control))throw error('policy_denied','Picture control is unavailable for this screen');
      if(!status.configured)throw error('unavailable',"Add the TV's pre-shared key in Home Assistant · Flight Day options");
      if(on&&!this.gestureDepth)throw error('policy_denied','Use the night controls to show the picture');
      const now=Date.now();
      if(idle&&(on||this.lastPictureWrite!=null&&now-this.lastPictureWrite<20000))return false;
      // Record failures too: cosmetic errors never start a retry loop.
      this.lastPictureWrite=now;
      try{return await this.ask({type:'flightday/control',domain:'flightday',service:'tv_picture',data:{on}});}
      catch(e){if(!on&&e.code==='launch_active')return false;throw e;}
    }
    userGesture(fn){this.gestureDepth++;try{return fn();}finally{this.gestureDepth--;}}
    featureReady(key){return this.info?.principal!=='screen'||this.backend?.kind==='demo'||this.features[key]===true;}
    requireFeature(key){if(!this.featureReady(key))throw error('unavailable',key==='mediaReads'?'Favourites unavailable · browsing support is not enabled':'Room cleaning unavailable · discovery is not enabled');}
    readScope(entity){
      if(!this.ready||!this.p.status.connected)throw error('offline','Home Assistant is offline');
      if(typeof entity!=='string')throw error('invalid','Choose a device');
      if(this.info.principal!=='screen')return;
      if(!this.metadataReady||!this.p.reg[entity])throw error('out_of_scope','Device controls are unavailable without screen metadata');
      const role=this.model.config.roles,screen=this.model.config.screens.find(s=>s.id===this.info.screen_id),lists=Object.values(this.model.lists).flat();
      if(!screen||!['house','room'].includes(screen.control)||role.hidden.includes(entity))throw error('out_of_scope','This device is outside this screen’s controls');
      const tvs=role.tvs.flatMap(t=>[t.media_player,t.remote,t.streamer]).filter(Boolean),eligible=[...lists,role.thermostat,role.vacuum,...tvs];
      const ownTv=role.tvs.filter(t=>t.media_player===screen.tv).flatMap(t=>[t.media_player,t.remote,t.streamer]),audio=screen.area&&screen.area===role.bedroom?[role.sleep_speaker,role.alarm_speaker]:[];
      if(screen.control==='house'?eligible.includes(entity):ownTv.includes(entity)||audio.includes(entity)||screen.area&&this.p.reg[entity]?.areaId===screen.area&&eligible.includes(entity))return;
      throw error('out_of_scope','This device is outside this screen’s controls');
    }
    isMediaGroup(entity){const members=this.p.states[entity]?.attributes?.group_members;return Array.isArray(members)&&members.length>1||['group','universal'].includes(this.p.reg[entity]?.platform);}
    rememberMedia(entity,items){const cache=this.mediaCache.get(entity)||new Map(),at=Date.now();for(const item of items)if(typeof item.media_content_id==='string'&&typeof item.media_content_type==='string')cache.set(item.media_content_type+'\0'+item.media_content_id,{item,at});this.mediaCache.set(entity,cache);}
    cachedMedia(entity,type,id){const record=this.mediaCache.get(entity)?.get(type+'\0'+id),age=record?Date.now()-record.at:Infinity;return !!record&&age>=0&&age<600000;}
    async browseMedia(entity,options={}){
      this.requireFeature('mediaReads');this.readScope(entity);if(!entity.startsWith('media_player.'))throw error('invalid','Choose a speaker');
      const epoch=this.epoch,message={type:'flightday/media/browse',entity_id:entity};for(const key of ['media_content_type','media_content_id'])if(options[key]!=null)message[key]=options[key];
      const result=await this.ask(message);if(epoch!==this.epoch)throw error('closed','Connection changed');this.readScope(entity);
      if(!result||!Array.isArray(result.children))throw error('invalid','Media browsing is unavailable');
      const value={...result,children:result.children.slice(0,200),truncated:!!result.truncated||result.children.length>200};
      this.rememberMedia(entity,[value,...value.children].filter(item=>item?.can_play===true));return value;
    }
    async thumbnail(proxyPath){
      if(typeof proxyPath!=='string'||!proxyPath.startsWith('/api/'))return null;
      const base=new URL(this.p.base),url=new URL(proxyPath,base);if(url.origin!==base.origin)return null;
      if(this.info?.principal==='screen'&&!/^\/api\/(?:media_player_proxy|image|image_proxy|camera_proxy)\//.test(decodeURIComponent(url.pathname)))return null;
      const epoch=this.epoch,ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),10000);
      try{const response=await fetch(url.href,{headers:{Authorization:'Bearer '+this.p.token},cache:'no-store',credentials:'omit',redirect:'error',signal:ctl.signal});if(!response.ok)return null;const blob=await response.blob();if(epoch!==this.epoch)return null;const objectUrl=URL.createObjectURL(blob);this.objectUrls.add(objectUrl);return objectUrl;}catch(_){return null;}finally{clearTimeout(timer);}
    }
    async getFavorites(entity,force=false){
      this.requireFeature('mediaReads');this.readScope(entity);if(!entity.startsWith('media_player.'))throw error('invalid','Choose a speaker');
      const cached=this.favorites.get(entity),age=cached?Date.now()-cached.at:Infinity;if(!force&&age>=0&&age<600000)return cached.value;
      const epoch=this.epoch,result=await this.ask({type:'flightday/media/favorites',entity_id:entity});if(epoch!==this.epoch)throw error('closed','Connection changed');this.readScope(entity);
      if(!result||!Array.isArray(result.items)||!result.items.every(item=>typeof item.title==='string'&&typeof item.media_content_id==='string'&&typeof item.media_content_type==='string'))throw error('invalid','Favourites are unavailable');
      const value={...result,items:result.items.slice(0,200),truncated:!!result.truncated||result.items.length>200};this.rememberMedia(entity,value.items);
      this.favorites.set(entity,{value,at:Date.now()});return value;
    }
    async openSpeakerCard(entity){
      this.currentSpeaker=entity;this.favoriteStatus={state:'loading',message:'Loading favourites…'};this.publish();
      try{const result=await this.getFavorites(entity);this.favoriteStatus={state:'ready',message:result.items.length?'':'No favourites found'};this.publish();
        const epoch=this.epoch;await Promise.allSettled(result.items.slice(0,12).map(async item=>{if(item.thumbnail&&!item.thumbnailUrl){const thumbnail=await this.thumbnail(item.thumbnail);if(thumbnail&&epoch===this.epoch)item.thumbnailUrl=thumbnail;}}));if(epoch===this.epoch)this.publish();return result;
      }catch(e){if(this.active!==false){this.favoriteStatus={state:'unavailable',message:this.features.mediaReads === true?'Favourites unavailable · try again from this speaker':'Favourites unavailable · browsing support is not enabled'};this.publish();}throw e;}
    }
    async playFavorite(entity,id){
      const result=await this.getFavorites(entity),item=result.items.find(item=>item.media_content_id===id);if(!item)throw error('media_not_browsed','This favourite is no longer available');
      return this.control('media_player','play_media',entity,{media_content_type:item.media_content_type,media_content_id:item.media_content_id});
    }
    async loadVacuumRooms(){
      this.roomStatus={state:'loading',message:'Loading rooms…'};this.publish();
      try{this.requireFeature('vacuumRooms');const entity=this.model.config.roles.vacuum;this.readScope(entity);const epoch=this.epoch,result=await this.ask({type:'flightday/vacuum/rooms',entity_id:entity});if(epoch!==this.epoch)throw error('closed','Connection changed');this.readScope(entity);
        if(!result||!Array.isArray(result.rooms)||!result.rooms.every(r=>typeof r.id==='string'&&r.id&&typeof r.name==='string')||new Set(result.rooms.map(r=>r.id)).size!==result.rooms.length)throw error('invalid','Room list is unavailable');
        const used=new Set(),rooms=result.adapter?result.rooms.map(room=>{let name=room.name,i=2;while(used.has(name))name=room.name+' '+i++;used.add(name);return {...room,name};}):[];
        this.roomEntity=entity;this.roomList={...result,rooms};this.roomStatus={state:'ready',message:result.adapter?'':'Room cleaning is unavailable for this vacuum'};this.publish();return this.roomList;
      }catch(e){if(this.active!==false){this.roomList=null;this.roomStatus={state:'unavailable',message:'Room cleaning unavailable · discovery is not enabled'};this.publish();}throw e;}
    }
    async callV3(action,p={}){
      const s=this.p.hub.state,launch=s.launch,np=s.nowPlaying,tv=p.id==='bedroom'?s.bedroomTv:s.tv;
      const actionMap={'sleep.goodnight':'goodnight','night.wake':'wake_now','back_to_bed':'back_to_bed','alarm.snooze':'snooze','alarm.hold':'snooze','alarm.up':'up','alarm.scrub':'scrub'};
      if(action==='comfort.action'){
        const routes={resume:'comfort_resume',fresh_air:'comfort_fresh_air_start',close_up:'comfort_fresh_air_end',keep_open:'comfort_keep_open',not_today:'comfort_dismiss',just_off:'comfort_dismiss',keep_off:'comfort_dismiss',leave_it:'comfort_dismiss',skip:'comfort_plan_skip'},route=routes[p.kind];
        if(!route)throw error('policy_denied','This Comfort action is unavailable');
        return this.action(route,route==='comfort_dismiss'?{kind:p.kind}:p.kind==='keep_open'?{minutes:60}:{});
      }
      if(action==='house-check.dismiss'){
        if(typeof p.fid!=='string'||! /^[A-Za-z0-9_.:-]{1,64}$/.test(p.fid))throw error('invalid','This house finding is unavailable');
        return this.action('house_check_dismiss',{fid:p.fid,days:p.fid.startsWith('backup')?30:7});
      }
      if(actionMap[action])return this.action(actionMap[action],action==='sleep.goodnight'?Object.fromEntries(['sound','timer_min','scope'].filter(k=>p[k]!=null).map(k=>[k,p[k]])):{});
      if(action==='alarm.advance')return this.action('advance',p.now?{now:true}:{minutes:p.minutes??1});
      if(action==='alarm.test')return this.action('test_alarm',{seconds:p.seconds??120,screens:p.screens||(this.info.screen_id?[this.info.screen_id]:[])});
      if(action==='alarm.override')return this.action('set_override',{at:p.datetime?new Date(p.datetime.replace(' ','T')).toISOString():null});
      if(action==='sleep.speaker')return false; // v3 ramp belongs exclusively to the integration
      if(action==='schedule.edit'){
        if(p.field==='override.clear')return this.action('set_override',{at:null});
        if(p.field==='override'){const time=O.sleepSchedule.time(p.value);if(!time)throw error('invalid','Choose a valid time');const d=O.now();d.setDate(d.getDate()+1);const [h,m]=time.split(':').map(Number);d.setHours(h,m,0,0);return this.action('set_override',{at:d.toISOString()});}
        if(!Array.isArray(p.days)||!p.days.length||p.days.some(d=>!DAYS.includes(d))||!['wake','bedtime','enabled'].includes(p.field))throw error('invalid','Choose a valid schedule');
        const prefix={wake:'wake_',bedtime:'bedtime_',enabled:'alarm_'}[p.field];for(const day of p.days)if(!this.model.entities[wireKey(prefix+day)])throw error('unavailable','Schedule is unavailable');
        if(p.field==='enabled'?typeof p.value!=='boolean':!O.sleepSchedule.time(p.value))throw error('invalid','Choose a valid schedule value');
        const results=[];for(const day of p.days)results.push(await this.set(prefix+day,p.value));return results;
      }
      if(action==='alarm.day'){if(!DAYS.includes(p.day))throw error('invalid','Choose a day');const results=[];if(p.time)results.push(await this.set('wake_'+p.day,p.time));if(p.on!=null)results.push(await this.set('alarm_'+p.day,p.on));return results;}
      const settings={'alarm.upBy':['up_by_'+p.day,p.time],'alarm.crew':['crew_'+p.day,p.crew],'alarm.master':['alarm_enabled',p.on],'sleep.sound':['sleep_sound',p.option],'sleep.volume':['sleep_volume',p.value],'sleep.timer':['sleep_timer',p.value],'alarm.max':['alarm_max_volume',p.value],'briefing.hours':['briefing_hours',p.hours],'time.format':['time_format',p.value],'climate.comfort.enabled':['comfort_schedule',p.enabled]};
      if(settings[action])return this.set(...settings[action]);
      if(action==='climate.mode')return this.control('climate','set_hvac_mode',O.roles.get('thermostat'),{hvac_mode:p.mode});
      if(action==='climate.step'){const c=s.climate;if(!c?.available||c.target==null||![-1,1].includes(p.delta))throw error('unavailable','Choose Heat or Cool to see its setpoint');return this.control('climate','set_temperature',c.id,{temperature:O.clamp(c.target+p.delta*c.step,c.min,c.max)});}
      if(action==='climate.day.time'){const value=O.sleepSchedule.time(this.setting('day_starts')?.state);if(!value||![-15,15].includes(p.delta))throw error('unavailable','Day start time is unavailable');return this.set('day_starts',O.sleepSchedule.shift(value,p.delta));}
      const temp=/^climate\.(night|wake|day)\.step$/.exec(action);if(temp){const key='temp_'+temp[1],row=this.setting(key),value=number(row),a=row?.attributes;if(value==null||![-1,1].includes(p.delta)||!Number.isFinite(+a?.step))throw error('unavailable','Temperature setting is unavailable');return this.set(key,+O.clamp(value+p.delta*(+a.step),+a.min,+a.max).toFixed(2));}
      if(action==='sleep.unmute')return this.control('media_player','volume_mute',O.roles.get('sleep_speaker'),{is_volume_muted:false});
      if(action==='light.toggle')return this.control(p.id?.split('.')[0],'toggle',p.id);
      if(action==='light.all'){const result=[];for(const light of (s.lights||[]).filter(light=>!this.permission(light.id).blocked))result.push(await this.control(light.id.split('.')[0],p.on?'turn_on':'turn_off',light.id));return result;}
      if(action==='scene.activate')return this.control('scene','turn_on',p.id);
      if(action.startsWith('media.')&&np){const route={playpause:'media_play_pause',next:'media_next_track',prev:'media_previous_track'}[action.split('.')[1]];if(route)return this.control('media_player',route,np.id);if(action==='media.volume')return this.control('media_player','volume_set',np.id,{volume_level:O.clamp((np.volume+p.delta)/100,0,1)});}
      if(action==='tv.power'&&tv)return this.control('media_player',tv.power?'turn_off':'turn_on',tv.id);
      if(action==='tv.mute'&&tv)return this.control('media_player','volume_mute',tv.id,{is_volume_muted:!tv.muted});
      if(action==='tv.playpause'&&tv)return this.control('media_player','media_play_pause',tv.appleTv||tv.id);
      if(action==='tv.input'&&tv?.sources?.length)return this.control('media_player','select_source',tv.id,{source:tv.sources[(tv.sources.indexOf(tv.input)+1)%tv.sources.length]});
      if(action==='vacuum.action'){const route={start:'start',pause:'pause',dock:'return_to_base',locate:'locate',room:'clean_rooms'}[p.kind];if(route)return this.control('vacuum',route,O.roles.get('vacuum'),p.kind==='room'?{rooms:[p.room]}:{});}
      if(action==='speaker.open')return this.openSpeakerCard(p.id||O.roles.get('sleep_speaker')||this.model.lists.speakers?.[0]);
      if(action==="audioAdapter.play")return this.playFavorite(this.currentSpeaker||O.roles.get('sleep_speaker')||this.model.lists.speakers?.[0],p.id);
      throw error('policy_denied','This action is unavailable in Flight Day v3');
    }
    call(action,data){return this.backend?this.backend.call(action,data):Promise.reject(error('offline','Home Assistant is not ready'));}
    service(...args){return this.backend?this.backend.service(...args):Promise.reject(error('offline','Home Assistant is not ready'));}
    async pairStart(base,details){
      const raw=new Uint8Array(32);crypto.getRandomValues(raw);let binary='';for(const b of raw)binary+=String.fromCharCode(b);const secret=btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
      const response=await fetch(base.replace(/\/+$/,'')+'/api/flightday/pair/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret,...Object.fromEntries(['name_hint','kind','platform','app_version'].filter(k=>details[k]!=null).map(k=>[k,details[k]]))})});
      if(!response.ok)throw error('pairing_failed','Pairing is unavailable');const result=await response.json();this.pairing={base:base.replace(/\/+$/,''),secret,code:result.code.replaceAll('-',''),next:Date.now()+Math.max(1,result.poll_interval_s||3)*1000,expires:Date.parse(result.expires_at)};return result;
    }
    async pairPoll(){
      const pair=this.pairing;if(!pair||Date.now()>pair.expires)throw error('code_unknown','Pairing code expired');if(Date.now()<pair.next)throw error('rate_limited','Wait before checking pairing');pair.next=Date.now()+3000;
      const response=await fetch(pair.base+'/api/flightday/pair/poll?code='+encodeURIComponent(pair.code),{headers:{'X-Flightday-Pair-Secret':pair.secret},cache:'no-store'});if(!response.ok)throw error('pairing_failed','Pairing could not be completed');const result=await response.json();if(result.status!=='pending')this.pairing=null;return result;
    }
    cancelPair(){this.pairing=null;}
    validatePrefs(prefs){if(!prefs||typeof prefs!=='object'||Array.isArray(prefs)||bytes(prefs)>16384)throw error('invalid','Screen settings must be at most 16 KB');return prefs;}
    async setPrefs(prefs){this.requireWrite();this.validatePrefs(prefs);const r=await this.ask({type:'flightday/screen/prefs/set',prefs});this.prefs=this.validatePrefs(r?.prefs||prefs);this.p.hub.emit('screen-prefs',this.prefs);return this.prefs;}
  }
  O.haClient={VERSION,FEATURES,create:(p,options)=>new Client(p,options),Client,LegacyBackend,V3Backend,DemoBackend,reasonText,isHouse};
})();
