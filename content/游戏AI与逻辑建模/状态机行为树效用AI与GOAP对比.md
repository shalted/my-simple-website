# 状态机、行为树、效用 AI 与 GOAP 对比

分类：游戏 AI 与逻辑建模

## 核心问题

复杂 AI 或流程逻辑不是只能靠一堆 `if else`。

常见建模工具包括：

```text
普通状态机
分层状态机
并行状态机
行为树
效用 AI
GOAP
```

它们不是谁完全替代谁，而是解决不同复杂度、不同类型的问题。

最重要的判断是：

```text
这是流程问题，还是决策问题，还是规划问题？
```

## 普通状态机 FSM

核心模型：

```text
当前状态 + 条件 = 下一个状态
```

例子：

```text
Idle -> 发现玩家 -> Chase
Chase -> 进入攻击距离 -> Attack
Attack -> 攻击结束 -> Cooldown
Cooldown -> 冷却结束 -> Chase
任意状态 -> 死亡 -> Dead
```

C# 常见写法：

```csharp
public enum MonsterState
{
    Idle,
    Chase,
    Attack,
    Cooldown,
    Dead
}

private MonsterState state;

void Update()
{
    switch (state)
    {
        case MonsterState.Idle:
            UpdateIdle();
            break;
        case MonsterState.Chase:
            UpdateChase();
            break;
        case MonsterState.Attack:
            UpdateAttack();
            break;
    }
}
```

适合：

```text
状态少
流程明确
状态互斥
切换规则简单
```

优点：

```text
简单直观
容易 Debug
当前状态一眼能看懂
```

缺点：

```text
状态多了会膨胀
多个维度同时存在时不好处理
```

## 分层状态机 Hierarchical FSM

分层状态机把状态分层：

```text
Alive
  Idle
  Chase
  Attack
  Stunned

Dead
```

父状态管公共规则，子状态管具体行为。

例如所有 `Alive` 状态都要检查死亡：

```text
Alive.Update:
    if hp <= 0 -> Dead
```

子状态就不用每个都重复写死亡检查。

适合：

```text
状态明显有层级
很多状态共享公共逻辑
普通 FSM 已经开始变乱
```

优点：

```text
减少重复判断
状态结构更清楚
适合中大型流程
```

缺点：

```text
实现比普通状态机复杂
父子状态进入/退出顺序要设计清楚
```

常见进入顺序：

```text
Enter 父状态 -> Enter 子状态
```

常见退出顺序：

```text
Exit 子状态 -> Exit 父状态
```

## 并行状态机 Parallel FSM

并行状态机解决多个状态维度同时存在的问题。

一个角色可能同时有：

```text
移动状态：Idle / Walk / Run / Jump
战斗状态：Ready / Casting / Cooldown
控制状态：Normal / Stunned / Frozen
表情状态：Normal / Hurt / Angry
```

如果硬写成一个巨大枚举，会出现组合爆炸：

```text
RunCastingNormal
RunCastingStunned
WalkCastingNormal
JumpCooldownFrozen
```

更好的方式是拆成多个状态机：

```csharp
MovementState movementState;
CombatState combatState;
ControlState controlState;
```

适合：

```text
多个状态维度可以同时存在
组合数量很多
不想写巨大 enum
```

优点：

```text
避免组合爆炸
模块职责更清晰
更接近真实游戏角色结构
```

缺点：

```text
多个状态机之间可能冲突
需要优先级或协调规则
```

例如：

```text
ControlState = Stunned
```

此时移动状态机和战斗状态机都应该受到限制。

## 行为树 Behavior Tree

行为树不是当前状态切来切去，而是每次从树根开始做决策。

它更像：

```text
按优先级检查行为，谁能执行就执行谁。
```

例子：

```text
Selector
  IsDead? -> Dead
  IsStunned? -> Stunned
  CanAttack? -> Attack
  CanSeePlayer? -> Chase
  Patrol
```

常见节点：

```text
Selector：选择一个成功的子节点
Sequence：一组步骤都成功才成功
Condition：条件判断
Action：执行行为
Decorator：修饰节点，比如冷却、取反、循环
```

适合：

```text
AI 决策复杂
行为优先级明显
行为可以组合复用
策划需要可视化编辑
```

优点：

```text
扩展 AI 行为比较自然
行为节点可复用
优先级清楚
很适合怪物 AI
```

缺点：

```text
每帧从树根 tick，节点多了要注意性能
复杂树也会变难维护
长流程行为需要额外状态保存
```

一句话：

```text
状态机更像流程图。
行为树更像决策树。
```

## 效用 AI Utility AI

效用 AI 不按固定优先级选行为，而是给每个行为打分。

例子：

```text
攻击分 = 技能可用 + 距离合适 + 目标血量低
逃跑分 = 自己血量低 + 敌人太近
追击分 = 看见目标 + 距离较远
巡逻分 = 没有目标
```

然后：

```text
谁分最高，执行谁。
```

适合：

```text
行为不是绝对优先级
需要多个因素权衡
希望 AI 更柔性自然
```

优点：

```text
行为更自然
容易调权重
适合多因素决策
```

缺点：

```text
调参成本高
分数设计不好会出现奇怪行为
Debug 时要能看到各项分数
```

关键不是代码难，而是：

```text
怎么设计评分公式。
```

## GOAP 目标导向行动规划

GOAP 的思路是：

```text
AI 有目标。
AI 自己规划一串行动达成目标。
```

每个行动有：

```text
前置条件
执行效果
成本
```

例子：

```text
行动：开火
前置条件：有武器、有弹药、目标在范围内
效果：玩家受伤
成本：2
```

如果目标是消灭玩家，AI 可能规划：

```text
没有武器 -> 找武器 -> 靠近玩家 -> 开火
```

适合：

```text
沙盒 AI
复杂 NPC
行动组合非常多
希望 AI 看起来会“想办法”
```

优点：

```text
AI 很灵活
不用手写所有行为顺序
能根据环境变化重新规划
```

缺点：

```text
实现复杂
性能更贵
Debug 更难
对普通怪物可能太重
```

## 选择建议

```text
普通状态机：
适合简单互斥流程。

分层状态机：
适合有父子层级的流程。

并行状态机：
适合多个状态维度同时存在。

行为树：
适合优先级式 AI 决策。

效用 AI：
适合多因素评分决策。

GOAP：
适合目标导向的自动规划。
```

实际系统中经常组合使用：

```text
角色动作流程：状态机 / 分层状态机
角色移动、战斗、控制：并行状态机
怪物行为选择：行为树
技能选择或目标选择：效用评分
复杂 NPC 规划：GOAP
Buff、异常状态：标签 / 独立状态模块
```

## 最重要的收获

```text
流程问题：状态机。
决策问题：行为树 / 效用 AI。
规划问题：GOAP。
```
