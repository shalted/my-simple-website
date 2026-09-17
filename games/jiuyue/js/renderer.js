
(function(root){
  'use strict';
  const W=1000,H=760,R=60,SY=.66,DX=Math.sqrt(3)*R,OY=195,OX=160;
  const colors={blue:'#308c85',red:'#db7771',ink:'#51453e',muted:'#88796d'};
  function point(c,r){return{x:OX+DX*(c+.5*(r&1)),y:OY+1.5*R*SY*r};}
  function hex(c,r,scale=1){const p=point(c,r);return Array.from({length:6},(_,i)=>{const a=(i*60-30)*Math.PI/180;return{x:p.x+Math.cos(a)*R*scale,y:p.y+Math.sin(a)*R*SY*scale};});}
  function path(ctx,ps){ctx.beginPath();ps.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();}
  function hull(points){const ps=[...points].sort((a,b)=>a.x-b.x||a.y-b.y),cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),lo=[],hi=[];for(const p of ps){while(lo.length>=2&&cross(lo.at(-2),lo.at(-1),p)<=0)lo.pop();lo.push(p);}for(const p of ps.reverse()){while(hi.length>=2&&cross(hi.at(-2),hi.at(-1),p)<=0)hi.pop();hi.push(p);}return lo.slice(0,-1).concat(hi.slice(0,-1));}
  function rounded(ctx,x,y,w,h,r=6){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function text(ctx,s,x,y,size=14,color=colors.ink,align='left',weight=500){ctx.fillStyle=color;ctx.font=`${weight} ${size}px "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`;ctx.textAlign=align;ctx.fillText(s,x,y);}
  class Renderer{
    constructor(canvas,images){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.images=images;this.width=W;this.height=H;this.hover=null;this.selected=null;this.drag=null;this.showRanges=true;this.showGrid=true;this.hitboxes=[];this.boardHull=hull(Array.from({length:56},(_,i)=>hex(i%7,Math.floor(i/7))).flat());}
    fit(dpr=1){const ratio=Math.min(dpr||1,2);if(this.canvas.width!==W*ratio||this.canvas.height!==H*ratio){this.canvas.width=W*ratio;this.canvas.height=H*ratio;}this.ratio=ratio;}
    unitPoint(u){const from=point(u.c,u.r);if(!u.move)return from;const to=point(u.move.to.c,u.move.to.r),t=Math.min(1,u.move.elapsed/u.move.duration);return{x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t};}
    cellAt(x,y){let best=null,dist=Infinity;for(let r=0;r<8;r++)for(let c=0;c<7;c++){const p=point(c,r),nx=(x-p.x)/R,ny=(y-p.y)/(R*SY);if(Math.abs(nx)<=Math.sqrt(3)/2&&Math.abs(ny)<=1&&Math.sqrt(3)*Math.abs(ny)+Math.abs(nx)<=Math.sqrt(3)){const d=nx*nx+ny*ny;if(d<dist){dist=d;best={c,r};}}}return best;}
    unitAt(x,y){for(let i=this.hitboxes.length-1;i>=0;i--){const b=this.hitboxes[i];if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h)return b.id;}return null;}
    draw(game,clock=0){
      const ctx=this.ctx;ctx.setTransform(this.ratio||1,0,0,this.ratio||1,0,0);ctx.clearRect(0,0,W,H);
      ctx.fillStyle='#f3ead8';ctx.fillRect(0,0,W,H);
      if(this.images.courtyard)ctx.drawImage(this.images.courtyard,0,0,W,H);
      const bottom=this.boardHull.map(p=>({x:p.x,y:p.y+9}));path(ctx,bottom);ctx.fillStyle='#a6b9af';ctx.fill();ctx.strokeStyle='#776d60';ctx.lineWidth=2;ctx.stroke();
      path(ctx,this.boardHull);ctx.fillStyle='#f6f0dddf';ctx.fill();ctx.strokeStyle='#716558';ctx.lineWidth=2;ctx.stroke();
      const selected=game.get(this.selected);const dragging=this.drag&&game.get(this.drag.id);
      for(let r=0;r<8;r++)for(let c=0;c<7;c++){
        const p=point(c,r),poly=hex(c,r,.94);let fill=r<4?'#f5e9dbea':'#d5e5dce8';
        if((c+r)%2)fill=r<4?'#eee3d4e8':'#e2ebdfed';
        const allowed=game.phase==='prep'&&selected&&game.validCell(c,r,selected.team);
        if(allowed)fill=selected.team==='blue'?'#c5ded0':'#f0d0c0';
        path(ctx,poly);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=this.showGrid?'#857c6977':'#00000000';ctx.lineWidth=1.2;ctx.stroke();
        if(this.showGrid){path(ctx,poly.map((v,i)=>({x:v.x+Math.sin(c*13+r*7+i*5)*.7,y:v.y+Math.cos(c*7+r*11+i)*.9})));ctx.strokeStyle='#8c826333';ctx.lineWidth=.7;ctx.stroke();}
        if(selected&&selected.hp>0&&this.showRanges&&root.LionChess.distance({c,r},selected)<=selected.range){path(ctx,hex(c,r,.9));ctx.fillStyle=selected.team==='blue'?'#73e6d112':'#ff9c9112';ctx.fill();}
        if(this.hover&&this.hover.c===c&&this.hover.r===r){path(ctx,hex(c,r,.94));ctx.strokeStyle=selected&&!game.validCell(c,r,selected.team)&&game.phase==='prep'?'#ff9281':colors.blue;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#ffffff0a';ctx.fill();}
        if(this.showGrid&&r===7)text(ctx,String(c+1),p.x,p.y+49,12,'#6d8a9c','center');
      }
      if(this.showGrid)for(let r=0;r<8;r++){const p=point(0,r);text(ctx,String.fromCharCode(65+r),p.x-65,p.y+5,12,'#6d8a9c','center');}
      ctx.save();ctx.setLineDash([5,7]);ctx.strokeStyle='#8a77625e';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(110,point(0,3).y+30);ctx.lineTo(887,point(0,3).y+30);ctx.stroke();ctx.restore();
      // Destination reservations are visible only for the inspected combatant.
      if(selected?.move){path(ctx,hex(selected.move.to.c,selected.move.to.r,.82));ctx.strokeStyle=colors[selected.team];ctx.lineWidth=2;ctx.stroke();}
      this.hitboxes=[];
      const units=[...game.units].filter(u=>u.hp>0||u.deadTime<.45).sort((a,b)=>this.unitPoint(a).y-this.unitPoint(b).y||a.id.localeCompare(b.id));
      for(const u of units){if(dragging&&u.id===dragging.id)continue;this.unit(ctx,u,game,clock);}
      for(const p of game.projectiles)this.projectile(ctx,p,game);
      for(const e of game.effects)this.effect(ctx,e,game);
      // Paint health bars in a separate pass for readability in a crowd.
      for(const u of units)if(u.hp>0&&(!dragging||u.id!==dragging.id))this.health(ctx,u,game);
      if(dragging)this.unit(ctx,dragging,game,clock,{x:this.drag.x,y:this.drag.y,alpha:.85});
      this.labels(ctx,game);
      if(game.phase==='battle'&&game.paused){rounded(ctx,425,320,150,54,14);ctx.fillStyle='#0c192ce8';ctx.fill();text(ctx,'已暂停',500,354,21,colors.ink,'center',700);}
    }
    labels(ctx,game){
      text(ctx,game.phase==='prep'?'上半场 · 对手':'对手剩余 '+game.alive('red').length,W/2,42,15,colors.ink,'center',700);
      text(ctx,game.phase==='prep'?'下半场 · 拖动伙伴到棋格上阵':game.phase==='finished'?'回合结束 · 伤害统计已保留':game.paused?'已暂停':'自动战斗中',W/2,713,15,colors.ink,'center',600);
    }
    animation(u,game,clock){
      if(u.summoned){
        if(u.state==='attack'&&u.attack){const t=u.attack.elapsed;return{name:'attack',frame:t<.1?0:t<.2?1:t<.4?2:t<.6?3:4};}
        const t=u.state==='move'?u.animTime:game.phase==='battle'?u.animTime:clock;
        return{name:u.state==='move'?'move':'idle',frame:Math.floor(t/.35)%2?4:0};
      }
      if(u.state==='skill'&&u.skill){const d=root.LionSkills.skill(u.characterId),t=Math.min(.999,u.skill.elapsed/d.castDuration);return{name:'skill',frame:Math.floor(t*5)};}
      if(u.state==='attack'&&u.attack){const t=u.attack.elapsed;return{name:'attack',frame:t<.1?0:t<.2?1:t<.4?2:t<.6?3:4};}
      if(u.state==='move')return{name:'move',frame:Math.floor(u.animTime/.2)%5};
      const t=game.phase==='battle'?u.animTime:clock+(Number(u.id.slice(-1))||0)*.17;
      return{name:'idle',frame:Math.floor(t/.2)%5};
    }
    unit(ctx,u,game,clock,override=null){
      let p=override||this.unitPoint(u),x=p.x,y=p.y;
      const alpha=override?.alpha??(u.hp<=0?Math.max(0,1-u.deadTime/.45):1);
      ctx.save();ctx.globalAlpha=alpha;
      const selected=this.selected===u.id;const team=colors[u.team];
      ctx.beginPath();ctx.ellipse(x,y+1,33,12,0,0,Math.PI*2);ctx.fillStyle='#00000045';ctx.fill();
      ctx.beginPath();ctx.ellipse(x,y+1,34,12,0,0,Math.PI*2);ctx.strokeStyle=team;ctx.lineWidth=selected?3:1.5;ctx.stroke();
      if(selected){ctx.beginPath();ctx.ellipse(x,y+1,39,15,0,0,Math.PI*2);ctx.strokeStyle=team+'60';ctx.lineWidth=1;ctx.stroke();}
      // 护盾与三头六臂增益跟随实际持有者，生命周期由战斗状态控制，不烘焙进施法动作。
      if(u.hp>0&&u.shield>0){ctx.save();ctx.strokeStyle='#a8efff';ctx.fillStyle='#8de4ff1e';ctx.shadowColor='#71d7f4';ctx.shadowBlur=12;ctx.lineWidth=2.5;ctx.beginPath();ctx.ellipse(x,y-51,40,55,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();}
      if(u.hp>0&&u.buff){const pulse=1+Math.sin(clock*7)*.08;ctx.save();ctx.strokeStyle='#ffb14eaa';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(x,y-3,39*pulse,15*pulse,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
      if(u.state==='attack'&&u.attack){const t=u.attack.elapsed,target=game.get(u.attack.targetId);if(target){const tp=this.unitPoint(target),len=Math.hypot(tp.x-x,tp.y-y)||1;const amount=t<.2?-3*Math.sin(t/.2*Math.PI/2):t<.4?7*(1-(t-.2)/.2):0;x+=(tp.x-x)/len*amount;y+=(tp.y-y)/len*amount;}}
      const anim=this.animation(u,game,clock);
      const asset=u.summoned?root.LionSkills.shrimp(u.star).asset:anim.name==='skill'?u.characterId+'_skill':root.LionChess.character(u.characterId).assets[anim.name],img=this.images[asset];
      if(!img)throw new Error('缺少角色动作素材：'+u.characterId+'/'+anim.name);
      const size=u.summoned?root.LionSkills.shrimp(u.star).size:112,scale=size/416;const dx=x-size/2,dy=y-440*scale;
      if(img){ctx.imageSmoothingEnabled=true;if(u.flash>0)ctx.filter='brightness(1.6)';ctx.drawImage(img,anim.frame*416,0,416,480,dx,dy,size,480*scale);ctx.filter='none';}
      if(u.hp>0&&!override)this.hitboxes.push({id:u.id,x:dx+8,y:dy+8,w:size-16,h:440*scale-8});
      ctx.restore();
    }
    health(ctx,u){const p=this.unitPoint(u),w=u.summoned?50:61,x=p.x-w/2,y=p.y-(u.summoned?104:122);
      rounded(ctx,x-2,y-2,w+4,10,4);ctx.fillStyle='#6a5c4ce6';ctx.fill();rounded(ctx,x,y,w,6,2);ctx.fillStyle='#d6c8b2';ctx.fill();
      if(u.hp>0){rounded(ctx,x,y,Math.max(1,w*u.hp/u.maxHp),6,2);ctx.fillStyle=colors[u.team];ctx.fill();}
      if(!u.summoned&&!u.enemy){rounded(ctx,x,y+10,w,5,2);ctx.fillStyle='#3d4d62';ctx.fill();if(u.energy>0){rounded(ctx,x,y+10,Math.max(1,w*u.energy/u.energyMax),5,2);ctx.fillStyle='#f3b44d';ctx.fill();}}
      if(u.shield>0){rounded(ctx,x,y+17,w*u.shield/u.shieldMax,4,2);ctx.fillStyle='#a8efff';ctx.fill();}
      // Rank stays above the health bar; role remains visible to its right.
      const promoted=u.star>=2,badgeW=u.star===3?76:promoted?54:32,badgeX=p.x-badgeW/2,badgeY=y-29;
      rounded(ctx,badgeX,badgeY,badgeW,24,7);ctx.fillStyle=promoted?'#ffe09a':'#fff8e9';ctx.fill();
      ctx.strokeStyle=promoted?'#9a611a':'#8b7860';ctx.lineWidth=promoted?2.5:1.5;ctx.stroke();
      text(ctx,u.enemy&&root.LionChess.character(u.characterId).boss?'首领':'★'.repeat(u.star||1),p.x,badgeY+18,18,promoted?'#78420a':'#796344','center',800);
      if(!u.summoned){rounded(ctx,x+w+5,y-5,22,17,5);ctx.fillStyle='#fff8e9ef';ctx.fill();text(ctx,u.kind==='ranged'?'远':'近',x+w+16,y+8,11,colors[u.team],'center',700);}
    }
    projectile(ctx,p,game){const a=point(p.from.c,p.from.r),target=game.get(p.targetId);if(!target)return;const b=this.unitPoint(target),source=game.get(p.sourceId),t=Math.min(1,p.elapsed/p.duration);
      if(source.enemy){
        // USER-CONFIRMED：半径沿用普攻7；滚饼贴地，抛饼沿旧发射高度、最高抬升棋格半径R。
        // 月饼独立于角色帧；该分支只绘制，不改变引擎的飞行时长与命中规则。
        const style=root.LionChess.character(source.characterId).projectileStyle,radius=7;
        if(style!=='rolling-mooncake'&&style!=='flying-mooncake')throw new Error('未知敌方弹道：'+style);
        const flying=style==='flying-mooncake';
        if(flying){a.y-=57;b.y-=60;}else{a.y-=radius;b.y-=radius;}
        const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t-(flying?4*t*(1-t)*R:0);
        ctx.save();ctx.translate(x,y);
        // 滚动角度由实际路程/半径推导；抛出的月饼沿用同一饼面。
        if(!flying)ctx.rotate((b.x<a.x?-1:1)*Math.hypot(b.x-a.x,b.y-a.y)*t/radius);
        ctx.fillStyle='#ffe09a';ctx.strokeStyle='#78420a';ctx.lineWidth=1.5;
        ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.beginPath();ctx.arc(0,0,radius/2,0,Math.PI*2);ctx.stroke();
        ctx.beginPath();ctx.moveTo(-radius/2,0);ctx.lineTo(radius/2,0);ctx.moveTo(0,-radius/2);ctx.lineTo(0,radius/2);ctx.stroke();
        ctx.restore();return;
      }
      a.y-=57;b.y-=60;const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t-Math.sin(Math.PI*t)*13;
      // 从发射者的角色配置读取水/火配色；发射者退场后仍保留原弹道身份。
      const palette=p.skill==='jiuyue'?{trail:'#ff9e52',glow:'#ff7744',body:'#ffbd5a',highlight:'#fff5c8'}:root.LionChess.character(source.characterId).projectile,scale=p.skill==='jiuyue'?1.35:1+(source.synergyBonus?.projectileScaleBonus||0);
      ctx.save();ctx.strokeStyle=palette.trail;ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x-(b.x-a.x)*.07,y-(b.y-a.y)*.07);ctx.lineTo(x,y);ctx.stroke();
      ctx.shadowColor=palette.glow;ctx.shadowBlur=17;ctx.fillStyle=palette.body;ctx.beginPath();ctx.arc(x,y,7*scale,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle=palette.highlight;ctx.beginPath();ctx.arc(x-scale,y-scale,3.5*scale,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    effect(ctx,e,game){const u=game.get(e.id);if(!u)return;const p=this.unitPoint(u),t=e.elapsed/e.duration;ctx.save();ctx.globalAlpha=1-t;
      if(e.type==='laser'){const target=game.get(e.targetId);if(target){const q=this.unitPoint(target),dx=q.x-p.x,dy=q.y-p.y,length=Math.hypot(dx,dy)||1;ctx.strokeStyle='#ffe09a';ctx.shadowColor='#ffb347';ctx.shadowBlur=18;ctx.lineWidth=9*(1-t*.55);ctx.beginPath();ctx.moveTo(p.x,p.y-72);ctx.lineTo(p.x+dx/length*1200,p.y-72+dy/length*1200);ctx.stroke();ctx.shadowBlur=0;}ctx.restore();return;}
      if(e.type==='shield'||e.type==='buff'||e.type==='summon'){ctx.strokeStyle=e.type==='shield'?'#a8efff':e.type==='buff'?'#ffb14e':'#74d8ee';ctx.lineWidth=4;ctx.beginPath();ctx.arc(p.x,p.y-52,28+t*24,0,Math.PI*2);ctx.stroke();ctx.restore();return;}
      if(e.type==='heal'){ctx.font='700 17px sans-serif';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#17362b';ctx.strokeText('+'+e.value,p.x-18,p.y-88-t*32);ctx.fillStyle='#82e6a9';ctx.fillText('+'+e.value,p.x-18,p.y-88-t*32);ctx.restore();return;}
      if(e.elapsed<.15){ctx.strokeStyle='#fff2c2';ctx.lineWidth=2;for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.moveTo(p.x+Math.cos(a)*8,p.y-62+Math.sin(a)*8);ctx.lineTo(p.x+Math.cos(a)*(13+t*30),p.y-62+Math.sin(a)*(13+t*30));ctx.stroke();}}
      ctx.font=(e.critical?'900 22px':'700 18px')+' sans-serif';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#17202f';ctx.strokeText((e.critical?'暴击 -':'-')+e.value,p.x+22,p.y-90-t*35);ctx.fillStyle=e.critical?'#ff8e65':'#ffe3ab';ctx.fillText((e.critical?'暴击 -':'-')+e.value,p.x+22,p.y-90-t*35);ctx.restore();
    }
  }
  root.ChessRenderer={Renderer,point,hex,W,H,colors};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.ChessRenderer;
})(typeof window!=='undefined'?window:globalThis);

