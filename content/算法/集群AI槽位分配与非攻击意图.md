# 集群 AI 槽位分配与非攻击意图

分类：算法

## 先说结论

槽位分配解决“多只怪物围住同一目标时各自站哪里”，稳定分配解决“不要每帧换座位”，非攻击意图解决“没拿到攻击权的怪物仍然做什么”。三者共同避免所有怪挤向同一点或原地发呆。

### 三只怪的一圈槽位

```text
玩家位置：(0, 0)
环绕半径：3
槽位角度：0°、120°、240°
近似位置：(3, 0)、(-1.5, 2.6)、(-1.5, -2.6)
```

怪物 A、B、C 首次分到三个槽位后应尽量保持绑定。若每帧都按瞬时距离重新排序，A 和 B 的微小移动就可能交换槽位，表现为来回横穿。只有槽位失效、怪物离开或整体重新规划时才需要重分配。

## 核心问题

集群怪物不是每一只都应该同时攻击玩家。

系统需要解决两个问题：

```text
1. 没拿到攻击令牌的怪物应该站在哪里？
2. 它们没攻击时应该做什么？
```

如果没有组织，怪物会变成：

```text
所有怪都往玩家身上挤
几只怪互相抢位置
每帧目标点变化，行为抖动
没拿到攻击机会的怪像在旁边发呆
```

所以这里用了两个配套设计：

```text
槽位分配：让怪物在集群队形里有序
非攻击意图：让没攻击的怪继续制造压力
```

## 跟着代码做：先让三只怪站成一圈

先只解决最小问题：玩家站在原点，三只怪分别应该走向哪里。下面是一个可以直接放进 C# 控制台项目的教学版本：

```csharp
using System;
using System.Collections.Generic;
using System.Numerics;

static Vector2 GetSlotPosition(
    Vector2 playerPosition,
    int slotIndex,
    int slotCount,
    float radius)
{
    float angle = MathF.Tau * slotIndex / slotCount;
    Vector2 offset = new(MathF.Cos(angle), MathF.Sin(angle));
    return playerPosition + offset * radius;
}

Vector2 player = Vector2.Zero;

for (int i = 0; i < 3; i++)
{
    Vector2 target = GetSlotPosition(player, i, 3, 2f);
    Console.WriteLine($"怪物 {i} -> ({target.X:F1}, {target.Y:F1})");
}
```

这段代码的运行思路是：

```text
slotIndex / slotCount       算出该槽位占整圈的比例
比例乘 MathF.Tau            得到弧度角；Tau 就是 2π
Cos(angle), Sin(angle)      得到从玩家指向槽位的单位方向
方向乘 radius               把槽位推到距离玩家 2 米的位置
最后加 playerPosition       把局部圆环移动到玩家身边
```

预期输出近似为：

```text
怪物 0 -> ( 2.0,  0.0)
怪物 1 -> (-1.0,  1.7)
怪物 2 -> (-1.0, -1.7)
```

此时已经有了一个最小闭环：**输入玩家位置、槽位编号和半径，输出每只怪的移动目标点。**

## 第二步：发现“每帧换座位”的问题

第一版直接把列表下标当槽位编号：

```csharp
for (int i = 0; i < enemies.Count; i++)
    enemies[i].MoveTo(GetSlotPosition(player, i, enemies.Count, 2f));
```

假设第一帧列表是：

```text
[A, B, C] -> A=0，B=1，C=2
```

下一帧因为距离排序变成：

```text
[C, A, B] -> C=0，A=1，B=2
```

三只怪会同时换目标点，看起来像队形在抖动。问题不在圆周公式，而在于“槽位身份没有保存”。

## 第三步：保存稳定槽位

用怪物 ID 保存分配结果；只有怪物加入、离开或槽位失效时才重新分配：

```csharp
readonly Dictionary<int, int> slotByEnemyId = new();

int GetOrAssignSlot(int enemyId, int slotCount)
{
    if (slotByEnemyId.TryGetValue(enemyId, out int existing))
        return existing;

    for (int slot = 0; slot < slotCount; slot++)
    {
        if (!slotByEnemyId.ContainsValue(slot))
        {
            slotByEnemyId.Add(enemyId, slot);
            return slot;
        }
    }

    return -1; // 没有空槽位，交给后面的非攻击意图处理
}
```

现在即使 `enemies` 的遍历顺序发生变化，A 再次查询时仍会拿到原来的槽位。项目版本通常不会每次用 `ContainsValue` 线性扫描，而会维护空闲槽位集合；这里先保留最容易看懂的写法。

## 第四步：没有攻击权也要有行为

槽位只回答“站在哪里”，没有回答“到达后做什么”。可以先实现一个明确的决策顺序：

```csharp
enum Intent
{
    Attack,
    MoveToSlot,
    Strafe,
    Reposition
}

Intent ChooseIntent(
    bool ownsAttackToken,
    bool reachedSlot,
    bool slotStillValid)
{
    if (ownsAttackToken)
        return Intent.Attack;

    if (!slotStillValid)
        return Intent.Reposition;

    if (!reachedSlot)
        return Intent.MoveToSlot;

    return Intent.Strafe;
}
```

用四组输入手工验证：

| 攻击令牌 | 已到槽位 | 槽位有效 | 输出 |
| --- | --- | --- | --- |
| 有 | 任意 | 任意 | `Attack` |
| 无 | 否 | 是 | `MoveToSlot` |
| 无 | 是 | 是 | `Strafe` |
| 无 | 任意 | 否 | `Reposition` |

至此代码逐步回答了三个不同问题：

```text
GetSlotPosition   -> 槽位的世界坐标在哪里
GetOrAssignSlot   -> 某只怪稳定占用哪个槽位
ChooseIntent      -> 怪物现在应该做什么
```

真实项目再在这个基础上加入导航可达性、槽位释放、攻击令牌仲裁和冷却时间，而不是把所有判断塞进一个巨大的 `Update`。

## 槽位是什么

槽位不是地图上预先摆好的固定点，也不是 Unity 里的真实格子。

它更像是：

```text
怪物在围攻队形里的座位编号。
```

比如玩家周围有 5 只怪等待：

```text
A -> 槽位 0
B -> 槽位 1
C -> 槽位 2
D -> 槽位 3
E -> 槽位 4
```

系统会根据：

```text
玩家当前位置
槽位编号
围绕半径
目标角度
```

动态计算出怪物应该移动到的世界坐标。

所以更准确的理解是：

```text
不是固定地图点，而是角色周围动态生成的一圈虚拟点位。
槽位编号尽量稳定，实际世界坐标会跟着目标移动。
```

## 为什么要分配槽位

最大收益是让集群怪物有序。

具体来说有三层收益。

第一，避免互相抢位置：

```text
A 负责左前
B 负责右前
C 负责后侧
D 负责外圈
```

第二，避免行为抖动：

```text
只要怪还在等待状态，就尽量保持原来的槽位。
```

如果每帧都重新分配，怪物可能这一帧往左，下一帧往右，看起来犹豫、抽搐、乱转向。

第三，让战斗节奏更可控：

```text
少数怪负责当前进攻
其他怪在外围制造压力
整个群体像一个队伍，而不是一堆独立乱跑的单位
```

从算法思维上看，这是把问题从：

```text
连续空间里的混乱竞争
```

转成：

```text
离散槽位的分配问题
```

原问题是：

```text
每只怪都在无限多的位置里找一个点
```

转成槽位后：

```text
一共有 N 个槽位
每只怪占一个槽位
旧槽位尽量保留
冲突时再修正
```

问题就更清楚，也更好调。

## 稳定随机的作用

稳定随机本质上是一个公式：

```text
同样的输入，得到同样的随机结果。
输入变化，结果才变化。
```

它不是每帧调用普通随机，而是用怪物 ID、集群 ID、用途、版本号等信息算出一个稳定值。

它解决的是：

```text
既要有随机感，又不能每帧乱跳。
```

可以理解为：

```text
槽位提供秩序。
稳定随机提供自然感。
```

如果只有槽位，没有稳定随机，队形可能过于机械。

如果只有随机，没有槽位，怪物又容易乱跳、抢位置。

## 没拿到攻击令牌的怪物做什么

没拿到攻击令牌的怪物不是站着不动。

系统会给它们分配非攻击意图：

```text
Orbit：绕着目标游走、包围
Threaten：靠近威胁、施压但不真正出手
Reposition：重新找一个更合适的位置
```

也就是说：

```text
拿到攻击令牌 -> 执行攻击行为
没拿到攻击令牌 -> 执行非攻击压迫行为
```

这让战斗表现更像：

```text
1 只怪正在攻击
2 只怪在侧面逼近
1 只怪绕到背后
1 只怪拉开距离准备下一轮
```

玩家感受到的是“被一群怪包围”，但不会同时被所有怪乱砍。

## 槽位和非攻击意图的关系

槽位回答：

```text
你大概应该在哪个位置？
```

非攻击意图回答：

```text
你在这个位置附近应该怎么表现？
```

所以它们是配套的。

如果只有槽位：

```text
怪物站得有序，但可能像木桩。
```

如果只有非攻击意图：

```text
怪物想绕、想威胁、想重定位，但容易互相抢位置。
```

组合起来就是：

```text
主攻怪负责出手。
其他怪负责占位、包围、威胁、制造空间压力。
```

## 边界：槽位不是永远有效

运行时至少要处理这些边界：

```text
怪物死亡或离队 -> 立即释放槽位
新怪物加入     -> 只分配空槽位，不重排旧成员
目标瞬移       -> 旧世界坐标失效，重建槽位位置
槽位不可达     -> 尝试其他槽位
怪物多于槽位   -> 返回 -1，进入外围游走或等待
```

释放时要同时更新怪物映射与空闲槽位集合：

```csharp
bool ReleaseSlot(int enemyId)
{
    if (!slotByEnemyId.Remove(enemyId, out int slot))
        return false;

    freeSlots.Add(slot);
    return true;
}
```

如果使用 NavMesh，圆周公式算出的点还要投影到可行走区域并检查路径。投影失败不能悄悄使用玩家脚下的位置，否则怪物仍会挤成一团。

## 最重要的收获

这套设计的本质不是“让怪物站成圆形”，而是：

```text
降低混乱度
降低决策频率
降低位置冲突
提升行为可读性
让 AI 更像团队
```

一句话总结：

```text
槽位让集群有秩序，非攻击意图让等待不发呆，稳定随机让秩序里带一点自然变化。
```
