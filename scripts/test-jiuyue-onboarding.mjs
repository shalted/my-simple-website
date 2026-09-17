import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadClassicScript(file,extras={}){
 const context=vm.createContext({...extras});
 vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
 return context;
}
function memoryStorage(initial=null){
 let value=initial;
 return {getItem(){return value;},setItem(_key,next){value=next;},value(){return value;}};
}
test('外置清单完整覆盖 ASSETS，生成文件逐字节与原值一致且均低于单文件限制',()=>{
 const source=fs.readFileSync('games/jiuyue/js/assets.js','utf8'),match=source.match(/^const ASSETS=(\{[^\n]*\});\s*$/);assert.ok(match);
 const assets=JSON.parse(match[1]),manifest=JSON.parse(fs.readFileSync('games/jiuyue/resources/manifest.json','utf8'));
 assert.equal(manifest.schema,'lion-resource-manifest/v1');assert.deepEqual(manifest.entries.map(entry=>entry.key),Object.keys(assets));
 let total=0;for(const entry of manifest.entries){
  const encoded=assets[entry.key].slice(assets[entry.key].indexOf(',')+1),expected=Buffer.from(encoded,'base64'),actual=fs.readFileSync(`games/jiuyue/${entry.url.replace(/^\.\//,'')}`);
  assert.deepEqual(actual,expected,entry.key);assert.equal(entry.bytes,actual.length);assert.equal(entry.sha256,crypto.createHash('sha256').update(actual).digest('hex'));assert.ok(actual.length<25*1024*1024,entry.key);total+=actual.length;
 }
 assert.equal(manifest.totalBytes,total);
});
test('教程严格按真实成功事件推进，错误事件与失败结果都不推进',()=>{
 const context=loadClassicScript('games/jiuyue/js/tutorial.js');
 const shown=[],storage=memoryStorage(),view={show(step){shown.push(step.id);},hide(){}};
 const machine=new context.LionTutorial.TutorialMachine({storageKey:'test-tutorial',storage,view});
 assert.equal(machine.start().step,'deploy-first');
 assert.equal(machine.handleActionResult({type:'purchase',ok:true,benchUnitId:'blue2'}),false);
 assert.equal(machine.handleActionResult({type:'deploy',ok:true,boardCount:1,level:3}),false);
 assert.equal(machine.handleActionResult({type:'deploy',ok:true,boardCount:1,level:2}),true);
 assert.equal(machine.handleActionResult({type:'purchase',ok:true}),false);
 assert.equal(machine.handleActionResult({type:'purchase',ok:true,benchUnitId:'blue2'}),true);
 assert.equal(machine.handleActionResult({type:'deploy',ok:true,boardCount:2,level:2}),true);
 assert.equal(machine.handleActionResult({type:'level-up',ok:true,previousLevel:2,level:3}),true);
 assert.equal(machine.handleActionResult({type:'purchase',ok:true,benchUnitId:'blue3'}),true);
 assert.equal(machine.handleActionResult({type:'deploy',ok:true,boardCount:3,level:3}),true);
 assert.equal(machine.handleActionResult({type:'synergy-open',ok:true,synergyName:'霜灯逐风'}),true);
 assert.equal(machine.handleActionResult({type:'cheatsheet-open',ok:true,open:true}),true);
 assert.deepEqual(shown,['deploy-first','purchase-second','deploy-second','level-up','purchase-third','deploy-third','synergy','cheatsheet']);
 assert.equal(JSON.parse(storage.value()).status,'completed');
});
test('庭院小抄完整收录每一步玩家提示',()=>{
 const context=loadClassicScript('games/jiuyue/js/tutorial.js');
 assert.equal(context.LionTutorial.CHEATSHEET_TIPS.length,context.LionTutorial.STEPS.length);
 assert.deepEqual([...context.LionTutorial.CHEATSHEET_TIPS].map(entry=>entry.id),[...context.LionTutorial.STEPS].map(entry=>entry.id));
 for(const tip of context.LionTutorial.CHEATSHEET_TIPS){assert.ok(tip.title);assert.ok(tip.body);}
});
test('教学人口、经验与三人组使用用户确认值',()=>{
 const context=loadClassicScript('games/jiuyue/js/tutorial.js'),rules=context.LionTutorial.ONBOARDING_RULES;
 assert.equal(rules.initialLevel,2);assert.equal(rules.levelThreeXP,4);assert.equal(rules.initialCharacterId,'jiuyue');
 assert.deepEqual([...rules.shopCharacterIds],['xiaotian','xiaoyu']);
});
test('三个上阵步骤都给出备战席起点，双高亮使用单一挖孔遮罩',()=>{
 const {STEPS}=loadClassicScript('games/jiuyue/js/tutorial.js').LionTutorial;
 const deploy=STEPS.filter(step=>step.events.includes('deploy'));
 assert.equal(deploy.length,3);for(const step of deploy){assert.equal(step.source,'#bench .filled');assert.equal(step.target,'#board');}
 const source=fs.readFileSync('games/jiuyue/js/tutorial.js','utf8'),css=fs.readFileSync('games/jiuyue/onboarding.css','utf8');
 assert.match(source,/fill-rule="evenodd"/);assert.match(source,/cancelAnimationFrame/);assert.doesNotMatch(css,/9999px/);
 assert.match(source,/上阵引导需要真实棋盘几何/);
});
test('小抄突出操作与费用，完整教学与进阶数值收在折叠目录',()=>{
 const html=fs.readFileSync('games/jiuyue/index.html','utf8'),flow=fs.readFileSync('games/jiuyue/js/game-flow.js','utf8');
 for(const title of ['先上阵，再开战','常用操作','变强记这三件事','击败年兽，夺回月饼'])assert.ok(html.includes(title));
 assert.match(html,/<strong>4 金币 → 4 经验<\/strong>/);
 assert.match(html,/<details class="help-reference" id="tutorialReference">/);
 assert.match(flow,/reference\.append\(p\)/);assert.doesNotMatch(flow,/help\.append\(p\)/);
});
test('教程支持跳过和重看，存储异常保持可见',()=>{
 const context=loadClassicScript('games/jiuyue/js/tutorial.js'),view={show(){},hide(){}};
 const storage=memoryStorage(),machine=new context.LionTutorial.TutorialMachine({storageKey:'test-tutorial',storage,view});
 machine.start();assert.equal(machine.skip(),true);assert.equal(machine.start().status,'skipped');assert.equal(machine.replay().started,true);
 const failure=new context.LionTutorial.TutorialMachine({storageKey:'broken',storage:{getItem(){throw new Error('blocked');},setItem(){}},view});
 assert.throws(()=>failure.start(),/无法读取教程完成标记/);
});
test('资源加载按收到的真实字节报告进度并校验摘要',async()=>{
 const bytes=Buffer.from('verified mooncake bytes'),sha256=crypto.createHash('sha256').update(bytes).digest('hex'),progress=[],revoked=[];
 const response={ok:true,status:200,body:{getReader(){let read=false;return {async read(){if(read)return {done:true};read=true;return {done:false,value:new Uint8Array(bytes)};}};}}};
 const context=loadClassicScript('games/jiuyue/js/resource-loader.js',{Uint8Array,Blob,console});
 const loader=context.LionResourceLoader.createResourceLoader({fetch:async()=>response,crypto:crypto.webcrypto,Blob,URL:{createObjectURL(){return 'blob:verified';},revokeObjectURL(url){revoked.push(url);}}});
 const result=await loader.load([{key:'moon',url:'./moon.png',mime:'image/png',bytes:bytes.length,sha256}],{onProgress:value=>progress.push(value.loadedBytes)});
 assert.equal(result.assets.moon,'blob:verified');assert.deepEqual(progress,[0,bytes.length,bytes.length]);result.dispose();assert.deepEqual(revoked,['blob:verified']);
});
test('资源加载失败暴露具体键和地址，不替图或重试',async()=>{
 let calls=0;const context=loadClassicScript('games/jiuyue/js/resource-loader.js',{Uint8Array,Blob,console});
 const loader=context.LionResourceLoader.createResourceLoader({fetch:async()=>{calls+=1;return {ok:false,status:404};},crypto:crypto.webcrypto,Blob,URL:{createObjectURL(){},revokeObjectURL(){}}});
 await assert.rejects(loader.load([{key:'missing',url:'./missing.png',mime:'image/png',bytes:1,sha256:'0'.repeat(64)}]),error=>error.key==='missing'&&error.url==='./missing.png'&&/404/.test(error.message));
 assert.equal(calls,1);
});
