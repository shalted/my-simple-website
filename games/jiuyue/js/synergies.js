(function(root){
  'use strict';
  const {character}=root.LionCharacters;
  // 用户授权趣味命名及初版数值；追逐组移速为主、攻速为辅。0 明确表示不加此属性。
  const FRIENDS = {name:'霜灯逐风',members:['jiuyue','xiaotian'],attackSpeedBonus:.15,moveSpeedBonus:0,attackBonus:0,hpBonus:0,projectileScaleBonus:0,memberBonuses:[],flavor:'灯火指路，追风先行。'};
  const SYNERGIES = [FRIENDS,
    {name:'追月拍档',members:['xiaotian','xiaoyu'],attackSpeedBonus:.08,moveSpeedBonus:.20,attackBonus:0,hpBonus:0,projectileScaleBonus:0,memberBonuses:[],flavor:'桂香一飘，脚步就快了起来。'},
    {name:'月潮同辉',members:['jiuyue','aolie'],attackSpeedBonus:0,moveSpeedBonus:0,attackBonus:.15,hpBonus:0,projectileScaleBonus:0,memberBonuses:[],flavor:'一盏霜灯映进潮水，照亮同一条归途。'},
    // 用户确认竞争型羁绊：生命上限 -20%、攻击 +15%；不产生友军伤害。
    {name:'双星争辉',members:['yangjian','nezha'],attackSpeedBonus:0,moveSpeedBonus:0,attackBonus:.15,hpBonus:-.20,projectileScaleBonus:0,memberBonuses:[],flavor:'两束亮光都想跑在前面，攻势更盛，也更忘我。'},
    // 非对称加成全部显式配置；水球直径 +50% 仅用于视觉，不改变命中范围。
    {name:'赤轮逐浪',members:['nezha','aolie'],attackSpeedBonus:0,moveSpeedBonus:0,attackBonus:0,hpBonus:0,projectileScaleBonus:0,memberBonuses:[
      {characterId:'nezha',attackSpeedBonus:0,moveSpeedBonus:.15,attackBonus:0,hpBonus:0,projectileScaleBonus:0},
      {characterId:'aolie',attackSpeedBonus:.08,moveSpeedBonus:0,attackBonus:.15,hpBonus:0,projectileScaleBonus:.50}
    ],flavor:'赤轮追着浪花跑，浪花越急，水势越高。'},
    // USER-CONFIRMED：曜瞳负责攻坚，追风负责护阵；沿用上阵去重与每场快照规则。
    {name:'照夜同行',members:['yangjian','xiaotian'],attackSpeedBonus:0,moveSpeedBonus:0,attackBonus:0,hpBonus:0,projectileScaleBonus:0,memberBonuses:[
      {characterId:'yangjian',attackSpeedBonus:0,moveSpeedBonus:0,attackBonus:.10,hpBonus:0,projectileScaleBonus:0},
      {characterId:'xiaotian',attackSpeedBonus:0,moveSpeedBonus:0,attackBonus:0,hpBonus:.15,projectileScaleBonus:0}
    ],flavor:'你照见前路，我替你挡风。'}
  ];
  const SYNERGY_BONUS_FIELDS=['attackBonus','attackSpeedBonus','moveSpeedBonus','hpBonus','projectileScaleBonus'];
  // 汇总同一棋子的共同/专属加成；字段缺失或非法时明确报错，不做默认替代。
  function synergyBonuses(characterId,states){
    character(characterId);
    const total=Object.fromEntries(SYNERGY_BONUS_FIELDS.map(field=>[field,0]));
    for(const entry of states.filter(entry=>entry.active&&entry.members.includes(characterId))){
      for(const source of [entry,...entry.memberBonuses.filter(bonus=>bonus.characterId===characterId)]){
        for(const field of SYNERGY_BONUS_FIELDS){
          if(!Number.isFinite(source[field]))throw new Error('羁绊属性缺失或非法：'+entry.name+'/'+field);
          total[field]+=source[field];
        }
      }
    }
    return total;
  }
  // 仅己方上阵角色参与；重复副本不能补齐另一名成员。  // 仅己方上阵角色参与；重复副本不能补齐另一名成员。
  function synergyState(units,definition){
    const present=new Set(units.filter(u=>u.team==='blue'&&u.slot==null).map(u=>u.characterId));
    const missing=definition.members.filter(id=>!present.has(id));
    return {...definition,active:missing.length===0,missing};
  }
  function friendship(units){return synergyState(units,FRIENDS);}
  // 说明和结算共用配置，调整初版数值后不会留下过期文案。
  function formatSynergyBonus(bonus){
    const effects=[],percent=value=>(value>0?'+':'')+Math.round(value*100)+'%';
    if(bonus.hpBonus)effects.push('生命上限 '+percent(bonus.hpBonus));
    if(bonus.moveSpeedBonus)effects.push('移速 '+percent(bonus.moveSpeedBonus));
    if(bonus.attackSpeedBonus)effects.push('攻速 '+percent(bonus.attackSpeedBonus));
    if(bonus.attackBonus)effects.push('攻击 '+percent(bonus.attackBonus));
    if(bonus.projectileScaleBonus)effects.push('水球直径 '+percent(bonus.projectileScaleBonus)+'（仅视觉，不扩大命中范围）');
    return effects.join('、');
  }
  function synergyEffect(entry){
    const common=formatSynergyBonus(entry),effects=[];
    if(common)effects.push('己方上阵成员'+common);
    for(const bonus of entry.memberBonuses)effects.push(character(bonus.characterId).name+'：'+formatSynergyBonus(bonus));
    return effects.join('；');
  }
  function synergyDetails(characterId,states,owned){
    character(characterId);
    return states.filter(entry=>entry.members.includes(characterId)).map(entry=>({
      name:entry.name,effect:synergyEffect(entry),members:entry.members.map(id=>character(id).name).join(' ＋ '),
      status:entry.active?'已激活':('待上阵：'+entry.missing.map(id=>character(id).name+(owned.some(u=>u.characterId===id&&u.slot!=null)?'（备战席）':'')).join('、'))
    }));
  }
  root.LionSynergies={FRIENDS,SYNERGIES,friendship,synergyState,synergyEffect,synergyDetails,synergyBonuses,formatSynergyBonus};
})(typeof globalThis!=='undefined'?globalThis:this);
