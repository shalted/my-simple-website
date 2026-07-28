# Steering、RVO、ORCA 与速度空间

分类：游戏 AI 与逻辑建模 / 移动与局部避障

## 从“想去哪”到“下一刻怎么动”

想象在人群中去车站：

```text
全局路线告诉你：沿这条街走，再从路口右转。
你自己想保持的速度：朝车站方向正常步行。
附近行人靠近时：临时侧身、减速或绕开。
```

这里至少有三个层次：

```text
全局路径：提供长期方向或路径走廊。
Steering：根据目标生成期望速度。
RVO / ORCA：根据邻居约束修正速度，减少未来碰撞。
```

局部避障通常不负责回答“最终目的地在哪里”，而是回答：

```text
在接下来一小段时间里，哪个速度既安全，又尽量接近期望速度？
```

速度是向量：

```text
velocity = direction * speed
```

所以选择新速度，同时选择了移动方向和移动快慢。

## Steering：先产生期望运动

Steering 是一类局部运动意图生成方法，而不是单一固定算法。

最基础的 Seek 可以写成：

```text
desiredVelocity =
    Normalize(targetPosition - position) * maxSpeed
```

如果直接把当前速度瞬间替换为期望速度，运动可能突变。常见做法是限制加速度：

```text
steering =
    ClampMagnitude(desiredVelocity - currentVelocity,
                   maxAcceleration)
```

然后积分：

```text
newVelocity = currentVelocity + steering * deltaTime
newPosition = position + newVelocity * deltaTime
```

这里可验证的通用关系是：

```text
期望速度描述想怎样移动。
加速度约束描述速度能多快变化。
位置由速度随时间推进。
```

而以下都是具体实现选择：

```text
最大速度
最大加速度
到达半径
减速曲线
转向响应
固定时间步还是可变时间步
```

这些值必须来自运动设计、物理约束或可验证配置，不能从算法名称推导。

## Arrive：接近目标时减速

只有 Seek 时，角色可能冲过目标再折返。Arrive 的直觉是：

```text
远处正常前进。
进入减速区域后逐渐降低期望速度。
到达可接受范围后停止。
```

一种抽象表达：

```text
distance = Length(targetPosition - position)
targetSpeed = SpeedCurve(distance)
desiredVelocity =
    Normalize(targetPosition - position) * targetSpeed
```

`SpeedCurve` 的形状、停止范围和是否允许过冲不是通用固定值，而是运动模型选择。

## 从位置空间切换到速度空间

普通碰撞检测常问：

```text
两个物体现在是否重叠？
```

速度障碍问的是：

```text
如果双方保持某个速度，未来时间窗内是否会碰撞？
```

假设两个圆形代理 A、B：

```text
位置：pA, pB
半径：rA, rB
速度：vA, vB
```

把 B 看成相对静止，可以使用相对量：

```text
relativePosition = pB - pA
relativeVelocity = vA - vB
combinedRadius = rA + rB
```

问题变成：

```text
从相对位置出发，按相对速度前进，
是否会在时间窗内进入 combinedRadius 的圆？
```

这一步把“双物体移动碰撞”转化为“相对速度是否落入危险集合”。

## VO：速度障碍

VO 是 Velocity Obstacle。

在二维速度平面中，每一个点都代表一个候选速度：

```text
横轴：速度 x 分量
纵轴：速度 y 分量
```

对于邻居 B，可以构造一个危险区域：

```text
候选速度落在 VO 内：
  按当前预测模型会在时间窗内碰撞。

候选速度落在 VO 外：
  在该时间窗和模型下不会与 B 碰撞。
```

无限时间范围的圆形 VO 直观上像从相对位置张开的锥形区域。有限时间窗会对区域进行截断，使“很久以后才可能发生的碰撞”不必立即主导当前速度。

时间窗越长：

```text
更早为远期冲突做准备
但约束通常更保守
```

时间窗越短：

```text
更关注眼前
但可能较晚才开始避让
```

时间窗的具体数值是行为与性能选择，不是 VO 理论给出的万能常数。

## 为什么只用 VO 可能来回摆动

如果 A 把 B 的当前速度当成固定不变：

```text
A 发现继续直走会撞，于是向左避。
B 同时也重新计算，并向自己的左侧避。
下一次双方又根据新速度修正。
```

双方可能反复猜测对方的下一步，出现：

```text
左右摆动
过度避让
速度不稳定
```

这不是每次都会发生，但说明局部避障不仅要判断危险速度，还要定义多代理之间如何分担修正责任。

## RVO：双方共同承担避让

RVO 是 Reciprocal Velocity Obstacle。

核心直觉：

```text
不要假设只有自己会避让。
预测双方都会对潜在碰撞做出一部分修正。
```

两人迎面而来：

```text
A --->       <--- B
```

期望不是让 A 完全承担横向偏移，而是：

```text
A 修正一部分
B 修正一部分
```

“互惠”能减少单方过度反应，但经典 RVO 仍可能面临振荡、对称僵局和复杂邻居组合问题。

双方平均分担只是常见对称模型。非对称责任、不同优先权或不合作代理都需要额外建模，不能假设 RVO 自动理解这些规则。

## ORCA：把避障写成半平面约束

ORCA 是 Optimal Reciprocal Collision Avoidance。

它的关键思路可以概括为：

```text
对每个邻居，计算避免碰撞所需的最小速度修正。
双方按责任模型分担修正。
由此生成一个允许速度的半平面约束。
在所有约束交集中，寻找最接近期望速度的速度。
```

对一个邻居，速度平面被一条线分成两侧：

```text
允许侧：满足该邻居的避碰要求。
禁止侧：仍可能造成时间窗内碰撞。
```

多个邻居产生多个半平面：

```text
约束 1  ∩  约束 2  ∩  约束 3  ...
```

再叠加最大速度圆：

```text
Length(candidateVelocity) <= maxSpeed
```

求解目标：

```text
在可行域内，找到距离 preferredVelocity 最近的速度。
```

这是一种约束优化视角。

## ORCA 一帧中的逐步流程

### 第一步：生成期望速度

全局路径或 Steering 提供：

```text
preferredVelocity
```

它表达“没有局部冲突时最想采用的速度”。

### 第二步：查询邻居

空间查询得到一定范围内的动态邻居：

```text
neighborA
neighborB
neighborC
```

邻居搜索半径、最大邻居数和空间索引结构都是性能与行为选择。

### 第三步：构造每个邻居的速度约束

对每个邻居：

```text
计算相对位置
计算相对速度
计算合并半径
建立有限时间窗内的速度障碍
找到把当前相对速度推出危险区域的最小修正 u
按责任模型分配修正
生成 ORCA 线与允许半平面
```

### 第四步：求可行速度

在所有半平面的交集和最大速度约束内求解：

```text
arg min
    Length(candidateVelocity - preferredVelocity)
```

如果期望速度本身满足所有约束，就直接保留它。

### 第五步：交给运动执行层

ORCA 输出的是建议速度。实际角色可能还受：

```text
加速度上限
转向速度
动画根运动
地形约束
物理接触
```

因此“ORCA 速度可行”不等于角色能在一个时间步内瞬间达到该速度。运动模型与避障模型差异越大，预测误差越明显。

## 速度空间中的一个直观例子

当前期望速度指向正右方：

```text
preferredVelocity = (right, fast)
```

前方邻居产生一条约束线，正右方落在禁止侧：

```text
                允许区域
                    /
                   /  constraint
       preferred X/
                 /
                / 禁止区域
```

求解器把期望速度投影或调整到最近的可行位置：

```text
newVelocity = 约束边界附近的安全速度
```

可能表现为：

```text
稍微向侧面偏移
降低速度
或两者同时发生
```

具体选择由所有约束与“最接近期望速度”的目标共同决定。

## 最小 C# 数据流示例

下面展示职责边界，不实现完整 ORCA 几何求解：

```csharp
public readonly struct AgentSnapshot
{
    public readonly Vector2 Position;
    public readonly Vector2 Velocity;
    public readonly float Radius;

    public AgentSnapshot(
        Vector2 position,
        Vector2 velocity,
        float radius)
    {
        Position = position;
        Velocity = velocity;
        Radius = radius;
    }
}

public readonly struct VelocityConstraint
{
    public readonly Vector2 Point;
    public readonly Vector2 Normal;

    public VelocityConstraint(Vector2 point, Vector2 normal)
    {
        Point = point;
        Normal = normal;
    }

    public bool Allows(Vector2 velocity)
    {
        // 候选速度必须位于约束法线指向的允许半平面。
        return Vector2.Dot(velocity - Point, Normal) >= 0f;
    }
}

public static Vector2 ChooseLocalVelocity(
    AgentSnapshot self,
    IReadOnlyList<AgentSnapshot> neighbors,
    Vector2 preferredVelocity,
    float maxSpeed,
    float timeHorizon)
{
    var constraints = new List<VelocityConstraint>();

    foreach (AgentSnapshot neighbor in neighbors)
    {
        // 真实实现应在这里根据相对位置、相对速度、
        // 合并半径和时间窗构造一条 ORCA 约束。
        constraints.Add(
            BuildOrcaConstraint(self, neighbor, timeHorizon));
    }

    // 求解器应在最大速度圆和全部半平面的交集中，
    // 寻找最接近期望速度的可行速度。
    return SolveClosestFeasibleVelocity(
        preferredVelocity,
        maxSpeed,
        constraints);
}
```

这段示例没有猜测：

```text
邻居距离
时间窗大小
代理半径
最大速度
责任分配比例
```

它们必须由调用方提供可验证配置。`BuildOrcaConstraint` 和 `SolveClosestFeasibleVelocity` 也不能用随意采样冒充完整 ORCA 实现。

## 正常路径

### 没有邻居约束

```text
preferredVelocity 在最大速度范围内
直接输出 preferredVelocity
```

### 一个迎面邻居

```text
直行速度进入危险区域
生成一个半平面约束
选择边界附近最接近期望速度的速度
双方共同侧向修正
```

### 多个邻居但仍有可行域

```text
所有半平面仍有交集
求解器在交集内找到合法速度
速度可能比单邻居时偏转或减速更多
```

## 边界路径

### 初始已经重叠

标准“预测未来碰撞”不足以解释已经发生的穿透。

算法通常需要：

```text
更短时尺度的分离约束
或独立的重叠修复与物理接触处理
```

具体恢复策略不是 ORCA 名称自动规定的，尤其不能悄悄把代理瞬移到猜测位置。

### 完全对称的迎面或窄口场景

如果双方：

```text
形状相同
速度相同
目标对称
规则相同
```

局部选择可能长期对称，出现：

```text
左右摇摆
同时停下
在窄口互不相让
```

可通过高层通行规则、稳定侧偏偏好、优先权或通道调度打破对称。但这些都是额外行为规则，需要明确设计依据。

### 静态障碍与动态代理同时存在

墙壁不会与代理“共同承担一半避让”。静态障碍约束需要独立处理，责任模型不能直接照搬双方对称分担。

### 加速度受限

求解出的速度在几何上安全，但执行层无法立即达到：

```text
实际轨迹可能仍然进入碰撞区域。
```

需要让求解器考虑可达速度集合，或让时间窗、运动控制和代理模型保持一致。采用何种方法取决于实际运动系统。

## 失败路径

### 约束交集为空

拥挤、狭窄或参数不一致时，可能不存在同时满足所有约束的速度。

此时必须暴露：

```text
哪些约束冲突
是否连静止速度也不可行
最大违反量
当前邻居和障碍快照
```

“随便返回零速度”“忽略最后一条约束”或“继续使用期望速度”都是降级策略，不是 ORCA 的无条件正确答案。采用任何一种都需要明确的产品行为和错误可见性。

### 邻居快照不同步

如果 A 使用本帧的 B 状态，而 B 使用上一帧的 A 状态：

```text
双方对彼此运动的预测不一致
```

结果可能抖动或偏离互惠假设。更新顺序、快照时点和双缓冲策略属于运行时设计。

### 半径与真实占用不一致

代理半径小于真实碰撞体：

```text
速度空间认为安全，视觉或物理上仍会相撞。
```

代理半径过大：

```text
可行域被过度压缩，通道可能被误判为无法通过。
```

半径必须来自明确的移动占用模型。

### 只做局部避障，没有全局路线

局部速度选择只看附近冲突时，可能：

```text
绕到死路
在 U 形障碍内徘徊
为了眼前通行偏离长期目标
```

这是局部方法的适用边界，不是继续增加邻居数量就一定能解决的问题。

## 性能代价

每个代理的主要开销通常来自：

```text
邻居查询
为邻居构造约束
求解约束下的最近速度
更新运动状态
```

如果每个代理都检查所有其他代理，邻居阶段会快速增长。常见空间加速结构包括：

```text
均匀网格
空间哈希
k-d tree
BVH 或其他邻域索引
```

选择哪种结构取决于：

```text
代理数量
分布密度
移动频率
查询半径
更新成本
```

不能只凭某种结构“常见”就认定它适合所有场景。

## 与全局寻路和移动控制的接口

一个清晰的数据流可以是：

```text
目标
  ↓
全局路径或导航走廊
  ↓
Steering 生成 preferredVelocity
  ↓
RVO / ORCA 修正为 collisionAvoidanceVelocity
  ↓
运动控制器施加加速度、转向和地面约束
  ↓
得到真实 velocity 与 position
```

下一帧避障必须读取真实执行结果，而不是假设角色已经完美采用了上一帧建议速度。

## 调试速度空间应该看什么

只在位置空间画角色圆圈通常不够。建议同时观察：

```text
当前速度
期望速度
最终选择速度
邻居范围
每个邻居的相对位置与相对速度
每条 ORCA 约束线及允许侧
最大速度圆
最终可行域
时间窗和状态快照时点
```

一次选择的诊断记录可以表示为：

```text
preferredVelocity：可视化为箭头
constraintCount：约束数量
selectedVelocity：最终箭头
feasible：是否存在完整可行解
activeConstraints：真正限制最终结果的约束
```

这样才能区分：

```text
全局路径给错方向
Steering 期望速度不合理
邻居查询漏掉对象
ORCA 约束构造错误
求解器错误
运动控制器没有跟上建议速度
```

## 通用算法与实现选择

### 可验证的通用机制

```text
Steering 生成局部期望速度或加速度。
VO 用相对运动描述会在未来时间窗内碰撞的危险速度。
RVO 引入双方共同避让的互惠假设。
ORCA 将邻居避碰要求转化为速度空间半平面约束。
ORCA 在可行速度中寻找接近期望速度的结果。
局部避障不能替代全局路径规划。
```

### 必须由具体实现确定

```text
代理半径与形状
最大速度与加速度
时间窗
邻居距离与最大邻居数
责任分配和优先权
静态障碍处理
约束无解时的明确策略
快照与更新顺序
求解精度与计算预算
运动控制器怎样跟随建议速度
```

## 最后总结

从 Steering 到 ORCA，可以看成逐层加约束：

```text
Steering：
  我想用什么速度接近目标？

VO：
  哪些速度会导致未来碰撞？

RVO：
  如果双方都会避让，危险速度应该怎样理解？

ORCA：
  把每个邻居的避碰要求变成半平面，
  再从公共可行域中选择最接近期望的速度。
```

可靠实现的关键不是只得到一根“看起来会绕开”的箭头，而是让以下模型彼此一致：

```text
全局路线
代理占用范围
速度与加速度能力
邻居状态快照
预测时间窗
约束求解
真实运动执行
```
