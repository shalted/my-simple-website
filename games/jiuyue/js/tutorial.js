(function(root){
'use strict';
class TutorialStorageError extends Error{constructor(message,cause){super(message);this.name='TutorialStorageError';this.cause=cause;}}
class TutorialTargetError extends Error{constructor(stepId,target){super(`教程步骤 ${stepId} 找不到目标控件：${target}`);this.name='TutorialTargetError';this.stepId=stepId;this.target=target;}}
// USER-CONFIRMED：人口 2 开局，4 经验升到 3；教学三人组依次为霜尾、追风、桂团。
const ONBOARDING_RULES=Object.freeze({initialLevel:2,levelThreeXP:4,initialCharacterId:'jiuyue',shopCharacterIds:Object.freeze(['xiaotian','xiaoyu'])});
const STEPS=Object.freeze([
 {id:'deploy-first',title:'第一位伙伴，请上阵',body:'从亮起的备战席拖起伙伴，沿箭头放进下半场的亮区。',target:'#board',source:'#bench .filled',events:['deploy']},
 {id:'purchase-second',title:'再请一位伙伴',body:'从商店请第二位伙伴加入，备战席会为新伙伴留好位置。',target:'#shop',events:['purchase']},
 {id:'deploy-second',title:'两位伙伴并肩站',body:'把亮起的新伙伴沿箭头拖进下半场，让队伍达到 2 / 2 人。',target:'#board',source:'#bench .filled',events:['deploy']},
 {id:'level-up',title:'队伍满员啦',body:'当前人口已经满了。购买经验，把人口上限提升到 3。',target:'#xp',events:['level-up']},
 {id:'purchase-third',title:'第三位伙伴到齐',body:'人口多出一个位置，再从商店请一位伙伴加入。',target:'#shop',events:['purchase']},
 {id:'deploy-third',title:'三人小队集合',body:'从亮起的备战席拖起第三位伙伴，沿箭头放进下半场。',target:'#board',source:'#bench .filled',events:['deploy']},
 {id:'synergy',title:'伙伴会点亮羁绊',body:'点一下羁绊条，看看伙伴组合带来的效果。',target:'#friendship',events:['synergy-open']},
 {id:'cheatsheet',title:'把提示收进小抄',body:'点开庭院小抄。以后想不起规则时，随时回来翻一翻。',target:'.help > summary',events:['cheatsheet-open']}
]);
const CHEATSHEET_TIPS=Object.freeze(STEPS.map(step=>Object.freeze({id:step.id,title:step.title,body:step.body})));
function successful(event,step){
 if(!event||event.ok!==true||!step.events.includes(event.type))return false;
 if(step.id==='deploy-first')return event.boardCount===1&&event.level===2;
 if(step.id==='purchase-second'||step.id==='purchase-third')return typeof event.benchUnitId==='string'&&event.benchUnitId.length>0;
 if(step.id==='deploy-second')return event.boardCount===2&&event.level===2;
 if(step.id==='level-up')return event.previousLevel===2&&event.level===3;
 if(step.id==='deploy-third')return event.boardCount===3&&event.level===3;
 if(step.id==='synergy')return typeof event.synergyName==='string'&&event.synergyName.length>0;
 if(step.id==='cheatsheet')return event.open===true;
 return true;
}
class TutorialMachine{
 constructor(options={}){
  if(typeof options.storageKey!=='string'||!options.storageKey)throw new TypeError('教程需要调用方提供 storageKey');
  this.steps=options.steps||STEPS;if(!Array.isArray(this.steps)||this.steps.length===0)throw new TypeError('教程步骤不能为空');
  const stepIds=new Set();for(const step of this.steps){if(!step?.id||stepIds.has(step.id)||!Array.isArray(step.events)||step.events.length===0||!step.target)throw new TypeError('教程步骤需要唯一 id、目标控件和至少一个真实事件');stepIds.add(step.id);}
  this.storage=options.storage||root.localStorage;this.storageKey=options.storageKey;this.view=options.view;
  this.onStepChange=options.onStepChange||(()=>{});this.onComplete=options.onComplete||(()=>{});this.onSkip=options.onSkip||(()=>{});this.onError=options.onError||(()=>{});this.index=-1;this.active=false;
  if(!this.storage||typeof this.storage.getItem!=='function'||typeof this.storage.setItem!=='function')throw new TypeError('教程需要可用的本地存储接口');
  if(!this.view||typeof this.view.show!=='function'||typeof this.view.hide!=='function')throw new TypeError('教程需要 view.show/view.hide');
 }
 readCompletion(){
  let value;try{value=this.storage.getItem(this.storageKey);}catch(cause){const error=new TutorialStorageError(`无法读取教程完成标记：${this.storageKey}`,cause);this.onError(error);throw error;}
  if(value===null)return null;
  try{const parsed=JSON.parse(value);if(parsed.schema!=='lion-tutorial/v1'||!['completed','skipped'].includes(parsed.status))throw new Error('结构或状态字段无效');return parsed;}catch(cause){const error=new TutorialStorageError(`教程完成标记格式无效：${this.storageKey}`,cause);this.onError(error);throw error;}
 }
 writeCompletion(status){
  try{this.storage.setItem(this.storageKey,JSON.stringify({schema:'lion-tutorial/v1',status}));}catch(cause){const error=new TutorialStorageError(`无法保存教程完成标记：${this.storageKey}`,cause);this.onError(error);throw error;}
 }
 start({replay=false}={}){
  const completion=this.readCompletion();if(completion&&!replay)return {started:false,status:completion.status};
  this.index=0;this.active=true;this.showCurrent();return {started:true,step:this.steps[0].id};
 }
 replay(){return this.start({replay:true});}
 showCurrent(){const step=this.steps[this.index];try{this.view.show(step,this.index,this.steps.length);}catch(error){this.onError(error);throw error;}this.onStepChange({step,index:this.index,total:this.steps.length});}
 handleActionResult(event){
  if(!this.active)return false;const step=this.steps[this.index];if(!successful(event,step))return false;
  if(this.index===this.steps.length-1){this.writeCompletion('completed');this.active=false;this.view.hide();this.onComplete();return true;}
  this.index+=1;this.showCurrent();return true;
 }
 skip(){if(!this.active)return false;this.writeCompletion('skipped');this.active=false;this.view.hide();this.onSkip();return true;}
 destroy(){this.active=false;this.view.hide();if(typeof this.view.destroy==='function')this.view.destroy();}
}
function mountTutorialOverlay(host,options={}){
 if(!(host instanceof root.Element))throw new TypeError('教程高亮层需要有效的挂载元素');
 const document=host.ownerDocument,node=document.createElement('section');node.className='lion-tutorial';node.hidden=true;
 node.innerHTML='<svg class="lion-tutorial__canvas" aria-hidden="true"><path class="lion-tutorial__shade" fill-rule="evenodd"></path><path class="lion-tutorial__arrow-outline"></path><path class="lion-tutorial__arrow"></path></svg><div class="lion-tutorial__spotlight" aria-hidden="true"></div><div class="lion-tutorial__spotlight lion-tutorial__source" aria-hidden="true" hidden></div><article class="lion-tutorial__card" role="dialog" aria-modal="false" aria-labelledby="lion-tutorial-title"><p class="lion-tutorial__step"></p><h2 id="lion-tutorial-title"></h2><p class="lion-tutorial__body"></p><div class="lion-tutorial__actions"><button type="button" data-tutorial-skip>跳过引导</button></div></article>';
 host.append(node);const spotlight=node.querySelector('.lion-tutorial__spotlight'),sourceSpot=node.querySelector('.lion-tutorial__source'),shade=node.querySelector('.lion-tutorial__shade'),arrow=node.querySelector('.lion-tutorial__arrow'),outline=node.querySelector('.lion-tutorial__arrow-outline'),card=node.querySelector('.lion-tutorial__card'),skip=node.querySelector('[data-tutorial-skip]');let skipHandler=()=>{},currentStep=null,positionFrame=null;
 skip.addEventListener('click',()=>skipHandler());
 function resolve(selector){const target=typeof selector==='function'?selector(document):document.querySelector(selector);if(!target)throw new TutorialTargetError(currentStep.id,selector);return target;}
 function position(){
  positionFrame=null;if(node.hidden)return;
  const target=resolve(currentStep.target),gap=8;
  let rect=target.getBoundingClientRect(),source=null,end=null;
  if(currentStep.source){
   source=resolve(currentStep.source).getBoundingClientRect();
   if(typeof options.deploymentGeometry!=='function')throw new TypeError('上阵引导需要真实棋盘几何');
   const geometry=options.deploymentGeometry(rect,source);rect=geometry.rect;end=geometry.end;
  }
  const hole=r=>`M ${r.left-gap} ${r.top-gap} H ${r.right+gap} V ${r.bottom+gap} H ${r.left-gap} Z`;
  const focus=(element,r)=>{element.style.left=`${r.left-gap}px`;element.style.top=`${r.top-gap}px`;element.style.width=`${r.width+gap*2}px`;element.style.height=`${r.height+gap*2}px`;};
  // 一个遮罩挖出两个透明窗口，避免两层巨型阴影把对方重新遮暗。
  shade.setAttribute('d',`M 0 0 H ${root.innerWidth} V ${root.innerHeight} H 0 Z `+hole(rect)+(source?' '+hole(source):''));
  focus(spotlight,rect);sourceSpot.hidden=!source;
  let arrowPath='';
  if(source){
   focus(sourceSpot,source);
   const start={x:(source.left+source.right)/2,y:source.top-gap},dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);
   if(!length)throw new Error('上阵引导起点与落点重合');
   const ux=dx/length,uy=dy/length,head=gap*2;
   arrowPath=`M ${start.x} ${start.y} L ${end.x} ${end.y} M ${end.x-ux*head-uy*gap} ${end.y-uy*head+ux*gap} L ${end.x} ${end.y} L ${end.x-ux*head+uy*gap} ${end.y-uy*head-ux*gap}`;
  }
  arrow.setAttribute('d',arrowPath);outline.setAttribute('d',arrowPath);
  // 上阵提示优先放在亮区上方，给备战席、拖拽路线和落点让出空间。
  const below=!source&&rect.bottom+card.offsetHeight+24<root.innerHeight;
  card.style.left=`${Math.max(12,Math.min(root.innerWidth-card.offsetWidth-12,source?rect.right-card.offsetWidth:rect.left))}px`;
  card.style.top=below?`${rect.bottom+16}px`:`${Math.max(12,rect.top-card.offsetHeight-16)}px`;
 }
 function show(step,index,total){
  currentStep=step;resolve(step.target);if(step.source)resolve(step.source);
  node.querySelector('.lion-tutorial__step').textContent=`第 ${index+1} 步 · 共 ${total} 步`;node.querySelector('h2').textContent=step.title;node.querySelector('.lion-tutorial__body').textContent=step.body;node.hidden=false;
  if(positionFrame!==null)root.cancelAnimationFrame(positionFrame);positionFrame=root.requestAnimationFrame(position);
 }
 const reposition=()=>{if(!node.hidden)position();};
 root.addEventListener('resize',reposition);
 root.addEventListener('scroll',reposition,true);
 function hide(){node.hidden=true;if(positionFrame!==null){root.cancelAnimationFrame(positionFrame);positionFrame=null;}}
 return {show,hide,setSkipHandler(handler){skipHandler=handler;},destroy(){hide();root.removeEventListener('resize',reposition);root.removeEventListener('scroll',reposition,true);node.remove();}};
}
function createTutorial(host,options={}){
 const view=mountTutorialOverlay(host,{deploymentGeometry:options.deploymentGeometry});const machine=new TutorialMachine({...options,view});view.setSkipHandler(()=>machine.skip());return machine;
}
root.LionTutorial={ONBOARDING_RULES,STEPS,CHEATSHEET_TIPS,TutorialMachine,TutorialStorageError,TutorialTargetError,mountTutorialOverlay,createTutorial};
})(typeof globalThis!=='undefined'?globalThis:this);
