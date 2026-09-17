(function(root){
  'use strict';

  const STORY_COPY={
    jiuyue:{chapter:'桂影领路人',story:'尾尖扫过桂影，散落在庭院里的月光便有了方向。她总把最难走的那段路，轻轻说成一次赏月。'},
    xiaotian:{chapter:'风里的先行者',story:'他听得见瓦片上最轻的脚步，也总是第一个冲向饼香消失的地方。快一点，再快一点，团圆就不会迟到。'},
    xiaoyu:{chapter:'月桂守护者',story:'药杵敲响清亮的节拍，受伤的伙伴便重新站稳。她相信照顾好身边的人，也是一种勇敢。'},
    aolie:{chapter:'潮声同路人',story:'一泓清水绕过石桥，也托住匆忙赶路的脚步。他话不多，却总能让同伴在最热闹的时刻安心。'},
    nezha:{chapter:'赤焰开路者',story:'轮下的火光划破夜色，像一笔写得痛快的朱砂。越是难走的路，他越要抢先替大家试一试。'},
    yangjian:{chapter:'静夜守望者',story:'他站在灯影照不到的高处，把庭院的每一次异动看得分明。沉稳不是慢，而是从不放过真正的目标。'},
    guard:{chapter:'门前的拦路者',story:'圆盾守着饼箱，脚步把青砖踩得咚咚作响。想从这里过去，得先接住他气势十足的一推。'},
    carrier:{chapter:'巷中的运饼客',story:'背篓装得满满当当，逃跑也不肯落下一块月饼。被追急了，他会让手里的点心贴着地面飞起来。'},
    thrower:{chapter:'屋脊上的投手',story:'他躲在灯笼照不到的屋檐边，把月饼当作小小的圆月抛向远处，准头好得有些可惜。'},
    nian:{chapter:'吞月的来客',story:'巨大的影子越过院墙，把满庭饼香当作自己的邀请函。它抱紧战利品，等着一场真正热闹的较量。'}
  };
  const VIEWS=new Set(['home','gallery','guide']);

  function assertRecord(value,label){
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('大厅缺少'+label+'配置');
  }
  function element(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  function button(className,text,label){
    const node=element('button',className,text);
    node.type='button';
    if(label)node.setAttribute('aria-label',label);
    return node;
  }
  function append(parent,...children){children.filter(Boolean).forEach(child=>parent.append(child));return parent;}

  function createLobby(options){
    if(typeof document==='undefined')throw new Error('大厅需要浏览器 DOM 环境');
    assertRecord(options,'初始化');
    const {characters,enemies,skills,synergies,assets,onStart,onReplayTutorial}=options;
    assertRecord(characters,'伙伴');assertRecord(enemies,'敌方');assertRecord(skills,'技能');assertRecord(assets,'素材');
    if(Object.keys(characters).length===0)throw new Error('大厅伙伴配置不能为空');
    if(!Array.isArray(synergies))throw new Error('大厅缺少羁绊配置');
    if(typeof onStart!=='function')throw new Error('大厅缺少 onStart 回调');
    if(typeof onReplayTutorial!=='function')throw new Error('大厅缺少 onReplayTutorial 回调');

    const entries=[
      ...Object.entries(characters).map(([id,definition])=>({id,definition,group:'伙伴'})),
      ...Object.entries(enemies).map(([id,definition])=>({id,definition,group:id==='nian'?'年兽':'小妖'}))
    ];
    for(const entry of entries){
      const {id,definition}=entry,copy=STORY_COPY[id];
      if(!copy)throw new Error('大厅缺少绘卷文案：'+id);
      if(!definition||typeof definition.name!=='string'||typeof definition.role!=='string')throw new Error('大厅角色配置不完整：'+id);
      const key=definition.assets&&definition.assets.idle;
      if(!key||typeof assets[key]!=='string')throw new Error('大厅缺少立绘素材：'+id+'/idle');
      if(entry.group==='伙伴'&&!skills[id])throw new Error('大厅缺少技能配置：'+id);
    }

    let mounted=false,destroyed=false,currentView='home',selectedIndex=0,lastFocus=null;
    const shell=element('section','st-lobby');
    shell.hidden=true;shell.setAttribute('aria-label','狮团团·月饼夺回战主界面');shell.tabIndex=-1;
    shell.innerHTML='<div class="st-lobby__moon" aria-hidden="true"><i></i><i></i><i></i></div><div class="st-lobby__mist" aria-hidden="true"></div>';

    const home=element('div','st-lobby__view st-lobby__home');home.dataset.view='home';
    const brand=append(element('div','st-lobby__brand'),element('p','st-lobby__eyebrow','狮团团的中秋绘本'),element('h1','st-lobby__title','狮团团·月饼夺回战'),element('p','st-lobby__subtitle','月亮升起来了，装满团圆心意的月饼却不见了。翻开故事，和伙伴们一起把它们带回灯火下。'));
    const heroStage=element('div','st-lobby__hero-stage');
    const heroSprite=element('div','st-lobby__hero-sprite');heroSprite.setAttribute('aria-hidden','true');
    const seal=append(element('div','st-lobby__seal'),element('span','', '中秋限定'),element('b','', '团圆出发'));
    append(heroStage,element('span','st-lobby__lantern st-lobby__lantern--left','团'),heroSprite,element('span','st-lobby__lantern st-lobby__lantern--right','圆'),seal);
    const primary=button('st-lobby__start','开始冒险');
    const galleryButton=button('st-lobby__soft-button','翻开团圆绘卷');
    const guideButton=button('st-lobby__soft-button','看看怎么玩');
    const actions=append(element('div','st-lobby__home-actions'),primary,append(element('div','st-lobby__minor-actions'),galleryButton,guideButton));
    append(home,brand,heroStage,actions,element('p','st-lobby__footnote','一盏灯，一轮月，一群愿意并肩赶路的朋友。'));

    const gallery=element('div','st-lobby__view st-lobby__book');gallery.dataset.view='gallery';gallery.hidden=true;
    const galleryHeader=append(element('header','st-lobby__book-header'),append(element('div',''),element('p','st-lobby__eyebrow','全员公开 · 无需解锁'),element('h2','','团圆绘卷')),button('st-lobby__close','×','合上团圆绘卷'));
    const tabs=element('div','st-lobby__filters');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','绘卷分类');
    for(const group of ['伙伴','年兽与小妖']){
      const tab=button('st-lobby__filter',group);tab.dataset.group=group;tab.setAttribute('role','tab');tabs.append(tab);
    }
    const cards=element('div','st-lobby__cards');cards.setAttribute('aria-label','绘卷角色列表');
    const spread=element('article','st-lobby__spread');
    const portrait=element('div','st-lobby__portrait');
    const sprite=element('div','st-lobby__sprite');sprite.setAttribute('role','img');
    append(portrait,element('span','st-lobby__portrait-moon',''),sprite);
    const details=element('div','st-lobby__details');
    append(spread,portrait,details);append(gallery,galleryHeader,tabs,cards,spread);

    const guide=element('div','st-lobby__view st-lobby__guide');guide.dataset.view='guide';guide.hidden=true;
    const guideClose=button('st-lobby__close','×','合上玩法说明');
    const guideGrid=element('div','st-lobby__guide-grid');
    const chapters=[
      ['壹','挑选伙伴','每位伙伴都有自己的定位、技能与羁绊。先从喜欢的角色开始，再慢慢补齐队伍。'],
      ['贰','摆好阵形','把伙伴放上棋盘。前排守住路口，后排留出施展招式的空间。'],
      ['叁','见招拆招','战斗会自动展开。观察对手与伤害记录，在下一回合调整站位、伙伴与装备。']
    ];
    for(const [number,title,copy] of chapters)append(guideGrid,append(element('article','st-lobby__guide-card'),element('span','st-lobby__chapter-number',number),element('h3','',title),element('p','',copy)));
    const replay=button('st-lobby__replay','重温新手引导');
    append(guide,append(element('header','st-lobby__book-header'),append(element('div',''),element('p','st-lobby__eyebrow','三页读懂冒险'),element('h2','','灯下小课堂')),guideClose),guideGrid,append(element('div','st-lobby__tip'),element('b','','小提示'),element('p','','没有唯一正确的阵容。每次换位与组合，都会写出不一样的团圆故事。'),replay));
    append(shell,home,gallery,guide);

    const viewNodes={home,gallery,guide};
    // 图鉴使用现有站姿图集的首帧作静态立绘，与卡片缩略图一致，不再启动动作计时器。
    function setSprite(node,entry){
      const source=assets[entry.definition.assets.idle];
      node.style.backgroundImage='url("'+source+'")';
      node.setAttribute('aria-label',entry.definition.name+'立绘');
    }
    function renderCards(group){
      cards.replaceChildren();
      entries.forEach((entry,index)=>{
        const visible=group==='伙伴'?entry.group==='伙伴':entry.group!=='伙伴';
        if(!visible)return;
        const card=button('st-lobby__card','');card.dataset.index=String(index);card.setAttribute('aria-label','查看'+entry.definition.name);
        const thumb=element('span','st-lobby__card-art');thumb.style.backgroundImage='url("'+assets[entry.definition.assets.idle]+'")';
        append(card,thumb,append(element('span','st-lobby__card-copy'),element('b','',entry.definition.name),element('small','',entry.group+' · '+entry.definition.role)));
        cards.append(card);
      });
    }
    function bondText(entry){
      if(entry.group!=='伙伴')return entry.group==='年兽'?'月饼争夺战的最终来客':'与年兽一同闯入庭院的运饼队';
      const related=synergies.filter(item=>Array.isArray(item.members)&&item.members.includes(entry.id));
      if(!related.length)return '暂无羁绊';
      return related.map(item=>item.name+' · '+item.members.map(id=>{
        const definition=characters[id];
        if(!definition)throw new Error('大厅羁绊引用未知伙伴：'+id);
        return definition.name;
      }).join(' ＋ ')).join('\n');
    }
    function selectEntry(index,focusCard){
      selectedIndex=index;const entry=entries[index],copy=STORY_COPY[entry.id];
      details.replaceChildren();
      const skill=entry.group==='伙伴'?skills[entry.id]:null;
      append(details,element('p','st-lobby__chapter',copy.chapter),element('h3','',entry.definition.name),element('p','st-lobby__role',entry.group+' · '+entry.definition.role),element('p','st-lobby__story',copy.story),append(element('section','st-lobby__ink-box'),element('span','','定位'),element('b','',entry.definition.role)),append(element('section','st-lobby__ink-box'),element('span','',entry.group==='伙伴'?'技能':'战斗方式'),element('b','',skill?skill.name:entry.definition.role),element('p','',skill?skill.description:copy.story)),append(element('section','st-lobby__ink-box st-lobby__ink-box--bond'),element('span','','羁绊'),element('p','',bondText(entry))));
      for(const node of cards.children){const active=Number(node.dataset.index)===index;node.classList.toggle('is-active',active);node.setAttribute('aria-current',String(active));if(active&&focusCard)node.focus();}
      setSprite(sprite,entry);
    }
    function setGroup(group){
      const normalized=group==='伙伴'?'伙伴':'年兽与小妖';
      for(const tab of tabs.children){const active=tab.dataset.group===normalized;tab.classList.toggle('is-active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
      renderCards(normalized);
      const first=entries.findIndex(entry=>normalized==='伙伴'?entry.group==='伙伴':entry.group!=='伙伴');
      selectEntry(first,false);
    }
    function setView(view,focus=true){
      if(!VIEWS.has(view))throw new Error('未知大厅页面：'+view);
      currentView=view;
      for(const [name,node] of Object.entries(viewNodes))node.hidden=name!==view;
      shell.dataset.view=view;
      if(view==='gallery')setGroup('伙伴');
      if(focus){const target=view==='home'?primary:viewNodes[view].querySelector('button');target&&target.focus();}
    }
    function show(view='home'){
      if(destroyed)throw new Error('大厅已经销毁');
      shell.hidden=false;shell.setAttribute('aria-hidden','false');setView(view,false);shell.focus();
    }
    function hide(){if(destroyed)return;shell.hidden=true;shell.setAttribute('aria-hidden','true');}
    function mount(target){
      if(destroyed)throw new Error('大厅已经销毁');
      const host=typeof target==='string'?document.querySelector(target):target;
      if(!host||typeof host.append!=='function')throw new Error('大厅挂载目标无效');
      if(!mounted){host.append(shell);mounted=true;}show();return api;
    }
    function destroy(){if(destroyed)return;shell.remove();mounted=false;destroyed=true;}

    primary.addEventListener('click',()=>onStart());
    galleryButton.addEventListener('click',()=>{lastFocus=galleryButton;setView('gallery');});
    guideButton.addEventListener('click',()=>{lastFocus=guideButton;setView('guide');});
    galleryHeader.querySelector('.st-lobby__close').addEventListener('click',()=>{setView('home');lastFocus&&lastFocus.focus();});
    guideClose.addEventListener('click',()=>{setView('home');lastFocus&&lastFocus.focus();});
    replay.addEventListener('click',()=>onReplayTutorial());
    tabs.addEventListener('click',event=>{const tab=event.target.closest('[data-group]');if(tab)setGroup(tab.dataset.group);});
    cards.addEventListener('click',event=>{const card=event.target.closest('[data-index]');if(card)selectEntry(Number(card.dataset.index),false);});
    shell.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&currentView!=='home'){event.preventDefault();setView('home');return;}
      if(currentView==='gallery'&&(event.key==='ArrowLeft'||event.key==='ArrowRight')&&event.target.closest('.st-lobby__cards')){
        const visible=[...cards.children],at=visible.findIndex(node=>Number(node.dataset.index)===selectedIndex),direction=event.key==='ArrowRight'?1:-1;
        const next=visible[(at+direction+visible.length)%visible.length];event.preventDefault();selectEntry(Number(next.dataset.index),true);
      }
    });

    const heroEntry=entries[0];heroSprite.style.backgroundImage='url("'+assets[heroEntry.definition.assets.idle]+'")';
    const api={element:shell,mount,show,hide,destroy,setView,selectEntry(id){const index=entries.findIndex(entry=>entry.id===id);if(index<0)throw new Error('大厅没有此绘卷角色：'+id);setView('gallery',false);setGroup(entries[index].group==='伙伴'?'伙伴':'年兽与小妖');selectEntry(index,false);},getState(){return{mounted,hidden:shell.hidden,view:currentView,selectedId:entries[selectedIndex].id,action:'idle'};}};
    return api;
  }

  root.LionLobby={createLobby};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.LionLobby;
})(typeof window!=='undefined'?window:globalThis);
