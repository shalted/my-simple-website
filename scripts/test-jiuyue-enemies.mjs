import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {loadGameSources,loadGameAssets} from './jiuyue-sources.mjs';

// 独立配置与页面真实加载链路同时验收，不允许仅配置存在但未接入。
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../games/jiuyue/js/enemies.js',import.meta.url),'utf8'),context);
const {ENEMIES,enemyWave}=context.LionEnemies;
const sources=loadGameSources();
function runtime(){
 const scope=vm.createContext({});
 for(const script of sources.scripts){
  if(['./js/assets.js','./js/ui.js'].includes(script.src))continue;
  vm.runInContext(script.code,scope,{filename:script.src});
 }
 return scope;
}

test('正式入口先加载敌方配置，模块缺失明确报错，不降级为英雄',()=>{
 const names=sources.scripts.map(script=>script.src);
 assert.ok(names.includes('./js/enemies.js'));
 assert.ok(names.indexOf('./js/enemies.js')<names.indexOf('./js/characters.js'));
 const characterCode=sources.scripts.find(script=>script.src==='./js/characters.js').code;
 assert.throws(()=>vm.runInNewContext(characterCode,{}),/ENEMIES/);
 const scope=runtime();assert.throws(()=>scope.LionCharacters.character('not-an-enemy'),/未知角色/);
});

test('四敌人十二动作与正式图集逐字节一致，帧序和脚底锚点符合运行时',()=>{
 const assets=loadGameAssets();
 const {ChessRenderer}=runtime(),renderer=new ChessRenderer.Renderer({getContext:()=>({})},{});
 for(const [id,definition] of Object.entries(ENEMIES)){
  const manifest=JSON.parse(fs.readFileSync(new URL(`../games/jiuyue/art/${id}/manifest.json`,import.meta.url),'utf8'));
  assert.deepEqual(manifest.frameSize,[416,480]);assert.deepEqual(manifest.anchor,[208,440]);
  for(const action of ['idle','move','attack']){
   const file=fs.readFileSync(new URL(`../games/jiuyue/art/${id}/${action}.png`,import.meta.url));
   assert.equal(assets[definition.assets[action]],'data:image/png;base64,'+file.toString('base64'));
   assert.equal(file.readUInt32BE(16),2080);assert.equal(file.readUInt32BE(20),480);assert.equal(file[25],6);
   const spec=manifest.actions[action];assert.equal(spec.frames.length,5);
   assert.deepEqual(spec.durationsMs,action==='attack'?[100,100,200,200,200]:[200,200,200,200,200]);
   let elapsed=0;
   for(const [frame,duration] of spec.durationsMs.entries()){
    const time=(elapsed+duration/2)/1000;
    assert.equal(renderer.animation({id:'red1',state:action,animTime:time,attack:action==='attack'?{elapsed:time}:null},{phase:'battle'},0).frame,frame);
    assert.equal(spec.frames[frame].outputBounds[3],440);elapsed+=duration;
   }
  }
 }
});

test('正式 Campaign 十波只使用独立敌人，商店仍只有六英雄',()=>{
 const scope=runtime(),campaign=new scope.LionCampaign(()=>0),heroes=Object.keys(scope.LionCharacters.CHARACTERS);
 assert.equal(heroes.length,6);
 for(let round=1;round<=10;round++){
  campaign.round=round;campaign.prepare();
  assert.equal(JSON.stringify(campaign.wave()),JSON.stringify(enemyWave(round)));
  for(const unit of campaign.game.units.filter(unit=>unit.team==='red')){
   assert.equal(unit.enemy,true);assert.ok(Object.hasOwn(ENEMIES,unit.characterId));
   assert.equal(heroes.includes(unit.characterId),false);assert.equal(unit.energyMax,0);
  }
 }
 for(let index=0;index<heroes.length;index++){
  campaign.random=()=>(index+.5)/heroes.length;campaign.refreshShop();
  assert.ok(campaign.shop.every(id=>id===heroes[index]));
 }
 assert.ok(new scope.LionChess.Game().units.filter(unit=>unit.team==='red').every(unit=>unit.enemy));
});

test('小怪与 Boss 不回能不施法，英雄打中敌人仍正常回能且敌人不参与羁绊',()=>{
 const scope=runtime(),campaign=new scope.LionCampaign(()=>0);campaign.round=10;campaign.prepare();
 const game=campaign.game,hero=game.get('blue1');
 for(const enemy of game.units.filter(unit=>unit.enemy)){
  game.damage(hero,enemy,1,{kind:'basic'});game.damage(enemy,hero,1,{kind:'basic'});
  assert.equal(enemy.energy,0);assert.equal(game.beginSkill(enemy),false);assert.equal(enemy.casts,0);
  assert.equal(enemy.attackSpeed,1);assert.equal(enemy.moveSpeed,1);assert.equal(enemy.synergyBonus.attackBonus,0);
 }
 assert.ok(hero.energy>0);
});

test('四敌方动作读取各自图集，缺图明确报错',()=>{
 const scope=runtime(),draws=[],ctx={save(){},restore(){},beginPath(){},ellipse(){},fill(){},stroke(){},drawImage(...args){draws.push(args);}};
 const images=Object.fromEntries(Object.values(ENEMIES).flatMap(definition=>Object.values(definition.assets)).map(key=>[key,{key}]));
 const renderer=new scope.ChessRenderer.Renderer({getContext:()=>ctx},images),game=new scope.LionChess.Game();
 for(const id of Object.keys(ENEMIES)){
  game.setCharacter('red1',id);const unit=game.get('red1');
  for(const action of ['idle','move','attack']){
   unit.state=action;unit.attack=action==='attack'?{elapsed:.2,targetId:'blue1'}:null;
   renderer.unit(ctx,unit,game,0);assert.equal(draws.at(-1)[0].key,`${id}_${action}`);
  }
 }
 game.setCharacter('red1','thrower');
 game.get('red1').state='attack';game.get('red1').attack={elapsed:.2,targetId:'blue1'};
 delete images.thrower_attack;
 assert.throws(()=>renderer.unit(ctx,game.get('red1'),game,0),/缺少角色动作素材：thrower\/attack/);
});

test('敌方远程第三帧才发射，飞行期间不扣血，到达仅命中一次',()=>{
 const scope=runtime();
 for(const id of ['carrier','thrower']){
  const game=new scope.LionChess.Game();
  game.layout=[{id:'enemy',team:'red',characterId:id,equipmentIds:[],c:2,r:2},{id:'hero',team:'blue',characterId:'xiaotian',equipmentIds:[],c:2,r:4}];
  game.restart();game.start();for(const unit of game.units){unit.think=100;unit.cooldown=100;}
  const enemy=game.get('enemy'),hero=game.get('hero'),hp=hero.hp;enemy.cooldown=0;game.chooseAction(enemy);
  game.step(.199);assert.equal(enemy.shots,0);game.step(.001);
  assert.equal(enemy.shots,1);assert.equal(hero.hp,hp);assert.equal(game.projectiles.length,1);
  for(let step=0;step<30;step++)game.step(.01);
  assert.equal(enemy.hits,1);assert.equal(hero.hp,hp-Math.floor(enemy.atk*100/(100+hero.def)));assert.equal(enemy.energy,0);
 }
});

test('全十波真实战斗可结束、无重叠、没有敌人英雄技能事件',()=>{
 const scope=runtime(),campaign=new scope.LionCampaign(()=>0);
 for(let round=1;round<=10;round++){
  campaign.round=round;campaign.prepare();const game=campaign.game,casts=[];
  game.listeners.push(event=>{if(event.type==='skill')casts.push(event.id);});
  game.start();for(let step=0;step<1500&&game.phase==='battle';step++){game.step(1/30);assert.equal(game.integrity().length,0);}
  assert.equal(game.phase,'finished');assert.ok(casts.every(id=>!game.get(id).enemy));
  assert.equal(game.units.filter(unit=>unit.enemy&&unit.characterId==='nian').length,round===10?1:0);
 }
});

test('两类月饼使用批准的贴地/抛物线轨迹，发射者阵亡不换身份，未知弹道报错',()=>{
 const scope=runtime(),game=new scope.LionChess.Game(),positions=[],arcs=[],fills=[],rotations=[];
 const ctx={save(){},restore(){},translate(x,y){positions.push({x,y});},rotate(value){rotations.push(value);},beginPath(){},arc(...args){arcs.push(args);},fill(){fills.push(this.fillStyle);},stroke(){},moveTo(){},lineTo(){}};
 const renderer=new scope.ChessRenderer.Renderer({getContext:()=>ctx},{});
 for(const id of ['carrier','thrower']){
  game.setCharacter('red1',id);const source=game.get('red1'),target=game.get('blue1');
  const a=scope.ChessRenderer.point(source.c,source.r),b=renderer.unitPoint(target);
  const projectile={from:{c:source.c,r:source.r},sourceId:source.id,targetId:target.id,elapsed:0,duration:1};
  for(const t of [0,.5,1]){
   projectile.elapsed=t;renderer.projectile(ctx,projectile,game);
   const position=positions.at(-1);assert.equal(position.x,a.x+(b.x-a.x)*t);
   assert.equal(position.y,id==='carrier'?a.y+(b.y-a.y)*t-7:(a.y-57)+(b.y-60-(a.y-57))*t-4*t*(1-t)*60);
   assert.equal(arcs.at(-2)[2],7);assert.equal(fills.at(-1),'#ffe09a');
  }
  source.hp=0;assert.doesNotThrow(()=>renderer.projectile(ctx,projectile,game));
 }
 assert.ok(rotations.some(value=>value!==0));
 scope.LionEnemies.ENEMIES.thrower.projectileStyle='missing-style';
 assert.throws(()=>renderer.projectile(ctx,{from:{c:2,r:2},sourceId:'red1',targetId:'blue1',elapsed:.5,duration:1},game),/未知敌方弹道/);
});

test('Boss 明示首领，敌人不画能量条，档案不读取英雄技能',()=>{
 const scope=runtime(),game=new scope.LionChess.Game(),labels=[],rectangles=[];
 game.setCharacter('red1','nian');
 const ctx={beginPath(){},roundRect(...args){rectangles.push(args);},fill(){},stroke(){},fillText(label){labels.push(label);}};
 const renderer=new scope.ChessRenderer.Renderer({getContext:()=>ctx},{});
 renderer.health(ctx,game.get('red1'));assert.ok(labels.includes('首领'));assert.ok(rectangles.every(rect=>rect[3]!==5));
 const ui=sources.scripts.find(script=>script.src==='./js/ui.js').code;
 assert.ok(ui.includes('Object.entries({...CHARACTERS,...ENEMIES})'));
 assert.ok(ui.includes('u.enemy?definition.description:definition.description'));
});
test('三个小怪和年兽身份独立，动作键对齐正式素材目录',()=>{
 assert.deepEqual(Object.keys(ENEMIES).sort(),['carrier','guard','nian','thrower']);
 for(const [id,definition] of Object.entries(ENEMIES)){
  for(const action of ['idle','move','attack'])assert.equal(definition.assets[action],id+'_'+action);
  assert.equal(definition.statsKey,definition.kind==='melee'?'melee':'ranged');
 }
 assert.equal(ENEMIES.nian.boss,true);
 assert.equal(ENEMIES.carrier.projectileStyle,'rolling-mooncake');
 assert.equal(ENEMIES.thrower.projectileStyle,'flying-mooncake');
});
test('整条波次按确认的星级与系数配置，护饼卫先升星且最终年兽为三星',()=>{
 const cells=[[2,2],[4,2],[3,0],[1,1],[5,1],[3,1]],seen=new Set();
 const powers=[.72,.775,.975,1.30,1.10,1.10,1.20,1.20,1.30,1.10];
 const stars=[[1,1],[1,1],[1,1,1],[1,1,1,1],[2,1,1,1,1],[2,1,1,2,1],[2,1,1,2,1],[2,1,2,2,1],[2,1,2,2,1,1],[3,1,2,2,1,1]];
 for(let round=1;round<=10;round++){
  const wave=enemyWave(round);
  assert.equal(wave.length,[2,2,3,4,5,5,5,5,6,6][round-1]);
  assert.equal(wave.filter(unit=>unit.characterId==='nian').length,round===10?1:0);
  wave.forEach((unit,index)=>{
   seen.add(unit.characterId);assert.ok(Object.hasOwn(ENEMIES,unit.characterId));
   assert.deepEqual([unit.c,unit.r],cells[index]);assert.equal(unit.team,'red');
   assert.equal(unit.star,stars[round-1][index]);
   const power=powers[round-1];
   assert.equal(unit.power,unit.characterId==='nian'?power*1.50:power);assert.equal(unit.equipmentIds.length,0);
  });
 }
 assert.equal(seen.size,4);
});

// 固定站位和种子只用于平衡回归，不作为玩家获胜的星级/装备门槛。
function balanceSample(stars,equipped,{round=10,skills=true,ids=['xiaotian','xiaoyu','jiuyue','aolie','nezha','yangjian'],cells=[[2,5],[4,5],[3,7],[1,7],[3,5],[5,7]]}={}){
 const scope=runtime();
 const gear=['yinyuehujia','daoyaogui','huhuodeng','canghailongzhu','fenghuolun','sanjianliangrendao'];
 let wins=0,casts=0,time=0;
 for(let seed=1;seed<=30;seed++){
  let state=seed;
  const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  const game=new scope.LionChess.Game(random);
  game.layout=[...stars.map((star,i)=>({id:'blue'+i,team:'blue',characterId:ids[i],star,equipmentIds:equipped?[gear[i]]:[],c:cells[i][0],r:cells[i][1]})),...scope.LionEnemies.enemyWave(round)];
  game.restart();
  // 正式战斗的每次召出事件都检查上限，不只验证直接调用的夹具。
  game.listeners.push(event=>{if(event.type==='summon')assert.ok(game.units.filter(unit=>unit.summoned&&unit.summonerId===event.id&&unit.hp>0).length<=2);});
  // 仅验收夹具禁用主动技能，隔离其贡献；正式引擎不增加禁用分支。
  if(!skills)game.beginSkill=()=>false;
  game.start();for(let step=0;step<1500&&game.phase==='battle';step++)game.step(1/30);
  assert.equal(game.phase,'finished');wins+=Number(game.result.winner==='blue');
  casts+=game.units.reduce((sum,unit)=>sum+unit.casts,0);time+=game.time;
 }
 return {wins,casts,time:time/30};
}
test('固定一星教学队伍第五关遇到瓶颈，满人口一星散件队无法通关',()=>{
 assert.equal(balanceSample([1,1,1],false,{round:1}).wins,30);
 assert.equal(balanceSample([1,1,1],false,{round:5}).wins,0);
 assert.equal(balanceSample([1,1,1,1,1,1],true).wins,0);
});
test('延长后的首战约七秒能释放三次技能，不受中段波次调整影响',()=>{
 const opening=balanceSample([1,1,1],false,{round:1});
 // 固定样本快照：延长前约 5.5 秒/2 次，不是运行时保底时间。
 assert.equal(Math.round(opening.time),7);assert.equal(opening.casts/30,3);
});
test('第四关原四人一星站位失败，仅将曜瞳移至左侧前沿即可通过',()=>{
 const ids=['xiaotian','xiaoyu','jiuyue','yangjian'];
 assert.equal(balanceSample([1,1,1,1],false,{round:4,ids,cells:[[2,4],[4,4],[2,7],[3,7]]}).wins,0);
 assert.equal(balanceSample([1,1,1,1],false,{round:4,ids,cells:[[2,4],[4,4],[2,7],[1,4]]}).wins,30);
});
test('第五关起升星施压，二星追风可过第五关但第六七关仍需补强',()=>{
 const options={ids:['xiaotian','xiaoyu','jiuyue','yangjian'],cells:[[2,4],[4,4],[2,7],[1,4]]};
 assert.equal(balanceSample([1,1,1,1],false,{...options,round:5}).wins,0);
 assert.equal(balanceSample([2,1,1,1],false,{...options,round:5}).wins,30);
 for(const round of [6,7])assert.equal(balanceSample([2,1,1,1],false,{...options,round}).wins,0);
});
test('四名二星配两名一星及散件能通关，技能与养成不足则失败',()=>{
 const stars=[2,2,2,2,1,1],geared=balanceSample(stars,true);
 assert.equal(balanceSample([2,2,2,1,1,1],true).wins,0);
 assert.equal(geared.wins,30);assert.ok(geared.casts>0);
 assert.equal(Math.round(geared.time),27);
 assert.equal(balanceSample(stars,true,{skills:false}).wins,0);
});
test('三星追风配二星桂团及四名一星散件队能通关，核心单独升星仍不够',()=>{
 const stars=[3,2,1,1,1,1],geared=balanceSample(stars,true);
 assert.equal(geared.wins,30);assert.equal(Math.round(geared.time),18);
 assert.equal(balanceSample([3,1,1,1,1,1],true).wins,0);
 // 较强核心和护盾配合可裸装过关；装备缩短战斗，不作为强制获胜资格。
 const naked=balanceSample(stars,false);
 assert.equal(naked.wins,30);assert.ok(geared.time<naked.time);
 assert.equal(balanceSample(stars,true,{skills:false}).wins,0);
});
