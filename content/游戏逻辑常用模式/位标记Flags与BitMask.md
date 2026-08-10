# 位标记 Flags 与 BitMask

分类：游戏逻辑常用模式 / CSharp 基础数据结构

## 核心思想

位标记的核心是：

```text
用一个整数里的不同二进制位，表示多个可以同时存在的开关。
```

例如：

```text
CanMove
CanAttack
Invincible
Stunned
Silenced
Selectable
```

这些状态有些可以同时存在。角色可以同时是：

```text
Stunned + Invincible
Silenced + CanMove
Selectable + CanAttack
```

如果用很多 `bool`，字段会越来越散：

```csharp
bool isPrecision;
bool isCritical;
bool isBlock;
bool isMiss;
bool isHeal;
```

用 Flags 可以集中成一个字段：

```csharp
AttributeAttackEffect effects;
```

## 跟着二进制位一步步运行

先用四个状态观察每一位怎样变化：

```csharp
using System;

[Flags]
enum UnitState
{
    None       = 0,      // 0000
    CanMove    = 1 << 0, // 0001
    CanAttack  = 1 << 1, // 0010
    Stunned    = 1 << 2, // 0100
    Invincible = 1 << 3  // 1000
}
```

从空状态开始添加两个标记：

```csharp
UnitState state = UnitState.None; // 0000
state |= UnitState.CanMove;       // 0001
state |= UnitState.Invincible;    // 1001

Console.WriteLine(state); // CanMove, Invincible
```

`|` 把对应位置设为 1，同时保留其他位：

```text
0001  CanMove
1000  Invincible
----
1001  两个状态同时存在
```

### 第二步：判断一个或多个标记

```csharp
bool canMove = (state & UnitState.CanMove) != 0;

UnitState required = UnitState.CanMove | UnitState.Invincible;
bool hasAll = (state & required) == required;
bool hasAny = (state & required) != 0;
```

代入 `state = 1001`：

```text
1001 & 0001 = 0001，不为 0        -> 包含 CanMove
1001 & 1001 = 1001，等于 required -> 同时包含两个要求
```

判断“全部包含”要比较 `== required`；判断“至少包含一个”才使用 `!= 0`。

### 第三步：只移除 Stunned

```csharp
state |= UnitState.Stunned;  // 1101
state &= ~UnitState.Stunned; // 1001
```

`~Stunned` 会得到除了 `Stunned` 位以外全是 1 的掩码；再用 `&`，只把目标位清零，`CanMove` 与 `Invincible` 保持不变。

### 第四步：把位判断用于技能入口

```csharp
static bool CanCast(UnitState state)
{
    bool blocked = (state & UnitState.Stunned) != 0;
    bool canAttack = (state & UnitState.CanAttack) != 0;
    return !blocked && canAttack;
}
```

用具体输入验证：

| state | 二进制 | `CanCast` |
| --- | --- | --- |
| `CanAttack` | `0010` | `true` |
| `CanAttack + Stunned` | `0110` | `false` |
| `CanMove` | `0001` | `false` |

这时 Flags 不再只是位运算语法，而是一条完整业务链：声明独立位、组合状态、查询要求、清除状态，再把查询结果用于技能规则。

## 基础声明

以攻击结果为例，可以这样声明标记：

```csharp
[Flags]
public enum AttributeAttackEffect
{
    None = 0,
    Normal = 1 << 0,
    Precision = 1 << 1,
    Block = 1 << 2,
    Critical = 1 << 3,
    Miss = 1 << 4,
    Heal = 1 << 5,
}
```

`1 << n` 表示把数字 `1` 往左移动 `n` 位。

可以这样理解：

```text
Normal    = 000001
Precision = 000010
Block     = 000100
Critical  = 001000
Miss      = 010000
Heal      = 100000
```

每一个标记都占一个独立位置，所以它们可以组合到同一个变量里。

## 添加标记

添加标记用按位或：

```csharp
effects |= AttributeAttackEffect.Precision;
effects |= AttributeAttackEffect.Critical;
```

`|=` 的含义是：

```text
打开这个标记位，同时保留原本已经打开的其他标记。
```

例如：

```text
Precision = 000010
Critical  = 001000

组合后    = 001010
```

这就表示一次攻击同时带有：

```text
精准 + 暴击
```

## 判断标记

判断有没有某个标记，用按位与：

```csharp
if ((effects & AttributeAttackEffect.Critical) == AttributeAttackEffect.Critical)
{
    // 有暴击标记
}
```

`&` 的含义是：

```text
只保留两边都为 1 的位。
```

例如：

```text
effects  = Precision + Critical = 001010
Critical =                      001000

001010
&001000
=001000
```

结果等于 `Critical`，说明 `effects` 里面包含暴击。

也可以把判断封装进结果对象：

```csharp
public bool HasEffect(AttributeAttackEffect effect)
{
    return (Effects & effect) == effect;
}
```

## 移除标记

移除标记常用：

```csharp
flags &= ~SomeFlag;
```

其中：

```text
~SomeFlag：把 SomeFlag 这一位取反。
&=：保留其他位，关掉目标位。
```

射线检测层也常用同样的位清除写法：

```csharp
int fallbackMask = Physics.DefaultRaycastLayers & ~GetPreferredGroundLayerMask();
```

意思是：

```text
从默认射线检测层里，排除掉已经优先检测过的地面层。
```

## 互斥状态为什么也能放在 Flags 里

注意：Flags 只是存储和传递多个标签的方式，不负责保证业务规则。

例如攻击结果里：

```text
Miss 和 Critical 通常互斥。
Miss 和 Block 通常互斥。
Precision 和 Critical 可以叠加。
```

这些互斥关系不是由 Flags 自动保证的，而是由战斗计算流程保证。

例如一旦判定成 `Miss`，计算器可以直接返回：

```csharp
return new AttributeAttackResult(
    AttributeAttackEffect.Miss,
    Array.Empty<AttributeDamageEntry>(),
    ...);
```

这样就不会继续添加 `Critical`、`Block` 等标记。

所以这里是一个混合模型：

```text
Flags 负责统一携带标签。
计算流程负责保证哪些组合合法。
```

更严格的设计也可以拆成：

```csharp
AttackOutcome outcome;       // Hit / Miss / Block
AttackModifiers modifiers;   // Critical / Precision / Heal
```

但如果更需要把结果轻量传给表现层，一个 Flags 字段也很方便。

## 最大好处

最大的好处不是省内存，而是：

```text
把一次结果里可能带的多个信息压成一个字段，传递和判断都很方便。
```

不用到处传：

```csharp
bool isPrecision;
bool isCritical;
bool isBlock;
bool isMiss;
bool isHeal;
```

只传：

```csharp
AttributeAttackEffect effects;
```

表现层需要什么就判断什么：

```csharp
if ((effects & AttributeAttackEffect.Critical) == AttributeAttackEffect.Critical)
{
    mapped |= CombatPresentationEffect.Critical;
}
```

新增一个表现标签时，通常只需要扩展 enum 和映射逻辑，不需要修改一堆构造参数。

## 最多支持多少位

Flags 能支持多少个标记，取决于底层类型。

C# 的 `enum` 默认底层类型是 `int`，也就是 32 位。

常见建议：

```text
int：常用 0 到 30 位，约 31 个常规标记。
uint：可以更舒服地用满 32 位。
long：常用 63 个常规标记。
ulong：可以用满 64 位。
```

如果需要更多标记，可以指定底层类型：

```csharp
[Flags]
public enum UnitState : ulong
{
    None = 0,
    CanMove = 1UL << 0,
    CanAttack = 1UL << 1,
    Stunned = 1UL << 2,
    Silenced = 1UL << 3,
    Invincible = 1UL << 4,
}
```

这里要写 `1UL << n`，因为底层类型是 `ulong`。

如果还写 `1 << n`，左边仍然是 `int`，超过 31 位后容易出问题。

## 适合什么

适合：

```text
多个开关互相独立
一个对象可以同时拥有多个状态
需要频繁判断、组合、排除状态
状态数量不太多
需要轻量传递或保存结果标签
```

例如：

```text
战斗表现标签
角色能力开关
Unity LayerMask
UI 控件状态
编辑器选项
权限开关
```

## 不适合什么

不适合：

```text
严格互斥且永远只会有一个值的状态
需要携带复杂数据的状态
需要记录来源、持续时间、层数的 Buff
需要策划动态扩展很多类型的状态
```

例如：

```text
Idle / Move / Attack / Dead
```

这种互斥主状态更适合普通 enum 或状态机。

而：

```text
眩晕 Buff 的来源、剩余时间、叠加层数
```

就不该只靠一个 `Stunned` 标记解决。

## 常用模板

```csharp
// 添加
flags |= SomeFlag;

// 判断
bool hasFlag = (flags & SomeFlag) == SomeFlag;

// 移除
flags &= ~SomeFlag;

// 多个组合
var combined = FlagA | FlagB;
```

## 最重要的收获

```text
Flags 是把多个 bool 式开关压进一个字段里，用位运算快速组合、判断、排除。
```

它适合表达“多标签结果”，但不自动保证业务合法性。

真正的规则仍然要靠业务流程维护：

```text
哪些标记可以叠加。
哪些标记必须互斥。
哪些标记出现后应该提前返回。
```
