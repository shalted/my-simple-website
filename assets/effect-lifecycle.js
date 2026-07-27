(function bootstrapEffectLifecycle() {
  "use strict";

  const lifecycle = [
    "Definition",
    "RuntimeEffect",
    "Apply Gate",
    "Instant / Duration",
    "ActiveEffects",
    "Modifier",
    "Period",
    "Stack",
    "Expire / Remove",
    "Release"
  ];

  const cases = {
    normal: {
      problem: "持续效果既要改变当前属性，又不能污染基础值；重复申请还要合并层数与两个计时器。",
      mechanism: "RuntimeEffect 进入活动集合。属性从 Base 重算 Current，周期和叠层分别管理自己的状态。",
      boundary: "Snapshot 在第一次计算时缓存；Track 实时读取。两者的性能与语义不同。",
      makeSteps: makeNormalSteps
    },
    boundary: {
      problem: "周期 Tick 到来前，目标可能已经失效。继续派生效果会访问无效状态。",
      mechanism: "每次 Tick 先验证目标；失效后不再派生周期效果，复用标准 Deactivate → Remove → Release 管线。",
      boundary: "清理必须允许目标先于效果消失，不能假设 ActiveEffects 容器永远可访问。",
      makeSteps: makeBoundarySteps
    },
    overflow: {
      problem: "层数已满时，新申请既不能悄悄突破上限，也不能含糊地刷新持续时间。",
      mechanism: "把“是否接受溢出申请”“是否刷新时钟”“是否清空整个栈”作为独立决策展示。",
      boundary: "拒绝溢出时不刷新 Duration；新建的 incoming RuntimeEffect 仍需销毁。",
      makeSteps: makeOverflowSteps
    }
  };

  const code = {
    create: [
      "var runtime = definition.CreateRuntime();",
      "runtime.Source = request.Source;",
      "runtime.Target = request.Target;",
      "pipeline.Enqueue(runtime);"
    ],
    gate: [
      "if (!target.Exists)",
      "    return Reject(\"target missing\");",
      "if (!RequiredTagsMatch(target))",
      "    return Reject(\"required tags\");",
      "if (ImmunityMatches(target))",
      "    return Reject(\"immune\");"
    ],
    branch: [
      "if (runtime.Duration == null)",
      "    ApplyInstantToBase(runtime);",
      "else",
      "    AddOrMergeActiveEffect(runtime);"
    ],
    activate: [
      "runtime.Active = true;",
      "runtime.DurationStart = now;",
      "RegisterTrackedDependencies(runtime);",
      "MarkModifierAttributesDirty(runtime.Target);"
    ],
    recalc: [
      "current = attribute.BaseValue;",
      "foreach (var effect in ActiveEffects)",
      "    if (effect.Active)",
      "        current = ApplyModifiers(current, effect);",
      "attribute.CurrentValue = Clamp(current);"
    ],
    capture: [
      "value = capture == Snapshot",
      "    ? CacheOnFirstCalculation(sourceValue)",
      "    : ReadCurrentValue(source);",
      "magnitude = value * K + B;"
    ],
    period: [
      "if (!runtime.Active) return;",
      "if (now - period.Start >= period.Interval) {",
      "    period.Start = now;",
      "    SpawnPeriodEffect(runtime);",
      "}"
    ],
    stack: [
      "existing = FindByStackKey(target, source);",
      "if (existing != null) {",
      "    existing.StackCount += 1;",
      "    RefreshClocksByPolicy(existing);",
      "    Destroy(incoming);",
      "}"
    ],
    remove: [
      "runtime.Active = false;",
      "UnregisterTrackedDependencies(runtime);",
      "MarkModifierAttributesDirty(runtime.Target);",
      "ActiveEffects.Remove(runtime);"
    ],
    release: [
      "Release(runtime.PeriodEntries);",
      "Release(runtime.OverflowEffects);",
      "Destroy(runtime);"
    ]
  };

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    caseTabs: Array.from(document.querySelectorAll("[data-case]")),
    capture: $("#capture-policy"),
    stack: $("#stack-policy"),
    duration: $("#duration-policy"),
    period: $("#period-policy"),
    speed: $("#speed-select"),
    problem: $("#principle-problem"),
    mechanism: $("#principle-mechanism"),
    boundary: $("#principle-boundary"),
    phase: $("#phase"),
    title: $("#step-title"),
    copy: $("#step-copy"),
    change: $("#step-change"),
    why: $("#step-why"),
    stepLabel: $("#step-label"),
    stepCount: $("#step-count"),
    status: $("#visual-status"),
    current: $("#current-value"),
    base: $("#base-value"),
    runtime: $("#runtime-state"),
    active: $("#active-state"),
    stackCount: $("#stack-count"),
    remain: $("#remain-time"),
    track: $("#lifecycle-track"),
    periodEvents: $("#period-events"),
    metrics: $("#metrics"),
    compareKeep: $("#compare-keep"),
    compareRefresh: $("#compare-refresh"),
    compareCopy: $("#compare-copy"),
    codeStatus: $("#code-status"),
    codeLines: $("#code-lines"),
    previous: $("#prev-button"),
    next: $("#next-button"),
    auto: $("#auto-button"),
    reset: $("#reset-button"),
    dots: $("#step-dots")
  };

  let activeCase = "normal";
  let player = null;

  function policy() {
    return {
      capture: elements.capture.value,
      stack: elements.stack.value,
      duration: elements.duration.value,
      period: elements.period.value
    };
  }

  function state(overrides) {
    return Object.assign({
      base: 100,
      current: 100,
      runtime: "未创建",
      active: false,
      stack: 0,
      remain: "—",
      events: [],
      sourceValue: 20,
      durationStart: "—",
      periodStart: "—",
      incoming: "—",
      resources: "0"
    }, overrides);
  }

  function step(stage, phase, title, copy, change, why, view, codeKey, activeLine) {
    return { stage, phase, title, copy, change, why, view, codeKey, activeLine };
  }

  function makeNormalSteps(p) {
    const captureName = p.capture === "snapshot" ? "Snapshot" : "Track";
    const firstMagnitude = 20;
    const changedMagnitude = p.capture === "snapshot" ? 20 : 30;
    const secondCurrent = 100 + changedMagnitude * 2;
    const refreshedRemain = p.duration === "refresh" ? "6" : "2";
    const periodMessage = p.period === "reset" ? "Period 起点重置为 t=4" : "Period 起点保持 t=2";
    const stackMessage = p.stack === "source" ? "只合并同一来源的层" : "不同来源也共享同一栈";

    return [
      step(0, "01 / DEFINITION", "定义只保存规则", "教学定义描述持续时间、周期、Modifier 与叠层策略，不保存某次运行的目标和计时。", "准备一份可复用的 EffectDefinition。", "定义与状态分开，同一规则才能安全地并发作用于多个目标。", state(), "create", 0),
      step(1, "02 / SPEC", "创建独立 RuntimeEffect", "一次申请创建一份运行对象，并绑定来源、目标和本次上下文。", "运行资源从 0 变为 1，状态为 CREATED。", "计时、层数和捕获缓存都必须属于这次运行，不能写回共享定义。", state({ runtime: "CREATED", resources: "1", incoming: "runtime#1" }), "create", 3),
      step(2, "03 / APPLY GATE", "在副作用之前做门禁", "目标存在，必需标签匹配，且没有命中免疫，因此允许进入 Apply。", "Gate 从 PENDING 变为 PASSED；属性仍未改变。", "先检查再结算，失败对象才不会留下半个 Modifier、周期事件或监听。", state({ runtime: "GATE PASSED", resources: "1", incoming: "runtime#1" }), "gate", 4),
      step(3, "04 / BRANCH", "Instant 与 Duration 在这里分叉", "Instant 会修改 Base 后结束；本场景有 Duration，因此进入活动效果集合。", "Base 保持 100，RuntimeEffect 被加入 ActiveEffects。", "持续效果保存规则并重算 Current，移除时无需做易错的反向运算。", state({ runtime: "IN ACTIVE LIST", remain: "6", resources: "1", incoming: "merged" }), "branch", 3),
      step(4, "05 / ACTIVATE", "激活 Modifier", "运行对象开始计时、注册需要的依赖，并把相关属性标记为 Dirty。", "active 变为 true，Duration 起点设为 t=0。", "只有 active 的持续效果才能参与 CurrentValue 重算。", state({ runtime: "ACTIVE", active: true, remain: "6", durationStart: "t=0", resources: "1" }), "activate", 3),
      step(5, "06 / CAPTURE", `${captureName} 计算第一层`, `${captureName === "Snapshot" ? "第一次计算读取 20 并缓存；之后来源变化也复用 20。" : "每次计算都实时读取来源值；来源变化会触发目标属性重算。"} Current = 100 + 20。`, "Current 从 100 变为 120；Base 仍是 100。", "Snapshot 的捕获时机是第一次计算，不是创建 RuntimeEffect 时。", state({ runtime: "ACTIVE", active: true, current: 120, stack: 1, remain: "5", durationStart: "t=0", resources: "1" }), "capture", p.capture === "snapshot" ? 1 : 2),
      step(6, "07 / PERIOD", "周期只在 active 时推进", "到达 t=2，周期派生一次子效果；父效果仍保留自己的 Duration 与 Modifier。", "周期事件列表新增 Tick@t=2。", "周期结果是独立申请，避免把一次性 Base 结算混进父 Buff 的 Current 规则。", state({ runtime: "ACTIVE", active: true, current: 120, stack: 1, remain: "4", events: ["Tick @ t=2：派生一次周期结果"], durationStart: "t=0", periodStart: "t=2", resources: "1" }), "period", 3),
      step(7, "08 / STACK", "重复申请合并到已有对象", `来源属性现在为 30。${stackMessage}；${periodMessage}。`, `incoming 对象被销毁；层数变为 2，Current = ${secondCurrent}，剩余时间为 ${refreshedRemain}。`, "合并后只保留一个运行对象，层数和两个时钟必须分别按策略更新。", state({ runtime: "ACTIVE · MERGED", active: true, current: secondCurrent, stack: 2, remain: refreshedRemain, events: ["Tick @ t=2：派生一次周期结果"], sourceValue: 30, durationStart: p.duration === "refresh" ? "t=4" : "t=0", periodStart: p.period === "reset" ? "t=4" : "t=2", incoming: "destroyed", resources: "1" }), "stack", 4),
      step(8, "09 / EXPIRE", "到期进入标准移除", "Duration 到期后先 Deactivate，再注销 Track 监听、标记属性 Dirty，并移出 ActiveEffects。", "active 变为 false；重算后 Current 回到 Base 100。", "主动移除与到期应复用同一条管线，确保每种结束方式都有相同清理保证。", state({ runtime: "REMOVING", active: false, current: 100, stack: 0, remain: "0", events: ["Tick @ t=2：派生一次周期结果"], sourceValue: 30, durationStart: "expired", periodStart: "stopped", resources: "1" }), "remove", 3),
      step(9, "10 / RELEASE", "释放资源并销毁", "释放周期条目与溢出引用，销毁 RuntimeEffect。活动集合中不再保留悬空引用。", "运行资源从 1 变为 0，生命周期闭环。", "能正确改变属性只是前半程；能停止回调、移除引用并释放资源，才算真正结束。", state({ runtime: "DESTROYED", resources: "0", incoming: "—" }), "release", 2)
    ];
  }

  function makeBoundarySteps() {
    return [
      step(0, "01 / CREATE", "创建周期持续效果", "教学场景创建一份 Duration 6、Period 2 的 RuntimeEffect。", "运行资源从 0 变为 1。", "周期状态属于运行对象，而不是共享定义。", state({ runtime: "CREATED", resources: "1" }), "create", 0),
      step(2, "02 / GATE", "目标当前有效", "Apply Gate 通过，运行对象可以进入持续分支。", "Gate 变为 PASSED。", "存在性检查仍要在后续 Tick 重做，因为目标可能提前结束。", state({ runtime: "GATE PASSED", resources: "1" }), "gate", 1),
      step(4, "03 / ACTIVE", "激活并参与属性重算", "Modifier 激活，Current 从 100 变为 120。", "active=true，目标 ActiveEffects 持有运行对象。", "持续效果只改 Current，不改 Base。", state({ runtime: "ACTIVE", active: true, current: 120, stack: 1, remain: "5", resources: "1" }), "recalc", 3),
      step(6, "04 / PERIOD", "第一个周期正常触发", "目标仍有效，t=2 派生一次周期结果。", "周期事件新增 Tick@t=2。", "每次 Tick 都是一个可验证的状态转移。", state({ runtime: "ACTIVE", active: true, current: 120, stack: 1, remain: "4", events: ["Tick @ t=2：已派生"], periodStart: "t=2", resources: "1" }), "period", 3),
      step(6, "05 / BOUNDARY", "下次 Tick 前目标失效", "目标在 t=3 失效。周期系统检查目标后停止派生，不访问已经消失的属性容器。", "没有 Tick@t=4；运行对象被标记进入标准移除。", "清理链必须容忍 Owner 先消失，这是持续与异步系统的基本边界。", state({ runtime: "TARGET MISSING", active: true, current: 120, stack: 1, remain: "3", events: ["Tick @ t=2：已派生", "t=3：目标失效，取消后续 Tick"], resources: "1" }), "period", 0),
      step(8, "06 / REMOVE", "复用 Deactivate 与 Remove", "停止参与重算、注销依赖；目标容器不存在时跳过容器写入。", "active=false，不再生成事件。", "边界分支应汇入标准清理，而不是另造一条不完整捷径。", state({ runtime: "REMOVING", active: false, stack: 0, remain: "—", events: ["Tick @ t=2：已派生", "t=3：目标失效，取消后续 Tick"], resources: "1" }), "remove", 1),
      step(9, "07 / RELEASE", "RuntimeEffect 独立释放", "即使目标已不存在，效果自己的周期数组和运行资源仍能释放。", "运行资源回到 0。", "资源所有权清楚，才能让目标与效果以任意顺序结束。", state({ runtime: "DESTROYED", resources: "0" }), "release", 2)
    ];
  }

  function makeOverflowSteps(p) {
    const shared = p.stack === "target" ? "不同来源共享" : "同一来源独立";
    return [
      step(0, "01 / CREATE", "准备一个可叠三层的效果", `叠层范围为“${shared}”，上限为 3。`, "创建第一份 RuntimeEffect。", "叠层范围决定查找已有对象时是否把 Source 放进键。", state({ runtime: "CREATED", resources: "1" }), "create", 0),
      step(4, "02 / ACTIVE", "第一层激活", "RuntimeEffect 进入 ActiveEffects，Current = 120。", "层数为 1，Duration 从 t=0 开始。", "第一次申请没有对象可合并。", state({ runtime: "ACTIVE", active: true, current: 120, stack: 1, remain: "6", durationStart: "t=0", resources: "1" }), "activate", 0),
      step(7, "03 / STACK", "第二次申请被合并", "找到相同叠层键的已有对象，新对象只提供本次上下文。", "层数变为 2，incoming 被销毁。", "保留一个运行对象能集中管理层数与时钟。", state({ runtime: "ACTIVE · MERGED", active: true, current: 140, stack: 2, remain: p.duration === "refresh" ? "6" : "4", durationStart: p.duration === "refresh" ? "t=2" : "t=0", incoming: "destroyed", resources: "1" }), "stack", 4),
      step(7, "04 / STACK", "第三次申请到达上限", "层数成功变为 3，Current = 160。", "栈已满；下一次申请进入溢出决策。", "到达上限本身仍是成功申请，可以按所选策略刷新时钟。", state({ runtime: "ACTIVE · LIMIT", active: true, current: 160, stack: 3, remain: p.duration === "refresh" ? "6" : "2", durationStart: p.duration === "refresh" ? "t=4" : "t=0", incoming: "destroyed", resources: "1" }), "stack", 2),
      step(7, "05 / CONFLICT", "第四次申请发生溢出", "本失败场景启用“拒绝溢出”。层数不能超过 3，Duration 也不刷新。", "incoming 被销毁；层数仍为 3，剩余时间继续减少。", "拒绝和刷新必须保持一致，否则用户会看到“失败申请却延长 Buff”的隐性副作用。", state({ runtime: "OVERFLOW DENIED", active: true, current: 160, stack: 3, remain: p.duration === "refresh" ? "4" : "1", durationStart: p.duration === "refresh" ? "t=4" : "t=0", incoming: "destroyed", resources: "1" }), "stack", 3),
      step(8, "06 / EXPIRE", "到期策略清除整个栈", "教学场景选择 ClearEntireStack，三层一起进入移除流程。", "active=false，Current 重算回 100。", "也可以设计为每次减少一层再刷新，但必须把策略明确展示。", state({ runtime: "REMOVING", active: false, current: 100, stack: 0, remain: "0", resources: "1" }), "remove", 0),
      step(9, "07 / RELEASE", "冲突路径也完整释放", "释放运行资源并销毁唯一保留的 RuntimeEffect。", "资源回到 0，没有溢出对象残留。", "失败路径与正常路径应共享同一个 Release 终点。", state({ runtime: "DESTROYED", resources: "0" }), "release", 2)
    ];
  }

  function renderCode(stepData) {
    const lines = code[stepData.codeKey];
    if (!lines) throw new Error(`未知伪代码阶段：${stepData.codeKey}`);
    elements.codeLines.replaceChildren();
    lines.forEach((line, index) => {
      const item = document.createElement("li");
      item.textContent = line || " ";
      item.classList.toggle("is-active", index === stepData.activeLine);
      elements.codeLines.append(item);
    });
    elements.codeStatus.textContent = stepData.codeKey.toUpperCase();
  }

  function renderTrack(stage) {
    elements.track.replaceChildren();
    lifecycle.forEach((name, index) => {
      const item = document.createElement("li");
      item.textContent = name;
      item.classList.toggle("is-past", index < stage);
      item.classList.toggle("is-current", index === stage);
      elements.track.append(item);
    });
  }

  function renderEvents(events) {
    elements.periodEvents.replaceChildren();
    const values = events.length ? events : ["尚未产生周期事件"];
    values.forEach((value) => {
      const item = document.createElement("li");
      item.textContent = value;
      elements.periodEvents.append(item);
    });
  }

  function renderMetrics(view) {
    const rows = [
      ["Source 属性", String(view.sourceValue)],
      ["Duration 起点", view.durationStart],
      ["Period 起点", view.periodStart],
      ["Incoming", view.incoming],
      ["运行资源", view.resources]
    ];
    elements.metrics.replaceChildren();
    rows.forEach(([key, value]) => {
      const wrapper = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = key;
      description.textContent = value;
      wrapper.append(term, description);
      elements.metrics.append(wrapper);
    });
  }

  function renderComparison(index, view) {
    const reapplyTime = Math.min(4, index);
    const keepExpire = 6;
    const refreshExpire = reapplyTime + 6;
    elements.compareKeep.textContent = `到期 t=${keepExpire}`;
    elements.compareRefresh.textContent = `到期 t=${refreshExpire}`;
    elements.compareCopy.textContent = view.stack > 0
      ? `当前选择：${elements.duration.selectedOptions[0].textContent}。重复申请发生在教学时刻 t=${reapplyTime}。`
      : "当重复申请成功时，Duration 是否刷新会改变最终到期点；拒绝溢出则两者都不刷新。";
  }

  function renderStep({ step: stepData, index, total, mode }) {
    const view = stepData.view;
    elements.phase.textContent = stepData.phase;
    elements.title.textContent = stepData.title;
    elements.copy.textContent = stepData.copy;
    elements.change.textContent = stepData.change;
    elements.why.textContent = stepData.why;
    elements.stepLabel.textContent = `STEP ${String(index + 1).padStart(2, "0")}`;
    elements.stepCount.textContent = `${index + 1} / ${total}`;
    elements.status.textContent = view.runtime;
    elements.base.textContent = view.base;
    elements.current.textContent = view.current;
    elements.runtime.textContent = view.runtime;
    elements.active.textContent = String(view.active);
    elements.stackCount.textContent = `${view.stack} / 3`;
    elements.remain.textContent = view.remain;
    renderTrack(stepData.stage);
    renderEvents(view.events);
    renderMetrics(view);
    renderComparison(index, view);
    renderCode(stepData);
    document.querySelector("[data-effect-lab]").dataset.mode = mode;
  }

  function currentSteps() {
    return cases[activeCase].makeSteps(policy());
  }

  function createPlayer() {
    if (player) player.destroy();
    player = window.XianyuInteractiveLab.createStepPlayer({
      steps: currentSteps(),
      autoStepMs: Number(elements.speed.value),
      endBehavior: "disable",
      dotElement: "button",
      dotsInteractive: true,
      controls: {
        previous: elements.previous,
        next: elements.next,
        auto: elements.auto,
        reset: elements.reset,
        dots: elements.dots
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
      renderStep,
      onModeChange: () => {}
    });
  }

  function syncCaseCopy() {
    const item = cases[activeCase];
    elements.problem.textContent = item.problem;
    elements.mechanism.textContent = item.mechanism;
    elements.boundary.textContent = item.boundary;
  }

  elements.caseTabs.forEach((button) => {
    button.addEventListener("click", () => {
      activeCase = button.dataset.case;
      elements.caseTabs.forEach((item) => {
        const selected = item === button;
        item.classList.toggle("is-active", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
      syncCaseCopy();
      player.replaceSteps(currentSteps());
    });
  });

  [elements.capture, elements.stack, elements.duration, elements.period].forEach((select) => {
    select.addEventListener("change", () => player.replaceSteps(currentSteps()));
  });
  elements.speed.addEventListener("change", createPlayer);

  if (!window.XianyuInteractiveLab) {
    throw new Error("Effect 生命周期实验需要 interactive-lab.js");
  }

  syncCaseCopy();
  createPlayer();
})();
