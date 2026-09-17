import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadGameSources} from './jiuyue-sources.mjs';

function fixture(){
 const nodes=new Map(),node=key=>{if(!nodes.has(key))nodes.set(key,{hidden:true,disabled:false,children:[],events:{},textContent:'',append(...items){this.children.push(...items);},addEventListener(type,fn){this.events[type]=fn;},focus(){},querySelector:selector=>node(selector)});return nodes.get(key);};
 const storage=new Map(),stories=[];
 const document={body:node('body'),createElement:()=>node(Symbol()),createTextNode:text=>text,querySelector:node,getElementById:node,querySelectorAll:()=>[]};
 const scope=vm.createContext({document,localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}});
 for(const script of loadGameSources().scripts)if(script.src!=='./js/ui.js')vm.runInContext(script.code,scope);
 let lobbyOptions,flow;
 scope.LionLobby.createLobby=options=>{lobbyOptions=options;return {element:node('lobby'),mount(){},hide(){node('lobby').hidden=true;},show(){node('lobby').hidden=false;}};};
 scope.LionStoryPlayer={create(host,options){stories.push(options);return {destroy(){}};}};
 scope.LionTutorial.createTutorial=(_host,options)=>new scope.LionTutorial.TutorialMachine({...options,view:{show(){},hide(){}}});
 const campaign=new scope.LionCampaign(()=>.5,scope.LionTutorial.ONBOARDING_RULES);
 flow=scope.LionGameFlow.create({campaign,assets:{},render(){flow?.sync();},onError:error=>{throw error;}});
 return {scope,campaign,flow,node,stories,storage,start:()=>lobbyOptions.onStart(),replay:()=>lobbyOptions.onReplayTutorial(),finishStory:()=>stories.at(-1).onComplete()};
}
test('大厅开始经开场漫画进入批准的空棋盘开局，不增加经济奖励',()=>{
 const f=fixture();f.start();assert.equal(f.stories[0].story.id,'opening');assert.equal(f.node('.app').hidden,true);
 assert.equal(f.campaign.level,2);assert.equal(f.campaign.board.length,0);assert.equal(f.campaign.owned.length,1);assert.equal(f.campaign.owned[0].characterId,'jiuyue');assert.equal(f.campaign.gold,10);assert.equal(f.campaign.nextXP,4);
 f.finishStory();assert.equal(f.node('.app').hidden,false);assert.equal(f.flow.tutorial.index,0);assert.equal(f.node('start').disabled,true);
});
test('真实 Campaign 上阵购买升级按八步推进，完成记录用于下次进入',()=>{
 const f=fixture(),c=f.campaign;f.start();f.finishStory();
 const action=r=>{assert.equal(r.ok,true);f.flow.afterAction(r);};
 action(c.place('blue1',3,7));assert.equal(f.flow.tutorial.index,1);
 action(c.buy(0));assert.equal(f.flow.tutorial.index,2);
 action(c.place('blue2',2,5));assert.equal(f.flow.tutorial.index,3);
 action(c.buyXP());assert.equal(c.level,3);assert.equal(f.flow.tutorial.index,4);
 action(c.buy(1));action(c.place('blue3',4,5));assert.equal(f.flow.tutorial.index,6);
 f.flow.event({type:'synergy-open',ok:true,synergyName:c.game.synergies.find(s=>s.active).name});
 f.flow.event({type:'cheatsheet-open',ok:true,open:true});assert.equal(f.flow.tutorial.active,false);assert.equal(c.gold,2);assert.equal(c.board.length,3);
 f.flow.begin(false);f.finishStory();assert.equal(f.flow.tutorial.active,false);assert.equal(c.board.length,0);
 f.replay();f.finishStory();assert.equal(f.flow.tutorial.active,true);
});
test('返回大厅保留阵容资源并暂停战斗，继续不重复开场或发奖励',()=>{
 const f=fixture();f.start();f.finishStory();f.flow.tutorial.skip();f.campaign.place('blue1',3,7);f.campaign.start();
 f.node('home').events.click();assert.equal(f.campaign.game.paused,true);assert.equal(f.node('.app').hidden,true);
 f.start();assert.equal(f.node('.app').hidden,false);assert.equal(f.stories.length,1);assert.equal(f.campaign.gold,10);assert.equal(f.campaign.board.length,1);
});
test('结局只响应实际通关胜利，每局一次；失败重试绝不播放团圆结局',()=>{
 const f=fixture();f.start();f.finishStory();f.flow.tutorial.skip();
 f.campaign.status='retry';f.campaign.reward={win:false};f.flow.finish();assert.equal(f.stories.length,1);
 f.campaign.status='clear';f.campaign.reward={win:true};f.flow.finish();assert.equal(f.stories.at(-1).story.id,'ending');assert.equal(f.node('.app').hidden,true);
 f.flow.finish();assert.equal(f.stories.length,2);f.finishStory();assert.equal(f.node('.app').hidden,false);
});
test('上阵亮区取自真实己方格，箭头避开占位，随画布缩放平移',()=>{
 const f=fixture(),{ChessRenderer:R,LionGameFlow:F,LionChess:C}=f.scope;
 f.start();const game=f.campaign.game,board={left:0,top:0,width:R.W,height:R.H},source={left:0,right:100,top:R.H};
 const first=F.deploymentGeometry(game,board,source),renderer=new R.Renderer({getContext(){return {}; }},{});
 const cell=renderer.cellAt(first.end.x,first.end.y);assert.ok(game.validCell(cell.c,cell.r,'blue'));
 assert.equal(f.campaign.place('blue1',cell.c,cell.r).ok,true);
 const next=F.deploymentGeometry(game,board,source);assert.notDeepEqual(next.end,first.end);
 for(let r=0;r<C.ROWS;r++)for(let c=0;c<C.COLS;c++)if(game.validCell(c,r,'blue'))for(const p of R.hex(c,r)){
  assert.ok(p.x>=next.rect.left&&p.x<=next.rect.right);assert.ok(p.y>=next.rect.top&&p.y<=next.rect.bottom);
 }
 const scaled=F.deploymentGeometry(game,{left:100,top:50,width:R.W/2,height:R.H/2},{left:100,right:150,top:R.H/2+50});
 assert.equal(scaled.end.x,next.end.x/2+100);assert.equal(scaled.end.y,next.end.y/2+50);
 // 平移后的边界相减会产生浮点舍入误差，按机器精度验证缩放关系。
 const expectedWidth=next.rect.width/2;
 assert.ok(Math.abs(scaled.rect.width-expectedWidth)<=Number.EPSILON*Math.max(scaled.rect.width,expectedWidth));
});
test('通关后的再来一局跳过开场，重置资源与结局标记，主动重温仍可播放',()=>{
 const f=fixture();f.start();f.finishStory();f.flow.tutorial.skip();
 f.campaign.round=10;f.campaign.status='clear';f.campaign.reward={win:true};
 f.flow.finish();f.finishStory();assert.equal(f.stories.length,2);
 f.flow.begin(false);
 assert.equal(f.stories.length,2);assert.equal(f.node('.app').hidden,false);
 assert.equal(f.campaign.round,1);assert.equal(f.campaign.status,'playing');assert.equal(f.campaign.reward,null);
 assert.equal(f.campaign.gold,10);assert.equal(f.campaign.hp,20);assert.equal(f.campaign.board.length,0);
 assert.equal(f.flow.tutorial.active,false);
 f.campaign.status='clear';f.campaign.reward={win:true};f.flow.finish();
 assert.equal(f.stories.length,3);assert.equal(f.stories.at(-1).story.id,'ending');f.finishStory();
 f.replay();assert.equal(f.stories.at(-1).story.id,'opening');f.finishStory();assert.equal(f.flow.tutorial.active,true);
 const ui=loadGameSources().scripts.find(script=>script.src==='./js/ui.js').code;
 assert.match(ui,/\$\('next'\)\.onclick=.*flow\.begin\(false\)/);
});
