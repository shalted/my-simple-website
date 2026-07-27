(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const codeBook = {
    open: [
      "async function openPage(key, data) {",
      "  const existing = active.get(key);",
      "  if (existing && key.mode === \"single\") {",
      "    existing.open(data);",
      "    return existing;",
      "  }",
      "",
      "  const panel = pool.rent(key) ?? await createPanel(key);",
      "  active.set(key, panel);",
      "  if (key.pushToStack) stack.push(key);",
      "  panel.open(data);",
      "  return panel;",
      "}"
    ],
    close: [
      "function closePage(key) {",
      "  const panel = active.get(key);",
      "  if (!panel || panel.isClosing) return;",
      "",
      "  removeFromStack(key);",
      "  panel.beforeClose();",
      "  panel.unbindAll();",
      "  panel.playCloseAnimation(() => {",
      "    active.delete(key);",
      "    pool.release(panel);",
      "  });",
      "}"
    ],
    repeat: [
      "function open(data) {",
      "  // 已打开的单例页会直接返回",
      "  if (isOpen && !isClosing) return;",
      "",
      "  beforeOpen(data);",
      "  bindAll(viewModel);",
      "  activate();",
      "  afterOpen();",
      "}"
    ],
    bind: [
      "function bind(panel, data) {",
      "  panel.bindingVersion += 1;",
      "  const version = panel.bindingVersion;",
      "",
      "  panel.subscribe(result => {",
      "    // 只让当前绑定消费异步结果",
      "    if (version !== panel.bindingVersion) return;",
      "    panel.render(result);",
      "  });",
      "}"
    ],
    stale: [
      "function onOldResult(result, capturedVersion) {",
      "  // 错误：旧订阅仍在，覆盖了当前页面",
      "  panel.render(result);",
      "",
      "  // 修复：解绑订阅，并校验绑定代次",
      "  if (capturedVersion !== panel.bindingVersion) return;",
      "  panel.render(result);",
      "}"
    ]
  };

  const cases = {
    normal: {
      label: "正常打开与返回",
      problem: "返回时应关闭哪个页面，与关闭后是否销毁实例，是两个不同问题。",
      mechanism: "页面栈保存返回顺序，活动表保存运行实例，面板池保存已清理的闲置对象。",
      boundary: "关闭动画完成前，页面已经离栈但仍可能留在活动表；复用前必须清理旧会话。",
      cost: "栈顶返回 O(1)；按键移除栈帧最坏 O(S)；池命中可避免重新实例化。",
      steps: [
        {
          phase: "起点",
          title: "三个容器都为空",
          copy: "页面栈记录返回顺序，活动表记录正在显示或关闭中的实例，池只保存可复用的闲置实例。",
          change: "建立观察基线。",
          why: "把导航、可见性与对象复用分开看，才不会把“返回”和“重新创建”混成一件事。",
          stack: [], active: [], pool: [], version: 0, subscriptions: 0, token: "无",
          created: 0, reused: 0, code: "open", lines: [0],
          events: ["等待打开请求。"]
        },
        {
          phase: "打开",
          title: "打开列表页 A",
          copy: "池中没有 A，于是创建实例 #1，注册到活动表，压入页面栈，再绑定数据并显示。",
          change: "创建 1 个实例；栈深度变为 1。",
          why: "先登记活动实例再执行页面生命周期，可让后续查询找到这次打开。",
          stack: ["列表页 A"], active: [{ name: "列表页 A", id: "#1", state: "open" }], pool: [],
          version: 1, subscriptions: 1, token: "A-1 有效", created: 1, reused: 0,
          code: "open", lines: [7, 8, 9, 10],
          events: ["池未命中：创建 A#1。", "A#1 绑定版本 = 1。", "A#1 进入活动表与页面栈。"]
        },
        {
          phase: "覆盖",
          title: "打开详情页 B",
          copy: "B 覆盖在 A 上方。A 仍是活动实例，返回时只需关闭栈顶 B。",
          change: "活动实例和栈深度各增加 1。",
          why: "覆盖页不要求销毁底页；保留底页可维持滚动位置和已有状态。",
          stack: ["列表页 A", "详情页 B"], active: [
            { name: "列表页 A", id: "#1", state: "open" },
            { name: "详情页 B", id: "#2", state: "open" }
          ], pool: [], version: 1, subscriptions: 2, token: "A-1、B-1 有效",
          created: 2, reused: 0, code: "open", lines: [7, 8, 9, 10],
          events: ["池未命中：创建 B#2。", "B#2 压入栈顶。"]
        },
        {
          phase: "返回",
          title: "关闭栈顶 B",
          copy: "B 先从页面栈移除，再解绑并播放关闭动画；动画结束前，它仍在活动表中。",
          change: "栈已回到 A；B 标记为 closing。",
          why: "把回收延后到关闭完成，能避免动画仍访问已被复用的对象。",
          stack: ["列表页 A"], active: [
            { name: "列表页 A", id: "#1", state: "open" },
            { name: "详情页 B", id: "#2", state: "closing" }
          ], pool: [], version: 1, subscriptions: 1, token: "B 已取消",
          created: 2, reused: 0, code: "close", lines: [4, 5, 6, 7],
          events: ["页面栈移除 B。", "B#2 解绑，开始关闭动画。"]
        },
        {
          phase: "回收",
          title: "B 进入池",
          copy: "关闭完成后，B 从活动表移除，运行状态和绑定被清理，实例 #2 进入池。",
          change: "活动实例只剩 A；池内出现 B#2。",
          why: "池保存对象身份，不保存上一次页面会话。",
          stack: ["列表页 A"], active: [{ name: "列表页 A", id: "#1", state: "open" }],
          pool: [{ name: "详情页 B", id: "#2" }], version: 0, subscriptions: 1, token: "仅 A-1 有效",
          created: 2, reused: 0, code: "close", lines: [8, 9],
          events: ["B#2 关闭完成。", "B#2 清理后进入池。"]
        },
        {
          phase: "复用",
          title: "再次打开 B",
          copy: "池命中 B#2，不再创建对象；新会话获得新的绑定代次与异步令牌。",
          change: "复用计数 +1，B#2 回到活动表和栈顶。",
          why: "复用对象时必须重建会话状态，不能沿用旧绑定。",
          stack: ["列表页 A", "详情页 B"], active: [
            { name: "列表页 A", id: "#1", state: "open" },
            { name: "详情页 B", id: "#2", state: "open" }
          ], pool: [], version: 2, subscriptions: 2, token: "A-1、B-2 有效",
          created: 2, reused: 1, code: "bind", lines: [1, 2, 5, 7],
          events: ["池命中：租出 B#2。", "B#2 绑定版本从 1 前进到 2。", "没有新增实例。"]
        }
      ]
    },
    overlay: {
      label: "覆盖与重复打开",
      problem: "覆盖页需要保留底页；重复打开单例页又不应创建第二份实例。",
      mechanism: "覆盖页追加到栈顶并与底页同时保持活动；单例请求优先查询活动表。",
      boundary: "已打开单例页的打开函数会短路，新请求数据不会自动触发重绑。",
      cost: "活动实例数量随覆盖层数增长；重复单例查询接近 O(1)，但调用方需明确刷新语义。",
      steps: [
        {
          phase: "起点", title: "列表页 A 已打开",
          copy: "A 是当前栈顶，也是活动实例。",
          change: "建立覆盖场景。",
          why: "覆盖页会叠在现有页面上。",
          stack: ["列表页 A"], active: [{ name: "列表页 A", id: "#1", state: "open" }], pool: [],
          version: 1, subscriptions: 1, token: "A-1 有效", created: 1, reused: 0,
          code: "open", lines: [8, 9, 10], events: ["A#1 已打开。"]
        },
        {
          phase: "覆盖", title: "打开弹层 C",
          copy: "C 被压入栈顶，A 仍保持活动。活动表回答“有哪些实例”，页面栈回答“返回时先关谁”。",
          change: "栈顶变为 C。",
          why: "两个容器服务不同问题，不能互相替代。",
          stack: ["列表页 A", "弹层 C"], active: [
            { name: "列表页 A", id: "#1", state: "open" },
            { name: "弹层 C", id: "#3", state: "open" }
          ], pool: [], version: 1, subscriptions: 2, token: "A-1、C-1 有效",
          created: 2, reused: 0, code: "open", lines: [7, 8, 9, 10],
          events: ["创建 C#3。", "C#3 覆盖在 A#1 上。"]
        },
        {
          phase: "边界", title: "重复打开单例 C",
          copy: "系统找到仍活动的 C#3 并调用打开；但页面已是打开状态，生命周期立即返回。",
          change: "没有新增栈帧，也没有创建或重绑。",
          why: "重复请求不会重复创建；代价是这次携带的新数据不会自动进入绑定流程。",
          stack: ["列表页 A", "弹层 C"], active: [
            { name: "列表页 A", id: "#1", state: "open" },
            { name: "弹层 C", id: "#3", state: "open" }
          ], pool: [], version: 1, subscriptions: 2, token: "C 仍为旧会话 C-1",
          created: 2, reused: 0, code: "repeat", lines: [0, 1, 2],
          events: ["重复请求命中活动 C#3。", "打开函数短路：新数据未重绑。"],
          warning: true
        },
        {
          phase: "返回", title: "关闭 C，回到 A",
          copy: "返回操作关闭当前栈顶；A 本来就处于活动状态，不需要重新创建。",
          change: "C 从栈与活动表移除，进入池。",
          why: "返回的核心是关闭栈顶，而不是重演底页的完整打开流程。",
          stack: ["列表页 A"], active: [{ name: "列表页 A", id: "#1", state: "open" }],
          pool: [{ name: "弹层 C", id: "#3" }], version: 0, subscriptions: 1, token: "仅 A-1 有效",
          created: 2, reused: 0, code: "close", lines: [4, 5, 6, 8, 9],
          events: ["C#3 从栈顶移除。", "C#3 关闭完成并回收。"]
        }
      ]
    },
    conflict: {
      label: "旧回调冲突",
      problem: "池化对象重开后，旧页面会话的异步回调可能晚到并覆盖当前数据。",
      mechanism: "关闭时解绑并取消旧令牌；回调写入前再核对捕获的绑定代次。",
      boundary: "绑定代次是教学防护模型，不是被审计框架自动提供的保证；页面自定义订阅仍需自行管理。",
      cost: "每次重绑增加一次常数级版本比较；换来对排队旧回调的确定性隔离。",
      steps: [
        {
          phase: "绑定", title: "A#1 绑定第一批数据",
          copy: "页面建立版本 1 的绑定，并发出异步请求。回调捕获版本 1。",
          change: "订阅数 = 1，令牌 A-1 有效。",
          why: "异步结果可能晚于页面关闭到达。",
          stack: ["列表页 A"], active: [{ name: "列表页 A", id: "#1", state: "open" }], pool: [],
          version: 1, subscriptions: 1, token: "A-1 有效", created: 1, reused: 0,
          code: "bind", lines: [1, 2, 4, 5], events: ["A#1 建立版本 1 绑定。", "请求 old-result 已发出。"]
        },
        {
          phase: "错误", title: "关闭时漏掉自定义订阅",
          copy: "框架绑定已清理，但页面自己注册的回调没有解绑。这个步骤是故意制造的失败案例。",
          change: "实例进入池，错误订阅仍为 1。",
          why: "池化对象不会自然消失；遗留回调仍持有旧会话语义。",
          stack: [], active: [], pool: [{ name: "列表页 A", id: "#1", stale: true }],
          version: 1, subscriptions: 1, token: "A-1 应失效但仍可回调", created: 1, reused: 0,
          code: "close", lines: [4, 5, 6, 8, 9],
          events: ["A#1 进入池。", "失败：自定义订阅未解绑。"],
          error: true
        },
        {
          phase: "复用", title: "A#1 被新会话复用",
          copy: "同一个对象绑定版本 2 的数据。此时旧版本 1 和新版本 2 的回调同时存在。",
          change: "活动对象身份没变，页面会话已经改变。",
          why: "对象身份相同，不代表异步结果仍属于当前页面会话。",
          stack: ["列表页 A"], active: [{ name: "列表页 A", id: "#1", state: "open" }], pool: [],
          version: 2, subscriptions: 2, token: "A-2 有效；A-1 遗留", created: 1, reused: 1,
          code: "bind", lines: [1, 2, 5, 6, 7], events: ["池命中 A#1。", "新绑定版本 = 2。", "旧订阅仍潜伏。"],
          warning: true
        },
        {
          phase: "冲突", title: "旧结果晚到并污染界面",
          copy: "版本 1 的回调把旧数据绘制到版本 2 页面，形成可见的时序错误。",
          change: "当前数据被 old-result 覆盖。",
          why: "只依赖对象是否存活无法识别回调所属会话。",
          stack: ["列表页 A"], active: [{ name: "列表页 A", id: "#1", state: "stale" }], pool: [],
          version: 2, subscriptions: 2, token: "A-1 错误消费", created: 1, reused: 1,
          code: "stale", lines: [0, 1, 2], events: ["old-result 到达。", "失败：旧回调覆盖当前界面。"],
          error: true
        },
        {
          phase: "防护", title: "解绑 + 绑定代次校验",
          copy: "关闭时取消订阅；即使队列中已有旧回调，执行前也比较捕获版本与当前版本。",
          change: "版本 1 结果被拒绝，当前页面保持版本 2 数据。",
          why: "解绑阻止后续通知，代次校验处理已经排队的竞态；两层防护职责不同。",
          stack: ["列表页 A"], active: [{ name: "列表页 A", id: "#1", state: "open" }], pool: [],
          version: 2, subscriptions: 1, token: "仅 A-2 有效", created: 1, reused: 1,
          code: "stale", lines: [4, 5, 6], events: ["清除版本 1 订阅。", "版本不匹配：拒绝 old-result。", "当前页面保持 new-result。"],
          success: true
        }
      ]
    }
  };

  let currentCase = "normal";
  let player = null;

  function listMarkup(items, kind) {
    if (!items.length) return '<li class="usp-empty">空</li>';
    return items.map((item, index) => {
      if (typeof item === "string") {
        return `<li><span>${index + 1}. ${item}</span><span class="usp-badge">${index === items.length - 1 ? "栈顶" : "保留"}</span></li>`;
      }
      const classes = item.state === "closing" ? "is-closing" : (item.state === "stale" || item.stale ? "is-stale" : "");
      const badge = kind === "pool" ? "闲置" : (item.state === "closing" ? "关闭中" : item.state === "stale" ? "被旧数据污染" : "活动");
      return `<li class="${classes}"><span>${item.name} ${item.id}</span><span class="usp-badge">${badge}</span></li>`;
    }).join("");
  }

  function renderCode(step) {
    const lines = codeBook[step.code];
    $("#code-status").textContent = `当前对应：${step.title}`;
    $("#code-lines").innerHTML = lines.map((line, index) => {
      const active = step.lines.includes(index) ? " is-active" : "";
      return `<li class="usp-code-line${active}">${escapeHtml(line) || " "}</li>`;
    }).join("");
  }

  function escapeHtml(value) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function render({ step, index, total }) {
    $("#phase").textContent = step.phase;
    $("#title").textContent = step.title;
    $("#copy").textContent = step.copy;
    $("#change").textContent = step.change;
    $("#why").textContent = step.why;
    $("#stack").innerHTML = listMarkup(step.stack, "stack");
    $("#active").innerHTML = listMarkup(step.active, "active");
    $("#pool").innerHTML = listMarkup(step.pool, "pool");
    $("#version").textContent = String(step.version);
    $("#subscriptions").textContent = String(step.subscriptions);
    $("#token").textContent = step.token;
    $("#metrics").innerHTML = [
      ["栈深度", step.stack.length],
      ["活动实例", step.active.length],
      ["池内实例", step.pool.length],
      ["累计创建", step.created],
      ["累计复用", step.reused],
      ["当前案例", cases[currentCase].label]
    ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
    $("#events").innerHTML = step.events.map((event) => {
      const className = step.error ? "is-error" : step.warning ? "is-warning" : step.success ? "is-success" : "";
      return `<li class="${className}">${event}</li>`;
    }).join("");
    $("#step-label").textContent = `${cases[currentCase].label} · ${step.phase}`;
    $("#step-count").textContent = `${index + 1} / ${total}`;
    $("#status").textContent = step.error ? "失败已复现" : step.warning ? "边界观察中" : step.success ? "冲突已隔离" : "状态一致";
    $("#status").className = step.error ? "usp-danger-text" : step.success ? "usp-safe-text" : "";
    renderCode(step);
  }

  function rebuildPlayer() {
    if (player && typeof player.destroy === "function") player.destroy();
    const speed = Number($("#speed").value);
    player = window.XianyuInteractiveLab.createStepPlayer({
      steps: cases[currentCase].steps,
      autoStepMs: speed,
      endBehavior: "disable",
      dotElement: "button",
      dotsInteractive: true,
      controls: {
        previous: $("#previous"),
        next: $("#next"),
        auto: $("#auto"),
        reset: $("#reset"),
        dots: $("#dots")
      },
      labels: {
        play: "自动演示",
        pause: "暂停",
        complete: "演示完成",
        next: "下一步 →",
        done: "已完成",
        dot: (index, total) => `跳到第 ${index + 1} 步，共 ${total} 步`
      },
      classes: {
        playing: "is-playing",
        dot: "lab-dot",
        dotActive: "is-active",
        dotPast: "is-past"
      },
      renderStep: render,
      onModeChange: ({ mode }) => {
        $("#auto").setAttribute("aria-pressed", String(mode === "auto"));
      }
    });
  }

  function syncCaseCopy() {
    const item = cases[currentCase];
    $("#problem").textContent = item.problem;
    $("#mechanism").textContent = item.mechanism;
    $("#boundary").textContent = item.boundary;
    $("#cost").textContent = item.cost;
  }

  document.querySelectorAll("[data-case]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-case]").forEach((item) => {
        const selected = item === button;
        item.classList.toggle("is-active", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
      currentCase = button.dataset.case;
      syncCaseCopy();
      rebuildPlayer();
    });
  });

  $("#speed").addEventListener("change", rebuildPlayer);
  if (!window.XianyuInteractiveLab) throw new Error("页面栈实验需要 interactive-lab.js");
  syncCaseCopy();
  rebuildPlayer();
})();
