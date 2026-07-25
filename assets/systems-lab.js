const scenarios = Object.freeze({
  flags: {
    title: "Flags / BitMask",
    article: "/knowledge/library/游戏逻辑常用模式/位标记Flags与BitMask/",
    initialCase: "operations",
    cases: {
      operations: {
        label: "组合 / 判断 / 移除",
        code: [
          "effects = AttributeAttackEffect.None;",
          "effects |= AttributeAttackEffect.Precision;",
          "effects |= AttributeAttackEffect.Critical;",
          "bool critical = (effects & Critical) == Critical;",
          "effects &= ~AttributeAttackEffect.Precision;"
        ],
        steps: [
          {
            phase: "初始化", title: "一个整数承载多个开关",
            copy: "每一个标记占据独立二进制位，因此多个状态可以同时存在。",
            why: "Flags 把散落的 bool 压进一个字段，传递与判断都更集中。",
            status: "NONE", activeLines: [0],
            metrics: [["decimal", "0"], ["binary", "000000"], ["enabled", "None"]],
            view: { type: "flags", value: 0, focus: null }
          },
          {
            phase: "按位或 / ADD", title: "打开 Precision 位",
            copy: "按位或只把目标位设为 1，其他已经打开的位会被保留。",
            why: "Precision = 000010，因此组合后的十进制值是 2。",
            status: "OR", activeLines: [1],
            metrics: [["decimal", "2"], ["binary", "000010"], ["enabled", "Precision"]],
            view: { type: "flags", value: 2, focus: 1 }
          },
          {
            phase: "再次组合", title: "Critical 与 Precision 同时存在",
            copy: "Critical = 001000，与 Precision 组合后得到 001010。",
            why: "不同标记占不同位，所以组合不会覆盖已有状态。",
            status: "COMBINE", activeLines: [2],
            metrics: [["decimal", "10"], ["binary", "001010"], ["enabled", "Precision + Critical"]],
            view: { type: "flags", value: 10, focus: 3 }
          },
          {
            phase: "按位与 / CHECK", title: "只保留 Critical 位进行判断",
            copy: "001010 & 001000 = 001000，结果等于 Critical，说明标记存在。",
            why: "按位与不会改变原值，只产生用于判断的掩码结果。",
            status: "HAS FLAG", activeLines: [3],
            metrics: [["source", "001010"], ["mask", "001000"], ["result", "true"]],
            view: { type: "flags", value: 10, focus: 3, check: 8 }
          },
          {
            phase: "取反后按位与 / REMOVE", title: "关闭 Precision，保留 Critical",
            copy: "对 Precision 取反后再按位与，只会清掉 Precision 对应的位。",
            why: "移除一个标记不会破坏其他仍然有效的标签。",
            status: "REMOVE", activeLines: [4],
            metrics: [["decimal", "8"], ["binary", "001000"], ["enabled", "Critical"]],
            view: { type: "flags", value: 8, focus: 1 }
          }
        ]
      },
      rules: {
        label: "合法组合与互斥",
        code: [
          "Flags carry tags;",
          "Precision | Critical; // valid",
          "if (outcome == Miss) return;",
          "Miss | Critical; // rejected by flow",
          "AttackOutcome outcome;",
          "AttackModifiers modifiers;"
        ],
        steps: [
          {
            phase: "职责边界", title: "Flags 不负责业务合法性",
            copy: "位容器只知道哪些位是 1，不知道 Miss 与 Critical 是否应该同时出现。",
            why: "存储结构和业务规则是两层不同职责。",
            status: "STORAGE", activeLines: [0],
            metrics: [["storage", "multiple tags"], ["validation", "business flow"], ["auto mutex", "no"]],
            view: { type: "flags", value: 0, focus: null, note: "容器允许组合，流程决定组合是否合法" }
          },
          {
            phase: "合法叠加", title: "Precision + Critical 可以共存",
            copy: "精准和暴击描述不同维度，因此组合成 001010 是合理结果。",
            why: "多个独立修饰标签正是 Flags 擅长表达的情况。",
            status: "VALID", activeLines: [1],
            metrics: [["outcome", "Hit"], ["modifiers", "Precision + Critical"], ["binary", "001010"]],
            view: { type: "flags", value: 10, focus: null, note: "VALID COMBINATION" }
          },
          {
            phase: "提前返回", title: "Miss 出现后停止后续计算",
            copy: "一旦流程判定 Miss，就直接返回，不再继续追加 Critical 或 Block。",
            why: "互斥约束由计算顺序保证，而不是由位运算自动保证。",
            status: "EARLY RETURN", activeLines: [2],
            metrics: [["outcome", "Miss"], ["continue", "false"], ["extra tags", "none"]],
            view: { type: "flags", value: 16, focus: 4, note: "FLOW STOPS HERE" }
          },
          {
            phase: "冲突示例", title: "Miss + Critical 能存，但不应该产生",
            copy: "二进制容器可以表示 011000，但业务流程必须阻止这个冲突组合。",
            why: "能被数据结构表示，不等于它在领域规则里合法。",
            status: "REJECT", activeLines: [3],
            metrics: [["binary", "011000"], ["container", "accepted"], ["business", "rejected"]],
            view: { type: "flags", value: 24, focus: null, note: "INVALID BUSINESS STATE" }
          },
          {
            phase: "更严格建模", title: "把主结果和修饰标签拆开",
            copy: "严格互斥的 Hit / Miss / Block 放进 Outcome，可叠加的 Critical / Precision 放进 Modifiers。",
            why: "类型结构本身就能减少非法组合，比事后检查更清晰。",
            status: "SPLIT MODEL", activeLines: [4, 5],
            metrics: [["outcome", "one value"], ["modifiers", "many flags"], ["invalid states", "reduced"]],
            view: { type: "flags", value: 10, focus: null, note: "Outcome × Modifiers" }
          }
        ]
      }
    }
  },
  random: {
    title: "随机系统",
    article: "/knowledge/library/游戏逻辑常用模式/随机系统/",
    initialCase: "weighted",
    cases: {
      weighted: {
        label: "加权随机",
        code: [
          "totalWeight = 10 + 30 + 60;",
          "rolled = Random.Range(0, totalWeight);",
          "cursor += entry.Weight;",
          "if (rolled < cursor) return entry;",
          "10 / 30 / 60 == 1 / 3 / 6;"
        ],
        steps: [
          {
            phase: "配置池", title: "权重表达相对份额",
            copy: "金币、药水、装备分别占 10、30、60 份，权重不要求单独写成百分比。",
            why: "加权随机关心相对大小，而不是每个值本身。",
            status: "CONFIG", activeLines: [0],
            metrics: [["gold", "10"], ["potion", "30"], ["equipment", "60"]],
            view: { type: "random", method: "weighted", mode: "weights", note: "10 + 30 + 60" }
          },
          {
            phase: "求和", title: "总区间长度是 100",
            copy: "所有正权重相加得到 totalWeight，后续随机只在这个总区间里取值。",
            why: "总权重定义了整条刻度的长度。",
            status: "TOTAL", activeLines: [0, 1],
            metrics: [["totalWeight", "100"], ["range", "0..99"], ["entries", "3"]],
            view: { type: "random", method: "weighted", mode: "range", note: "roll ∈ [0, 100)" }
          },
          {
            phase: "映射区间", title: "每个候选占据连续区间",
            copy: "0~9 对应金币，10~39 对应药水，40~99 对应装备。",
            why: "随机值落在哪段，就返回哪一个候选。",
            status: "MAP", activeLines: [2, 3],
            metrics: [["gold", "0..9"], ["potion", "10..39"], ["equipment", "40..99"]],
            view: { type: "random", method: "weighted", mode: "intervals", note: "cursor 累加切分区间" }
          },
          {
            phase: "等比例缩放", title: "1 / 3 / 6 得到相同比例",
            copy: "权重整体同比缩放不会改变抽取比例，只会改变区间刻度。",
            why: "加权随机只比较相对份额。",
            status: "RATIO", activeLines: [4],
            metrics: [["10:30:60", "1:3:6"], ["ratio", "same"], ["probability", "10% / 30% / 60%"]],
            view: { type: "random", method: "weighted", mode: "ratio", note: "relative weights stay equal" }
          }
        ]
      },
      pity: {
        label: "保底机制",
        code: [
          "failCount++;",
          "chance = baseChance + failCount * bonusPerFail;",
          "if (Random.value < chance)",
          "    failCount = 0;",
          "if (failCount >= maxFailCount) GiveRareReward();"
        ],
        steps: [
          {
            phase: "纯随机风险", title: "独立抽取允许长期不出",
            copy: "固定概率只保证长期统计，不保证某个玩家在有限次数内一定获得结果。",
            why: "数学公平和玩家体感公平并不是同一件事。",
            status: "BASE", activeLines: [0],
            metrics: [["chance", "baseChance"], ["failCount", "0"], ["guarantee", "none"]],
            view: { type: "random", method: "pity", mode: "pity", level: 0, note: "固定基础概率" }
          },
          {
            phase: "记录失败", title: "每次失败都留下状态",
            copy: "failCount 让随机系统知道玩家已经连续失败了多少次。",
            why: "没有历史状态，就无法控制长期倒霉。",
            status: "FAIL +1", activeLines: [0],
            metrics: [["failCount", "+1"], ["chance", "baseChance"], ["history", "tracked"]],
            view: { type: "random", method: "pity", mode: "pity", level: 1, note: "失败次数进入模型" }
          },
          {
            phase: "渐进补偿", title: "失败越多，概率越高",
            copy: "chance = baseChance + failCount × bonusPerFail，让连续失败逐步提高下一次机会。",
            why: "概率仍然保留不确定性，但极端坏运气会被压缩。",
            status: "BONUS", activeLines: [1, 2],
            metrics: [["formula", "base + fail × bonus"], ["chance", "rising"], ["uncertainty", "kept"]],
            view: { type: "random", method: "pity", mode: "pity", level: 3, note: "失败补偿逐步累积" }
          },
          {
            phase: "命中后重置", title: "获得结果后重新开始计数",
            copy: "一旦抽中稀有结果，failCount 回到 0，下一轮重新从基础概率开始。",
            why: "保底状态属于一轮连续失败过程，成功就是该过程的结束点。",
            status: "RESET", activeLines: [2, 3],
            metrics: [["result", "rare"], ["failCount", "0"], ["next chance", "baseChance"]],
            view: { type: "random", method: "pity", mode: "pity", level: 0, note: "命中后清空补偿" }
          },
          {
            phase: "硬保底", title: "最大失败次数提供确定边界",
            copy: "当 failCount 达到 maxFailCount，系统直接给出稀有结果。",
            why: "硬保底把最坏情况从无限等待变成明确上限。",
            status: "GUARANTEE", activeLines: [4],
            metrics: [["condition", "fail >= max"], ["result", "guaranteed"], ["worst case", "bounded"]],
            view: { type: "random", method: "pity", mode: "pity", level: 5, note: "达到上限直接产出" }
          }
        ]
      },
      bag: {
        label: "洗牌袋",
        code: [
          "bag = [Common × 7, Rare × 2, Epic × 1];",
          "Shuffle(bag);",
          "result = bag[cursor];",
          "cursor++;",
          "if (cursor == bag.Count) Refill();"
        ],
        steps: [
          {
            phase: "装袋", title: "先确定短期分布",
            copy: "袋子里放入 7 个普通、2 个稀有、1 个史诗结果。",
            why: "一个袋子周期内的数量是可控的。",
            status: "FILL", activeLines: [0],
            metrics: [["common", "7"], ["rare", "2"], ["epic", "1"]],
            view: { type: "random", method: "bag", mode: "bag", cursor: -1, note: "7 Common / 2 Rare / 1 Epic" }
          },
          {
            phase: "打乱", title: "顺序随机，但数量不变",
            copy: "文章示例序列被打乱为：普通、稀有、普通、普通、史诗、普通、普通、稀有、普通、普通。",
            why: "洗牌只改变出现顺序，不改变袋内组成。",
            status: "SHUFFLE", activeLines: [1],
            metrics: [["sequence", "shuffled"], ["counts", "preserved"], ["repeat risk", "reduced"]],
            view: { type: "random", method: "bag", mode: "bag", cursor: -1, note: "顺序变化，配额保持" }
          },
          {
            phase: "逐个抽取", title: "游标推进到第一个结果",
            copy: "每次只读取当前游标对应的结果，然后把游标向后移动。",
            why: "已经抽出的结果不会在本轮袋子中再次出现。",
            status: "DRAW 01", activeLines: [2, 3],
            metrics: [["cursor", "0"], ["result", "Common"], ["remaining", "9"]],
            view: { type: "random", method: "bag", mode: "bag", cursor: 0, note: "draw without replacement" }
          },
          {
            phase: "稀有出现", title: "第二次抽到 Rare",
            copy: "短期顺序仍然具有随机感，但不会无限延迟袋子里已经配置的稀有结果。",
            why: "袋内抽取避免了独立随机的极端长尾。",
            status: "DRAW 02", activeLines: [2, 3],
            metrics: [["cursor", "1"], ["result", "Rare"], ["remaining", "8"]],
            view: { type: "random", method: "bag", mode: "bag", cursor: 1, note: "Rare is part of this cycle" }
          },
          {
            phase: "用完重装", title: "袋子清空后开始新周期",
            copy: "游标到达袋尾时重新装袋并再次打乱。",
            why: "每个周期都保持目标分布，同时让周期之间继续变化。",
            status: "REFILL", activeLines: [4],
            metrics: [["cursor", "10"], ["action", "refill"], ["next cycle", "reshuffle"]],
            view: { type: "random", method: "bag", mode: "bag", cursor: 9, note: "bag empty → rebuild" }
          }
        ]
      },
      reproducible: {
        label: "Seed / 稳定随机",
        code: [
          "new Random(seed);",
          "same seed => same sequence;",
          "ResolveStable01(clusterId, instanceId, salt, version, index);",
          "same inputs => same value;",
          "version changes => reroll;"
        ],
        steps: [
          {
            phase: "普通随机", title: "只知道结果，难以复盘",
            copy: "运行时直接取下一个随机值，问题发生后很难重现当时轨迹。",
            why: "调试需要的不只是随机结果，还需要产生结果的上下文。",
            status: "RUNTIME", activeLines: [],
            metrics: [["source", "runtime"], ["replay", "unknown"], ["trace", "missing"]],
            view: { type: "random", method: "reproducible", mode: "seed", left: "随机源\n未记录", right: "结果\n不可复盘", note: "context is missing" }
          },
          {
            phase: "固定 Seed", title: "同一个 Seed 产生同一串序列",
            copy: "测试与回放保存 seed，就能重新走过相同的随机轨迹。",
            why: "可复现随机把偶发问题变成可以重复验证的问题。",
            status: "SEEDED", activeLines: [0, 1],
            metrics: [["input", "seed"], ["sequence", "repeatable"], ["use", "test / replay"]],
            view: { type: "random", method: "reproducible", mode: "seed", left: "Seed\n固定输入", right: "Sequence\n固定序列", note: "same seed → same sequence" }
          },
          {
            phase: "稳定输入", title: "Hash 输入决定个体差异",
            copy: "clusterId、instanceId、salt、version、index 混合成稳定的 0~1 值。",
            why: "同一轮里角色差异存在，但不会每帧乱跳。",
            status: "STABLE", activeLines: [2, 3],
            metrics: [["inputs", "5 stable fields"], ["output", "0..1"], ["frame jitter", "none"]],
            view: { type: "random", method: "reproducible", mode: "seed", left: "Stable Inputs\nID + salt + version", right: "Stable 01\n同轮固定", note: "same inputs → same value" }
          },
          {
            phase: "版本变化", title: "只在语义变化时重新随机",
            copy: "意图版本改变后输入发生变化，系统才生成新的稳定结果。",
            why: "version 是显式的刷新开关，避免把随机更新绑在每一帧。",
            status: "REROLL", activeLines: [4],
            metrics: [["trigger", "version changes"], ["old value", "discarded"], ["new value", "stable again"]],
            view: { type: "random", method: "reproducible", mode: "seed", left: "Version N\nStable 01", right: "Version N+1\nNew Stable 01", note: "semantic change → reroll" }
          }
        ]
      }
    }
  },
  space: {
    title: "空间划分",
    article: "/knowledge/library/算法/空间划分-九宫格与四叉树/",
    initialCase: "grid",
    cases: {
      grid: {
        label: "九宫格查询",
        code: [
          "cell = WorldToCell(position);",
          "grid[cell].Add(unit);",
          "foreach (cell in NineCells(center))",
          "    candidates.AddRange(grid[cell]);",
          "if (offset.sqrMagnitude <= radiusSqr) result.Add(unit);"
        ],
        steps: [
          {
            phase: "直接遍历", title: "世界里的所有对象都是候选",
            copy: "不使用空间结构时，每次范围查询都必须检查整个对象集合。",
            why: "问题不在单次距离判断，而在需要判断的对象数量。",
            status: "ALL", activeLines: [],
            metrics: [["broad phase", "all objects"], ["cells", "none"], ["cost", "global scan"]],
            view: { type: "space", mode: "grid", stage: "all", note: "GRID / HASH" }
          },
          {
            phase: "登记入格", title: "单位只登记到所在格子",
            copy: "玩家 P 与敌人 E 根据世界位置映射到固定网格。",
            why: "格子坐标把连续空间转换成可索引的离散 key。",
            status: "INSERT", activeLines: [0, 1],
            metrics: [["player cell", "(1, 1)"], ["enemy cell", "(2, 2)"], ["structure", "fixed grid"]],
            view: { type: "space", mode: "grid", stage: "insert", note: "GRID / HASH" }
          },
          {
            phase: "九宫格粗筛", title: "只访问中心格和周围八格",
            copy: "查询从全世界收缩到玩家所在格与八个相邻格。",
            why: "附近目标只可能来自有限的邻接区域。",
            status: "BROAD", activeLines: [2, 3],
            metrics: [["visited cells", "center + 8"], ["enemy E", "candidate"], ["final hit", "unknown"]],
            view: { type: "space", mode: "grid", stage: "near", note: "GRID / HASH" }
          },
          {
            phase: "候选集合", title: "格子命中不等于技能命中",
            copy: "E 位于被访问格子，因此进入候选集合，但仍需要精确距离判断。",
            why: "网格是矩形粗筛，技能范围可能是圆形。",
            status: "CANDIDATE", activeLines: [3],
            metrics: [["candidates", "E"], ["shape", "grid cells"], ["next", "distance test"]],
            view: { type: "space", mode: "grid", stage: "candidate", note: "GRID / HASH" }
          },
          {
            phase: "距离平方精筛", title: "用 d² ≤ 25 确认最终结果",
            copy: "文章示例半径为 5，因此比较 offset.sqrMagnitude 与 radiusSqr = 25。",
            why: "只比较范围时无需开根号，距离平方更直接。",
            status: "NARROW", activeLines: [4],
            metrics: [["radius", "5"], ["radiusSqr", "25"], ["condition", "d² <= 25"]],
            view: { type: "space", mode: "grid", stage: "precise", note: "GRID / HASH" }
          }
        ]
      },
      hash: {
        label: "空间 Hash 与移动",
        code: [
          "gx = FloorToInt(position.x / cellSize);",
          "gy = FloorToInt(position.z / cellSize);",
          "oldCell.Remove(unit);",
          "newCell.Add(unit);",
          "Dictionary<Vector2Int, List<Unit>> grids;"
        ],
        steps: [
          {
            phase: "稀疏地图", title: "不提前创建整张二维数组",
            copy: "空间 Hash 只保存真正有对象的格子，空区域不占据格子容器。",
            why: "大地图和负坐标更适合用坐标 key 访问字典。",
            status: "SPARSE", activeLines: [4],
            metrics: [["container", "Dictionary"], ["empty cells", "not stored"], ["distribution", "sparse"]],
            view: { type: "space", mode: "grid", stage: "insert", note: "only occupied cells have keys" }
          },
          {
            phase: "坐标映射", title: "世界位置通过 cellSize 映射为 key",
            copy: "gx 与 gy 使用 floor(position / cellSize) 计算，结果可直接作为字典键。",
            why: "同一格内的连续坐标共享同一个离散索引。",
            status: "HASH", activeLines: [0, 1],
            metrics: [["input", "world position"], ["operation", "floor / cellSize"], ["output", "Vector2Int key"]],
            view: { type: "space", mode: "grid", stage: "insert", note: "world → cell key" }
          },
          {
            phase: "单位移动", title: "跨格时先从旧 key 移除",
            copy: "动态对象离开原格子后，旧格子的列表必须同步更新。",
            why: "不移除会产生幽灵候选，同一个对象还可能重复出现。",
            status: "REMOVE OLD", activeLines: [2],
            metrics: [["old cell", "remove"], ["new cell", "pending"], ["duplicate risk", "blocked"]],
            view: { type: "space", mode: "grid", stage: "near", note: "remove from old cell" }
          },
          {
            phase: "重新登记", title: "把单位加入新的格子列表",
            copy: "只有跨越格子边界时才需要更新索引；同格内移动不改变 key。",
            why: "更新频率由格子变化决定，而不是每一帧都重建整个结构。",
            status: "ADD NEW", activeLines: [3],
            metrics: [["new cell", "add"], ["same-cell move", "no reindex"], ["query", "current data"]],
            view: { type: "space", mode: "grid", stage: "candidate", note: "register in new cell" }
          }
        ]
      },
      quadtree: {
        label: "四叉树分裂",
        code: [
          "units.Add(unit);",
          "if (units.Count > capacity && depth < maxDepth)",
          "    Split();",
          "    MoveUnitsToChildren();",
          "if (!child.Contains(bounds)) keepInCurrentNode();"
        ],
        steps: [
          {
            phase: "根节点", title: "整个二维区域先由一个节点管理",
            copy: "四叉树从 Root 开始，节点保存范围、对象、深度、容量和子节点。",
            why: "对象少的区域没有必要提前切分。",
            status: "ROOT", activeLines: [0],
            metrics: [["nodes", "1"], ["children", "none"], ["density", "low"]],
            view: { type: "space", mode: "tree", stage: "root", note: "QUADTREE" }
          },
          {
            phase: "超过容量", title: "节点拥挤时触发分裂",
            copy: "文章示例使用容量 8、最大深度 5；超过容量且未到最大深度才继续切分。",
            why: "容量与最大深度共同限制树的规模。",
            status: "CAPACITY", activeLines: [1],
            metrics: [["capacity", "8"], ["maxDepth", "5"], ["condition", "count > capacity"]],
            view: { type: "space", mode: "tree", stage: "capacity", note: "QUADTREE" }
          },
          {
            phase: "一分为四", title: "Root 切成 NW / NE / SW / SE",
            copy: "原来的对象重新分配到四个子区域。",
            why: "查询可以整块跳过与目标范围不相交的子节点。",
            status: "SPLIT", activeLines: [2, 3],
            metrics: [["children", "4"], ["regions", "NW NE SW SE"], ["redistribute", "yes"]],
            view: { type: "space", mode: "tree", stage: "split", note: "QUADTREE" }
          },
          {
            phase: "密集区继续细分", title: "只有拥挤的 NW 再切一层",
            copy: "对象多的区域变细，对象少的区域保持粗粒度。",
            why: "自适应划分让树结构跟随对象密度。",
            status: "ADAPT", activeLines: [1, 2, 3],
            metrics: [["dense region", "NW"], ["other regions", "unchanged"], ["depth", "+1"]],
            view: { type: "space", mode: "tree", stage: "nested", note: "QUADTREE" }
          },
          {
            phase: "跨区对象", title: "放不进单个子节点就留在父节点",
            copy: "有大小的对象可能跨越多块区域，强行下放会造成重复插入。",
            why: "保留在当前节点能避免同一对象出现在多个子树。",
            status: "KEEP PARENT", activeLines: [4],
            metrics: [["object", "spans regions"], ["child fit", "none"], ["storage", "parent node"]],
            view: { type: "space", mode: "tree", stage: "parent", note: "QUADTREE" }
          }
        ]
      },
      query: {
        label: "粗筛 → 精筛",
        code: [
          "searchArea = Rect(5, 5, 10, 10);",
          "if (!bounds.Overlaps(searchArea)) return;",
          "candidates.Add(unit);",
          "radiusSqr = 5 * 5;",
          "if (distanceSqr <= radiusSqr) result.Add(unit);"
        ],
        steps: [
          {
            phase: "构造查询盒", title: "圆形技能先用矩形包围",
            copy: "玩家位于 (10, 10)、半径为 5，因此粗筛范围是 x:5~15、y:5~15。",
            why: "矩形与树节点的相交测试更便宜。",
            status: "AABB QUERY", activeLines: [0],
            metrics: [["center", "(10, 10)"], ["radius", "5"], ["rect", "5..15"]],
            view: { type: "space", mode: "candidates", stage: "area", note: "BROAD → NARROW" }
          },
          {
            phase: "跳过无关节点", title: "不相交的整块区域直接返回",
            copy: "查询不进入与 searchArea 不重叠的节点。",
            why: "空间结构的收益来自批量跳过，而不是让单次检测更快。",
            status: "PRUNE", activeLines: [1],
            metrics: [["overlap", "false → skip"], ["visited", "intersecting nodes"], ["saved work", "whole branches"]],
            view: { type: "space", mode: "candidates", stage: "prune", note: "BROAD → NARROW" }
          },
          {
            phase: "收集候选", title: "矩形范围内的对象进入候选集",
            copy: "候选对象只表示可能命中，还不能直接作为圆形技能结果。",
            why: "AABB 的角落位于圆形半径之外。",
            status: "CANDIDATES", activeLines: [2],
            metrics: [["A", "candidate"], ["B", "candidate"], ["C", "outside branch"]],
            view: { type: "space", mode: "candidates", stage: "collect", note: "BROAD → NARROW" }
          },
          {
            phase: "距离平方", title: "逐个候选做 d² ≤ 25",
            copy: "最终命中使用圆形条件精筛，避免把矩形角落误判为命中。",
            why: "粗筛负责少算，精筛负责算准。",
            status: "NARROW", activeLines: [3, 4],
            metrics: [["radiusSqr", "25"], ["A", "d² <= 25"], ["B", "d² > 25"]],
            view: { type: "space", mode: "candidates", stage: "filter", note: "BROAD → NARROW" }
          },
          {
            phase: "最终结果", title: "只保留通过精筛的对象",
            copy: "A 进入最终 result，B 被排除，C 从未进入候选集合。",
            why: "两阶段查询同时兼顾规模与准确性。",
            status: "RESULT", activeLines: [4],
            metrics: [["result", "A"], ["rejected", "B"], ["never visited", "C"]],
            view: { type: "space", mode: "candidates", stage: "result", note: "BROAD → NARROW" }
          }
        ]
      }
    }
  }
});

const root = document.querySelector("[data-interactive-lab]");
const refs = Object.freeze({
  title: document.querySelector("#lab-title"),
  phase: document.querySelector("#phase"),
  stepTitle: document.querySelector("#step-title"),
  copy: document.querySelector("#step-copy"),
  why: document.querySelector("#step-why"),
  article: document.querySelector("#article-link"),
  visualTitle: document.querySelector("#visual-title"),
  visualStatus: document.querySelector("#visual-status"),
  stage: document.querySelector("#visual-stage"),
  metrics: document.querySelector("#metrics"),
  code: document.querySelector("#code-lines"),
  codeStatus: document.querySelector("#code-status"),
  stepLabel: document.querySelector("#step-label"),
  stepCount: document.querySelector("#step-count"),
  cases: document.querySelector("#case-tabs"),
  dots: document.querySelector("#step-dots"),
  previous: document.querySelector("#prev-button"),
  next: document.querySelector("#next-button"),
  reset: document.querySelector("#reset-button"),
  auto: document.querySelector("#auto-button")
});

const flagLabels = ["Normal", "Precision", "Block", "Critical", "Miss", "Heal"];
const randomMethods = ["weighted", "pity", "bag", "reproducible", "stable", "plain"];
const randomMethodLabels = ["WEIGHT", "PITY", "BAG", "SEED", "STABLE", "PLAIN"];
const bagSequence = ["普通", "稀有", "普通", "普通", "史诗", "普通", "普通", "稀有", "普通", "普通"];

let scenarioName = location.hash.length > 1 ? location.hash.slice(1) : root.dataset.initialScenario;
if (!Object.hasOwn(scenarios, scenarioName)) {
  throw new Error(`[SystemsLab] 未知专题：${scenarioName}`);
}
let caseName = scenarios[scenarioName].initialCase;
let player;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderFlags(view) {
  refs.visualTitle.textContent = "二进制寄存器";
  refs.visualStatus.textContent = view.value.toString(2).padStart(6, "0");
  const wrapper = element("div", "bit-register");
  const row = element("div", "bit-row");
  for (let bit = 5; bit >= 0; bit -= 1) {
    const on = (view.value & (1 << bit)) !== 0;
    const cell = element("div", `bit${on ? " is-on" : ""}${view.focus === bit ? " is-focus" : ""}`, on ? "1" : "0");
    cell.append(element("small", "", `bit ${bit}`));
    row.append(cell);
  }
  wrapper.append(row);
  const tags = element("div", "flag-tags");
  flagLabels.forEach((label, bit) => {
    const on = (view.value & (1 << bit)) !== 0;
    tags.append(element("span", `flag-tag${on ? " is-on" : ""}`, label));
  });
  wrapper.append(tags);
  if (view.note) wrapper.append(element("div", "space-formula", view.note));
  refs.stage.replaceChildren(wrapper);
}

function renderRandom(view) {
  refs.visualTitle.textContent = "随机策略剖面";
  refs.visualStatus.textContent = view.note;
  const wrapper = element("div", "random-map");
  const methods = element("div", "method-strip");
  randomMethods.forEach((method, index) => {
    methods.append(element("span", `method-chip${method === view.method ? " is-active" : ""}`, randomMethodLabels[index]));
  });
  wrapper.append(methods);

  if (view.mode === "weights" || view.mode === "range" || view.mode === "intervals" || view.mode === "ratio") {
    const bar = element("div", "weight-bar");
    [["金币", "10"], ["药水", "30"], ["装备", "60"]].forEach(([name, value]) => {
      const item = element("div");
      item.append(element("span", "", `${name}\n${value}`));
      bar.append(item);
    });
    wrapper.append(bar, element("div", "random-note", view.note));
  } else if (view.mode === "pity") {
    const track = element("div", "pity-track");
    for (let index = 0; index < 6; index += 1) {
      track.append(element("div", `pity-step${index <= view.level ? " is-active" : ""}`, index === 5 ? "MAX" : `FAIL ${index}`));
    }
    wrapper.append(track, element("div", "random-note", view.note));
  } else if (view.mode === "bag") {
    const bag = element("div", "bag-row");
    bagSequence.forEach((value, index) => {
      const type = value === "稀有" ? " rare" : value === "史诗" ? " epic" : "";
      const item = element("div", `bag-item${type}${index <= view.cursor ? " is-active" : ""}`, value);
      if (index === view.cursor) item.style.outline = "2px solid var(--acid)";
      bag.append(item);
    });
    wrapper.append(bag, element("div", "random-note", view.note));
  } else if (view.mode === "seed") {
    const seed = element("div", "seed-panel");
    seed.append(element("div", "seed-box", view.left), element("div", "seed-arrow", "→"), element("div", "seed-box", view.right));
    wrapper.append(seed, element("div", "random-note", view.note));
  }
  refs.stage.replaceChildren(wrapper);
}

function createSpaceGrid(stage, note) {
  const wrapper = element("div", "space-map");
  const grid = element("div", "space-grid");
  for (let index = 0; index < 12; index += 1) {
    const row = Math.floor(index / 4);
    const column = index % 4;
    const near = Math.abs(row - 1) <= 1 && Math.abs(column - 1) <= 1;
    let classes = "space-cell";
    if (stage === "all") classes += " is-scan";
    if (["near", "candidate", "precise"].includes(stage) && near) classes += " is-near";
    if (["candidate", "precise"].includes(stage) && row === 2 && column === 2) classes += " is-candidate";
    const cell = element("div", classes, `${column},${row}`);
    if (row === 1 && column === 1) cell.append(element("span", "unit player", "P"));
    if (row === 2 && column === 2) cell.append(element("span", "unit enemy", "E"));
    grid.append(cell);
  }
  wrapper.append(grid);
  const formula = stage === "precise" ? "radius = 5  →  radius² = 25  →  compare d² ≤ 25" : note;
  if (formula) wrapper.append(element("div", "space-formula", formula));
  return wrapper;
}

function renderTree(view) {
  const wrapper = element("div", "tree-map");
  wrapper.append(element("div", `tree-node-box${view.stage === "root" || view.stage === "capacity" || view.stage === "parent" ? " is-active" : ""}`, "ROOT / bounds / units"));
  if (view.stage !== "root" && view.stage !== "capacity") {
    const children = element("div", "tree-children");
    ["NW", "NE", "SW", "SE"].forEach((name) => {
      children.append(element("div", `tree-node-box${view.stage === "nested" && name === "NW" ? " is-active" : ""}`, name));
    });
    wrapper.append(children);
    if (view.stage === "nested") wrapper.append(element("div", "space-formula", "NW → NW / NE / SW / SE"));
    if (view.stage === "parent") wrapper.append(element("div", "space-formula", "跨越多个子区域的对象保留在 ROOT"));
  } else if (view.stage === "capacity") {
    wrapper.append(element("div", "space-formula", "units.Count > 8  &&  depth < 5"));
  }
  return wrapper;
}

function renderCandidates(view) {
  const wrapper = element("div", "candidate-list");
  const states = {
    area: [["SEARCH RECT", "x:5..15 / y:5..15", "is-candidate"]],
    prune: [["NODE LEFT", "overlap → visit", "is-candidate"], ["NODE RIGHT", "no overlap → skip", "is-reject"]],
    collect: [["UNIT A", "candidate", "is-candidate"], ["UNIT B", "candidate", "is-candidate"], ["UNIT C", "skipped with branch", "is-reject"]],
    filter: [["UNIT A", "d² ≤ 25", "is-hit"], ["UNIT B", "d² > 25", "is-reject"], ["UNIT C", "not visited", "is-reject"]],
    result: [["RESULT", "A", "is-hit"], ["REJECTED", "B", "is-reject"], ["UNVISITED", "C", "is-reject"]]
  };
  states[view.stage].forEach(([name, result, state]) => {
    const item = element("div", `candidate ${state}`);
    item.append(element("span", "", name), element("strong", "", result));
    wrapper.append(item);
  });
  return wrapper;
}

function renderSpace(view) {
  refs.visualTitle.textContent = view.mode === "tree" ? "自适应空间树" : view.mode === "candidates" ? "两阶段范围查询" : "固定网格索引";
  if (typeof view.note !== "string" || view.note.length === 0) {
    throw new Error("[SystemsLab] 空间视图必须明确提供状态标签");
  }
  refs.visualStatus.textContent = view.note;
  if (view.mode === "tree") refs.stage.replaceChildren(renderTree(view));
  else if (view.mode === "candidates") refs.stage.replaceChildren(renderCandidates(view));
  else refs.stage.replaceChildren(createSpaceGrid(view.stage, view.note));
}

function renderMetrics(items) {
  refs.metrics.replaceChildren();
  items.forEach(([name, value]) => {
    const row = element("div");
    row.append(element("dt", "", name), element("dd", "", value));
    refs.metrics.append(row);
  });
}

function renderCode(currentCase, step) {
  refs.code.replaceChildren();
  currentCase.code.forEach((line, index) => {
    refs.code.append(element("li", step.activeLines.includes(index) ? "is-active" : "", line));
  });
}

function currentScenario() {
  return scenarios[scenarioName];
}

function currentCase() {
  return currentScenario().cases[caseName];
}

function render({ step, index, total }) {
  const scenario = currentScenario();
  refs.title.textContent = scenario.title;
  refs.phase.textContent = step.phase;
  refs.stepTitle.textContent = step.title;
  refs.copy.textContent = step.copy;
  refs.why.textContent = step.why;
  refs.article.href = scenario.article;
  refs.codeStatus.textContent = step.status;
  refs.stepLabel.textContent = `STEP ${String(index + 1).padStart(2, "0")}`;
  refs.stepCount.textContent = `${index + 1} / ${total}`;
  renderMetrics(step.metrics);
  renderCode(currentCase(), step);
  if (step.view.type === "flags") renderFlags(step.view);
  else if (step.view.type === "random") renderRandom(step.view);
  else if (step.view.type === "space") renderSpace(step.view);
  else throw new Error(`[SystemsLab] 未知视图：${step.view.type}`);
}

function rebuildCaseTabs() {
  refs.cases.replaceChildren();
  Object.entries(currentScenario().cases).forEach(([name, value]) => {
    const button = element("button", `case-tab${name === caseName ? " is-active" : ""}`, value.label);
    button.type = "button";
    button.dataset.case = name;
    button.dataset.labControl = "";
    button.setAttribute("aria-pressed", String(name === caseName));
    button.addEventListener("click", () => {
      caseName = name;
      refs.cases.querySelectorAll("[data-case]").forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-pressed", String(active));
      });
      player.replaceSteps(currentCase().steps);
    });
    refs.cases.append(button);
  });
}

player = window.XianyuInteractiveLab.createStepPlayer({
  steps: currentCase().steps,
  autoStepMs: 2000,
  endBehavior: "restart",
  dotElement: "button",
  dotsInteractive: true,
  controls: {
    previous: refs.previous,
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

document.querySelectorAll("[data-scenario]").forEach((tab) => {
  const active = tab.dataset.scenario === scenarioName;
  tab.classList.toggle("is-active", active);
  tab.setAttribute("aria-pressed", String(active));
});
rebuildCaseTabs();
document.querySelectorAll("[data-scenario]").forEach((button) => {
  button.addEventListener("click", () => {
    scenarioName = button.dataset.scenario;
    if (!Object.hasOwn(scenarios, scenarioName)) {
      throw new Error(`[SystemsLab] 未知专题：${scenarioName}`);
    }
    caseName = currentScenario().initialCase;
    document.querySelectorAll("[data-scenario]").forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-pressed", String(active));
    });
    history.replaceState(null, "", `#${scenarioName}`);
    rebuildCaseTabs();
    player.replaceSteps(currentCase().steps);
  });
});
