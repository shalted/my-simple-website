# Dictionary 常用操作与深入用法

分类：CSharp 基础数据结构

## 先说结论

`Dictionary<TKey, TValue>` 用唯一 key 定位 value。它适合回答“ID 为 205 的玩家数据是什么”，不适合回答“生命值最低的玩家是谁”，后者仍需要遍历或额外索引。

### 先跟踪两次查询

```text
初始：{ 101 -> 80, 205 -> 60 }
查询 205：找到 60
受到 25 点伤害：205 -> 35
查询 999：不存在，不能假装得到一个真实玩家
```

`TryGetValue(205, out hp)` 同时完成存在性检查和取值。写 `map[999]` 会抛出缺键异常，而写 `map[999] = 100` 会新增一项；相同的方括号语法在读和写时语义不同。

## 常见误解

- “查找很快”指按 key 查找的平均情况，不代表按 value 筛选也很快。
- key 相等规则不稳定时，数据可能写得进去却再也查不回来。
- 遍历顺序不应被当成业务排序；需要顺序时显式排序。

## Dictionary 是什么

`Dictionary<TKey, TValue>` 可以理解成：

```text
用一个 key，快速找到一个 value。
```

常见例子：

```text
学生姓名 -> 分数
怪物 ID -> 怪物对象
资源路径 -> 资源缓存
物品 ID -> 物品配置
```

声明：

```csharp
Dictionary<string, int> scores = new();
```

## 具体场景：根据玩家 ID 更新血量

假设服务器不断收到玩家扣血消息。为什么使用 `Dictionary`？因为消息给的是玩家 ID，业务需要直接定位对应状态，而不是每次从玩家列表头部扫描到尾部。

```csharp
Dictionary<int, int> hpByPlayerId = new()
{
    [101] = 100,
    [205] = 80
};

int playerId = 205;
int damage = 30;

if (hpByPlayerId.TryGetValue(playerId, out int hp))
{
    hpByPlayerId[playerId] = Math.Max(0, hp - damage);
    Console.WriteLine(hpByPlayerId[playerId]); // 50
}
else
{
    Console.WriteLine($"未知玩家: {playerId}");
}
```

运行顺序是：用 `205` 查到 `80`，减去 `30`，再用同一个 key 覆盖成 `50`。如果 ID 不存在，`TryGetValue` 返回 `false`，不会把“找不到”误当成血量 `0`。

这个场景也解释了 key 必须稳定的原因：玩家改昵称不应该让状态查找失效，所以应使用不变的玩家 ID，而不是显示名称。

含义：

```text
key 是 string
value 是 int
```

写入：

```csharp
scores["Alice"] = 90;
scores["Bob"] = 80;
```

读取：

```csharp
int aliceScore = scores["Alice"];
```

## key 不能重复

如果写：

```csharp
scores["Alice"] = 90;
scores["Alice"] = 95;
```

最终结果是：

```text
"Alice" -> 95
```

第二次会覆盖第一次。

所以字典不是存多个 Alice，而是：

```text
一个 key 对应一个 value。
```

## Add 和 [] 的区别

`Add`：

```csharp
scores.Add("Alice", 90);
```

`[]`：

```csharp
scores["Alice"] = 90;
```

区别：

```text
Add：如果 key 已存在，会报错。
[]：如果 key 不存在，新增；如果 key 已存在，覆盖。
```

## ContainsKey

直接读取不存在的 key 会报错：

```csharp
int score = scores["Cindy"]; // KeyNotFoundException
```

所以可以先判断：

```csharp
if (scores.ContainsKey("Alice"))
{
    Debug.Log(scores["Alice"]);
}
```

不过这会查两次：

```text
第一次：ContainsKey 查有没有
第二次：[] 再查一次取值
```

更推荐 `TryGetValue`。

## TryGetValue

```csharp
if (scores.TryGetValue("Alice", out int score))
{
    Debug.Log(score);
}
else
{
    Debug.Log("没找到 Alice");
}
```

含义：

```text
尝试从字典里找 Alice。
如果找到了，返回 true，并把 value 放到 score 里。
如果没找到，返回 false。
```

`out int score` 可以理解成：

```text
声明一个变量 score，让 TryGetValue 把结果填进去。
```

## 找不到就创建

“找不到就创建”是一种常见模式：

```csharp
Dictionary<string, List<int>> skillsByUnit = new();

if (!skillsByUnit.TryGetValue("monster_01", out List<int> skills))
{
    skills = new List<int>();
    skillsByUnit["monster_01"] = skills;
}

skills.Add(1001);
```

含义：

```text
我要给 monster_01 添加一个技能 ID。
先查这个怪有没有技能列表。
如果没有，就创建一个空列表，并放回字典。
然后 Add 技能。
```

这个模式叫：

```text
按 key 分组收集数据。
```

## 计数器写法

统计每种怪物出现次数：

```csharp
Dictionary<string, int> monsterCounts = new();

string monsterType = "Slime";

if (!monsterCounts.TryGetValue(monsterType, out int count))
{
    count = 0;
}

monsterCounts[monsterType] = count + 1;
```

也可以简写：

```csharp
monsterCounts.TryGetValue(monsterType, out int count);
monsterCounts[monsterType] = count + 1;
```

因为 `int` 找不到时，`out count` 会是默认值 `0`。

## TryAdd

```csharp
bool added = scores.TryAdd("Alice", 90);
```

含义：

```text
如果 Alice 不存在，添加并返回 true。
如果 Alice 已存在，不覆盖，返回 false。
```

和 `scores["Alice"] = 90` 不同：

```text
[] 会新增或覆盖。
TryAdd 只新增，不覆盖。
```

## 遍历 Dictionary

遍历 key 和 value：

```csharp
foreach (KeyValuePair<string, int> pair in scores)
{
    Debug.Log($"{pair.Key}: {pair.Value}");
}
```

也可以用 `var`：

```csharp
foreach (var pair in scores)
{
    Debug.Log($"{pair.Key}: {pair.Value}");
}
```

只遍历 key：

```csharp
foreach (string name in scores.Keys)
{
    Debug.Log(name);
}
```

只遍历 value：

```csharp
foreach (int score in scores.Values)
{
    Debug.Log(score);
}
```

## 遍历时不要直接删除

错误示例：

```csharp
foreach (var pair in scores)
{
    if (pair.Value < 60)
    {
        scores.Remove(pair.Key); // 危险
    }
}
```

`Dictionary` 在 `foreach` 时被修改，通常会报错：

```text
Collection was modified
```

安全写法：先收集要删除的 key。

```csharp
List<string> removeKeys = new();

foreach (var pair in scores)
{
    if (pair.Value < 60)
    {
        removeKeys.Add(pair.Key);
    }
}

foreach (string key in removeKeys)
{
    scores.Remove(key);
}
```

## string key 的大小写问题

默认情况下：

```csharp
Dictionary<string, int> scores = new();

scores["Alice"] = 90;
Debug.Log(scores.ContainsKey("alice")); // false
```

如果希望忽略大小写：

```csharp
Dictionary<string, int> scores = new(StringComparer.OrdinalIgnoreCase);
```

这样：

```csharp
scores["Alice"] = 90;
Debug.Log(scores["alice"]); // 90
```

资源路径、配置 key、名字 key 有时会用：

```csharp
new(StringComparer.OrdinalIgnoreCase)
```

但不是所有 key 都应该忽略大小写，要看业务语义。

## key 要稳定

适合当 key 的类型：

```text
int
long
string
enum
稳定的 struct
```

不太适合随便拿会变化的对象字段当 key。

比如：

```csharp
Dictionary<Vector3, Unit> unitsByPosition;
```

通常不太好，因为浮点数位置会变化，而且精度问题多。

更好的 key：

```csharp
Dictionary<int, Unit> unitsByRuntimeId;
Dictionary<string, Unit> unitsByInstanceId;
```

key 的核心要求：

```text
稳定
唯一
可比较
语义清楚
```

## Dictionary 快的是按 key 查

`ContainsValue` 是存在的：

```csharp
scores.ContainsValue(90)
```

但它要遍历整个字典，复杂度是 `O(n)`。

`Dictionary` 快的是：

```csharp
scores.ContainsKey("Alice")
scores.TryGetValue("Alice", out int score)
```

如果经常要从 value 反查 key，通常需要额外维护反向字典：

```text
location -> asset
assetInstanceId -> location
```

## 最重要的写法

添加或覆盖：

```csharp
dict[key] = value;
```

只新增不覆盖：

```csharp
dict.TryAdd(key, value);
```

安全查找：

```csharp
if (dict.TryGetValue(key, out var value))
{
    // 使用 value
}
```

找不到就创建：

```csharp
if (!dict.TryGetValue(key, out var list))
{
    list = new List<int>();
    dict[key] = list;
}

list.Add(item);
```

计数器：

```csharp
dict.TryGetValue(key, out int count);
dict[key] = count + 1;
```

删除：

```csharp
dict.Remove(key);
```

一句话总结：

```text
List 是一排东西，靠下标和顺序访问。
Dictionary 是一张映射表，靠 key 快速定位 value。
```
