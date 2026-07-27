(function bootstrapProjectileMotion() {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const speedMs = Object.freeze({ slow: 3200, normal: 2100, fast: 1200 });

  const code = Object.freeze({
    spawn: [
      "ProjectileRun CreateRun(SpawnRequest request)",
      "{",
      "    if (!TryCreateEntity(request, out ProjectileRun run))",
      "        return CreateFailure(\"创建失败\");",
      "    run.TargetSnapshot = request.TargetPosition;",
      "    run.MoveMode = request.MoveMode;",
      "    return run;",
      "}"
    ],
    homing: [
      "Vector2 ResolveHomingDirection(ProjectileRun run)",
      "{",
      "    if (TryReadTarget(run.TargetId, out Vector2 current))",
      "        run.TargetSnapshot = current;",
      "    return Normalize(run.TargetSnapshot - run.Position);",
      "}"
    ],
    locked: [
      "Vector2 ResolveLockedDirection(ProjectileRun run)",
      "{",
      "    return run.SpawnDirection;",
      "    // 不根据目标位置重新转向",
      "}"
    ],
    sweep: [
      "Vector2 start = run.Position;",
      "Vector2 expected = direction * speed * deltaTime;",
      "Vector2 end = start + expected;",
      "candidates = QueryCapsuleOnPlane(",
      "    start, end, projectileRadius);",
      "// 候选顺序不等于距离顺序"
    ],
    filter: [
      "foreach (Candidate target in candidates)",
      "{",
      "    if (target.Id == run.Source) continue;",
      "    if (!TargetRule.Accept(target)) continue;",
      "    if (!target.IsAlive) continue;",
      "    if (!run.HitHistory.CanHit(target.Id, now)) continue;",
      "    ApplyHit(run, target);",
      "}"
    ],
    consume: [
      "void ApplyHit(ProjectileRun run, Candidate target)",
      "{",
      "    effects.Apply(run.Source, target);",
      "    knockback.TryStart(run.Source, target);",
      "    run.HitHistory.Record(target.Id, now);",
      "    run.RemainingHits--;",
      "}"
    ],
    gate: [
      "bool CanHit(TargetId id, Time now)",
      "{",
      "    if (!nextAllowed.TryGetValue(id, out Time next))",
      "        return true;",
      "    return now >= next;",
      "}"
    ],
    cleanup: [
      "void Finish(ProjectileRun run, FinishReason reason)",
      "{",
      "    run.Status = reason;",
      "    run.HitHistory.Clear();",
      "    run.TargetReference = null;",
      "    ReleaseRunEntity(run);",
      "}"
    ],
    curve: [
      "float cumulative = distance * curve.Evaluate(time01);",
      "float expectedDelta = cumulative - run.LastCumulative;",
      "run.LastCumulative = cumulative;",
      "Vector2 requested = run.Direction * expectedDelta;",
      "Vector2 actual = mover.Move(requested);",
      "run.PendingBlockCheck = (requested, actual);"
    ],
    blocked: [
      "void NextLogicUpdate(KnockbackRun run)",
      "{",
      "    if (IsBlocked(run.PendingExpected, run.PendingActual))",
      "    {",
      "        run.Finish(\"实际位移不足，提前停止\");",
      "        return;",
      "    }",
      "    ApplyNextCurveDelta(run);",
      "}"
    ],
    replace: [
      "void StartKnockback(SourceId source, KnockbackSpec next)",
      "{",
      "    if (activeBySource.TryGetValue(source, out var previous))",
      "        previous.Interrupt(\"同来源新请求替换\");",
      "    activeBySource[source] = CreateRun(next);",
      "}"
    ]
  });

  function step(phase, title, copy, change, why, decision, detail, codeKey, active, state) {
    return Object.freeze({ phase, title, copy, change, why, decision, detail, codeKey, active, state: Object.freeze(state) });
  }

  const scenarios = Object.freeze({
    homing: Object.freeze({
      title: "追踪目标的连续扫掠",
      params: "教学场景数据 · 速度 1.4 / 半径 0.18",
      summary: "追踪更新目标快照，再沿本帧线段连续扫掠",
      steps: Object.freeze([
        step("SPAWN SNAPSHOT", "保存生成快照", "运行实例保存来源、初始位置、目标快照与追踪策略。", "请求 → 可逐帧运行状态", "后续每帧必须从确定输入继续；创建失败也要保持可见。", "运行实例已创建", "目标 A 的初始位置已进入快照。", "spawn", [2,3,4,5], { mode:"HOMING", expected:"0.00", actual:"0.00", candidates:"0", history:"∅", pierce:"1", status:"CREATED", cleanup:"尚未清理" }),
        step("HOMING TARGET", "读取目标当前位置", "目标有效，因此用当前位置刷新生成时保存的快照。", "旧快照 → 当前目标位置", "追踪转向必须使用本帧已确认的位置。", "快照已刷新", "目标仍有效，继续追踪。", "homing", [2,3,4], { mode:"HOMING", expected:"0.00", actual:"0.00", candidates:"0", history:"∅", pierce:"1", status:"RUNNING", cleanup:"持有目标引用" }),
        step("EXPECTED MOVE", "计算本帧期望位移", "方向由投射物指向最新目标快照，乘以教学速度与步长。", "当前位置 → 本帧终点", "查询范围必须覆盖整段运动，不能只检查帧末位置。", "期望位移 1.40", "仍未提交实际位置。", "sweep", [0,1,2], { mode:"HOMING", expected:"1.40", actual:"0.00", candidates:"0", history:"∅", pierce:"1", status:"RUNNING", cleanup:"运动状态保留" }),
        step("CAPSULE SWEEP", "构造平面胶囊扫掠", "上一位置到下一位置的线段加上投射物半径，得到连续候选区域。", "运动线段 → 候选 A", "高速物体只检查终点会漏过路径中的目标。", "发现候选 A", "这里只是水平平面的候选查询。", "sweep", [3,4,5], { mode:"HOMING", expected:"1.40", actual:"0.00", candidates:"1", history:"∅", pierce:"1", status:"QUERYING", cleanup:"候选列表待消费" }),
        step("TARGET FILTER", "候选通过四道门", "A 不是来源自身，阵营匹配、仍有效，且命中历史允许。", "候选 A → 可消费 A", "空间查询结果不是最终命中。", "A 通过过滤", "进入效果与击退结算。", "filter", [2,3,4,5,6], { mode:"HOMING", expected:"1.40", actual:"0.00", candidates:"1", history:"∅", pierce:"1", status:"FILTERED", cleanup:"候选 A 保留" }),
        step("HIT CONSUME", "应用效果并记录命中", "成功消费后写入 A 的命中历史，并减少剩余穿透。", "效果 / 击退 → 历史 A", "历史与穿透只在成功命中后改变。", "A 命中", "剩余次数由 1 变为 0。", "consume", [2,3,4,5], { mode:"HOMING", expected:"1.40", actual:"1.40", candidates:"1", history:"A@t₀", pierce:"0", status:"HIT", cleanup:"等待完成原因" }),
        step("COMPLETE", "穿透次数耗尽", "运行实例进入完成状态，不再生成新的移动或查询。", "RUNNING → COMPLETED", "完成条件要先锁定状态，再执行清理。", "正常完成", "原因：剩余命中次数为零。", "cleanup", [0,2], { mode:"HOMING", expected:"1.40", actual:"1.40", candidates:"0", history:"A@t₀", pierce:"0", status:"COMPLETED", cleanup:"准备释放" }),
        step("CLEANUP", "释放运行实例", "清空命中历史、目标引用、候选列表并回收运行实体。", "运行状态 → 已释放", "结束路径必须收束，不能留下悬空引用。", "清理完成", "Effect 已进入自己的生命周期。", "cleanup", [3,4,5], { mode:"HOMING", expected:"—", actual:"—", candidates:"0", history:"∅", pierce:"0", status:"RELEASED", cleanup:"实体与临时状态已释放" })
      ])
    }),
    pierce: Object.freeze({
      title: "有限穿透与候选顺序冲突",
      params: "教学场景数据 · 剩余命中 1 / 查询顺序 B → A",
      summary: "候选返回顺序没有最近优先保证",
      steps: Object.freeze([
        step("SPAWN SNAPSHOT", "锁定生成方向", "生成时保存方向与一次可用命中，不再根据目标位置转向。", "请求 → LOCKED 运行状态", "已确认的是锁定方向穿透，不扩展声称第三种普通直线实现。", "方向已锁定", "剩余命中次数为教学值 1。", "locked", [2,3], { mode:"LOCKED", expected:"0.00", actual:"0.00", candidates:"0", history:"∅", pierce:"1", status:"CREATED", cleanup:"尚未清理" }),
        step("EXPECTED MOVE", "沿锁定方向推进", "本帧扫掠同时覆盖空间上更近的 A 与更远的 B。", "位置 → 胶囊终点", "连续扫掠避免漏掉两者。", "发现两个空间交点", "查询仍未决定消费顺序。", "sweep", [0,1,2,3,4], { mode:"LOCKED", expected:"2.60", actual:"0.00", candidates:"2", history:"∅", pierce:"1", status:"QUERYING", cleanup:"候选列表待消费" }),
        step("QUERY ORDER", "观察返回顺序 B → A", "空间查询先返回 B，随后才是更近的 A。", "候选集合 → 有序迭代序列", "当前链路没有最近优先保证。", "B 先进入过滤", "更近的 A 不会自动排到前面。", "sweep", [5], { mode:"LOCKED", expected:"2.60", actual:"0.00", candidates:"B → A", history:"∅", pierce:"1", status:"ORDERED", cleanup:"保持查询返回顺序" }),
        step("TARGET FILTER", "B 通过过滤", "B 符合目标规则且历史允许，于是先被消费。", "候选 B → 可消费 B", "过滤只判断能否命中，不重排候选。", "B 获得唯一命中", "剩余次数即将耗尽。", "filter", [2,3,4,5,6], { mode:"LOCKED", expected:"2.60", actual:"0.00", candidates:"B → A", history:"∅", pierce:"1", status:"FILTERED", cleanup:"B 等待消费" }),
        step("HIT CONSUME", "消费 B 并耗尽穿透", "效果应用到 B，命中历史记录 B，剩余次数变为零。", "B 命中 / A 未消费", "有限资源按实际迭代顺序消耗。", "顺序冲突已显现", "A 更近，但没有得到命中。", "consume", [2,4,5], { mode:"LOCKED", expected:"2.60", actual:"2.60", candidates:"B → A", history:"B@t₀", pierce:"0", status:"HIT B", cleanup:"A 不再消费" }),
        step("EXPLICIT POLICY", "需要最近优先就显式排序", "计算候选沿扫掠方向的投影距离，再排序后消费。", "隐含假设 → 明确策略", "排序改变语义，也把消费成本提高到 O(k log k)。", "当前演示不改写结果", "B 仍是本次已确认的消费目标。", "sweep", [5], { mode:"LOCKED", expected:"2.60", actual:"2.60", candidates:"B → A", history:"B@t₀", pierce:"0", status:"POLICY VISIBLE", cleanup:"等待结束" }),
        step("CLEANUP", "完成并清理", "穿透次数耗尽，清空历史和目标引用，释放运行实体。", "COMPLETED → RELEASED", "冲突场景也必须走正常结束路径。", "清理完成", "命中 B 的效果独立继续。", "cleanup", [2,3,4,5], { mode:"LOCKED", expected:"—", actual:"—", candidates:"0", history:"∅", pierce:"0", status:"RELEASED", cleanup:"实例已释放" })
      ])
    }),
    lost: Object.freeze({
      title: "目标丢失后飞向最后位置",
      params: "教学场景数据 · 目标在第二步失效",
      summary: "无有效目标时保留最后快照，不选择默认目标",
      steps: Object.freeze([
        step("SPAWN SNAPSHOT", "保存目标初始位置", "追踪实例在生成时保存目标 A 的位置。", "目标引用 + 快照进入运行状态", "目标稍后失效时，运行仍有确定输入。", "快照为 A₀", "目标当前有效。", "spawn", [4,5], { mode:"HOMING", expected:"0.00", actual:"0.00", candidates:"0", history:"∅", pierce:"1", status:"CREATED", cleanup:"持有目标引用" }),
        step("TARGET LOST", "读取目标失败", "目标 A 已失效，当前位置读取失败。", "有效引用 → 失效引用", "失败不能替换成零坐标或另一个默认目标。", "保留 A₀", "创建时保存的最后有效位置仍可使用。", "homing", [2,4], { mode:"HOMING", expected:"0.00", actual:"0.00", candidates:"0", history:"∅", pierce:"1", status:"TARGET LOST", cleanup:"失效引用待清理" }),
        step("LAST SNAPSHOT", "朝最后位置计算方向", "方向使用 A₀ - 当前位置，不再尝试追逐已经失效的实体。", "最后快照 → 确定方向", "保留失败前的可信数据，比注入默认值更可调试。", "继续飞向 A₀", "不会自动重选目标。", "homing", [4], { mode:"LAST POSITION", expected:"1.10", actual:"0.00", candidates:"0", history:"∅", pierce:"1", status:"RUNNING", cleanup:"仅保留位置快照" }),
        step("CAPSULE SWEEP", "扫掠最后一段路径", "胶囊查询没有发现有效目标。", "运动线段 → 空候选", "空集合是明确结果，不应制造命中。", "候选为空", "投射物仍可到达快照位置。", "sweep", [3,4], { mode:"LAST POSITION", expected:"1.10", actual:"1.10", candidates:"0", history:"∅", pierce:"1", status:"NO TARGET", cleanup:"准备到达快照" }),
        step("ARRIVE", "到达最后位置", "投射物到达保存的 A₀，没有对失效目标应用效果。", "RUNNING → COMPLETED", "完成原因与命中完成不同，诊断必须保留。", "因到达快照完成", "没有目标被命中。", "cleanup", [0,2], { mode:"LAST POSITION", expected:"1.10", actual:"1.10", candidates:"0", history:"∅", pierce:"1", status:"ARRIVED", cleanup:"准备释放" }),
        step("CLEANUP", "释放失效引用与实例", "清理目标引用、快照、候选列表和运行实体。", "失效运行状态 → 已释放", "丢失目标不能变成长期悬空实例。", "清理完成", "失败原因仍保留在结束记录中。", "cleanup", [3,4,5], { mode:"LAST POSITION", expected:"—", actual:"—", candidates:"0", history:"∅", pierce:"1", status:"RELEASED", cleanup:"实例已释放" })
      ])
    }),
    gate: Object.freeze({
      title: "同一目标的命中间隔门控",
      params: "教学场景数据 · A 的下一可命中时刻为 t₀ + 0.8",
      summary: "命中历史按目标保存，不用全局冷却替代",
      steps: Object.freeze([
        step("FIRST SWEEP", "第一次扫掠发现 A", "A 通过自身、阵营、有效性与命中历史过滤。", "候选 A → 可消费", "历史中尚无 A 的记录。", "A 首次可命中", "剩余穿透允许继续运行。", "filter", [2,3,4,5,6], { mode:"LOCKED", expected:"0.80", actual:"0.80", candidates:"1", history:"∅", pierce:"3", status:"FILTERED", cleanup:"尚未清理" }),
        step("FIRST HIT", "写入 A 的下一可命中时刻", "命中成功后，为 A 单独记录教学间隔。", "历史 ∅ → A@t₀+0.8", "只有成功消费才推进目标自己的门控。", "A 已命中", "剩余次数由 3 变为 2。", "consume", [2,4,5], { mode:"LOCKED", expected:"0.80", actual:"0.80", candidates:"1", history:"A@t₀+0.8", pierce:"2", status:"HIT A", cleanup:"运行继续" }),
        step("SECOND SWEEP", "下一帧再次发现 A", "较大的目标连续出现在胶囊候选中。", "空间候选再次包含 A", "连续候选不等于允许连续结算。", "A 再次进入候选", "现在尚未到下一可命中时刻。", "sweep", [3,4], { mode:"LOCKED", expected:"0.65", actual:"0.65", candidates:"1", history:"A@t₀+0.8", pierce:"2", status:"QUERYING", cleanup:"候选待门控" }),
        step("HISTORY GATE", "A 被自己的历史门控", "当前时刻小于 A 的下一可命中时刻。", "候选 A → 跳过", "门控失败不能消耗穿透，也不能生成效果。", "本帧不命中 A", "历史和剩余次数都不改变。", "gate", [2,3,4], { mode:"LOCKED", expected:"0.65", actual:"0.65", candidates:"1", history:"A@t₀+0.8", pierce:"2", status:"GATED", cleanup:"运行继续" }),
        step("PER TARGET", "B 仍可独立命中", "B 没有历史记录，因此不受 A 的门控影响。", "候选 B → 可消费 B", "全局冷却会错误阻止 B；历史必须按目标记录。", "B 通过门控", "A 与 B 拥有独立时间。", "gate", [2,3], { mode:"LOCKED", expected:"0.65", actual:"0.65", candidates:"2", history:"A@t₀+0.8", pierce:"2", status:"B ALLOWED", cleanup:"B 等待消费" }),
        step("SECOND TARGET HIT", "消费 B", "效果应用到 B，并写入 B 自己的下一可命中时刻。", "历史加入 B / 剩余次数 -1", "每个目标的状态独立演进。", "B 已命中", "历史现在同时包含 A 与 B。", "consume", [2,4,5], { mode:"LOCKED", expected:"0.65", actual:"0.65", candidates:"2", history:"A / B", pierce:"1", status:"HIT B", cleanup:"运行继续" }),
        step("CLEANUP", "结束时清空命中历史", "运行完成后移除所有按目标保存的门控状态。", "历史 A / B → ∅", "运行级历史不能泄漏到下一枚投射物。", "清理完成", "效果生命周期不由投射物清理。", "cleanup", [3,4,5], { mode:"LOCKED", expected:"—", actual:"—", candidates:"0", history:"∅", pierce:"1", status:"RELEASED", cleanup:"实例与历史已释放" })
      ])
    }),
    blocked: Object.freeze({
      title: "击退的期望—实际位移对账",
      params: "教学场景数据 · 总距离 3.0 / 障碍位置仅用于演示",
      summary: "累计曲线求差，并在下一次逻辑更新判断受阻",
      steps: Object.freeze([
        step("CURVE SAMPLE", "采样累计曲线", "曲线值表示从开始到当前时刻累计应完成的比例。", "t₁ → 累计期望 1.20", "累计值不能直接作为每帧增量重复应用。", "累计期望 1.20", "上次累计值是 0.55。", "curve", [0], { mode:"KNOCKBACK", expected:"1.20 累计", actual:"0.55 累计", candidates:"—", history:"∅", pierce:"—", status:"RUNNING", cleanup:"保存上次累计值" }),
        step("CURVE DELTA", "用两次累计值求差", "本帧期望增量 = 1.20 - 0.55 = 0.65。", "累计曲线 → 增量 0.65", "只应用新增部分，避免重复累计旧位移。", "请求位移 0.65", "教学数值用于展示计算关系。", "curve", [1,2,3], { mode:"KNOCKBACK", expected:"0.65", actual:"0.00", candidates:"—", history:"∅", pierce:"—", status:"MOVE REQUEST", cleanup:"等待移动结果" }),
        step("MOVE RESULT", "移动返回实际位移", "障碍让本帧只完成 0.24，期望与实际被一起保存。", "期望 0.65 → 实际 0.24", "受阻判断必须使用同一次移动的两个结果。", "差值保持可见", "此处不公开真实阻挡阈值。", "curve", [4,5], { mode:"KNOCKBACK", expected:"0.65", actual:"0.24", candidates:"—", history:"∅", pierce:"—", status:"PENDING CHECK", cleanup:"等待下一逻辑更新" }),
        step("NEXT UPDATE", "在下一次逻辑更新对账", "读取上一帧保存的期望 0.65 与实际 0.24。", "待判定差值 → 受阻输入", "移动提交和逻辑检查位于不同阶段。", "判定为受阻", "页面不把教学差值伪装成真实阈值。", "blocked", [0,1,2], { mode:"KNOCKBACK", expected:"0.65", actual:"0.24", candidates:"—", history:"∅", pierce:"—", status:"BLOCKED", cleanup:"准备提前结束" }),
        step("EARLY FINISH", "受阻后提前停止", "运行不再采样下一段曲线增量。", "RUNNING → FINISHED", "继续写入会让对象挤压障碍或累计无效位移。", "提前结束", "结束原因：实际位移不足。", "blocked", [3,4,5], { mode:"KNOCKBACK", expected:"0.65", actual:"0.24", candidates:"—", history:"∅", pierce:"—", status:"FINISHED", cleanup:"准备清理请求" }),
        step("CLEANUP", "清理击退运行状态", "释放曲线进度、方向和待判定的位移对。", "FINISHED → RELEASED", "结束后不能让旧差值影响下一个请求。", "清理完成", "对象保留在实际到达的位置。", "cleanup", [3,4,5], { mode:"KNOCKBACK", expected:"—", actual:"—", candidates:"—", history:"∅", pierce:"—", status:"RELEASED", cleanup:"运行状态已释放" })
      ])
    }),
    replace: Object.freeze({
      title: "同来源新击退替换旧请求",
      params: "教学场景数据 · 来源 S 先后提交 K₁ 与 K₂",
      summary: "来源键只协调同一来源的活动请求",
      steps: Object.freeze([
        step("FIRST REQUEST", "来源 S 启动 K₁", "活动表中没有 S，直接创建旧击退运行实例。", "active[S] = K₁", "活动表让后续请求能找到同来源运行。", "K₁ 正在运行", "已应用第一段曲线增量。", "replace", [0,1,4], { mode:"KNOCKBACK K₁", expected:"0.50", actual:"0.50", candidates:"—", history:"∅", pierce:"—", status:"RUNNING K₁", cleanup:"K₁ 持有运行状态" }),
        step("NEW REQUEST", "来源 S 提交 K₂", "同一来源键在活动表中命中 K₁。", "新请求 K₂ → 发现 K₁", "不能让两个同来源实例并行写入移动。", "替换冲突已识别", "尚未启动 K₂。", "replace", [2], { mode:"KNOCKBACK K₁", expected:"0.50", actual:"0.50", candidates:"—", history:"∅", pierce:"—", status:"REPLACE PENDING", cleanup:"K₁ 等待中断" }),
        step("INTERRUPT OLD", "先中断并清理 K₁", "旧请求记录替换原因并释放自己的曲线进度。", "K₁ RUNNING → INTERRUPTED", "新请求不能静默覆盖旧对象引用。", "K₁ 已结束", "结束原因保持可观察。", "replace", [2,3], { mode:"KNOCKBACK K₁", expected:"—", actual:"—", candidates:"—", history:"∅", pierce:"—", status:"INTERRUPTED K₁", cleanup:"K₁ 已清理" }),
        step("START NEW", "把 K₂ 写入活动表", "旧请求清理后，创建并登记新的运行实例。", "active[S] = K₂", "活动所有权必须从旧实例明确转移。", "K₂ 开始运行", "新曲线从自己的起点采样。", "replace", [4], { mode:"KNOCKBACK K₂", expected:"0.70", actual:"0.00", candidates:"—", history:"∅", pierce:"—", status:"RUNNING K₂", cleanup:"K₂ 持有运行状态" }),
        step("NEW MOVE", "K₂ 独立推进", "新请求保存自己的累计曲线值与实际位移。", "K₂ 期望 → K₂ 实际", "旧请求的差值已经清理，不能串入新请求。", "K₂ 正常移动", "同来源替换不等于所有来源互斥。", "curve", [0,1,2,3,4,5], { mode:"KNOCKBACK K₂", expected:"0.70", actual:"0.70", candidates:"—", history:"∅", pierce:"—", status:"RUNNING K₂", cleanup:"K₂ 独立状态" }),
        step("CLEANUP", "K₂ 完成后清理来源键", "曲线结束，释放 K₂ 并从活动表移除 S。", "active[S] → ∅", "活动表不能指向已结束运行。", "全部清理完成", "K₁ 的替换记录与 K₂ 的完成记录都保留原因。", "cleanup", [2,3,4,5], { mode:"KNOCKBACK", expected:"—", actual:"—", candidates:"—", history:"∅", pierce:"—", status:"RELEASED", cleanup:"来源 S 无活动请求" })
      ])
    })
  });

  function requireElement(id) {
    const element = document.getElementById(id);
    if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) {
      throw new Error(`[ProjectileMotion] 缺少元素 #${id}`);
    }
    return element;
  }

  const el = {
    stageTitle: requireElement("stage-title"), params: requireElement("teaching-params"),
    phase: requireElement("phase-label"), title: requireElement("step-title"),
    copy: requireElement("step-copy"), change: requireElement("step-change"),
    why: requireElement("step-why"), decision: requireElement("decision-title"),
    decisionCopy: requireElement("decision-copy"), stepLabel: requireElement("step-label"),
    stepCount: requireElement("step-count"), mode: requireElement("state-mode"),
    expected: requireElement("state-expected"), actual: requireElement("state-actual"),
    candidates: requireElement("state-candidates"), history: requireElement("state-history"),
    pierce: requireElement("state-pierce"), status: requireElement("state-status"),
    cleanup: requireElement("state-cleanup"), codeStatus: requireElement("code-status"),
    codeLines: requireElement("code-lines"), traceSummary: requireElement("trace-summary"),
    eventTrace: requireElement("event-trace"), traceLayer: requireElement("trace-layer"),
    worldLayer: requireElement("world-layer"), labelLayer: requireElement("label-layer"),
    dots: requireElement("step-dots"), previous: requireElement("prev-button"),
    next: requireElement("next-button"), auto: requireElement("auto-button"),
    reset: requireElement("reset-button")
  };

  let scenarioKey = "homing";
  let speedKey = "normal";
  let player = null;

  function node(name, attributes, text) {
    const item = document.createElementNS(NS, name);
    Object.entries(attributes).forEach(([key, value]) => item.setAttribute(key, String(value)));
    if (text !== undefined) item.textContent = text;
    return item;
  }

  function addCircle(x, y, radius, className, label, note) {
    el.worldLayer.append(node("circle", { cx:x, cy:y, r:radius, class:className }));
    el.labelLayer.append(node("text", { x, y:y + 5, class:"world-label" }, label));
    if (note !== undefined) el.labelLayer.append(node("text", { x, y:y + radius + 24, class:"world-note" }, note));
  }

  function addPath(x1, y1, x2, y2, className) {
    el.traceLayer.append(node("line", { x1, y1, x2, y2, class:className }));
  }

  function renderProjectileWorld(key, index) {
    const progress = Math.min(1, index / 5);
    addCircle(90, 230, 24, "source-body", "S", "来源");
    if (key === "pierce") {
      const px = 145 + progress * 480;
      el.traceLayer.append(node("rect", { x:130, y:194, width:500, height:72, rx:36, class:"sweep-body" }));
      addPath(145, 230, 650, 230, "trace-path");
      addCircle(330, 230, 25, index >= 4 ? "target-body" : "target-body candidate", "A", "更近 / 后返回");
      addCircle(505, 230, 25, index >= 4 ? "target-body hit" : "target-body candidate", "B", "更远 / 先返回");
      addCircle(px, 230, 12, "projectile-body", "•");
      return;
    }
    if (key === "lost") {
      const snapshotX = 610, snapshotY = 150;
      addPath(130, 230, snapshotX, snapshotY, index >= 2 ? "trace-path" : "trace-path muted");
      const px = 145 + progress * 465, py = 225 - progress * 75;
      addCircle(snapshotX, snapshotY, 28, index >= 1 ? "target-body blocked" : "target-body", "A", index >= 1 ? "失效 / 最后位置" : "有效目标");
      addCircle(px, py, 12, "projectile-body", "•");
      return;
    }
    if (key === "gate") {
      el.traceLayer.append(node("rect", { x:140, y:175, width:500, height:110, rx:55, class:"sweep-body" }));
      addPath(145, 230, 650, 230, "trace-path");
      addCircle(350, 230, 42, index === 3 ? "target-body blocked" : "target-body hit", "A", index === 3 ? "间隔门控" : "历史 A");
      addCircle(540, 230, 26, index >= 4 ? "target-body hit" : "target-body candidate", "B", "独立历史");
      addCircle(170 + progress * 430, 230, 12, "projectile-body", "•");
      return;
    }
    const targetX = 600, targetY = 140 + index * 7;
    addPath(130, 230, targetX, targetY, index >= 2 ? "trace-path" : "trace-path muted");
    if (index >= 3) el.traceLayer.append(node("rect", { x:135, y:178, width:485, height:104, rx:52, class:"sweep-body" }));
    addCircle(targetX, targetY, 28, index >= 5 ? "target-body hit" : index >= 3 ? "target-body candidate" : "target-body", "A", "追踪目标");
    addCircle(145 + progress * 455, 225 - progress * 80, 12, "projectile-body", "•");
  }

  function renderKnockbackWorld(key, index) {
    addCircle(150, 230, 30, "source-body", "T", "受击对象");
    if (key === "blocked") {
      el.worldLayer.append(node("rect", { x:430, y:85, width:70, height:290, rx:7, class:"obstacle" }));
      el.labelLayer.append(node("text", { x:465, y:70, class:"world-note" }, "教学障碍"));
      if (index >= 1) addPath(180, 205, 610, 205, "motion-arrow");
      if (index >= 2) addPath(180, 255, 398, 255, "actual-arrow");
      el.labelLayer.append(node("text", { x:590, y:190, class:"world-note" }, index >= 1 ? "期望 0.65" : "累计曲线"));
      el.labelLayer.append(node("text", { x:335, y:282, class:"world-note" }, index >= 2 ? "实际 0.24" : "等待移动"));
      return;
    }
    const oldEnd = 390, newEnd = 650;
    addPath(185, 195, oldEnd, 195, index >= 2 ? "trace-path muted" : "motion-arrow");
    el.labelLayer.append(node("text", { x:300, y:178, class:"world-note" }, `K₁ ${index >= 2 ? "已中断" : "运行中"}`));
    if (index >= 3) {
      addPath(185, 260, newEnd, 260, "actual-arrow");
      el.labelLayer.append(node("text", { x:470, y:290, class:"world-note" }, "K₂ 独立曲线"));
    }
  }

  function renderWorld(index) {
    el.traceLayer.replaceChildren();
    el.worldLayer.replaceChildren();
    el.labelLayer.replaceChildren();
    if (scenarioKey === "blocked" || scenarioKey === "replace") renderKnockbackWorld(scenarioKey, index);
    else renderProjectileWorld(scenarioKey, index);
  }

  function renderCode(item) {
    el.codeStatus.textContent = item.codeKey.toUpperCase();
    el.codeLines.replaceChildren();
    code[item.codeKey].forEach((line, index) => {
      const row = document.createElement("li");
      row.textContent = line.length === 0 ? " " : line;
      row.classList.toggle("is-active", item.active.includes(index));
      el.codeLines.append(row);
    });
  }

  function renderTrace(index) {
    const current = scenarios[scenarioKey];
    el.traceSummary.textContent = current.summary;
    el.eventTrace.replaceChildren();
    current.steps.forEach((item, itemIndex) => {
      const row = document.createElement("li");
      row.textContent = item.title;
      row.classList.toggle("is-past", itemIndex < index);
      row.classList.toggle("is-current", itemIndex === index);
      if (itemIndex === index) row.setAttribute("aria-current", "step");
      el.eventTrace.append(row);
    });
    const active = el.eventTrace.children[index];
    if (active instanceof HTMLElement) active.scrollIntoView({ block:"nearest", inline:"center", behavior:"smooth" });
  }

  function renderStep({ step: item, index, total }) {
    const current = scenarios[scenarioKey];
    el.stageTitle.textContent = current.title;
    el.params.textContent = current.params;
    el.phase.textContent = item.phase;
    el.title.textContent = item.title;
    el.copy.textContent = item.copy;
    el.change.textContent = item.change;
    el.why.textContent = item.why;
    el.decision.textContent = item.decision;
    el.decisionCopy.textContent = item.detail;
    el.stepLabel.textContent = `STEP ${String(index + 1).padStart(2, "0")}`;
    el.stepCount.textContent = `${index + 1} / ${total}`;
    el.mode.textContent = item.state.mode;
    el.expected.textContent = item.state.expected;
    el.actual.textContent = item.state.actual;
    el.candidates.textContent = item.state.candidates;
    el.history.textContent = item.state.history;
    el.pierce.textContent = item.state.pierce;
    el.status.textContent = item.state.status;
    el.cleanup.textContent = item.state.cleanup;
    renderCode(item);
    renderTrace(index);
    renderWorld(index);
  }

  function createPlayer() {
    const current = scenarios[scenarioKey];
    player = window.XianyuInteractiveLab.createStepPlayer({
      steps: current.steps,
      autoStepMs: speedMs[speedKey],
      endBehavior: "restart",
      dotElement: "button",
      dotsInteractive: true,
      controls: { previous: el.previous, next: el.next, auto: el.auto, reset: el.reset, dots: el.dots },
      labels: {
        play: "▶ 自动播放", pause: "Ⅱ 暂停", complete: "自动完成",
        next: "下一步 →", done: "演示完成",
        dot: (index, total) => `第 ${index + 1} 步，共 ${total} 步`
      },
      classes: { playing:"is-playing", dot:"step-dot", dotActive:"is-active", dotPast:"is-past" },
      renderStep,
      onModeChange: ({ mode }) => {
        el.auto.setAttribute("aria-pressed", String(mode === "auto"));
      }
    });
  }

  function rebuild() {
    if (player) player.destroy();
    createPlayer();
  }

  document.querySelectorAll("[data-scenario]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextKey = button.getAttribute("data-scenario");
      if (!Object.prototype.hasOwnProperty.call(scenarios, nextKey)) {
        throw new Error(`[ProjectileMotion] 未知教学场景 ${nextKey}`);
      }
      scenarioKey = nextKey;
      document.querySelectorAll("[data-scenario]").forEach((candidate) => {
        const selected = candidate === button;
        candidate.classList.toggle("is-active", selected);
        candidate.setAttribute("aria-pressed", String(selected));
      });
      rebuild();
    });
  });

  document.querySelectorAll("[data-speed]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextKey = button.getAttribute("data-speed");
      if (!Object.prototype.hasOwnProperty.call(speedMs, nextKey)) {
        throw new Error(`[ProjectileMotion] 未知播放速度 ${nextKey}`);
      }
      speedKey = nextKey;
      document.querySelectorAll("[data-speed]").forEach((candidate) => {
        const selected = candidate === button;
        candidate.classList.toggle("is-active", selected);
        candidate.setAttribute("aria-pressed", String(selected));
      });
      rebuild();
    });
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
    if (!player) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); player.previous(); }
    else if (event.key === "ArrowRight") { event.preventDefault(); player.next(); }
    else if (event.key === " ") { event.preventDefault(); el.auto.click(); }
    else if (event.key.toLowerCase() === "r") { event.preventDefault(); player.reset(); }
  });

  if (!window.XianyuInteractiveLab) throw new Error("[ProjectileMotion] 共享播放器未加载");
  rebuild();
})();
