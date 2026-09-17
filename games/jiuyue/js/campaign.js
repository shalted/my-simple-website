
(function(root){
'use strict';
const {Game,STATS,CHARACTERS,EQUIPMENT,EQUIPMENT_SLOT_COUNT,character}=root.LionChess||(typeof require==='function'?require('./engine.js'):{});
const {enemyWave}=root.LionEnemies;
// 用户确认：每场战斗结算固定获得 4 点经验。
const ROUND_XP=4;
// 用户确认：每只被击杀的小怪独立进行 15% 装备掉落判定。
const EQUIPMENT_DROP_CHANCE=.15;
class Campaign {
 constructor(random=Math.random,opening=null){this.random=random;this.opening=opening;this.game=new Game(random);this.game.listeners.push(e=>{if(e.type==='finish')this.settle();});this.reset();}
 reset(){this.gold=10;this.hp=20;this.round=1;this.level=3;this.xp=0;this.serial=3;this.status='playing';this.reward=null;this.equipmentInventory=[];this.owned=[{id:'blue1',characterId:'xiaotian',kind:'melee',star:1,equipmentIds:[],c:2,r:5,slot:null},{id:'blue2',characterId:'xiaotian',kind:'melee',star:1,equipmentIds:[],c:4,r:5,slot:null},{id:'blue3',characterId:'jiuyue',kind:'ranged',star:1,equipmentIds:[],c:3,r:7,slot:null}];this.refreshShop();this.prepare();}
 get prep(){return this.game.phase==='prep'&&this.status==='playing';}
 // 用户确认：每一关失利都保留结算后的全部资源重试，心情归零也不结束本局。
 get canRetry(){return this.game.phase==='finished'&&this.status==='retry';}
 get board(){return this.owned.filter(u=>u.slot===null);}
 get nextXP(){if(this.opening&&this.level===this.opening.initialLevel)return this.opening.levelThreeXP;return ({3:4,4:8,5:12})[this.level]||0;}
 freeSlot(){return Array.from({length:8},(_,i)=>i).find(i=>!this.owned.some(u=>u.slot===i));}
 // 初版角色等概率抽取；卡池直接来自角色表，不把新角色映射成已有身份。
 refreshShop(){const pool=Object.keys(CHARACTERS);this.shop=Array.from({length:4},()=>pool[Math.floor(this.random()*pool.length)]);}
 // 使用独立敌方配置中的已确认波次、站位与难度成长。
 wave(){return enemyWave(this.round);}
 mergeAll(){
  let merged=null;
  for(const characterId of Object.keys(CHARACTERS))for(let star=1;star<3;star++){
   let matches;
   while((matches=this.owned.filter(u=>u.characterId===characterId&&u.star===star)).length>=3){
    const keep=matches.find(u=>u.slot===null)||matches.find(u=>Number.isInteger(u.slot))||matches[0];
    const consume=matches.filter(u=>u!==keep).sort((a,b)=>Number(b.slot===undefined)-Number(a.slot===undefined)).slice(0,2);
    const inherited=[...keep.equipmentIds,...consume.flatMap(u=>u.equipmentIds)];
    keep.equipmentIds=inherited.slice(0,EQUIPMENT_SLOT_COUNT);this.equipmentInventory.push(...inherited.slice(EQUIPMENT_SLOT_COUNT));
    this.owned=this.owned.filter(u=>!consume.includes(u));keep.star++;merged=keep.id;
   }
  }
  return merged;
 }
 prepare(){this.lastMerged=this.mergeAll();this.game.layout=[...this.board.map(u=>({...u,team:'blue'})),...this.wave()];this.game.restart();}
 // 正式入口使用已确认的教学开局；旧引擎测试仍可显式使用原始阵容。
 prepareOpening(){const rules=this.opening;if(!rules)throw new Error('未配置新手开局规则');this.level=rules.initialLevel;this.serial=1;this.owned=[{id:'blue1',characterId:rules.initialCharacterId,kind:character(rules.initialCharacterId).kind,star:1,equipmentIds:[],c:null,r:null,slot:0}];rules.shopCharacterIds.forEach((id,index)=>{this.shop[index]=id;});this.prepare();}
 fail(reason){return {ok:false,reason};}
 buy(index){if(!this.prep)return this.fail('准备阶段才能购买');const characterId=this.shop[index];if(!characterId)return this.fail('这张卡已售出');const kind=character(characterId).kind;if(this.gold<2)return this.fail('金币不足，需要 2 金币');const matches=this.owned.filter(u=>u.characterId===characterId&&u.star===1),slot=this.freeSlot();if(slot===undefined&&matches.length<2)return this.fail('备战席满了，先上阵或出售一位');this.gold-=2;this.shop[index]=null;this.owned.push({id:'blue'+(++this.serial),characterId,kind,star:1,equipmentIds:[],c:null,r:null,slot});this.prepare();return {ok:true,merged:this.lastMerged};}
 refresh(){if(!this.prep)return this.fail('准备阶段才能刷新');if(this.gold<2)return this.fail('刷新需要 2 金币');this.gold-=2;this.refreshShop();return {ok:true};}
 gainXP(amount){this.xp+=amount;while(this.nextXP&&this.xp>=this.nextXP){this.xp-=this.nextXP;this.level++;}return amount;}
 buyXP(){if(!this.prep)return this.fail('准备阶段才能升级');if(this.level===6)return this.fail('人口已满级');if(this.gold<4)return this.fail('购买经验需要 4 金币');this.gold-=4;this.gainXP(4);return {ok:true};}
 place(id,c,r){if(!this.prep)return this.fail('准备阶段才能布阵');const u=this.owned.find(u=>u.id===id);if(!u||!this.game.validCell(c,r,'blue'))return this.fail('请放在棋盘下半场');const other=this.board.find(v=>v.c===c&&v.r===r&&v!==u);if(u.slot!==null&&!other&&this.board.length>=this.level)return this.fail('上阵人数已满，可交换角色或升级人口');const old={c:u.c,r:u.r,slot:u.slot};u.c=c;u.r=r;u.slot=null;if(other)Object.assign(other,old);this.prepare();return {ok:true};}
 bench(id,slot){if(!this.prep)return this.fail('准备阶段才能调整备战席');const u=this.owned.find(u=>u.id===id);if(!u||!Number.isInteger(slot)||slot<0||slot>=8)return this.fail('备战位置无效');const other=this.owned.find(v=>v.slot===slot&&v!==u);const old={c:u.c,r:u.r,slot:u.slot};u.c=null;u.r=null;u.slot=slot;if(other)Object.assign(other,old);this.prepare();return {ok:true};}
 // 装备只在准备阶段流转；失败原因原样返回，不在战斗中静默改动背包或棋子。
 equip(id,inventoryIndex){if(!this.prep)return this.fail('战斗中不能调整装备');const u=this.owned.find(u=>u.id===id);if(!u)return this.fail('先选择一位己方角色');if(!Number.isInteger(inventoryIndex)||inventoryIndex<0||inventoryIndex>=this.equipmentInventory.length)return this.fail('装备位置无效');if(u.equipmentIds.length>=EQUIPMENT_SLOT_COUNT)return this.fail('这位角色的装备槽已满');u.equipmentIds.push(this.equipmentInventory.splice(inventoryIndex,1)[0]);this.prepare();return {ok:true};}
 unequip(id,equipmentIndex){if(!this.prep)return this.fail('战斗中不能调整装备');const u=this.owned.find(u=>u.id===id);if(!u)return this.fail('先选择一位己方角色');if(!Number.isInteger(equipmentIndex)||equipmentIndex<0||equipmentIndex>=u.equipmentIds.length)return this.fail('装备槽位无效');this.equipmentInventory.push(u.equipmentIds.splice(equipmentIndex,1)[0]);this.prepare();return {ok:true};}
 dropEquipment(){const pool=Object.keys(EQUIPMENT),equipmentId=pool[Math.floor(this.random()*pool.length)];this.equipmentInventory.push(equipmentId);return equipmentId;}
 rollEquipmentDrops(){const drops=[];for(const unit of this.game.units.filter(unit=>unit.team==='red'&&unit.hp<=0))if(this.random()<EQUIPMENT_DROP_CHANCE)drops.push(this.dropEquipment());return drops;}
 sell(id){if(!this.prep)return this.fail('准备阶段才能出售');const u=this.owned.find(u=>u.id===id);if(!u)return this.fail('先选择一位己方角色');this.gold+=2*Math.pow(3,u.star-1);this.equipmentInventory.push(...u.equipmentIds);this.owned=this.owned.filter(v=>v!==u);this.prepare();return {ok:true};}
 start(){if(!this.prep)return this.fail('当前不能开战');if(!this.board.length)return this.fail('至少上阵一位角色');this.reward=null;this.game.start();return {ok:true};}
 settle(){if(this.reward||this.game.phase!=='finished')return;const win=this.game.result.winner==='blue',interest=Math.min(3,Math.floor(this.gold/10)),income=5+(win?1:0)+interest,loss=win?0:2+Math.min(3,this.game.result.red),equipmentDrops=this.rollEquipmentDrops(),experience=this.gainXP(ROUND_XP);this.gold+=income;this.hp=Math.max(0,this.hp-loss);this.reward={win,interest,income,loss,equipmentDrops,experience};this.status=win?(this.round===10?'clear':'playing'):'retry';}
 // 不刷新商店、不重复结算奖励；仅重建本关单位，回到可调整阵容的准备阶段。
 retry(){if(!this.canRetry)return this.fail('当前不能重试本关');this.status='playing';this.reward=null;this.prepare();return {ok:true};}
 next(){if(this.game.phase!=='finished'||this.status!=='playing'||this.round>=10)return this.fail('当前不能进入下一轮');this.round++;this.reward=null;this.refreshShop();this.prepare();return {ok:true};}
}
root.LionCampaign=Campaign;if(typeof module!=='undefined'&&module.exports)module.exports=Campaign;
})(typeof window!=='undefined'?window:globalThis);

