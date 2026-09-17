import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { loadGameSources, loadGameAssets } from './jiuyue-sources.mjs';

const sources = loadGameSources();
const scripts = sources.scripts.map(script => script.code);
const ui = sources.scripts.find(script => script.src === './js/ui.js').code;
// 从交付文件读取真实引擎，避免测试一份与运行版本分离的实现。
function engine(includeRenderer = false) {
  const context = vm.createContext({});
  for (const {src, code} of sources.scripts) {
    if (src === './js/assets.js' || src === './js/ui.js' || (!includeRenderer && src === './js/renderer.js')) continue;
    vm.runInContext(code, context, { filename: src });
  }
  return { ...context.LionChess, Campaign: context.LionCampaign, Renderer: context.ChessRenderer?.Renderer };
}

test('独立模块按页面真实顺序加载，入口不再内嵌代码或素材', () => {
  for (const code of scripts) new vm.Script(code);
  assert.equal(new Set(sources.scripts.map(s=>s.src)).size,sources.scripts.length);
  assert.equal(sources.styles.length,4);assert.ok(sources.styles[0].code.includes('.synergy-strip'));
  assert.doesNotMatch(sources.html,/const ASSETS=|class Game|<style>/);
  assert.equal(sources.scripts[0].src,'./js/resource-loader.js');assert.equal(sources.scripts.at(-1).src,'./js/ui.js');
  assert.ok(!sources.scripts.some(script=>script.src==='./js/assets.js'));
});
test('游戏外置的十五组新增角色动作与已打包文件逐字节一致', () => {
  const assets = loadGameAssets();
  for (const id of ['xiaotian', 'xiaoyu', 'aolie', 'yangjian', 'nezha']) for (const action of ['idle', 'move', 'attack']) {
    const file = fs.readFileSync(new URL(`../games/jiuyue/art/${id}/${action}.png`, import.meta.url));
    assert.equal(assets[id + '_' + action], 'data:image/png;base64,' + file.toString('base64'));
    assert.equal(file.readUInt32BE(16), 2080); assert.equal(file.readUInt32BE(20), 480);
    assert.equal(file[25], 6);
  }
});
test('六套主动技能与三星虾兵图集完整打包，不使用普通攻击素材代替',()=>{
  const assets=loadGameAssets();
  for(const id of ['jiuyue','xiaotian','xiaoyu','aolie','yangjian','nezha']){
    const file=fs.readFileSync(new URL(`../games/jiuyue/art/${id}/skill.png`,import.meta.url));
    assert.equal(assets[id+'_skill'],'data:image/png;base64,'+file.toString('base64'));
    assert.notEqual(assets[id+'_skill'],assets[id+'_attack']);assert.equal(file.readUInt32BE(16),2080);assert.equal(file.readUInt32BE(20),480);assert.equal(file[25],6);
  }
  for(const star of [1,2,3]){
    const file=fs.readFileSync(new URL(`../games/jiuyue/art/shrimp/star${star}.png`,import.meta.url));
    assert.equal(assets['shrimp_star'+star],'data:image/png;base64,'+file.toString('base64'));
    assert.equal(file.readUInt32BE(16),2080);assert.equal(file.readUInt32BE(20),480);assert.equal(file[25],6);
  }
});
test('羁绊条显示上阵相关项，未激活可查看说明，无成员时隐藏', () => {
  // 只测真实渲染函数的结构逻辑；悬浮、定位和拖拽另用浏览器验收。
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.events = {}; }
    setAttribute(key, value) { this.attributes[key] = value; }
    append(...children) { this.children.push(...children); }
    replaceChildren() { this.children = []; }
    addEventListener(name, handler) { this.events[name] = handler; }
  }
  const calls=[], panel = new Element('section'), context = vm.createContext({
    flow:undefined, synergyPanel: panel, synergySignature: null, document: { createElement: tag => new Element(tag) },
    closeSynergyTip() { calls.push('close'); }, openSynergyTip() { calls.push('open'); },
  });
  const code = ui.match(/function renderSynergyStrip\(entries\)\{[\s\S]*?\n\}\nsynergyTip/)[0].replace(/\nsynergyTip$/, '');
  vm.runInContext(code, context);
  const entries = [
    { active: true, name: '测试羁绊甲', memberCount:2, missing:[] },
    { active: false, name: '测试未激活', memberCount:2, missing:['partner'] },
    { active: false, name: '无人上阵', memberCount:2, missing:['first','partner'] },
  ];
  context.renderSynergyStrip(entries);
  assert.equal(panel.hidden, false); assert.equal(panel.children.length, 2);
  assert.deepEqual(panel.children.map(button => button.children[1].textContent), ['测试羁绊甲', '测试未激活 · 未激活']);
  assert.equal(panel.children[0].className,'synergy-chip');assert.equal(panel.children[1].className,'synergy-chip inactive');
  const first = panel.children[0]; context.renderSynergyStrip(entries); assert.equal(panel.children[0], first);
  for (const button of panel.children) {
    assert.equal(button.attributes['aria-expanded'], 'false');
    for (const name of ['pointerenter', 'pointerleave', 'focus', 'blur', 'click']) assert.equal(typeof button.events[name], 'function');
  }
  // 浏览器桥没有 hover 接口：真实鼠标事件处理器另外在这里执行，不能冒充人工悬浮验收。
  const mouseButton=panel.children[1];calls.length=0;
  mouseButton.events.pointerenter({pointerType:'mouse'});assert.deepEqual(calls,['open']);
  mouseButton.events.pointerenter({pointerType:'touch'});assert.deepEqual(calls,['open']);
  mouseButton.events.focus();mouseButton.events.blur();mouseButton.events.click();
  assert.deepEqual(calls,['open','open','close','open']);
  const activated=entries.map(entry=>entry.name==='测试未激活'?{...entry,active:true,missing:[]}:entry);
  context.renderSynergyStrip(activated);assert.equal(panel.children[1].className,'synergy-chip');
  assert.equal(panel.children[1].children[1].textContent,'测试未激活');
  context.renderSynergyStrip(entries.map(entry => ({ ...entry, active: false,missing:['first','partner'] })));
  assert.equal(panel.hidden, true); assert.equal(panel.children.length, 0);
  // 使用真实阵容状态和真实入口验证：备战席、敌人、重复副本不能补齐成员。
  const {Campaign,CHARACTERS,synergyEffect}=engine(),campaign=new Campaign();
  Object.assign(context,{game:campaign.game,character:id=>CHARACTERS[id],synergyEffect,activeSynergyNames:new Set(),toast(){}});
  vm.runInContext(ui.match(/function renderFriendship\(\)\{[\s\S]*?\n\}\nfunction renderCharacterSynergies/)[0].replace(/\nfunction renderCharacterSynergies$/,''),context);
  const labels=()=>panel.children.map(button=>button.children[1].textContent);
  context.renderFriendship();
  assert.deepEqual(labels(),['霜灯逐风','追月拍档 · 未激活','月潮同辉 · 未激活','照夜同行 · 未激活']);
  assert.equal(campaign.bench('blue3',0).ok,true);context.renderFriendship();
  assert.deepEqual(labels(),['霜灯逐风 · 未激活','追月拍档 · 未激活','照夜同行 · 未激活']);
  assert.equal(campaign.game.get('blue1').attackSpeed,1);
  assert.equal(campaign.bench('blue1',1).ok,true);context.renderFriendship();assert.equal(panel.children.length,3);
  assert.equal(campaign.bench('blue2',2).ok,true);context.renderFriendship();assert.equal(panel.hidden,true);
  assert.equal(campaign.place('blue3',3,7).ok,true);context.renderFriendship();
  assert.deepEqual(labels(),['霜灯逐风 · 未激活','月潮同辉 · 未激活']);
  assert.equal(campaign.place('blue1',2,5).ok,true);context.renderFriendship();
  assert.deepEqual(labels(),['霜灯逐风','追月拍档 · 未激活','月潮同辉 · 未激活','照夜同行 · 未激活']);
  assert.equal(campaign.game.get('blue1').attackSpeed,1.15);
});
test('开局角色、基础数值、己方羁绊与敌方隔离', () => {
  const { Campaign } = engine(), c = new Campaign(() => 0);
  assert.deepEqual(Array.from(c.owned, u => u.characterId), ['xiaotian', 'xiaotian', 'jiuyue']);
  const x = c.game.get('blue1');
  assert.equal(x.hp, Math.round(660*1.35)); assert.equal(x.atk, 64); assert.equal(x.def, 16); assert.equal(x.range, 1);
  assert.equal(x.interval, 1.15 / 1.15); assert.equal(c.game.friendship.active, true);
  assert.equal(c.game.get('red1').attackSpeed, 1);
});
test('下阵唯一九月立即失活，上阵与重复 prepare 不累计', () => {
  const { Campaign } = engine(), c = new Campaign();
  assert.equal(c.bench('blue3', 0).ok, true);
  assert.equal(c.game.friendship.active, false);
  assert.deepEqual(Array.from(c.game.friendship.missing), ['jiuyue']);
  assert.equal(c.game.get('blue1').interval, 1.15);
  assert.equal(c.place('blue3', 3, 7).ok, true);
  for (let i = 0; i < 8; i++) c.prepare();
  assert.equal(c.game.get('blue1').interval, 1);
  c.start(); assert.equal(c.game.get('blue1').interval, 1);
  c.game.get('blue3').hp = 0; c.game.step(1 / 30);
  assert.equal(c.game.get('blue1').attackSpeed, 1.15);
});
test('购入第三张哮天自动合成并保留场上位置、金币正确', () => {
  const { Campaign } = engine(), c = new Campaign(() => 0);
  const result = c.buy(0);
  assert.equal(result.ok, true); assert.equal(result.merged, 'blue1'); assert.equal(c.gold, 8);
  assert.equal(c.owned.length, 2); assert.equal(c.owned[0].star, 2);
  assert.equal(c.owned[0].c, 2); assert.equal(c.owned[0].r, 5);
  assert.equal(c.owned[1].characterId, 'jiuyue');
});
test('合成以身份判断，同定位的不同角色不能混合', () => {
  const { Campaign, CHARACTERS } = engine();
  CHARACTERS.testMelee = { name: '测试角色', kind: 'melee' };
  const c = new Campaign();
  c.owned = [
    { equipmentIds:[],id: 'a', characterId: 'xiaotian', kind: 'melee', star: 1, slot: 0 },
    { equipmentIds:[],id: 'b', characterId: 'xiaotian', kind: 'melee', star: 1, slot: 1 },
    { equipmentIds:[],id: 'c', characterId: 'testMelee', kind: 'melee', star: 1, slot: 2 },
  ];
  assert.equal(c.mergeAll(), null); assert.equal(c.owned.length, 3);
});
test('九张同名角色可连续合为三星；出售返还九份售价', () => {
  const { Campaign } = engine(), c = new Campaign();
  c.owned = Array.from({ length: 9 }, (_, i) => ({ equipmentIds:[],id: 'u' + i, characterId: 'xiaotian', kind: 'melee', star: 1, c: 2, r: 5, slot: i ? i - 1 : null }));
  c.prepare(); assert.equal(c.owned.length, 1); assert.equal(c.owned[0].star, 3);
  const before = c.gold; assert.equal(c.sell(c.owned[0].id).ok, true); assert.equal(c.gold - before, 18);
});
test('备战席满时拒绝不合成的购买，但允许立即合成', () => {
  const { Campaign } = engine(), c = new Campaign(() => .999);
  c.owned.push(...Array.from({ length: 8 }, (_, i) => ({ equipmentIds:[],id: 'bench' + i, characterId: 'jiuyue', kind: 'ranged', star: 3, slot: i, c: null, r: null })));
  c.prepare(); const before = JSON.stringify(c.owned), gold = c.gold;
  assert.equal(c.buy(0).ok, false); assert.equal(c.gold, gold); assert.equal(JSON.stringify(c.owned), before);
  c.shop[0] = 'xiaotian'; assert.equal(c.buy(0).ok, true); assert.equal(c.owned.some(u => u.slot === undefined), false);
});
test('未知角色明确报错，不回退成九月', () => {
  const { Game } = engine(), g = new Game(); g.layout[0].characterId = 'missing';
  assert.throws(() => g.restart(), /未知角色/);
});
test('渲染三种动作读取各自角色素材，缺少哮天素材直接报错', () => {
  const { Game, Renderer } = engine(true), g = new Game(), draws = [];
  // 测试替身仅记录绘图调用，不代替实际浏览器的视觉验收。
  const ctx = { save(){}, restore(){}, beginPath(){}, ellipse(){}, fill(){}, stroke(){}, drawImage(...args){ draws.push(args); } };
  const images = Object.fromEntries(['idle','move','attack','xiaotian_idle','xiaotian_move','xiaotian_attack'].map(key => [key, { key }]));
  const renderer = new Renderer({ getContext: () => ctx }, images);
  for (const id of ['blue1', 'blue3']) for (const action of ['idle', 'move', 'attack']) {
    const u = g.get(id); u.state = action;
    u.attack = action === 'attack' ? { elapsed: .2, targetId: 'red1' } : null;
    renderer.unit(ctx, u, g, 0);
    const args = draws.at(-1);
    assert.equal(args[0].key, id === 'blue1' ? 'xiaotian_' + action : action);
    assert.equal(args[1], action === 'attack' ? 416 * 2 : Math.floor((Number(id.slice(-1)) * .17) / .2) % 5 * 416 * Number(action === 'idle'));
  }
  const x = g.get('blue1'); x.state = 'idle'; x.attack = null;
  delete images.xiaotian_idle;
  assert.throws(() => renderer.unit(ctx, x, g, 0), /缺少角色动作素材：xiaotian\/idle/);
});
test('所有己方副本受益；同名重复和敌方九月不能激活羁绊', () => {
  const { Game } = engine(), g = new Game();
  // 显式保留敌方英雄的隔离夹具，正式 PvE 默认阵容已经不使用九月。
  g.setCharacter('red3','jiuyue');
  assert.equal(g.get('blue1').attackSpeed, 1.15);
  assert.equal(g.get('blue2').attackSpeed, 1.15);
  assert.equal(g.get('blue3').attackSpeed, 1.15);
  g.setCharacter('blue3', 'xiaotian');
  assert.equal(g.friendship.active, false);
  assert.equal(g.units.filter(u => u.team === 'blue').every(u => u.attackSpeed === 1), true);
});
test('攻速加成同步命中帧，近战一次攻击只扣一次血', () => {
  const { Game } = engine(), g = new Game();
  g.layout = [
    {equipmentIds:[],id:'x',team:'blue',characterId:'xiaotian',c:2,r:4},
    {equipmentIds:[],id:'j',team:'blue',characterId:'jiuyue',c:6,r:7},
    {equipmentIds:[],id:'r',team:'red',characterId:'xiaotian',c:2,r:3},
  ];
  g.restart(); g.start(); const x=g.get('x'), j=g.get('j'), r=g.get('r');
  x.cooldown=0; j.cooldown=100; j.think=100; r.cooldown=100; r.think=100;
  g.chooseAction(x); const hp=r.hp;
  g.step(.2/1.15-.001); assert.equal(r.hp,hp);
  g.step(.001); assert.equal(r.hp,hp-Math.floor(64*100/116)); assert.equal(x.hits,1);
  g.step(.3); assert.equal(x.hits,1);
  assert.ok(Math.abs(x.attack.elapsed-(.2+.3*1.15))<1e-8);
});
test('远程发射时不扣血，弹道到达才命中', () => {
  const { Game } = engine(), g = new Game();
  g.layout=[{equipmentIds:[],id:'j',team:'blue',characterId:'jiuyue',c:2,r:4},{equipmentIds:[],id:'r',team:'red',characterId:'xiaotian',c:2,r:2}];
  g.restart();g.start();const j=g.get('j'),r=g.get('r');j.cooldown=0;r.think=100;r.cooldown=100;
  g.chooseAction(j);const hp=r.hp;
  for(let i=0;i<20;i++)g.step(.01);
  assert.equal(j.shots,1);assert.equal(r.hp,hp);
  for(let i=0;i<30;i++)g.step(.01);
  assert.equal(j.hits,1);assert.ok(r.hp<hp);
});
test('十轮战斗完整结束，占格与跨回合状态无异常', () => {
  const { Campaign } = engine(), c = new Campaign();
  let equipmentDropCount=0;
  // 固定强阵容只用于测试十轮终态，不修改产品的敌人或玩家数值。
  c.owned.forEach(u=>u.star=3);
  // 新首领下三人烟测队不再保证通关；生命周期烟测补齐六人口，难度由独立样本验收。
  c.level=6;
  for(const [characterId,col,row] of [['xiaoyu',0,5],['aolie',1,7],['yangjian',5,7]]){
    c.owned.push({id:characterId,characterId,star:3,equipmentIds:[],c:col,r:row,slot:null});
  }
  for(let round=1;round<=10;round++){
    c.prepare();assert.equal(c.game.units.every(u=>u.hp===u.maxHp),true);
    assert.equal(c.start().ok,true);
    for(let tick=0;tick<1400&&c.game.phase==='battle';tick++){
      c.game.step(1/30);assert.equal(c.game.integrity().length,0);
    }
    assert.equal(c.game.phase,'finished');assert.ok(c.reward);equipmentDropCount+=c.reward.equipmentDrops.length;
    if(round<10)assert.equal(c.next().ok,true);
  }
  assert.equal(c.status,'clear');assert.equal(c.equipmentInventory.length,equipmentDropCount);c.reset();assert.equal(c.round,1);assert.equal(c.hp,20);
});

test('六角色均能从商店抽取，新角色购买合成保持独立身份', () => {
  const { Campaign, CHARACTERS } = engine(), ids = Object.keys(CHARACTERS);
  assert.deepEqual(Array.from(ids).sort(), ['aolie','jiuyue','nezha','xiaotian','xiaoyu','yangjian']);
  for (const [index, id] of ids.entries()) {
    const c = new Campaign(() => (index + .5) / ids.length);
    assert.deepEqual(Array.from(c.shop), Array(4).fill(id));
    if (!['xiaoyu', 'aolie', 'yangjian', 'nezha'].includes(id)) continue;
    for (let slot = 0; slot < 3; slot++) assert.equal(c.buy(slot).ok, true);
    const added = c.owned.filter(u => u.characterId === id);
    assert.equal(added.length, 1); assert.equal(added[0].star, 2);
    assert.equal(c.gold, 4); assert.equal(c.owned.filter(u => u.characterId === 'xiaotian').length, 2);
    assert.equal(c.place(added[0].id, 2, 5).ok, true);
    assert.equal(c.game.get(added[0].id).characterId, id);
  }
});

test('新角色保留独立基础属性，叠加关系加成后重复准备不累计', () => {
  const { Campaign, STATS } = engine(), c = new Campaign();
  c.level = 5;
  c.owned.push({equipmentIds:[],id:'yu',characterId:'xiaoyu',star:2,c:1,r:6,slot:null},
    {equipmentIds:[],id:'lie',characterId:'aolie',star:1,c:5,r:7,slot:null});
  for (let i = 0; i < 3; i++) c.prepare();
  const yu=c.game.get('yu'), lie=c.game.get('lie');
  assert.equal(yu.hp,Math.round(STATS.xiaoyu.hp*1.7*1.35)); assert.equal(yu.atk,Math.round(STATS.xiaoyu.atk*1.7));
  assert.equal(yu.interval,.95/1.08); assert.equal(yu.kind,'melee'); assert.equal(yu.attackSpeed,1.08);
  assert.equal(yu.moveSpeed,1.2); assert.equal(lie.atk,Math.round(62*1.15));
  assert.equal(lie.hp,Math.round(560*1.35)); assert.equal(lie.interval,1.4); assert.equal(lie.kind,'ranged');
  assert.equal(lie.attackSpeed,1); assert.equal(c.game.friendship.active,true);
});

// 固定测试阵容只用于边界验收，不改变生产开局或商店概率。
function fourCharacterGame(Game) {
  const g=new Game();
  g.layout=[
    {equipmentIds:[],id:'x',team:'blue',characterId:'xiaotian',star:1,c:0,r:7,slot:null},
    {equipmentIds:[],id:'j',team:'blue',characterId:'jiuyue',star:2,c:2,r:7,slot:null},
    {equipmentIds:[],id:'yu',team:'blue',characterId:'xiaoyu',star:1,c:4,r:7,slot:null},
    {equipmentIds:[],id:'lie',team:'blue',characterId:'aolie',star:1,c:6,r:7,slot:null},
    {equipmentIds:[],id:'r',team:'red',characterId:'xiaotian',star:3,c:3,r:0,slot:null},
  ];
  g.restart();return g;
}

test('三羁绊同时激活，各自成员受益且攻速相加不连乘',()=>{
  const {Game}=engine(),g=fourCharacterGame(Game);
  assert.deepEqual(Array.from(g.synergies,e=>[e.name,e.active]),[['霜灯逐风',true],['追月拍档',true],['月潮同辉',true],['双星争辉',false],['赤轮逐浪',false],['照夜同行',false]]);
  for(let i=0;i<5;i++)g.applyFriendship();
  assert.equal(g.get('x').attackSpeed,1.23);assert.equal(g.get('x').moveSpeed,1.2);assert.equal(g.get('x').atk,64);
  assert.equal(g.get('j').attackSpeed,1.15);assert.equal(g.get('j').moveSpeed,1);
  assert.equal(g.get('j').atk,Math.round(Math.round(56*1.7)*1.15));
  assert.equal(g.get('yu').attackSpeed,1.08);assert.equal(g.get('yu').atk,72);
  assert.equal(g.get('lie').attackSpeed,1);assert.equal(g.get('lie').atk,71);
  assert.equal(g.get('r').attackSpeed,1);assert.equal(g.get('r').moveSpeed,1);
  assert.equal(g.get('r').atk,g.get('r').baseAtk);
});

test('重复成员不叠加，备战席和敌人均不能补齐新羁绊',()=>{
  const {Game,synergyState,SYNERGIES}=engine(),g=fourCharacterGame(Game);
  g.layout.push({equipmentIds:[],id:'x2',team:'blue',characterId:'xiaotian',c:0,r:6,slot:null});g.restart();
  assert.equal(g.get('x2').attackSpeed,1.23);assert.equal(g.get('x2').moveSpeed,1.2);
  for(const definition of SYNERGIES.slice(1)){
    const first={team:'blue',characterId:definition.members[0],slot:null};
    const partner={team:'blue',characterId:definition.members[1],slot:0};
    assert.equal(synergyState([first,first,partner],definition).active,false);
    assert.equal(synergyState([first,{...partner,team:'red',slot:null}],definition).active,false);
    assert.equal(synergyState([first,{...partner,slot:null}],definition).active,true);
  }
});

test('下阵只取消相关羁绊，攻击与速度恢复基础值',()=>{
  const {Game}=engine(),g=fourCharacterGame(Game);
  g.layout=g.layout.filter(u=>u.id!=='yu');g.restart();
  assert.equal(g.get('x').attackSpeed,1.15);assert.equal(g.get('x').moveSpeed,1);
  assert.equal(g.get('lie').atk,71);
  g.layout=g.layout.filter(u=>u.id!=='j');g.restart();
  assert.equal(g.synergies.some(e=>e.active),false);assert.equal(g.get('lie').atk,62);assert.equal(g.get('x').attackSpeed,1);
});

test('成员阵亡不取消本场任何羁绊，重新布阵才重算',()=>{
  const {Game}=engine(),g=fourCharacterGame(Game);g.start();
  g.get('yu').hp=0;g.get('j').hp=0;g.step(.01);
  assert.equal(g.synergies.slice(0,3).every(e=>e.active),true);assert.equal(g.get('x').attackSpeed,1.23);assert.equal(g.get('lie').atk,71);
  g.restart();assert.equal(g.get('yu').hp,g.get('yu').maxHp);assert.equal(g.get('lie').atk,71);
});

test('追兔移速缩短单格时长且迈步动画同步，寻路占格仍正确',()=>{
  const {Game}=engine(),g=fourCharacterGame(Game);g.start();const x=g.get('x');
  g.chooseAction(x);assert.equal(x.state,'move');assert.equal(x.move.duration,.36/1.2);
  const before=x.animTime;g.step(.1);assert.ok(Math.abs(x.animTime-before-.12)<1e-8);
  for(let i=0;i<1400&&g.phase==='battle';i++){g.step(1/30);assert.equal(g.integrity().length,0);}
  assert.equal(g.phase,'finished');
});

test('双羁绊攻速同步命中与收招，小玉单羁绊也不重复命中',()=>{
  const {Game}=engine();
  for(const [attacker,speed,attack] of [['x',1.23,64],['yu',1.08,72]]){
    const g=fourCharacterGame(Game);const config=g.layout.find(u=>u.id===attacker);config.c=2;config.r=4;
    const target=g.layout.find(u=>u.id==='r');target.c=2;target.r=3;
    g.restart();g.start();const a=g.get(attacker),r=g.get('r');
    for(const u of g.units){u.think=100;u.cooldown=100;}a.cooldown=0;
    g.chooseAction(a);const hp=r.hp;g.step(.2/speed-.001);assert.equal(r.hp,hp);
    g.step(.001);assert.equal(r.hp,hp-Math.floor(attack*100/116));assert.equal(a.hits,1);
    g.step(.6/speed);assert.equal(a.attack,null);assert.equal(a.hits,1);
  }
});

test('档案仅列相关羁绊，区分未上阵与备战席，说明随配置生成',()=>{
  const {Game,synergyDetails,synergyEffect}=engine(),g=fourCharacterGame(Game);
  const details=synergyDetails('xiaotian',g.synergies,[]);
  assert.deepEqual(Array.from(details,e=>e.name),['霜灯逐风','追月拍档','照夜同行']);assert.equal(details.slice(0,2).every(e=>e.status==='已激活'),true);assert.equal(details[2].status,'待上阵：曜瞳');
  assert.match(details[1].effect,/移速 \+20%.*攻速 \+8%/);
  g.layout=g.layout.filter(u=>u.id!=='yu');g.restart();
  const missing=synergyDetails('xiaotian',g.synergies,[{characterId:'xiaoyu',slot:0}])[1];
  assert.equal(missing.status,'待上阵：桂团（备战席）');
  assert.equal(synergyDetails('xiaotian',g.synergies,[])[1].status,'待上阵：桂团');
  assert.equal(synergyEffect({...g.synergies[1],attackSpeedBonus:.07}).includes('攻速 +7%'),true);
  assert.throws(()=>synergyDetails('missing',g.synergies,[]),/未知角色/);
});

test('烈烈水球第三帧发射、到达才扣血，颜色不影响九月火球', () => {
  const { Game, Renderer, CHARACTERS }=engine(true), g=new Game();
  g.layout=[{equipmentIds:[],id:'lie',team:'blue',characterId:'aolie',c:2,r:4},{equipmentIds:[],id:'r',team:'red',characterId:'xiaotian',c:2,r:2}];
  g.restart();g.start();const lie=g.get('lie'),r=g.get('r');lie.cooldown=0;r.think=100;r.cooldown=100;
  g.chooseAction(lie);const hp=r.hp;
  for(let i=0;i<20;i++)g.step(.01);
  assert.equal(lie.shots,1);assert.equal(r.hp,hp);
  const fills=[],ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){fills.push(this.fillStyle);}};
  const renderer=new Renderer({getContext:()=>ctx},{});
  renderer.projectile(ctx,g.projectiles[0],g);
  assert.deepEqual(fills,[CHARACTERS.aolie.projectile.body,CHARACTERS.aolie.projectile.highlight]);
  assert.notEqual(CHARACTERS.aolie.projectile.body,CHARACTERS.jiuyue.projectile.body);
  for(let i=0;i<30;i++)g.step(.01);
  assert.equal(lie.hits,1);assert.ok(r.hp<hp);
});

test('新角色三组动画使用自己图集，缺失动作保持明确报错', () => {
  const { Game, Renderer, CHARACTERS }=engine(true),g=new Game(),draws=[];
  const ctx={save(){},restore(){},beginPath(){},ellipse(){},fill(){},stroke(){},drawImage(...args){draws.push(args);}};
  for(const id of ['xiaoyu','aolie','yangjian','nezha']){
    g.setCharacter('blue1',id);
    const images=Object.fromEntries(Object.values(CHARACTERS[id].assets).map(key=>[key,{key}]));
    const renderer=new Renderer({getContext:()=>ctx},images),u=g.get('blue1');
    for(const action of ['idle','move','attack']){
      u.state=action;u.attack=action==='attack'?{elapsed:.2,targetId:'red1'}:null;
      renderer.unit(ctx,u,g,0);assert.equal(draws.at(-1)[0].key,id+'_'+action);
    }
    delete images[id+'_attack'];assert.throws(()=>renderer.unit(ctx,u,g,0),/缺少角色动作素材/);
  }
});

test('档案仅展示总羁绊加成，不重复成员列表，备战席与敌方保持说明',()=>{
  class Element {
    constructor(tag){this.tag=tag;this.children=[];}
    append(...children){this.children.push(...children);}
    replaceChildren(){this.children=[];}
  }
  const panel=new Element('div'),context=vm.createContext({selectedSynergies:panel,document:{createElement:tag=>new Element(tag)}});
  vm.runInContext(ui.match(/function renderCharacterSynergies\(u,owned\)\{[\s\S]*?\n\}\nfunction toast/)[0].replace(/\nfunction toast$/,''),context);
  const {Game}=engine(),g=fourCharacterGame(Game);
  context.renderCharacterSynergies(g.get('x'),{slot:null});
  assert.equal(panel.children.length,2);assert.equal(panel.children[0].textContent,'总羁绊加成');
  assert.equal(panel.children[1].textContent,'攻速 +23% · 移速 +20%');
  context.renderCharacterSynergies(g.get('j'),{slot:null});
  assert.equal(panel.children[1].textContent,'攻速 +15% · 移速 +0% · 攻击 +15%');
  context.renderCharacterSynergies(g.get('x'),{slot:0});assert.match(panel.children[1].textContent,/备战席.*不获得加成/);
  context.renderCharacterSynergies(g.get('r'),null);assert.equal(panel.children[1].textContent,'对手不参与己方羁绊。');
  g.setCharacter('x','yangjian');context.renderCharacterSynergies(g.get('x'),{slot:null});
  assert.equal(panel.children[1].textContent,'攻速 +0% · 移速 +0%');
  context.renderCharacterSynergies(null,null);assert.equal(panel.hidden,true);assert.equal(panel.children.length,0);
});

test('杨戬哪吒素材清单与实际运行帧序、脚底锚点一致', () => {
  const {Renderer}=engine(true),renderer=new Renderer({getContext:()=>({})},{});
  for(const id of ['yangjian','nezha']){
    const manifest=JSON.parse(fs.readFileSync(new URL(`../games/jiuyue/art/${id}/manifest.json`,import.meta.url),'utf8'));
    assert.deepEqual(manifest.frameSize,[416,480]);assert.deepEqual(manifest.anchor,[208,440]);
    for(const action of ['idle','move','attack']){
      const spec=manifest.actions[action];assert.equal(spec.frames.length,5);
      let elapsed=0;
      for(const [frame,duration] of spec.durationsMs.entries()){
        const middle=(elapsed+duration/2)/1000;
        const u={id:'blue0',state:action,animTime:middle,attack:action==='attack'?{elapsed:middle}:null};
        const actual=renderer.animation(u,{phase:'battle'},0);
        assert.equal(actual.name,action);assert.equal(actual.frame,frame);
        assert.equal(spec.frames[frame].outputBounds[3],manifest.anchor[1]);elapsed+=duration;
      }
    }
  }
});

test('哪吒挥板第三帧近战命中一次，不产生额外火焰弹道',()=>{
  const {Game,STATS}=engine(),g=new Game();
  g.layout=[{equipmentIds:[],id:'n',team:'blue',characterId:'nezha',c:2,r:4},{equipmentIds:[],id:'r',team:'red',characterId:'xiaotian',c:2,r:3}];
  g.restart();g.start();const n=g.get('n'),r=g.get('r');
  for(const u of g.units){u.think=100;u.cooldown=100;}n.cooldown=0;g.chooseAction(n);
  const hp=r.hp;g.step(.199);assert.equal(r.hp,hp);g.step(.001);
  assert.equal(r.hp,hp-Math.floor(STATS.nezha.atk*100/(100+r.def)));
  assert.equal(n.hits,1);assert.equal(n.shots,0);assert.equal(g.projectiles.length,0);
  g.step(.3);assert.equal(n.hits,1);
});

test('杨戬第三眼金光弹第3帧发射，到达后命中一次，沿用确认的色板',()=>{
  const {Game,CHARACTERS,STATS,Renderer}=engine(true),g=new Game();
  g.layout=[{equipmentIds:[],id:'y',team:'blue',characterId:'yangjian',c:2,r:4},{equipmentIds:[],id:'r',team:'red',characterId:'xiaotian',c:2,r:2}];
  g.restart();g.start();const y=g.get('y'),r=g.get('r');
  for(const u of g.units){u.think=100;u.cooldown=100;}y.cooldown=0;g.chooseAction(y);
  const hp=r.hp;g.step(.199);assert.equal(y.shots,0);assert.equal(r.hp,hp);g.step(.001);
  assert.equal(y.shots,1);assert.equal(y.hits,0);assert.equal(r.hp,hp);
  assert.deepEqual(CHARACTERS.yangjian.projectile,CHARACTERS.jiuyue.projectile);
  const fills=[],ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){fills.push(this.fillStyle);}};
  new Renderer({getContext:()=>ctx},{}).projectile(ctx,g.projectiles[0],g);
  assert.deepEqual(fills,[CHARACTERS.yangjian.projectile.body,CHARACTERS.yangjian.projectile.highlight]);
  for(let i=0;i<30;i++)g.step(.01);
  assert.equal(y.hits,1);assert.equal(r.hp,hp-Math.floor(STATS.yangjian.atk*100/(100+r.def)));
});

test('杨戬哪吒独立升星后应用竞争羁绊，两人不进入敌方波次',()=>{
  const {Campaign,STATS,SYNERGIES}=engine(),c=new Campaign();c.level=5;
  for(const [i,id] of ['yangjian','nezha'].entries())c.owned.push({equipmentIds:[],id,characterId:id,star:2,c:i*4,r:7,slot:null});
  for(let i=0;i<3;i++)c.prepare();
  for(const id of ['yangjian','nezha']){
    const u=c.game.get(id);assert.equal(u.hp,Math.round(Math.round(STATS[id].hp*1.7*1.35)*.8));assert.equal(u.atk,Math.round(Math.round(STATS[id].atk*1.7)*(id==='yangjian'?1.25:1.15)));
    assert.equal(u.interval,STATS[id].interval);assert.equal(u.attackSpeed,1);assert.equal(u.moveSpeed,1);
    assert.equal(SYNERGIES.slice(0,3).some(e=>e.members.includes(id)),false);
  }
  for(let round=1;round<=10;round++){
    c.round=round;assert.equal(c.wave().some(u=>['yangjian','nezha'].includes(u.characterId)),false);
  }
});

test('六羁绊按成员聚合，生命扣减不累积，退场保留而下阵取消',()=>{
  const {Game,CHARACTERS,synergyBonuses}=engine(),g=new Game();
  g.layout=Object.keys(CHARACTERS).map((id,i)=>({equipmentIds:[],id,characterId:id,team:'blue',c:i,r:7,slot:null}));
  g.layout.push({equipmentIds:[],id:'red',characterId:'xiaotian',team:'red',c:3,r:0});g.restart();
  for(let i=0;i<5;i++)g.applyFriendship();
  assert.equal(g.synergies.every(e=>e.active),true);
  assert.equal(g.get('nezha').maxHp,Math.round(Math.round(600*1.35)*.8));assert.equal(g.get('yangjian').maxHp,Math.round(Math.round(580*1.35)*.8));
  assert.equal(g.get('nezha').atk,90);assert.equal(g.get('yangjian').atk,Math.round(70*1.25));
  assert.equal(g.get('nezha').moveSpeed,1.15);assert.equal(g.get('nezha').attackSpeed,1);
  assert.equal(g.get('aolie').atk,81);assert.equal(g.get('aolie').attackSpeed,1.08);assert.equal(g.get('aolie').moveSpeed,1);
  assert.equal(g.get('aolie').synergyBonus.projectileScaleBonus,.5);
  assert.equal(g.get('red').attackSpeed,1);assert.equal(g.get('red').maxHp,Math.round(660*1.35));
  assert.deepEqual({...synergyBonuses('nezha',[])},{attackBonus:0,attackSpeedBonus:0,moveSpeedBonus:0,hpBonus:0,projectileScaleBonus:0});
  const invalid=g.synergies.map(e=>({...e}));delete invalid[3].hpBonus;
  assert.throws(()=>synergyBonuses('yangjian',invalid),/羁绊属性缺失或非法/);
  g.start();g.get('yangjian').hp=0;g.get('nezha').hp=0;g.step(.01);
  assert.equal(g.get('aolie').synergyBonus.projectileScaleBonus,.5);assert.equal(g.get('aolie').attackSpeed,1.08);
  g.layout=g.layout.filter(u=>u.id!=='nezha');g.restart();
  assert.equal(g.get('yangjian').maxHp,Math.round(580*1.35));assert.equal(g.get('yangjian').atk,Math.round(70*1.1));
  assert.equal(g.get('aolie').synergyBonus.projectileScaleBonus,0);assert.equal(g.get('aolie').attackSpeed,1);assert.equal(g.get('aolie').atk,71);
});

test('水球直径仅在老冤家激活时放大50%，火球金光不变且不产生范围伤害',()=>{
  const {Game,Renderer}=engine(true);
  for(const characterId of ['aolie','jiuyue','yangjian']){
    for(const paired of [false,true]){
      const g=new Game();g.layout=[{equipmentIds:[],id:'a',team:'blue',characterId,c:2,r:4},
        {equipmentIds:[],id:'r',team:'red',characterId:'xiaotian',c:2,r:2},
        {equipmentIds:[],id:'other',team:'red',characterId:'xiaotian',c:3,r:2}];
      if(paired)g.layout.push({equipmentIds:[],id:'n',team:'blue',characterId:'nezha',c:6,r:7});
      g.restart();g.start();for(const u of g.units){u.think=100;u.cooldown=100;}
      const a=g.get('a'),r=g.get('r'),other=g.get('other'),otherHp=other.hp;r.think=100;
      a.cooldown=0;a.targetId='r';g.chooseAction(a);g.step(.2);
      const radii=[],ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(x,y,radius){radii.push(radius);},fill(){}};
      new Renderer({getContext:()=>ctx},{}).projectile(ctx,g.projectiles[0],g);
      const scale=characterId==='aolie'&&paired?1.5:1;
      assert.deepEqual(radii,[7*scale,3.5*scale]);assert.equal(a.range,3);
      for(let i=0;i<30;i++)g.step(.01);
      assert.equal(a.hits,1);assert.ok(r.hp<r.maxHp);assert.equal(other.hp,otherHp);
    }
  }
});

test('新羁绊说明明示负生命、分角色加成和水球仅视觉，档案采用正式角色介绍',()=>{
  const {SYNERGIES,synergyEffect,CHARACTERS}=engine();
  assert.match(synergyEffect(SYNERGIES[3]),/生命上限 -20%.*攻击 \+15%/);
  assert.match(synergyEffect(SYNERGIES[4]),/赤轮：移速 \+15%.*沧澜：攻速 \+8%、攻击 \+15%、水球直径 \+50%（仅视觉，不扩大命中范围）/);
  for(const definition of Object.values(CHARACTERS)){
    assert.ok(definition.description.length>0);
    assert.doesNotMatch(definition.description,/普攻|第三帧|素材|非人哉|拖到|九月|哮天|小玉|烈烈|哪吒|杨戬/);
  }
});

test('装备配置独立校验，属性按基础、星级、装备、羁绊顺序结算',()=>{
  const {Game,resolveBaseStats}=engine();
  const stats=resolveBaseStats({characterId:'jiuyue',star:2,power:1,equipmentIds:['huojianqiang','huntianling']});
  assert.equal(stats.baseHp,Math.round(460*1.7*1.35*1.03));assert.equal(stats.baseAtk,103);assert.equal(stats.baseDef,11);
  assert.deepEqual({...stats.equipmentBonus},{hpBonus:.03,attackBonus:.08,defenseBonus:3,attackSpeedBonus:0,moveSpeedBonus:0,critChance:.04,lifestealBonus:.02});
  assert.throws(()=>resolveBaseStats({characterId:'jiuyue',star:1,power:1,equipmentIds:['missing']}),/未知装备/);
  assert.throws(()=>resolveBaseStats({characterId:'jiuyue',star:1,power:1}),/装备列表无效/);
  const g=new Game();g.layout=[
    {equipmentIds:['huojianqiang'],id:'lie',team:'blue',characterId:'aolie',c:2,r:6,slot:null},
    {equipmentIds:[],id:'j',team:'blue',characterId:'jiuyue',c:4,r:7,slot:null},
    {equipmentIds:[],id:'r',team:'red',characterId:'xiaotian',c:3,r:0,slot:null},
  ];g.restart();
  assert.equal(g.get('lie').baseAtk,67);assert.equal(g.get('lie').atk,77);
  assert.equal(g.get('lie').synergyBonus.attackBonus,.15);
});

test('每只被击杀的小怪独立以15%概率掉落装备，不阻止下一回合',()=>{
  const {Campaign,EQUIPMENT}=engine(),c=new Campaign(()=>0);
  assert.equal(Object.keys(EQUIPMENT).length,21);assert.equal(EQUIPMENT.ruyijingubang.name,'捣云长棒');
  c.round=2;c.game.units.filter(unit=>unit.team==='red').forEach((unit,index)=>unit.hp=index?unit.hp:0);c.game.phase='finished';c.game.result={winner:'blue',red:0};c.settle();
  assert.deepEqual(Array.from(c.reward.equipmentDrops),['huojianqiang']);assert.deepEqual(Array.from(c.equipmentInventory),['huojianqiang']);
  assert.equal(c.reward.experience,4);assert.equal(c.level,4);assert.equal(c.xp,0);
  assert.equal(c.next().ok,true);assert.equal(c.round,3);
  const lost=new Campaign(()=>.999);lost.round=2;lost.hp=1;lost.game.phase='finished';lost.game.result={winner:'red',red:3};lost.settle();
  assert.equal(lost.status,'retry');assert.equal(lost.canRetry,true);assert.deepEqual(Array.from(lost.reward.equipmentDrops),[]);assert.deepEqual(Array.from(lost.equipmentInventory),[]);
  const noKills=new Campaign(()=>0);noKills.game.phase='finished';noKills.game.result={winner:'red',red:2};noKills.settle();assert.deepEqual(Array.from(noKills.reward.equipmentDrops),[]);
  const boundary=new Campaign(()=>.999),rolls=[.149,0,.15,.149,.5];boundary.game.units=boundary.game.units.filter(unit=>unit.team==='red').concat([{id:'red-extra',team:'red',hp:0}]);boundary.game.units.forEach(unit=>unit.hp=0);boundary.random=()=>rolls.shift();
  assert.equal(boundary.rollEquipmentDrops().length,2);
});

test('准备阶段可重复穿卸，战斗锁定且开战重建不丢装备',()=>{
  const {Campaign}=engine(),c=new Campaign();
  c.equipmentInventory=['fenghuolun','fenghuolun'];
  assert.equal(c.equip('blue1',0).ok,true);assert.equal(c.equip('blue1',0).ok,true);
  assert.deepEqual(Array.from(c.owned[0].equipmentIds),['fenghuolun','fenghuolun']);
  assert.ok(Math.abs(c.game.get('blue1').attackSpeed-1.29)<1e-8);
  assert.match(c.equip('blue1',0).reason,/装备位置无效|装备槽已满/);
  assert.equal(c.start().ok,true);const before=JSON.stringify(c.owned[0].equipmentIds);
  assert.match(c.unequip('blue1',0).reason,/战斗中不能调整装备/);
  assert.equal(JSON.stringify(c.owned[0].equipmentIds),before);
  assert.deepEqual(Array.from(c.game.layout.find(u=>u.id==='blue1').equipmentIds),['fenghuolun','fenghuolun']);
});

test('升星确定继承三件装备并将溢出退回背包，出售再全部回收',()=>{
  const {Campaign}=engine(),c=new Campaign();
  c.equipmentInventory=[];c.owned=[
    {id:'a',characterId:'xiaotian',kind:'melee',star:1,equipmentIds:['huojianqiang'],c:2,r:5,slot:null},
    {id:'b',characterId:'xiaotian',kind:'melee',star:1,equipmentIds:['huntianling','fenghuolun'],c:null,r:null,slot:0},
    {id:'c',characterId:'xiaotian',kind:'melee',star:1,equipmentIds:['huojianqiang'],c:null,r:null,slot:1},
  ];c.prepare();
  assert.equal(c.owned.length,1);assert.equal(c.owned[0].id,'a');assert.equal(c.owned[0].star,2);
  assert.deepEqual(Array.from(c.owned[0].equipmentIds),['huojianqiang','huntianling','fenghuolun']);assert.deepEqual(Array.from(c.equipmentInventory),['huojianqiang']);
  assert.equal(c.sell('a').ok,true);assert.deepEqual(Array.from(c.equipmentInventory).sort(),['fenghuolun','huntianling','huojianqiang','huojianqiang']);
});

test('七套装备仅在三个不同部件齐全时激活，重复件只提供单件属性',()=>{
  const {EQUIPMENT_SETS,equipmentSetStates,resolveEquipmentBonuses}=engine();
  assert.equal(Object.keys(EQUIPMENT_SETS).length,7);
  const partial=equipmentSetStates(['huojianqiang','huntianling']);
  assert.equal(partial.find(state=>state.id==='nezha').active,false);
  const duplicate=equipmentSetStates(['huojianqiang','huojianqiang','fenghuolun']);
  assert.equal(duplicate.find(state=>state.id==='nezha').count,2);assert.equal(duplicate.find(state=>state.id==='nezha').active,false);
  const complete=equipmentSetStates(['huojianqiang','huntianling','fenghuolun']);
  assert.equal(complete.find(state=>state.id==='nezha').active,true);
  const bonus=resolveEquipmentBonuses(['huojianqiang','huntianling','fenghuolun']);
  assert.equal(bonus.hpBonus,.03);assert.equal(bonus.attackBonus,.14);assert.equal(bonus.defenseBonus,3);assert.ok(Math.abs(bonus.attackSpeedBonus-.11)<1e-8);assert.equal(bonus.moveSpeedBonus,.03);assert.equal(bonus.critChance,.09);assert.equal(bonus.lifestealBonus,.02);
});

test('装备爆击覆盖统一伤害入口，吸血只按实际生命伤害且不溢出',()=>{
  const {Game,CRITICAL_DAMAGE_MULTIPLIER}=engine();assert.equal(CRITICAL_DAMAGE_MULTIPLIER,1.5);
  const layout=[
    {equipmentIds:['huojianqiang','huntianling'],id:'blue',team:'blue',characterId:'xiaotian',c:2,r:5,slot:null},
    {equipmentIds:[],id:'red',team:'red',characterId:'xiaotian',c:2,r:2,slot:null}
  ];
  const criticalGame=new Game(()=>0);criticalGame.layout=layout;criticalGame.restart();const source=criticalGame.get('blue'),target=criticalGame.get('red');source.hp=100;target.def=0;const before=target.hp;criticalGame.damage(source,target,100,{kind:'skill'});
  assert.equal(before-target.hp,150);assert.equal(source.hp,103);const criticalHit=criticalGame.events.at(-1);assert.equal(criticalHit.critical,true);assert.equal(criticalHit.healing,3);
  const normalGame=new Game(()=>.04);normalGame.layout=layout;normalGame.restart();const normalSource=normalGame.get('blue'),normalTarget=normalGame.get('red');normalSource.hp=normalSource.maxHp-1;normalTarget.def=0;const normalBefore=normalTarget.hp;normalGame.damage(normalSource,normalTarget,100,{kind:'basic'});
  assert.equal(normalBefore-normalTarget.hp,100);assert.equal(normalSource.hp,normalSource.maxHp);assert.equal(normalGame.events.at(-1).critical,false);assert.equal(normalGame.events.at(-1).healing,1);
  const deadSourceGame=new Game(()=>0);deadSourceGame.layout=layout;deadSourceGame.restart();const deadSource=deadSourceGame.get('blue'),survivor=deadSourceGame.get('red');deadSource.hp=0;survivor.def=0;deadSourceGame.damage(deadSource,survivor,100,{kind:'skill'});assert.equal(deadSource.hp,0);assert.equal(deadSourceGame.events.at(-1).healing,0);
});

test('装备界面包含背包和三槽，不再提供三选一入口',()=>{
  assert.match(sources.html,/id="equipmentInventory"/);assert.match(sources.html,/id="selectedEquipment"/);assert.doesNotMatch(sources.html,/equipmentChoices/);
  assert.match(ui,/data-equip/);assert.match(ui,/data-unequip/);assert.match(ui,/equipmentDropTarget/);assert.match(ui,/beginEquipmentDrag/);assert.doesNotMatch(ui,/data-claim/);
  assert.match(ui,/套装加成/);assert.match(ui,/equipmentSetStates/);assert.match(ui,/暴击/);assert.match(ui,/吸血/);
  assert.ok(sources.styles[0].code.includes('.equipment-section'));
});

test('普攻命中双方回能，技能伤害只让受击者回能',()=>{
  // 这是英雄能量规则的夹具；正式 PvE 敌人不具备英雄能量。
  const {Game}=engine(),g=new Game();g.setCharacter('red1','xiaotian');
  const a=g.get('blue1'),target=g.get('red1');
  g.damage(a,target,100,{kind:'basic'});assert.equal(a.energy,20);assert.equal(target.energy,10);
  g.damage(a,target,100,{kind:'skill'});assert.equal(a.energy,20);assert.equal(target.energy,20);
  target.energy=99;g.damage(a,target,100,{kind:'skill'});assert.equal(target.energy,100);
});

test('技能蓄满后等待当前动作结束再施放，找不到敌人则保留能量',()=>{
  const {Game}=engine(),g=new Game();g.start();const u=g.get('blue3');
  u.energy=100;u.attack={elapsed:.7,targetId:'red1',hit:true};u.state='attack';
  g.step(.11);assert.equal(u.skill,null);g.step(.01);assert.equal(u.state,'skill');assert.equal(u.energy,0);
  const empty=new Game();empty.units=empty.units.filter(unit=>unit.team==='blue');const lone=empty.units[0];lone.energy=100;
  assert.equal(empty.beginSkill(lone),false);assert.equal(lone.energy,100);
});

test('九月三团狐火优先命中三个不同目标，目标不足时集中主目标',()=>{
  const {Game}=engine(),g=new Game();g.layout=[
    {equipmentIds:[],id:'j',team:'blue',characterId:'jiuyue',c:3,r:6},
    {equipmentIds:[],id:'r1',team:'red',characterId:'xiaotian',c:3,r:1},
    {equipmentIds:[],id:'r2',team:'red',characterId:'xiaotian',c:2,r:2},
    {equipmentIds:[],id:'r3',team:'red',characterId:'xiaotian',c:4,r:2},
  ];g.restart();const j=g.get('j');j.energy=100;j.targetId='r1';assert.equal(g.beginSkill(j),true);g.castSkill(j,j.skill);
  assert.deepEqual(Array.from(new Set(g.projectiles.map(p=>p.targetId))).sort(),['r1','r2','r3']);
  const focus=new Game();focus.layout=focus.layout.filter(u=>u.id==='blue3'||u.id==='red1');focus.restart();const f=focus.get('blue3');f.energy=100;f.targetId='red1';focus.beginSkill(f);focus.castSkill(f,f.skill);
  assert.deepEqual(Array.from(focus.projectiles,p=>p.targetId),['red1','red1','red1']);
});

test('杨戬天眼贯穿同一直线，但不伤及线外目标',()=>{
  const {Game}=engine(),g=new Game();g.layout=[
    {equipmentIds:[],id:'y',team:'blue',characterId:'yangjian',c:3,r:7},
    {equipmentIds:[],id:'r1',team:'red',characterId:'xiaotian',c:3,r:5},
    {equipmentIds:[],id:'r2',team:'red',characterId:'xiaotian',c:3,r:3},
    {equipmentIds:[],id:'off',team:'red',characterId:'xiaotian',c:0,r:3},
  ];g.restart();const y=g.get('y');y.energy=100;y.targetId='r1';g.beginSkill(y);g.castSkill(y,y.skill);
  assert.ok(g.get('r1').hp<g.get('r1').maxHp);assert.ok(g.get('r2').hp<g.get('r2').maxHp);assert.equal(g.get('off').hp,g.get('off').maxHp);
});

test('烈烈召出的虾兵是可受击死亡的独立单位，星级决定体型与属性',()=>{
  const {Game,shrimp}=engine(),g=new Game();g.layout=[
    {equipmentIds:[],id:'lie',team:'blue',characterId:'aolie',star:3,c:3,r:6},
    {equipmentIds:[],id:'r',team:'red',characterId:'xiaotian',c:3,r:1},
  ];g.restart();const lie=g.get('lie');lie.energy=100;lie.targetId='r';g.beginSkill(lie);g.castSkill(lie,lie.skill);
  const summoned=g.units.find(u=>u.summoned);assert.ok(summoned);assert.equal(summoned.team,'blue');assert.equal(summoned.star,3);assert.equal(shrimp(3).size,110);
  assert.equal(g.layout.some(u=>u.id===summoned.id),false);const before=g.alive('blue').length;
  g.damage(g.get('r'),summoned,999999,{kind:'skill'});assert.equal(summoned.hp,0);assert.equal(g.alive('blue').length,before-1);
});

test('虾兵生命按主人30%及星级计算，攻击护甲沿用原规则',()=>{
 const {Game,shrimp}=engine();
 for(const star of [1,2,3]){
  const g=new Game();g.layout=[{id:'lie',characterId:'aolie',team:'blue',equipmentIds:[],star,c:3,r:6}];g.restart();
  const u=g.get('lie');assert.equal(g.summonShrimp(u),true);const child=g.units.find(v=>v.summoned);
  assert.equal(child.maxHp,Math.round(u.maxHp*.30*shrimp(star).hpScale));
  assert.equal(child.atk,Math.round(u.atk*.5*shrimp(star).atkScale));assert.equal(child.def,u.def);
 }
});
test('每名沧澜最多两只存活虾兵，满员保留能量并普攻，阵亡后补召且重开清空',()=>{
 const {Game}=engine(),g=new Game();g.layout=[
  {id:'lie',characterId:'aolie',team:'blue',equipmentIds:[],star:1,c:3,r:6},
  {id:'r',characterId:'guard',team:'red',equipmentIds:[],star:1,c:3,r:3}
 ];g.restart();g.start();const u=g.get('lie');
 const live=()=>g.units.filter(v=>v.summoned&&v.summonerId===u.id&&v.hp>0);
 assert.equal(g.summonShrimp(u),true);assert.equal(g.summonShrimp(u),true);
 const originalIds=live().map(v=>v.id);u.energy=u.energyMax;u.cooldown=0;u.targetId='r';
 g.chooseAction(u);assert.equal(u.state,'attack');assert.equal(u.energy,u.energyMax);assert.equal(u.casts,0);
 assert.equal(g.summonShrimp(u),false);assert.equal(g.metrics.summons,2);assert.deepEqual(live().map(v=>v.id),originalIds);
 // 实际触发点再次校验：即使被直接调用也不突破上限，能量按已确认规则保留。
 g.castSkill(u,{targetId:'r'});assert.equal(live().length,2);assert.equal(u.energy,u.energyMax);
 g.damage(g.get('r'),live()[0],999999,{kind:'basic'});assert.equal(live().length,1);
 u.attack=null;u.cooldown=0;assert.equal(g.beginSkill(u),true);assert.equal(u.energy,0);
 g.castSkill(u,u.skill);assert.equal(live().length,2);assert.equal(g.metrics.summons,3);
 assert.equal(live().some(v=>v.id===originalIds[1]),true);
 g.restart();assert.equal(g.units.some(v=>v.summoned),false);assert.equal(g.canSummonShrimp(g.get('lie')),true);
});
test('两名沧澜独立拥有两只虾兵名额，不共享召唤上限',()=>{
 const {Game}=engine(),g=new Game();g.layout=[
  {id:'a',characterId:'aolie',team:'blue',equipmentIds:[],c:1,r:6},
  {id:'b',characterId:'aolie',team:'blue',equipmentIds:[],c:5,r:6}
 ];g.restart();
 for(const id of ['a','b']){const u=g.get(id);assert.equal(g.summonShrimp(u),true);assert.equal(g.summonShrimp(u),true);assert.equal(g.summonShrimp(u),false);}
 assert.equal(g.units.filter(u=>u.summoned&&u.hp>0).length,4);assert.equal(g.integrity().length,0);
});

test('哪吒刷新三头六臂不叠层，小玉护盾锁定最低血量比例友军，哮天必须贴身咬',()=>{
  const {Game}=engine(),g=new Game();g.layout=[
    {equipmentIds:[],id:'n',team:'blue',characterId:'nezha',c:0,r:6},
    {equipmentIds:[],id:'yu',team:'blue',characterId:'xiaoyu',c:2,r:6},
    {equipmentIds:[],id:'dog',team:'blue',characterId:'xiaotian',c:4,r:6},
    {equipmentIds:[],id:'r',team:'red',characterId:'xiaotian',c:4,r:1},
  ];g.restart();const n=g.get('n'),yu=g.get('yu'),dog=g.get('dog'),r=g.get('r');
  n.energy=100;n.targetId='r';g.beginSkill(n);g.castSkill(n,n.skill);assert.equal(g.combatAttack(n),Math.round(n.atk*1.5));
  n.buff.remaining=1;n.energy=100;g.beginSkill(n);g.castSkill(n,n.skill);assert.equal(n.buff.remaining,6);assert.equal(g.combatAttack(n),Math.round(n.atk*1.5));
  dog.hp=Math.round(dog.maxHp*.4);yu.energy=100;yu.targetId='r';g.beginSkill(yu);g.castSkill(yu,yu.skill);assert.ok(dog.shield>0);assert.equal(yu.shield,0);
  dog.energy=100;dog.targetId='r';assert.equal(g.beginSkill(dog),false);dog.c=4;dog.r=2;assert.equal(g.beginSkill(dog),true);const hp=r.hp;g.castSkill(dog,dog.skill);assert.ok(r.hp<hp);
});

test('护盾条按剩余量缩短，再次施法重建叠加上限，死亡与回合结束清理持续状态',()=>{
  const {Game,Renderer}=engine(true),g=new Game();g.layout=[
    {equipmentIds:[],id:'yu',team:'blue',characterId:'xiaoyu',c:2,r:6},
    {equipmentIds:[],id:'ally',team:'blue',characterId:'xiaotian',c:3,r:6},
    {equipmentIds:[],id:'r',team:'red',characterId:'xiaotian',c:3,r:1},
  ];g.restart();const yu=g.get('yu'),ally=g.get('ally'),r=g.get('r');ally.hp=Math.floor(ally.maxHp/2);
  yu.energy=100;yu.targetId='r';g.beginSkill(yu);g.castSkill(yu,yu.skill);const granted=ally.shield;
  assert.equal(ally.shieldMax,granted);g.damage(r,ally,Math.floor(granted/2),{kind:'skill'});assert.ok(ally.shield>0);assert.ok(ally.shield<ally.shieldMax);
  const ratio=ally.shield/ally.shieldMax,widths=[],ctx={beginPath(){},roundRect(x,y,w,h){widths.push({w,h});},fill(){},stroke(){},fillText(){}};
  new Renderer({getContext:()=>ctx},{}).health(ctx,ally,g);assert.ok(widths.some(entry=>entry.h===4&&Math.abs(entry.w-61*ratio)<1e-8));
  yu.energy=100;g.beginSkill(yu);g.castSkill(yu,yu.skill);assert.equal(ally.shieldMax,ally.shield);assert.ok(ally.shield>granted);
  ally.buff={remaining:6,attackBonus:.5,attackSpeedBonus:.35};g.phase='battle';g.finish('test');assert.equal(ally.shield,0);assert.equal(ally.shieldMax,0);assert.equal(ally.buff,null);
  g.restart();assert.equal(g.get('ally').shield,0);assert.equal(g.get('ally').shieldMax,0);assert.equal(g.get('ally').buff,null);
});

test('每场固定获得4经验并按阈值自动升级',()=>{
  const {Campaign}=engine(),c=new Campaign(()=>0);
  for(let battle=0;battle<4;battle++){
    c.game.phase='finished';c.game.result={winner:'blue',red:0};c.settle();
    assert.equal(c.reward.experience,4);
    if(battle<3){c.game.phase='finished';assert.equal(c.next().ok,true);}
  }
  assert.equal(c.level,5);assert.equal(c.xp,4);
});

test('照夜同行分角色加成，重复追风不叠加，敌方与备战席不补齐，阵亡保留且下阵重算',()=>{
 const {Game,SYNERGIES,synergyState,synergyEffect}=engine(),g=new Game();
 const definition=SYNERGIES.find(entry=>entry.name==='照夜同行');
 assert.match(synergyEffect(definition),/曜瞳：攻击 \+10%.*追风：生命上限 \+15%/);
 g.layout.find(unit=>unit.id==='blue3').characterId='yangjian';g.restart();
 for(let i=0;i<3;i++)g.applyFriendship();
 for(const id of ['blue1','blue2']){const u=g.get(id);assert.equal(u.maxHp,Math.round(u.baseHp*1.15));assert.equal(u.atk,u.baseAtk);}
 const y=g.get('blue3');assert.equal(y.atk,Math.round(y.baseAtk*1.10));assert.equal(y.maxHp,y.baseHp);
 const hp=g.get('blue1').maxHp;g.start();y.hp=0;g.step(.01);assert.equal(g.get('blue1').maxHp,hp);
 g.layout=g.layout.filter(u=>u.id!=='blue3');g.restart();assert.equal(g.get('blue1').maxHp,g.get('blue1').baseHp);
 for(const partner of [{characterId:'yangjian',team:'blue',slot:0},{characterId:'yangjian',team:'red',slot:null}]){
  assert.equal(synergyState([{characterId:'xiaotian',team:'blue',slot:null},partner],definition).active,false);
 }
});

test('双方生命统一增加35%，装备星级继续乘算，攻击动作与回能规则不变',()=>{
 const {CHARACTERS,STATS,resolveBaseStats}=engine();
 for(const id of [...Object.keys(CHARACTERS),'guard','carrier','thrower','nian'])for(const star of [1,2,3]){
  const character=Object.hasOwn(CHARACTERS,id)?CHARACTERS[id]:{statsKey:['guard','nian'].includes(id)?'melee':'ranged'};
  const base=STATS[character.statsKey],factor=Math.pow(1.7,star-1),stats=resolveBaseStats({characterId:id,star,power:1,equipmentIds:[]});
  assert.equal(stats.baseHp,Math.round(base.hp*factor*1.35));assert.equal(stats.baseAtk,Math.round(base.atk*factor));
  assert.equal(stats.baseInterval,base.interval);assert.equal(stats.baseDef,base.def);
 }
});
