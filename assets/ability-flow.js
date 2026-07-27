(function bootstrapAbilityFlow() {
  "use strict";

  const code = {
    submit: [
      "ActivationRequest Submit(InputEvent input)",
      "{",
      "    Candidate candidate = ResolveCandidate(input);",
      "    Target target = ResolveTarget(candidate);",
      "    return queue.Enqueue(candidate, target);",
      "}"
    ],
    gate: [
      "ActivationResult CanActivate(Ability ability, Actor owner)",
      "{",
      "    if (!ability.IsValid || !owner.IsAlive) return Invalid;",
      "    if (ability.IsActive || ability.IsCancelling) return Busy;",
      "    if (owner.BlocksPriority(ability.Priority)) return PriorityBlocked;",
      "    if (!owner.Tags.Match(ability.TagRule)) return TagBlocked;",
      "    if (!ability.Cost.CanAfford(owner)) return ResourceInsufficient;",
      "    if (!ability.Cooldown.HasAvailableUse) return Cooldown;",
      "    return Success;",
      "}"
    ],
    activate: [
      "void ConsumeRequest(ActivationRequest request)",
      "{",
      "    RequireSuccess(CanActivate(request.Ability, request.Owner));",
      "    request.Ability.Cooldown.ConsumeUse();",
      "    request.Owner.Tags.AddTemporary(source: request.Ability);",
      "    Context context = contexts.Begin(request);",
      "    Instance instance = instances.Begin(request, context);",
      "    request.Ability.MarkActive();",
      "    request.Ability.Orchestrator.Start(instance);",
      "}"
    ],
    cost: [
      "void CostNode(ExecutionContext context)",
      "{",
      "    // 费用在编排的明确节点执行。",
      "    context.Owner.Resource -= context.Ability.Cost;",
      "    context.Set(\"cost-paid\", true);",
      "}"
    ],
    hit: [
      "void HitNode(ExecutionContext context)",
      "{",
      "    Candidates candidates = shape.Query(context.World);",
      "    Targets targets = filters.Apply(candidates);",
      "    foreach (Target target in targets)",
      "        effects.Apply(context.Source, target);",
      "    feedback.Play(context, targets);",
      "}"
    ],
    finish: [
      "void FinishAbility(Instance instance)",
      "{",
      "    instance.Orchestrator.FinishActiveTasks();",
      "    CleanupActivation(instance);",
      "    events.PublishEnded(instance);",
      "}"
    ],
    reject: [
      "void Reject(ActivationRequest request, ActivationResult reason)",
      "{",
      "    request.MarkRejected(reason);",
      "    events.PublishRejected(request, reason);",
      "    // 没有创建实例，也没有激活副作用。",
      "}"
    ],
    interrupt: [
      "void InterruptAbility(Instance oldInstance)",
      "{",
      "    oldInstance.Orchestrator.InterruptActiveTasks();",
      "    oldInstance.Cooldown.EnsureStarted();",
      "    CleanupActivation(oldInstance);",
      "    events.PublishCancelled(oldInstance);",
      "}"
    ],
    cleanup: [
      "void CleanupActivation(Instance instance)",
      "{",
      "    instance.Ability.MarkInactive();",
      "    instance.Owner.Tags.RemoveTemporary(source: instance.Ability);",
      "    contexts.End(instance.Ability);",
      "    instances.End(instance.Ability);",
      "}"
    ]
  };

  const baseState = Object.freeze({
    resource: 100,
    resourceMax: 100,
    costStatus: "花费 30 · 尚未扣除",
    request: "待处理",
    tags: "可释放",
    cooldown: "就绪 · 1 次",
    active: "false",
    instance: "—",
    context: "—"
  });

  function step(data) {
    return Object.freeze({
      stage: "input",
      phase: "INPUT",
      title: "",
      copy: "",
      change: "",
      why: "",
      result: "",
      tone: "running",
      codeKey: "submit",
      codeTitle: "提交请求",
      codeStatus: "QUEUE",
      activeLines: [4],
      state: baseState,
      events: [],
      ...data,
      state: Object.freeze({ ...baseState, ...(data.state || {}) })
    });
  }

  const scenarios = Object.freeze({
    normal: Object.freeze({
      parameter: "场景参数 · 资源 100 / 花费 30 / CD 6s",
      steps: Object.freeze([
        step({
          title: "输入只提交意图",
          copy: "按键被翻译为激活请求，此时不扣资源，也不创建运行实例。",
          change: "request：无 → 待处理",
          why: "把输入与副作用分开，才能排队、合并并在系统更新时二次裁决。",
          result: "请求已入队",
          events: ["Input.Pressed", "Request.Queued"]
        }),
        step({
          stage: "gate", phase: "SYNCHRONOUS GATE", title: "同步预检依次通过",
          copy: "有效性、活动状态、优先级、标签、资源与冷却依次检查，返回明确原因。",
          change: "gate：未检查 → Success",
          why: "稳定顺序让失败原因可复现，也避免先做昂贵工作。",
          result: "同步预检通过", codeKey: "gate", codeTitle: "激活条件", codeStatus: "SUCCESS",
          activeLines: [2, 3, 4, 5, 6, 7, 8], events: ["Request.Queued", "Gate.Success"]
        }),
        step({
          stage: "gate", phase: "SYSTEM UPDATE", title: "消费请求前再次裁决",
          copy: "系统更新真正消费请求。队列等待期间状态可能变化，所以不能复用旧结论。",
          change: "request：待处理 → 消费中",
          why: "二次裁决关闭了“预检通过后状态已变化”的竞态窗口。",
          result: "二次裁决通过", codeKey: "activate", codeTitle: "消费激活请求", codeStatus: "RECHECK",
          activeLines: [2], state: { request: "消费中" }, events: ["Gate.Success", "Request.Consuming"]
        }),
        step({
          stage: "instance", phase: "ACTIVATE", title: "建立本次运行身份",
          copy: "消耗一次可用次数、添加带来源的临时标签，并建立实例与上下文。",
          change: "Active false → true；instance / context 已创建",
          why: "配置是模板；实例和上下文隔离“这一次”的可变状态。",
          result: "技能进入 Active", codeKey: "activate", codeTitle: "创建运行实例", codeStatus: "BEGIN",
          activeLines: [3, 4, 5, 6, 7], state: {
            request: "已消费", tags: "施法中 · 来源=本次技能", cooldown: "0 次 · 等待启动",
            active: "true", instance: "run-01", context: "已创建"
          }, events: ["Request.Consumed", "Instance.Begun", "Ability.Active"]
        }),
        step({
          stage: "orchestrate", phase: "ORCHESTRATE", title: "编排器启动",
          copy: "Flow 选择路径，Timeline 把动作、费用、命中与反馈安排到确定位置。",
          change: "orchestrator：Idle → Running",
          why: "规则裁决与表现时序分开后，两者才能独立测试。",
          result: "进入前摇片段", codeKey: "activate", codeTitle: "启动编排", codeStatus: "START",
          activeLines: [8], state: {
            request: "已消费", tags: "施法中 · 来源=本次技能", cooldown: "0 次 · 等待启动",
            active: "true", instance: "run-01", context: "frame=0"
          }, events: ["Instance.Begun", "Timeline.Play", "Clip.Begin"]
        }),
        step({
          stage: "orchestrate", phase: "COST NODE", title: "费用在明确节点扣除",
          copy: "资源校验发生在激活门；实际扣费由编排中的费用节点执行。",
          change: "resource：100 → 70；context.cost-paid：false → true",
          why: "分开校验与扣除可以表达前摇或蓄力，但中断时必须知道节点是否已执行。",
          result: "费用已支付", codeKey: "cost", codeTitle: "费用节点", codeStatus: "APPLY",
          activeLines: [2, 3, 4], state: {
            resource: 70, costStatus: "花费 30 · 已扣除", request: "已消费",
            tags: "施法中 · 来源=本次技能", cooldown: "6.0s · 已启动",
            active: "true", instance: "run-01", context: "cost-paid=true"
          }, events: ["Clip.Begin", "Cost.Applied", "Cooldown.Started"]
        }),
        step({
          stage: "target", phase: "TARGET QUERY", title: "候选不等于命中",
          copy: "形状查询先缩小候选，再检查阵营、存活、距离、角度和重复命中约束。",
          change: "候选 4 → 最终目标 2",
          why: "分层筛选才能解释每个目标为什么入选或被排除。",
          result: "命中目标已确定", codeKey: "hit", codeTitle: "目标与命中", codeStatus: "FILTER",
          activeLines: [2, 3], state: {
            resource: 70, costStatus: "花费 30 · 已扣除", request: "已消费",
            tags: "施法中 · 来源=本次技能", cooldown: "5.4s",
            active: "true", instance: "run-01", context: "targets=2"
          }, events: ["Cost.Applied", "Query.Candidates=4", "Hit.Targets=2"]
        }),
        step({
          stage: "effect", phase: "SETTLEMENT", title: "结算与反馈消费命中结果",
          copy: "Effect 管线处理属性或持续状态；动画、音效和特效任务同步消费本次上下文。",
          change: "effects：0 → 2；feedback：等待 → 播放",
          why: "编排只决定何时发生，Effect 与反馈系统各自决定如何执行。",
          result: "命中已结算", codeKey: "hit", codeTitle: "Effect 与反馈", codeStatus: "APPLY",
          activeLines: [4, 5], state: {
            resource: 70, costStatus: "花费 30 · 已扣除", request: "已消费",
            tags: "施法中 · 来源=本次技能", cooldown: "5.0s",
            active: "true", instance: "run-01", context: "targets=2 · effects=2"
          }, events: ["Hit.Targets=2", "Effects.Applied", "Feedback.Play"]
        }),
        step({
          stage: "cleanup", phase: "FINISH", title: "编排自然到达终点",
          copy: "活动任务收到 Finish；持续 Effect 是否继续存在，由它自己的生命周期规则决定。",
          change: "orchestrator：Running → Finished",
          why: "正常结束与中断语义不同，活动任务不能统一粗暴停止。",
          result: "进入正常清理", codeKey: "finish", codeTitle: "正常结束", codeStatus: "FINISH",
          activeLines: [2], state: {
            resource: 70, costStatus: "花费 30 · 已扣除", request: "已消费",
            tags: "施法中 · 待恢复", cooldown: "4.5s",
            active: "true", instance: "run-01", context: "待清理"
          }, events: ["Feedback.Play", "Timeline.End", "Tasks.Finish"]
        }),
        step({
          stage: "cleanup", phase: "CLEANUP", title: "收回本次激活状态",
          copy: "移除 Active、按来源恢复临时标签、结束上下文并注销实例。",
          change: "Active true → false；instance / context → 无",
          why: "结束是一组可验证的对称操作，不只是停止播放器。",
          result: "正常释放完成", tone: "success", codeKey: "cleanup", codeTitle: "统一清理", codeStatus: "ENDED",
          activeLines: [2, 3, 4, 5], state: {
            resource: 70, costStatus: "花费 30 · 已扣除", request: "完成",
            tags: "已恢复", cooldown: "4.5s", active: "false", instance: "—", context: "—"
          }, events: ["Tasks.Finish", "Tags.Restored", "Instance.Ended"]
        })
      ])
    }),
    resource: Object.freeze({
      parameter: "场景参数 · 资源 20 / 花费 30 / CD 6s",
      steps: Object.freeze([
        step({
          title: "低资源状态下提交请求", copy: "请求仍然可以进入同步预检，输入层不猜测属性规则。",
          change: "request：无 → 待处理", why: "所有调用入口共享同一个资源裁决器。",
          result: "请求已入队", state: { resource: 20, costStatus: "花费 30 · 尚未扣除" },
          events: ["Input.Pressed", "Request.Queued"]
        }),
        step({
          stage: "gate", phase: "GATE / TAGS", title: "前置闸门通过",
          copy: "有效性、活动状态、优先级和标签均允许继续。",
          change: "检查位置：标签 → 资源", why: "失败原因由第一道未通过的门决定。",
          result: "进入资源试算", codeKey: "gate", codeTitle: "依序裁决", codeStatus: "CHECK",
          activeLines: [2, 3, 4, 5], state: { resource: 20, costStatus: "花费 30 · 尚未扣除" },
          events: ["Request.Queued", "Tags.Passed"]
        }),
        step({
          stage: "gate", phase: "GATE / RESOURCE", title: "试算结果小于零",
          copy: "当前资源 20，教学花费 30；试算后的资源为 -10，因此返回资源不足。",
          change: "result：Pending → ResourceInsufficient", why: "在创建实例前拒绝，避免先扣除再回滚。",
          result: "资源不足，拒绝激活", tone: "failed", codeKey: "gate", codeTitle: "资源闸门", codeStatus: "REJECT",
          activeLines: [6], state: {
            resource: 20, costStatus: "花费 30 · 未扣除", request: "已拒绝 · 资源不足",
            tags: "未改变", cooldown: "就绪 · 1 次"
          }, events: ["Tags.Passed", "Cost.Preview=-10", "Gate.Rejected"]
        }),
        step({
          stage: "gate", phase: "REJECT", title: "失败保持运行态不变",
          copy: "没有 Active、实例、上下文或临时标签；资源与可用次数也保持原值。",
          change: "仅发布拒绝原因，其余状态不变", why: "失败路径越短、越少副作用，越容易重试和调试。",
          result: "拒绝流程完成", tone: "failed", codeKey: "reject", codeTitle: "拒绝请求", codeStatus: "NO SIDE EFFECT",
          activeLines: [2, 3, 4], state: {
            resource: 20, costStatus: "花费 30 · 未扣除", request: "已拒绝 · 资源不足",
            tags: "未改变", cooldown: "就绪 · 1 次"
          }, events: ["Cost.Preview=-10", "Gate.Rejected", "Rejected.Published"]
        })
      ])
    }),
    tag: Object.freeze({
      parameter: "场景参数 · 当前标签「沉默」/ 规则 none:「沉默」",
      steps: Object.freeze([
        step({
          title: "带着当前标签提交请求", copy: "教学角色当前拥有「沉默」，输入层仍只提交意图。",
          change: "request：无 → 待处理", why: "标签可能由多个来源改变，裁决应集中在激活门。",
          result: "请求已入队", state: { tags: "沉默 · 来源=状态效果" },
          events: ["Input.Pressed", "Request.Queued"]
        }),
        step({
          stage: "gate", phase: "TAG RULE / ALL", title: "all 条件检查通过",
          copy: "该场景没有缺失的必需标签，因此继续检查 any 与 none。",
          change: "all：通过", why: "把 all / any / none 展开，比一个“标签失败”更可调试。",
          result: "继续检查标签", codeKey: "gate", codeTitle: "标签闸门", codeStatus: "ALL PASS",
          activeLines: [5], state: { tags: "沉默 · all 通过" }, events: ["Request.Queued", "Tags.AllPassed"]
        }),
        step({
          stage: "gate", phase: "TAG RULE / NONE", title: "none 条件命中禁用标签",
          copy: "规则要求一个「沉默」都不能拥有，但当前集合中存在该标签。",
          change: "none：通过 → 失败", why: "页面同时显示标签值和来源，才能定位是谁阻止了激活。",
          result: "标签条件不满足", tone: "failed", codeKey: "gate", codeTitle: "标签闸门", codeStatus: "BLOCKED",
          activeLines: [5], state: { request: "已拒绝 · 标签阻止", tags: "沉默 · 冲突", cooldown: "就绪 · 1 次" },
          events: ["Tags.AllPassed", "Tags.NoneConflict", "Gate.Rejected"]
        }),
        step({
          stage: "gate", phase: "SOURCE TRACE", title: "追踪阻止标签的来源",
          copy: "冲突标签来自一个仍在生效的状态效果，而不是来自技能自身。",
          change: "诊断：沉默 → 来源=状态效果", why: "临时标签必须带来源，移除时才不会误删其他系统的同名标签。",
          result: "阻止来源已定位", tone: "failed", codeKey: "reject", codeTitle: "发布明确原因", codeStatus: "TRACE",
          activeLines: [2, 3], state: { request: "已拒绝 · 标签阻止", tags: "沉默 · 来源已定位" },
          events: ["Tags.NoneConflict", "Source.Resolved", "Rejected.Published"]
        }),
        step({
          stage: "gate", phase: "REJECT", title: "没有产生激活副作用",
          copy: "运行实例和上下文从未创建，资源、冷却与 Active 都没有变化。",
          change: "仅保留可观察的拒绝记录", why: "标签失败不应该偷偷消耗资源或使用次数。",
          result: "拒绝流程完成", tone: "failed", codeKey: "reject", codeTitle: "拒绝请求", codeStatus: "NO SIDE EFFECT",
          activeLines: [4], state: { request: "已拒绝 · 标签阻止", tags: "沉默 · 未改变" },
          events: ["Source.Resolved", "Gate.Rejected", "State.Unchanged"]
        })
      ])
    }),
    interrupt: Object.freeze({
      parameter: "场景参数 · 旧优先级 1 / 新优先级 3 / CD 6s",
      steps: Object.freeze([
        step({
          stage: "orchestrate", phase: "OLD INSTANCE", title: "旧技能正在运行",
          copy: "旧实例已进入 Timeline，临时标签和上下文仍属于旧技能。",
          change: "旧实例：Active / Running", why: "打断不是覆盖一个布尔值，而是两个实例的状态交接。",
          result: "旧技能运行中", codeKey: "hit", codeTitle: "旧编排片段", codeStatus: "RUNNING",
          activeLines: [1], state: {
            resource: 70, costStatus: "旧技能费用已支付", request: "无",
            tags: "旧施法中 · 来源=旧技能", cooldown: "旧技能 5.2s",
            active: "true · 旧技能", instance: "run-old", context: "frame=5"
          }, events: ["Old.Active", "Old.Timeline.Tick"]
        }),
        step({
          stage: "input", phase: "NEW REQUEST", title: "更高优先级请求到达",
          copy: "新技能优先级 3，高于旧技能优先级 1。",
          change: "new request：无 → 待处理", why: "新请求仍然要经过完整裁决，优先级高不代表跳过资源或标签。",
          result: "新请求已入队", codeKey: "submit", codeTitle: "提交新请求", codeStatus: "QUEUE",
          activeLines: [4], state: {
            resource: 70, costStatus: "新技能花费尚未扣除", request: "新技能待处理",
            tags: "旧施法中 · 来源=旧技能", cooldown: "旧技能 5.2s",
            active: "true · 旧技能", instance: "run-old", context: "frame=5"
          }, events: ["Old.Timeline.Tick", "New.Request.Queued"]
        }),
        step({
          stage: "gate", phase: "PRIORITY GATE", title: "优先级允许新技能进入",
          copy: "直接释放会拒绝同级或更低优先级；当前新技能更高，因此继续其他闸门。",
          change: "priority：3 > 1 → 通过", why: "优先级只决定能否打断，不替代其余激活条件。",
          result: "新技能裁决通过", codeKey: "gate", codeTitle: "优先级闸门", codeStatus: "3 > 1",
          activeLines: [4, 5, 6, 7, 8], state: {
            resource: 70, costStatus: "新技能花费尚未扣除", request: "新技能消费中",
            tags: "旧施法中 · 来源=旧技能", cooldown: "旧技能 5.2s",
            active: "true · 旧技能", instance: "run-old", context: "frame=5"
          }, events: ["New.Request.Queued", "Priority.Passed", "Gate.Success"]
        }),
        step({
          stage: "instance", phase: "NEW INSTANCE", title: "新实例先成功激活",
          copy: "新实例建立后，旧低优先级实例被标记为待取消。",
          change: "new Active=true；old cancel=pending", why: "先确认新技能成功，再取消旧技能，避免失败请求破坏当前运行。",
          result: "新旧实例短暂交接", codeKey: "activate", codeTitle: "新实例激活", codeStatus: "HANDOFF",
          activeLines: [3, 4, 5, 6, 7], state: {
            resource: 70, costStatus: "新技能花费尚未扣除", request: "旧技能待取消",
            tags: "旧+新临时标签并存", cooldown: "新技能 0 次 · 等待启动",
            active: "true · 新 / 旧待取消", instance: "run-new + run-old", context: "新旧上下文并存"
          }, events: ["Gate.Success", "New.Instance.Begun", "Old.CancelQueued"]
        }),
        step({
          stage: "cleanup", phase: "INTERRUPT OLD", title: "旧活动任务收到 Interrupt",
          copy: "旧 Timeline 的活动 Clip 或 Flow 当前节点立即执行中断语义。",
          change: "旧 orchestrator：Running → Interrupted", why: "若只停止 Tick，控制锁、循环音效或活动特效可能残留。",
          result: "旧编排已中断", tone: "interrupt", codeKey: "interrupt", codeTitle: "中断旧实例", codeStatus: "INTERRUPT",
          activeLines: [2], state: {
            resource: 70, costStatus: "新技能花费尚未扣除", request: "旧技能取消中",
            tags: "旧标签待恢复 · 新标签保留", cooldown: "旧 5.2s / 新待启动",
            active: "true · 新 / 旧取消中", instance: "run-new + run-old", context: "旧上下文待清理"
          }, events: ["Old.CancelQueued", "Old.Tasks.Interrupt"]
        }),
        step({
          stage: "cleanup", phase: "CLEAN OLD", title: "旧实例按来源清理",
          copy: "恢复旧技能添加的标签，清旧上下文和实例；新技能的同名状态不会被误删。",
          change: "run-old → 无；旧来源标签 → 移除", why: "按来源清理保证多个系统持有同名标签时彼此独立。",
          result: "旧实例取消完成", tone: "interrupt", codeKey: "cleanup", codeTitle: "清理旧实例", codeStatus: "OLD ENDED",
          activeLines: [2, 3, 4, 5], state: {
            resource: 70, costStatus: "新技能花费尚未扣除", request: "新技能已激活",
            tags: "新施法中 · 来源=新技能", cooldown: "旧 5.2s / 新待启动",
            active: "true · 新技能", instance: "run-new", context: "new context"
          }, events: ["Old.Tasks.Interrupt", "Old.Tags.Restored", "Old.Instance.Ended"]
        }),
        step({
          stage: "orchestrate", phase: "RUN NEW", title: "新技能继续自己的编排",
          copy: "旧实例清理完成后，新实例按自己的 Timeline 或 Flow 推进。",
          change: "new orchestrator：Ready → Running", why: "打断完成的是状态所有权交接，不是全局停止。",
          result: "新技能运行中", codeKey: "activate", codeTitle: "启动新编排", codeStatus: "NEW RUNNING",
          activeLines: [8], state: {
            resource: 40, costStatus: "新技能花费 30 · 已扣除", request: "新技能已消费",
            tags: "新施法中 · 来源=新技能", cooldown: "新技能 6.0s",
            active: "true · 新技能", instance: "run-new", context: "cost-paid=true"
          }, events: ["Old.Instance.Ended", "New.Cost.Applied", "New.Timeline.Play"]
        }),
        step({
          stage: "cleanup", phase: "NEW FINISH", title: "新技能正常结束",
          copy: "新任务 Finish，随后恢复新标签、清新上下文与实例。",
          change: "run-new → 无；Active true → false", why: "中断旧技能不会改变新技能最终仍需对称清理的事实。",
          result: "优先级打断场景完成", tone: "success", codeKey: "cleanup", codeTitle: "清理新实例", codeStatus: "ENDED",
          activeLines: [2, 3, 4, 5], state: {
            resource: 40, costStatus: "新技能花费 30 · 已扣除", request: "完成",
            tags: "已恢复", cooldown: "新技能 5.1s", active: "false", instance: "—", context: "—"
          }, events: ["New.Timeline.End", "New.Tags.Restored", "New.Instance.Ended"]
        })
      ])
    })
  });

  function byId(id) {
    const element = document.getElementById(id);
    if (!(element instanceof HTMLElement)) {
      throw new Error(`[AbilityFlow] 缺少元素 #${id}`);
    }
    return element;
  }

  const elements = {
    phase: byId("phase"),
    title: byId("step-title"),
    copy: byId("step-copy"),
    change: byId("step-change"),
    why: byId("step-why"),
    resultBanner: byId("result-banner"),
    result: byId("result-text"),
    parameter: byId("scenario-parameter"),
    resourceValue: byId("resource-value"),
    resourceMeter: byId("resource-meter"),
    costStatus: byId("cost-status"),
    request: byId("request-state"),
    tags: byId("tag-state"),
    cooldown: byId("cooldown-state"),
    active: byId("active-state"),
    instance: byId("instance-state"),
    context: byId("context-state"),
    events: byId("event-trace"),
    codeTitle: byId("code-title"),
    codeStatus: byId("code-status"),
    codeLines: byId("code-lines"),
    stepLabel: byId("step-label"),
    stepCount: byId("step-count"),
    previous: byId("prev-button"),
    next: byId("next-button"),
    auto: byId("auto-button"),
    reset: byId("reset-button"),
    dots: byId("step-dots"),
    speed: byId("speed-seconds"),
    speedMessage: byId("speed-message"),
    map: byId("run-map")
  };

  const tabs = Array.from(document.querySelectorAll("[data-scenario]"));
  if (tabs.length !== Object.keys(scenarios).length) {
    throw new Error("[AbilityFlow] 场景按钮数量与数据不一致");
  }

  let scenarioKey = "normal";
  let player = null;

  function readAutoStepMs() {
    const seconds = Number(elements.speed.value);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new Error("每步停留秒数必须大于 0");
    }
    return Math.round(seconds * 1000);
  }

  function renderCode(currentStep) {
    const lines = code[currentStep.codeKey];
    elements.codeLines.replaceChildren();
    lines.forEach((line, index) => {
      const item = document.createElement("li");
      item.textContent = line || " ";
      item.classList.toggle("is-active", currentStep.activeLines.includes(index));
      elements.codeLines.append(item);
    });
    elements.codeTitle.textContent = currentStep.codeTitle;
    elements.codeStatus.textContent = currentStep.codeStatus;
  }

  function renderMap(currentStep) {
    const order = ["input", "gate", "instance", "orchestrate", "target", "effect", "cleanup"];
    const currentIndex = order.indexOf(currentStep.stage);
    Array.from(elements.map.querySelectorAll(".map-node")).forEach((node) => {
      const nodeIndex = order.indexOf(node.getAttribute("data-stage"));
      node.classList.toggle("is-past", nodeIndex < currentIndex);
      node.classList.toggle("is-current", nodeIndex === currentIndex);
      node.classList.toggle("is-failed", nodeIndex === currentIndex && currentStep.tone === "failed");
    });
  }

  function renderState(currentStep) {
    const state = currentStep.state;
    elements.resourceValue.textContent = `${state.resource} / ${state.resourceMax}`;
    elements.resourceMeter.style.width = `${(state.resource / state.resourceMax) * 100}%`;
    elements.resourceMeter.style.background = state.resource < 30 ? "var(--red)" : "var(--cyan)";
    elements.costStatus.textContent = state.costStatus;
    elements.request.textContent = state.request;
    elements.tags.textContent = state.tags;
    elements.cooldown.textContent = state.cooldown;
    elements.active.textContent = state.active;
    elements.instance.textContent = state.instance;
    elements.context.textContent = state.context;
    const failed = currentStep.tone === "failed";
    elements.request.setAttribute("data-alert", String(failed));
    elements.tags.setAttribute("data-alert", String(failed && scenarioKey === "tag"));
  }

  function renderEvents(events) {
    elements.events.replaceChildren();
    events.forEach((eventName) => {
      const item = document.createElement("li");
      item.textContent = eventName;
      elements.events.append(item);
    });
  }

  function renderStep({ step: currentStep, index, total }) {
    elements.phase.textContent = currentStep.phase;
    elements.title.textContent = currentStep.title;
    elements.copy.textContent = currentStep.copy;
    elements.change.textContent = currentStep.change;
    elements.why.textContent = currentStep.why;
    elements.result.textContent = currentStep.result;
    elements.resultBanner.setAttribute("data-tone", currentStep.tone);
    elements.stepLabel.textContent = `STEP ${String(index + 1).padStart(2, "0")}`;
    elements.stepCount.textContent = `${index + 1} / ${total}`;
    renderState(currentStep);
    renderEvents(currentStep.events);
    renderCode(currentStep);
    renderMap(currentStep);
  }

  function createPlayer() {
    const scenario = scenarios[scenarioKey];
    elements.parameter.textContent = scenario.parameter;
    player = window.XianyuInteractiveLab.createStepPlayer({
      steps: scenario.steps,
      autoStepMs: readAutoStepMs(),
      endBehavior: "restart",
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
        play: "▶ 自动播放",
        pause: "Ⅱ 暂停",
        complete: "自动完成",
        next: "下一步 →",
        done: "演示完成",
        dot: (index, total) => `第 ${index + 1} 步，共 ${total} 步`
      },
      classes: {
        playing: "is-playing",
        dot: "step-dot",
        dotActive: "is-active",
        dotPast: "is-past"
      },
      renderStep,
      onModeChange: ({ mode }) => {
        elements.speed.disabled = mode === "auto";
      }
    });
  }

  function switchScenario(nextKey) {
    if (!Object.prototype.hasOwnProperty.call(scenarios, nextKey)) {
      throw new Error(`[AbilityFlow] 未知场景 ${nextKey}`);
    }
    if (player !== null) player.destroy();
    scenarioKey = nextKey;
    tabs.forEach((tab) => {
      const selected = tab.getAttribute("data-scenario") === nextKey;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-pressed", String(selected));
    });
    createPlayer();
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchScenario(tab.getAttribute("data-scenario")));
  });

  elements.speed.addEventListener("change", () => {
    try {
      const seconds = Number(elements.speed.value);
      readAutoStepMs();
      elements.speedMessage.textContent = `自动播放将每 ${seconds} 秒推进一步`;
      switchScenario(scenarioKey);
    } catch (error) {
      if (player !== null) player.pause();
      elements.speedMessage.textContent = error.message;
      elements.speed.focus();
    }
  });

  if (!window.XianyuInteractiveLab) {
    throw new Error("[AbilityFlow] 共享交互播放器未加载");
  }
  createPlayer();
})();
