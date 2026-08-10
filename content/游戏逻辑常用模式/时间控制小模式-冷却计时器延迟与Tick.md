# 时间控制小模式：冷却、计时器、延迟与 Tick

分类：游戏逻辑常用模式

## 核心问题

冷却、计时器、延迟和 Tick 都围绕同一个问题：

```text
某件事什么时候发生？
多久发生一次？
是否已经到时间了？
```

它们不是大型架构，但在游戏逻辑里非常高频。

## 冷却 Cooldown

冷却控制的是：

```text
做完一件事之后，多久不能再做。
```

典型写法：

```csharp
private float nextReadyTime = 0f;
private float cooldown = 3f;

bool CanUse()
{
    return Time.time >= nextReadyTime;
}

void UseSkill()
{
    if (!CanUse())
    {
        return;
    }

    DoSkill();

    nextReadyTime = Time.time + cooldown;
}
```

核心：

```text
nextReadyTime = 下次允许触发的时间
```

适合：

```text
技能 CD
攻击间隔
按钮防连点
提示节流
重试间隔
```

## 计时器 Timer

计时器控制的是：

```text
从现在开始，还剩多久触发。
```

例如炸弹 5 秒后爆炸：

```csharp
private float timer = 5f;
private bool exploded = false;

void Update()
{
    if (exploded)
    {
        return;
    }

    timer -= Time.deltaTime;

    if (timer <= 0f)
    {
        exploded = true;
        Explode();
    }
}
```

这里：

```text
timer：剩余时间
Time.deltaTime：上一帧到这一帧经过的时间
```

如果不加 `exploded` 这类标记，计时结束后可能每帧重复触发。

## 延迟触发 Delay

延迟触发表示：

```text
几秒后做一件事。
```

写法一：倒计时。

```csharp
private float delay = 2f;

void Update()
{
    delay -= Time.deltaTime;

    if (delay <= 0f)
    {
        DoSomething();
    }
}
```

写法二：目标时间。

```csharp
private float triggerTime;

void StartDelay()
{
    triggerTime = Time.time + 2f;
}

void Update()
{
    if (Time.time >= triggerTime)
    {
        DoSomething();
    }
}
```

区别：

```text
倒计时：适合对象自己维护剩余时间。
目标时间：适合判断当前是否过了某个时间点。
```

## Tick

`Tick` 可以理解成：

```text
按固定间隔执行一次逻辑。
```

例如 Buff 每 1 秒扣一次血：

```csharp
private float tickInterval = 1f;
private float nextTickTime = 0f;

void Update()
{
    if (Time.time < nextTickTime)
    {
        return;
    }

    nextTickTime = Time.time + tickInterval;

    ApplyPoisonDamage();
}
```

适合：

```text
中毒每秒扣血
回血每秒恢复
AI 每 0.2 秒思考一次
雷达每 0.5 秒扫描一次
资源每 1 秒增长一次
```

## 为什么 AI 不一定每帧 Tick

很多 AI 逻辑不需要每帧跑：

```text
查找目标
计算路径
筛选候选技能
扫描附近敌人
```

可以改成：

```csharp
private float nextThinkTime = 0f;
private float thinkInterval = 0.2f;

void Update()
{
    if (Time.time < nextThinkTime)
    {
        return;
    }

    nextThinkTime = Time.time + thinkInterval;

    Think();
}
```

这样一秒只思考 5 次，玩家可能感受不到差异，但性能更稳。

## 是否补 Tick

普通写法：

```csharp
nextTickTime = Time.time + tickInterval;
```

特点是：

```text
如果某一帧卡住了，只补一次 Tick。
```

有些场景这是对的，例如 AI 思考：

```text
卡顿后不需要补 3 次思考。
```

但有些场景可能要补，例如中毒伤害：

```text
卡了 3 秒，理论上应该扣 3 次。
```

可以用循环补 Tick：

```csharp
while (Time.time >= nextTickTime)
{
    ApplyPoisonDamage();
    nextTickTime += tickInterval;
}
```

为了避免一次补太多造成更大卡顿，可以加最大补偿次数：

```csharp
int maxCatchUpTicks = 5;
int tickCount = 0;

while (Time.time >= nextTickTime && tickCount < maxCatchUpTicks)
{
    ApplyPoisonDamage();
    nextTickTime += tickInterval;
    tickCount++;
}
```

## Time.time 和 Time.deltaTime

`Time.time`：

```text
游戏开始到现在经过了多少秒。
```

适合记录时间点：

```csharp
nextReadyTime = Time.time + cooldown;
```

`Time.deltaTime`：

```text
上一帧到这一帧经过了多少秒。
```

适合倒计时：

```csharp
timer -= Time.deltaTime;
```

简单区分：

```text
要问“现在到没到某个时间点”：用 Time.time。
要每帧减少剩余时间：用 Time.deltaTime。
```

## unscaledTime 和 unscaledDeltaTime

`Time.time` 和 `Time.deltaTime` 受 `Time.timeScale` 影响。

如果游戏暂停：

```csharp
Time.timeScale = 0f;
```

很多基于 `Time.time` / `deltaTime` 的计时也会暂停。

如果希望暂停时仍然计时，比如：

```text
UI 动画
真实时间倒计时
网络重连
登录超时
```

可以用：

```csharp
Time.unscaledTime
Time.unscaledDeltaTime
```

例子：

```csharp
uiTimer -= Time.unscaledDeltaTime;
```

## 怎么选择

冷却：

```text
我做完一件事后，多久不能再做？
```

用：

```csharp
nextReadyTime = Time.time + cooldown;
```

倒计时：

```text
还剩多久触发？
```

用：

```csharp
timer -= Time.deltaTime;
```

延迟：

```text
几秒后做一件事？
```

用 timer 或 triggerTime。

Tick：

```text
每隔多久做一次？
```

用：

```csharp
if (Time.time >= nextTickTime)
{
    nextTickTime = Time.time + interval;
    Tick();
}
```

## 用实际帧时间观察漏 Tick 与补 Tick

假设逻辑每 `0.1s` 执行一次，`nextTickTime = 1.0`。正常帧在 `1.02s` 到来：

```text
Time.time = 1.02 >= 1.00
执行 Tick #1
nextTickTime = 1.02 + 0.10 = 1.12
```

如果某帧卡顿，时间直接从 `1.02` 跳到 `1.37`，只执行一次的版本会丢掉中间节拍：

```csharp
if (Time.time >= nextTickTime)
{
    nextTickTime = Time.time + interval;
    Tick();
}
```

运行结果：只执行一次，并把下一次安排到 `1.47`。这种行为适合 AI 感知刷新，因为卡顿结束后没有必要瞬间扫描三遍。

需要补 Tick 的模拟可以写成：

```csharp
int safety = 0;

while (Time.time >= nextTickTime && safety < 8)
{
    Tick();
    nextTickTime += interval;
    safety++;
}
```

在 `Time.time = 1.37` 时，它会依次补执行 `1.1、1.2、1.3` 三个节拍。这里使用 `nextTickTime += interval`，不能改成 `Time.time + interval`，否则第一轮就会跳到未来，补 Tick 立即停止。

### 边界：不能无上限追赶

如果游戏暂停十秒后恢复，`while` 可能一次执行上百次。`safety < 8` 是本帧上限示例；达到上限后应记录欠账、丢弃过旧节拍或分摊到后续帧，具体策略取决于系统语义。

```text
AI 感知：通常不补，执行一次最新扫描
持续伤害：可能补次数，但要限制单帧峰值
物理模拟：通常交给固定时间步系统处理
倒计时 UI：直接根据目标时间计算，不逐次补动画
```

补 Tick：

```text
这段时间漏掉的次数要不要补？
```

需要补就用 `while`，不需要补就只触发一次。

## 最重要的收获

```text
冷却看下次可用时间。
计时器看剩余时间。
延迟看目标触发时间。
Tick 看下一次执行时间。
```

最常用的两种写法：

```csharp
// 时间点写法
if (Time.time >= nextTime)
{
    nextTime = Time.time + interval;
    DoSomething();
}
```

```csharp
// 倒计时写法
timer -= Time.deltaTime;
if (timer <= 0f)
{
    DoSomething();
}
```
