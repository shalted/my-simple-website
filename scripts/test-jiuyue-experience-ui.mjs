import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadGameSources} from './jiuyue-sources.mjs';

const sources=loadGameSources();
const ui=sources.scripts.find(script=>script.src==='./js/ui.js').code;
const source=ui.slice(ui.indexOf('function renderExperience(){'),ui.indexOf('\nfunction render(){'));
function setup(){
 const context=vm.createContext({});
 for(const script of sources.scripts){
  if(['./js/assets.js','./js/ui.js','./js/renderer.js'].includes(script.src))continue;
  vm.runInContext(script.code,context);
 }
 const nodes=new Map();
 context.campaign=new context.LionCampaign(()=>0);
 context.$=id=>{if(!nodes.has(id))nodes.set(id,{classList:{toggle(name,value){this[name]=value;}}});return nodes.get(id);};
 vm.runInContext(source,context);
 return {campaign:context.campaign,render:context.renderExperience,nodes};
}
test('经验入口只保留一份，位于底部商店，不混在卡牌标题中',()=>{
 const html=sources.html;
 assert.equal((html.match(/id="xp"/g)||[]).length,1);
 assert.ok(html.indexOf('class="shop-section"')<html.indexOf('id="xp"'));
 assert.ok(html.indexOf('id="xp"')<html.indexOf('id="shop"'));
 assert.match(html,/aria-describedby="xpHint"/);
});
test('使用真实购买流程验证升级、经验进度、缺钱与按钮状态',()=>{
 const {campaign,render,nodes}=setup();
 render();
 assert.equal(nodes.get('xpTitle').textContent,'购买经验');
 assert.equal(nodes.get('xpHint').textContent,'购买后可多上阵 1 人');
 assert.equal(nodes.get('xpProgress').max,campaign.nextXP);
 assert.equal(campaign.buyXP().ok,true);render();
 assert.equal(campaign.level,4);assert.equal(campaign.gold,6);
 assert.equal(nodes.get('xpProgressText').textContent,'经验 0 / 8');
 assert.equal(nodes.get('xpHint').textContent,'再获得 8 经验，人口 +1');
 assert.equal(campaign.buyXP().ok,true);render();
 assert.equal(nodes.get('xpProgress').value,4);
 assert.equal(nodes.get('xp').disabled,true);
 assert.equal(nodes.get('xpHint').textContent,'金币不足，需要 4 金币');
});
test('满人口不产生零分母进度；战斗锁定但保留购买经验标题',()=>{
 const {campaign,render,nodes}=setup();
 assert.equal(campaign.start().ok,true);render();
 assert.equal(nodes.get('xp').disabled,true);
 assert.equal(nodes.get('xpTitle').textContent,'购买经验');
 assert.equal(nodes.get('xpHint').textContent,'准备阶段可购买经验');
 campaign.reset();
 while(campaign.nextXP)campaign.gainXP(campaign.nextXP);
 render();
 assert.equal(nodes.get('xpProgress').hidden,true);
 assert.equal(nodes.get('xp').disabled,true);
 assert.equal(nodes.get('xpTitle').textContent,'人口已满');
});
