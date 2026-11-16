/* Cached HA sources: weatherProvider → Apple Weather → Open-Meteo. No vendor calls or integration refresh. */
(function () {
  const OW = window.OW, entities=()=> (OW.roles.get('weather')||[]).filter(id=>id!=='open_meteo');
  const label=id=>{const p=(OW.data?.provider?.reg?.[id]||OW.model.registry?.[id])?.platform;return p==="weatherProvider"?"Weather provider":p==='weatherkit'?'Apple Weather':OW.data?.provider?.states?.[id]?.attributes?.friendly_name||'Home Assistant';};
  const APPLE_ATTRIBUTION='https://weatherkit.apple.com/legal-attribution.html';
  const CURRENT_AGE = 90*60000, FORECAST_AGE = 6*3600000;
  const number = value => value !== null && value !== undefined && value !== '' && ['number','string'].includes(typeof value) && Number.isFinite(Number(value)) ? Number(value) : null;
  const fresh = (at, age, now) => Number.isFinite(at) && at > 0 && at <= now + 5*60000 && now - at < age;
  const stamp = state => Date.parse(state?.last_updated); // Never use receipt/reconnect time as observation time.
  const conditions = {sunny:['clear','Sunny'],'clear-night':['clear','Clear'],cloudy:['cloudy','Cloudy'],partlycloudy:['cloudy','Partly cloudy'],rainy:['rain','Rain'],pouring:['rain','Heavy rain'],lightning:['storm','Thunderstorm'],'lightning-rainy':['storm','Thunderstorm'],snowy:['snow','Snow'],'snowy-rainy':['snow','Sleet'],fog:['cloudy','Fog'],windy:['cloudy','Windy'],'windy-variant':['cloudy','Windy'],hail:['storm','Hail'],exceptional:['cloudy','Exceptional conditions']};
  function temperature(value, from, to) {
    const n = number(value); if (n === null || !['°F','°C'].includes(from)) return null;
    return Math.round(from === to ? n : to === '°C' ? (n-32)*5/9 : n*9/5+32);
  }
  function forecast(cache, type, from, to, now) {
    if (!cache || !fresh(cache.at, FORECAST_AGE, now) || !Array.isArray(cache.rows)) return [];
    const today = new Date(now); today.setHours(0,0,0,0);
    return cache.rows.map(row => {
      if (!row || typeof row!=='object') return null;
      const t=Date.parse(row.datetime), temp=temperature(row.temperature,cache.unit || from,to), c=conditions[row.condition];
      if (!Number.isFinite(t) || temp === null || !c || (type==='hourly' ? t < now-30*60000 || t > now+36*3600000 : t < +today || t > +today+7*86400000)) return null;
      const pop=number(row.precipitation_probability);
      return {t,temp,low:temperature(row.templow,cache.unit || from,to),condition:c[0],text:c[1],night:row.condition==='clear-night',pop:pop===null?null:OW.clamp(pop,0,100)};
    }).filter(Boolean).sort((a,b)=>a.t-b.t).slice(0,type==='hourly'?12:5);
  }
  function forecastEvidence(cache,unit){return {as_of:cache?.at,hourly:(Array.isArray(cache?.rows)?cache.rows:[]).filter(r=>r&&typeof r==='object').map(r=>({t:Date.parse(r.datetime),precip_prob:number(r.precipitation_probability),precip_mm:number(r.precipitation)==null?null:number(r.precipitation)*(['in','inches'].includes(unit)?25.4:1)})).filter(r=>Number.isFinite(r.t))};}
  function credit(w) {
    if (!w) return '';
    if (OW.demo?.active) return 'Sample data';
    const primary=w.source || 'Open-Meteo', extras=[];
    if (w.hours?.length && w.hoursSource && w.hoursSource!==primary) extras.push('hourly: '+w.hoursSource);
    if (w.high!=null && w.dailySource && w.dailySource!==primary) extras.push('high/low: '+w.dailySource);
    if (w.feels!=null && w.feelsSource && w.feelsSource!==primary) extras.push('feels like: '+w.feelsSource);
    if (OW.rainNowcast?.visible(w) && w.nowcast?.source && w.nowcast.source!==primary) extras.push('rain: '+w.nowcast.source);
    return [primary,...extras].join(' · ');
  }
  OW.weatherSource = {get entity(){return entities()[0]||null;},get appleEntity(){return entities().find(id=>label(id)==='Apple Weather')||null;},get entities(){return entities();},appleAttribution:APPLE_ATTRIBUTION,
    usesApple:w=>!!w&&(w.source==='Apple Weather'||(w.hours?.length>0&&w.hoursSource==='Apple Weather')||(w.high!=null&&w.dailySource==='Apple Weather')||(w.feels!=null&&w.feelsSource==='Apple Weather')),currentAge:CURRENT_AGE,forecastAge:FORECAST_AGE,number,stamp,fresh,credit,forecastEvidence,
    select({base,states={},forecasts={},connected=false,units='f',now=Date.now()}) {
      const unit=units==='c'?'°C':'°F';
      // Do not mix a previous unit's cached fallback with newly converted HA data.
      let w=base && (!base.temperatureUnit || base.temperatureUnit===unit) ? {...base,hours:(base.hours||[]).filter(h=>h.t>=now-30*60000),source:'Open-Meteo',hoursSource:'Open-Meteo',dailySource:'Open-Meteo',feelsSource:'Open-Meteo',feelsLabel:'Feels like'} : null;
      if (!connected) return w;
      // Layer lower priority first. Missing sections retain their own credited fallback.
      for (const [entity,name] of entities().slice().reverse().map(id=>[id,label(id)])) {
        const state=states[entity], a=state?.attributes || {}, at=stamp(state), c=conditions[state?.state];
        const temp=temperature(a.temperature,a.temperature_unit,unit);
        if (!c || temp===null || !fresh(at,CURRENT_AGE,now)) continue;
        const cache=forecasts[entity] || (entity===entities()[0]?forecasts:{});
        const hours=forecast(cache.hourly,'hourly',a.temperature_unit,unit,now),days=forecast(cache.daily,'daily',a.temperature_unit,unit,now);
        const today=days.find(d=>new Date(d.t).toDateString()===new Date(now).toDateString());
        const sensor=entity===entities()[0]?states[OW.roles.get('weather_feels_like')]:null;
        const realfeel=fresh(stamp(sensor),CURRENT_AGE,now)?temperature(sensor?.state,sensor?.attributes?.unit_of_measurement,unit):null;
        const apparent=realfeel ?? temperature(a.apparent_temperature,a.temperature_unit,unit);
        w={unit:'°',high:null,low:null,feels:null,note:'',sunrise:null,sunset:null,alert:null,hours:[],...w,
          source:name,temperatureUnit:unit,temp,condition:c[0],text:c[1],at,observedAt:at,stale:false,night:state.state==='clear-night'};
        if(apparent!==null){w.feels=apparent;w.feelsLabel=name==="Weather provider"?'RealFeel':'Feels like';w.feelsSource=name;}
        if(hours.length){const evidence=forecastEvidence(cache.hourly,a.precipitation_unit);w.hours=hours;w.hoursSource=name;w.forecastAt=evidence.as_of;w.forecastHours=evidence.hourly;}
        if(today){w.high=today.temp;w.low=today.low;w.dailySource=name;}
        w.summary=c[1]+(w.night?' tonight':' today')+(w.high!==null?', '+w.high+'°':'');
        w.note='';
      }
      return w;
    },
    range(w) { return [w?.high!=null ? 'high '+w.high+'°' : '', w?.low!=null ? 'low '+w.low+'°' : ''].filter(Boolean).join(' · '); },
    feel(w) { return w?.feels!=null ? (w.feelsLabel || 'Feels like')+' '+w.feels+'°' : ''; },
    remember(previous, rows, now=Date.now(), unit) {
      if (!Array.isArray(rows)) return null;
      // Identical cached HA payloads never become fresh just because a screen reconnects.
      return previous && previous.unit===unit && JSON.stringify(previous.rows)===JSON.stringify(rows) ? previous : {at:now,rows,unit};
    },
  };
})();
