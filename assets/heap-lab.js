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
  onModeChange: () => {}
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