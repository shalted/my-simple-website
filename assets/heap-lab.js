const scenarios = {
  insert: {
    code: [
      "_heap.Add(item);",
      "int i = _heap.Count - 1;",
      "while (i > 0)",
      "int parent = (i - 1) / 2;",
      "if (_heap[i] <= _heap[parent]) break;",
      "Swap(_heap, i, parent);",
      "i = parent;"
    ],
    steps: [
      {
        phase: "插入前", title: "最大堆已经就绪",
        copy: "父节点的优先级都大于等于它的孩子，因此堆顶 90 是当前最大值。",
        why: "堆不要求整个数组有序，只维护“父节点 ≥ 子节点”。",
        heap: [90, 70, 80, 30, 50, 60], current: null, compare: [], activeLines: [0], status: "READY"
      },
      {
        phase: "追加到末尾", title: "85 先坐到最后一格",
        copy: "新元素先追加到数组末尾，下标是 6。此时结构仍是完全二叉树，但堆序可能被破坏。",
        why: "从末尾插入不需要移动已有元素，接下来只修复新节点到根的一条路径。",
        heap: [90, 70, 80, 30, 50, 60, 85], current: 6, parent: 2, compare: [2], activeLines: [0, 1, 3], status: "APPEND"
      },
      {
        phase: "第一次比较", title: "85 挑战父节点 80",
        copy: "current = 6，parent = 2。因为 85 > 80，新节点的优先级更高，需要交换。",
        why: "最大堆要求父节点不小于孩子；这组父子关系已经违反规则。",
        heap: [90, 70, 80, 30, 50, 60, 85], current: 6, parent: 2, compare: [2], activeLines: [2, 3, 4, 5], status: "COMPARE"
      },
      {
        phase: "向上交换", title: "85 上浮到下标 2",
        copy: "交换后，85 来到下标 2，原来的 80 下沉到下标 6。继续沿父链检查。",
        why: "一次交换只修复当前父子关系；85 还需要与新的父节点 90 比较。",
        heap: [90, 70, 85, 30, 50, 60, 80], current: 2, parent: 0, compare: [0], activeLines: [5, 6, 3], status: "SWAP"
      },
      {
        phase: "停止条件", title: "85 不超过 90，完成",
        copy: "current = 2，parent = 0。因为 85 ≤ 90，不再交换，最大堆恢复。",
        why: "沿父链向上已经满足堆序；其他分支从未改变，所以无需继续检查。",
        heap: [90, 70, 85, 30, 50, 60, 80], current: 2, parent: 0, compare: [0], activeLines: [2, 3, 4], status: "COMPLETE"
      }
    ]
  },
  pop: {
    code: [
      "var top = _heap[0];",
      "_heap[0] = _heap[^1];",
      "_heap.RemoveAt(_heap.Count - 1);",
      "int i = 0;",
      "while (true)",
      "int left = 2 * i + 1;",
      "int right = 2 * i + 2;",
      "int largest = MaxPriority(i, left, right);",
      "if (largest == i) break;",
      "Swap(_heap, i, largest);",
      "i = largest;",
      "return top;"
    ],
    steps: [
      {
        phase: "弹出前", title: "堆顶就是最高优先级",
        copy: "最大堆把当前最大值稳定放在下标 0，因此先保存 top = 90。",
        why: "堆的核心收益是 O(1) 查看最大值；难点在取走后如何恢复结构。",
        heap: [90, 70, 85, 30, 50, 60, 80], current: 0, compare: [], output: 90, activeLines: [0], status: "SAVE TOP"
      },
      {
        phase: "移动末尾", title: "80 暂时接管堆顶",
        copy: "把最后一个元素 80 移到下标 0，并删除数组最后一格。完全二叉树结构被保留。",
        why: "直接删除根会留下空洞；用末尾补位可以保持数组连续。",
        heap: [80, 70, 85, 30, 50, 60], current: 0, left: 1, right: 2, compare: [1, 2], output: 90, activeLines: [1, 2, 3], status: "REPLACE"
      },
      {
        phase: "选择更大的孩子", title: "70 和 85 发起挑战",
        copy: "left = 1 → 70，right = 2 → 85。候选最大值是右孩子 85。",
        why: "与更大的孩子交换，才能同时保证新的父节点不小于左右两个孩子。",
        heap: [80, 70, 85, 30, 50, 60], current: 0, left: 1, right: 2, compare: [1, 2], output: 90, activeLines: [4, 5, 6, 7], status: "COMPARE"
      },
      {
        phase: "向下交换", title: "85 上升，80 下沉",
        copy: "80 与 85 交换，当前检查位置来到下标 2。堆顶的父子关系已经恢复。",
        why: "交换只可能让下沉后的 80 与自己的孩子冲突，因此继续向下检查即可。",
        heap: [85, 70, 80, 30, 50, 60], current: 2, left: 5, compare: [5], output: 90, activeLines: [9, 10, 5, 6], status: "SWAP"
      },
      {
        phase: "停止并返回", title: "80 ≥ 60，返回 90",
        copy: "下标 2 只有左孩子 60。80 已经不小于孩子，BubbleDown 结束并返回保存的 top。",
        why: "当前位置重新满足堆序，其他分支没有变化，整个最大堆已经恢复。",
        heap: [85, 70, 80, 30, 50, 60], current: 2, left: 5, compare: [5], output: 90, activeLines: [7, 8, 11], status: "COMPLETE"
      }
    ]
  }
};

const refs = {
  phase: document.querySelector("#phase"),
  title: document.querySelector("#step-title"),
  copy: document.querySelector("#step-copy"),
  why: document.querySelector("#step-why"),
  tree: document.querySelector("#heap-tree"),
  array: document.querySelector("#heap-array"),
  heapString: document.querySelector("#heap-string"),
  current: document.querySelector("#current-index"),
  parent: document.querySelector("#parent-index"),
  left: document.querySelector("#left-index"),
  right: document.querySelector("#right-index"),
  output: document.querySelector("#output-value"),
  code: document.querySelector("#code-lines"),
  codeStatus: document.querySelector("#code-status"),
  stepLabel: document.querySelector("#step-label"),
  stepCount: document.querySelector("#step-count"),
  dots: document.querySelector("#step-dots"),
  prev: document.querySelector("#prev-button"),
  next: document.querySelector("#next-button"),
  reset: document.querySelector("#reset-button"),
  auto: document.querySelector("#auto-button")
};

let scenarioName = "insert";
let heapPlayer;

function nodePosition(index) {
  const level = Math.floor(Math.log2(index + 1));
  const firstAtLevel = (2 ** level) - 1;
  const positionAtLevel = index - firstAtLevel;
  return {
    x: ((positionAtLevel + 1) / ((2 ** level) + 1)) * 100,
    y: ((level + 0.5) / 3) * 100
  };
}

function formatIndex(index, heap) {
  return Number.isInteger(index) ? `${index} / ${heap[index]}` : "—";
}

function renderTree(step) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("tree-lines");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  step.heap.forEach((_, index) => {
    if (index === 0) return;
    const parent = Math.floor((index - 1) / 2);
    const from = nodePosition(parent);
    const to = nodePosition(index);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", from.x);
    line.setAttribute("y1", from.y);
    line.setAttribute("x2", to.x);
    line.setAttribute("y2", to.y);
    if (index === step.current || step.compare.includes(index)) line.classList.add("is-active");
    svg.append(line);
  });
  refs.tree.replaceChildren(svg);
  step.heap.forEach((value, index) => {
    const position = nodePosition(index);
    const node = document.createElement("div");
    node.className = "tree-node";
    if (step.compare.includes(index)) node.classList.add("is-compare");
    if (index === step.current) node.classList.add("is-current");
    node.style.left = `${position.x}%`;
    node.style.top = `${position.y}%`;
    node.innerHTML = `<small>i:${index}</small><span>${value}</span>`;
    refs.tree.append(node);
  });
}

function renderArray(step) {
  refs.heapString.textContent = `[${step.heap.join(", ")}]`;
  refs.array.replaceChildren();
  step.heap.forEach((value, index) => {
    const cell = document.createElement("div");
    cell.className = "array-cell";
    if (step.compare.includes(index)) cell.classList.add("is-compare");
    if (index === step.current) cell.classList.add("is-current");
    cell.innerHTML = `<small>${index}</small><span>${value}</span>`;
    refs.array.append(cell);
  });
}

function renderCode(scenario, step) {
  refs.code.replaceChildren();
  scenario.code.forEach((line, index) => {
    const item = document.createElement("li");
    item.textContent = line;
    if (step.activeLines.includes(index)) item.classList.add("is-active");
    refs.code.append(item);
  });
}

function render({ step, index, total }) {
  const scenario = scenarios[scenarioName];
  refs.phase.textContent = step.phase;
  refs.title.textContent = step.title;
  refs.copy.textContent = step.copy;
  refs.why.textContent = step.why;
  refs.current.textContent = formatIndex(step.current, step.heap);
  refs.parent.textContent = formatIndex(step.parent, step.heap);
  refs.left.textContent = formatIndex(step.left, step.heap);
  refs.right.textContent = formatIndex(step.right, step.heap);
  refs.output.textContent = Number.isFinite(step.output) ? step.output : "—";
  refs.codeStatus.textContent = step.status;
  refs.stepLabel.textContent = `STEP ${String(index + 1).padStart(2, "0")}`;
  refs.stepCount.textContent = `${index + 1} / ${total}`;
  renderTree(step);
  renderArray(step);
  renderCode(scenario, step);
}

heapPlayer = window.XianyuInteractiveLab.createStepPlayer({
  steps: scenarios[scenarioName].steps,
  autoStepMs: 2000,
  endBehavior: "restart",
  dotElement: "button",
  dotsInteractive: true,
  controls: {
    previous: refs.prev,
    next: refs.next,
    auto: refs.auto,
    reset: refs.reset,
    dots: refs.dots
  },
  labels: {
    play: "自动演示",
    pause: "暂停演示",
    complete: "自动完成",
    next: "下一步 →",
    done: "下一步 →",
    dot: (index) => `跳到第 ${index + 1} 步`
  },
  classes: {
    playing: "is-playing",
    dot: "step-dot",
    dotActive: "is-active",
    dotPast: "is-past"
  },
  renderStep: render,
  onModeChange: ({ mode }) => { refs.auto.setAttribute("aria-pressed", String(mode === "auto")); }
});

document.querySelectorAll("[data-scenario]").forEach((button) => {
  button.addEventListener("click", () => {
    scenarioName = button.dataset.scenario;
    document.querySelectorAll("[data-scenario]").forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-pressed", String(active));
    });
    heapPlayer.replaceSteps(scenarios[scenarioName].steps);
  });
});
(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const code = {
    fifo:["waiting.enqueue(message);","next = waiting.dequeue();","active.show(next);"],
    heap:["heap.add(message);","bubbleUp(heap.length - 1);","next = heap.removeMax();","active.show(next);"],
    stable:["key = (priority DESC, sequence ASC);","heap.add({ message, key });","next = heap.removeMax();"],
    disconnected:["priorityHeap.add(message);","// 展示端仍消费旧 FIFO","next = fifo.dequeue();","active.show(next);"]
  };
  const msg=(name,p,s)=>({name,priority:p,sequence:s});
  const state=(o={})=>Object.assign({waiting:[],active:[],pool:[],heap:[],swaps:0,events:[],status:"READY",created:0,reused:0},o);
  const step=(phase,title,copy,change,why,state,codeKey,lines)=>({phase,title,copy,change,why,state,codeKey,lines});
  const common=[msg("普通提示 A",1,1),msg("紧急提示 B",9,2),msg("同级提示 C",5,3),msg("同级提示 D",5,4)];
  const modes={
    fifo:{problem:"真实现状使用两级 FIFO，Priority 不进入展示消费点。",steps:[
      step("01 / ARRIVE","消息按到达顺序进入 FIFO","四条教学消息依次到达；Priority 只是随消息展示，不参与队列比较。","等待区顺序为 A → B → C → D。","FIFO 只关心 sequence。",state({waiting:common,events:["入口 FIFO 收到 4 条消息"],created:1}),"fifo",[0]),
      step("02 / DEQUEUE","最早到达的 A 先显示","即使 B 的优先级更高，展示端仍从 FIFO 队首取 A。","A 进入活动区，等待区剩 B、C、D。","真实可见顺序由消费的数据结构决定。",state({waiting:common.slice(1),active:[common[0]],events:["dequeue A","show A"],status:"FIFO → A",created:1}),"fifo",[1,2]),
      step("03 / RECYCLE","A 到期并回对象池","活动消息结束后，视图重置并回池；下一条仍是 B。","活动区清空，对象池 +1。","对象池管理视图身份，不改变消息调度顺序。",state({waiting:common.slice(1),pool:["view#1"],events:["expire A","view#1 recycle"],status:"RECYCLED",created:1}),"fifo",[2])
    ]},
    heap:{problem:"Priority-only 最大堆能先取最高优先级，但同级顺序没有稳定保证。",steps:[
      step("01 / INSERT","消息进入最大堆","按 A、B、C、D 插入，B 上浮到堆顶。","堆数组形成 [B, D, C, A]，发生 2 次交换。","最大堆只保证父节点不小于孩子，不保证完整有序。",state({waiting:common,heap:[common[1],common[3],common[2],common[0]],swaps:2,events:["B 与 A 交换","D 与 A 交换"],created:1}),"heap",[0,1]),
      step("02 / MAX","最高优先级 B 先显示","调度器从堆顶取 B，末尾补位后向下修复。","B 进入活动区，堆恢复。","堆必须成为展示端的实际消费点，Priority 才可见。",state({waiting:[common[3],common[0],common[2]],active:[common[1]],heap:[common[3],common[0],common[2]],swaps:2,events:["removeMax → B","show B"],status:"HEAP → B",created:1}),"heap",[2,3]),
      step("03 / TIE","C 与 D 同级不保证 FIFO","Priority-only 比较器看不到 sequence；当前堆让 D 位于 C 前面。","下一条可能是 D，而 C 更早到达。","没有次排序键，就不能承诺同优先级先进先出。",state({waiting:[common[3],common[0],common[2]],pool:["view#1"],heap:[common[3],common[0],common[2]],swaps:2,events:["同级 C(seq3) / D(seq4)","顺序不稳定"],status:"TIE UNSTABLE",created:1}),"heap",[1,2])
    ]},
    stable:{problem:"既要高优先级先显示，又要同级保持到达顺序，需要第二比较键。",steps:[
      step("01 / KEY","分配单调递增 sequence","消息入队时保存 priority 与 sequence；比较器先看优先级，再让较小 sequence 胜出。","C(seq3) 排在 D(seq4) 前。","稳定性来自明确比较键，不来自堆本身。",state({waiting:common,heap:[common[1],common[3],common[2],common[0]],swaps:2,events:["key=(priority, -sequence)"],created:1}),"stable",[0,1]),
      step("02 / HIGH FIRST","B 先显示","最高优先级 B 从堆顶移出。","活动区显示 B。","主排序键仍是 Priority。",state({waiting:[common[2],common[3],common[0]],active:[common[1]],heap:[common[2],common[3],common[0]],swaps:3,events:["removeMax → B"],status:"STABLE → B",created:1}),"stable",[2]),
      step("03 / STABLE TIE","同级 C 先于 D","B 到期后，C 与 D Priority 相同，sequence 更小的 C 胜出。","可见顺序 B → C → D → A。","这是教学稳定策略，不代表当前运行链已经采用。",state({waiting:[common[3],common[0]],active:[common[2]],pool:["view#1"],heap:[common[3],common[0]],swaps:3,events:["tie: seq3 < seq4","show C"],status:"TIE STABLE",created:1,reused:1}),"stable",[0,2])
    ]},
    disconnected:{problem:"只创建优先堆但不修改展示消费点，优先级不会改变可见顺序。",steps:[
      step("01 / PARALLEL","堆与 FIFO 同时收消息","教学中的新堆把 B 放到堆顶，但旧 FIFO 仍保存 A、B、C、D。","堆数组看起来正确，消费链尚未改变。","结构存在不等于结构被消费。",state({waiting:common,heap:[common[1],common[3],common[2],common[0]],swaps:2,events:["heap top = B","fifo head = A"],status:"NOT CONNECTED",created:1}),"disconnected",[0,1]),
      step("02 / WRONG CONSUMER","展示仍从 FIFO 取 A","调度器没有接入堆，最终执行的仍是 fifo.dequeue()。","高优先 B 留在等待区，A 进入活动区。","判断功能是否生效要追到最终消费点。",state({waiting:common.slice(1),active:[common[0]],heap:[common[1],common[3],common[2],common[0]],swaps:2,events:["失败：heap 未被读取","fifo.dequeue → A"],status:"FAIL → A",created:1}),"disconnected",[1,2,3]),
      step("03 / EVIDENCE","Priority 改变但顺序不变","把 B 的 Priority 再提高，堆顶仍是 B；展示已经显示 A。","可见结果证明优先级链路未接通。","测试应观察用户可见出队顺序，而不只检查堆数组。",state({waiting:common.slice(1),pool:["view#1"],heap:[msg("紧急提示 B",99,2),common[3],common[2],common[0]],swaps:2,events:["Priority B: 9 → 99","visible order unchanged"],status:"FAILURE CONFIRMED",created:1}),"disconnected",[0,2])
    ]}
  };
  const refs={tabs:[...document.querySelectorAll("[data-schedule]")],phase:$("#schedule-phase"),title:$("#schedule-title"),copy:$("#schedule-copy"),change:$("#schedule-change"),why:$("#schedule-why"),status:$("#schedule-status"),waiting:$("#schedule-waiting"),active:$("#schedule-active"),pool:$("#schedule-pool"),heap:$("#schedule-heap"),events:$("#schedule-events"),metrics:$("#schedule-metrics"),codeStatus:$("#schedule-code-status"),codeLines:$("#schedule-code-lines"),speed:$("#schedule-speed"),dots:$("#schedule-dots"),reset:$("#schedule-reset"),prev:$("#schedule-prev"),auto:$("#schedule-auto"),next:$("#schedule-next")};
  let mode="fifo",player;
  const renderMessages=(target,items)=>{target.replaceChildren();(items.length?items:[null]).forEach(item=>{const li=document.createElement("li");if(item===null){li.textContent="空"}else if(typeof item==="string"){li.innerHTML=`<span>${item}</span><small>idle</small>`}else{li.innerHTML=`<span>${item.name}</span><small>P${item.priority} · S${item.sequence}</small>`}target.append(li)})};
  function render({step:item,index,total}){const s=item.state;refs.phase.textContent=item.phase;refs.title.textContent=item.title;refs.copy.textContent=item.copy;refs.change.textContent=item.change;refs.why.textContent=item.why;refs.status.textContent=s.status;renderMessages(refs.waiting,s.waiting);renderMessages(refs.active,s.active);renderMessages(refs.pool,s.pool);refs.heap.textContent=s.heap.length?`[${s.heap.map(m=>`${m.name.slice(-1)}:P${m.priority}/S${m.sequence}`).join(", ")}]`:"未接入 / 空";refs.events.replaceChildren();s.events.forEach(value=>{const li=document.createElement("li");li.textContent=value;if(value.includes("失败"))li.classList.add("is-error");refs.events.append(li)});const rows=[["当前策略",mode],["等待消息",s.waiting.length],["活动消息",s.active.length],["池内视图",s.pool.length],["堆交换",s.swaps],["创建视图",s.created],["复用视图",s.reused],["步骤",`${index+1}/${total}`]];refs.metrics.replaceChildren();rows.forEach(([k,v])=>{const div=document.createElement("div"),dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=k;dd.textContent=v;div.append(dt,dd);refs.metrics.append(div)});refs.codeLines.replaceChildren();code[item.codeKey].forEach((line,i)=>{const li=document.createElement("li");li.textContent=line;li.classList.toggle("is-active",item.lines.includes(i));refs.codeLines.append(li)});refs.codeStatus.textContent=item.codeKey.toUpperCase()}
  function create(){if(player)player.destroy();player=window.XianyuInteractiveLab.createStepPlayer({steps:modes[mode].steps,autoStepMs:Number(refs.speed.value),endBehavior:"disable",dotElement:"button",dotsInteractive:true,controls:{previous:refs.prev,next:refs.next,auto:refs.auto,reset:refs.reset,dots:refs.dots},labels:{play:"自动演示",pause:"暂停",complete:"演示完成",next:"下一步 →",done:"已完成",dot:(i,t)=>`跳到第 ${i+1} 步，共 ${t} 步`},classes:{playing:"is-playing",dot:"step-dot",dotActive:"is-active",dotPast:"is-past"},renderStep:render,onModeChange:({mode})=>{refs.auto.setAttribute("aria-pressed",String(mode==="auto"))}})}
  refs.tabs.forEach(button=>button.addEventListener("click",()=>{mode=button.dataset.schedule;refs.tabs.forEach(tab=>{const on=tab===button;tab.classList.toggle("is-active",on);tab.setAttribute("aria-pressed",String(on))});create()}));refs.speed.addEventListener("change",create);create();
})();
