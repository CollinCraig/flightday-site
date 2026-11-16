/* Exact robotVacuum integration contract. Map/room discovery is read-only; controls require a tap. */
(function(){
  'use strict';
  const O=window.OW,entity=()=>O.roles.get('vacuum'),mapEntity=()=>O.roles.get('vacuum_map');
  const valid=s=>s&&!['unknown','unavailable'].includes(s.state),num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const title=v=>String(v||'').replaceAll('_',' ').replace(/^./,s=>s.toUpperCase());
  const maintenance=[['main_brush_time_left','Main brush'],['side_brush_time_left','Side brush'],['filter_time_left','Filter'],['sensor_time_left','Sensors'],['dock_strainer_time_left','Strainer']];
  function rooms(response){
    const maps=response?.response?.[entity()]?.maps||response?.[entity()]?.maps||[],map=maps.find(m=>Number(m.flag)===0),rows=map?.rooms;
    if(!rows||typeof rows!=='object'||Array.isArray(rows))return [];
    const entries=Object.entries(rows).filter(([id,name])=>/^\d+$/.test(id)&&Number.isSafeInteger(+id)&&+id>0&&typeof name==='string'&&name.trim());
    return entries.map(([id,name])=>({id:+id,name:entries.filter(([,n])=>n===name).length>1?name+' · room '+id:name}));
  }
  function read(states,connected,base='',mapRooms=[]){
    const st=states[entity()],a=st?.attributes||{},get=key=>states[O.roles.related(entity(),'sensor',key)],error=get('vacuum_error'),dockError=get('dock_dock_error');
    const errors=[valid(error)&&!['none','ok','0'].includes(error.state)?title(error.state):'',valid(dockError)&&!['none','ok','0'].includes(dockError.state)?'Dock · '+title(dockError.state):'',a.error&&a.error!=='none'?String(a.error):''].filter(Boolean);
    const status=valid(get('status'))?get('status').state:typeof a.status==='string'?a.status:st?.state||'unavailable',available=!!(connected&&valid(st)),fault=st?.state==='error'||status==='error'||errors.length>0;
    const active=st?.state==='cleaning'||st?.state==='returning'||/cleaning|mopping|mapping|going_to_target|returning_home|docking|starting/.test(status),features=num(a.supported_features)||0;
    const img=states[mapEntity()],pic=valid(img)?img.attributes?.entity_picture:null;
    // Only the exact integration image_proxy is allowed. Never put the HA bearer token in an image URL.
    const url=connected&&typeof pic==='string'&&pic.startsWith('/api/image_proxy/'+mapEntity()+'?')?base+pic+'&v='+encodeURIComponent(img.last_updated||img.state):'';
    return {name:a.friendly_name||'Robot vacuum',id:entity(),present:!!st,available,status:available?title(status):'Offline',battery:valid(get('battery'))?num(get('battery').state):num(a.battery_level),error:errors.join(' · '),fault,active,homeLine:connected&&available&&(fault||active)?(a.friendly_name||'Robot vacuum')+' · '+(fault?'Stuck · '+(errors.join(' · ')||'Needs a hand'):st.state==='returning'?'Returning to dock…':'Cleaning…'):'',mapUrl:url,mapAt:Date.parse(img?.state)||null,rooms:connected?mapRooms:[],features,maintenance:maintenance.map(([key,label])=>{const s=get(key),value=valid(s)?num(s.state):null,u=s?.attributes?.unit_of_measurement,hours=value===null?null:u==='min'?value/60:u==='s'?value/3600:u==='h'?value:null;return {label,hours,overdue:hours!==null&&hours<=0};})};
  }
  function command(action,p,model){
    if(!model?.available||!entity())throw Error('Robot vacuum is offline');
    const routes={start:['start',8192],pause:['pause',4],dock:['return_to_base',16],room:['send_command',256]},r=routes[p.kind];
    if(action!=='vacuum.action'||!r||!(model.features&r[1]))throw Error('Robot vacuum action is unavailable');
    if(p.kind==='room'&&!model.rooms.some(room=>room.id===p.room))throw Error('Room is no longer available');
    return {domain:'vacuum',service:r[0],target:{entity_id:model.id},service_data:p.kind==='room'?{command:'app_segment_clean',params:[{segments:[p.room],repeat:1}]}:{}};
  }
  function render(){
    const m=O.data.state.robotVacuum,esc=O.esc;if(!m)return '';
    const locked=!m.available||O.app?.vacuumPending,b=(kind,label,bit,room)=>'<button class="btn" data-focus data-fid="vacuum-'+kind+(room?'-'+room:'')+'" data-act="vacuum.action" data-arg="'+esc(JSON.stringify({kind,room}))+'"'+(locked||(!(m.features&bit)&&!(kind==='room'&&m.roomsReady))?' disabled':'')+'>'+esc(label)+'</button>';
    return "<div class=\"robotVacuum scroll\"><div class=\"vacuum-status\"><b>"+esc(m.status)+'</b><span class="mono">'+(m.battery===null?'Battery unavailable':Math.round(m.battery)+'% battery')+'</span></div>'+(m.error?'<p class="vacuum-error" role="status">Needs a hand · '+esc(m.error)+'</p>':'')+'<div class="vacuum-controls">'+b('start','Start',8192)+b('pause','Pause',4)+b('dock','Return to dock',16)+'</div><figure class="vacuum-map" data-focus tabindex="0" data-fid="vacuum-map">'+(m.mapUrl?'<img data-vacuum-map src="'+esc(O.net.img(m.mapUrl,960))+'" alt="Robot vacuum’s latest floor map"><figcaption>Latest map'+(m.mapAt?' · '+esc(O.fmt.hm(m.mapAt)):'')+'</figcaption>':'<figcaption>Map unavailable</figcaption>')+'</figure>'+(m.hideRoomCleaning?'':'<details class="vacuum-room-picker"><summary data-focus>Clean a room</summary><div class="vacuum-rooms">'+(m.rooms.length?m.rooms.map(room=>b('room',room.name,256,room.id)).join(''):'<p class="muted">'+esc(m.roomsUnavailableReason||'Room choices unavailable')+'</p>')+'</div></details>')+'<details><summary data-focus>Maintenance</summary><div class="vacuum-maintenance">'+m.maintenance.map(item=>'<div data-focus tabindex="0" data-fid="vacuum-maintenance-'+item.label.replaceAll(' ','-')+'" class="'+(item.overdue?'overdue':'')+'"><b>'+esc(item.label)+'</b><span>'+(item.hours===null?'Unavailable':item.overdue?'Overdue'+(item.hours<0?' · '+Math.ceil(-item.hours)+' h':''):Math.floor(item.hours)+' h left')+'</span></div>').join('')+'</div></details><p role="status">'+(O.app?.vacuumPending?'Waiting for the robot vacuum…':'')+'</p></div>';
  }
  document.addEventListener('toggle',e=>{if(e.target.matches?.('.vacuum-room-picker')&&e.target.open)requestAnimationFrame(()=>e.target.scrollIntoView({block:'nearest'}));},true);
  O.robotVacuum={get entity(){return entity();},get mapEntity(){return mapEntity();},read,rooms,command,render};
})();
