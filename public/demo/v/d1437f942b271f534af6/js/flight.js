/* Flight Director guides. Generic ascent estimates are never vehicle telemetry. */
(function () {
  'use strict';
  const O=window.OW, cache=new Map();
  function estimate(l,now) {
    const elapsed=(now-l.net)/1000;
    if(!/^in flight$/i.test(l.status)||elapsed<0||elapsed>540)return null;
    const t=O.clamp(elapsed,0,520), p=(t-150)/370;
    return {altitude:t<=150?80*Math.pow(t/150,2):80+120*(1-Math.pow(1-p,2)),speed:t<=150?8000*Math.pow(t/150,1.6):8000+19000*Math.pow(p,1.15),pitch:Math.max(0,90*(1-Math.pow(t/480,.7)))};
  }
  function selectPad(hourly,net) {
    const times=hourly?.time||[],target=net/1000;
    if(!times.length||target<times[0]||target>times.at(-1)+3600)return null;
    let i=0;times.forEach((t,j)=>{if(Math.abs(t-target)<Math.abs(times[i]-target))i=j;});
    const number=k=>typeof hourly[k]?.[i]==='number'?hourly[k][i]:null;
    const wind=number('wind_speed_10m'),cloud=number('cloud_cover'),rain=number('precipitation_probability');
    if(wind===null&&cloud===null&&rain===null)return null;
    return {at:times[i]*1000,wind,cloud,rain,gust:number('wind_gusts_10m')};
  }
  function key(l) {return [l.id,l.net,l.padLat,l.padLon].join(':');}
  function loadPad(l) {
    if(!Number.isFinite(l.padLat)||!Number.isFinite(l.padLon)||!l.precise)return null;
    const k=key(l),old=cache.get(k);if(old&&Date.now()-old.fetched<1800000)return null;
    const entry={fetched:Date.now(),data:null};cache.set(k,entry);
    const url='https://api.open-meteo.com/v1/forecast?latitude='+l.padLat.toFixed(3)+'&longitude='+l.padLon.toFixed(3)+'&hourly=wind_speed_10m,wind_gusts_10m,cloud_cover,precipitation_probability&timeformat=unixtime&forecast_days=10&timezone=UTC';
    return O.net.json(url,1800).then(r=>{entry.data=selectPad(r.data?.hourly,l.net);return entry.data;}).catch(()=>null);
  }
  O.flight={estimate,selectPad,loadPad,pad:l=>cache.get(key(l))?.data||null};
})();
