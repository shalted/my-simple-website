
const gameLoadingView=LionResourceLoader.mountLoadingView(document.body);
(async function(){
'use strict';const $=id=>document.getElementById(id);const campaign=new LionCampaign(Math.random,LionTutorial.ONBOARDING_RULES),game=campaign.game;let selected=null,team='blue',renderer,toastTimer,uiTime=0,flow;
const {CHARACTERS,character,synergyEffect,synergyDetails,synergyBonuses,formatSynergyBonus}=LionChess;
const {ENEMIES}=LionEnemies;
const {EQUIPMENT_SETS,EQUIPMENT_SLOT_COUNT,equipment,equipmentSetStates,resolveBaseStats}=LionEquipment;
// 正式资源按清单逐项校验；任一下载或解码错误直接显示，不换成旧大包或替图。
const resourceLoader=LionResourceLoader.createResourceLoader();
const resourceManifest=await resourceLoader.loadManifest('./resources/manifest.json');
const resourceBundle=await resourceLoader.load(resourceManifest.entries,{onProgress:progress=>gameLoadingView.update(progress)});
const ASSETS=resourceBundle.assets;
window.addEventListener('pagehide',event=>{if(!event.persisted)resourceBundle.dispose();});
const images=Object.fromEntries(await Promise.all(Object.entries(ASSETS).map(([name,src])=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve([name,img]);img.onerror=()=>reject(new Error('角色素材解码失败：'+name));img.src=src;}))));
// 所有角色的每组动作必须完整；缺失时报告错误，不能用九月顶替哮天。
const portraits={};
for(const [id,definition] of Object.entries({...CHARACTERS,...ENEMIES})){
 for(const [action,key] of Object.entries(definition.assets)){
  const img=images[key];
  if(!img||img.naturalWidth!==416*5||img.naturalHeight!==480)throw new Error('角色素材缺失或尺寸错误：'+id+'/'+action);
 }
 const pc=document.createElement('canvas');pc.width=104;pc.height=120;
 pc.getContext('2d').drawImage(images[definition.assets.idle],0,0,416,480,0,0,104,120);portraits[id]=pc.toDataURL();
}
for(const star of [1,2,3]){const key=LionSkills.shrimp(star).asset,img=images[key];if(!img||img.naturalWidth!==416*5||img.naturalHeight!==480)throw new Error('虾兵素材缺失或尺寸错误：'+star);const pc=document.createElement('canvas');pc.width=104;pc.height=120;pc.getContext('2d').drawImage(img,0,0,416,480,0,0,104,120);portraits['shrimp'+star]=pc.toDataURL();}
renderer=new ChessRenderer.Renderer($('board'),images);renderer.fit(window.devicePixelRatio);
const label=u=>u.summoned?LionSkills.shrimp(u.star).label+' · 召唤单位':character(u.characterId).name+' · '+(u.enemy?character(u.characterId).role:LionChess.STATS[character(u.characterId).statsKey].label);const stars=u=>'★'.repeat(u.star||1);const rankName=u=>['','一星','二星','三星'][u.star||1];
const rankBadge=u=>'<span class="rank-badge '+(u.star===3?'three-star':u.star===2?'two-star':'')+'" aria-label="'+rankName(u)+'">'+stars(u)+'</span>';
const portraitTag=(id,star=1)=>id==='shrimp'?'<img alt="'+LionSkills.shrimp(star).label+'" src="'+portraits['shrimp'+star]+'">':'<img alt="'+character(id).name+'" src="'+portraits[id]+'">';
const equipmentEffect=item=>[item.hpBonus?'生命 +'+Math.round(item.hpBonus*100)+'%':'',item.attackBonus?'攻击 +'+Math.round(item.attackBonus*100)+'%':'',item.defenseBonus?'护甲 +'+item.defenseBonus:'',item.attackSpeedBonus?'攻速 +'+Math.round(item.attackSpeedBonus*100)+'%':'',item.moveSpeedBonus?'移速 +'+Math.round(item.moveSpeedBonus*100)+'%':'',item.critChance?'暴击 +'+Math.round(item.critChance*100)+'%':'',item.lifestealBonus?'吸血 +'+Math.round(item.lifestealBonus*100)+'%':''].filter(Boolean).join(' · ');
// 用户要求至少一名成员上阵即展示；未激活条目保留说明入口，不给属性加成。
const synergyPanel=document.createElement('section');synergyPanel.className='synergy-strip';synergyPanel.id='friendship';synergyPanel.setAttribute('aria-label','上阵相关羁绊');synergyPanel.hidden=true;document.querySelector('.side').prepend(synergyPanel);
const synergyTip=document.createElement('div');synergyTip.id='synergy-tooltip';synergyTip.className='synergy-tooltip';synergyTip.setAttribute('role','tooltip');synergyTip.hidden=true;document.body.append(synergyTip);
let synergyTrigger=null,synergySignature=null;
function closeSynergyTip(){
 if(synergyTrigger){synergyTrigger.setAttribute('aria-expanded','false');synergyTrigger.removeAttribute('aria-describedby');}
 synergyTrigger=null;synergyTip.hidden=true;
}
function openSynergyTip(button,entry){
 closeSynergyTip();synergyTrigger=button;button.setAttribute('aria-expanded','true');button.setAttribute('aria-describedby',synergyTip.id);
 synergyTip.replaceChildren();
 for(const [tag,content] of [['strong',entry.name],['p',entry.status],['p',entry.members],['p',entry.effect],['p',entry.flavor],['small',entry.rules]]){
  const element=document.createElement(tag);element.textContent=content;synergyTip.append(element);
 }
 synergyTip.hidden=false;
 // 用实际元素尺寸避开窗口边缘；不依赖棋盘分辨率，也不被侧栏 overflow 截断。
 const rect=button.getBoundingClientRect(),tip=synergyTip.getBoundingClientRect(),gap=0,margin=12;
 const left=Math.max(margin,Math.min(rect.right-tip.width,window.innerWidth-tip.width-margin));
 const below=rect.bottom+gap,top=below+tip.height<=window.innerHeight-margin?below:Math.max(margin,rect.top-tip.height-gap);
 synergyTip.style.left=left+'px';synergyTip.style.top=top+'px';
}
function renderSynergyStrip(entries){
 const visible=entries.filter(entry=>entry.missing.length<entry.memberCount),signature=JSON.stringify(visible);
 if(signature===synergySignature)return;
 synergySignature=signature;closeSynergyTip();synergyPanel.replaceChildren();synergyPanel.hidden=visible.length===0;
 for(const entry of visible){
  const button=document.createElement('button');button.type='button';button.className='synergy-chip'+(entry.active?'':' inactive');button.setAttribute('aria-expanded','false');
  const mark=document.createElement('span');mark.className='synergy-mark';mark.setAttribute('aria-hidden','true');mark.textContent='✦';
  const name=document.createElement('span');name.textContent=entry.name+(entry.active?'':' · 未激活');button.append(mark,name);
  button.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')openSynergyTip(button,entry);});
  button.addEventListener('pointerleave',event=>{if(event.relatedTarget instanceof Node&&synergyTip.contains(event.relatedTarget))return;if(document.activeElement!==button)closeSynergyTip();});
  button.addEventListener('focus',()=>openSynergyTip(button,entry));
  button.addEventListener('blur',closeSynergyTip);
  // 触屏点击也能读说明；桌面悬浮和键盘聚焦共享同一份内容。
  button.addEventListener('click',()=>{openSynergyTip(button,entry);flow?.event({type:'synergy-open',ok:true,synergyName:entry.name});});
  synergyPanel.append(button);
 }
}
synergyTip.addEventListener('pointerleave',event=>{if(event.relatedTarget!==synergyTrigger&&document.activeElement!==synergyTrigger)closeSynergyTip();});
document.addEventListener('pointerdown',event=>{if(!synergyPanel.contains(event.target)&&!synergyTip.contains(event.target))closeSynergyTip();});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeSynergyTip();});
document.addEventListener('scroll',closeSynergyTip,true);window.addEventListener('resize',closeSynergyTip);
const selectedSynergies=document.createElement('div');selectedSynergies.id='selectedSynergies';selectedSynergies.className='inspect-hint';selectedSynergies.hidden=true;$('selectedHint').after(selectedSynergies);
const selectedEquipmentSummary=document.createElement('div');selectedEquipmentSummary.id='selectedEquipmentSummary';selectedEquipmentSummary.className='inspect-hint equipment-summary';selectedEquipmentSummary.hidden=true;$('selectedEquipment').after(selectedEquipmentSummary);
let activeSynergyNames=new Set();
function renderFriendship(){
 renderSynergyStrip(game.synergies.map(entry=>({...entry,memberCount:entry.members.length,status:entry.active?'已激活':('未激活 · 待上阵：'+entry.missing.map(id=>character(id).name).join('、')),members:entry.members.map(id=>character(id).name).join(' ＋ '),effect:synergyEffect(entry),rules:'只加成己方上阵成员，备战席不参与。同一羁绊不重复激活，不同羁绊可同时生效，同属性加成相加。每场重算，战中成员退场不取消本场加成。'})));
 const active=game.synergies.filter(entry=>entry.active),added=active.filter(entry=>!activeSynergyNames.has(entry.name));
 if(added.length)toast(added.map(entry=>entry.name).join('、')+'已激活');
 activeSynergyNames=new Set(active.map(entry=>entry.name));
}
function renderCharacterSynergies(u,owned){
 selectedSynergies.replaceChildren();selectedSynergies.hidden=!u;
 if(!u)return;
 const heading=document.createElement('strong');heading.textContent='总羁绊加成';selectedSynergies.append(heading);
 const note=document.createElement('p');
 if(!owned)note.textContent='对手不参与己方羁绊。';
 else if(owned.slot!==null)note.textContent='本棋子在备战席，不计入激活条件，也不获得加成。';
 else {const bonus=u.synergyBonus;note.textContent='攻速 +'+Math.round(bonus.attackSpeedBonus*100)+'% · 移速 +'+Math.round(bonus.moveSpeedBonus*100)+'%'+(bonus.attackBonus?' · 攻击 +'+Math.round(bonus.attackBonus*100)+'%':'')+(bonus.hpBonus?' · 生命上限 '+Math.round(bonus.hpBonus*100)+'%':'');}
 selectedSynergies.append(note);
}
function renderEquipmentSummary(owned){
 selectedEquipmentSummary.replaceChildren();selectedEquipmentSummary.hidden=!owned||!owned.equipmentIds.length;if(selectedEquipmentSummary.hidden)return;
 const itemBonus={hpBonus:0,attackBonus:0,defenseBonus:0,attackSpeedBonus:0,moveSpeedBonus:0,critChance:0,lifestealBonus:0};
 for(const id of owned.equipmentIds){const item=equipment(id);for(const field of Object.keys(itemBonus))itemBonus[field]+=item[field];}
 const heading=document.createElement('strong');heading.textContent='装备加成';const note=document.createElement('p');note.textContent=equipmentEffect(itemBonus);selectedEquipmentSummary.append(heading,note);
 for(const state of equipmentSetStates(owned.equipmentIds).filter(state=>state.active)){const setHeading=document.createElement('strong'),setNote=document.createElement('p');setHeading.textContent='套装加成 · '+state.name;setNote.textContent=equipmentEffect(state.bonus);selectedEquipmentSummary.append(setHeading,setNote);}
}
function toast(s){$('toast').textContent=s;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2400);}
function result(r,success){if(!r.ok)toast(r.reason);else if(r.merged){selected=r.merged;const u=campaign.owned.find(u=>u.id===r.merged);toast('合成成功！'+character(u.characterId).name+'升为'+rankName(u));}else if(success)toast(success);if(selected&&!campaign.owned.some(u=>u.id===selected)&&!game.get(selected))selected=null;render();flow?.afterAction(r);return r;}
function select(id){selected=id;renderer.selected=id;render();}
// 只呈现现有 buyXP 规则：4 金币买 4 经验；进度和升级提示读取当前人口经验。
function renderExperience(){
 const full=campaign.nextXP===0,prep=campaign.prep,canLevel=!full&&campaign.xp+4>=campaign.nextXP;
 $('xp').disabled=!prep||campaign.gold<4||full;
 $('xpTitle').textContent=full?'人口已满':'购买经验';
 $('xpCost').textContent=full?'已达 '+campaign.level+' 人上限':'4 金币 → 4 经验';
 $('xpProgressText').textContent=full?'人口已满级':'经验 '+campaign.xp+' / '+campaign.nextXP;
 $('xpProgress').hidden=full;
 if(!full){$('xpProgress').max=campaign.nextXP;$('xpProgress').value=campaign.xp;}
 $('xpHint').textContent=full?'全员到齐，准备开打！':!prep?'准备阶段可购买经验':campaign.gold<4?'金币不足，需要 4 金币':canLevel?'购买后可多上阵 1 人':'再获得 '+(campaign.nextXP-campaign.xp)+' 经验，人口 +1';
 $('xp').classList.toggle('can-level',prep&&campaign.gold>=4&&canLevel);
}
// 复用 Campaign 的空阵容开战限制，界面提前说明，不让玩家反复点击才发现原因。
function renderFormation(){
 const empty=campaign.board.length===0;
 $('start').disabled=empty;
 $('formationHint').hidden=!campaign.prep||!empty;
 $('formationHint').textContent=campaign.owned.length?'至少上阵一位伙伴才能开始战斗，请将备战席上的伙伴拖到棋盘下半场。':'至少上阵一位伙伴才能开始战斗，请先在月饼补给铺购买伙伴，再拖到棋盘下半场；也可以选择重新开始本局。';
}
// 每关失利都展示重新开始/保留阵容重试；只有最终关真实获胜才显示通关文案。
function renderRoundResult(){
 $('result').hidden=game.phase!=='finished';
 $('retry').hidden=!campaign.canRetry;
 $('next').classList.toggle('primary',!campaign.canRetry);
 if(game.phase!=='finished')return;
 const r=campaign.reward,dropText=r.equipmentDrops.length?'掉落 '+r.equipmentDrops.map(id=>equipment(id).name).join('、'):'本回合未掉落装备';
 $('resultTitle').textContent=campaign.status==='clear'?'月饼夺回成功！':campaign.canRetry?'再试一次，团圆在望':campaign.status==='lost'?'本次挑战结束':r.win?'本回合胜利':'本回合失利';
 $('resultText').textContent='收入 +'+r.income+' 金币（利息 '+r.interest+'） · 经验 +'+r.experience+(r.loss?' · 心情 −'+r.loss:'')+' · '+dropText+(campaign.status==='clear'?' · 已完成 10 回合':campaign.canRetry?' · 奖励已保留，重试可继续调整阵容；心情归零也能挑战。':'');
 $('next').textContent=campaign.canRetry?'重新开始':campaign.status==='playing'?'下一回合 →':'再来一局';
}
function render(){
 // 棋盘外围只响应真实对局状态；装饰不拦截点击，不改变布阵坐标。
 $('arena').dataset.phase=game.phase;
 $('arena').dataset.outcome=game.phase==='finished'?(game.result.winner==='blue'?'victory':game.result.winner==='red'?'defeat':'draw'):'pending';
 const prep=campaign.prep,battle=game.phase==='battle';renderer.selected=selected;$('round').textContent=campaign.round+' / 10';$('hp').textContent=campaign.hp;$('gold').textContent=campaign.gold;$('population').textContent=campaign.board.length+' / '+campaign.level;$('phase').textContent=prep?'准备布阵':battle?'自动战斗':campaign.status==='clear'?'十回合达成':campaign.status==='lost'?'本局结束':'回合结算';
 $('start').hidden=!prep;$('pause').hidden=!battle;$('pause').textContent=game.paused?'继续':'暂停';$('refresh').disabled=!prep||campaign.gold<2;renderExperience();renderFormation();
 $('benchCount').textContent=(campaign.owned.length-campaign.board.length)+' / 8';$('bench').innerHTML=Array.from({length:8},(_,slot)=>{const u=campaign.owned.find(u=>u.slot===slot);return '<button data-slot="'+slot+'" class="'+(u?'filled '+(u.star===3?'three-star ':u.star===2?'two-star ':''):'')+(u?.id===selected?'selected':'')+'" aria-label="'+(u?label(u)+stars(u):'空备战位 '+(slot+1))+'">'+(u?portraitTag(u.characterId)+rankBadge(u)+'<span class="bench-label">'+character(u.characterId).name+'</span>':'<span class="empty-slot">'+(slot+1)+'</span>')+'</button>';}).join('');
 $('shop').innerHTML=campaign.shop.map((id,i)=>{const definition=id?character(id):null;return '<button data-buy="'+i+'" class="card '+(definition?definition.kind:'sold')+'" '+(!prep||!id||campaign.gold<2?'disabled':'')+'>'+(definition?portraitTag(id)+'<div><b>'+definition.name+'</b><span>'+definition.role+'</span><em>◉ 2 金币</em></div>':'已售出')+'</button>';}).join('');
 const owned=campaign.owned.find(u=>u.id===selected),u=game.get(selected)||owned;$('sell').hidden=!prep||!owned;$('sell').textContent='出售 · '+(2*Math.pow(3,(owned?.star||1)-1))+' 金币';$('selectedPlace').textContent=u?(owned?owned.slot===null?'己方上阵':'备战席':u.summoned?(u.team==='blue'?'己方召唤物':'敌方召唤物'):'对手'):'未选择';$('selectedName').innerHTML=u?label(u)+' '+rankBadge(u):'选择一位角色';
 const selectedEquipment=$('selectedEquipment');selectedEquipment.hidden=!owned;selectedEquipment.innerHTML=owned?Array.from({length:EQUIPMENT_SLOT_COUNT},(_,index)=>{const id=owned.equipmentIds[index],item=id?equipment(id):null;return '<button class="equipment-slot '+(item?'':'empty')+'" data-unequip="'+index+'" '+(!prep||!item?'disabled':'')+'>'+(item?item.name+' · 拖回装备箱卸下':'空装备槽')+'</button>';}).join(''):'';
 $('selectedPortrait').hidden=!u;if(u){$('selectedPortrait').src=u.summoned?portraits['shrimp'+u.star]:portraits[u.characterId];$('selectedPortrait').alt=u.summoned?LionSkills.shrimp(u.star).label:character(u.characterId).name;}
 // 敌方档案展示独立描述，不查询不存在的英雄技能，也不伪造能量值。
 if(u){const definition=u.summoned?null:character(u.characterId),stats=owned&&!game.get(selected)?resolveBaseStats(owned):u;$('selectedStats').innerHTML='<span>生命 '+(stats.hp??stats.baseHp)+'</span><span>攻击 '+(stats.atk??stats.baseAtk)+'</span><span>护甲 '+(stats.def??stats.baseDef)+'</span><span>射程 '+stats.range+' 格</span>'+(!u.summoned&&!u.enemy?'<span>能量 '+(stats.energy??0)+' / '+(stats.energyMax??100)+'</span>':'');$('selectedHint').textContent=u.summoned?character('aolie').name+'召来的'+LionSkills.shrimp(u.star).label+'。它会独立移动、攻击，也会被敌人选中并击败。':u.enemy?definition.description:definition.description+' · 技能：'+LionSkills.skill(u.characterId).name+'——'+LionSkills.skill(u.characterId).description;}else{$('selectedStats').innerHTML='';$('selectedHint').textContent='选择棋盘或备战席上的角色，查看属性。';}
 $('equipmentCount').textContent=campaign.equipmentInventory.length+' 件';$('equipmentInventory').innerHTML=campaign.equipmentInventory.length?campaign.equipmentInventory.map((id,index)=>{const item=equipment(id),set=EQUIPMENT_SETS[item.setId];return '<button class="equipment-item" data-equip="'+index+'" title="'+item.description+'" '+(!prep?'disabled':'')+'><i>'+item.icon+'</i><span><b>'+item.name+'</b><small>'+set.name+' · '+equipmentEffect(item)+' · 拖到棋子</small></span></button>';}).join(''):'<small>每只被击杀的小怪有 15% 概率掉落一件神话装备。</small>';
 renderFriendship();renderCharacterSynergies(u?.summoned?null:u,owned);renderEquipmentSummary(owned);
 renderRoundResult();damage();$('sell').disabled=false;$('restart').disabled=false;flow?.sync();
}
function damage(){const units=game.units.filter(u=>u.team===team).sort((a,b)=>b.damage-a.damage||a.id.localeCompare(b.id)),max=Math.max(1,...units.map(u=>u.damage));$('damage').innerHTML=units.length?units.map(u=>'<div class="damage-row"><div class="damage-avatar">'+portraitTag(u.characterId,u.star)+'</div><div><div class="damage-label"><span>'+(u.summoned?LionSkills.shrimp(u.star).label:character(u.characterId).name)+' '+rankBadge(u)+'</span><b>'+u.damage+'</b></div><div class="bar"><i style="width:'+u.damage/max*100+'%;background:'+(team==='blue'?'#3a8b80':'#ce7465')+'"></i></div></div></div>').join(''):'<div class="damage-empty">上阵棋子后开始统计</div>';$('damageBlue').classList.toggle('active',team==='blue');$('damageRed').classList.toggle('active',team==='red');$('timer').textContent='00:'+String(Math.floor(game.time)).padStart(2,'0');}
$('shop').addEventListener('click',e=>{const b=e.target.closest('[data-buy]');if(b)result(campaign.buy(Number(b.dataset.buy)));});
// 键盘仍可用 Enter 操作；鼠标与触摸统一走下面的拖放流程。
$('equipmentInventory').addEventListener('click',e=>{if(e.detail!==0)return;const b=e.target.closest('[data-equip]');if(b)result(campaign.equip(selected,Number(b.dataset.equip)),'装备已穿戴');});
$('selectedEquipment').addEventListener('click',e=>{if(e.detail!==0)return;const b=e.target.closest('[data-unequip]');if(b)result(campaign.unequip(selected,Number(b.dataset.unequip)),'装备已卸下');});

$('refresh').onclick=()=>result(campaign.refresh());$('xp').onclick=()=>result(campaign.buyXP());$('sell').onclick=()=>{const r=campaign.sell(selected);if(r.ok)selected=null;result(r);};$('start').onclick=()=>result(campaign.start());$('pause').onclick=()=>{game.paused=!game.paused;render();};$('next').onclick=()=>{if(campaign.status==='playing')result(campaign.next());else{selected=null;flow.begin(false);}};
$('retry').onclick=()=>result(campaign.retry());
let resetArmed=false;$('restart').onclick=()=>{if(!resetArmed){resetArmed=true;$('restart').textContent='确定重开？再次点击';setTimeout(()=>{resetArmed=false;$('restart').textContent='重新开始本局';},3000);return;}selected=null;resetArmed=false;flow.begin(false);};
$('damageBlue').onclick=()=>{team='blue';damage();};$('damageRed').onclick=()=>{team='red';damage();};
function pos(e){const r=$('board').getBoundingClientRect();return {x:(e.clientX-r.left)*ChessRenderer.W/r.width,y:(e.clientY-r.top)*ChessRenderer.H/r.height};}
let pointer=null;const canvas=$('board'),bench=$('bench');
const ghost=document.createElement('div');ghost.className='drag-ghost';ghost.hidden=true;document.body.appendChild(ghost);
function clearDrag(){const old=pointer;pointer=null;ghost.hidden=true;renderer.hover=null;document.body.classList.remove('dragging-piece','dragging-equipment');document.querySelectorAll('.drop-target,.equipment-drop-target').forEach(el=>el.classList.remove('drop-target','equipment-drop-target'));if(old&&document.body.hasPointerCapture?.(old.pointerId))document.body.releasePointerCapture(old.pointerId);}
function beginDrag(e,id){if(e.button!==0||pointer)return;select(id);const u=campaign.owned.find(u=>u.id===id);if(!campaign.prep||!u)return;e.preventDefault();pointer={type:'piece',id,pointerId:e.pointerId,x:e.clientX,y:e.clientY,moved:false};document.body.setPointerCapture(e.pointerId);}
function beginEquipmentDrag(e,source){if(e.button!==0||pointer||!campaign.prep)return;e.preventDefault();pointer={type:'equipment',...source,pointerId:e.pointerId,x:e.clientX,y:e.clientY,moved:false};document.body.setPointerCapture(e.pointerId);}
function dropTarget(e){
 const hit=document.elementFromPoint(e.clientX,e.clientY),slot=hit?.closest('#bench [data-slot]');
 if(slot)return {element:slot,slot:Number(slot.dataset.slot)};
 const rect=canvas.getBoundingClientRect();
 if(e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom){const p=pos(e),cell=renderer.cellAt(p.x,p.y);if(cell&&game.validCell(cell.c,cell.r,'blue'))return {element:canvas,cell};}
 return null;
}
function equipmentDropTarget(e){
 const hit=document.elementFromPoint(e.clientX,e.clientY);
 if(pointer.inventoryIndex!==undefined){
  const slot=hit?.closest('#bench [data-slot]'),benchUnit=slot&&campaign.owned.find(u=>u.slot===Number(slot.dataset.slot));
  if(benchUnit)return {element:slot,id:benchUnit.id};
  const rect=canvas.getBoundingClientRect();
  if(e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom){const p=pos(e),id=renderer.unitAt(p.x,p.y);if(id&&campaign.owned.some(u=>u.id===id))return {element:canvas,id};}
 }else if(hit?.closest('#equipmentInventory'))return {element:$('equipmentInventory'),inventory:true};
 return null;
}
canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;const p=pos(e),id=renderer.unitAt(p.x,p.y);if(id)beginDrag(e,id);else select(null);});
bench.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-slot]');if(!b||e.button!==0)return;const u=campaign.owned.find(u=>u.slot===Number(b.dataset.slot));if(u)beginDrag(e,u.id);else select(null);});
$('equipmentInventory').addEventListener('pointerdown',e=>{const b=e.target.closest('[data-equip]');if(b)beginEquipmentDrag(e,{inventoryIndex:Number(b.dataset.equip),equipmentId:campaign.equipmentInventory[Number(b.dataset.equip)]});});
$('selectedEquipment').addEventListener('pointerdown',e=>{const b=e.target.closest('[data-unequip]');if(b&&!b.disabled)beginEquipmentDrag(e,{id:selected,equipmentIndex:Number(b.dataset.unequip),equipmentId:campaign.owned.find(u=>u.id===selected)?.equipmentIds[Number(b.dataset.unequip)]});});
// Keyboard activation selects only; pointer placement always requires dragging.
bench.addEventListener('click',e=>{if(e.detail!==0)return;const b=e.target.closest('[data-slot]');if(b)select(campaign.owned.find(u=>u.slot===Number(b.dataset.slot))?.id||null);});
document.addEventListener('pointermove',e=>{
 if(!pointer||e.pointerId!==pointer.pointerId)return;if(!campaign.prep){clearDrag();return;}
 if(!pointer.moved&&Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)<6)return;
 if(!pointer.moved){pointer.moved=true;if(pointer.type==='piece'){const u=campaign.owned.find(u=>u.id===pointer.id);ghost.innerHTML=portraitTag(u.characterId)+rankBadge(u);ghost.style.width=(112*canvas.getBoundingClientRect().width/ChessRenderer.W)+'px';document.body.classList.add('dragging-piece');}else{const item=equipment(pointer.equipmentId);ghost.innerHTML='<span class="equipment-ghost-icon">'+item.icon+'</span><b>'+item.name+'</b>';ghost.style.width='auto';document.body.classList.add('dragging-equipment');}ghost.hidden=false;}
 e.preventDefault();ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';
 document.querySelectorAll('.drop-target,.equipment-drop-target').forEach(el=>el.classList.remove('drop-target','equipment-drop-target'));const target=pointer.type==='piece'?dropTarget(e):equipmentDropTarget(e);target?.element.classList.add(pointer.type==='piece'?'drop-target':'equipment-drop-target');renderer.hover=pointer.type==='piece'?(target?.cell||null):null;
},{passive:false});
document.addEventListener('pointerup',e=>{if(!pointer||e.pointerId!==pointer.pointerId)return;const drag=pointer,target=drag.moved?(drag.type==='piece'?dropTarget(e):equipmentDropTarget(e)):null;clearDrag();if(!drag.moved)return;if(!target){toast(drag.type==='piece'?'已取消移动，请放到己方格子或备战席':'已取消装备拖放');return;}if(drag.type==='piece'){result(target.cell?campaign.place(drag.id,target.cell.c,target.cell.r):campaign.bench(drag.id,target.slot));return;}if(target.inventory)result(campaign.unequip(drag.id,drag.equipmentIndex),'装备已卸下');else{select(target.id);result(campaign.equip(target.id,drag.inventoryIndex),'装备已穿戴');}});
document.addEventListener('pointercancel',e=>{if(pointer?.pointerId===e.pointerId)clearDrag();});
document.body.addEventListener('lostpointercapture',e=>{if(pointer?.pointerId===e.pointerId)clearDrag();});
window.addEventListener('blur',clearDrag);document.addEventListener('keydown',e=>{if(e.key==='Escape')clearDrag();});
canvas.addEventListener('keydown',e=>{const u=campaign.owned.find(u=>u.id===selected);const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(d&&u?.slot===null&&campaign.prep){e.preventDefault();result(campaign.place(u.id,u.c+d[0],u.r+d[1]));}});
document.addEventListener('keydown',e=>{if(e.code==='Space'&&game.phase==='battle'&&!['BUTTON','SELECT','INPUT'].includes(document.activeElement?.tagName)){e.preventDefault();game.paused=!game.paused;render();}});document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.phase==='battle'){game.paused=true;render();}});window.addEventListener('resize',()=>renderer.fit(window.devicePixelRatio));
game.listeners.push(e=>{if(e.type==='finish'){render();flow.finish();}});let last=0,acc=0,clock=0;function frame(t){const dt=Math.min((t-last)/1000||0,.1);last=t;clock+=dt;if(game.phase==='battle'&&!game.paused&&!document.querySelector('.app').hidden){acc+=dt*Number($('speed').value);while(acc>=1/30){game.step(1/30);acc-=1/30;}}else acc=0;renderer.draw(game,clock);uiTime+=dt;if(uiTime>.2){uiTime=0;damage();}requestAnimationFrame(frame);}render();flow=LionGameFlow.create({campaign,assets:ASSETS,render,onError:err=>{toast(err.message);console.error(err);}});window.lionChess={campaign,game,renderer,select,render,flow};gameLoadingView.complete();gameLoadingView.destroy();requestAnimationFrame(frame);
})().catch(err=>{gameLoadingView.fail(err);});

