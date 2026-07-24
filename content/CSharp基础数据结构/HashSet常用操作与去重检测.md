# HashSet 常用操作与去重检测

分类：CSharp 基础数据结构

## HashSet 是什么

`HashSet<T>` 可以理解成：

```text
一组不重复的东西。
```

也可以理解成：

```text
只存 key，不存 value 的 Dictionary。
```

如果只关心“有没有”，不关心“对应什么值”，就很适合用 `HashSet<T>`。

## 基础声明

```csharp
HashSet<string> names = new();
```

添加元素：

```csharp
names.Add("Alice");
names.Add("Bob");
names.Add("Alice");
```

最后集合里只有：

```text
Alice
Bob
```

因为 `HashSet` 自动去重。

## Add 有返回值

```csharp
bool added = names.Add("Alice");
```

含义：

```text
true：之前没有，添加成功
false：之前已经有了，没有重复添加
```

例子：

```csharp
HashSet<string> names = new();

bool first = names.Add("Alice");  // true
bool second = names.Add("Alice"); // false
```

这个返回值很常用，可以顺便做重复检测：

```csharp
if (!names.Add("Alice"))
{
    Debug.Log("Alice 已经存在");
}
```

## 判断是否存在

```csharp
if (names.Contains("Alice"))
{
    Debug.Log("存在 Alice");
}
```

`HashSet.Contains` 很快，和 `Dictionary.ContainsKey` 类似。

适合回答：

```text
这个 ID 是否出现过？
这个怪物是否已经处理过？
这个槽位是否已经被占用？
这个资源路径是否已经收集过？
```

## 删除

```csharp
names.Remove("Alice");
```

也有返回值：

```csharp
bool removed = names.Remove("Alice");
```

含义：

```text
true：找到了并删除
false：没找到
```

清空：

```csharp
names.Clear();
```

## 去重例子

假设有一个列表：

```csharp
List<int> ids = new() { 1, 2, 2, 3, 3, 3, 4 };
```

想得到不重复的 ID：

```csharp
HashSet<int> uniqueIds = new();

foreach (int id in ids)
{
    uniqueIds.Add(id);
}
```

结果：

```text
1, 2, 3, 4
```

如果还想变回 `List`：

```csharp
List<int> result = new(uniqueIds);
```

## 标记已访问

这是 `HashSet` 最常见的算法用途。

比如遍历一组节点，避免重复处理：

```csharp
HashSet<int> visited = new();

void Visit(int nodeId)
{
    if (!visited.Add(nodeId))
    {
        return; // 已经访问过，直接跳过
    }

    Debug.Log($"处理节点: {nodeId}");

    // 继续处理它关联的其他节点
}
```

这里用的是 `Add` 的返回值：

```text
第一次 Add 成功：说明没访问过，继续处理
第二次 Add 失败：说明访问过，跳过
```

这在图遍历、递归、防止死循环里特别常见。

## 冲突检测

例如槽位占用检测：

```csharp
HashSet<int> usedSlots = new();

if (!usedSlots.Add(slotIndex))
{
    Debug.Log("这个槽位已经被占用了");
}
```

因为 `Add` 返回 `false`，说明这个槽位已经存在。

所以 `HashSet` 可以同时完成两件事：

```text
记录已使用
检测重复
```

比先 `Contains` 再 `Add` 更简洁：

```csharp
if (!usedSlots.Add(slotIndex))
{
    // 冲突
}
```

## 和 List 的区别

`List<T>`：

```text
可以有重复
有顺序
可以用下标访问
Contains 通常要从头找，O(n)
```

`HashSet<T>`：

```text
不能有重复
不关心顺序
不能用下标访问
Contains 很快，通常接近 O(1)
```

例子：

```csharp
List<string> list = new() { "A", "A", "B" };
HashSet<string> set = new() { "A", "A", "B" };
```

结果：

```text
list: A, A, B
set:  A, B
```

## 和 Dictionary 的区别

`Dictionary<TKey, TValue>`：

```text
key -> value
```

例如：

```text
"monster_01" -> monsterObject
```

`HashSet<T>`：

```text
只有 key，没有 value
```

例如：

```text
"monster_01" 是否存在
```

如果只关心“有没有”，用 `HashSet`。

如果关心“这个 key 对应什么值”，用 `Dictionary`。

## string 忽略大小写

和 `Dictionary` 一样，`HashSet<string>` 也可以指定比较方式：

```csharp
HashSet<string> paths = new(StringComparer.OrdinalIgnoreCase);

paths.Add("UI/Icon/Player");
Debug.Log(paths.Contains("ui/icon/player")); // true
```

适合资源路径、大小写不敏感的 key。

## 最重要的收获

```text
List：存一排东西，允许重复，适合顺序遍历。
Dictionary：按 key 找 value。
HashSet：只关心有没有，自动去重，适合标记、去重、冲突检测。
```

最值得记住的写法：

```csharp
if (!set.Add(value))
{
    // 已经存在，发生重复或冲突
}
```
