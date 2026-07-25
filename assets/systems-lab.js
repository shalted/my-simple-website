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
          "cursor = 0;",
          "cursor += entry.Weight;",
          "if (rolled < cursor) return entry;",
          "probability = entry.Weight / totalWeight;"
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
            phase: "求和", title: "先把权重拼成总区间",
            copy: "10 + 30 + 60 得到 totalWeight = 100；这一步只确定随机刻度的总长度。",
            why: "总权重定义了整条刻度的长度。",
            status: "TOTAL", activeLines: [0],
            metrics: [["totalWeight", "100"], ["range", "0..99"], ["entries", "3"]],
            view: { type: "random", method: "weighted", mode: "range", note: "roll ∈ [0, 100)" }
          },
          {
            phase: "生成输入", title: "只生成一个 roll",
            copy: "随机源在 [0, 100) 中给出一个整数。它不是结果，只是等待被区间解释的输入。",
            why: "把随机输入和候选选择分开，才能明确检查边界是否正确。",
            status: "ROLL", activeLines: [1],
            metrics: [["input", "roll"], ["domain", "0..99"], ["selected", "not yet"]],
            view: { type: "random", method: "weighted", mode: "range", note: "先有 roll，再解释它落在哪段" }
          },
          {
            phase: "建立游标", title: "cursor 从 0 开始累加",
            copy: "遍历候选前把 cursor 设为 0；每遇到一项，就把该项权重加到累计边界。",
            why: "cursor 表示当前候选区间的右边界。",
            status: "CURSOR", activeLines: [2, 3],
            metrics: [["start", "0"], ["after gold", "10"], ["interval", "0..9"]],
            view: { type: "random", method: "weighted", mode: "intervals", note: "金币把 cursor 从 0 推到 10" }
          },
          {
            phase: "逐段判断", title: "roll 小于 cursor 时命中",
            copy: "金币检查 roll < 10；未命中就继续累加到 40，再检查药水，最后累加到 100。",
            why: "半开区间让 10 归入药水、40 归入装备，边界不会重叠。",
            status: "SELECT", activeLines: [3, 4],
            metrics: [["gold", "roll < 10"], ["potion", "roll < 40"], ["equipment", "roll < 100"]],
            view: { type: "random", method: "weighted", mode: "intervals", note: "0–9 / 10–39 / 40–99" }
          },
          {
            phase: "理解概率", title: "概率来自权重占总量的比例",
            copy: "单项概率等于 weight / totalWeight，因此三项分别是 10%、30%、60%。",
            why: "把所有权重同比缩放，份额不变，最终概率也不变。",
            status: "RATIO", activeLines: [5],
            metrics: [["10:30:60", "1:3:6"], ["probability", "10% / 30% / 60%"], ["short term", "not guaranteed"]],
            view: { type: "random", method: "weighted", mode: "ratio", note: "长期份额 ≠ 短期必然分布" }
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
          "same seed + same call order => same sequence;",
          "StableHash01(groupId, instanceId, purpose, version, index);",
          "purpose separates random channels;",
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
            phase: "记录 Seed", title: "先保存随机序列的起点",
            copy: "创建随机源时记录 seed，测试和回放才能从同一个起点重新开始。",
            why: "可复现随机把偶发问题变成可以重复验证的问题。",
            status: "CAPTURE", activeLines: [0],
            metrics: [["input", "seed"], ["saved", "yes"], ["sequence", "not replayed yet"]],
            view: { type: "random", method: "reproducible", mode: "seed", left: "Seed\n已记录", right: "Random Source\n同一起点", note: "记录起点是复现的第一步" }
          },
          {
            phase: "重放序列", title: "调用顺序也必须保持一致",
            copy: "相同 seed 只有在随机调用次数和顺序也相同时，才会得到相同序列。",
            why: "中途多调用或少调用一次，后续所有结果都会错位。",
            status: "REPLAY", activeLines: [1],
            metrics: [["seed", "same"], ["call order", "same"], ["sequence", "repeatable"]],
            view: { type: "random", method: "reproducible", mode: "seed", left: "Seed + Calls\n同样输入", right: "Sequence\n同样顺序", note: "seed 相同只是必要条件" }
          },
          {
            phase: "稳定输入", title: "Hash 输入决定个体差异",
            copy: "groupId、instanceId、purpose、version、index 混合成稳定的 0~1 值。",
            why: "同一轮里角色差异存在，但不会每帧乱跳。",
            status: "STABLE", activeLines: [2, 4],
            metrics: [["inputs", "5 stable fields"], ["output", "0..1"], ["frame jitter", "none"]],
            view: { type: "random", method: "reproducible", mode: "seed", left: "Stable Inputs\nID + purpose + version", right: "Stable 01\n同轮固定", note: "same inputs → same value" }
          },
          {
            phase: "用途隔离", title: "purpose 防止不同随机互相串扰",
            copy: "站位、掉落、动画偏移使用不同 purpose；其他输入相同，也会进入不同随机通道。",
            why: "新增一种随机用途，不应该悄悄改变已有用途的结果。",
            status: "CHANNEL", activeLines: [3],
            metrics: [["shared ids", "same"], ["purpose", "different"], ["channels", "isolated"]],
            view: { type: "random", method: "reproducible", mode: "seed", left: "purpose = position\nStable A", right: "purpose = loot\nStable B", note: "用途是稳定输入的一部分" }
          },
          {
            phase: "版本变化", title: "只在语义变化时重新随机",
            copy: "意图版本改变后输入发生变化，系统才生成新的稳定结果。",
            why: "version 是显式的刷新开关，避免把随机更新绑在每一帧。",
            status: "REROLL", activeLines: [5],
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
          "cell = WorldToCell(player.position);",
          "grid[cell].Add(player);",
          "foreach (key in NineCells(cell))",
          "    candidates.AddRange(grid[key]);",
          "saved = allUnits.Count - candidates.Count;",
          "foreach (unit in candidates) PreciseTest(unit);"
        ],
        steps: [
          {
            phase: "基线", title: "先看不分区时要检查多少对象",
            copy: "每个非玩家格放一个待查询单位。没有空间索引时，查询必须检查其余全部对象。",
            why: "只有先建立全量扫描基线，后面才能量化空间划分究竟省了多少计算。",
            status: "GLOBAL", activeLines: [],
            metrics: [["baseline", "all non-player units"], ["index", "none"], ["action", "scan everything"]],
            view: { type: "space", mode: "grid", stage: "all", note: "GLOBAL SCAN" }
          },
          {
            phase: "交互输入", title: "点击任意格放置玩家",
            copy: "把玩家放到角落、边缘或内部，邻接范围会随位置变化。每次点击都会重新计算。",
            why: "算法相同，但输入位置不同，候选数量和节省比例也会不同。",
            status: "PLACE PLAYER", activeLines: [0],
            metrics: [["input", "player cell"], ["editable", "click any cell"], ["output", "cell key"]],
            view: { type: "space", mode: "grid", stage: "insert", note: "CLICK A CELL" }
          },
          {
            phase: "建立索引", title: "世界位置映射成格子 key",
            copy: "玩家位置先转换为离散格子坐标，对象也登记在各自格子的列表中。",
            why: "连续世界坐标必须先变成可枚举、可查找的空间索引。",
            status: "INDEX", activeLines: [0, 1],
            metrics: [["world position", "continuous"], ["cell key", "discrete"], ["lookup", "direct"]],
            view: { type: "space", mode: "grid", stage: "insert", note: "WORLD → CELL KEY" }
          },
          {
            phase: "邻格粗筛", title: "只枚举玩家周围的有效格子",
            copy: "九宫格以玩家格为中心，但位于地图边缘时，越界格会被自然排除。",
            why: "角落最多访问 4 格，边缘最多访问 6 格，内部最多访问 9 格。",
            status: "NEIGHBORS", activeLines: [2],
            metrics: [["center", "player cell"], ["range", "adjacent keys"], ["out of bounds", "skip"]],
            view: { type: "space", mode: "grid", stage: "near", note: "ENUMERATE VALID NEIGHBORS" }
          },
          {
            phase: "候选对比", title: "把全量检查缩小成邻格候选",
            copy: "只收集有效邻格里的单位；下方会实时显示候选数、减少次数和减少比例。",
            why: "空间结构并没有让单次检测更快，而是让需要检测的对象变少。",
            status: "COMPARE", activeLines: [3, 4],
            metrics: [["baseline", "global checks"], ["optimized", "candidate checks"], ["difference", "live comparison"]],
            view: { type: "space", mode: "grid", stage: "candidate", note: "GLOBAL vs NEIGHBOR CANDIDATES" }
          },
          {
            phase: "精确阶段", title: "候选仍然需要真实规则确认",
            copy: "邻格只负责减少候选；距离、视野、阵营等精确条件仍要逐个检查候选对象。",
            why: "Broad Phase 负责少算，Narrow Phase 负责算准，两者不能互相替代。",
            status: "HANDOFF", activeLines: [5],
            metrics: [["broad phase", "grid candidates"], ["narrow phase", "precise rule"], ["final result", "after testing"]],
            view: { type: "space", mode: "grid", stage: "precise", note: "CANDIDATES → PRECISE TEST" }
          }
        ]
      },      hash: {
        label: "空间 Hash 与移动",
        code: [
          "Dictionary<Vector2Int, List<Unit>> grids;",
          "gx = FloorToInt(position.x / cellSize);",
          "gy = FloorToInt(position.z / cellSize);",
          "grids[cell].Add(unit);",
          "if (newCell == oldCell) return;",
          "oldCell.Remove(unit);",
          "newCell.Add(unit);"
        ],
        steps: [
          {
            phase: "稀疏地图", title: "不提前创建整张二维数组",
            copy: "空间 Hash 只保存真正有对象的格子，空区域不占据格子容器。",
            why: "大地图和负坐标更适合用坐标 key 访问字典。",
            status: "SPARSE", activeLines: [0],
            metrics: [["container", "Dictionary"], ["empty cells", "not stored"], ["distribution", "sparse"]],
            view: { type: "space", mode: "grid", stage: "insert", note: "only occupied cells have keys" }
          },
          {
            phase: "坐标映射", title: "世界位置通过 cellSize 映射为 key",
            copy: "gx 与 gy 使用 floor(position / cellSize) 计算，结果可直接作为字典键。",
            why: "同一格内的连续坐标共享同一个离散索引。",
            status: "HASH", activeLines: [1, 2],
            metrics: [["input", "world position"], ["operation", "floor / cellSize"], ["output", "Vector2Int key"]],
            view: { type: "space", mode: "grid", stage: "insert", note: "world → cell key" }
          },
          {
            phase: "首次登记", title: "把对象加入当前格子的列表",
            copy: "坐标 key 只负责定位容器；对象仍需要显式加入该 key 对应的列表。",
            why: "建立 key 与对象列表的关联后，查询才能按格子收集候选。",
            status: "INSERT", activeLines: [3],
            metrics: [["cell key", "resolved"], ["unit", "added"], ["index", "current"]],
            view: { type: "space", mode: "grid", stage: "insert", note: "cell key → unit list" }
          },
          {
            phase: "同格移动", title: "key 没变就不更新索引",
            copy: "对象在同一个格子内部移动时，newCell 与 oldCell 相同，可以直接结束索引更新。",
            why: "空间索引关心跨格变化，不需要响应每一小段世界坐标变化。",
            status: "UNCHANGED", activeLines: [4],
            metrics: [["old cell", "same"], ["new cell", "same"], ["reindex", "skip"]],
            view: { type: "space", mode: "grid", stage: "insert", note: "same key → no index mutation" }
          },
          {
            phase: "跨格移动", title: "先从旧 key 移除",
            copy: "动态对象离开原格子后，旧格子的列表必须同步更新。",
            why: "不移除会产生幽灵候选，同一个对象还可能重复出现。",
            status: "REMOVE OLD", activeLines: [5],
            metrics: [["old cell", "remove"], ["new cell", "pending"], ["duplicate risk", "blocked"]],
            view: { type: "space", mode: "grid", stage: "near", note: "remove from old cell" }
          },
          {
            phase: "重新登记", title: "把对象加入新 key",
            copy: "旧索引清理完成后，把对象加入新格子的列表，查询才能读到最新位置。",
            why: "更新动作由“旧格移除 + 新格加入”共同组成，缺一不可。",
            status: "ADD NEW", activeLines: [6],
            metrics: [["new cell", "add"], ["old cell", "clean"], ["query", "current data"]],
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
  principleProblem: document.querySelector("#principle-problem"),
  principleMechanism: document.querySelector("#principle-mechanism"),
  principleBoundary: document.querySelector("#principle-boundary"),
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

const principles = Object.freeze({
  flags: Object.freeze({
    operations: Object.freeze({
      problem: "多个独立开关需要一起存储、传递和判断。",
      mechanism: "每个标记占一位，用 OR 组合、AND 判断、AND NOT 移除。",
      boundary: "位容器只记录状态，不会自动阻止业务上的非法组合。"
    }),
    rules: Object.freeze({
      problem: "Miss、Critical 等标签有些可叠加，有些互斥。",
      mechanism: "流程先确定主结果，再追加修饰标签；更严格时拆成 Outcome 与 Modifiers。",
      boundary: "能写进同一个整数，不代表这个状态在业务上有效。"
    })
  }),
  random: Object.freeze({
    weighted: Object.freeze({
      problem: "候选的出现机会不同，但仍要只抽出一个结果。",
      mechanism: "权重累加成连续区间，一个 roll 落入哪段就选择哪项。",
      boundary: "权重表达相对份额；它不保证短期内一定符合比例。"
    }),
    pity: Object.freeze({
      problem: "固定概率允许某个人连续失败很久。",
      mechanism: "记录 failCount，逐步补偿概率或在上限处直接产出。",
      boundary: "保底改变的是最坏体验，不等于每次抽取都失去随机性。"
    }),
    bag: Object.freeze({
      problem: "独立随机在短周期里可能分布极不均匀。",
      mechanism: "先按配额装袋、打乱，再无放回地逐个抽取。",
      boundary: "配额只在一个袋子周期内成立，跨周期顺序仍会变化。"
    }),
    reproducible: Object.freeze({
      problem: "偶发随机结果难以复盘，也容易让每帧表现抖动。",
      mechanism: "保存 seed 重放序列，或把稳定输入 Hash 成固定的 0~1 值。",
      boundary: "输入或版本变化就会得到新结果，因此输入集合本身也是规则。"
    })
  }),
  space: Object.freeze({
    grid: Object.freeze({
      problem: "范围查询若扫描所有对象，成本会随总对象数增长。",
      mechanism: "先访问附近格子形成候选集，再用距离平方确认命中。",
      boundary: "进入邻格只代表可能命中，不能替代圆形范围的精确判断。"
    }),
    hash: Object.freeze({
      problem: "大而稀疏的动态地图不适合预建完整二维数组。",
      mechanism: "把世界坐标映射成字典 key，对象跨格时同步移除和加入。",
      boundary: "索引若未随移动更新，查询会出现幽灵对象或重复对象。"
    }),
    quadtree: Object.freeze({
      problem: "对象分布不均时，固定格子不是所有区域都合适。",
      mechanism: "拥挤节点递归分裂，查询时整块跳过不相交的子树。",
      boundary: "跨越多个子区的对象不能强行塞进单个子节点。"
    }),
    query: Object.freeze({
      problem: "精确检测很准，但对所有对象执行会浪费计算。",
      mechanism: "Broad Phase 批量排除，Narrow Phase 只精算候选对象。",
      boundary: "粗筛结果不是最终命中；两阶段必须保持职责分离。"
    })
  })
});

const flagEquations = Object.freeze({
  NONE: "000000",
  OR: "000000  |  000010  =  000010",
  COMBINE: "000010  |  001000  =  001010",
  "HAS FLAG": "001010  &  001000  =  001000  →  true",
  REMOVE: "001010  &  ~000010  =  001000",
  STORAGE: "位容器  ≠  业务校验器",
  VALID: "Precision  |  Critical  →  合法组合",
  "EARLY RETURN": "Miss  →  return  →  不再追加修饰",
  REJECT: "Miss  |  Critical  →  可表示，但应拒绝",
  "SPLIT MODEL": "Outcome  ×  Modifiers"
});

const spaceContracts = Object.freeze({
  grid: Object.freeze(["BROAD / 邻格粗筛", "NARROW / 距离确认"]),
  hash: Object.freeze(["INDEX / 坐标映射", "UPDATE / 跨格同步"]),
  quadtree: Object.freeze(["SPLIT / 密集区细分", "PRUNE / 跳过整块区域"]),
  query: Object.freeze(["BROAD / 少算", "NARROW / 算准"])
});

let weightedRoll = null;
let gridPlayerIndex = 5;
let manualFlagValue = 0;
let pitySandboxFailures = 0;
let bagSandboxCursor = -1;
let hashUnitIndex = 5;
let hashPreviousIndex = 5;
let quadtreeSandboxCount = 8;
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

function createFlagSandbox() {
  const panel = element("section", "inline-sandbox");
  const head = element("div", "sandbox-head");
  head.append(element("span", "", "TRY IT / 直接切换标记"));
  const readout = element("strong");
  head.append(readout);
  const controls = element("div", "flag-switches");
  const warning = element("p", "sandbox-message");

  function update() {
    const binary = manualFlagValue.toString(2).padStart(6, "0");
    readout.textContent = `${binary} / ${manualFlagValue}`;
    controls.querySelectorAll("[data-flag-bit]").forEach((button) => {
      const bit = Number(button.dataset.flagBit);
      const on = (manualFlagValue & (1 << bit)) !== 0;
      button.classList.toggle("is-active", on);
      button.setAttribute("aria-pressed", String(on));
    });
    const hasMiss = (manualFlagValue & (1 << 4)) !== 0;
    const hasCritical = (manualFlagValue & (1 << 3)) !== 0;
    warning.className = `sandbox-message${hasMiss && hasCritical ? " is-warning" : ""}`;
    warning.textContent = hasMiss && hasCritical
      ? "容器允许 Miss + Critical，但业务流程应拒绝这个组合。"
      : "点击标签观察二进制位如何独立打开与关闭。";
  }

  flagLabels.forEach((label, bit) => {
    const button = element("button", "", label);
    button.type = "button";
    button.dataset.flagBit = String(bit);
    button.dataset.labControl = "";
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      manualFlagValue ^= 1 << bit;
      update();
    });
    controls.append(button);
  });
  panel.append(head, controls, warning);
  update();
  return panel;
}

function renderFlags(view, status) {
  refs.visualTitle.textContent = "二进制寄存器";
  if (!Object.hasOwn(flagEquations, status)) {
    throw new Error(`[SystemsLab] Flags 状态缺少运算式：${status}`);
  }
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
  wrapper.append(element("div", "bit-equation", flagEquations[status]));
  wrapper.append(createFlagSandbox());
  if (view.note) wrapper.append(element("div", "space-formula", view.note));
  refs.stage.replaceChildren(wrapper);
}

function resolveWeightedRoll(roll) {
  if (!Number.isInteger(roll) || roll < 0 || roll > 99) {
    throw new RangeError(`[SystemsLab] roll 必须是 0 到 99 的整数，收到：${roll}`);
  }
  if (roll <= 9) return Object.freeze({ name: "金币", interval: "0–9" });
  if (roll <= 39) return Object.freeze({ name: "药水", interval: "10–39" });
  return Object.freeze({ name: "装备", interval: "40–99" });
}

function createWeightedRollLab(bar) {
  const lab = element("div", "roll-lab");
  const label = element("label", "roll-label", "输入本次 roll");
  label.htmlFor = "weighted-roll-input";
  const input = element("input", "roll-input");
  input.id = "weighted-roll-input";
  input.type = "number";
  input.min = "0";
  input.max = "99";
  input.step = "1";
  input.placeholder = "0 – 99";
  input.inputMode = "numeric";
  if (weightedRoll !== null) input.value = String(weightedRoll);
  const result = element("output", "roll-result");
  result.htmlFor = input.id;
  const axis = element("div", "roll-axis");
  ["0", "10", "40", "100"].forEach((value) => axis.append(element("span", "", value)));
  const marker = element("span", "roll-marker");
  bar.append(marker);

  function updateSelection() {
    const raw = input.value.trim();
    if (raw.length === 0) {
      weightedRoll = null;
      marker.classList.remove("is-visible");
      result.className = "roll-result";
      result.textContent = "输入一个整数，观察它命中哪段累计区间。";
      return;
    }
    const roll = Number(raw);
    if (!Number.isInteger(roll) || roll < 0 || roll > 99) {
      weightedRoll = null;
      marker.classList.remove("is-visible");
      result.className = "roll-result is-error";
      result.textContent = "roll 必须是 0 到 99 的整数。";
      return;
    }
    weightedRoll = roll;
    const selected = resolveWeightedRoll(roll);
    marker.style.left = `${(roll / 99) * 100}%`;
    marker.classList.add("is-visible");
    result.className = "roll-result is-hit";
    result.textContent = `roll = ${roll} → 落入 ${selected.interval} → 选择「${selected.name}」`;
  }

  input.addEventListener("input", updateSelection);
  const inputRow = element("div", "roll-input-row");
  inputRow.append(label, input);
  lab.append(inputRow, axis, result);
  updateSelection();
  return lab;
}

function createPitySandbox() {
  const panel = element("section", "inline-sandbox");
  const head = element("div", "sandbox-head");
  head.append(element("span", "", "TRY IT / 手动推进保底状态"));
  const readout = element("strong");
  head.append(readout);
  const controls = element("div", "sandbox-actions");
  const fail = element("button", "", "记录一次失败");
  const success = element("button", "", "命中并重置");
  fail.type = "button";
  success.type = "button";
  fail.dataset.labControl = "";
  success.dataset.labControl = "";
  const message = element("p", "sandbox-message");

  function update() {
    readout.textContent = `failCount = ${pitySandboxFailures}`;
    fail.disabled = pitySandboxFailures >= 5;
    message.className = `sandbox-message${pitySandboxFailures >= 5 ? " is-hit" : ""}`;
    message.textContent = pitySandboxFailures >= 5
      ? "达到演示上限：下一次由硬保底直接产出。"
      : `还可以继续记录失败；成功时计数会回到 0。`;
  }

  fail.addEventListener("click", () => {
    if (pitySandboxFailures < 5) pitySandboxFailures += 1;
    update();
  });
  success.addEventListener("click", () => {
    pitySandboxFailures = 0;
    update();
  });
  controls.append(fail, success);
  panel.append(head, controls, message);
  update();
  return panel;
}

function createBagSandbox() {
  const panel = element("section", "inline-sandbox");
  const head = element("div", "sandbox-head");
  head.append(element("span", "", "TRY IT / 无放回抽取"));
  const readout = element("strong");
  head.append(readout);
  const controls = element("div", "sandbox-actions");
  const draw = element("button", "", "抽取下一个");
  const refill = element("button", "", "重新装袋");
  draw.type = "button";
  refill.type = "button";
  draw.dataset.labControl = "";
  refill.dataset.labControl = "";
  const message = element("p", "sandbox-message");

  function update() {
    if (bagSandboxCursor < 0) {
      readout.textContent = "READY / 10";
      message.textContent = "袋内配额固定，但抽取顺序已经打乱。";
      return;
    }
    const remaining = bagSequence.length - bagSandboxCursor - 1;
    readout.textContent = `${bagSequence[bagSandboxCursor]} / 剩余 ${remaining}`;
    message.textContent = remaining === 0 ? "本周期用完；再次抽取会开始新周期。" : "已抽出的结果不会在本周期再次出现。";
  }

  draw.addEventListener("click", () => {
    bagSandboxCursor = bagSandboxCursor >= bagSequence.length - 1 ? 0 : bagSandboxCursor + 1;
    update();
  });
  refill.addEventListener("click", () => {
    bagSandboxCursor = -1;
    update();
  });
  controls.append(draw, refill);
  panel.append(head, controls, message);
  update();
  return panel;
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
    wrapper.append(bar);
    if (view.method === "weighted") wrapper.append(createWeightedRollLab(bar));
    wrapper.append(element("div", "random-note", view.note));
  } else if (view.mode === "pity") {
    const track = element("div", "pity-track");
    for (let index = 0; index < 6; index += 1) {
      track.append(element("div", `pity-step${index <= view.level ? " is-active" : ""}`, index === 5 ? "MAX" : `FAIL ${index}`));
    }
    wrapper.append(track, createPitySandbox(), element("div", "random-note", view.note));
  } else if (view.mode === "bag") {
    const bag = element("div", "bag-row");
    bagSequence.forEach((value, index) => {
      const type = value === "稀有" ? " rare" : value === "史诗" ? " epic" : "";
      const item = element("div", `bag-item${type}${index <= view.cursor ? " is-active" : ""}`, value);
      if (index === view.cursor) item.style.outline = "2px solid var(--acid)";
      bag.append(item);
    });
    wrapper.append(bag, createBagSandbox(), element("div", "random-note", view.note));
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
  if (note) wrapper.append(element("div", "space-formula", note));
  return wrapper;
}

function createInteractiveGrid(stage) {
  const width = 4;
  const height = 3;
  const cellCount = width * height;
  const playerRow = Math.floor(gridPlayerIndex / width);
  const playerColumn = gridPlayerIndex % width;
  const globalChecks = cellCount - 1;
  let candidateChecks = 0;
  let visitedCells = 0;

  for (let index = 0; index < cellCount; index += 1) {
    const row = Math.floor(index / width);
    const column = index % width;
    const near = Math.abs(row - playerRow) <= 1 && Math.abs(column - playerColumn) <= 1;
    if (near) visitedCells += 1;
    if (near && index !== gridPlayerIndex) candidateChecks += 1;
  }

  const onHorizontalEdge = playerColumn === 0 || playerColumn === width - 1;
  const onVerticalEdge = playerRow === 0 || playerRow === height - 1;
  const positionType = onHorizontalEdge && onVerticalEdge ? "角落" : onHorizontalEdge || onVerticalEdge ? "边缘" : "内部";
  const savedChecks = globalChecks - candidateChecks;
  const reduction = Math.round((savedChecks / globalChecks) * 100);

  const wrapper = element("div", "space-map interactive-grid");
  const prompt = element("div", "grid-prompt");
  prompt.append(
    element("span", "", "INPUT / 点击格子移动玩家"),
    element("strong", "", `当前位置：(${playerColumn}, ${playerRow}) · ${positionType}`)
  );
  const grid = element("div", "space-grid");

  for (let index = 0; index < cellCount; index += 1) {
    const row = Math.floor(index / width);
    const column = index % width;
    const isPlayer = index === gridPlayerIndex;
    const near = Math.abs(row - playerRow) <= 1 && Math.abs(column - playerColumn) <= 1;
    let classes = "space-cell is-interactive";
    if (stage === "all") classes += " is-scan";
    if (["near", "candidate", "precise"].includes(stage) && near) classes += " is-near";
    if (["candidate", "precise"].includes(stage) && near && !isPlayer) classes += " is-candidate";
    const cell = element("button", classes);
    cell.type = "button";
    cell.dataset.labControl = "";
    cell.setAttribute("aria-label", `把玩家放到格子 ${column}, ${row}`);
    cell.append(element("small", "cell-coordinate", `${column},${row}`));
    cell.append(element("span", `unit ${isPlayer ? "player" : "enemy"}`, isPlayer ? "P" : "E"));
    cell.addEventListener("click", () => {
      gridPlayerIndex = index;
      renderSpace({ type: "space", mode: "grid", stage, note: "INTERACTIVE GRID" }, "grid");
    });
    grid.append(cell);
  }

  const comparison = element("div", "grid-comparison");
  [
    ["全量检查", String(globalChecks)],
    ["访问格子", String(visitedCells)],
    ["候选检查", String(candidateChecks)],
    ["减少计算", `${savedChecks} / ${reduction}%`]
  ].forEach(([label, value]) => {
    const item = element("div");
    item.append(element("span", "", label), element("strong", "", value));
    comparison.append(item);
  });

  const stageNotes = Object.freeze({
    all: `未使用索引：需要检查其余 ${globalChecks} 个单位`,
    insert: `玩家位于 (${playerColumn}, ${playerRow})，点击其他格可以改变输入`,
    near: `${positionType}位置：有效邻格 ${visitedCells} 个`,
    candidate: `从 ${globalChecks} 次全量检查缩小为 ${candidateChecks} 次候选检查`,
    precise: `把 ${candidateChecks} 个候选交给距离、视野或阵营规则`
  });
  if (!Object.hasOwn(stageNotes, stage)) {
    throw new Error(`[SystemsLab] 九宫格交互缺少阶段说明：${stage}`);
  }

  wrapper.append(grid);
  prompt.append(element("em", "", stageNotes[stage]));
  wrapper.prepend(prompt);
  wrapper.append(comparison);
  return wrapper;
}

function createHashSandbox(stage) {
  const width = 4;
  const height = 3;
  const wrapper = element("div", "space-map interactive-grid");
  const prompt = element("div", "grid-prompt");
  prompt.append(element("span", "", "TRY IT / 点击目标格移动单位"));
  const grid = element("div", "space-grid");
  const oldRow = Math.floor(hashPreviousIndex / width);
  const oldColumn = hashPreviousIndex % width;
  const currentRow = Math.floor(hashUnitIndex / width);
  const currentColumn = hashUnitIndex % width;

  for (let index = 0; index < width * height; index += 1) {
    const row = Math.floor(index / width);
    const column = index % width;
    let classes = "space-cell is-interactive";
    if (index === hashPreviousIndex && hashPreviousIndex !== hashUnitIndex) classes += " is-previous";
    if (index === hashUnitIndex) classes += " is-current";
    const cell = element("button", classes);
    cell.type = "button";
    cell.dataset.labControl = "";
    cell.setAttribute("aria-label", `把单位移动到格子 ${column}, ${row}`);
    cell.append(element("small", "cell-coordinate", `${column},${row}`));
    if (index === hashUnitIndex) cell.append(element("span", "unit enemy", "U"));
    cell.addEventListener("click", () => {
      hashPreviousIndex = hashUnitIndex;
      hashUnitIndex = index;
      renderSpace({ type: "space", mode: "grid", stage, note: "INTERACTIVE HASH" }, "hash");
    });
    grid.append(cell);
  }

  const unchanged = hashPreviousIndex === hashUnitIndex;
  const comparison = element("div", "grid-comparison hash-comparison");
  [
    ["旧 key", `(${oldColumn},${oldRow})`],
    ["新 key", `(${currentColumn},${currentRow})`],
    ["移除旧索引", unchanged ? "跳过" : "执行"],
    ["加入新索引", unchanged ? "跳过" : "执行"]
  ].forEach(([label, value]) => {
    const item = element("div");
    item.append(element("span", "", label), element("strong", "", value));
    comparison.append(item);
  });
  prompt.append(
    element("strong", "", unchanged ? "SAME KEY / 不更新" : "KEY CHANGED / 更新索引"),
    element("em", "", unchanged ? "同格移动不会改变空间索引。" : "先从旧格移除，再加入新格。")
  );
  wrapper.append(prompt, grid, comparison);
  return wrapper;
}

function renderTreeSandbox(container) {
  const panel = element("section", "inline-sandbox tree-sandbox");
  const head = element("div", "sandbox-head");
  head.append(element("span", "", "TRY IT / 改变节点对象数"));
  const readout = element("strong");
  head.append(readout);
  const controls = element("div", "sandbox-actions");
  const remove = element("button", "", "移除 1 个");
  const add = element("button", "", "加入 1 个");
  remove.type = "button";
  add.type = "button";
  remove.dataset.labControl = "";
  add.dataset.labControl = "";
  const live = element("div", "tree-live");
  const message = element("p", "sandbox-message");

  function update() {
    const split = quadtreeSandboxCount > 8;
    readout.textContent = `${quadtreeSandboxCount} / capacity 8`;
    remove.disabled = quadtreeSandboxCount === 0;
    live.replaceChildren();
    live.append(element("div", `tree-node-box${split ? "" : " is-active"}`, `ROOT · ${quadtreeSandboxCount} units`));
    if (split) {
      const children = element("div", "tree-children");
      ["NW", "NE", "SW", "SE"].forEach((name) => children.append(element("div", "tree-node-box is-active", name)));
      live.append(children);
    }
    message.className = `sandbox-message${split ? " is-hit" : ""}`;
    message.textContent = split ? "对象数超过容量：Root 分裂为四个子节点。" : "对象数未超过容量：继续保留在 Root。";
  }

  remove.addEventListener("click", () => {
    if (quadtreeSandboxCount > 0) quadtreeSandboxCount -= 1;
    update();
  });
  add.addEventListener("click", () => {
    quadtreeSandboxCount += 1;
    update();
  });
  controls.append(remove, add);
  panel.append(head, controls, live, message);
  update();
  container.append(panel);
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
  renderTreeSandbox(wrapper);
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

function renderSpace(view, selectedCase) {
  refs.visualTitle.textContent = view.mode === "tree" ? "自适应空间树" : view.mode === "candidates" ? "两阶段范围查询" : "固定网格索引";
  if (!Object.hasOwn(spaceContracts, selectedCase)) {
    throw new Error(`[SystemsLab] 空间案例缺少职责说明：${selectedCase}`);
  }
  if (typeof view.note !== "string" || view.note.length === 0) {
    throw new Error("[SystemsLab] 空间视图必须明确提供状态标签");
  }
  refs.visualStatus.textContent = view.note;
  let visual;
  if (view.mode === "tree") visual = renderTree(view);
  else if (view.mode === "candidates") visual = renderCandidates(view);
  else if (selectedCase === "grid") visual = createInteractiveGrid(view.stage);
  else if (selectedCase === "hash") visual = createHashSandbox(view.stage);
  else visual = createSpaceGrid(view.stage, view.note);
  const contract = element("div", "space-contract");
  spaceContracts[selectedCase].forEach((item) => contract.append(element("span", "", item)));
  const stack = element("div", "space-stack");
  stack.append(visual, contract);
  refs.stage.replaceChildren(stack);
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
  const scenarioPrinciples = principles[scenarioName];
  if (!scenarioPrinciples || !Object.hasOwn(scenarioPrinciples, caseName)) {
    throw new Error(`[SystemsLab] 案例缺少原理摘要：${scenarioName}.${caseName}`);
  }
  const currentPrinciples = scenarioPrinciples[caseName];
  refs.principleProblem.textContent = currentPrinciples.problem;
  refs.principleMechanism.textContent = currentPrinciples.mechanism;
  refs.principleBoundary.textContent = currentPrinciples.boundary;
  renderMetrics(step.metrics);
  renderCode(currentCase(), step);
  if (step.view.type === "flags") renderFlags(step.view, step.status);
  else if (step.view.type === "random") renderRandom(step.view);
  else if (step.view.type === "space") renderSpace(step.view, caseName);
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
