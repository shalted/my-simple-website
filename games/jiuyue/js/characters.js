(function(root){
  'use strict';
  const {ENEMIES}=root.LionEnemies;
  const STATS = {
    melee: {label:'近战',hp:660,atk:64,def:16,range:1,interval:1.15},
    ranged:{label:'远程',hp:460,atk:56,def:8,range:3,interval:1.25},
    xiaoyu:{label:'快攻',hp:540,atk:72,def:8,range:1,interval:.95},
    aolie:{label:'水系远程',hp:560,atk:62,def:12,range:3,interval:1.4},
    nezha:{label:'疾行近战',hp:600,atk:78,def:10,range:1,interval:1.05},
    yangjian:{label:'照夜远程',hp:580,atk:70,def:14,range:3,interval:1.35}
  };
  // 2026-09-16 用户确认角色映射；身份与定位分离，合成按角色身份判断。
  const CHARACTERS = {
    xiaotian:{name:'追风',kind:'melee',statsKey:'melee',role:'护阵 · 近战',description:'灯会巡路最快的小勇士，总能循着桂香找到失落的月饼。冲在最前面，是因为伙伴们都在身后。',assets:{idle:'xiaotian_idle',move:'xiaotian_move',attack:'xiaotian_attack'}},
    jiuyue:{name:'霜尾',kind:'ranged',statsKey:'ranged',role:'引火 · 远程',description:'守着月桂林边的霜色灯火，九条蓬松尾巴能把微光拢成狐火。她答应狮团团，要让归途重新亮起来。',projectile:{trail:'#ffb35b',glow:'#ff883d',body:'#ffa047',highlight:'#fff1be'},assets:{idle:'idle',move:'move',attack:'attack'}},
    xiaoyu:{name:'桂团',kind:'melee',statsKey:'xiaoyu',role:'护心 · 近战',description:'月桂点心坊里最麻利的小师傅，药杵既能捣馅，也能敲开挡路的硬壳。她把最柔软的一份力量留给伙伴。',assets:{idle:'xiaoyu_idle',move:'xiaoyu_move',attack:'xiaoyu_attack'}},
    aolie:{name:'沧澜',kind:'ranged',statsKey:'aolie',role:'驭水 · 远程',description:'从月河深处赶来的巡潮者，能把清亮水花送过整座棋盘。安静的水声里，藏着守护团圆的决心。',projectile:{trail:'#80cfec',glow:'#68b7e2',body:'#65bde3',highlight:'#e6faff'},assets:{idle:'aolie_idle',move:'aolie_move',attack:'aolie_attack'}},
    nezha:{name:'赤轮',kind:'melee',statsKey:'nezha',role:'疾行 · 近战',description:'踩着赤红双轮穿过灯市的小先锋，转弯时会带起一串像糖星般的火花。越是热闹的夜晚，他越不肯让谁掉队。',assets:{idle:'nezha_idle',move:'nezha_move',attack:'nezha_attack'}},
    // 用户确认沿用现有远程发射/到达结算和霜尾弹道色板；额间聚光已在帧内。
    yangjian:{name:'曜瞳',kind:'ranged',statsKey:'yangjian',role:'照夜 · 远程',description:'提着长刃巡守夜空的灯阵师，额间曜光能照见藏在阴影里的路。只要光束还亮着，月饼队伍就不会迷路。',projectile:{trail:'#ffb35b',glow:'#ff883d',body:'#ffa047',highlight:'#fff1be'},assets:{idle:'yangjian_idle',move:'yangjian_move',attack:'yangjian_attack'}}
  };
  function character(id){
    // 敌方身份可供战斗查询，但不合并进商店使用的英雄目录。
    if(Object.hasOwn(CHARACTERS,id))return CHARACTERS[id];
    if(Object.hasOwn(ENEMIES,id))return ENEMIES[id];
    throw new Error('未知角色：'+id);
  }
  root.LionCharacters={STATS,CHARACTERS,character};
})(typeof globalThis!=='undefined'?globalThis:this);
