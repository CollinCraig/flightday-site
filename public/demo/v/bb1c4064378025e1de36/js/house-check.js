/* House-check adapter: all receiver attributes, helper IDs and wire payloads live here.
 * Fixtures follow the house-check fixture format. Never synthesize a result or run a check on startup. */
(function () {
  'use strict';
  const O=window.OW, esc=O.esc;
  const ids={sensor:'sensor.house_check',battery:'input_number.house_check_battery_low',ignore:'input_text.house_check_ignore',dismissed:'input_text.house_check_dismissed',dismiss:'script.house_check_dismiss'};
  const links=['house.vacuum','house.climate','house.climate.rooms','settings.room_sensors','settings.house_check','status.automations','house.devices','none'];
  const categories=['offline','battery','maintenance','problem','stale','automation_error','backup','backup_offsite_missed'];
  const valid=s=>s&&!['unknown','unavailable'].includes(s.state);
  const text=v=>typeof v==='string'?v:'';
  const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const array=v=>Array.isArray(v)?v:[];
  const timestamp=v=>typeof v==='number'&&Number.isFinite(v)?v*(v<1e12?1000:1):typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
  const fid=v=>typeof v==='string'&&/^(offline|battery|maintenance|problem|stale|automation_error|backup|backup_offsite_missed):[a-zA-Z0-9_.-]+$/.test(v);
  const label=f=>text(f.label)||array(f.entity_ids)[0]||f.fid;
  const findingLink=f=>({maintenance:'house.vacuum',stale:'settings.room_sensors',automation_error:'status.automations',backup:'settings.house_check',backup_offsite_missed:'settings.house_check'})[f.category]||'house.devices';
  function findingLine(f) {
    const title=label(f), n=num(f.overdue_h), since=num(f.since_min), value=num(f.value);
    switch(f.category){
      case 'maintenance': return title+' — '+(text(f.part)||'maintenance')+' overdue'+(n===null?'':' '+n+' h');
      case 'battery': return title+' — '+(value===null?'low battery':value+'% battery');
      case 'offline': return title+' — offline'+(since===null?'':' '+since+' min');
      case 'stale': return title+' — '+(text(f.notice)|| (since===null?'reading unavailable':'last report '+since+' min ago'));
      case 'backup_offsite_missed': return title+' — '+(text(f.last_at)?'last offsite backup '+O.fmt.when(Date.parse(f.last_at)):'offsite backup needs checking');
      case 'backup': return title+' — '+(text(f.last_at)?'last backup '+O.time.text(f.last_at):'automatic backup unavailable');
      case 'automation_error': return title+' — '+(num(f.count)===null?'automation error':f.count+' automation errors');
      default: return title+' — '+(text(f.state)||'problem reported');
    }
  }
  function read(states={},connected=false,registry={},devices=[]) {
    const s=states[ids.sensor],a=connected&&valid(s)?s.attributes||{}:{}, known=['ok','all_clear','raw','stale','none','failed'];
    let state=connected&&valid(s)&&known.includes(s.state)?s.state:'none';
    const findings=array(a.findings).filter(f=>f&&fid(f.fid)&&categories.includes(f.category)).slice(0,8);
    const bullets=array(a.bullets).filter(b=>b&&typeof b.text==='string'&&b.text.trim()&&b.text.length<=100&&b.still_true===true&&array(b.finding_ids).length&&b.finding_ids.every(id=>fid(id))&&links.includes(b.link)&&categories.includes(b.category)).slice(0,3).map(b=>({...b,finding_ids:[...b.finding_ids],entity_ids:array(b.entity_ids)}));
    // No invented all-clear if an ok payload is incomplete or its bullets have resolved.
    if(state==='ok'&&!bullets.length)state='none';
    if(state==='raw'&&!findings.length)state='none';
    const h=states[ids.battery],min=num(h?.attributes?.min),max=num(h?.attributes?.max),step=num(h?.attributes?.step),value=valid(h)?num(h.state):null;
    const battery={value,min,max,step,ready:!!connected&&value!==null&&min!==null&&max!==null&&step>0&&value>=min&&value<=max};
    const ignore=connected&&valid(states[ids.ignore])?text(states[ids.ignore].state).split(',').map(v=>v.trim()).filter(Boolean):[];
    const dismissed=array(a.dismissed).map(d=>{if(typeof d!=='string')return d;const i=d.lastIndexOf(':');return {fid:d.slice(0,i),until:Number(d.slice(i+1))};}).filter(d=>d&&fid(d.fid)&&timestamp(d.until)!==null).map(d=>({fid:d.fid,until:timestamp(d.until),label:label(findings.find(f=>f.fid===d.fid)||d)}));
    const choices=new Map();
    for(const d of devices)if(d&&typeof d.id==='string')choices.set(d.id,{id:d.id,label:text(d.name_by_user)||text(d.name)||d.id});
    for(const [id,s] of Object.entries(states))if(/^(sensor|binary_sensor|switch|light|lock|climate|media_player|camera|vacuum|fan|cover)\./.test(id)&&!registry[id]?.hidden)choices.set(id,{id,label:text(s?.attributes?.friendly_name)||id});
    return {state,bullets,findings,summary:text(a.summary),checkedAt:typeof a.checked_at==='string'&&Number.isFinite(Date.parse(a.checked_at))?a.checked_at:null,model:text(a.model),reason:text(a.reason),errorsChecked:a.errors_checked===true,dismissed,battery,ignore,ignoreReady:!!connected&&valid(states[ids.ignore]),ignoreMax:num(states[ids.ignore]?.attributes?.max)||255,choices:[...choices.values()].sort((a,b)=>a.label.localeCompare(b.label)),dismissReady:!!connected&&valid(states[ids.dismiss]),undoReady:!!connected&&valid(states[ids.dismissed]),sleeping:states['input_boolean.sleep_mode']?states['input_boolean.sleep_mode'].state==='on':O.data?.state?.launch?.sleeping===true,connected:!!connected};
  }
  const model=()=>O.data?.state?.houseCheck||read();
  const quiet=(m=model())=>!!m.sleeping&&/bedroom/i.test(O.config.get('room')||'');
  const time=m=>m.checkedAt?O.time.text(m.checkedAt):'';
  const topRows=()=>['ok','raw'].includes(model().state)?32:20;
  const pending=()=>!!O.app?.houseCheckPending;
  function button(action,title,arg='',disabled=false,fid=action) {return '<button class="btn"'+(title==='›'?' aria-label="Open details"':'')+' data-focus data-fid="'+esc(fid)+'" data-act="house-check.'+action+'" data-arg="'+esc(arg)+'"'+(disabled?' disabled':'')+'>'+esc(title)+'</button>';}
  const checkButton=()=>button('check','Check again','',pending(),'house-check-again');
  function card() {
    const m=model();if(quiet(m))return '';
    if(O.data.contract===3&&!['ok','raw'].includes(m.state)){const rows=O.data.state.checks||[],available=O.data.client?.checksAvailable;return '<div aria-label="House check"><p>What needs attention at home</p>'+(rows.length?rows.map(c=>'<div class="house-check-item"><p>'+esc(c.title)+'</p><span aria-label="'+(c.status==='problem'?'Problem':'Needs attention')+'">'+(c.status==='problem'?'Warning':c.status==='attention'?'Caution':'Status unavailable')+'</span><p>'+esc(c.detail||'')+'</p></div>').join(''):'<p>'+(available?'Nothing needs you':'Checks unavailable')+'</p>')+'</div>';}
    let body='',footer='';
    if(m.state==='ok'||m.state==='raw'){
      const raw=m.state==='raw',rows=raw?m.findings.map(f=>({text:findingLine(f),link:findingLink(f),finding_ids:[f.fid]})):m.bullets;
      if(raw)body='<p>'+(m.sleeping?'House check':'Systems check')+' · '+m.findings.length+' found (not summarised)</p>';
      body+='<div class="house-check-lines scroll">'+rows.map((b,i)=>'<div class="house-check-item"><p>'+esc(b.text)+'</p><div class="house-check-actions">'+(b.link!=='none'?button('link','›',b.link,false,'house-check-link-'+i):'')+button('dismiss','Dismiss',JSON.stringify(b.finding_ids),pending()||!m.dismissReady,'house-check-dismiss-'+i)+'</div></div>').join('')+'</div>';
      footer=(m.checkedAt?'Checked '+time(m)+' · ':'')+(raw?'':('AI summary of '+m.findings.length+(m.findings.length===1?' check · ':' checks · ')));
    }else body='<p>'+esc(m.state==='all_clear'?'Nothing needs you'+(time(m)?' · '+time(m):''):m.state==='failed'?'House check unavailable'+(time(m)?' · '+time(m):''):'House check · not run yet today')+'</p>';
    return '<div class="house-check" aria-label="House check"><p>What needs attention at home</p><div class="house-check-body">'+body+'</div><footer><span>'+esc(footer)+'</span>'+checkButton()+'</footer><p class="house-check-feedback" role="status">'+esc(O.app?.houseCheckMessage||'')+'</p></div>';
  }
  function briefing() {
    const m=model();if(quiet(m))return '';
    if(O.data.contract===3){const n=(O.data.state.checks||[]).length;return n?'<p aria-label="'+n+' things need attention">Systems check · '+n+' need you</p>':'';}
    if(m.state==='ok')return '<p class="brief-house-check">'+button('link',(m.sleeping?'House check · ':'Systems check · ')+m.bullets[0].text+(m.bullets.length>1?' +'+(m.bullets.length-1)+' more':'')+' ›','status.automations',false,'brief-house-check')+'</p>';
    if(m.state==='raw')return '<p class="brief-house-check">'+button('link','House: '+m.findings.length+(m.findings.length===1?' thing to check ›':' things to check ›'),'status.automations',false,'brief-house-check')+'</p>';
    return '';
  }
  function settingsHtml() {
    const m=model(),b=m.battery,locked=pending(),ignored=m.ignore.map(id=>'<div class="house-check-dismissed"><span>'+esc(m.choices.find(c=>c.id===id)?.label||id)+'</span>'+button('ignore.remove','Remove',id,locked||!m.ignoreReady,'house-check-remove-'+id)+'</div>').join('');
    return '<section class="house-check-settings"><div class="set"><div class="set-l">Battery low below</div><div class="house-check-actions">'+button('battery','−','-1',locked||!b.ready||b.value<=b.min,'house-check-battery-minus')+'<b class="mono">'+(b.ready?esc(b.value)+'%':'—')+'</b>'+button('battery','+','1',locked||!b.ready||b.value>=b.max,'house-check-battery-plus')+'</div></div>'+(!b.ready?'<p class="muted">Battery threshold · waiting for the house helper</p>':'')+'<h4>Ignore list</h4>'+ignored+(m.ignoreReady?'<div class="house-check-actions"><select data-focus data-fid="house-check-ignore-picker" aria-label="Choose a device or entity to ignore"'+(locked?' disabled':'')+'><option value="">Choose a device or entity…</option>'+m.choices.filter(c=>!m.ignore.includes(c.id)).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.label)+' · '+esc(c.id)+'</option>').join('')+'</select>'+button('ignore.add','Add','',locked,'house-check-ignore-add')+'</div>':'<p class="muted">Ignore list · waiting for the house helper</p>')+'<h4>Dismissed</h4>'+(m.dismissed.length?m.dismissed.map((d,i)=>'<div class="house-check-dismissed"><span>'+esc(d.label)+'<small>Until '+esc(O.fmt.when(d.until))+'</small></span>'+button('undo','Undo',d.fid,locked||!m.undoReady,'house-check-undo-'+i)+'</div>').join(''):'<p class="muted">No dismissed items reported</p>')+(!m.errorsChecked?'<p>Automation errors: not checked yet</p>':'')+'<p>Last run: '+esc(time(m)||'not run yet today')+(m.reason?' · '+esc(m.reason):'')+'</p>'+checkButton()+'<p class="house-check-feedback" role="status">'+esc(O.app?.houseCheckMessage||'')+'</p></section>';
  }
  function command(action,p,states,connected,registry={},devices=[]) {
    const m=read(states,connected,registry,devices);if(!connected)throw Error('Home Assistant is offline');
    const by=O.app?.deviceId?.()||O.mode;
    if(action==='house-check.dismiss'||action==='house-check.undo'){
      const undo=action==='house-check.undo';
      if(undo?!m.undoReady:!m.dismissReady)throw Error('House check dismissal · waiting for the house');
      const allowed=undo?m.dismissed.some(d=>d.fid===p.fid):m.findings.some(f=>f.fid===p.fid)||m.bullets.some(b=>b.finding_ids.includes(p.fid));
      if(!fid(p.fid)||!allowed)throw Error('This house finding is no longer available');
      if(undo){
        // Backend UI contract: remove only this fid from the current helper, preserving every other entry.
        const value=text(states[ids.dismissed].state).split(',').filter(pair=>pair.slice(0,pair.lastIndexOf(':'))!==p.fid).join(',');
        return {domain:'input_text',service:'set_value',target:{entity_id:ids.dismissed},service_data:{value}};
      }
      return {domain:'script',service:'house_check_dismiss',service_data:{fid:p.fid,days:p.fid.startsWith('backup')?30:7,by}};
    }
    if(action==='house-check.battery'){
      const b=m.battery,value=b.value+Number(p.delta)*b.step;
      if(!b.ready||![-1,1].includes(Number(p.delta))||value<b.min||value>b.max)throw Error('Battery threshold is unavailable or outside its range');
      return {domain:'input_number',service:'set_value',target:{entity_id:ids.battery},service_data:{value}};
    }
    if(action==='house-check.ignore'){
      if(!m.ignoreReady)throw Error('Ignore list · waiting for the house helper');
      if(typeof p.id!=='string'||!p.id||/[,:\s]/.test(p.id)||(!p.remove&&!m.choices.some(c=>c.id===p.id)))throw Error('Choose an available device or entity');
      const value=(p.remove?m.ignore.filter(id=>id!==p.id):[...new Set([...m.ignore,p.id])]).join(',');
      if(value.length>m.ignoreMax)throw Error('Ignore list is full · remove an item first');
      return {domain:'input_text',service:'set_value',target:{entity_id:ids.ignore},service_data:{value}};
    }
    throw Error('Unknown house check action');
  }
  async function checkAgain() {
    const H=O.hub,token=String(O.config.get('wallhub.token')||'').trim();
    if(!H?.enabled()||!token)throw Error('House check · waiting for wallhub and its prefs token');
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),10000);let r;
    try{r=await fetch(H.url('/v1/house/check'),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:'{}',signal:ctl.signal});}
    catch(_){throw Error('House check request not confirmed · check Status before trying again');}finally{clearTimeout(timer);}
    let data={};try{data=await r.json();}catch(_){}
    if(r.status===202)return 'House check requested · waiting for the house';
    if(r.status===409)return 'House check already running';
    if(r.status===429)return timestamp(data.next_allowed)!==null?'Next check available at '+O.time.text(timestamp(data.next_allowed)):'House check limit reached · next check time unavailable';
    if(r.status===401||r.status===403)throw Error('House check prefs token rejected · check Settings');
    if(r.status===404||r.status===503)throw Error('House check · waiting for the backend');
    throw Error('House check request not confirmed');
  }
  O.houseCheck={ids,links,read,command,quiet,topRows,card,briefing,settingsHtml,checkAgain,findingLine};
})();
