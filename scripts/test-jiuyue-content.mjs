import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root=new URL('../games/jiuyue/js/',import.meta.url);
const scope=vm.createContext({});
for(const file of ['enemies.js','characters.js','equipment.js','synergies.js','skills.js']){
  vm.runInContext(fs.readFileSync(new URL(file,root),'utf8'),scope,{filename:file});
}

test('玩家可见角色与敌方名称统一为狮团团世界观',()=>{
  assert.deepEqual(
    Object.fromEntries(Object.entries(scope.LionCharacters.CHARACTERS).map(([id,value])=>[id,value.name])),
    {xiaotian:'追风',jiuyue:'霜尾',xiaoyu:'桂团',aolie:'沧澜',nezha:'赤轮',yangjian:'曜瞳'}
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(scope.LionEnemies.ENEMIES).map(([id,value])=>[id,value.name])),
    {guard:'护饼卫',carrier:'运饼小妖',thrower:'掷饼小妖',nian:'年兽'}
  );
});

test('技能、羁绊和装备套装采用正式原创文案',()=>{
  assert.deepEqual(
    Object.fromEntries(Object.entries(scope.LionSkills.SKILLS).map(([id,value])=>[id,value.name])),
    {jiuyue:'霜灯狐火',yangjian:'曜光一线',aolie:'浪花援手',nezha:'赤轮振翼',xiaotian:'追风扑咬',xiaoyu:'桂月护佑'}
  );
  assert.deepEqual(Array.from(scope.LionSynergies.SYNERGIES,entry=>entry.name),['霜灯逐风','追月拍档','月潮同辉','双星争辉','赤轮逐浪','照夜同行']);
  assert.deepEqual(
    Object.fromEntries(Object.entries(scope.LionEquipment.EQUIPMENT_SETS).map(([id,value])=>[id,value.name])),
    {nezha:'赤轮流火',yangjian:'曜瞳巡夜',yutu:'桂团月礼',aolie:'沧澜听潮',jiuwei:'霜尾灯影',xiaotian:'追风逐月',wukong:'云间戏月'}
  );
});

test('文案调整不改变角色、技能、羁绊和装备数值',()=>{
  assert.deepEqual(JSON.parse(JSON.stringify(scope.LionCharacters.STATS)),{
    melee:{label:'近战',hp:660,atk:64,def:16,range:1,interval:1.15},
    ranged:{label:'远程',hp:460,atk:56,def:8,range:3,interval:1.25},
    xiaoyu:{label:'快攻',hp:540,atk:72,def:8,range:1,interval:.95},
    aolie:{label:'水系远程',hp:560,atk:62,def:12,range:3,interval:1.4},
    nezha:{label:'疾行近战',hp:600,atk:78,def:10,range:1,interval:1.05},
    yangjian:{label:'照夜远程',hp:580,atk:70,def:14,range:3,interval:1.35}
  });
  assert.equal(scope.LionSkills.ENERGY_MAX,100);
  assert.equal(scope.LionSkills.ENERGY_ON_BASIC_HIT,20);
  assert.equal(scope.LionSkills.ENERGY_ON_DAMAGE,10);
  assert.deepEqual(Array.from(scope.LionSynergies.SYNERGIES,entry=>({
    attackSpeedBonus:entry.attackSpeedBonus,
    moveSpeedBonus:entry.moveSpeedBonus,
    attackBonus:entry.attackBonus,
    hpBonus:entry.hpBonus,
    projectileScaleBonus:entry.projectileScaleBonus
  })),[
    {attackSpeedBonus:.15,moveSpeedBonus:0,attackBonus:0,hpBonus:0,projectileScaleBonus:0},
    {attackSpeedBonus:.08,moveSpeedBonus:.20,attackBonus:0,hpBonus:0,projectileScaleBonus:0},
    {attackSpeedBonus:0,moveSpeedBonus:0,attackBonus:.15,hpBonus:0,projectileScaleBonus:0},
    {attackSpeedBonus:0,moveSpeedBonus:0,attackBonus:.15,hpBonus:-.20,projectileScaleBonus:0},
    {attackSpeedBonus:0,moveSpeedBonus:0,attackBonus:0,hpBonus:0,projectileScaleBonus:0},
    {attackSpeedBonus:0,moveSpeedBonus:0,attackBonus:0,hpBonus:0,projectileScaleBonus:0}
  ]);
  assert.equal(Object.keys(scope.LionEquipment.EQUIPMENT).length,21);
  assert.equal(scope.LionEquipment.EQUIPMENT_SLOT_COUNT,3);
});
