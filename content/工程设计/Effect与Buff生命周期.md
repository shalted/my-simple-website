# Effect 与 Buff 生命周期：从一次申请到彻底清理

## 先说结论

Definition 是静态配置，Spec 是本次申请参数，Runtime Effect 才是目标身上持续变化的实例。Apply Gate 先判断能否应用，之后才修改属性、建立周期任务和叠层状态；到期或移除时必须按相反责任顺序清理。

### 一个三层中毒 Buff

```text
持续时间：5 秒
周期：每 1 秒造成 10 伤害
最大层数：3
t=0：第 1 层，下一次 Tick=1
t=1：伤害 10；再次施加，层数变 2并按规则刷新持续时间
t=2：若每层独立增伤，本次伤害 20
```

“刷新持续时间”“增加层数”和“立刻触发一次周期”是三条独立规则，不能因为再次 Apply 就默认全部发生。配置必须明确溢出层数和到期策略。

> Effect 是一份“如何改变状态”的定义，Buff 是持续存在、会被后续更新和移除的 Effect。把两者放进同一条生命周期管线，才能解释叠层、周期、属性重算与清理为什么不会互相打架。

## 1. 先分清 Definition、Spec 与 Runtime Effect

一份效果定义通常只描述规则：

- 修改哪个属性；
- 使用加、减、乘、除还是覆盖；
- 是瞬时效果，还是有持续时间；
- 是否周期触发子效果；
- 相同效果再次到来时如何叠层；
- 到期、溢出或主动移除时怎样收尾。

每次申请效果时，系统从定义创建一份独立的运行对象。本文把这份运行对象称为 `RuntimeEffect`。它保存来源、目标、等级、激活状态、当前层数、计时起点和周期起点。这样，同一份定义可以同时作用在多个目标上，而运行状态不会互相污染。

```text
EffectDefinition
    ↓ create
RuntimeEffect
    ├── Source / Target
    ├── Modifier[]
    ├── DurationState
    ├── PeriodState
    └── StackState
```

组件结构应在进入 Apply 管线前确定。运行中可以改变明确允许变化的数据，但不要临时改变对象的结构，否则负责查询不同组件组合的系统可能看到不完整状态。

## 2. 完整运行地图

```text
创建 RuntimeEffect
    ↓
绑定 Source / Target
    ↓
Apply Gate：必需标签、免疫标签等
    ├── 拒绝 → 标记销毁 → 释放
    └── 通过
         ├── Instant
         │    └── 修改 BaseValue → 标脏 → 销毁
         └── Duration
              ├── 合并叠层或加入 ActiveEffects
              ├── 检查是否允许激活
              ├── active = true
              ├── Modifier 参与 CurrentValue 重算
              ├── 周期触发子效果
              └── 到期 / 主动移除 / 目标失效
                   ↓
                 Deactivate
                   ↓
                 注销属性追踪、标脏
                   ↓
                 从 ActiveEffects 移除
                   ↓
                 释放运行资源并销毁
```

这张图里有两个容易混淆的值：

- `BaseValue` 是属性的持久基础值。瞬时效果直接改变它。
- `CurrentValue` 是从 BaseValue 出发，叠加所有激活的持续 Modifier 后得到的当前结果。

因此，持续 Buff 的移除不需要反向计算“当初加了多少”。系统只要把它从活动集合移除，再从 BaseValue 重算 CurrentValue，就能规避加减顺序、钳制和多 Buff 组合带来的误差。

## 3. Apply Gate：失败要停在产生副作用之前

Apply Gate 在 Modifier、标签授予、表现和周期计时之前执行。典型检查包括：

1. 目标是否仍然存在；
2. 目标是否具备必需标签；
3. 目标是否命中免疫规则。

失败的运行对象不进入活动集合，也不改变属性，直接进入销毁阶段。这样，“免疫”不会留下半个 Buff、一次多余周期或一条没有释放的监听。

## 4. Instant 与 Duration 的分叉

### 4.1 Instant：修改 BaseValue

瞬时效果适合一次性结算，例如直接恢复或扣减。它按下面的顺序执行：

```csharp
var next = modifier.Calculate(context, attribute.BaseValue);
next = Clamp(next, attribute.Min, attribute.Max);
attribute.BaseValue = NotifyBeforeChange(next);
NotifyAfterChange(oldValue, attribute.BaseValue);
MarkDirty(attribute);
```

结算完成后，运行对象不再需要保留。

### 4.2 Duration：保留规则，重算 CurrentValue

持续效果进入目标的 `ActiveEffects`。激活时，它的 Modifier 不直接覆盖 BaseValue，而是在属性重算时被消费：

```csharp
current = attribute.BaseValue;

foreach (var effect in activeEffects)
{
    if (!effect.Active) continue;

    foreach (var modifier in effect.ModifiersFor(attribute))
        current = modifier.Apply(current, effect.StackCount);
}

attribute.CurrentValue = Clamp(current);
```

激活、停用、层数改变和移除都会把相关属性标脏，统一交给重算阶段处理。

## 5. 属性捕获：Snapshot 与 Track

属性型 Magnitude 可以读取来源或目标的另一个属性，再经过线性变换得到本次幅度：

```text
Magnitude = CapturedAttribute × K + B
```

两种捕获策略的差异在“什么时候读”：

- `Snapshot`：**第一次计算时**读取并缓存，以后复用该值。
- `Track`：每次计算都实时读取；持续效果激活时还要订阅依赖属性的变化，变化后把目标属性标脏。

Snapshot 不是“创建 Spec 时立即拍照”。如果直到后续属性重算才第一次计算，那么缓存的就是那次计算时的值。

Track 在停用阶段必须注销监听。否则效果看似已经移除，依赖属性变化时仍会触发回调，造成错误重算和引用泄漏。

## 6. 叠层不是复制多个对象

再次申请相同效果时，系统先按叠层键寻找已有运行对象：

- 按来源聚合：同一目标上，不同来源各有独立层数；
- 按目标聚合：同一目标只保留一个共享层数，不区分来源。

找到已有对象后，新对象只提供这次申请的上下文，随后被销毁；层数、持续时间和周期起点更新在已有对象上。

加法与减法 Modifier 可以按层数重复应用。乘法、除法和覆盖通常只执行一次，因为连续乘法或覆盖的含义与“线性叠层”不同，应由明确规则决定，而不是盲目重复。

## 7. 刷新、周期与溢出

一次成功叠层可以分别控制两个时钟：

- Duration 刷新：保留原到期点，或把持续时间起点移到当前时刻；
- Period 重置：保留下一次 Tick，或从当前时刻重新计算周期。

达到层数上限后，需要区分：

- 允许溢出申请：层数不再增加，但可按策略刷新 Duration 或 Period；
- 拒绝溢出申请：不增加，也不刷新；
- 拒绝并清空：冲突触发后移除整个栈；
- 溢出效果：额外执行一份明确配置的瞬时结果。

这几个开关会改变结果，交互演示应同时显示层数、Duration 起点、Period 起点以及新运行对象是否被合并销毁。

## 8. 到期策略

叠层效果到期时常见三种选择：

1. 清除整个栈；
2. 减少一层并刷新持续时间，直到层数归零；
3. 只刷新持续时间，相当于由外部条件结束的长期效果。

非叠层持续效果到期后直接进入标准移除流程。主动移除与目标失效也应复用同一流程，而不是各写一套清理代码。

## 9. 清理顺序

安全的清理顺序是：

1. Deactivate：令效果不再参与 CurrentValue；
2. 注销 Track 监听、停止持续表现、撤销临时授予；
3. 标记相关属性为 Dirty；
4. 从 `ActiveEffects` 移除；
5. 释放周期数组、溢出效果引用等运行资源；
6. 销毁 RuntimeEffect。

目标已经失效时，周期系统必须停止派生新效果，并把当前效果送入同一条标准移除管线。

## 10. 边界与代价

- 每次属性重算都遍历活动效果，复杂度近似 `O(A × M)`，其中 A 是活动效果数，M 是相关 Modifier 数。可通过按属性建立索引或脏标记降低无关扫描。
- 叠层查找若线性扫描活动集合，复杂度为 `O(A)`；效果很多时可维护叠层键索引。
- Track 用实时性换取订阅与重算成本；Snapshot 更稳定，也更便宜，但不会响应来源属性的后续变化。
- 周期较短、目标很多时，派生效果数量会迅速增长，需要明确时间单位和批处理策略。
- 自定义应用条件、动态标签导致的反复激活、停用时暂停剩余时长，都需要独立且完整的状态链。若系统没有这条链，不应仅凭字段名宣称已支持。

最终应让每个运行对象都能回答：为什么被创建、为什么通过或失败、当前是否激活、改变了哪个值、何时 Tick、如何叠层、为什么结束、是否已经彻底释放。

## 最后记住

```text
Definition 是配置，Spec 是本次申请，Runtime Effect 是运行实例。
先通过 Apply Gate，再产生属性、周期和叠层副作用。
刷新、叠层、周期和到期是独立规则。
移除时必须清理属性修改、计时任务、标签和来源记录。
```
