(function(root){
'use strict';
// 大厅、漫画与引导只管理页面生命周期，战斗与奖励仍由 Campaign 结算。
function create({campaign,assets,render,onError}){
 const app=document.querySelector('.app'),game=campaign.game;
 let story=null,tutorial=null,started=false,endingShown=false,previous=null;
 const host=document.createElement('div');host.hidden=true;document.body.append(host);
 const lobby=LionLobby.createLobby({characters:LionCharacters.CHARACTERS,enemies:LionEnemies.ENEMIES,skills:LionSkills.SKILLS,synergies:LionSynergies.SYNERGIES,assets,onStart(){if(started){lobby.hide();app.hidden=false;render();}else begin(false);},onReplayTutorial(){begin(true);}});
 lobby.mount(document.body);
 const home=document.getElementById('home');
 home.addEventListener('click',()=>{if(game.phase==='battle')game.paused=true;if(tutorial?.active)tutorial.skip();app.hidden=true;lobby.element.querySelector('.st-lobby__start').textContent='继续冒险';lobby.show();});
 const help=document.querySelector('.help');
 const reference=document.getElementById('tutorialReference');
 for(const tip of LionTutorial.CHEATSHEET_TIPS){const p=document.createElement('p'),strong=document.createElement('strong');strong.textContent=tip.title+'：';p.append(strong,document.createTextNode(tip.body));reference.append(p);}
 help.addEventListener('toggle',()=>{if(help.open)event({type:'cheatsheet-open',ok:true,open:true});});
 function play(data,done){
  app.hidden=true;lobby.hide();host.hidden=false;
  story=LionStoryPlayer.create(host,{story:data,assetBase:'',onComplete(){story.destroy();story=null;host.hidden=true;done();}});
 }
 function snapshot(){return {level:campaign.level,board:campaign.board.length,ids:new Set(campaign.owned.map(u=>u.id))};}
 function begin(replay){
  // 用户确认：通关后再来一局直接布阵；首次冒险和主动重温引导仍播放开场。
  const skipOpening=!replay&&campaign.status==='clear';
  tutorial?.destroy();tutorial=null;endingShown=false;campaign.reset();campaign.prepareOpening();started=true;previous=snapshot();
  const enterBoard=()=>{
   lobby.hide();app.hidden=false;render();
   tutorial=LionTutorial.createTutorial(document.body,{storageKey:'lion-tutorial/v1',deploymentGeometry:(board,source)=>deploymentGeometry(game,board,source),onError,onStepChange(){sync();},onComplete(){render();},onSkip(){render();}});
   tutorial.start({replay});sync();document.getElementById('board').focus();
  };
  if(skipOpening)enterBoard();else play(LionStoryData.opening,enterBoard);
 }
 function event(value){if(tutorial?.active){tutorial.handleActionResult(value);render();}}
 function afterAction(result){
  const now=snapshot();
  if(result.ok&&previous&&tutorial?.active){
   const fresh=campaign.owned.find(u=>!previous.ids.has(u.id)&&u.slot!==null);
   if(fresh)event({type:'purchase',ok:true,benchUnitId:fresh.id});
   else if(now.level!==previous.level)event({type:'level-up',ok:true,previousLevel:previous.level,level:now.level});
   else if(now.board>previous.board)event({type:'deploy',ok:true,boardCount:now.board,level:now.level});
  }
  previous=now;
 }
 // 按已确认教学顺序开放控件，避免提前花完金币或刷新教学伙伴。
 function sync(){
  if(!tutorial?.active)return;
  const step=tutorial.steps[tutorial.index].id;
  for(const id of ['start','refresh','sell','restart'])document.getElementById(id).disabled=true;
  document.getElementById('xp').disabled=step!=='level-up';
  const expected=step==='purchase-second'?LionTutorial.ONBOARDING_RULES.shopCharacterIds[0]:step==='purchase-third'?LionTutorial.ONBOARDING_RULES.shopCharacterIds[1]:null;
  for(const button of document.querySelectorAll('#shop [data-buy]'))button.disabled=campaign.shop[Number(button.dataset.buy)]!==expected||expected===null;
 }
 function finish(){if(campaign.status==='clear'&&campaign.reward?.win&&!endingShown){endingShown=true;play(LionStoryData.ending,()=>{app.hidden=false;render();});}}
 return {begin,event,afterAction,sync,finish,lobby,get tutorial(){return tutorial;}};
}
// 亮区和箭头完全取自棋盘格、队伍合法区域和现有占位，不从截图估计坐标。
function deploymentGeometry(game,board,source){
 const {COLS,ROWS}=LionChess,{hex,point,W,H}=ChessRenderer,vertices=[],free=[];
 const project=p=>({x:board.left+p.x*board.width/W,y:board.top+p.y*board.height/H});
 for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)if(game.validCell(c,r,'blue')){
  vertices.push(...hex(c,r).map(project));
  if(!game.units.some(u=>u.c===c&&u.r===r))free.push(project(point(c,r)));
 }
 if(!vertices.length||!free.length)throw new Error('上阵引导找不到己方可用棋格');
 const left=Math.min(...vertices.map(p=>p.x)),right=Math.max(...vertices.map(p=>p.x)),top=Math.min(...vertices.map(p=>p.y)),bottom=Math.max(...vertices.map(p=>p.y));
 const origin={x:(source.left+source.right)/2,y:source.top};
 free.sort((a,b)=>Math.hypot(a.x-origin.x,a.y-origin.y)-Math.hypot(b.x-origin.x,b.y-origin.y));
 return {rect:{left,right,top,bottom,width:right-left,height:bottom-top},end:free[0]};
}
root.LionGameFlow={create,deploymentGeometry};
})(typeof window!=='undefined'?window:globalThis);
