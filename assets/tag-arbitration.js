(function bootstrapTagArbitration() {
  "use strict";

  const EMPTY = Object.freeze([]);
  const code = Object.freeze({
    ledger: Object.freeze([
      "bool HasEffectiveTag(Tag query) {",
      "    if (fixedTags.Satisfy(query)) return true;",
      "",
      "    // 查询聚合，账本仍保留精确来源。",
      "    return temporaryTags.Any(entry =>",
      "        entry.Tag.Satisfies(query));",
      "}"
    ]),
    addTemporary: Object.freeze([
      "bool AddTemporary(Source source, Tag tag) {",
      "    if (ledger.Contains(source, tag))",
      "        return false;",
      "",
      "    ledger.Add(source, tag);",
      "    return true;",
      "}"
    ]),
    removeSource: Object.freeze([
      "void RemoveSource(Source source) {",
      "    // 只删除这个来源的记录。",
      "    ledger.RemoveWhere(entry =>",
      "        entry.Source == source);",
      "",
      "    RecomputeEffectiveTags();",
      "}"
    ]),
    directGate: Object.freeze([
      "Result CheckDirect(Priority incoming) {",
      "    foreach (Ability current in active) {",
      "        if (current.Priority > NONE",
      "            && current.Priority >= incoming)",
      "            return BLOCKED;",
      "    }",
      "    return ALLOWED;",
      "}"
    ]),
    directHandoff: Object.freeze([
      "void ActivateAndHandoff(Request next) {",
      "    Instance created = Begin(next);",
      "    if (created == null) return;",
      "",
      "    // 新实例成立后，再取消严格低级的旧实例。",
      "    foreach (Ability old in active)",
      "        if (old.Priority < next.Priority)",
      "            old.RequestCancel();",
      "}"
    ]),
    window: Object.freeze([
      "QueueResult QueueInWindow(Input next) {",
      "    if (next.Priority > current.Priority)",
      "        return CancelAndQueue(next);",
      "",
      "    if (queued == null) {",
      "        queued = next; // 同级/低级：首个缓存",
      "        return BUFFERED;",
      "    }",
      "    return FIRST_INPUT_WINS;",
      "}"
    ]),
    postWindow: Object.freeze([
      "QueueResult QueueAfterWindow(Input next) {",
      "    // PostWindow 不比较优先级。",
      "    current.RequestCancel();",
      "    queued = next;",
      "    phase = AWAITING_RELEASE;",
      "    return CANCEL_AND_QUEUE;",
      "}"
    ]),
    external: Object.freeze([
      "bool TryExternalInterrupt(Target current) {",
      "    if (!range.Contains(current.Priority))",
      "        return false;",
      "",
      "    if (strength.IsLimited",
      "        && current.Priority > strength.Maximum)",
      "        return false;",
      "",
      "    current.RequestCancel();",
      "    return true;",
      "}"
    ])
  });

  const baseState = Object.freeze({
    query: "动作",
    effective: true,
    fixed: EMPTY,
    temporary: EMPTY,
    route: "来源账本",
    phase: "—",
    current: "—",
    incoming: "—",
    queued: "—",
    decision: "记录来源"
  });

  function step(overrides) {
    return Object.freeze({
      route: "ledger",
      phase: "SOURCE / ADD",
      title: "固定状态进入账本",
      copy: "固定标签表示长期状态，不依赖临时运行实例。",
      change: "fixed：空 → 可行动",
      reason: "先保留原始来源，聚合查询才不会丢失所有权。",
      cost: "写入 O(1)；查询还要考虑标签层级。",
      result: "账本已建立",
      tone: "running",
      codeKey: "ledger",
      codeTitle: "查询有效标签",
      codeStatus: "LEDGER",
      activeLines: Object.freeze([1]),
      state: Object.freeze({ ...baseState, fixed: Object.freeze(["角色规则 · 可行动"]) }),
      events: Object.freeze(["Fixed.Add", "Effective=true"]),
      ...overrides
    });
  }

  const scenarios = Object.freeze({
    ledger: Object.freeze({
      note: "教学标签：动作 / 动作.施法",
      steps: Object.freeze([
        step({}),
        step({
          phase: "SOURCE / TEMP A", title: "运行实例添加叶子标签",
          copy: "实例 A 提供“动作.施法”。查询父级“动作”同样返回有效。",
          change: "临时来源：0 → 1", reason: "层级改变查询结果，但不改变精确所有权。",
          cost: "同一来源重复添加会被去重。",
          result: "父级查询命中", codeKey: "addTemporary", codeTitle: "写入临时来源", codeStatus: "SOURCE A",
          activeLines: Object.freeze([1, 4, 5]), state: Object.freeze({
            ...baseState, fixed: Object.freeze(["角色规则 · 可行动"]),
            temporary: Object.freeze(["实例 A · 动作.施法"]), decision: "新增来源 A"
          }), events: Object.freeze(["SourceA.AddLeaf", "Hierarchy.Match", "Effective=true"])
        }),
        step({
          phase: "SOURCE / TEMP B", title: "第二个来源提供同名状态",
          copy: "持续状态 B 也提供“动作.施法”，账本保留两条临时记录。",
          change: "临时来源：1 → 2", reason: "裸布尔值无法回答之后应该撤销谁。",
          cost: "查询扫描记录数；需要高频查询时可另建索引。",
          result: "两个临时来源并存", codeKey: "addTemporary", codeTitle: "写入第二来源", codeStatus: "SOURCE B",
          activeLines: Object.freeze([1, 4, 5]), state: Object.freeze({
            ...baseState, fixed: Object.freeze(["角色规则 · 可行动"]),
            temporary: Object.freeze(["实例 A · 动作.施法", "状态 B · 动作.施法"]), decision: "新增来源 B"
          }), events: Object.freeze(["SourceA.Active", "SourceB.AddLeaf", "Effective=true"])
        }),
        step({
          phase: "QUERY / AGGREGATE", title: "查询聚合三个来源",
          copy: "固定集合和两个临时来源共同满足“动作”，但彼此仍独立。",
          change: "原始账本不变；聚合结果=true", reason: "查询可以聚合，清理不能反向猜测来源。",
          cost: "查询约为 O(要求数 × 标签记录数)。",
          result: "有效状态保持", tone: "success", codeKey: "ledger", codeTitle: "层级聚合查询", codeStatus: "TRUE",
          activeLines: Object.freeze([1, 4, 5]), state: Object.freeze({
            ...baseState, fixed: Object.freeze(["角色规则 · 可行动"]),
            temporary: Object.freeze(["实例 A · 动作.施法", "状态 B · 动作.施法"]), decision: "聚合查询=true"
          }), events: Object.freeze(["Fixed.Match", "Temporary.Match", "Effective=true"])
        }),
        step({
          phase: "CLEAN / SOURCE A", title: "实例 A 只撤销自己的记录",
          copy: "状态 B 仍然提供叶子标签，固定来源也没有变化。",
          change: "临时来源：2 → 1；有效状态仍为 true", reason: "按来源移除避免一个系统结束时误删另一个系统。",
          cost: "清理成本取决于该来源记录数或索引结构。",
          result: "其他来源未受影响", tone: "success", codeKey: "removeSource", codeTitle: "按来源清理", codeStatus: "SOURCE A",
          activeLines: Object.freeze([1, 2, 3, 5]), state: Object.freeze({
            ...baseState, fixed: Object.freeze(["角色规则 · 可行动"]),
            temporary: Object.freeze(["状态 B · 动作.施法"]), decision: "仅移除来源 A"
          }), events: Object.freeze(["SourceA.Remove", "SourceB.Remains", "Effective=true"])
        })
      ])
    }),
    takeover: Object.freeze({
      note: "教学优先级：当前 LOW / 输入 HIGH",
      steps: Object.freeze([
        step({
          route: "direct", phase: "DIRECT / CURRENT", title: "低级能力正在运行",
          copy: "当前实例持有自己的临时标签和运行上下文。",
          change: "active：空 → LOW", reason: "打断是两个实例间的所有权交接。",
          cost: "普通激活要扫描当前活动能力。",
          result: "LOW 运行中", codeKey: "directGate", codeTitle: "普通激活闸门", codeStatus: "CURRENT LOW",
          activeLines: Object.freeze([1]), state: Object.freeze({
            ...baseState, query: "施法中", fixed: EMPTY, temporary: Object.freeze(["旧实例 · 施法中"]),
            route: "普通激活", phase: "Direct", current: "LOW · Running", decision: "等待输入"
          }), events: Object.freeze(["Old.Begin", "Old.Tag.Add"])
        }),
        step({
          route: "direct", phase: "DIRECT / COMPARE", title: "HIGH 输入通过比较",
          copy: "LOW 小于 HIGH，不构成普通激活阻挡；其他资源和标签规则仍需独立通过。",
          change: "incoming：HIGH → Allowed", reason: "优先级只处理冲突，不替代其余激活条件。",
          cost: "比较成本 O(活动能力数)。",
          result: "允许建立新实例", tone: "success", codeKey: "directGate", codeTitle: "比较活动能力", codeStatus: "ALLOWED",
          activeLines: Object.freeze([1, 2, 3, 6]), state: Object.freeze({
            ...baseState, query: "施法中", fixed: EMPTY, temporary: Object.freeze(["旧实例 · 施法中"]),
            route: "普通激活", phase: "Direct", current: "LOW · Running", incoming: "HIGH", decision: "允许"
          }), events: Object.freeze(["Incoming=HIGH", "LOW<HIGH", "Direct.Allowed"])
        }),
        step({
          route: "direct", phase: "DIRECT / BEGIN NEW", title: "新实例先成功建立",
          copy: "新实例建立后，新旧来源会短暂并存。",
          change: "active：LOW → LOW + HIGH", reason: "先确认新实例成立，避免失败请求提前破坏旧状态。",
          cost: "短暂双实例需要清晰的来源账本。",
          result: "新旧实例交接", tone: "queued", codeKey: "directHandoff", codeTitle: "先建立新实例", codeStatus: "BEGIN HIGH",
          activeLines: Object.freeze([1, 2]), state: Object.freeze({
            ...baseState, query: "施法中", fixed: EMPTY,
            temporary: Object.freeze(["旧实例 · 施法中", "新实例 · 施法中"]),
            route: "普通激活", phase: "Direct", current: "LOW + HIGH", incoming: "HIGH", decision: "新实例已建立"
          }), events: Object.freeze(["High.Begin", "High.Tag.Add", "Both.Active"])
        }),
        step({
          route: "direct", phase: "DIRECT / CANCEL OLD", title: "严格低级的旧实例收到取消",
          copy: "旧实例进入 Interrupt 与清理，新实例继续保留。",
          change: "LOW：Running → Cancelling", reason: "普通激活只取消严格低级的活动能力。",
          cost: "取消是请求；完成时序取决于系统更新。",
          result: "旧实例取消中", tone: "queued", codeKey: "directHandoff", codeTitle: "取消低级旧实例", codeStatus: "CANCEL LOW",
          activeLines: Object.freeze([5, 6, 7]), state: Object.freeze({
            ...baseState, query: "施法中", fixed: EMPTY,
            temporary: Object.freeze(["旧实例 · 施法中", "新实例 · 施法中"]),
            route: "普通激活", phase: "Direct", current: "LOW · Cancelling", incoming: "HIGH", decision: "取消 LOW"
          }), events: Object.freeze(["High.Active", "Low.CancelRequested", "Low.Interrupt"])
        }),
        step({
          route: "direct", phase: "DIRECT / CLEAN OLD", title: "旧来源清理，新实例保留",
          copy: "旧实例只移除自己的标签和上下文。",
          change: "active：LOW + HIGH → HIGH", reason: "来源级清理完成状态所有权交接。",
          cost: "结束与取消都必须对称注销监听。",
          result: "HIGH 接管完成", tone: "success", codeKey: "removeSource", codeTitle: "清理旧来源", codeStatus: "HIGH ACTIVE",
          activeLines: Object.freeze([1, 2, 3, 5]), state: Object.freeze({
            ...baseState, query: "施法中", fixed: EMPTY, temporary: Object.freeze(["新实例 · 施法中"]),
            route: "普通激活", phase: "Direct", current: "HIGH · Running", incoming: "—", decision: "交接完成"
          }), events: Object.freeze(["Low.Tag.Remove", "Low.End", "High.Remains"])
        })
      ])
    }),
    firstWins: Object.freeze({
      note: "窗口：InWindow / 当前 MID / 两个 MID 输入",
      steps: Object.freeze([
        step({
          route: "window", phase: "WINDOW / OPEN", title: "MID 能力打开预输入窗口",
          copy: "窗口状态独立保存当前能力、阶段和排队输入。",
          change: "phase：无 → InWindow", reason: "窗口规则不能混进普通激活比较。",
          cost: "每个拥有者只需常量级窗口状态。",
          result: "等待预输入", codeKey: "window", codeTitle: "窗口内排队", codeStatus: "IN WINDOW",
          activeLines: Object.freeze([0]), state: Object.freeze({
            ...baseState, query: "连段窗口", fixed: EMPTY, temporary: Object.freeze(["当前实例 · 连段窗口"]),
            route: "预输入窗口", phase: "InWindow", current: "MID · Running", decision: "等待输入"
          }), events: Object.freeze(["Window.Open", "Phase=InWindow"])
        }),
        step({
          route: "window", phase: "WINDOW / FIRST", title: "第一个同级输入被缓存",
          copy: "同级输入不立即接管；队列为空，因此保存为首个预输入。",
          change: "queued：空 → MID-A", reason: "首个缓存让玩家输入可在当前动作结束后兑现。",
          cost: "只保存必要动作，不复制整个运行实例。",
          result: "MID-A 已缓存", tone: "queued", codeKey: "window", codeTitle: "首个同级输入", codeStatus: "BUFFERED",
          activeLines: Object.freeze([4, 5, 6]), state: Object.freeze({
            ...baseState, query: "连段窗口", fixed: EMPTY, temporary: Object.freeze(["当前实例 · 连段窗口"]),
            route: "预输入窗口", phase: "InWindow", current: "MID · Running", incoming: "MID-A", queued: "MID-A", decision: "首个缓存"
          }), events: Object.freeze(["Input=MID-A", "Queue.Empty", "Buffered"])
        }),
        step({
          route: "window", phase: "WINDOW / SECOND", title: "第二个同级输入被拒绝",
          copy: "队列已有 MID-A，MID-B 不能覆盖它。",
          change: "queued：MID-A → MID-A（不变）", reason: "窗口内采用先到者保留，避免输入抖动反复改写。",
          cost: "失败原因必须暴露为 FirstInputWins。",
          result: "MID-B 未替换队列", tone: "failed", codeKey: "window", codeTitle: "后续同级输入", codeStatus: "FIRST WINS",
          activeLines: Object.freeze([8]), state: Object.freeze({
            ...baseState, query: "连段窗口", fixed: EMPTY, temporary: Object.freeze(["当前实例 · 连段窗口"]),
            route: "预输入窗口", phase: "InWindow", current: "MID · Running", incoming: "MID-B", queued: "MID-A", decision: "拒绝替换"
          }), events: Object.freeze(["Input=MID-B", "Queue.Occupied", "FirstInputWins"])
        }),
        step({
          route: "window", phase: "WINDOW / RELEASE", title: "当前实例结束后释放首个输入",
          copy: "先移除窗口状态和监听，再执行 MID-A，避免重入消费。",
          change: "queued：MID-A → 已释放", reason: "结束与取消都必须能触发同一释放路径。",
          cost: "监听注销与状态删除必须对称。",
          result: "MID-A 获得执行", tone: "success", codeKey: "removeSource", codeTitle: "释放窗口状态", codeStatus: "RELEASE A",
          activeLines: Object.freeze([1, 2, 3, 5]), state: Object.freeze({
            ...baseState, query: "连段窗口", effective: false, fixed: EMPTY, temporary: EMPTY,
            route: "预输入窗口", phase: "Closed", current: "MID-A · Starting", queued: "—", decision: "释放首个缓存"
          }), events: Object.freeze(["Current.End", "Window.Remove", "MID-A.Release"])
        })
      ])
    }),
    blocked: Object.freeze({
      note: "普通激活：当前 HIGH / 输入 LOW",
      steps: Object.freeze([
        step({
          route: "direct", phase: "DIRECT / REQUEST", title: "LOW 输入请求激活",
          copy: "输入只表达意图，尚未创建实例或写入标签。",
          change: "incoming：空 → LOW", reason: "把请求和副作用分开，失败路径才能保持干净。",
          cost: "预检后消费请求时仍应再次裁决。",
          result: "LOW 等待比较", codeKey: "directGate", codeTitle: "普通激活检查", codeStatus: "REQUEST",
          activeLines: Object.freeze([0]), state: Object.freeze({
            ...baseState, query: "施法中", fixed: EMPTY, temporary: Object.freeze(["当前实例 · 施法中"]),
            route: "普通激活", phase: "Direct", current: "HIGH · Running", incoming: "LOW", decision: "待裁决"
          }), events: Object.freeze(["Input=LOW", "Request.Queued"])
        }),
        step({
          route: "direct", phase: "DIRECT / BLOCK", title: "HIGH 阻挡 LOW",
          copy: "当前活动能力优先级大于输入，普通激活直接返回明确拒绝。",
          change: "decision：Pending → PriorityBlocked", reason: "普通激活不允许低级输入接管高级状态。",
          cost: "扫描遇到首个阻挡者即可短路。",
          result: "LOW 被拒绝", tone: "failed", codeKey: "directGate", codeTitle: "命中阻挡条件", codeStatus: "BLOCKED",
          activeLines: Object.freeze([1, 2, 3, 4]), state: Object.freeze({
            ...baseState, query: "施法中", fixed: EMPTY, temporary: Object.freeze(["当前实例 · 施法中"]),
            route: "普通激活", phase: "Direct", current: "HIGH · Running", incoming: "LOW", decision: "PriorityBlocked"
          }), events: Object.freeze(["Compare=HIGH≥LOW", "Direct.Blocked"])
        }),
        step({
          route: "direct", phase: "DIRECT / NO SIDE EFFECT", title: "拒绝后状态保持不变",
          copy: "没有新实例、没有新来源，也没有取消当前 HIGH。",
          change: "运行状态：不变", reason: "拒绝路径只发布原因，不伪装成成功或回退。",
          cost: "调用方应明确处理拒绝，而不是吞掉错误。",
          result: "原状态完整保留", tone: "success", codeKey: "directGate", codeTitle: "拒绝即返回", codeStatus: "UNCHANGED",
          activeLines: Object.freeze([4]), state: Object.freeze({
            ...baseState, query: "施法中", fixed: EMPTY, temporary: Object.freeze(["当前实例 · 施法中"]),
            route: "普通激活", phase: "Direct", current: "HIGH · Running", incoming: "—", decision: "拒绝已发布"
          }), events: Object.freeze(["Rejected.Published", "NoTagWrite", "High.Remains"])
        })
      ])
    }),
    postWindow: Object.freeze({
      note: "窗口：PostWindow / 当前 HIGH / 输入 LOW",
      steps: Object.freeze([
        step({
          route: "window", phase: "WINDOW / POST", title: "窗口进入 PostWindow",
          copy: "当前动作已越过预输入收集区，但仍处于可切换阶段。",
          change: "phase：InWindow → PostWindow", reason: "阶段是本轨道的首要决策输入。",
          cost: "阶段变化必须与当前实例生命周期同步。",
          result: "进入窗口后阶段", codeKey: "postWindow", codeTitle: "PostWindow 规则", codeStatus: "POST WINDOW",
          activeLines: Object.freeze([0]), state: Object.freeze({
            ...baseState, query: "切换窗口", fixed: EMPTY, temporary: Object.freeze(["当前实例 · 切换窗口"]),
            route: "预输入窗口", phase: "PostWindow", current: "HIGH · Running", decision: "等待输入"
          }), events: Object.freeze(["Phase=PostWindow"])
        }),
        step({
          route: "window", phase: "WINDOW / LOW INPUT", title: "LOW 输入到达",
          copy: "此处不调用普通激活的 HIGH ≥ LOW 阻挡规则。",
          change: "incoming：空 → LOW", reason: "PostWindow 的阶段规则明确允许取消并排队。",
          cost: "共用一个比较器会错误拒绝本次输入。",
          result: "进入阶段规则", tone: "warning", codeKey: "postWindow", codeTitle: "明确跳过优先级比较", codeStatus: "NO COMPARE",
          activeLines: Object.freeze([1]), state: Object.freeze({
            ...baseState, query: "切换窗口", fixed: EMPTY, temporary: Object.freeze(["当前实例 · 切换窗口"]),
            route: "预输入窗口", phase: "PostWindow", current: "HIGH · Running", incoming: "LOW", decision: "不比较优先级"
          }), events: Object.freeze(["Input=LOW", "Priority.Compare=Skipped"])
        }),
        step({
          route: "window", phase: "WINDOW / CANCEL + QUEUE", title: "低级输入仍触发取消并排队",
          copy: "当前 HIGH 收到取消请求，LOW 被保存到队列等待释放。",
          change: "current：Running → Cancelling；queued：空 → LOW", reason: "这是窗口阶段语义，不是普通激活成功。",
          cost: "必须防止结束与取消事件重复释放队列。",
          result: "LOW 等待旧实例释放", tone: "queued", codeKey: "postWindow", codeTitle: "取消并排队", codeStatus: "AWAIT RELEASE",
          activeLines: Object.freeze([2, 3, 4, 5]), state: Object.freeze({
            ...baseState, query: "切换窗口", fixed: EMPTY, temporary: Object.freeze(["当前实例 · 切换窗口"]),
            route: "预输入窗口", phase: "AwaitingRelease", current: "HIGH · Cancelling", incoming: "LOW", queued: "LOW", decision: "取消并排队"
          }), events: Object.freeze(["High.CancelRequested", "LOW.Buffered", "AwaitingRelease"])
        }),
        step({
          route: "window", phase: "WINDOW / RELEASE", title: "旧实例取消后释放 LOW",
          copy: "窗口状态与监听先被移除，然后执行排队动作。",
          change: "queued：LOW → 已释放", reason: "清理顺序保证动作只被消费一次。",
          cost: "排队动作仍需面对释放时刻的有效性检查。",
          result: "LOW 开始后续流程", tone: "success", codeKey: "removeSource", codeTitle: "清理并释放", codeStatus: "LOW RELEASED",
          activeLines: Object.freeze([1, 2, 3, 5]), state: Object.freeze({
            ...baseState, query: "切换窗口", effective: false, fixed: EMPTY, temporary: EMPTY,
            route: "预输入窗口", phase: "Closed", current: "LOW · Starting", queued: "—", decision: "释放 LOW"
          }), events: Object.freeze(["High.Cancelled", "Window.Remove", "LOW.Release"])
        })
      ])
    }),
    cleanup: Object.freeze({
      note: "外部强制打断：目标范围 MID–HIGH / 强度 HIGH",
      steps: Object.freeze([
        step({
          route: "external", phase: "EXTERNAL / SELECT", title: "外部规则选择 MID 目标",
          copy: "这条轨道没有新技能接管，只筛选当前活动能力。",
          change: "target：空 → MID", reason: "外部强制打断不是普通激活。",
          cost: "批量处理时扫描成本为 O(活动能力数)。",
          result: "目标进入过滤", codeKey: "external", codeTitle: "外部打断过滤", codeStatus: "TARGET MID",
          activeLines: Object.freeze([0]), state: Object.freeze({
            ...baseState, query: "施法中", fixed: Object.freeze(["角色规则 · 施法中"]),
            temporary: Object.freeze(["实例 MID · 施法中", "状态 B · 施法中"]),
            route: "外部强制打断", phase: "Filter", current: "MID · Running", incoming: "外部请求", decision: "筛选目标"
          }), events: Object.freeze(["External.Request", "Target=MID"])
        }),
        step({
          route: "external", phase: "EXTERNAL / RANGE", title: "优先级区间与强度均通过",
          copy: "MID 落在教学区间内，也没有超过教学强度上限。",
          change: "filter：Pending → Passed", reason: "区间与强度只决定是否提交取消。",
          cost: "每个失败目标都应保留具体原因。",
          result: "允许提交取消", tone: "success", codeKey: "external", codeTitle: "执行两层过滤", codeStatus: "PASSED",
          activeLines: Object.freeze([1, 4, 5, 8]), state: Object.freeze({
            ...baseState, query: "施法中", fixed: Object.freeze(["角色规则 · 施法中"]),
            temporary: Object.freeze(["实例 MID · 施法中", "状态 B · 施法中"]),
            route: "外部强制打断", phase: "Filter", current: "MID · Running", incoming: "外部请求", decision: "过滤通过"
          }), events: Object.freeze(["Range.Pass", "Strength.Pass", "Interrupt.Allowed"])
        }),
        step({
          route: "external", phase: "EXTERNAL / CANCEL", title: "只提交取消请求",
          copy: "外部规则不创建接管实例，MID 进入取消流程。",
          change: "MID：Running → Cancelling", reason: "取消的实际清理由目标实例自己的生命周期完成。",
          cost: "不能把提交取消等同于已经清理完成。",
          result: "MID 取消中", tone: "queued", codeKey: "external", codeTitle: "提交取消", codeStatus: "REQUEST CANCEL",
          activeLines: Object.freeze([8]), state: Object.freeze({
            ...baseState, query: "施法中", fixed: Object.freeze(["角色规则 · 施法中"]),
            temporary: Object.freeze(["实例 MID · 施法中", "状态 B · 施法中"]),
            route: "外部强制打断", phase: "Cancel", current: "MID · Cancelling", incoming: "—", decision: "取消已提交"
          }), events: Object.freeze(["MID.CancelRequested", "NoNewInstance"])
        }),
        step({
          route: "ledger", phase: "CLEAN / MID SOURCE", title: "取消只移除 MID 来源",
          copy: "固定来源和状态 B 仍持有同名标签，因此有效状态不能变成 false。",
          change: "临时来源：2 → 1；effective 仍为 true", reason: "按标签值全删会制造来源清理冲突。",
          cost: "清理需遍历或索引该来源的记录。",
          result: "其他来源完整保留", tone: "success", codeKey: "removeSource", codeTitle: "按来源撤销", codeStatus: "MID REMOVED",
          activeLines: Object.freeze([1, 2, 3, 5]), state: Object.freeze({
            ...baseState, query: "施法中", fixed: Object.freeze(["角色规则 · 施法中"]),
            temporary: Object.freeze(["状态 B · 施法中"]),
            route: "来源账本", phase: "Cleanup", current: "MID · Ended", decision: "仅移除 MID"
          }), events: Object.freeze(["MID.Tag.Remove", "StateB.Remains", "Effective=true"])
        }),
        step({
          route: "ledger", phase: "UNRESOLVED / OBSERVE", title: "通知与层级提升保持可观察",
          copy: "页面不保证临时 Add 一定发布聚合通知，也不保证层级匹配后的提升能精确清掉临时记录。",
          change: "事实状态不变；诊断标记为 UNRESOLVED", reason: "未验证事项应暴露，而不是转成默认或兼容分支。",
          cost: "需要同时记录原始账本、查询结果和事件轨迹。",
          result: "未解决项未被隐藏", tone: "warning", codeKey: "ledger", codeTitle: "观察原始账本", codeStatus: "UNRESOLVED",
          activeLines: Object.freeze([1, 4, 5]), state: Object.freeze({
            ...baseState, query: "施法中", fixed: Object.freeze(["角色规则 · 施法中"]),
            temporary: Object.freeze(["状态 B · 施法中"]),
            route: "来源账本", phase: "Observe", current: "—", decision: "保留诊断"
          }), events: Object.freeze(["Ledger.Read", "Hierarchy.Query", "AddEvent=?"])
        })
      ])
    })
  });

  function byId(id) {
    const element = document.getElementById(id);
    if (!(element instanceof HTMLElement)) throw new Error(`[TagArbitration] 缺少元素 #${id}`);
    return element;
  }

  const el = {
    phase: byId("phase"), title: byId("step-title"), copy: byId("step-copy"),
    change: byId("step-change"), reason: byId("step-reason"), cost: byId("step-cost"),
    resultBanner: byId("result-banner"), result: byId("result-text"),
    note: byId("scenario-note"), query: byId("query-tag"), effective: byId("effective-state"),
    fixed: byId("fixed-sources"), temporary: byId("temporary-sources"),
    routeState: byId("route-state"), phaseState: byId("phase-state"),
    current: byId("current-state"), incoming: byId("incoming-state"),
    queued: byId("queued-state"), decision: byId("decision-state"),
    events: byId("event-trace"), codeTitle: byId("code-title"),
    codeStatus: byId("code-status"), codeLines: byId("code-lines"),
    stepLabel: byId("step-label"), stepCount: byId("step-count"),
    previous: byId("prev-button"), next: byId("next-button"),
    auto: byId("auto-button"), reset: byId("reset-button"),
    dots: byId("step-dots"), speed: byId("speed-seconds"),
    speedMessage: byId("speed-message"), announcement: byId("live-announcement")
  };

  const tabs = Array.from(document.querySelectorAll("[data-scenario]"));
  const routes = Array.from(document.querySelectorAll("[data-route]"));
  let scenarioKey = "ledger";
  let player = null;

  function fillList(container, items) {
    container.replaceChildren();
    const values = items.length === 0 ? ["无"] : items;
    values.forEach((value) => {
      const item = document.createElement("li");
      item.textContent = value;
      item.classList.toggle("empty", items.length === 0);
      container.append(item);
    });
  }

  function renderCode(current) {
    el.codeLines.replaceChildren();
    code[current.codeKey].forEach((line, index) => {
      const item = document.createElement("li");
      item.textContent = line || " ";
      item.classList.toggle("is-active", current.activeLines.includes(index));
      el.codeLines.append(item);
    });
    el.codeTitle.textContent = current.codeTitle;
    el.codeStatus.textContent = current.codeStatus;
  }

  function renderStep({ step: current, index, total, reason }) {
    el.phase.textContent = current.phase;
    el.title.textContent = current.title;
    el.copy.textContent = current.copy;
    el.change.textContent = current.change;
    el.reason.textContent = current.reason;
    el.cost.textContent = current.cost;
    el.result.textContent = current.result;
    el.resultBanner.setAttribute("data-tone", current.tone);
    el.stepLabel.textContent = `STEP ${String(index + 1).padStart(2, "0")}`;
    el.stepCount.textContent = `${index + 1} / ${total}`;

    const state = current.state;
    el.query.textContent = state.query;
    el.effective.textContent = state.effective ? "有效" : "无效";
    el.effective.setAttribute("data-active", String(state.effective));
    fillList(el.fixed, state.fixed);
    fillList(el.temporary, state.temporary);
    el.routeState.textContent = state.route;
    el.phaseState.textContent = state.phase;
    el.current.textContent = state.current;
    el.incoming.textContent = state.incoming;
    el.queued.textContent = state.queued;
    el.decision.textContent = state.decision;

    el.events.replaceChildren();
    current.events.forEach((eventName) => {
      const item = document.createElement("li");
      item.textContent = eventName;
      el.events.append(item);
    });
    routes.forEach((node) => node.classList.toggle("is-current", node.getAttribute("data-route") === current.route));
    renderCode(current);

    if (reason !== "initial") {
      el.announcement.textContent = `第 ${index + 1} 步：${current.title}。结果：${current.result}`;
    }
  }

  function readAutoStepMs() {
    const seconds = Number(el.speed.value);
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("自动播放速度必须大于零");
    return Math.round(seconds * 1000);
  }

  function createPlayer() {
    const scenario = scenarios[scenarioKey];
    el.note.textContent = scenario.note;
    player = window.XianyuInteractiveLab.createStepPlayer({
      steps: scenario.steps,
      autoStepMs: readAutoStepMs(),
      endBehavior: "restart",
      dotElement: "button",
      dotsInteractive: true,
      controls: { previous: el.previous, next: el.next, auto: el.auto, reset: el.reset, dots: el.dots },
      labels: {
        play: "▶ 自动播放", pause: "Ⅱ 暂停", complete: "自动完成",
        next: "下一步 →", done: "演示完成",
        dot: (index, total) => `第 ${index + 1} 步，共 ${total} 步`
      },
      classes: { playing: "is-playing", dot: "step-dot", dotActive: "is-active", dotPast: "is-past" },
      renderStep,
      onModeChange: ({ mode }) => {
        el.speed.disabled = mode === "auto";
        el.auto.setAttribute("aria-pressed", String(mode === "auto"));
      }
    });
  }

  function switchScenario(nextKey) {
    if (!Object.prototype.hasOwnProperty.call(scenarios, nextKey)) {
      throw new Error(`[TagArbitration] 未知场景 ${nextKey}`);
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

  tabs.forEach((tab) => tab.addEventListener("click", () => switchScenario(tab.getAttribute("data-scenario"))));
  el.speed.addEventListener("change", () => {
    const seconds = Number(el.speed.value);
    el.speedMessage.textContent = `${el.speed.selectedOptions[0].textContent}，每 ${seconds} 秒推进一步`;
    switchScenario(scenarioKey);
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) return;
    if (player === null) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); player.previous(); }
    else if (event.key === "ArrowRight") { event.preventDefault(); player.next(); }
    else if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      const state = player.state();
      if (state.mode === "auto") player.pause();
      else player.play();
    } else if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      player.reset();
    }
  });

  if (!window.XianyuInteractiveLab) throw new Error("[TagArbitration] 共享交互播放器未加载");
  createPlayer();
})();
