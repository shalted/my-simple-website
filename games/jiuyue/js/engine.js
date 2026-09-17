
/* Deterministic combat rules. No DOM or rendering dependencies. */
(function (root) {
  'use strict';
  const {STATS,CHARACTERS,character}=root.LionCharacters;
  const {ENEMIES}=root.LionEnemies;
  const {EQUIPMENT,EQUIPMENT_SETS,EQUIPMENT_SLOT_COUNT,equipment,equipmentSetStates,resolveEquipmentBonuses,resolveBaseStats}=root.LionEquipment;
  const {FRIENDS,SYNERGIES,friendship,synergyState,synergyEffect,synergyDetails,synergyBonuses,formatSynergyBonus}=root.LionSynergies;
  const {ENERGY_MAX,ENERGY_ON_BASIC_HIT,ENERGY_ON_DAMAGE,SKILLS,SHRIMP,skill,shrimp,lineTargets}=root.LionSkills;
  const COLS = 7, ROWS = 8;
  // 用户授权低数值装备扩展；爆击统一造成 1.5 倍攻击结算伤害。
  const CRITICAL_DAMAGE_MULTIPLIER=1.5;
  const key = (c, r) => c + ',' + r;
  const axial = (c, r) => ({q: c - (r - (r & 1)) / 2, r});
  function distance(a, b) {
    const x = axial(a.c, a.r), y = axial(b.c, b.r);
    return (Math.abs(x.q-y.q) + Math.abs(x.r-y.r) + Math.abs(x.q+x.r-y.q-y.r))/2;
  }
  function neighbors(c, r) {
    const a=axial(c,r), result=[];
    for (const [dq,dr] of [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]]) {
      const nr=a.r+dr, nc=a.q+dq+(nr-(nr&1))/2;
      if(nc>=0&&nc<COLS&&nr>=0&&nr<ROWS) result.push({c:nc,r:nr});
    }
    return result;
  }
  // 开局阵容；角色数值在 characters.js，装备和羁绊分别独立结算。
  const DEFAULT = [
    {id:'blue1',team:'blue',characterId:'xiaotian',kind:'melee',equipmentIds:[],c:2,r:5},
    {id:'blue2',team:'blue',characterId:'xiaotian',kind:'melee',equipmentIds:[],c:4,r:5},
    {id:'blue3',team:'blue',characterId:'jiuyue',kind:'ranged',equipmentIds:[],c:3,r:7},
    {id:'red1',team:'red',characterId:'guard',kind:'melee',equipmentIds:[],c:2,r:2},
    {id:'red2',team:'red',characterId:'carrier',kind:'ranged',equipmentIds:[],c:4,r:2},
    {id:'red3',team:'red',characterId:'thrower',kind:'ranged',equipmentIds:[],c:3,r:0}
  ];
  const copy = value => JSON.parse(JSON.stringify(value));
  function createUnit(config) {
    const s=resolveBaseStats(config),enemy=Object.hasOwn(ENEMIES,config.characterId);
    // 敌人沿用基础战斗属性，但没有英雄能量条、主动技能或英雄身份。
    return {...config,enemy,equipmentIds:[...config.equipmentIds],kind:s.kind,hp:s.baseHp,maxHp:s.baseHp,atk:s.baseAtk,def:s.baseDef,range:s.range,interval:s.baseInterval,baseHp:s.baseHp,baseAtk:s.baseAtk,baseDef:s.baseDef,baseInterval:s.baseInterval,equipmentBonus:s.equipmentBonus,synergyBonus:synergyBonuses(config.characterId,[]),attackSpeed:1+s.equipmentBonus.attackSpeedBonus,moveSpeed:1+s.equipmentBonus.moveSpeedBonus,critChance:s.equipmentBonus.critChance,lifestealBonus:s.equipmentBonus.lifestealBonus,energy:0,energyMax:enemy?0:ENERGY_MAX,shield:0,shieldMax:0,buff:null,skill:null,casts:0,state:'idle',animTime:0,move:null,attack:null,
      targetId:null,cooldown:0,think:0,flash:0,deadTime:0,damage:0,hits:0,shots:0,
      moves:0,blocked:0,lastHit:0};
  }
  class Game {
    constructor(random=Math.random) {
      this.random=random;
      this.layout=copy(DEFAULT); this.listeners=[]; this.restart();
    }
    emit(type,data={}) {
      const event={type,time:this.time,...data};
      this.events.push(event); if(this.events.length>160)this.events.shift();
      for(const listener of this.listeners) listener(event);
    }
    restart(resetLayout=false) {
      if(resetLayout)this.layout=copy(DEFAULT);
      this.units=this.layout.map(createUnit);this.projectiles=[];this.effects=[];
      this.applyFriendship();
      this.phase='prep';this.paused=false;this.time=0;this.result=null;this.events=[];
      this.nextProjectile=0;this.nextSummon=0;this.tick=0;this.metrics={attacks:0,impacts:0,steps:0,launched:0,skills:0,summons:0};
      this.emit('prepare');
    }
    get(id){return this.units.find(u=>u.id===id);}
    alive(team){return this.units.filter(u=>u.hp>0&&(!team||u.team===team));}
    validCell(c,r,team){return Number.isInteger(c)&&Number.isInteger(r)&&c>=0&&c<COLS&&r>=0&&r<ROWS&&(!team||(team==='blue'?r>=4:r<4));}
    place(id,c,r){
      if(this.phase!=='prep')return {ok:false,reason:'战斗中不能调整站位'};
      const u=this.get(id);if(!u||!this.validCell(c,r,u.team))return {ok:false,reason:'请放在该队伍的半场'};
      const other=this.units.find(v=>v.id!==id&&v.c===c&&v.r===r);
      if(other&&other.team!==u.team)return {ok:false,reason:'这个格子已被占用'};
      if(other){other.c=u.c;other.r=u.r;}
      u.c=c;u.r=r;this.syncLayout();this.emit('placement',{id});return {ok:true};
    }
    setCharacter(id,characterId){
      if(this.phase!=='prep')return false;
      character(characterId);
      const index=this.units.findIndex(u=>u.id===id);if(index<0)return false;
      const u=this.units[index];this.units[index]=createUnit({...u,characterId});
      this.syncLayout();this.applyFriendship();this.emit('role',{id,characterId});return true;
    }
    syncLayout(){this.layout=this.units.filter(u=>!u.summoned).map(({id,team,characterId,kind,c,r,star,power,equipmentIds})=>({id,team,characterId,kind,c,r,star,power,equipmentIds:[...equipmentIds]}));}
    // 每次从模板计算，换位、开战和跨回合均不累计加成；战中阵亡不重算。
    applyFriendship(){
      this.synergies=SYNERGIES.map(definition=>synergyState(this.layout,definition));
      this.friendship=this.synergies.find(entry=>entry.name===FRIENDS.name);
      for(const u of this.units){
        if(u.summoned)continue;
        u.synergyBonus=synergyBonuses(u.characterId,u.team==='blue'&&u.slot==null?this.synergies:[]);
        u.maxHp=Math.round(u.baseHp*(1+u.synergyBonus.hpBonus));u.hp=u.maxHp;
        u.atk=Math.round(u.baseAtk*(1+u.synergyBonus.attackBonus));u.def=u.baseDef;
        u.attackSpeed=1+u.equipmentBonus.attackSpeedBonus+u.synergyBonus.attackSpeedBonus;
        u.moveSpeed=1+u.equipmentBonus.moveSpeedBonus+u.synergyBonus.moveSpeedBonus;u.interval=u.baseInterval/u.attackSpeed;
      }
    }
    start(){
      if(this.phase!=='prep')return false;
      this.syncLayout();this.units=this.layout.map(createUnit);this.time=0;this.tick=0;
      this.applyFriendship();
      this.phase='battle';this.paused=false;this.events=[];this.effects=[];this.projectiles=[];
      this.nextSummon=0;
      this.units.forEach((u,i)=>{u.cooldown=(i%3)*0.04;});
      this.emit('start');return true;
    }
    blockedCells(exceptId){
      const occupied=new Set();
      for(const u of this.alive())if(u.id!==exceptId){
        occupied.add(key(u.c,u.r));
        if(u.move)occupied.add(key(u.move.to.c,u.move.to.r));
      }
      return occupied;
    }
    pathToAttack(u,target,blocked=this.blockedCells(u.id)){
      const start={c:u.c,r:u.r};
      const queue=[{...start,path:[]}],seen=new Set([key(start.c,start.r)]);
      for(let i=0;i<queue.length;i++){
        const cur=queue[i];
        if(distance(cur,target)<=u.range)return cur.path;
        const next=neighbors(cur.c,cur.r).sort((a,b)=>distance(a,target)-distance(b,target)||a.r-b.r||a.c-b.c);
        for(const n of next){const k=key(n.c,n.r);if(seen.has(k)||blocked.has(k))continue;
          seen.add(k);queue.push({...n,path:[...cur.path,n]});}
      }
      return null;
    }
    combatAttackSpeed(u){return u.attackSpeed*(1+(u.buff?.attackSpeedBonus||0));}
    combatAttack(u){return Math.round(u.atk*(1+(u.buff?.attackBonus||0)));}
    gainEnergy(u,amount){if(!u||u.hp<=0||u.summoned||u.enemy)return;u.energy=Math.min(u.energyMax,u.energy+amount);}
    skillTarget(u){
      const enemies=this.alive(u.team==='blue'?'red':'blue');
      const current=this.get(u.targetId);
      if(current&&current.hp>0&&current.team!==u.team)return current;
      return enemies.sort((a,b)=>distance(u,a)-distance(u,b)||a.id.localeCompare(b.id))[0]||null;
    }
    summonCell(u){
      const blocked=this.blockedCells();
      return neighbors(u.c,u.r).filter(cell=>!blocked.has(key(cell.c,cell.r)))
        .sort((a,b)=>a.r-b.r||a.c-b.c)[0]||null;
    }
    // 按召唤者分别统计存活虾兵；阵亡记录不占名额，也不挤掉其他沧澜的召唤物。
    canSummonShrimp(u){
      return this.units.filter(unit=>unit.summoned&&unit.summonerId===u.id&&unit.hp>0).length<skill('aolie').maxSummons;
    }
    beginSkill(u){
      if(u.summoned||u.enemy||u.energy<u.energyMax)return false;
      const definition=skill(u.characterId),target=this.skillTarget(u);
      if(!target)return false;
      if(u.characterId==='xiaotian'&&distance(u,target)>u.range)return false;
      if(u.characterId==='aolie'&&(!this.canSummonShrimp(u)||!this.summonCell(u)))return false;
      u.energy=0;u.state='skill';u.animTime=0;u.skill={elapsed:0,triggered:false,targetId:target.id};u.casts++;
      this.metrics.skills++;this.emit('skill',{id:u.id,target:target.id,name:definition.name});return true;
    }
    summonShrimp(u){
      // 施法起手与实际召出都检查名额；满员拒绝新增，沿用已确认的保留能量规则。
      if(!this.canSummonShrimp(u))return false;
      const cell=this.summonCell(u);if(!cell)return false;
      const tier=shrimp(u.star||1),maxHp=Math.max(1,Math.round(u.maxHp*skill('aolie').summonHpRatio*tier.hpScale));
      const summon={id:`${u.id}-shrimp-${++this.nextSummon}`,team:u.team,characterId:'shrimp',summoned:true,summonerId:u.id,star:u.star||1,
        kind:'melee',c:cell.c,r:cell.r,hp:maxHp,maxHp,atk:Math.max(1,Math.round(u.atk*skill('aolie').summonAtkRatio*tier.atkScale)),def:u.def,range:1,
        baseInterval:1.2,interval:1.2,attackSpeed:1,moveSpeed:1,critChance:0,lifestealBonus:0,energy:0,energyMax:0,shield:0,shieldMax:0,buff:null,skill:null,casts:0,
        state:'idle',animTime:0,move:null,attack:null,targetId:null,cooldown:.2,think:0,flash:0,deadTime:0,damage:0,hits:0,shots:0,moves:0,blocked:0,lastHit:0};
      this.units.push(summon);this.metrics.summons++;this.effects.push({type:'summon',id:summon.id,elapsed:0,duration:.8});
      this.emit('summon',{id:u.id,summon:summon.id,star:summon.star});return true;
    }
    castSkill(u,cast){
      const definition=skill(u.characterId);let target=this.get(cast.targetId);
      if(u.characterId==='aolie'){if(!this.summonShrimp(u))u.energy=u.energyMax;return;}
      if(u.characterId==='nezha'){u.buff={remaining:definition.duration,attackBonus:definition.attackBonus,attackSpeedBonus:definition.attackSpeedBonus};this.effects.push({type:'buff',id:u.id,elapsed:0,duration:.8});return;}
      if(u.characterId==='xiaoyu'){
        const ally=this.alive(u.team).filter(unit=>!unit.summoned).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.id.localeCompare(b.id))[0];
        if(ally){ally.shield+=Math.round(u.atk*definition.shieldRatio);ally.shieldMax=ally.shield;this.effects.push({type:'shield',id:ally.id,elapsed:0,duration:.8});}
        return;
      }
      if(!target||target.hp<=0)target=this.skillTarget(u);
      if(!target){u.energy=u.energyMax;return;}
      if(u.characterId==='jiuyue'){
        const enemies=this.alive(u.team==='blue'?'red':'blue').sort((a,b)=>distance(target,a)-distance(target,b)||a.id.localeCompare(b.id));
        const targets=[target,...enemies.filter(enemy=>enemy.id!==target.id)].slice(0,definition.projectiles);
        while(targets.length<definition.projectiles)targets.push(target);
        for(const enemy of targets){const p={id:++this.nextProjectile,sourceId:u.id,targetId:enemy.id,from:{c:u.c,r:u.r},startTarget:{c:enemy.c,r:enemy.r},elapsed:0,duration:Math.max(.2,distance(u,enemy)*.105),atk:u.atk*definition.damageRatio,team:u.team,skill:'jiuyue'};this.projectiles.push(p);this.metrics.launched++;}
        return;
      }
      if(u.characterId==='yangjian'){
        const enemies=this.alive(u.team==='blue'?'red':'blue'),targets=lineTargets(u,target,enemies,definition.lineWidth);
        for(const enemy of targets)this.damage(u,enemy,u.atk*definition.damageRatio,{kind:'skill'});
        this.effects.push({type:'laser',id:u.id,targetId:target.id,elapsed:0,duration:.45});return;
      }
      if(u.characterId==='xiaotian'&&distance(u,target)<=u.range)this.damage(u,target,u.atk*definition.damageRatio,{kind:'skill'});
    }
    chooseAction(u){
      const enemies=this.alive(u.team==='blue'?'red':'blue');if(!enemies.length)return;
      if(this.beginSkill(u))return;
      const blocked=this.blockedCells(u.id);let target=this.get(u.targetId),path=null;
      if(target&&target.hp>0)path=this.pathToAttack(u,target,blocked);
      if(!target||target.hp<=0||path===null){
        const options=enemies.map(t=>({t,path:this.pathToAttack(u,t,blocked)})).filter(x=>x.path!==null);
        options.sort((a,b)=>a.path.length-b.path.length||distance(u,a.t)-distance(u,b.t)||a.t.id.localeCompare(b.t.id));
        if(!options.length){u.state='idle';u.blocked++;u.think=0.15;return;}
        target=options[0].t;path=options[0].path;u.targetId=target.id;
      }
      if(distance(u,target)<=u.range){
        if(u.cooldown<=0){
          u.state='attack';u.animTime=0;u.attack={elapsed:0,targetId:target.id,hit:false};
          u.cooldown=u.baseInterval/this.combatAttackSpeed(u);this.metrics.attacks++;this.emit('attack',{id:u.id,target:target.id,kind:u.kind});
        }else{u.state='idle';u.think=0.05;}
      }else if(path&&path.length){
        u.state='move';u.move={from:{c:u.c,r:u.r},to:path[0],elapsed:0,duration:0.36/u.moveSpeed};
        u.moves++;this.metrics.steps++;
      }
    }
    strike(u,a){
      const target=this.get(a.targetId);if(!target||target.hp<=0)return;
      if(u.kind==='ranged'){
        const p={id:++this.nextProjectile,sourceId:u.id,targetId:target.id,
          from:{c:u.c,r:u.r},startTarget:{c:target.c,r:target.r},elapsed:0,
          duration:Math.max(.2,distance(u,target)*.105),atk:this.combatAttack(u),team:u.team,kind:'basic'};
        this.projectiles.push(p);u.shots++;this.metrics.launched++;
        this.emit('launch',{id:u.id,target:target.id,projectile:p.id});
      }else if(distance(u,target)<=u.range){this.damage(u,target,this.combatAttack(u),{kind:'basic'});}
    }
    damage(source,target,attack,{kind='skill'}={}){
      if(target.hp<=0)return;
      const critical=Boolean(source?.critChance&&this.random()<source.critChance),resolvedAttack=critical?attack*CRITICAL_DAMAGE_MULTIPLIER:attack;
      const raw=Math.max(1,Math.floor(resolvedAttack*100/(100+target.def))),absorbed=Math.min(target.shield||0,raw),hpDamage=Math.min(target.hp,raw-absorbed),amount=absorbed+hpDamage;
      target.shield=Math.max(0,target.shield-absorbed);if(target.shield===0)target.shieldMax=0;target.hp-=hpDamage;target.flash=.13;target.lastHit=this.time;
      let healing=0;if(source){source.damage+=amount;source.hits++;if(kind==='basic')this.gainEnergy(source,ENERGY_ON_BASIC_HIT);if(source.hp>0)healing=Math.min(source.maxHp-source.hp,Math.floor(hpDamage*(source.lifestealBonus||0)));if(healing>0){source.hp+=healing;this.effects.push({type:'heal',id:source.id,value:healing,elapsed:0,duration:.68});}}
      this.gainEnergy(target,ENERGY_ON_DAMAGE);
      this.metrics.impacts++;this.effects.push({type:'hit',id:target.id,value:amount,critical,elapsed:0,duration:.68});
      this.emit('hit',{id:source?.id,target:target.id,value:amount,kind,absorbed,critical,healing});
      if(target.hp<=0){target.state='dead';target.move=null;target.attack=null;target.skill=null;target.shield=0;target.shieldMax=0;target.buff=null;target.deadTime=0;
        this.emit('death',{id:target.id,by:source?.id});}
    }
    finish(reason){
      if(this.phase!=='battle')return;
      const blue=this.alive('blue'),red=this.alive('red');
      const winner=blue.length&&!red.length?'blue':red.length&&!blue.length?'red':null;
      this.phase='finished';this.paused=false;
      this.result={winner,reason,time:this.time,blue:blue.length,red:red.length,
        damageBlue:this.units.filter(u=>u.team==='blue').reduce((a,u)=>a+u.damage,0),
        damageRed:this.units.filter(u=>u.team==='red').reduce((a,u)=>a+u.damage,0)};
      for(const u of this.alive()){u.move=null;u.attack=null;u.skill=null;u.shield=0;u.shieldMax=0;u.buff=null;u.state='idle';u.animTime=0;}
      for(const u of this.units)if(u.hp<=0)u.deadTime=.5;
      this.projectiles=[];this.effects=[];this.emit('finish',this.result);
    }
    step(dt){
      if(this.phase!=='battle'||this.paused)return;
      this.time+=dt;this.tick++;
      for(const f of this.effects)f.elapsed+=dt;
      this.effects=this.effects.filter(f=>f.elapsed<f.duration);
      // Alternating initiative prevents a fixed blue-first update advantage.
      const order=this.tick%2?this.units:[...this.units].reverse();
      for(const u of order){
        if(u.hp<=0){u.deadTime+=dt;continue;}
        u.animTime+=dt*(u.state==='move'?u.moveSpeed:1);u.cooldown=Math.max(0,u.cooldown-dt);u.think-=dt;u.flash=Math.max(0,u.flash-dt);
        if(u.buff){u.buff.remaining-=dt;if(u.buff.remaining<=0)u.buff=null;}
        if(u.move){
          u.move.elapsed+=dt;
          if(u.move.elapsed+1e-8>=u.move.duration){u.c=u.move.to.c;u.r=u.move.to.r;u.move=null;u.state='idle';u.think=0;}
          continue;
        }
        if(u.attack){
          const a=u.attack;a.elapsed+=dt*this.combatAttackSpeed(u);
          if(!a.hit&&a.elapsed+1e-8>=.2){a.hit=true;this.strike(u,a);}
          if(a.elapsed+1e-8>=.8){u.attack=null;u.state='idle';u.animTime=0;u.think=0;}
          continue;
        }
        if(u.skill){
          const cast=u.skill,definition=skill(u.characterId);cast.elapsed+=dt;
          if(!cast.triggered&&cast.elapsed+1e-8>=definition.trigger){cast.triggered=true;this.castSkill(u,cast);}
          if(cast.elapsed+1e-8>=definition.castDuration){u.skill=null;u.state='idle';u.animTime=0;u.think=0;}
          continue;
        }
        if(u.think<=0)this.chooseAction(u);
      }
      for(const p of this.projectiles){
        p.elapsed+=dt;const target=this.get(p.targetId);
        if(!target||target.hp<=0){p.done=true;continue;}
        if(p.elapsed>=p.duration){p.done=true;this.damage(this.get(p.sourceId),target,p.atk,{kind:p.kind||'skill'});}
      }
      this.projectiles=this.projectiles.filter(p=>!p.done);
      if(!this.alive('blue').length||!this.alive('red').length)this.finish('elimination');
      else if(this.time>=45)this.finish('timeout');
    }
    integrity(){
      const cells=new Map(),reservations=new Map(),issues=[];
      for(const u of this.alive()){
        const k=key(u.c,u.r);if(cells.has(k))issues.push('overlap:'+k);cells.set(k,u.id);
        if(u.move){const t=key(u.move.to.c,u.move.to.r);if(reservations.has(t))issues.push('reservation:'+t);reservations.set(t,u.id);}
        if(!this.validCell(u.c,u.r))issues.push('bounds:'+u.id);
      }
      for(const [k,id]of reservations)if(cells.has(k)&&cells.get(k)!==id)issues.push('occupied destination:'+k);
      return issues;
    }
  }
  const api={Game,STATS,CHARACTERS,EQUIPMENT,EQUIPMENT_SETS,EQUIPMENT_SLOT_COUNT,CRITICAL_DAMAGE_MULTIPLIER,FRIENDS,SYNERGIES,SKILLS,SHRIMP,character,equipment,equipmentSetStates,resolveEquipmentBonuses,resolveBaseStats,friendship,synergyState,synergyEffect,synergyDetails,synergyBonuses,formatSynergyBonus,skill,shrimp,DEFAULT,COLS,ROWS,key,axial,distance,neighbors};
  root.LionChess=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

