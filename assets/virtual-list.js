(function bootstrapVirtualListLab(){
  "use strict";
  const $=selector=>document.querySelector(selector);
  const code={
    capacity:["capacity = ceil(viewport / itemStep) + 2;","for (slot = 0; slot < capacity; slot++)","    slots.Add(CreateNode(slot));"],
    first:["first = FindFirstVisible(scrollPosition);","// 固定高度可直接除；可变高度可二分","first = Clamp(first, 0, itemCount - 1);"],
    bind:["for (slot = 0; slot < slots.Count; slot++) {","    dataIndex = first + slot;","    slots[slot].SetDataIndex(dataIndex);","    RenewAsyncToken(slots[slot]);","    Bind(slots[slot], data[dataIndex]);","}"],
    jump:["target = Clamp(target, 0, maxScroll);","SetScrollPosition(target);","RefreshVisibleSlots();"],
    cancel:["slot.Token?.Cancel();","slot.Token?.Dispose();","slot.Token = NewToken();","expected = slot.DataIndex;","if (!token.Canceled && slot.DataIndex == expected)","    slot.SetAsyncContent(result);"],
    hide:["if (dataIndex >= itemCount) {","    CancelAsync(slot);","    slot.Visible = false;","    continue;","}"]
  };
  function state(overrides){return Object.assign({first:0,visible:8,normal:10000,scroll:"0 px",pool:"8 fixed slots",binds:0,cancels:0,logs:[],focus:-1,status:"READY"},overrides);}
  function step(phase,title,copy,change,why,state,codeKey,line){return{phase,title,copy,change,why,state,codeKey,line};}
  const cases={
    scroll:{
      problem:"普通列表让节点数随数据量增长；虚拟列表只保留视口附近的固定槽位。",
      mechanism:"由滚动位置求 firstVisibleIndex，再把 slot 0…7 重新绑定到连续数据。",
      boundary:"可变高度需要 offset 索引；一次刷新会重新绑定所有固定槽位。",
      cost:"节点 O(V)，固定高度定位 O(1)，可变高度定位 O(log N)，刷新 O(V)。",
      steps:[
        step("01 / CAPACITY","只创建八个节点","教学视口显示 6 行，再加 2 个缓冲槽位；10,000 条数据不会创建 10,000 个节点。","节点池从 0 变为 8。","昂贵的节点成本由可视容量 V 决定，而不是总量 N。",state({status:"8 SLOTS CREATED"}),"capacity",2),
        step("02 / FIRST INDEX","滚动位置映射到第一条数据","初始滚动位置为 0，因此 firstVisibleIndex=0。","可视窗口锁定数据 0…7。","先算窗口起点，槽位才知道这次要扮演谁。",state({binds:8,status:"WINDOW 0–7"}),"first",0),
        step("03 / SMALL SCROLL","向下滚动一行","firstVisibleIndex 从 0 变为 1；同一批节点改绑数据 1…8。","8 个节点都没有创建或销毁，只更新 dataIndex 与内容。","节点身份稳定，数据身份随窗口移动。",state({first:1,scroll:"64 px",binds:16,focus:0,status:"WINDOW 1–8"}),"bind",2),
        step("04 / NEXT PAGE","滚动到下一屏","窗口跳到数据 6…13，槽位继续复用。","首项索引变为 6，节点数仍是 8。","总数据量影响 Content 长度，不影响活跃节点数。",state({first:6,scroll:"384 px",binds:24,focus:0,status:"WINDOW 6–13"}),"bind",4),
        step("05 / FAR SCROLL","滚动到中段","窗口移动到数据 4200…4207，普通列表仍需 10,000 节点，虚拟列表仍为 8。","firstVisibleIndex=4200。","虚拟化把渲染成本限制在视口附近。",state({first:4200,scroll:"268800 px",binds:32,focus:0,status:"WINDOW 4200–4207"}),"first",2)
      ]
    },
    jump:{
      problem:"程序化跳转可能给出负索引或超过末尾的位置，直接使用会产生越界映射。",
      mechanism:"先钳制目标索引与滚动位置，再刷新固定槽位；超出 Count 的尾部槽位隐藏。",
      boundary:"最后一屏可能不足 8 条，隐藏前必须取消该槽位旧异步请求。",
      cost:"一次大跳转仍只重绑 O(V) 个槽位，但会让这些槽位的旧请求全部失效。",
      steps:[
        step("01 / START","从列表顶部开始","窗口显示教学数据 0…7。","8 个槽位完成初次绑定。","跳转前先明确当前映射，才能观察哪些槽位被复用。",state({binds:8,status:"WINDOW 0–7"}),"bind",4),
        step("02 / NEGATIVE","负索引被钳制为 0","请求 CenterOn(-30)，目标索引先钳制到合法范围。","窗口保持 0…7，没有越界。","边界保护属于滚动入口，不应让布局层接收非法索引。",state({binds:16,status:"CLAMPED TO 0"}),"jump",0),
        step("03 / FAR JUMP","跳转到接近末尾","请求远超总量的索引，钳制后滚动位置停在最大值，第一项为 9992。","八个槽位一次性改绑到 9992…9999。","Content 最大滚动位置决定最后一屏起点。",state({first:9992,scroll:"MAX",binds:24,cancels:8,focus:0,status:"WINDOW 9992–9999"}),"jump",1),
        step("04 / DATA SHRINK","数据缩短后隐藏越界槽位","教学数据缩短到 9996 条，后四个 dataIndex 已越界。","slot 4…7 取消旧请求并隐藏。","节点池容量可以不变，但可见性必须跟当前 Count 同步。",state({first:9992,visible:4,normal:9996,scroll:"MAX",binds:28,cancels:12,focus:4,status:"4 VISIBLE / 4 HIDDEN"}),"hide",2)
      ]
    },
    async:{
      problem:"节点改绑后，旧数据的图片请求可能晚到，并覆盖新数据的正确内容。",
      mechanism:"每次重绑先取消旧令牌并创建新令牌；完成时同时检查令牌与 expectedIndex。",
      boundary:"令牌必须被真实异步 Item 传给请求并在完成前检查；只有字段不构成保护。",
      cost:"快速滚动会增加取消与重启次数，适合配合资源缓存和去重。",
      steps:[
        step("01 / REQUEST OLD","slot 0 为数据 0 请求图片","请求 R0 持有 token#1，并记录 expectedIndex=0。","异步队列新增 R0。","异步结果必须与发起时的数据身份绑定。",state({binds:8,logs:["R0: slot0 → data0 / token#1 / pending"],focus:0,status:"R0 PENDING"}),"cancel",3),
        step("02 / FAST JUMP","slot 0 立即改绑数据 80","快速跳转使 slot 0 改绑；token#1 被取消和释放，随后创建 token#2。","Cancellations=8；R0 已失效，R80 开始等待。","复用节点时，旧请求属于旧数据，不属于这个节点的未来。",state({first:80,scroll:"5120 px",binds:16,cancels:8,logs:["R0: token#1 canceled","R80: slot0 → data80 / token#2 / pending"],focus:0,status:"R80 PENDING"}),"cancel",2),
        step("03 / OLD COMPLETES","旧结果晚到但被拒绝","R0 完成时 token#1 已取消，且 slot0.DataIndex=80，不满足写入条件。","旧图片没有覆盖数据 80。","取消与索引校验双重保护异步竞态。",state({first:80,scroll:"5120 px",binds:16,cancels:8,logs:["R0: completed → IGNORED","R80: pending"],focus:0,status:"STALE RESULT IGNORED"}),"cancel",4),
        step("04 / NEW COMPLETES","新结果写入当前数据","R80 使用有效 token#2，expectedIndex 仍为 80，因此可以更新 slot 0。","slot0 显示数据 80 的正确图片。","写入前再验证一次，才能把时间顺序的不确定性隔离在 Item 内。",state({first:80,scroll:"5120 px",binds:16,cancels:8,logs:["R0: ignored","R80: completed → APPLIED"],focus:0,status:"CURRENT RESULT APPLIED"}),"cancel",5)
      ]
    }
  };
  const el={tabs:Array.from(document.querySelectorAll("[data-case]")),problem:$("#problem"),mechanism:$("#mechanism"),boundary:$("#boundary"),cost:$("#cost"),phase:$("#phase"),title:$("#title"),copy:$("#copy"),change:$("#change"),why:$("#why"),stepLabel:$("#step-label"),stepCount:$("#step-count"),status:$("#status"),virtual:$("#virtual-count"),first:$("#first-index"),thumb:$("#rail-thumb"),slots:$("#slots"),logs:$("#async-log"),metrics:$("#metrics"),codeStatus:$("#code-status"),codeLines:$("#code-lines"),speed:$("#speed"),dots:$("#dots"),reset:$("#reset"),previous:$("#previous"),auto:$("#auto"),next:$("#next")};
  let active="scroll",player;
  function renderSlots(s){el.slots.replaceChildren();for(let slot=0;slot<8;slot++){const index=s.first+slot,node=document.createElement("div");node.className="slot";if(slot===s.focus)node.classList.add("is-rebound");const visible=slot<s.visible&&index<s.normal;node.innerHTML=`<b>SLOT ${slot}</b><span>${visible?`数据 ${index}`:"隐藏"}</span><small>${visible?`index=${index}`:"out of range"}</small>`;el.slots.append(node);}}
  function renderMetrics(s){const rows=[["教学数据量",s.normal.toLocaleString()],["可见槽位",`${s.visible} / 8`],["Scroll Position",s.scroll],["累计 Bind",s.binds],["累计 Cancel",s.cancels],["节点池",s.pool]];el.metrics.replaceChildren();rows.forEach(([k,v])=>{const w=document.createElement("div"),dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=k;dd.textContent=v;w.append(dt,dd);el.metrics.append(w);});}
  function renderCode(item){el.codeLines.replaceChildren();code[item.codeKey].forEach((line,i)=>{const li=document.createElement("li");li.textContent=line;li.classList.toggle("is-active",i===item.line);el.codeLines.append(li);});el.codeStatus.textContent=item.codeKey.toUpperCase();}
  function renderLogs(values){el.logs.replaceChildren();(values.length?values:["没有进行中的异步内容请求"]).forEach(value=>{const li=document.createElement("li");li.textContent=value;el.logs.append(li);});}
  function renderStep({step:item,index,total}){const s=item.state;el.phase.textContent=item.phase;el.title.textContent=item.title;el.copy.textContent=item.copy;el.change.textContent=item.change;el.why.textContent=item.why;el.stepLabel.textContent=`STEP ${String(index+1).padStart(2,"0")}`;el.stepCount.textContent=`${index+1} / ${total}`;el.status.textContent=s.status;el.virtual.textContent=8;el.first.textContent=s.first;el.thumb.style.top=`${Math.min(86,(s.first/Math.max(1,s.normal-8))*86)}%`;renderSlots(s);renderLogs(s.logs);renderMetrics(s);renderCode(item);}
  function syncCopy(){const c=cases[active];el.problem.textContent=c.problem;el.mechanism.textContent=c.mechanism;el.boundary.textContent=c.boundary;el.cost.textContent=c.cost;}
  function createPlayer(){if(player)player.destroy();player=window.XianyuInteractiveLab.createStepPlayer({steps:cases[active].steps,autoStepMs:Number(el.speed.value),endBehavior:"disable",dotElement:"button",dotsInteractive:true,controls:{previous:el.previous,next:el.next,auto:el.auto,reset:el.reset,dots:el.dots},labels:{play:"自动演示",pause:"暂停",complete:"演示完成",next:"下一步 →",done:"已完成",dot:(i,t)=>`跳到第 ${i+1} 步，共 ${t} 步`},classes:{playing:"is-playing",dot:"lab-dot",dotActive:"is-active",dotPast:"is-past"},renderStep,onModeChange:()=>{}});}
  el.tabs.forEach(button=>button.addEventListener("click",()=>{active=button.dataset.case;el.tabs.forEach(tab=>{const selected=tab===button;tab.classList.toggle("is-active",selected);tab.setAttribute("aria-pressed",String(selected));});syncCopy();player.replaceSteps(cases[active].steps);}));
  el.speed.addEventListener("change",createPlayer);if(!window.XianyuInteractiveLab)throw new Error("虚拟列表实验需要 interactive-lab.js");syncCopy();createPlayer();
})();
