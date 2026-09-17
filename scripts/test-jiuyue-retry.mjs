import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadGameSources} from './jiuyue-sources.mjs';

const sources=loadGameSources(),ui=sources.scripts.find(s=>s.src==='./js/ui.js').code;
function campaign(){
 const scope=vm.createContext({});
 for(const {src,code} of sources.scripts){if(src==='./js/ui.js')continue;vm.runInContext(code,scope,{filename:src});}
 return new scope.LionCampaign(()=>0);
}
function finish(c,winner='red'){
 c.game.units.find(u=>u.team==='red').hp=0;
 c.game.phase='finished';c.game.result={winner,red:winner==='blue'?0:3};c.settle();
}
const saved=c=>JSON.stringify({owned:c.owned,inventory:c.equipmentInventory,gold:c.gold,hp:c.hp,level:c.level,xp:c.xp,shop:c.shop,round:c.round});

test('最终关失利包含心情归零均可重试，不误通关、不进入十一关',()=>{
 for(const hp of [20,1]){
  const c=campaign();c.round=10;c.hp=hp;c.prepare();c.start();finish(c);
  assert.equal(c.status,'retry');assert.equal(c.canRetry,true);assert.equal(c.next().ok,false);assert.equal(c.round,10);
  const after=saved(c),reward=JSON.stringify(c.reward);c.settle();assert.equal(saved(c),after);assert.equal(JSON.stringify(c.reward),reward);
  assert.equal(c.retry().ok,true);assert.equal(saved(c),after);assert.equal(c.game.phase,'prep');assert.equal(c.prep,true);assert.equal(c.reward,null);
  assert.equal(c.game.units.every(u=>u.hp===u.maxHp),true);assert.equal(c.retry().ok,false);
 }
});

test('每次实际败战仍发奖励，点击重试不另发奖励，零心情获胜可通关',()=>{
 const c=campaign();c.round=10;c.hp=1;c.prepare();
 for(let attempt=0;attempt<2;attempt++){
  const gold=c.gold,drops=c.equipmentInventory.length;c.start();finish(c);
  assert.equal(c.hp,0);assert.equal(c.gold,gold+c.reward.income);assert.equal(c.reward.experience,4);
  assert.equal(c.equipmentInventory.length,drops+1);assert.equal(c.reward.equipmentDrops.length,1);
  const after=saved(c);c.retry();assert.equal(saved(c),after);
 }
 c.start();finish(c,'blue');assert.equal(c.status,'clear');assert.equal(c.hp,0);assert.equal(c.canRetry,false);assert.equal(c.retry().ok,false);assert.equal(c.next().ok,false);
});

test('所有关卡失败可反复保留资源重试，零心情胜利后可继续下一关',()=>{
 for(let round=1;round<=10;round++){
  const c=campaign();c.round=round;c.hp=1;c.prepare();assert.equal(c.retry().ok,false);
  for(let attempt=0;attempt<2;attempt++){
   const gold=c.gold;c.start();assert.equal(c.retry().ok,false);finish(c);
   assert.equal(c.status,'retry');assert.equal(c.canRetry,true);assert.equal(c.hp,0);
   assert.equal(c.gold,gold+c.reward.income);assert.ok(c.reward.income>=5);assert.equal(c.reward.experience,4);
   assert.equal(c.next().ok,false);const after=saved(c);c.settle();assert.equal(saved(c),after);
   assert.equal(c.retry().ok,true);assert.equal(saved(c),after);assert.equal(c.prep,true);assert.equal(c.reward,null);
  }
  c.start();finish(c,'blue');assert.equal(c.canRetry,false);
  if(round<10){assert.equal(c.status,'playing');assert.equal(c.next().ok,true);assert.equal(c.round,round+1);assert.equal(c.hp,0);}
  else assert.equal(c.status,'clear');
 }
});

test('全下阵、全出售和重试后空阵容都拒绝开战且不会领取奖励',()=>{
 for(const mode of ['bench','sell','retry']){
  const c=campaign();if(mode==='retry'){c.round=10;c.hp=1;c.prepare();c.start();finish(c);c.retry();}
  for(const [slot,u] of [...c.owned].entries())assert.equal((mode==='sell'?c.sell(u.id):c.bench(u.id,slot)).ok,true);
  const after=saved(c);assert.equal(c.board.length,0);assert.equal(c.start().ok,false);assert.equal(c.game.phase,'prep');assert.equal(c.reward,null);assert.equal(saved(c),after);
  if(mode==='sell'){assert.equal(c.buy(0).ok,true);}
  assert.equal(c.place(c.owned[0].id,2,5).ok,true);assert.equal(c.start().ok,true);
 }
});

test('正式结算双按钮、空阵容提示和重新开始实际绑定正确',()=>{
 const c=campaign(),nodes={};const $=id=>nodes[id]??=( {hidden:false,textContent:'',classList:{toggle(name,value){this[name]=value;}}} );
 const scope=vm.createContext({campaign:c,game:c.game,$,equipment:id=>({name:id}),result:r=>r,render(){},selected:null,flow:{begin(){c.reset();}}});
 for(const name of ['renderFormation','renderRoundResult'])vm.runInContext(ui.match(new RegExp('function '+name+'\\(\\)\\{[\\s\\S]*?\\n\\}'))[0],scope);
 vm.runInContext(ui.split('\n').find(line=>line.startsWith("$('refresh').onclick=")),scope);
 vm.runInContext(ui.split('\n').find(line=>line.startsWith("$('retry').onclick=")),scope);
 c.round=10;c.hp=1;c.prepare();c.start();finish(c);scope.renderRoundResult();
 assert.equal($('retry').hidden,false);assert.equal($('next').textContent,'重新开始');assert.equal($('next').classList.primary,false);assert.doesNotMatch($('resultTitle').textContent,/成功/);
 $('retry').onclick();assert.equal(c.prep,true);assert.equal(c.round,10);scope.renderRoundResult();assert.equal($('result').hidden,true);
 for(const [slot,u] of [...c.owned].entries())c.bench(u.id,slot);scope.renderFormation();assert.equal($('start').disabled,true);assert.equal($('formationHint').hidden,false);assert.match($('formationHint').textContent,/备战席/);
 for(const u of [...c.owned])c.sell(u.id);scope.renderFormation();assert.match($('formationHint').textContent,/购买伙伴/);
 c.buy(0);c.place(c.owned[0].id,2,5);scope.renderFormation();assert.equal($('start').disabled,false);assert.equal($('formationHint').hidden,true);
 c.start();finish(c);$('next').onclick();assert.equal(c.round,1);assert.equal(c.hp,20);assert.equal(c.gold,10);assert.equal(c.board.length,3);assert.equal(c.status,'playing');
 assert.match(sources.html,/id="retry" class="primary" hidden>保留阵容重试/);
});
