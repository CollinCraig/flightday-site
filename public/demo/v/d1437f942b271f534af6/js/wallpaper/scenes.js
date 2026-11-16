/* Canvas 2D scenes. All motion derives from the supplied scene time. */
(function(){'use strict';const W=window.OW.wallpaper,R=Math.PI/180;
W.draw=(c,w,h,s)=>{const t=s.now/1000;c.clearRect(0,0,w,h);c.fillStyle='#060912';c.fillRect(0,0,w,h);
if(s.scene==='stars'){
 c.strokeStyle=s.night?'#100704':'#10121e';c.lineWidth=h*.07;c.beginPath();for(let j=0;j<40;j++){const p=W.horizontal(s.now,s.lat,s.lon,j*9,25*Math.sin(j/40*Math.PI*2));const x=p.az/360*w,y=h*(1-p.el/90);j?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();
 for(const [ra,dec,mag,ci] of W.catalog||[]){const p=W.horizontal(s.now,s.lat,s.lon,ra,dec);if(p.el<0)continue;c.fillStyle=s.night?'#251006':ci!==null&&ci>.8?'#9b8471':ci!==null&&ci<0?'#78869c':'#858a9b';c.globalAlpha=Math.max(.15,(6-mag)/7);c.beginPath();c.arc(p.az/360*w,h*(1-p.el/90),Math.max(.4,(5.5-mag)*.32),0,7);c.fill();}c.globalAlpha=1;
 const m=W.moon(s.now),p=W.horizontal(s.now,s.lat,s.lon,m.ra,m.dec);if(p.el>0){const x=p.az/360*w,y=h*(1-p.el/90),r=h*.012;c.save();c.translate(x,y);c.fillStyle=s.night?'#251006':'#9a9ba1';const phase=Math.cos(m.phase*2*Math.PI),waxing=m.phase<.5;for(let py=-r;py<r;py+=.5){const edge=Math.sqrt(Math.max(0,r*r-py*py)),boundary=(waxing?phase:-phase)*edge;c.fillRect(waxing?boundary:-edge,py,waxing?edge-boundary:boundary+edge,.6);}c.restore();}return;
}
const neutral=s.scene==='weather'&&!s.wx.fresh,e=neutral?-8:(s.sun?.el??-12),g=c.createLinearGradient(0,0,0,h);const palette=W.skyPalette(e);g.addColorStop(0,palette[0]);g.addColorStop(1,palette[1]);c.fillStyle=g;c.fillRect(0,0,w,h);
if(s.scene==='sky'&&s.sun&&e> -18){c.fillStyle=e<0?'#9d6041':'#a59a7a';c.beginPath();c.arc(s.sun.az/360*w,h*(.8-e/120),h*.025,0,7);c.fill();}
const cloud=s.scene==='weather'?s.wx.cloud/100:.18;c.fillStyle='#76808c';c.globalAlpha=cloud*.16;for(let k=0;k<12;k++){const x=((k*.131*w+t*(1+k%3)*.7)%(w*1.2))-.1*w;c.beginPath();c.ellipse(x,h*(.12+(k%4)*.09),w*.16,h*.022,0,0,7);c.fill();}c.globalAlpha=1;
if(s.scene==='weather'&&s.wx.rain){c.strokeStyle='#697486';c.fillStyle='#697486';for(let k=0;k<90;k++){const x=((k*73.37+t*(s.wx.snow?4:17))%w),y=(k*137+t*(s.wx.snow?12:210))%h;c.beginPath();if(s.wx.snow){c.arc(x,y,1.3,0,7);c.fill();}else{c.moveTo(x,y);c.lineTo(x-3,y+9);c.stroke();}}}
// Dark scrim; clock and credit live in independent fixed slots above this layer.
c.fillStyle='rgba(0,0,0,.55)';c.fillRect(0,0,w,h);
};})();
