/* Shared thermostat contract. Native HA temperatures retain their reported unit; routine helpers are °F. */
(function () {
  'use strict';
  const O=window.OW;
  const entity=()=>O.roles.get('thermostat'), sensor=()=>O.roles.get('thermostat_sensor');
  const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const valid=s=>s&&!['unknown','unavailable'].includes(s.state);
  const unit=u=>/C/.test(u||'')?'°C':'°F';
  const convert=(v,from,to)=>v==null?null:unit(from)===unit(to)?v:unit(to)==='°C'?(v-32)*5/9:v*9/5+32;
  const fmt=(v,u)=>v==null?'—':Number(v.toFixed(unit(u)==='°C'?1:0))+'°'+(unit(u)==='°C'?'C':'F');
  function read(states,connected,haUnit) {
    const state=states[entity()], a=state?.attributes||{}, sensed=states[sensor()], nativeUnit=unit(a.temperature_unit||haUnit||sensed?.attributes.unit_of_measurement);
    const current=number(a.current_temperature)??(valid(sensed)?convert(number(sensed.state),sensed.attributes.unit_of_measurement,nativeUnit):null);
    const routine=period=>{
      const temp=states['input_number.'+period+'_temperature'],temperatureF=valid(temp)?number(temp.state):null,minF=number(temp?.attributes.min),maxF=number(temp?.attributes.max),stepF=number(temp?.attributes.step);
      return {ready:!!(connected&&temperatureF!==null&&minF!==null&&maxF!==null&&minF<=maxF&&temperatureF>=minF&&temperatureF<=maxF&&stepF>0),temperatureF,minF,maxF,stepF};
    };
    const toggle=states['input_boolean.comfort_schedule_enabled'],dayTime=states['input_datetime.day_temperature_time'],time=/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(dayTime?.state||'')?dayTime.state.slice(0,5):null;
    return {id:entity(),available:!!(connected&&valid(state)),current,target:valid(state)?number(a.temperature):null,unit:nativeUnit,mode:valid(state)?state.state:null,modes:(a.hvac_modes||[]).filter(x=>['off','heat','cool'].includes(x)),action:a.hvac_action||null,min:number(a.min_temp),max:number(a.max_temp),step:number(a.target_temp_step)||1,at:Date.parse(state?.last_updated||sensed?.last_updated)||null,night:routine('night'),wake:routine('wake'),day:routine('day'),comfort:{enabled:toggle?.state==='on',ready:!!connected&&['on','off'].includes(toggle?.state),period:['night','wake','day'].includes(states['input_select.comfort_period']?.state)?states['input_select.comfort_period'].state:null,dayTime:time,timeReady:!!connected&&!!time}};
  }

  function command(action,p,c) {
    if(!c||!entity())throw Error('Thermostat is not connected');
    if(action==='climate.mode') {
      if(!c.available||!c.modes.includes(p.mode))throw Error('Thermostat mode is unavailable');
      return {domain:'climate',service:'set_hvac_mode',target:{entity_id:c.id},service_data:{hvac_mode:p.mode}};
    }
    if(action==='climate.step') {
      if(!c.available||c.target==null||c.min==null||c.max==null||![-1,1].includes(p.delta))throw Error('Choose Heat or Cool to see its setpoint');
      const value=+(O.clamp(c.target+p.delta*c.step,c.min,c.max)).toFixed(2);
      if(value===c.target)throw Error('Setpoint is at its limit');
      return {domain:'climate',service:'set_temperature',target:{entity_id:c.id},service_data:{temperature:value}};
    }
    if(action==='climate.comfort.enabled') {
      if(!c.comfort?.ready||typeof p.enabled!=='boolean')throw Error('Comfort schedule is unavailable');
      return {domain:'input_boolean',service:p.enabled?'turn_on':'turn_off',target:{entity_id:'input_boolean.comfort_schedule_enabled'},service_data:{}};
    }
    if(action==='climate.day.time') {
      if(!c.comfort?.timeReady||![-15,15].includes(p.delta))throw Error('Day start time is unavailable');
      const [h,m]=c.comfort.dayTime.split(':').map(Number),n=((h*60+m+p.delta)%1440+1440)%1440;
      return {domain:'input_datetime',service:'set_datetime',target:{entity_id:'input_datetime.day_temperature_time'},service_data:{time:O.fmt.pad(Math.floor(n/60))+':'+O.fmt.pad(n%60)+':00'}};
    }
    const m=/^climate\.(night|wake|day)\.step$/.exec(action);
    if(!m||!c[m[1]]?.ready)throw Error('Temperature settings are unavailable');
    const r=c[m[1]],period=m[1];
    if(![-1,1].includes(p.delta))throw Error('Choose an adjustment');
    const value=+O.clamp(r.temperatureF+p.delta*r.stepF,r.minF,r.maxF).toFixed(2);
    if(value===r.temperatureF)throw Error('Temperature is at its limit');
    return {domain:'input_number',service:'set_value',target:{entity_id:'input_number.'+period+'_temperature'},service_data:{value}};
  }

  O.climate={get entity(){return entity();},get sensor(){return sensor();},read,command,convert,fmt,mode:m=>({off:'Off',heat:'Heat',cool:'Cool'}[m]||'Unavailable'),activity:a=>({idle:'Idle',off:'Not running',heating:'Heating',cooling:'Cooling',preheating:'Preheating',defrosting:'Defrosting',fan:'Running'}[a]||null)};
})();
