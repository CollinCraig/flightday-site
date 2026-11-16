/* Replaceable source boundary: adapters return {source, fetchedAt, resolutionMinutes, points}.
 * Each point is {start, end, wet, intensity, amountMm?, probability?}. No networking lives in the presenter. */
(function () {
  const OW=window.OW, MINUTE=60000, HORIZON=120*MINUTE, MAX_AGE=30*MINUTE;
  const numeric=v=>['number','string'].includes(typeof v)&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  function time(value, offset) {
    if (typeof value==='number') return value<1e12?value*1000:value;
    if (typeof value!=='string') return NaN;
    return /(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(offset)?Date.parse(value):Date.parse(value+'Z')-offset*1000;
  }
  const openMeteo={
    fromResponse(data,{fetchedAt=(OW.nowMs?OW.nowMs():Date.now()),stale=false}={}) {
      const series=data?.minutely_15, unit=data?.minutely_15_units?.precipitation;
      if (stale || !Array.isArray(series?.time) || !Array.isArray(series?.precipitation) || (unit && unit!=='mm')) return null;
      const points=new Map();
      series.time.forEach((value,i)=>{
        // Open-Meteo precipitation is the sum of the preceding 15 minutes, labelled by its end.
        const end=time(value,data.utc_offset_seconds), amount=numeric(series.precipitation[i]), p=numeric(series.precipitation_probability?.[i]);
        if (!Number.isFinite(end)||amount===null||amount<0) return;
        points.set(end,{start:end-15*MINUTE,end,wet:amount>=.1,intensity:amount<1?'light':amount<=4?'moderate':'heavy',amountMm:amount,probability:p===null?null:OW.clamp(p,0,100)});
      });
      return points.size ? {source:'Open-Meteo',fetchedAt,resolutionMinutes:15,points:[...points.values()].sort((a,b)=>a.start-b.start)} : null;
    },
  };
  const appleMaxAge=5*MINUTE;
  const attributionUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='weatherkit.apple.com'&&u.pathname==='/legal-attribution.html'&&!u.username&&!u.password?u.href:null;}catch(_){return null;}};
  const iso=value=>typeof value==='string'&&/(?:Z|[+-]\d\d:\d\d)$/.test(value)?Date.parse(value):NaN;
  function sampleNowcast(data,now){
    if(!OW.demo?.active||data.source!=='demo'||data.unavailable||!Array.isArray(data.minutes))return null;
    const at=iso(data.as_of);if(!Number.isFinite(at))return null;
    const points=data.minutes.map((row,i)=>{const start=iso(row.t),end=i+1<data.minutes.length?iso(data.minutes[i+1].t):start+5*MINUTE;return {start,end,wet:row.intensity_mm_h>=.4,intensity:row.intensity_mm_h<1?'light':row.intensity_mm_h<=4?'moderate':'heavy',probability:row.chance*100};});
    if(points.some(p=>!Number.isFinite(p.start)||!Number.isFinite(p.end)))return null;
    return {source:'Sample data',fetchedAt:at,receivedAt:now,expiresAt:now+5*MINUTE,resolutionMinutes:5,summary:data.summary,points};
  }
  const wallhub={fromResponse(data,{now=(OW.nowMs?OW.nowMs():Date.now())}={}){
    if(data?.source==='demo')return sampleNowcast(data,now);
    const asOf=iso(data?.as_of),attribution=attributionUrl(data?.attribution_url);
    if(data?.source!=='apple'||data.unavailable===true||!attribution||!Number.isFinite(asOf)||asOf>now+MINUTE||now-asOf>=15*MINUTE||!Array.isArray(data.minutes)||!data.minutes.length||data.minutes.length>60||!(data.summary===null||typeof data.summary==='string'))return null;
    const points=[];
    for(const row of data.minutes){
      const start=iso(row.t),rate=row.intensity_mm_h,chance=row.chance;
      if(!Number.isFinite(start)||typeof rate!=='number'||!Number.isFinite(rate)||rate<0||typeof chance!=='number'||!Number.isFinite(chance)||chance<0||chance>1||(points.length&&start!==points.at(-1).end))return null;
      const amount=rate/4;points.push({start,end:start+MINUTE,wet:amount>=.1,intensity:amount<1?'light':amount<=4?'moderate':'heavy',amountMm:amount,probability:chance*100});
    }
    if(!points.some(p=>p.start<=now&&p.end>now))return null;
    return {source:'Apple Weather',fetchedAt:asOf,receivedAt:now,expiresAt:Math.min(now+appleMaxAge,asOf+15*MINUTE),resolutionMinutes:1,summary:data.summary,attributionUrl:attribution,points};
  }};
  function usable(snapshot,now=(OW.nowMs?OW.nowMs():Date.now())){
    return !!snapshot&&Number.isFinite(snapshot.fetchedAt)&&snapshot.fetchedAt<=now+5*MINUTE&&now-snapshot.fetchedAt<MAX_AGE&&(!snapshot.expiresAt||now<snapshot.expiresAt)&&Array.isArray(snapshot.points)&&snapshot.points.some(p=>p.start<=now&&p.end>now);
  }
  function select(apple,fallback,now=(OW.nowMs?OW.nowMs():Date.now())){return usable(apple,now)?apple:usable(fallback,now)?fallback:null;}
  function credit(w,id='apple-weather'){
    if(OW.demo?.active)return '';
    const n=w?.nowcast,forecast=OW.weatherSource?.usesApple(w),rain=n?.source==='Apple Weather'&&usable(n)&&!bedroomNight(w)&&attributionUrl(n.attributionUrl);
    if(!forecast&&!rain)return '';
    const url=rain?n.attributionUrl:OW.weatherSource.appleAttribution,label=forecast?(rain?'Forecast & next-hour rain':'Forecast'):'Next-hour rain';
    return '<button type="button" class="apple-weather-credit" data-focus data-fid="'+OW.esc(id)+'" data-act="weather.attribution" data-arg="'+OW.esc(url)+'" aria-label="Apple Weather attribution"><span>'+label+'</span><img src="img/apple-weather-light.png" alt="Apple Weather"></button>';
  }

  function openAttribution(value){
    const url=attributionUrl(value);if(!url)return false;
    try{const N=window.flightdayNative;if(N)return typeof N.openWeatherAttribution==='function'?N.openWeatherAttribution(url)===true:typeof N.openUrl==='function'&&N.openUrl(url)===true;window.open(url,'_blank','noopener,noreferrer');return true;}catch(_){return false;}
  }
  function summary(snapshot,now=(OW.nowMs?OW.nowMs():Date.now())) {
    if (!usable(snapshot,now) || !Number.isFinite(snapshot.fetchedAt) || snapshot.fetchedAt>now+5*MINUTE || now-snapshot.fetchedAt>=MAX_AGE || !Array.isArray(snapshot.points)) return null;
    if(snapshot.source==='Sample data'&&Object.hasOwn(snapshot,'summary'))return snapshot.summary===null?null:'Rain starting ~'+clock(Date.parse(snapshot.summary.at))+' · '+snapshot.summary.intensity;
    // The hub owns next-hour wording; null is authoritative dry, even if minute data differs.
    if(snapshot.source==='Apple Weather'&&Object.hasOwn(snapshot,'summary'))return snapshot.summary===null?null:snapshot.summary.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g,value=>Number.isFinite(Date.parse(value))?clock(Date.parse(value)):value);
    const points=snapshot.points.filter(p=>p&&Number.isFinite(p.start)&&Number.isFinite(p.end)&&p.end>p.start&&typeof p.wet==='boolean'&&p.end>now&&p.start<=now+HORIZON).sort((a,b)=>a.start-b.start);
    const current=points.findIndex(p=>p.start<=now&&p.end>now);if(current<0)return null;
    let cursor=points[current].end;
    if (points[current].wet) {
      for(let i=current+1;i<points.length;i++){
        const p=points[i];if(p.start>cursor+1000)break;
        if(!p.wet){const minutes=Math.max(1,Math.ceil((p.start-now)/MINUTE));return 'Rain for the next '+minutes+' min, ending ~'+clock(p.start);}
        cursor=Math.max(cursor,p.end);
      }
      return null; // The fixed copy requires a known ending; do not invent one or add another text form.
    }
    for(let i=current+1;i<points.length;i++){
      const p=points[i];if(p.start>cursor+1000)return null;
      if(p.wet)return ['light','moderate','heavy'].includes(p.intensity)?'Rain starting ~'+clock(p.start)+' · '+p.intensity:null;
      cursor=Math.max(cursor,p.end);
    }
    return null;
  }
  function clock(at){return OW.fmt.hm(at);}
  function bedroomNight(w) {
    const bedroom=OW.model?.isBedroom();
    if(!bedroom)return false;
    if(OW.app?.night || OW.data?.state?.launch?.sleeping)return true;
    const now=OW.now(), minute=now.getHours()*60+now.getMinutes(), rise=new Date(w?.sunrise), set=new Date(w?.sunset);
    if(w?.sunrise && w?.sunset && Number.isFinite(+rise) && Number.isFinite(+set))return minute<rise.getHours()*60+rise.getMinutes() || minute>=set.getHours()*60+set.getMinutes();
    return w?.night===true || now.getHours()<6 || now.getHours()>=20;
  }
  function visible(w){return !bedroomNight(w)?summary(w?.nowcast):null;}
  function html(w){const message=visible(w);return message?'<div class="rain-soon" data-source="'+OW.esc(w.nowcast.source)+'" title="'+OW.esc(w.nowcast.source+' · '+w.nowcast.resolutionMinutes+' min forecast')+'">'+OW.esc(message)+'</div>':'';}
  OW.rainNowcast={timestamp:time,adapters:{openMeteo,wallhub},summary,visible,html,bedroomNight,select,usable,credit,openAttribution,attributionUrl,appleMaxAge,maxAge:MAX_AGE,horizon:HORIZON};
})();
