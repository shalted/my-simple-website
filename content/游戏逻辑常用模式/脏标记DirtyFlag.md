# 脏标记 Dirty Flag

分类：游戏逻辑常用模式

## 核心思想

脏标记的核心是：

```text
数据变了，不立刻做昂贵刷新。
先标记 dirty。
等真正需要结果时，再统一刷新。
```

它也叫：

```text
延迟计算
懒更新
缓存失效标记
```

## 不用脏标记的问题

例如角色攻击力：

```text
攻击力 = 基础攻击力 + 装备加成 + Buff 加成 + 天赋加成
```

如果每次任何数据变化都立刻重算：

```csharp
void OnEquipChanged()
{
    RecalculateAttack();
}

void OnBuffChanged()
{
    RecalculateAttack();
}

void OnTalentChanged()
{
    RecalculateAttack();
}
```

短时间内可能重复重算很多次。

例如换一套装备：

```text
卸下武器
卸下头盔
卸下衣服
装备新武器
装备新头盔
装备新衣服
```

如果每一步都重算攻击力，就会重算 6 次。

但 UI 或战斗可能只关心最后结果：

```text
换装结束后的最终攻击力。
```

## 基础写法

```csharp
private bool attackDirty = true;
private int cachedAttack;

public int Attack
{
    get
    {
        if (attackDirty)
        {
            cachedAttack = CalculateAttack();
            attackDirty = false;
        }

        return cachedAttack;
    }
}
```

当数据变化时：

```csharp
void OnEquipChanged()
{
    attackDirty = true;
}

void OnBuffChanged()
{
    attackDirty = true;
}
```

含义：

```text
攻击力相关数据变了。
旧的 cachedAttack 不可信了。
但现在先不重算。
```

真正有人读取：

```csharp
int attack = player.Attack;
```

才会重算。

## dirty 的含义

```text
dirty = 脏了，不可信，需要刷新。
```

```text
attackDirty = true
```

表示：

```text
缓存的攻击力已经过期。
```

```text
attackDirty = false
```

表示：

```text
缓存的攻击力是新的，可以直接用。
```

## UI 刷新例子

金币数量变化。

不用脏标记：

```csharp
void AddGold(int amount)
{
    gold += amount;
    goldText.text = gold.ToString();
}
```

如果一帧里金币变化很多次：

```text
+10
+20
+5
-3
```

UI 会刷新 4 次。

用脏标记：

```csharp
private bool goldDirty = true;
private int gold;

void AddGold(int amount)
{
    gold += amount;
    goldDirty = true;
}

void LateUpdate()
{
    if (!goldDirty)
    {
        return;
    }

    goldDirty = false;
    goldText.text = gold.ToString();
}
```

这样一帧内变化多次，也只在 `LateUpdate` 统一刷新一次。

## 为什么常放 LateUpdate

`Update` 里可能有很多系统改数据：

```text
战斗逻辑
道具逻辑
任务逻辑
网络同步
```

`LateUpdate` 在它们之后执行，更适合做最终 UI 刷新：

```text
先让数据变化完。
最后统一刷新显示。
```

## 多个 dirty 标记

例如角色面板：

```csharp
private bool hpDirty;
private bool attackDirty;
private bool equipmentDirty;
private bool skillDirty;
```

刷新时：

```csharp
void LateUpdate()
{
    if (hpDirty)
    {
        hpDirty = false;
        RefreshHp();
    }

    if (attackDirty)
    {
        attackDirty = false;
        RefreshAttack();
    }

    if (equipmentDirty)
    {
        equipmentDirty = false;
        RefreshEquipment();
    }

    if (skillDirty)
    {
        skillDirty = false;
        RefreshSkills();
    }
}
```

哪个模块脏了，就只刷哪个模块。

## 版本号也是一种 dirty

有时候不用 bool，而用版本号。

```csharp
private int dataVersion;
private int cachedVersion = -1;
private int cachedPower;
```

数据变化：

```csharp
void MarkDirty()
{
    dataVersion++;
}
```

读取时：

```csharp
int GetPower()
{
    if (cachedVersion != dataVersion)
    {
        cachedPower = CalculatePower();
        cachedVersion = dataVersion;
    }

    return cachedPower;
}
```

版本号适合：

```text
多个系统需要知道自己看到的是不是最新版本
缓存之间有依赖
需要调试数据改了几次
```

## 适合什么

适合：

```text
计算昂贵
变化频繁
读取没那么频繁
可以延迟到需要时刷新
```

例如：

```text
角色战力重算
装备属性汇总
UI 文本刷新
背包排序
地图可见区域刷新
配置缓存重建
技能候选列表重建
Shader 参数批量更新
```

## 不适合什么

不适合必须立刻生效的核心事实。

例如：

```text
受到伤害后，HP 必须马上改变。
死亡判断必须马上执行。
服务器校验必须立刻处理。
```

脏标记适合延迟派生结果：

```text
战力
显示文本
排序结果
缓存列表
布局结果
```

不适合延迟核心事实：

```text
当前 HP
是否死亡
是否扣除资源成功
是否获得物品
```

## 常见坑

第一，忘记标 dirty。

```csharp
equipment.Attack += 10;
// 忘记 attackDirty = true
```

结果读取到旧缓存。

第二，忘记清 dirty。

```csharp
if (attackDirty)
{
    cachedAttack = CalculateAttack();
    // 忘记 attackDirty = false
}
```

结果每次读取都重算。

第三，dirty 依赖关系没处理。

例如：

```text
装备变了 -> 攻击力脏
攻击力变了 -> 战力也脏
```

如果只标了攻击力，没标战力，战力可能还是旧的。

可以统一标记：

```csharp
void MarkEquipmentDirty()
{
    equipmentDirty = true;
    attackDirty = true;
    powerDirty = true;
}
```

第四，延迟刷新导致时序误解。

例如：

```csharp
AddGold(100);
Debug.Log(goldText.text);
```

但 UI 还没到 `LateUpdate` 刷新，所以文本还是旧的。

要区分：

```text
数据已经变了。
显示可能晚一点刷新。
```

## 最重要的收获

```text
脏标记用一个 dirty 标志记录“缓存已经过期”，把昂贵刷新延迟到真正需要时再做。
```

它背后的思想是：

```text
不要每次变化都立刻重算。
把多次变化合并成一次刷新。
```

最常用模板：

```csharp
private bool dirty = true;
private int cachedValue;

public int Value
{
    get
    {
        if (dirty)
        {
            cachedValue = CalculateValue();
            dirty = false;
        }

        return cachedValue;
    }
}

void MarkDirty()
{
    dirty = true;
}
```
