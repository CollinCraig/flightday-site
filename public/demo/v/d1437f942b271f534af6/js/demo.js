/* FE-W5: selected before clients start; no real socket constructor is retained.
 * One manifest loader, populated from the canonical FE-D3 fixture by copy-demo-fixture.cjs.
 * Uses the binding DEMO-HOUSE resolver, screen projection and session simulation. */
(function () {
  'use strict';
  const O=window.OW=window.OW||{},q=new URLSearchParams(location.search);
  const D=O.demo={active:O.demoBuild||q.get('demo')==='1',static:!!O.demoBuild,fixturePath:O.asset?O.asset('fixtures/demo-house/'):'fixtures/demo-house/',phase:'canonical',rulesReady:true,scenario:q.get('scenario')||(O.demoBuild?'alarm-clock':'clear'),spaceMode:O.demoBuild?'snapshot':q.get('space')||'live'};
  D.enter=on=>{if(O.demoBuild){if(!on)location.assign('/');return;}const u=new URL(location.href);u.searchParams.set('demo',on?'1':'0');if(!on){u.searchParams.delete('scenario');u.searchParams.delete('now');}location.assign(u.href);};
  if(!D.active)return;
  document.documentElement.classList.add('demo-house');
  if(D.spaceMode==='snapshot'&&document.head){const policy=document.createElement('meta');policy.httpEquiv='Content-Security-Policy';policy.content="connect-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:";document.head.append(policy);}
  const realFetch=window.fetch.bind(window),sockets=new Set(),clone=v=>JSON.parse(JSON.stringify(v));
  const root=new URL(D.fixturePath,location.href);
  let fixture,states={},engine,snapshot=null;
  async function read(name){
    const url=new URL(name,root);
    if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))throw Error('Demo fixture path escapes its folder');
    const r=await realFetch(url.href,{cache:'no-store'});
    if(!r.ok)throw Error('Demo fixture unavailable: '+name);
    return r.json();
  }
  D.ready=read('manifest.json').then(async manifest=>{
    const names=['ha','model','calendars','todo','hub','scenarios','simulation','commands'];
    const files=await Promise.all(names.map(name=>read(manifest.files[name])));
    fixture=Object.fromEntries(names.map((name,i)=>[name,files[i]]));
    if(!fixture.model.entity_info||typeof fixture.model.entity_info!=='object'||Array.isArray(fixture.model.entity_info))throw Error('Demo fixture requires entity_info');
    fixture.manifest=manifest;fixture.extensions=await read(manifest.files.extensions||'extensions.json');
    const requested=q.get('now');const c=FDDemo.clock(fixture.ha.config.time_zone);
    const base=requested?( /(?:Z|[+-]\d\d:\d\d)$/.test(requested)?Date.parse(requested):(()=>{const m=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(requested);return m?c.epoch({year:+m[1],month:+m[2],day:+m[3],hour:+m[4],minute:+m[5]}):NaN;})()):Date.now();
    if(!Number.isFinite(base))throw Error('Invalid demo clock');
    engine=new FDDemo.Engine(fixture,{now:base,scenario:D.scenario,mode:q.get('mode')||'panel',explicitNow:!!requested,assetBase:root.href});
    D.postSampleLine=()=>{engine.admin.config.modules.x_bin_day=true;const integration=engine.admin.integrations.find(i=>i.id==='x_bin_day'),registration=fixture.extensions.calls.find(c=>c.service==='register_integration'&&c.data.id==='bin_day');if(integration&&registration)integration.summary=registration.data.description;return engine.postLine({source:'x_bin_day',key:'developer_sample',text:'A sample line from your demo house',show:['home','briefing'],priority:'normal',until:engine.clock.iso(engine.now()+3600000),icon:'recycle',person:null,posted_at:engine.clock.iso(engine.now())});};
    if(engine.invalid?.length)console.warn('Demo fixture has unknown time tokens',engine.invalid);
    D.engine=engine;D.scenario=engine.scenario;D.setScenario=id=>{const u=new URL(location.href);u.searchParams.set('scenario',id);location.assign(u.href);};
    states=engine.states;fixture={...fixture,model:engine.model(),screens:engine.model().config.screens,calendars:engine.calendars,todo:engine.todo,hub:engine.hub};
    D.fixture=fixture;D.states=states;
    O.nowMs=()=>engine.now();O.now=()=>new Date(engine.now());
    const screen=engine.model().config.screens.find(s=>s.id===engine.screenId);O.config?.set('screen.id',engine.screenId);O.config?.set('room',screen?.area?.replaceAll('_',' ')||'');
    engine.on((type,data)=>{
      if(type==='event'&&data.action==='goodnight')D.audioScreens=data.audio_screens||[];
      if(type==='model'){fixture.model=data;O.model?.accept(data);}
      for(const sock of sockets)for(const [id,subscription]of sock.subs){
        if(subscription==='flightday/subscribe')sock.deliver({id,type:'event',event:type==='state_changed'?{kind:'model',model:engine.model()}:type==='event'?{kind:'event',event:data}:{kind:type,[type]:data}});
        else if(type==='state_changed'&&subscription==='state_changed')sock.deliver({id,type:'event',event:{event_type:'state_changed',data,time_fired:engine.clock.iso(engine.now())}});
      }
    });
    let lastTick=Date.now();setInterval(()=>{const current=Date.now();engine.advance(Math.max(0,current-lastTick));lastTick=current;},1000);
    try{snapshot=await read(manifest.files.space_snapshot);D.snapshotDate=snapshot.captured_at.slice(0,10);}catch(_){D.spaceError='Space snapshot unavailable';}
    return fixture;
  });
  function service(m){
    const d=m.service_data||{},target=m.target?.entity_id||d.entity_id;
    const ids=Array.isArray(target)?target:target?[target]:[];
    if(m.domain==='calendar'&&m.service==='get_events')return {response:Object.fromEntries(ids.filter(id=>fixture.calendars[id]).map(id=>[id,clone(fixture.calendars[id])]))};
    if(m.domain==='todo'&&m.service==='get_items')return {response:Object.fromEntries(ids.filter(id=>fixture.todo[id]).map(id=>[id,clone(fixture.todo[id])]))};
    if(m.domain==="robotVacuum"&&m.service==='get_maps')return {response:{[engine.roles.vacuum]:{maps:[{flag:0,rooms:{1:'Kitchen',2:'Living room',3:'Hallway'}}]}}};
    throw Object.assign(Error('Screens use flightday/control'),{code:'unauthorized'});
  }
  D.service=m=>D.ready.then(()=>service(m));
  class Socket {
    constructor(url){
      this.url=String(url);this.readyState=0;this.subs=new Map();sockets.add(this);
      D.ready.then(()=>{
        if(this.readyState===3)return;
        this.readyState=1;this.onopen?.({});
        this.deliver(this.url.includes('/v1/stream')?{topic:'snapshot',data:{weather_nowcast:engine.hub['/v1/weather/nowcast']}}:{type:'auth_required'});
      }).catch(()=>this.onerror?.({}));
    }
    deliver(data){queueMicrotask(()=>{if(this.readyState===1)this.onmessage?.({data:JSON.stringify(data)});});}
    send(raw){
      const m=JSON.parse(raw);
      if(m.type==='auth'){this.authenticated=true;this.deliver({type:'auth_ok',ha_version:fixture.ha.config.version});return;}
      if(!this.authenticated){this.deliver({id:m.id,type:'result',success:false,error:{code:'unauthorized',message:'Authenticate first'}});return;}
      let result=null,error;
      try{
        switch(m.type){
          case 'get_states':result=Object.values(states);break;
          case 'get_config':result=fixture.ha.config;break;
          case 'get_services':result=fixture.ha.services;break;
          case 'todo/item/list':result=engine.todo[m.entity_id]||{items:[]};break;
          case 'subscribe_events':this.subs.set(m.id,m.event_type);break;
          case 'call_service':result=service(m);break;
          case 'history/history_during_period':result={};break;
          case 'flightday/info':result=engine.info();break;
          case 'flightday/model':result=engine.model();break;
          case 'flightday/subscribe':this.subs.set(m.id,'flightday/subscribe');break;
          case 'flightday/media/browse':case 'flightday/media/favorites':case 'flightday/vacuum/rooms':result=engine.readCommand(m);break;
          case 'flightday/control':result=engine.control(m);break;
          case 'flightday/config/update':result=engine.configUpdate(m);break;
          case 'flightday/action':result=engine.action(m);break;
          case 'flightday/history/mornings':result=[];break;
          case 'flightday/screen/prefs/get':result={prefs:D.prefs||{}};break;
          case 'flightday/screen/prefs/set':D.prefs=clone(m.prefs||{});result={prefs:D.prefs};break;
          case 'flightday/screen/heartbeat':result={};break;
          case 'weather/subscribe_forecast':result=null;setTimeout(()=>this.deliver({id:m.id,type:'event',event:{type:m.forecast_type,forecast:clone(engine.weather[m.forecast_type]||[])}}),0);break;
          default:throw Error('Unsupported demo command');
        }
      }catch(e){error={code:e.code||'not_supported',message:e.message,...(e.reason?{reason:e.reason}:{})};}
      this.deliver({id:m.id,type:'result',success:!error,result:clone(result),...(error?{error}:{})});
      if(m.type==='flightday/subscribe'&&!error)this.deliver({id:m.id,type:'event',event:{kind:'snapshot',model:engine.model(),launch:engine.launch}});
    }
    close(){this.readyState=3;sockets.delete(this);this.onclose?.({});}
  }
  Socket.OPEN=1;Socket.CLOSED=3;window.WebSocket=Socket;
  const response=(data,status=200)=>({ok:status>=200&&status<300,status,headers:new Headers(),json:async()=>clone(data),text:async()=>JSON.stringify(data)});
  const publicHosts=['ll.thespacedevs.com','lldev.thespacedevs.com','api.spaceflightnewsapi.net','api.wheretheiss.at','api.nasa.gov','images-api.nasa.gov','images-assets.nasa.gov'];
  window.fetch=async function(input,opts={}){
    const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href),method=(opts.method||input.method||'GET').toUpperCase();
    await D.ready;
    if(u.hostname==='demo.invalid'){
      if(method==='GET'){
        if(u.pathname==='/api/states')return response(Object.values(states));
        if(u.pathname==='/api/config')return response(fixture.ha.config);
        if(u.pathname==='/api/flightday/model')return response(engine.model());
        if(u.pathname.startsWith('/api/calendars/')){
          const entry=fixture.calendars[decodeURIComponent(u.pathname.slice('/api/calendars/'.length))];
          return entry?response(entry.events):response({error:'not_found'},404);
        }
        if(u.pathname.startsWith('/api/todo/')){
          const entry=fixture.todo[decodeURIComponent(u.pathname.slice('/api/todo/'.length))];
          return entry?response(entry):response({error:'not_found'},404);
        }
        if(u.pathname in fixture.hub)return response(fixture.hub[u.pathname]);
        const topics={'/v1/launches':'launches','/v1/events':'events','/v1/astronauts':'astronauts','/v1/news':'news','/v1/iss':'iss','/v1/objects/25544/passes':'iss_passes'};
        if(D.spaceMode==='snapshot'&&topics[u.pathname])return snapshot?.[topics[u.pathname]]?response(snapshot[topics[u.pathname]]):response({error:'Snapshot unavailable',data:null},503);
        if(/^\/v1\/(launches|events|news|astronauts|programs|iss)(\/|$)/.test(u.pathname))throw Error('Public space feed uses direct client');
        return response({error:'unavailable'},404);
      }
      if(method==='POST'&&u.pathname.startsWith('/api/services/')){
        const [, , ,domain,svc]=u.pathname.split('/');
        const result=service({domain,service:svc,service_data:JSON.parse(opts.body||'{}')});
        return response({changed_states:[],service_response:result.response});
      }
      return response({error:'unsupported_demo_write'},503);
    }
    if(u.hostname==='api.weather.gov')return response({features:(engine.weather.alerts||[]).map(a=>({properties:{...a,severity:a.severity.replace(/^./,s=>s.toUpperCase()),headline:'No-Go: '+a.headline}}))});
    if(u.hostname==='api.open-meteo.com'){
      const w=engine.weather,h=w.hourly,d=w.daily,current=w.current,code=c=>({sunny:0,partlycloudy:2,cloudy:3,rainy:61,'lightning-rainy':95,'clear-night':0}[c]??3),sun=engine.states['sun.sun'].attributes;
      return response({current:{temperature_2m:current.temperature,apparent_temperature:current.apparent_temperature,weather_code:code(current.condition),is_day:engine.clock.parts(engine.now()).hour>=6&&engine.clock.parts(engine.now()).hour<18?1:0},hourly:{time:h.map(r=>Date.parse(r.datetime)/1000),temperature_2m:h.map(r=>r.temperature),precipitation_probability:h.map(r=>r.precipitation_probability),weather_code:h.map(r=>code(r.condition))},daily:{temperature_2m_max:d.map(r=>r.temperature),temperature_2m_min:d.map(r=>r.templow),sunrise:[Date.parse(sun.next_rising)/1000],sunset:[Date.parse(sun.next_setting)/1000]}});
    }
    if(method==='GET'&&u.origin===location.origin&&u.pathname.startsWith(new URL('.',location.href).pathname)&&!/^\/(?:net|api)\//.test(u.pathname)&&!/(?:^|\/)(?:config|usage)\.json$|\.local(?:\/|\.|$)/.test(u.pathname))return realFetch(input,opts);
    if(method==='GET'&&u.protocol==='https:'&&publicHosts.includes(u.hostname)){
      const topic=u.hostname.endsWith('thespacedevs.com')?(/astronaut/.test(u.pathname)?'astronauts':/events/.test(u.pathname)?'events':/launches/.test(u.pathname)?'launches':null):u.hostname==='api.spaceflightnewsapi.net'?'news':u.hostname==='api.wheretheiss.at'?'iss':null;
      const fallback=()=>{if(!topic||!snapshot?.[topic]?.data)throw Error('Space snapshot unavailable');D.spaceFallback=true;return response(snapshot[topic].data);};
      if(D.spaceMode==='snapshot')return fallback();
      if(u.hostname.endsWith('thespacedevs.com')){const key='fd-demo-ll-budget',last=Number(localStorage.getItem(key)||0);if(Date.now()-last<15*60000)return fallback();localStorage.setItem(key,String(Date.now()));}
      try{const r=await realFetch(input,opts);return r.ok?r:fallback();}catch(_){return fallback();}
    }
    throw Error('Demo blocks household network access');
  };
  document.addEventListener('DOMContentLoaded',()=>{
    const rail=document.createElement('aside');rail.id='demo-rail';rail.setAttribute('aria-label','Demo house');document.body.append(rail);
    const chip=document.createElement('button');chip.id='demo-house-chip';chip.dataset.focus='';chip.dataset.fid='demo-house-chip';chip.textContent='Demo house · sample data';chip.onclick=()=>{if(confirm('Leave demo house?'))D.enter(false);};rail.append(chip);
    const label=document.createElement('span');label.id='demo-space-source';rail.append(label);
    setInterval(()=>{
      const night=O.app?.ws==='night'||O.app?.night||O.app?.blackout||O.app?.shutdown;
      rail.classList.toggle('demo-night',!!night);chip.classList.toggle('demo-night',!!night);label.hidden=!!night;
      chip.textContent=night?'Demo house':fixture?.manifest.label.chip||'Demo house · sample data';
      label.textContent=(D.spaceMode==='snapshot'||D.spaceFallback)?'Space · Real · '+(snapshot?.captured_at?'as of '+snapshot.captured_at.slice(0,10):'snapshot unavailable'):'Space · Real';
    },250);
  });
})();
