(function(root){
  'use strict';
  const {STATS,character}=root.LionCharacters;
  const EQUIPMENT_SLOT_COUNT=3;
  // USER-CONFIRMED：双方基础生命统一提高 35%，延长交战与回能窗口；攻击及动作时钟不变。
  const BATTLE_HP_MULTIPLIER=1.35;
  const BONUS_FIELDS=['hpBonus','attackBonus','defenseBonus','attackSpeedBonus','moveSpeedBonus','critChance','lifestealBonus'];
  const emptyBonus=()=>({hpBonus:0,attackBonus:0,defenseBonus:0,attackSpeedBonus:0,moveSpeedBonus:0,critChance:0,lifestealBonus:0});
  // 用户确认：装备可由所有角色使用，单件数值允许按物品浮动并整体保持克制。
  const EQUIPMENT={
    huojianqiang:{setId:'nezha',name:'焰穗长枪',icon:'枪',description:'枪尖系着灯穗，挥动时会划出温暖火光。',hpBonus:0,attackBonus:.08,defenseBonus:0,attackSpeedBonus:0,moveSpeedBonus:0,critChance:.04,lifestealBonus:0},
    huntianling:{setId:'nezha',name:'团圆红绫',icon:'绫',description:'绣着团圆纹样的红绫，柔韧又醒目。',hpBonus:.03,attackBonus:0,defenseBonus:3,attackSpeedBonus:0,moveSpeedBonus:0,critChance:0,lifestealBonus:.02},
    fenghuolun:{setId:'nezha',name:'流火双轮',icon:'轮',description:'一对掠过青石路便亮起火星的轻轮。',hpBonus:0,attackBonus:0,defenseBonus:0,attackSpeedBonus:.07,moveSpeedBonus:.03,critChance:.02,lifestealBonus:0},
    sanjianliangrendao:{setId:'yangjian',name:'曜纹长刃',icon:'刃',description:'刃面刻着星芒般的曜纹，适合守住长路。',hpBonus:0,attackBonus:.07,defenseBonus:0,attackSpeedBonus:.02,moveSpeedBonus:0,critChance:.04,lifestealBonus:0},
    zhaoyaojing:{setId:'yangjian',name:'映心明镜',icon:'镜',description:'能把微弱灯火聚成清亮光束的圆镜。',hpBonus:0,attackBonus:.04,defenseBonus:3,attackSpeedBonus:0,moveSpeedBonus:0,critChance:.03,lifestealBonus:0},
    fuyaosuo:{setId:'yangjian',name:'束影银索',icon:'索',description:'闪着月色的银索，掠过地面便收紧影子。',hpBonus:0,attackBonus:0,defenseBonus:0,attackSpeedBonus:.05,moveSpeedBonus:.02,critChance:0,lifestealBonus:.03},
    daoyaogui:{setId:'yutu',name:'桂枝药杵',icon:'杵',description:'用老桂枝制成的小药杵，握柄还留着淡香。',hpBonus:0,attackBonus:.06,defenseBonus:0,attackSpeedBonus:.02,moveSpeedBonus:0,critChance:.03,lifestealBonus:0},
    guanghanyuchu:{setId:'yutu',name:'月白石臼',icon:'臼',description:'月白色的小石臼，装得下香甜馅料与草木露水。',hpBonus:.03,attackBonus:0,defenseBonus:4,attackSpeedBonus:0,moveSpeedBonus:0,critChance:0,lifestealBonus:.03},
    yueguipibo:{setId:'yutu',name:'桂香披帛',icon:'桂',description:'一条沾着桂花香气的轻盈披帛。',hpBonus:0,attackBonus:0,defenseBonus:0,attackSpeedBonus:0,moveSpeedBonus:.06,critChance:0,lifestealBonus:.02},
    canghailongzhu:{setId:'aolie',name:'沧波明珠',icon:'珠',description:'明珠里收着一圈不会停歇的清澈水纹。',hpBonus:.04,attackBonus:.04,defenseBonus:0,attackSpeedBonus:0,moveSpeedBonus:0,critChance:0,lifestealBonus:.04},
    bailonglinjia:{setId:'aolie',name:'潮纹鳞甲',icon:'鳞',description:'层层鳞片像潮水相叠，能护住最要紧的地方。',hpBonus:0,attackBonus:0,defenseBonus:6,attackSpeedBonus:0,moveSpeedBonus:0,critChance:0,lifestealBonus:.02},
    xihaiyuguan:{setId:'aolie',name:'澜月玉冠',icon:'冠',description:'玉冠映着月色，边缘刻有细小的浪花。',hpBonus:0,attackBonus:0,defenseBonus:2,attackSpeedBonus:0,moveSpeedBonus:.05,critChance:.02,lifestealBonus:0},
    qingqiuyupei:{setId:'jiuwei',name:'霜纹玉佩',icon:'玉',description:'温润玉佩上刻着层层霜尾纹样。',hpBonus:.02,attackBonus:.05,defenseBonus:0,attackSpeedBonus:0,moveSpeedBonus:0,critChance:.03,lifestealBonus:0},
    huhuodeng:{setId:'jiuwei',name:'尾焰灯',icon:'火',description:'灯芯燃着柔和尾焰，风里也不会熄灭。',hpBonus:0,attackBonus:0,defenseBonus:0,attackSpeedBonus:.06,moveSpeedBonus:0,critChance:0,lifestealBonus:.03},
    jiuweipibo:{setId:'jiuwei',name:'霜月披帛',icon:'尾',description:'绣着霜月与蓬松尾纹的轻巧披帛。',hpBonus:0,attackBonus:0,defenseBonus:2,attackSpeedBonus:0,moveSpeedBonus:.05,critChance:.02,lifestealBonus:0},
    zhenxieyaren:{setId:'xiaotian',name:'逐风牙刃',icon:'牙',description:'形如弯月犬牙的短刃，挥动时带起轻风。',hpBonus:0,attackBonus:.06,defenseBonus:0,attackSpeedBonus:.02,moveSpeedBonus:0,critChance:.02,lifestealBonus:.03},
    zhuiyunxiangquan:{setId:'xiaotian',name:'追云项圈',icon:'圈',description:'系着小云铃的项圈，跑起来会发出清脆响声。',hpBonus:0,attackBonus:0,defenseBonus:0,attackSpeedBonus:0,moveSpeedBonus:.06,critChance:.03,lifestealBonus:0},
    yinyuehujia:{setId:'xiaotian',name:'银月护甲',icon:'甲',description:'映着月色的轻型护甲，结实却不妨碍奔跑。',hpBonus:.03,attackBonus:0,defenseBonus:5,attackSpeedBonus:0,moveSpeedBonus:0,critChance:0,lifestealBonus:.02},
    ruyijingubang:{setId:'wukong',name:'捣云长棒',icon:'棒',description:'能把薄云搅成棉花糖形状的金色长棒。',hpBonus:0,attackBonus:.09,defenseBonus:0,attackSpeedBonus:0,moveSpeedBonus:0,critChance:.05,lifestealBonus:0},
    fengchizijinguan:{setId:'wukong',name:'金羽冠',icon:'冠',description:'两片金羽在灯光下轻轻颤动的节庆礼冠。',hpBonus:0,attackBonus:0,defenseBonus:2,attackSpeedBonus:.05,moveSpeedBonus:0,critChance:.03,lifestealBonus:0},
    suozihuangjinjia:{setId:'wukong',name:'团纹金甲',icon:'甲',description:'甲片上压着圆圆团纹，走动时像一串小铜铃。',hpBonus:.03,attackBonus:0,defenseBonus:6,attackSpeedBonus:0,moveSpeedBonus:0,critChance:0,lifestealBonus:.02}
  };
  const EQUIPMENT_SETS={
    nezha:{name:'赤轮流火',pieces:['huojianqiang','huntianling','fenghuolun'],bonus:{hpBonus:0,attackBonus:.06,defenseBonus:0,attackSpeedBonus:.04,moveSpeedBonus:0,critChance:.03,lifestealBonus:0}},
    yangjian:{name:'曜瞳巡夜',pieces:['sanjianliangrendao','zhaoyaojing','fuyaosuo'],bonus:{hpBonus:0,attackBonus:.07,defenseBonus:0,attackSpeedBonus:0,moveSpeedBonus:0,critChance:.04,lifestealBonus:0}},
    yutu:{name:'桂团月礼',pieces:['daoyaogui','guanghanyuchu','yueguipibo'],bonus:{hpBonus:0,attackBonus:0,defenseBonus:0,attackSpeedBonus:.03,moveSpeedBonus:.06,critChance:0,lifestealBonus:.04}},
    aolie:{name:'沧澜听潮',pieces:['canghailongzhu','bailonglinjia','xihaiyuguan'],bonus:{hpBonus:.05,attackBonus:0,defenseBonus:3,attackSpeedBonus:0,moveSpeedBonus:0,critChance:0,lifestealBonus:.04}},
    jiuwei:{name:'霜尾灯影',pieces:['qingqiuyupei','huhuodeng','jiuweipibo'],bonus:{hpBonus:0,attackBonus:.05,defenseBonus:0,attackSpeedBonus:.04,moveSpeedBonus:0,critChance:.03,lifestealBonus:0}},
    xiaotian:{name:'追风逐月',pieces:['zhenxieyaren','zhuiyunxiangquan','yinyuehujia'],bonus:{hpBonus:0,attackBonus:.05,defenseBonus:3,attackSpeedBonus:0,moveSpeedBonus:0,critChance:0,lifestealBonus:.04}},
    wukong:{name:'云间戏月',pieces:['ruyijingubang','fengchizijinguan','suozihuangjinjia'],bonus:{hpBonus:0,attackBonus:.06,defenseBonus:0,attackSpeedBonus:.04,moveSpeedBonus:0,critChance:.04,lifestealBonus:0}}
  };
  function equipment(id){if(!Object.hasOwn(EQUIPMENT,id))throw new Error('未知装备：'+id);return EQUIPMENT[id];}
  function validateBonus(source,label){for(const field of BONUS_FIELDS)if(!Number.isFinite(source[field]))throw new Error(label+'属性缺失或非法：'+field);}
  function equipmentSetStates(equipmentIds){
    if(!Array.isArray(equipmentIds))throw new Error('装备列表无效');
    const unique=new Set(equipmentIds);return Object.entries(EQUIPMENT_SETS).map(([id,set])=>{validateBonus(set.bonus,'套装 '+set.name);const count=set.pieces.filter(piece=>unique.has(piece)).length;return {id,name:set.name,count,total:set.pieces.length,active:count===set.pieces.length,bonus:set.bonus};});
  }
  function resolveEquipmentBonuses(equipmentIds){
    if(!Array.isArray(equipmentIds))throw new Error('装备列表无效');
    const result=emptyBonus();
    for(const id of equipmentIds){const item=equipment(id);validateBonus(item,'装备 '+item.name);for(const field of BONUS_FIELDS)result[field]+=item[field];}
    for(const state of equipmentSetStates(equipmentIds).filter(state=>state.active))for(const field of BONUS_FIELDS)result[field]+=state.bonus[field];
    return result;
  }
  // 属性顺序固定为角色基础→星级→装备与完整套装；羁绊在 createUnit 之后独立结算。
  function resolveBaseStats(config){
    const definition=character(config.characterId),base=STATS[definition.statsKey],factor=Math.pow(1.7,(config.star||1)-1)*(config.power||1);
    const equipmentBonus=resolveEquipmentBonuses(config.equipmentIds),starAtk=Math.round(base.atk*factor);
    return {kind:definition.kind,baseHp:Math.round(base.hp*factor*BATTLE_HP_MULTIPLIER*(1+equipmentBonus.hpBonus)),baseAtk:Math.round(starAtk*(1+equipmentBonus.attackBonus)),baseDef:base.def+equipmentBonus.defenseBonus,baseInterval:base.interval,range:base.range,equipmentBonus};
  }
  root.LionEquipment={EQUIPMENT,EQUIPMENT_SETS,EQUIPMENT_SLOT_COUNT,BONUS_FIELDS,equipment,equipmentSetStates,resolveEquipmentBonuses,resolveBaseStats};
})(typeof globalThis!=='undefined'?globalThis:this);
