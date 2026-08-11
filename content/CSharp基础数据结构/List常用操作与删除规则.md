# List 常用操作与删除规则

分类：CSharp 基础数据结构

## 先说结论

`List<T>` 是可按下标访问、会保持顺序的动态数组。真正容易出错的不是 `Add`，而是删除后后续元素左移，导致下标和遍历位置发生变化。

### 先手算一次删除

```text
初始：[A, B, B, C]
Remove(B)：[A, B, C]       // 只删除第一个 B
RemoveAll(x == B)：[A, C]  // 删除所有 B
```

如果从左向右删除下标 1，后一个 B 会立刻从下标 2 移到下标 1，而循环随后增加到 2，便可能跳过它。倒序删除时，左侧尚未访问的数据不会因为右侧删除而改变下标。

## List 是什么

`List<T>` 可以理解成“可变长度数组”。

数组长度固定：

```csharp
int[] nums = new int[3];
```

`List<T>` 可以动态添加元素：

```csharp
List<int> nums = new();
nums.Add(10);
nums.Add(20);
nums.Add(30);
```

`T` 表示元素类型：

```text
List<int>        存 int
List<string>     存 string
List<Unit>       存 Unit
List<GameObject> 存 GameObject
```

## 跟着一个列表逐步运行

具体场景是维护“当前场上的敌人 ID”。为什么选择 `List<int>`：业务需要保留进入顺序、允许按下标访问，并且敌人数量会动态增减；这些都是 List 的直接职责。

```csharp
using System;
using System.Collections.Generic;

List<int> enemyIds = new() { 101, 102, 103 };

enemyIds.Add(104);
Console.WriteLine(string.Join(", ", enemyIds));

enemyIds.Remove(102);
Console.WriteLine(string.Join(", ", enemyIds));

Console.WriteLine(enemyIds.Contains(103));
Console.WriteLine(enemyIds[0]);
```

按行运行后的状态是：

```text
初始                    [101, 102, 103]
Add(104)               [101, 102, 103, 104]
Remove(102)            [101, 103, 104]
Contains(103)          输出 True，列表不变
enemyIds[0]            输出 101，列表不变
```

注意两个不同概念：`Remove(102)` 按“值”删除，`RemoveAt(1)` 按“下标”删除。在当前状态 `[101, 103, 104]` 上调用 `RemoveAt(1)`，删掉的是值 `103`。

### 发现问题：正序删除会跳过元素

```csharp
List<int> values = new() { 2, 4, 5 };

for (int i = 0; i < values.Count; i++)
{
    if (values[i] % 2 == 0)
        values.RemoveAt(i);
}
```

逐步看：

```text
i=0，删除 2       -> [4, 5]
循环执行 i++      -> i=1
此时 4 已移到下标 0，却不会再检查
最终错误结果       -> [4, 5]
```

倒序遍历时，删除只会影响已经检查过的右侧元素：

```csharp
for (int i = values.Count - 1; i >= 0; i--)
{
    if (values[i] % 2 == 0)
        values.RemoveAt(i);
}

Console.WriteLine(string.Join(", ", values)); // 5
```

后面的每种删除规则，都可以用这份列表手工跟踪“删除前下标、删除的值、删除后元素怎样左移”。

## 常用操作

添加：

```csharp
List<string> names = new();
names.Add("Alice");
names.Add("Bob");
```

读取数量：

```csharp
int count = names.Count;
```

按下标访问：

```csharp
string first = names[0];
```

修改：

```csharp
names[1] = "Cindy";
```

清空：

```csharp
names.Clear();
```

## Remove 只删除第一个匹配元素

`Remove` 不会删除全部相同元素，它只删除第一个匹配到的元素。

```csharp
List<string> names = new() { "Alice", "Bob", "Alice", "Cindy" };

names.Remove("Alice");
```

执行后：

```text
["Bob", "Alice", "Cindy"]
```

只删掉第一个 `"Alice"`。

`Remove` 有返回值：

```csharp
bool removed = names.Remove("Alice");
```

含义：

```text
true：找到了并删除了一个
false：没找到，什么都没删
```

## RemoveAll 删除所有满足条件的元素

如果想删除所有 `"Alice"`：

```csharp
names.RemoveAll(name => name == "Alice");
```

完整例子：

```csharp
List<string> names = new() { "Alice", "Bob", "Alice", "Cindy" };

names.RemoveAll(name => name == "Alice");

// 结果：["Bob", "Cindy"]
```

这里：

```csharp
name => name == "Alice"
```

意思是：

```text
对列表里的每个 name 做判断；
如果判断结果是 true，就删除。
```

也可以写更复杂的条件：

```csharp
names.RemoveAll(name => name.StartsWith("A"));
```

意思是删除所有以 `"A"` 开头的名字。

## 边遍历边删除时用倒序 for

不要正序边遍历边 `RemoveAt`：

```csharp
for (int i = 0; i < names.Count; i++)
{
    if (names[i] == "Bob")
    {
        names.RemoveAt(i);
    }
}
```

因为删除后，后面的元素会往前移动，`i++` 可能跳过元素。

更稳的写法是倒序删：

```csharp
for (int i = names.Count - 1; i >= 0; i--)
{
    if (names[i] == "Bob")
    {
        names.RemoveAt(i);
    }
}
```

倒序删除时，删除只会影响后面的元素，而后面的元素已经遍历过了，所以安全。

## 最重要的收获

```text
Remove：只删除第一个匹配元素。
RemoveAll：删除所有满足条件的元素。
倒序 for：适合边遍历边删除多个元素。
```
