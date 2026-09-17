(function(root){
 'use strict';
 // 用户确认第一版沿用近战/远程基础模板；与可购买角色目录严格分开。
 // 动作键和目录来自敌方正式素材任务，五帧中第三帧命中/释放。
 const ENEMIES={
  guard:{name:'护饼卫',kind:'melee',statsKey:'melee',boss:false,role:'护饼 · 近战',description:'举着月饼圆盾守住去路，厚实的脚步会把灯笼都震得轻轻摇晃。',assets:{idle:'guard_idle',move:'guard_move',attack:'guard_attack'}},
  carrier:{name:'运饼小妖',kind:'ranged',statsKey:'ranged',boss:false,role:'滚饼 · 远程',description:'背起饼袋沿月路疾跑，遇到追兵就把月饼贴着地面滚出去。',projectileStyle:'rolling-mooncake',assets:{idle:'carrier_idle',move:'carrier_move',attack:'carrier_attack'}},
  thrower:{name:'掷饼小妖',kind:'ranged',statsKey:'ranged',boss:false,role:'掷饼 · 远程',description:'躲在队伍后方高高抛出月饼，弯弯的飞行轨迹像一轮小月亮。',projectileStyle:'flying-mooncake',assets:{idle:'thrower_idle',move:'thrower_move',attack:'thrower_attack'}},
  nian:{name:'年兽',kind:'melee',statsKey:'melee',boss:true,role:'首领 · 近战',description:'闻着甜香闯进中秋灯会的贪吃首领，把夺来的月饼紧紧护在怀里。',assets:{idle:'nian_idle',move:'nian_move',attack:'nian_attack'}}
 };
 // USER-CONFIRMED：第四关考站位，第五关起护饼卫先升二星，随后掷饼小妖升星，最终三星年兽。
 // 星级按下方固定格位排列；数量由星级表推导，避免数量和升星名单分别维护。
 const WAVES={
  1:{power:.72,stars:[1,1]},
  2:{power:.775,stars:[1,1]},
  3:{power:.975,stars:[1,1,1]},
  4:{power:1.30,stars:[1,1,1,1]},
  5:{power:1.10,stars:[2,1,1,1,1]},
  6:{power:1.10,stars:[2,1,1,2,1]},
  7:{power:1.20,stars:[2,1,1,2,1]},
  8:{power:1.20,stars:[2,1,2,2,1]},
  9:{power:1.30,stars:[2,1,2,2,1,1]},
  10:{power:1.10,stars:[3,1,2,2,1,1]}
 };
 // 复用原有格位和兵种顺序；power 仅影响生命与攻击，不改护甲或攻速。
 function enemyWave(round){
  const cells=[[2,2],[4,2],[3,0],[1,1],[5,1],[3,1]],minions=['guard','carrier','thrower'];
  const wave=WAVES[round];
  return wave.stars.map((star,index)=>{
   const [c,r]=cells[index];
   const characterId=round===10&&index===0?'nian':minions[index%minions.length];
   return {id:'red'+(index+1),team:'red',characterId,kind:ENEMIES[characterId].kind,star,power:characterId==='nian'?wave.power*1.50:wave.power,equipmentIds:[],c,r};
  });
 }
 root.LionEnemies={ENEMIES,enemyWave};
})(typeof globalThis!=='undefined'?globalThis:this);
