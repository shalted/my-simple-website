# ECS：实体、组件、系统与数据布局

分类：工程设计

## 先说结论

ECS 是一种组织大量游戏对象的方式。先记住一句话：

**Entity 是编号，Component 是数据，System 是批量处理数据的规则。**

例如，移动系统不需要认识“玩家类”或“子弹类”。它只需要找到所有同时拥有 `Position` 和 `Velocity` 的实体，然后统一计算：

```text
Position += Velocity * deltaTime
```

数据布局解决的是另一个问题：怎样把这些位置和速度连续地放在内存中，让系统能够高效处理成千上万个实体。

## 先看一个最小场景

场景里只有三个实体：

| Entity | 游戏含义 | 拥有的 Component |
|---|---|---|
| 1001 | 玩家 | Position、Velocity、Health |
| 1002 | 子弹 | Position、Velocity |
| 1003 | 建筑 | Position、Health |

它们的数据可以理解成：

```text
Entity 1001
    Position = (2, 3)
    Velocity = (1, 0)
    Health   = 100

Entity 1002
    Position = (5, 8)
    Velocity = (0, 10)

Entity 1003
    Position = (9, 4)
    Health   = 500
```

移动系统声明：

```text
需要读取 Velocity
需要读写 Position
```

因此它会处理玩家和子弹，不会处理没有 `Velocity` 的建筑。

假设 `deltaTime = 0.1`，运行一次之后：

```text
玩家：(2, 3) + (1, 0)  * 0.1 = (2.1, 3)
子弹：(5, 8) + (0, 10) * 0.1 = (5, 9)
建筑：缺少 Velocity，不参与移动
```

这就是 ECS 最核心的一次运行。下面再给这些角色正式命名。

### 把连续三帧算完

保持速度不变，每帧仍使用 `deltaTime = 0.1`：

| 时刻 | 玩家 Position | 子弹 Position | 建筑 Position |
|---:|---|---|---|
| 初始 | `(2.0, 3.0)` | `(5.0, 8.0)` | `(9.0, 4.0)` |
| 0.1 秒 | `(2.1, 3.0)` | `(5.0, 9.0)` | `(9.0, 4.0)` |
| 0.2 秒 | `(2.2, 3.0)` | `(5.0, 10.0)` | `(9.0, 4.0)` |
| 0.3 秒 | `(2.3, 3.0)` | `(5.0, 11.0)` | `(9.0, 4.0)` |

这个表能看出两件事：

- System 每一帧执行的是同一条批量规则，不需要分别调用 `Player.Move()` 和 `Bullet.Move()`；
- 建筑一直存在于世界中，只是因为缺少 `Velocity`，没有进入这次查询。

如果玩家获得了 `Frozen`，而移动查询明确排除 `Frozen`，那么下一帧玩家也会像建筑一样保持原位。这不是移动公式改变了，而是查询结果改变了。

## Entity：它只回答“是谁”

Entity 通常是一个轻量编号，例如 `1001`。它本身不必包含位置、生命值或 `Move()` 方法。

一个实体是什么，由它当前拥有哪些 Component 决定：

```text
Position + Velocity          -> 可以被移动系统处理
Position + Health            -> 有位置并且可以受伤
Position + Velocity + Health -> 可以移动，也可以受伤
```

因此 ECS 通常不需要建立很深的继承树。给实体增加或移除 Component，就能改变哪些 System 会处理它。

## Component：它只回答“有什么数据”

Component 保存某一方面的数据：

```csharp
public struct Position
{
    public float X;
    public float Y;
}

public struct Velocity
{
    public float X;
    public float Y;
}

public struct Health
{
    public int Value;
}
```

这里先把 Component 理解为纯数据即可。不同 ECS 框架可能允许组件带有简单方法，但关键不在“能不能写方法”，而在于数据所有权清楚，批量逻辑由 System 组织。

## System：它只回答“怎样处理”

System 声明自己需要哪些 Component，然后批量处理所有匹配数据：

```csharp
foreach (var entity in Query.With<Position, Velocity>())
{
    ref Position position = ref Get<Position>(entity);
    ref readonly Velocity velocity = ref Get<Velocity>(entity);

    position.X += velocity.X * deltaTime;
    position.Y += velocity.Y * deltaTime;
}
```

这段代码是概念示例，实际查询 API 取决于所用框架。重要的是查询条件：

```text
必须有 Position
必须有 Velocity
```

如果还要让被冻结的实体停止移动，查询可以增加：

```text
排除 Frozen
```

## 系统怎样找到一万个可移动实体

一个低效但直观的办法是：每帧扫描所有 Entity，再逐个检查它是否有 `Position` 和 `Velocity`。

常见 ECS 不这样工作。它会在实体创建或组件组合改变时，提前维护好数据分组和索引。移动系统的查询可以直接取得所有符合条件的分组。

在 Archetype 存储中，组件集合完全相同的实体会被分到同一组。假设当前世界一共有 11,000 个实体：

| Archetype | 组件组合 | 实体数量 | 移动查询是否匹配 |
|---|---|---:|---|
| A | Position + Velocity | 6,500 颗子弹 | 是 |
| B | Position + Velocity + Health | 2,500 个可移动敌人 | 是 |
| C | Position + Health | 1,000 座建筑 | 否，缺少 Velocity |
| D | Position + Velocity + Renderable | 1,000 个飞行特效 | 是 |

移动查询 `Position + Velocity` 匹配 A、B、D，一共得到：

```text
6,500 + 2,500 + 1,000 = 10,000 个可移动实体
```

框架通常会缓存“这个查询匹配哪些 Archetype”。因此下一帧不需要重新询问 11,000 个 Entity 有哪些组件，只需继续遍历 A、B、D 中的内存块。

注意，查询条件是“至少包含 Position 和 Velocity”，不是“组件集合只能等于 Position + Velocity”。所以多了 `Health` 或 `Renderable` 的 B、D 仍然匹配。

## Position 和 Velocity 怎样保证不会配错

同一个 Archetype 内，组件通常按列连续存储，但各列使用相同的行下标：

```text
下标：      0       1       2       3
Entity：  [8372]  [ 12 ]  [5009]  [103 ]
Position：[ P0 ]  [ P1 ]  [ P2 ]  [ P3 ]
Velocity：[ V0 ]  [ V1 ]  [ V2 ]  [ V3 ]
```

同一列下标代表同一个实体：

```text
下标 0：Entity 8372、Position P0、Velocity V0
下标 1：Entity 12、  Position P1、Velocity V1
```

所以系统可以直接循环数组：

```csharp
for (int i = 0; i < count; i++)
{
    positions[i].X += velocities[i].X * deltaTime;
    positions[i].Y += velocities[i].Y * deltaTime;
}
```

Entity ID 不需要从小到大排序。ECS 只需要保证各组件列中相同下标的数据属于同一个 Entity。

## Chunk：把大组切成适合处理的内存块

一个 Archetype 可能有几万个实体，不一定放在一个无限增长的大数组中。常见实现会把它切成多个固定容量的 Chunk：

```text
Archetype A：Position + Velocity
    Chunk 1：128 个实体
    Chunk 2：128 个实体
    Chunk 3： 74 个实体
```

移动系统的实际过程可以理解成：

```text
1. 取得查询已经匹配的 Archetype
2. 逐个遍历其中的 Chunk
3. 从当前 Chunk 取得 Position 和 Velocity 数组
4. 用相同下标顺序更新
```

示意代码：

```csharp
foreach (Chunk chunk in movementQuery.GetChunks())
{
    Span<Position> positions = chunk.GetArray<Position>();
    ReadOnlySpan<Velocity> velocities = chunk.GetArray<Velocity>();

    for (int i = 0; i < chunk.Count; i++)
    {
        positions[i].X += velocities[i].X * deltaTime;
        positions[i].Y += velocities[i].Y * deltaTime;
    }
}
```

连续读取数组通常比在许多分散对象之间跳转更有利于 CPU 缓存，也便于批处理、向量化和任务并行。

### 一个 Chunk 能放多少实体

下面只做教学估算，不代表某个具体框架的固定布局。

假设：

```text
Position：2 个 float = 8 字节
Velocity：2 个 float = 8 字节
Entity 标识：假设为 8 字节
每个实体的主要行数据：约 24 字节
Chunk 容量：16 KiB = 16,384 字节
```

完全忽略 Chunk 头部、数组对齐和其他元数据时，理论上限是：

```text
16,384 / 24 ≈ 682 个实体
```

实际可用数量一定更少。假设最后能放约 600 个，那么前面的一万个移动实体大约分布在：

```text
10,000 / 600 ≈ 16.7，也就是约 17 个 Chunk
```

于是移动系统处理的不是“一万个互相分散的对象引用”，而更像是依次处理约 17 个连续数据块。组件大小增加后，每个 Chunk 能容纳的实体会减少；只有标签、没有字段的零尺寸 Component 则可能不占每行数据空间，具体取决于实现。

## 删除中间实体时为什么仍不会错位

假设当前数据是：

```text
Entity：   [1001] [1002] [1003] [1004]
Position： [ P1 ] [ P2 ] [ P3 ] [ P4 ]
Velocity： [ V1 ] [ V2 ] [ V3 ] [ V4 ]
```

删除 `Entity 1002` 后，为了保持数组连续，框架可以把最后一行整体填到空位：

```text
Entity：   [1001] [1004] [1003]
Position： [ P1 ] [ P4 ] [ P3 ]
Velocity： [ V1 ] [ V4 ] [ V3 ]
```

移动的是 Entity 及其各个 Component 的整行关系，因此 `P4` 和 `V4` 仍属于 `1004`。框架同时更新位置索引，记录 `1004` 现在位于下标 1。

这意味着 ECS 的遍历顺序通常不稳定。业务逻辑如果要求固定顺序，应显式排序或使用稳定的业务序号，不能依赖当前 Chunk 顺序。

## 添加组件时发生什么

假设一颗子弹原本属于：

```text
Position + Velocity
```

现在给它添加 `Health`。它的组件集合改变，所属 Archetype 也随之改变：

```text
旧组：Position + Velocity
新组：Position + Velocity + Health
```

常见迁移过程是：

```text
1. 验证 Entity 仍然有效
2. 找到或创建目标 Archetype
3. 在目标 Chunk 分配一行
4. 复制 Position 和 Velocity
5. 初始化 Health
6. 更新 Entity 的位置索引
7. 从旧 Chunk 移除原来的一行
```

创建、销毁实体以及添加、移除 Component 会改变存储结构，因此统称为**结构变化（Structural Change）**。它通常比修改 `Position.X` 这样的普通数据更贵。

### 用数据量感受迁移成本

假设一次给 1,000 颗子弹添加 `Health`：

```text
每颗子弹原有 Position 8 字节
每颗子弹原有 Velocity 8 字节
新增 Health 假设为 4 字节
```

只计算组件有效载荷，迁移至少涉及：

```text
复制旧数据：(8 + 8) * 1,000 = 16,000 字节
写入新数据：4 * 1,000       =  4,000 字节
```

实际还要更新 Entity 位置索引、维护源和目标 Chunk、处理对齐与空位，因此真实成本会更高。相比之下，如果这些实体本来就有 `Health`，只是把生命值从 100 改成 80，就不需要跨 Archetype 搬迁。

这也是一种常见设计取舍：频繁切换但不需要保存数据的状态，可以研究框架提供的可启用组件、位标记或普通字段；不要看到任何布尔状态都立刻设计成频繁 Add/Remove 的 Component。

## 为什么结构变化经常延迟到安全点

如果 System 正在遍历一个 Chunk，同时立即删除或迁移当前 Entity，数组下标和地址可能改变，造成跳过、重复处理或并发冲突。

常见做法是先记录命令：

```text
遍历期间：记录 Create / Destroy / Add / Remove
安全同步点：统一验证并提交这些结构变化
下一轮查询：看到提交后的新结构
```

具体框架也可能提供稳定迭代器或其他策略，因此延迟提交是常见实现，不是所有 ECS 的强制定义。

## 常见误解

### 误解一：Entity 就是一个瘦一点的游戏对象

许多实现中的 Entity 只是句柄。组件数据实际存放在专门的存储中，Entity 用来定位它们。

### 误解二：所有拥有 Position 的实体都存放在一起

在 Archetype 实现中，是“组件集合完全相同”的实体放在一组。`Position + Velocity` 与 `Position + Health` 属于不同 Archetype，但查询可以同时匹配多个组。

### 误解三：遍历顺序等于 Entity ID 顺序

删除时的 swap-back、跨 Chunk 搬迁和并行执行都可能改变遍历顺序。需要确定性时必须单独设计。

### 误解四：用了 ECS 就一定更快

性能取决于真实访问模式、组件大小、结构变化频率、查询组合、Chunk 容量和调度方式。少量对象或组件频繁增删的场景不一定受益。

## 进阶：另一种常见存储 Sparse-set

并非所有 ECS 都使用 Archetype。Sparse-set 通常为每种 Component 维护独立池：

```text
sparse：Entity index -> dense 下标
denseEntities：连续的 Entity 数组
denseComponents：与 denseEntities 对齐的组件数组
```

它能快速判断某个 Entity 是否拥有某种 Component，也方便独立添加或移除单个组件。但多组件查询通常需要选择一个较小的组件池进行遍历，再检查实体是否也存在于其他组件池。

例如当前有：

```text
Position 池：11,000 个实体
Velocity 池：10,000 个实体
Frozen 池：300 个实体
```

查询 `Position + Velocity - Frozen` 可以选择较小的 `Velocity` 池驱动遍历：对 10,000 个候选分别检查它是否也在 `Position` 池，并排除出现在 `Frozen` 池中的实体。最终数量不一定是简单的 `10,000 - 300`，因为那 300 个 Frozen 实体未必全都有 Velocity。

各组件池中的数组顺序可以不同。Sparse 索引负责回答“Entity 8372 的 Position 在 Position dense 数组的哪个下标”，所以它不依赖 Position 和 Velocity 恰好排成相同顺序。

| 关注点 | Archetype 常见倾向 | Sparse-set 常见倾向 |
|---|---|---|
| 多组件批量遍历 | 同签名数据集中 | 从一个池出发检查其他池 |
| 添加或移除组件 | 可能跨组搬迁 | 更新独立组件池 |
| 数据局部性 | 同一 Archetype 内集中 | 每种组件各自连续 |
| 实现重点 | Chunk、迁移、查询缓存 | sparse 与 dense 映射 |

两者都有混合和变体，不能只凭名称判断性能。

## 进阶：Entity 的 generation

如果销毁 `Entity 7` 后又把编号 7 分配给新实体，旧引用可能误指向新对象。常见解决办法是让 Entity 同时包含：

```text
Entity = index + generation
```

槽位每次复用时增加 generation。访问前同时验证两部分，旧句柄就会失效。

具体例子：

```text
旧实体：Entity(index: 7, generation: 3)
销毁后：槽位 7 的 generation 增加为 4
新实体：Entity(index: 7, generation: 4)
```

旧句柄仍然保存 `(7, 3)`。虽然 index 相同，但 generation 不同，验证时会被拒绝，因此不会误操作新实体。

这是身份安全问题，与 Position 和 Velocity 的数组对齐是两个不同层次，不需要在第一次理解 ECS 时混在一起。

## 进阶：并发访问边界

System 明确声明读取和写入哪些 Component 后，调度器可以判断冲突：

```text
两个 System 都只读 Position       -> 通常可以并行
一个读取 Position，一个写 Position -> 存在读写冲突
两个 System 都写 Position          -> 存在写写冲突
```

ECS 让数据访问关系更明确，但不会自动消除竞争。调度规则、结构变化提交点和组件引用的有效期仍必须由框架保证。

## 最后用四句话复述

```text
Entity：谁，只提供身份。
Component：有什么，只保存某方面的数据。
System：怎样处理，查询需要的 Component 后批量执行。
数据布局：怎样摆放，使匹配数据能够连续、高效地被处理。
```

再往下一层：

```text
Query 负责描述需要哪些 Component。
Archetype 负责按组件集合对实体分组。
Chunk 负责把同组数据切成连续内存块。
相同数组下标保证一个 Entity 的多种 Component 不会配错。
结构变化会迁移实体，因此通常集中到安全点提交。
```
