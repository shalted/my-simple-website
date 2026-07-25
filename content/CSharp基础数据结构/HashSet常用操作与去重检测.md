# HashSet：把“是否见过”变成可观察的状态

分类：CSharp 基础数据结构

## 先建立一个准确的画面

`HashSet<T>` 不是“一排数据”，而是一张**只登记某个值是否出现过**的表。

它始终遵守一条规则：同一个值最多登记一次。

假设输入依次到来：

```text
A → B → A → C → B
```

处理结束后，集合是：

```text
{ A, B, C }
```

第二个 `A` 和第二个 `B` 没有被再次写入。页面上方的实验会把这个过程拆成 11 个状态，建议先手动点完一遍。

## Add 其实同时做了两件事

这一行不是单纯的“添加”：

```csharp
bool added = seen.Add(value);
```

它会完成：

1. 检查 `value` 是否已经存在。
2. 不存在时写入，并返回 `true`。
3. 已存在时保持集合不变，并返回 `false`。

所以这段代码可以直接检测重复：

```csharp
if (!seen.Add(value))
{
    duplicates++;
}
```

最关键的不是背住 `Add`，而是记住：

```text
Add 返回 true  → 第一次见到 → 集合发生变化
Add 返回 false → 以前见过   → 集合保持不变
```

## Contains 只提问，不修改

`Contains` 回答“这个值现在是否在集合中”：

```csharp
bool exists = seen.Contains("A");
```

如果集合是 `{ A, B }`，查询 `A` 返回 `true`，但集合仍然是 `{ A, B }`。

它适合用于只想判断、暂时不想修改状态的地方。

## Remove 只有找到时才改变集合

```csharp
bool removed = seen.Remove("A");
```

- 存在 `A`：删除它，返回 `true`。
- 不存在 `A`：什么也不改，返回 `false`。

`Add`、`Contains`、`Remove` 的区别可以压缩成一张表：

| 操作 | 回答的问题 | 可能修改集合 |
| --- | --- | --- |
| `Add(value)` | 这是第一次出现吗？ | 是 |
| `Contains(value)` | 它现在存在吗？ | 否 |
| `Remove(value)` | 它刚才存在并被删掉了吗？ | 是 |

## 为什么算法里经常用 visited

遍历节点时，同一个节点可能从不同路径再次到达。`visited` 用来阻止重复处理：

```csharp
HashSet<int> visited = new();

void Visit(int nodeId)
{
    if (!visited.Add(nodeId))
    {
        return; // 已处理过：不再沿它继续展开
    }

    Process(nodeId);
}
```

这里把“检查”和“登记”合并成一次操作：

```text
第一次到达节点 → Add 返回 true  → 继续处理
再次到达节点   → Add 返回 false → 立即停止
```

这可以避免重复计算，也能阻止环形关系导致无限递归。

## 去重时发生了什么

列表允许重复：

```csharp
List<int> input = new() { 1, 2, 2, 3, 3, 3, 4 };
```

把每个值交给 `HashSet`：

```csharp
HashSet<int> unique = new();

foreach (int id in input)
{
    unique.Add(id);
}
```

第一次出现的值写入，后续相同值被拒绝，最终得到 `{ 1, 2, 3, 4 }`。

注意：`HashSet` 的职责是唯一性与快速查找，不应该依赖它的枚举顺序。如果业务需要稳定顺序，可以保留原列表，并用 `HashSet` 辅助判断是否首次出现：

```csharp
HashSet<int> seen = new();
List<int> orderedUnique = new();

foreach (int id in input)
{
    if (seen.Add(id))
    {
        orderedUnique.Add(id);
    }
}
```

## List、HashSet、Dictionary 怎么选

| 结构 | 最适合回答 | 重复 | 典型用途 |
| --- | --- | --- | --- |
| `List<T>` | 第几个是什么？ | 允许 | 有序序列、按下标访问 |
| `HashSet<T>` | 有没有这个值？ | 不允许 | 去重、visited、占用检测 |
| `Dictionary<TKey, TValue>` | 这个 key 对应什么？ | key 不重复 | ID 到对象的映射 |

`HashSet.Contains`、`Add`、`Remove` 的平均时间复杂度通常接近 `O(1)`；`List.Contains` 通常需要逐个比较，是 `O(n)`。

## 谁算“同一个值”

是否重复由相等比较规则决定。字符串默认区分大小写：

```csharp
HashSet<string> names = new();
names.Add("Alice");

names.Contains("alice"); // false
```

如果业务明确要求忽略大小写，可以在创建集合时指定规则：

```csharp
HashSet<string> paths = new(StringComparer.OrdinalIgnoreCase);

paths.Add("UI/Icon/Player");
paths.Contains("ui/icon/player"); // true
```

比较规则一旦确定，`Add`、`Contains`、`Remove` 都会使用同一套规则。

## 最后只记住这一个判断

```csharp
if (!set.Add(value))
{
    // value 已经存在：这是重复、冲突或再次访问
}
```

先看 `Add` 的返回值，再看集合有没有变化，HashSet 的核心就不会混乱。
