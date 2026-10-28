'use strict';
(() => {
  const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const TAU = Math.PI * 2, AMBIENT = 25;
  const colors = { '完美': '#c0e49a', '良好': '#c5d6b6', '冷焊': '#b7c6cf', '锡过多': '#f0ba74', '过热': '#f48663' };
  const specs = [
    [-235,-95,'R1 · 左引脚','r1'],[-65,-95,'R1 · 右引脚','r1'],
    [-180,110,'R2 · 左引脚','r2'],[-10,110,'R2 · 右引脚','r2'],
    [175,-5,'D1 · 正极','d1'],[240,-5,'D1 · 负极','d1']
  ];
  let joints, active, lastJoint, score, combo, maxCombo, elapsed, started, finished;
  let width=0,height=0,scale=1,centerY=0,dpr=1,sceneTime=0,shake=0;
  let mouse={x:0,y:0,visible:false}, left=false, right=false, space=false;
  let touchHeat=false,touchFeed=false,pointerHeat=null,pointerFeed=null;
  let particles=[],popups=[],lastFrame=0,lastHud=0,muted=false,audio=null;
  let boardCache=document.createElement('canvas');
  const boardCtx=boardCache.getContext('2d');
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  function rr(c,x,y,w,h,r,fill,stroke){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}}
  function line(c,points,color,w=1){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=w;c.stroke();}
  function ellipse(c,x,y,rx,ry,fill,stroke){c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}}
  function text(c,str,x,y,size,color,align='left'){c.font=`${size}px "Microsoft YaHei", sans-serif`;c.textAlign=align;c.fillStyle=color;c.fillText(str,x,y);}
  function reset(){
    joints=specs.map(([x,y,name,part],i)=>({id:i,x,y,name,part,temp:25,peak:25,heat:0,contact:0,tin:0,wet:0,thermalSum:0,thermalMass:0,damage:0,overTime:0,settled:false,quality:null,points:0,bridge:false}));
    active=null;lastJoint=null;score=0;combo=0;maxCombo=0;elapsed=0;started=false;finished=false;particles=[];popups=[];shake=0;
    releaseInputs();if($('summary').open)$('summary').close();updateHUD();
  }
  function releaseInputs(){left=right=space=touchHeat=touchFeed=false;pointerHeat=pointerFeed=null;}
  function initAudio(){
    if(audio){if(audio.context.state==='suspended')audio.context.resume().catch(()=>{});return;}
    try{
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
      const context=new Audio(),buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate);
      const data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
      const source=context.createBufferSource();source.buffer=buffer;source.loop=true;
      const filter=context.createBiquadFilter();filter.type='bandpass';filter.frequency.value=1700;filter.Q.value=.7;
      const gain=context.createGain();gain.gain.value=0;source.connect(filter).connect(gain).connect(context.destination);source.start();
      audio={context,gain,filter};
    }catch{/* Browsers without audio can still play. */}
  }
  function chime(perfect){if(!audio||muted)return;const a=audio.context,t=a.currentTime;[perfect?880:330,perfect?1320:260].forEach((f,i)=>{const o=a.createOscillator(),g=a.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,t+i*.085);g.gain.linearRampToValueAtTime(.11,t+i*.085+.01);g.gain.exponentialRampToValueAtTime(.001,t+i*.085+.4);o.connect(g).connect(a.destination);o.start(t+i*.085);o.stop(t+i*.085+.42);});}
  function boardPoint(x,y){const a=-.105;return{x:width/2+scale*(x*Math.cos(a)-y*Math.sin(a)),y:centerY+scale*(x*Math.sin(a)+y*Math.cos(a))};}
  function localPoint(x,y){const a=.105,dx=(x-width/2)/scale,dy=(y-centerY)/scale;return{x:dx*Math.cos(a)-dy*Math.sin(a),y:dx*Math.sin(a)+dy*Math.cos(a)};}
  function resize(){const r=canvas.getBoundingClientRect();width=r.width;height=r.height;dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);scale=Math.min((width-35)/760,(height-240)/470);centerY=98+(height-260)/2;if(width<400){scale=Math.min((width-18)/760,(height-290)/520);centerY=110+(height-310)/2;}buildBoard();}
  function buildBoard(){
    const factor=Math.max(1,Math.min(2,scale*dpr));boardCache.width=800*factor;boardCache.height=530*factor;
    const c=boardCtx;c.setTransform(factor,0,0,factor,400*factor,265*factor);
    rr(c,-352,-207,704,426,20,'#07130d');rr(c,-350,-216,700,425,18,'#233b22','#72874e');
    const bg=c.createLinearGradient(-350,-216,350,210);bg.addColorStop(0,'#285944');bg.addColorStop(.38,'#194a36');bg.addColorStop(1,'#0c2e22');rr(c,-350,-216,700,416,16,bg,'#6d8e54');
    rr(c,-333,-200,666,382,7,null,'#70966750');
    // Deterministic copper traces and vias, cached so animation stays lightweight.
    for(let i=0;i<22;i++){
      const x=-290+i*26;line(c,[[x,160],[x,138],[x+28,110],[x+28,25+(i%4)*12],[x+67,-14+(i%4)*12],[x+67,-166]],i%3?'#a5b15e45':'#cad08a75',i%4===0?2:1.2);
      for(const yy of [-166,160]){ellipse(c,x+(yy<0?67:0),yy,4,4,'#2b573a','#c0bb7e');ellipse(c,x+(yy<0?67:0),yy,1.7,1.7,'#0b2419');}
    }
    const paths=[ [[-235,-95],[-275,-95],[-275,-140],[-65,-140],[-65,-95]], [[-65,-95],[-25,-95],[15,-55],[175,-55],[175,-5]], [[-180,110],[-220,110],[-245,85],[-245,10],[-235,0],[-235,-95]], [[-10,110],[70,110],[110,70],[240,70],[240,-5]], [[175,-5],[175,22],[145,52],[145,145],[285,145]] ];
    paths.forEach(p=>{line(c,p,'#061e15',11);line(c,p,'#adbb7188',5);line(c,p,'#decb7b40',1);});
    for(let i=0;i<210;i++){const x=-328+((i*137)%650),y=-190+((i*71)%360);ellipse(c,x,y,.6,.6,'#bde69a14');}
    for(const x of [-320,320])for(const y of [-185,170]){ellipse(c,x,y,13,13,'#afaa6c','#2b391d');ellipse(c,x,y,8,8,'#06140d','#d1bd7b');ellipse(c,x-1,y-2,5,4,'#020905');}
    text(c,'焊接大师 / 入门练习板',-285,-171,12,'#c6dfb399');text(c,'01',285,-155,30,'#b5ce9e50','right');
    text(c,'六个连接 · 无限可能',-285,165,9,'#b5ce9e88');text(c,'练习板 01    /    无铅工艺',285,165,9,'#b5ce9e88','right');
    text(c,'R1   220Ω',-150,-135,11,'#d3dfb6','center');text(c,'R2   1kΩ',-95,70,11,'#d3dfb6','center');text(c,'D1   红色发光二极管',200,-92,10,'#d3dfb6','center');
    rr(c,-258,-119,216,51,6,null,'#ccdfad55');rr(c,-203,86,216,50,6,null,'#ccdfad55');ellipse(c,207,-37,50,36,null,'#ccdfad55');
    text(c,'+',164,26,16,'#d3dfb6');text(c,'−',239,26,16,'#d3dfb6');
    // Small fixed support components make the board feel manufactured.
    for(let i=0;i<5;i++){const x=-150+i*38;rr(c,x,-18,19,37,3,'#101a15','#405340');rr(c,x-2,-18,23,7,1,'#a2b49b');rr(c,x-2,12,23,7,1,'#9caa92');text(c,'102',x+9,5,6,'#899d82','center');}
    rr(c,50,-148,61,56,4,'#121d19','#63795e');for(let i=0;i<6;i++){rr(c,46,-142+i*8,5,3,0,'#a0aa8b');rr(c,110,-142+i*8,5,3,0,'#a0aa8b');}text(c,'练习',80,-121,10,'#7f9276','center');text(c,'控制芯片',80,-106,7,'#7f9276','center');
    for(let i=0;i<8;i++){rr(c,25+i*24,121,18,23,2,'#151c14','#5b6c4c');rr(c,31+i*24,128,6,8,1,'#c2ab64');}
  }
  function drawResistor(x,y){
    ctx.save();ctx.translate(x,y);ctx.shadowColor='#000a';ctx.shadowBlur=9;ctx.shadowOffsetY=8;
    line(ctx,[[-85,0],[-64,-10],[-36,-10]],'#6b7564',7);line(ctx,[[36,-10],[64,-10],[85,0]],'#6b7564',7);ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    line(ctx,[[-85,-2],[-63,-12],[-36,-12]],'#d6dec1',2);line(ctx,[[36,-12],[63,-12],[85,-2]],'#d6dec1',2);
    const g=ctx.createLinearGradient(0,-30,0,9);g.addColorStop(0,'#bc8d53');g.addColorStop(.3,'#f2d79c');g.addColorStop(.65,'#c3955b');g.addColorStop(1,'#684725');rr(ctx,-47,-31,94,39,17,g,'#d4ac6e');
    ['#793822','#8e3d28','#3e3021','#bd9a43'].forEach((color,i)=>{ctx.fillStyle=color;ctx.fillRect(-29+i*18,-30,7,37);});
    const gloss=ctx.createLinearGradient(0,-30,0,7);gloss.addColorStop(0,'#fff6ca00');gloss.addColorStop(.28,'#fff6ca66');gloss.addColorStop(.5,'#fff6ca00');gloss.addColorStop(1,'#0005');rr(ctx,-47,-31,94,39,17,gloss);ctx.restore();
  }
  function drawLED(){
    const done=joints.slice(4).every(j=>j.settled&&['完美','良好'].includes(j.quality)&&!j.bridge);
    line(ctx,[[175,-5],[183,-22],[190,-28]],'#c8d2bb',4);line(ctx,[[240,-5],[235,-22],[226,-28]],'#c8d2bb',4);
    ctx.save();ctx.shadowColor=done?'#ff3018':'#0009';ctx.shadowBlur=done?32:12;ctx.shadowOffsetY=5;
    ellipse(ctx,208,-32,31,15,'#5c1812','#b96541');
    const g=ctx.createRadialGradient(197,-66,2,208,-50,35);g.addColorStop(0,done?'#ffefd5':'#ffc19e');g.addColorStop(.2,done?'#ff7551':'#d95536');g.addColorStop(.65,'#941e15');g.addColorStop(1,'#4c1510');
    ctx.beginPath();ctx.moveTo(179,-33);ctx.lineTo(179,-54);ctx.bezierCurveTo(179,-90,237,-90,237,-54);ctx.lineTo(237,-33);ctx.ellipse(208,-33,29,12,0,0,Math.PI);ctx.fillStyle=g;ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;ellipse(ctx,195,-61,4,10,'#ffe4c47f');ctx.restore();
  }
  function drawJoint(j){
    const {x,y,temp,tin}=j,selected=j===active,hot=clamp((temp-200)/210,0,1),liquid=clamp((temp-175)/120,0,1);
    if(j.damage>.1){ellipse(ctx,x,y,22+j.damage*6,19+j.damage*5,'#15180fe0');ellipse(ctx,x+3,y+3,17,15,'#392c19');ctx.beginPath();ctx.moveTo(x-16,y+4);ctx.quadraticCurveTo(x-24,y-11-j.damage*4,x-12,y-16);ctx.lineTo(x-7,y-7);ctx.closePath();ctx.fillStyle='#96734b';ctx.fill();}
    if(hot>0){const glow=ctx.createRadialGradient(x,y,2,x,y,42);glow.addColorStop(0,`rgba(255,177,65,${hot*.55})`);glow.addColorStop(1,'#f9952400');ellipse(ctx,x,y,42,42,glow);}
    const pad=ctx.createLinearGradient(x-14,y-14,x+14,y+14);pad.addColorStop(0,'#f1d794');pad.addColorStop(.4,'#a6924e');pad.addColorStop(1,'#69532c');ellipse(ctx,x,y,17,15,pad,'#bdb784');ellipse(ctx,x,y,9,8,'#14291d','#736f43');
    if(!j.settled){ctx.save();ctx.setLineDash([3,5]);ctx.lineDashOffset=-sceneTime*8;ellipse(ctx,x,y,24,22,null,selected?'#e8dc9c':`rgba(178,212,137,${.38+.18*Math.sin(sceneTime*2+j.id)})`);ctx.restore();}
    if(tin>.015){
      const r=8+Math.min(tin,2.4)*11,over=tin>1.4,gray=j.quality==='冷焊',scorched=j.quality==='过热';
      const g=ctx.createRadialGradient(x-r*.28,y-r*.65,1,x,y,r*1.5);
      g.addColorStop(0,scorched?'#827766':gray?'#a5aaa0':`rgb(${Math.round(212+liquid*43)},${Math.round(221+liquid*34)},${Math.round(207+liquid*48)})`);
      g.addColorStop(.3,gray?'#6c756d':'#c1ccc1');g.addColorStop(.48,scorched?'#60533c':gray?'#7c857b':'#536f68');g.addColorStop(.77,gray?'#858d80':'#bdcfc6');g.addColorStop(1,'#34483d');
      ctx.beginPath();ctx.moveTo(x-r,y+4);if(over){ctx.bezierCurveTo(x-r-3,y-r*1.5,x+r+4,y-r*1.5,x+r,y+4);}else{ctx.bezierCurveTo(x-r*.45,y+1,x-4,y-12,x-3,y-18);ctx.quadraticCurveTo(x,y-22,x+4,y-18);ctx.bezierCurveTo(x+6,y-8,x+r*.45,y+1,x+r,y+4);}ctx.bezierCurveTo(x+r*.6,y+15,x-r*.7,y+15,x-r,y+4);ctx.fillStyle=g;ctx.fill();ctx.strokeStyle=gray?'#647566':'#e0eadd99';ctx.lineWidth=.8;ctx.stroke();
      if(!gray&&!scorched){ctx.beginPath();ctx.moveTo(x-r*.7,y+6);ctx.quadraticCurveTo(x-4,y+7,x-2,y-13);ctx.strokeStyle=`rgba(245,255,236,${.4+liquid*.5})`;ctx.lineWidth=2;ctx.stroke();}
      if(liquid>0.1){ctx.save();ctx.globalAlpha=liquid*.6;const shift=(sceneTime*1.5)%1;ctx.beginPath();ctx.ellipse(x,y+4, r*(.4+shift*.6),4+shift*3,0,.2,Math.PI*.9);ctx.strokeStyle='#ffffdb';ctx.lineWidth=1;ctx.stroke();ctx.restore();}
      if(gray){for(let n=0;n<22;n++){ellipse(ctx,x+Math.sin(n*4.7)*r*.75,y-1+Math.cos(n*2.9)*8,.8,1,n%2?'#bcc1af':'#495b4d');}}
    }
    const pin=ctx.createLinearGradient(x-3,0,x+4,0);pin.addColorStop(0,'#627969');pin.addColorStop(.5,'#edf0d1');pin.addColorStop(1,'#82997c');rr(ctx,x-2.5,y-18,5,20,2,pin);ellipse(ctx,x,y-18,2.5,2,'#f2f0c5');
    if(j.settled){ellipse(ctx,x+23,y-22,9,9,'#14231b',colors[j.quality]);text(ctx,j.quality==='完美'?'✓':j.quality==='良好'?'✓':'!',x+23,y-18,11,colors[j.quality],'center');}
    text(ctx,String(j.id+1).padStart(2,'0'),x,y+37,9,selected?'#e6e9be':'#a3bc9299','center');
  }
  function drawIron(){if(!mouse.visible||finished)return;const p=mouse,hot=active?clamp((active.temp-100)/320,0,1):.1;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-.75);const s=clamp(scale,.58,1);ctx.scale(s,s);ctx.shadowColor='#0009';ctx.shadowOffsetY=16;ctx.shadowOffsetX=10;ctx.shadowBlur=14;
    const metal=ctx.createLinearGradient(0,-18,0,18);metal.addColorStop(0,'#2e332d');metal.addColorStop(.25,'#a3aa8a');metal.addColorStop(.4,'#d2c9a1');metal.addColorStop(.55,'#817b5d');metal.addColorStop(1,'#292f27');
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(82,-13);ctx.lineTo(177,-16);ctx.lineTo(177,17);ctx.lineTo(82,14);ctx.closePath();ctx.fillStyle=metal;ctx.fill();
    rr(ctx,152,-24,40,49,5,'#9a8b5c','#b8ad7e');rr(ctx,187,-30,170,60,13,'#1b211e','#465043');ctx.shadowBlur=0;ctx.shadowOffsetX=ctx.shadowOffsetY=0;
    const grip=ctx.createLinearGradient(0,-28,0,28);grip.addColorStop(0,'#374139');grip.addColorStop(.3,'#272f29');grip.addColorStop(1,'#0b120f');rr(ctx,197,-29,154,58,12,grip);
    for(let i=0;i<12;i++)line(ctx,[[203+i*8,-23],[203+i*8,23]],'#5b655336',2);text(ctx,'恒温 · 415°C',290,4,9,'#98a38c','center');
    const glow=ctx.createRadialGradient(2,0,0,2,0,25);glow.addColorStop(0,`rgba(255,213,121,${hot})`);glow.addColorStop(.3,`rgba(255,133,41,${hot*.45})`);glow.addColorStop(1,'#ffb63c00');ellipse(ctx,2,0,25,25,glow);ctx.restore();
    if(right||space||touchFeed){ctx.save();ctx.shadowBlur=4;ctx.shadowColor='#000';const blocked=active&&active.temp<250;const wobble=blocked?Math.sin(sceneTime*40)*2:0;ctx.beginPath();ctx.moveTo(p.x-140,p.y+100);ctx.quadraticCurveTo(p.x-60,p.y+60,p.x-6+wobble,p.y+3);ctx.strokeStyle='#b8c4b5';ctx.lineWidth=3;ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle='#eef0d3';ctx.lineWidth=.8;ctx.stroke();if(blocked){text(ctx,'温度不足 · 锡丝未熔化',p.x-15,p.y+45,11,'#e6bd7c','center');}ctx.restore();}
  }
  function render(){
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.fillStyle='#101813';ctx.fillRect(0,0,width,height);
    const lamp=ctx.createRadialGradient(width*.2,90,0,width*.25,150,width*.9);lamp.addColorStop(0,'#be954322');lamp.addColorStop(.45,'#7a753b0b');lamp.addColorStop(1,'#00000018');ctx.fillStyle=lamp;ctx.fillRect(0,0,width,height);
    ctx.strokeStyle='#a9bd8d08';ctx.lineWidth=.5;ctx.beginPath();for(let x=0;x<width;x+=27){ctx.moveTo(x,0);ctx.lineTo(x,height);}for(let y=0;y<height;y+=27){ctx.moveTo(0,y);ctx.lineTo(width,y);}ctx.stroke();
    // Bench markings and a loose solder coil.
    text(ctx,'工作区域 / 保持清洁',width-23,95,8,'#69765d66','right');
    ctx.save();ctx.translate(width/2,centerY);if(shake>0)ctx.translate(Math.sin(sceneTime*85)*shake,Math.cos(sceneTime*95)*shake);ctx.rotate(-.105);ctx.scale(scale,scale);
    ctx.save();ctx.shadowColor='#000b';ctx.shadowBlur=38;ctx.shadowOffsetY=24;rr(ctx,-348,-210,696,419,16,'#0e1d12');ctx.restore();ctx.drawImage(boardCache,-400,-265,800,530);
    // An overloaded joint physically connects to its nearest pad.
    joints.filter(j=>j.bridge).forEach(j=>{const n=nearestJoint(j);const g=ctx.createLinearGradient(j.x,j.y-5,j.x,j.y+6);g.addColorStop(0,'#a8b9aa');g.addColorStop(.4,'#e0e8d5');g.addColorStop(1,'#4e6c5a');line(ctx,[[j.x,j.y],[n.x,n.y]],g,10);});
    drawResistor(-150,-95);drawResistor(-95,110);drawLED();joints.forEach(drawJoint);
    ctx.restore();
    for(const p of particles){const pos=boardPoint(p.x,p.y);ctx.globalAlpha=p.life/p.max*.28;const r=p.size*(1+(1-p.life/p.max)*2)*scale;const g=ctx.createRadialGradient(pos.x,pos.y,0,pos.x,pos.y,r);g.addColorStop(0,p.dark?'#a58d63':'#d6dcc5');g.addColorStop(1,'#b8c2a000');ellipse(ctx,pos.x,pos.y,r,r,g);}ctx.globalAlpha=1;
    drawIron();
    for(const p of popups){const pos=boardPoint(p.x,p.y);ctx.globalAlpha=Math.min(1,p.life);text(ctx,p.text,pos.x,pos.y-(2.8-p.life)*15,15,p.color,'center');}ctx.globalAlpha=1;
  }
  function nearestJoint(j){return joints.filter(n=>n!==j).sort((a,b)=>Math.hypot(a.x-j.x,a.y-j.y)-Math.hypot(b.x-j.x,b.y-j.y))[0];}
  function settle(j){
    const avg=j.thermalMass?j.thermalSum/j.thermalMass:0;
    if(j.damage>=1||j.peak>397)j.quality='过热';
    else if(j.tin>1.4)j.quality='锡过多';
    else if(j.tin<.55||avg<282||j.wet<.62||j.heat<1.6)j.quality='冷焊';
    else if(j.tin>=.68&&j.tin<=1.25&&avg>=295&&j.peak>=300&&j.peak<=380&&j.wet>=.78&&j.heat<=5.5)j.quality='完美';
    else j.quality='良好';
    j.settled=true;lastJoint=j;
    if(j.quality==='完美'){combo++;maxCombo=Math.max(maxCombo,combo);j.points=1000+Math.min(combo-1,5)*100;shake=2.6;}else{combo=0;j.points=({'良好':650,'冷焊':150,'锡过多':100,'过热':0})[j.quality];}
    if(j.bridge)j.points=0;score+=j.points;chime(j.quality==='完美');popups.push({x:j.x,y:j.y-42,text:`${j.quality}  +${j.points}`,color:colors[j.quality],life:2.8});
    if(joints.every(n=>n.settled)){finished=true;releaseInputs();showSummary();}
  }
  function step(dt){
    sceneTime+=dt;shake=Math.max(0,shake-dt*4);if(started&&!finished)elapsed+=dt;
    const lp=localPoint(mouse.x,mouse.y);active=null;if(mouse.visible){const nearest=joints.reduce((a,b)=>Math.hypot(a.x-lp.x,a.y-lp.y)<Math.hypot(b.x-lp.x,b.y-lp.y)?a:b);if(Math.hypot(nearest.x-lp.x,nearest.y-lp.y)<Math.max(26,14/scale))active=nearest;}
    const heating=(left||touchHeat)&&!finished,feeding=(right||space||touchFeed)&&!finished;
    for(const j of joints){
      const on=j===active&&!j.settled,heat=on&&heating;
      j.contact+=(Number(heat)-j.contact)*(1-Math.exp(-dt/0.12));
      if(!j.settled){
        if(heat){if(!started)started=true;j.heat+=dt;lastJoint=j;}
        const target=AMBIENT+(415-AMBIENT)*j.contact;
        j.temp=target+(j.temp-target)*Math.exp(-dt*(heat?.58:.75));j.peak=Math.max(j.peak,j.temp);
        if(j.temp>385){j.overTime+=dt;j.damage=Math.min(2,j.damage+dt*(j.temp-385)/19);}
        if(on&&feeding&&j.temp>=250){const amount=dt*.53;j.tin=Math.min(3,j.tin+amount);j.thermalSum+=j.temp*amount;j.thermalMass+=amount;lastJoint=j;}
        if(j.temp>=245&&j.tin>0)j.wet+=(1-j.wet)*(1-Math.exp(-dt*2.3));
        if(j.tin>1.85&&Math.hypot(nearestJoint(j).x-j.x,nearestJoint(j).y-j.y)<90){j.bridge=true;}
        if(!heat&&j.temp<180&&(j.tin>=.10||j.damage>=1))settle(j);
      }else{j.temp=AMBIENT+(j.temp-AMBIENT)*Math.exp(-dt*.75);}
      if(j.temp>245&&!j.settled&&Math.random()<dt*(j.damage>.1?24:8))particles.push({x:j.x+(Math.random()-.5)*9,y:j.y-10,life:1.8,max:1.8,size:8+Math.random()*7,vx:(Math.random()-.4)*16,vy:-24-Math.random()*22,dark:j.damage>.1});
    }
    for(const p of particles){p.life-=dt;p.x+=p.vx*dt+Math.sin(sceneTime*3+p.y)*dt*7;p.y+=p.vy*dt;}particles=particles.filter(p=>p.life>0).slice(-120);
    for(const p of popups)p.life-=dt;popups=popups.filter(p=>p.life>0);
    if(audio){const j=active;const value=!muted&&j&&!j.settled&&heating?clamp((j.temp-150)/270,0,1)*(feeding?.06:.012):0;audio.gain.gain.setTargetAtTime(value,audio.context.currentTime,.08);audio.filter.frequency.setTargetAtTime(800+(j?j.temp:25)*4,audio.context.currentTime,.08);}
  }
  function formatTime(s){return `${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;}
  function updateHUD(){
    const j=active||lastJoint,temperature=j?j.temp:25,tin=j?j.tin:0,done=joints.filter(n=>n.settled).length;
    $('temperature').textContent=Math.round(temperature);$('mercury').style.height=`${Math.max(2,(temperature-25)/425*96)}%`;
    $('temperature').style.color=temperature>375?'#ee9872':temperature>=300&&temperature<=360?'#c0e49a':'#edeedf';
    $('temp-caption').textContent='焊盘温度 · '+(j?.settled?'已结算':temperature<100?'待加热':temperature<250?'预热中':temperature<300?'可以熔锡':temperature<=360?'最佳温区':temperature<385?'注意控温':'温度过高');
    $('count').textContent=`${done} / 6`;$('progress').style.width=`${done/6*100}%`;$('score').textContent=String(score).padStart(4,'0');$('combo').innerHTML=`${combo}<span> 连击</span>`;$('timer').textContent=formatTime(elapsed);
    for(const key of ['r1','r2','d1'])$('part-'+key).textContent=`${joints.filter(n=>n.part===key&&n.settled).length}/2`;
    const percent=Math.round(tin*100);$('fill-percent').innerHTML=`${percent}<span>%</span>`;$('quality-ring').style.background=`conic-gradient(${tin>1.4?'#e7a56a':'#bddb86'} ${Math.min(100,percent)}%,#303b2d 0%)`;$('solder-fill').style.width=`${tin/1.85*100}%`;$('joint-name').textContent=j?j.name:'等待选择';
    let quality='准备焊接',detail='耐心加热，让焊锡自然流动',title='从一个亮圈焊盘开始',hint='移入烙铁，按住左键加热至 300°C',index='01',color='#bddb86';
    if(j){
      if(j.settled){quality=j.quality;detail=`+${j.points} 分 · ${j.bridge?'连锡短路，注意控制锡量':j.quality==='完美'?'银亮内凹，连接可靠':j.quality==='良好'?'连接完成，继续保持':j.quality==='冷焊'?'润湿不足，下次充分加热':j.quality==='锡过多'?'锡量偏多，下次及时停止':'焊盘受损，下次提早移开'}`;title='焊点已结算';hint='移向下一个亮圈，继续练习';index='✓';color=colors[j.quality];}
      else if(j.damage>=1||j.temp>390){quality='过热';detail='焊盘受损 · 请立即移开烙铁';title='温度过高，停止加热';hint='松开所有按键，等待冷却结算';index='!';color=colors['过热'];}
      else if(j.tin>1.4){quality='锡过多';detail=j.bridge?'焊锡已连到邻近焊盘 · 短路':'焊锡堆成球状，请停止送锡';title='停止送锡，移开烙铁';hint='松开所有按键，等待冷却结算';index='!';color=colors['锡过多'];}
      else if(!(left||touchHeat)&&j.tin>=.1){quality='冷却中';detail='焊锡正在凝固，稍等片刻';title='让焊点自然冷却';hint='低于 180°C 后自动结算品质';index='03';}
      else if(j.tin>=.68){quality='锡量合适';detail='停止送锡与加热，让焊点自然冷却';title='现在松开所有按键';hint='锡量已足够，移开烙铁，等待结算';index='03';}
      else if(j.temp>=300){quality=j.tin>.05?'正在润湿':'温度正好';detail=j.tin>.05?'焊锡正沿引脚攀升':'保持左键，同时按住右键或空格';title='保持加热，少量送锡';hint='锡量到 70–100% 时，松开所有按键';index='02';}
      else if(j.temp>=250){quality='开始熔锡';detail='焊盘接近最佳温区';title='继续加热至绿色温区';hint='右键或空格送锡；建议温度 300–360°C';index='02';}
      else if(j.temp>45){quality='预热中';detail=(right||space||touchFeed)?'温度不足，锡丝顶住未熔化':'热量正在传入焊盘与引脚';title='继续按住左键加热';hint='达到 300°C 后，再按右键或空格送锡';}
    }
    $('quality').textContent=quality;$('quality').style.color=color;$('quality-detail').textContent=detail;$('hint-title').textContent=title;$('hint-text').textContent=hint;document.querySelector('.hint-index').textContent=index;
  }
  function showSummary(){
    $('final-score').textContent=score;$('final-perfect').textContent=`${joints.filter(j=>j.quality==='完美').length} / 6`;$('final-time').textContent=formatTime(elapsed);
    $('summary-copy').textContent=`六个焊点已完成，最高连续完美 ${maxCombo} 次。${joints.every(j=>['完美','良好'].includes(j.quality)&&!j.bridge)?'所有连接可靠，这块电路板亮起来了。':'观察焊点的形状，下一次会更稳。'}`;
    $('result-list').replaceChildren(...joints.map(j=>{const div=document.createElement('div'),name=document.createElement('span'),result=document.createElement('span');name.textContent=j.name;result.textContent=j.quality+(j.bridge?' · 连锡':'');result.style.color=colors[j.quality];div.append(name,result);return div;}));$('summary').showModal();
  }
  function pointerPosition(e){const r=canvas.getBoundingClientRect();mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top;mouse.visible=true;}
  canvas.addEventListener('pointermove',pointerPosition);
  canvas.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')e.preventDefault();pointerPosition(e);canvas.focus({preventScroll:true});initAudio();if(e.pointerType==='mouse'){if(e.button===0)left=true;if(e.button===2)right=true;}canvas.setPointerCapture(e.pointerId);});
  // Pointer events fire only for the first/last mouse button; mouse events support button chords.
  canvas.addEventListener('mousedown',e=>{e.preventDefault();if(e.button===0)left=true;if(e.button===2)right=true;});
  window.addEventListener('mouseup',e=>{if(e.button===0)left=false;if(e.button===2)right=false;});
  window.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'){if(e.button===0)left=false;if(e.button===2)right=false;}if(e.pointerId===pointerHeat){touchHeat=false;pointerHeat=null;}if(e.pointerId===pointerFeed){touchFeed=false;pointerFeed=null;}});
  canvas.addEventListener('pointercancel',()=>{left=right=false;});canvas.addEventListener('pointerleave',()=>{if(!left&&!right)mouse.visible=false;});
  window.addEventListener('keydown',e=>{if(e.code==='Space'&&!/BUTTON|INPUT|TEXTAREA/.test(document.activeElement.tagName)&&!$('summary').open){e.preventDefault();space=true;initAudio();}if(e.code==='Escape')releaseInputs();});
  window.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;e.preventDefault();}});
  document.addEventListener('contextmenu',e=>e.preventDefault());window.addEventListener('blur',releaseInputs);document.addEventListener('visibilitychange',()=>{if(document.hidden){releaseInputs();if(audio)audio.gain.gain.setTargetAtTime(0,audio.context.currentTime,.02);}});
  for(const [id,type]of [['heat-touch','heat'],['feed-touch','feed']]){
    const button=$(id);button.addEventListener('pointerdown',e=>{e.preventDefault();initAudio();button.setPointerCapture(e.pointerId);if(!mouse.visible){const next=joints.find(j=>!j.settled)||joints[0],p=boardPoint(next.x,next.y);mouse={...p,visible:true};}if(type==='heat'){touchHeat=true;pointerHeat=e.pointerId;}else{touchFeed=true;pointerFeed=e.pointerId;}});
    button.addEventListener('lostpointercapture',()=>{if(type==='heat'){touchHeat=false;pointerHeat=null;}else{touchFeed=false;pointerFeed=null;}});
  }
  $('reset').addEventListener('click',reset);$('restart').addEventListener('click',reset);$('summary').addEventListener('cancel',e=>e.preventDefault());
  $('sound').addEventListener('click',()=>{muted=!muted;initAudio();$('sound').textContent=muted?'♪':'♫';$('sound').setAttribute('aria-label',muted?'开启声音':'关闭声音');$('sound').style.opacity=muted?'.45':'1';});
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  function frame(now){const dt=Math.min((now-lastFrame)/1000||0,.04);lastFrame=now;if(!document.hidden){step(dt);render();if(now-lastHud>70){updateHUD();lastHud=now;}}if(dpr!==Math.min(window.devicePixelRatio||1,2))resize();requestAnimationFrame(frame);}
  // Read-only snapshots and coordinates; tests must use actual input to solder.
  window.__game={getState:()=>({joints:joints.map(j=>({...j})),score,combo,maxCombo,elapsed,finished,active:active?.id??null,inputs:{left,right,space,touchHeat,touchFeed}}),getJointPosition:id=>{const j=joints[id],p=boardPoint(j.x,j.y),r=canvas.getBoundingClientRect();return{x:p.x+r.left,y:p.y+r.top};},reset};
  reset();resize();requestAnimationFrame(frame);
})();
