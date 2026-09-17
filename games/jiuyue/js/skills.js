(function(root){
  'use strict';
  // 技能数值均基于角色经过星级、装备与羁绊结算后的最终战斗属性。
  const ENERGY_MAX=100,ENERGY_ON_BASIC_HIT=20,ENERGY_ON_DAMAGE=10;
  const SKILLS={
    jiuyue:{name:'霜灯狐火',castDuration:.9,trigger:.38,description:'向当前目标与附近敌人发射三团狐火。',damageRatio:.7,projectiles:3},
    yangjian:{name:'曜光一线',castDuration:.9,trigger:.42,description:'曜光穿过前方整条直线上的敌人。',damageRatio:1.6,lineWidth:.56},
    // USER-CONFIRMED：虾兵基础生命继承降至 30%，星级倍率不变，每名召唤者最多同时存活两只。
    aolie:{name:'浪花援手',castDuration:1,trigger:.48,description:'召来一名潮芽小将，生命按自身上限的30%及星级倍率计算。每名沧澜最多同时拥有2名；满员时保留能量并继续普攻，出现空缺后再召唤。',summonHpRatio:.30,summonAtkRatio:.5,maxSummons:2},
    nezha:{name:'赤轮振翼',castDuration:.85,trigger:.38,description:'强化自身攻击与攻速；再次施放刷新持续时间。',duration:6,attackBonus:.5,attackSpeedBonus:.35},
    xiaotian:{name:'追风扑咬',castDuration:.72,trigger:.3,description:'贴近目标后奋力扑咬一次。',damageRatio:2.2},
    xiaoyu:{name:'桂月护佑',castDuration:.85,trigger:.4,description:'为生命比例最低的友军施加护盾，也可保护自己。',shieldRatio:2}
  };
  const SHRIMP={
    1:{label:'木叉潮芽',size:82,hpScale:1,atkScale:1,asset:'shrimp_star1'},
    2:{label:'银甲潮芽',size:96,hpScale:1.25,atkScale:1.2,asset:'shrimp_star2'},
    3:{label:'赤金潮将',size:110,hpScale:1.55,atkScale:1.4,asset:'shrimp_star3'}
  };
  function skill(id){const value=SKILLS[id];if(!value)throw new Error('角色没有技能配置：'+id);return value;}
  function shrimp(star){const value=SHRIMP[star];if(!value)throw new Error('虾兵星级无效：'+star);return value;}
  function boardPoint(value){return{x:Math.sqrt(3)*(value.c+.5*(value.r&1)),y:.99*value.r};}
  function lineTargets(source,target,enemies,width=SKILLS.yangjian.lineWidth){
    const a=boardPoint(source),b=boardPoint(target),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;
    return enemies.filter(enemy=>{
      const p=boardPoint(enemy),rx=p.x-a.x,ry=p.y-a.y;
      const forward=(rx*dx+ry*dy)/length;
      const perpendicular=Math.abs(rx*dy-ry*dx)/length;
      return forward>=0&&perpendicular<=width;
    }).sort((left,right)=>{
      const l=boardPoint(left),r=boardPoint(right);
      return Math.hypot(l.x-a.x,l.y-a.y)-Math.hypot(r.x-a.x,r.y-a.y)||left.id.localeCompare(right.id);
    });
  }
  root.LionSkills={ENERGY_MAX,ENERGY_ON_BASIC_HIT,ENERGY_ON_DAMAGE,SKILLS,SHRIMP,skill,shrimp,boardPoint,lineTargets};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.LionSkills;
})(typeof window!=='undefined'?window:globalThis);
