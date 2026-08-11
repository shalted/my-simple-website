# 局部避障：RVO 与 ORCA 理解笔记

分类：游戏 AI 与逻辑建模 / 算法

## 先说结论

RVO 和 ORCA 不负责从地图起点规划到终点，它们只在短时间范围内调整当前速度，避免附近移动体即将发生的碰撞。输入是位置、半径、当前速度和期望速度，输出仍是一个速度。

### 两个人迎面相遇

```text
A：位置 (-2, 0)，期望速度 (1, 0)
B：位置 ( 2, 0)，期望速度 (-1, 0)
双方半径：0.5
```

若保持速度，约 2 秒后中心重合。局部避障会在速度空间中排除危险速度，并选择接近期望速度的可行解，例如 A 稍向上、B 稍向下。若走廊宽度不足以并排通过，仅靠局部速度调整可能来回犹豫，需要更高层的让路规则。

状态：理解笔记，后续还需要继续深入。

## 先记住它解决什么问题

NavMesh 和 A Star 解决的是：

```text
从哪里走到哪里。
```

Funnel 算法解决的是：

```text
在 NavMesh 多边形通道里，拉出一条更自然的路径。
```

RVO / ORCA 解决的是：

```text
角色沿路径移动时，附近也有别的角色，怎么实时避让。
```

它不是全局寻路算法，也不是交通规则系统。

它更像局部移动层：

```text
我下一小段时间应该用哪个速度移动，才更不容易撞到附近单位。
```

## 改速度不只是改快慢

容易误解的一点是：

```text
改变速度是不是只改变跑得快慢？
```

不是。

这里的速度是速度向量：

```text
velocity = direction * speed
```

它同时包含：

```text
方向
大小
```

## 跟着代码做：先判断两个人会不会撞

先不实现完整 RVO / ORCA，只做一个可以运行的二维预测器。A 在左边向右走，B 在右边向左走：

```csharp
using System;
using System.Numerics;

static bool WillCollide(
    Vector2 positionA,
    Vector2 velocityA,
    Vector2 positionB,
    Vector2 velocityB,
    float combinedRadius,
    float timeHorizon)
{
    Vector2 relativePosition = positionB - positionA;
    Vector2 relativeVelocity = velocityB - velocityA;

    float speedSquared = relativeVelocity.LengthSquared();
    if (speedSquared < 0.0001f)
        return relativePosition.Length() < combinedRadius;

    float closestTime = -Vector2.Dot(
        relativePosition,
        relativeVelocity) / speedSquared;

    closestTime = Math.Clamp(closestTime, 0f, timeHorizon);
    Vector2 separation =
        relativePosition + relativeVelocity * closestTime;

    return separation.Length() < combinedRadius;
}

Vector2 positionA = new(-2f, 0f);
Vector2 velocityA = new(1f, 0f);
Vector2 positionB = new( 2f, 0f);
Vector2 velocityB = new(-1f, 0f);

Console.WriteLine(WillCollide(
    positionA, velocityA,
    positionB, velocityB,
    combinedRadius: 1f,
    timeHorizon: 3f));
```

预期输出是 `True`。把数值代进去：

```text
relativePosition = (2, 0) - (-2, 0) = (4, 0)
relativeVelocity = (-1, 0) - (1, 0) = (-2, 0)
closestTime = -Dot((4,0),(-2,0)) / 4 = 2 秒
2 秒后的相对距离 = (4,0) + (-2,0) * 2 = (0,0)
```

两人的中心会在预测窗口内重合，所以当前速度不安全。这里第一次体现了“速度空间”的思路：我们没有等角色真正撞上，而是在测试**某个候选速度会导致什么未来结果**。

## 第二步：从候选速度里挑一个安全的

先用离散候选做教学版本：直走、左绕、右绕和停下。

```csharp
Vector2 preferredVelocity = new(1f, 0f);

Vector2[] candidates =
{
    new(1.0f,  0.0f),
    new(0.7f,  0.7f),
    new(0.7f, -0.7f),
    Vector2.Zero
};

Vector2 best = Vector2.Zero;
float bestCost = float.PositiveInfinity;

foreach (Vector2 candidate in candidates)
{
    bool unsafeVelocity = WillCollide(
        positionA, candidate,
        positionB, velocityB,
        combinedRadius: 1f,
        timeHorizon: 3f);

    if (unsafeVelocity)
        continue;

    float cost = Vector2.DistanceSquared(
        candidate, preferredVelocity);

    if (cost < bestCost)
    {
        best = candidate;
        bestCost = cost;
    }
}

Console.WriteLine($"选择速度: ({best.X:F1}, {best.Y:F1})");
```

运行过程是：

```text
(1.0, 0.0)  -> 会撞，排除
(0.7, 0.7)  -> 安全，与期望速度的差异较小，暂存
(0.7,-0.7)  -> 也安全，但不比当前结果更好
(0.0, 0.0)  -> 安全，但离期望速度更远
最终选择 (0.7, 0.7)
```

这段代码展示了局部避障的共同骨架：

```text
期望速度 preferredVelocity
-> 排除会碰撞的速度
-> 在安全速度中选择最接近期望的一个
-> 用选中速度推进角色
```

它还不是 RVO 或 ORCA，只是离散采样教学版。真正的 RVO / ORCA 不需要只试四个候选点，而是在连续速度空间里构造禁区或半平面约束。

## 第三步：从“我全躲”变成“双方分担”

上面的 A 假设 B 完全不改变速度，于是 A 承担全部避让。如果双方都运行同一规则，可以各自修正一部分：

```text
A 原速度 ( 1.0, 0.0) -> 建议修正到 ( 0.85, 0.35)
B 原速度 (-1.0, 0.0) -> 建议修正到 (-0.85,-0.35)
```

RVO 的“Reciprocal”强调双方共同响应。ORCA 进一步把对邻居的避碰要求表示成速度空间中的线性约束，并在所有约束允许的区域里选择最接近期望速度的解。

因此阅读后面的速度障碍图时，可以一直对应这三样东西：

```text
preferredVelocity -> 如果没有邻居，角色最想采用的速度
forbidden region  -> 会在时间窗口内发生碰撞的速度集合
chosen velocity   -> 约束外、且尽量接近期望的最终速度
```

项目实现还要加入多个邻居、墙体约束、最大速度、数值容差和无可行解处理。示例的任务只是先让“为什么改速度就能提前避让”可以用具体数字跑出来。

所以 RVO / ORCA 改速度，其实也在改移动方向。

例如原本想往右走：

```text
desiredVelocity = (1, 0) * 3
```

避障后可能变成：

```text
newVelocity = (0.8, 0.3) * 2.6
```

这表示：

```text
稍微向右上方绕开。
同时速度略微降低。
```

表现层再根据 `newVelocity` 转向。

## 它为什么能提前避让

如果只判断当前有没有碰撞，发现时通常已经晚了。

RVO / ORCA 关心的是：

```text
如果我继续用某个速度移动，未来几秒内会不会和附近单位重叠。
```

会导致碰撞的速度会被视为危险速度。

局部避障要做的是：

```text
避开危险速度。
从安全速度里选一个最接近原本期望速度的。
```

所以它不是直接把角色推开，而是在选择：

```text
下一帧、下一小段时间应该往哪个方向、以多快速度走。
```

## RVO 和 ORCA 的直观区别

RVO 的意思是 Reciprocal Velocity Obstacles。

它的核心直觉是：

```text
双方共同承担避让。
```

例如两个角色迎面走：

```text
A --->     <--- B
```

不是 A 完全让，也不是 B 完全让，而是：

```text
A 稍微偏一点。
B 也稍微偏一点。
```

ORCA 可以先粗略理解成 RVO 的工程化版本。

它把避障要求变成速度空间里的约束：

```text
哪些速度不能选。
哪些速度可以选。
在可选速度里，哪个最接近期望速度。
```

## 开阔地里的图解

开阔地时，RVO / ORCA 比较适合：

```text
A --->           <--- B
```

继续直走会撞。

避障后：

```text
A --\             /-- B
     \           /
      \         /
```

这里空间足够，双方都稍微调整速度方向，就能绕开。

## 左侧有墙时的问题

如果左侧是墙：

```text
墙
|
|   A --->        <--- B
|
```

如果只考虑角色之间的互相避让，可能会产生错误直觉：

```text
A 往左偏一点。
B 也往左偏一点。
```

但左侧是墙，左偏可能撞墙或贴墙卡住。

所以局部避障不能只考虑 agent-agent，还要考虑：

```text
墙体
NavMesh 边界
静态障碍物
角色半径
```

墙壁应该限制可选速度：

```text
左侧速度不可选。
```

剩下的选择可能只有：

```text
向右绕
减速
停止
后退
```

## 窄路时 RVO / ORCA 不够

如果两侧都是墙：

```text
墙 |  A --->     <--- B  | 墙
```

这时可能没有足够空间让两个人同时绕开。

问题就不再是：

```text
怎么各自挪半个身位。
```

而是：

```text
谁先过？
谁等待？
谁后退？
要不要重新寻路？
```

这属于更上层的通行管理。

常见做法：

```text
通道预约
优先级
等待点
单向通行规则
超时重新寻路
物理碰撞兜底
```

可以把窄路当成一个资源：

```text
[入口] ==== 狭窄通道 ==== [出口]
```

它有状态：

```text
Free：没人使用。
Reserved：有人预约。
InUse：有人正在通过。
Cooldown：刚用完，短时间内不让别人抢。
```

如果 A 已经获得通行权：

```text
A 继续通过。
B 在入口等待。
```

## 现在的分层理解

可以先按这几层记：

```text
NavMesh：哪里能走。
A Star：从起点到终点经过哪些区域。
Funnel：把多边形通道拉成自然路径。
RVO / ORCA：开阔区域里，实时选择安全速度向量。
墙体 / NavMesh 边界：限制哪些速度不能选。
通道预约 / 优先级：窄路里决定谁先过。
物理碰撞：最后防止真的穿模重叠。
```

## 最重要的收获

RVO / ORCA 的作用不是：

```text
保证任何情况下都绝不相撞。
```

而是：

```text
在局部范围内，预测未来碰撞，并选择一个更安全的速度向量。
```

这个速度向量同时决定：

```text
移动方向
移动快慢
转向趋势
```

但在墙边、窄门、走廊、桥梁、双向队伍对冲时，只靠 RVO / ORCA 不够。

这类场景要加：

```text
静态障碍约束
通行权
等待队列
重新寻路
```

一句话：

```text
RVO / ORCA 解决“空间够时怎么绕”。
通道规则解决“空间不够时谁先走”。
```
