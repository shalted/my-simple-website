# List 常用操作与删除规则

分类：CSharp 基础数据结构

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
