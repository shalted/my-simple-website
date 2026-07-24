# Queue 与 Stack 常用操作

分类：CSharp 基础数据结构

## Queue 是什么

`Queue<T>` 是队列：

```text
先进先出。
```

也叫 FIFO：

```text
First In, First Out
```

就像排队买东西：

```text
先来的人先处理。
```

声明：

```csharp
Queue<string> queue = new();
```

入队：

```csharp
queue.Enqueue("Alice");
queue.Enqueue("Bob");
queue.Enqueue("Cindy");
```

出队：

```csharp
string first = queue.Dequeue();
```

拿到的是：

```text
Alice
```

## Queue 常用操作

入队：

```csharp
queue.Enqueue("Alice");
```

出队并移除：

```csharp
string name = queue.Dequeue();
```

查看队首但不移除：

```csharp
string next = queue.Peek();
```

数量：

```csharp
int count = queue.Count;
```

清空：

```csharp
queue.Clear();
```

空队列时直接 `Dequeue()` 或 `Peek()` 会报错。

所以通常先判断：

```csharp
if (queue.Count > 0)
{
    string name = queue.Dequeue();
}
```

## Queue 适合什么场景

`Queue` 适合按顺序处理任务：

```text
伤害数字排队播放
系统消息按顺序弹出
下载任务队列
AI 命令队列
网络包按顺序处理
BFS 广度优先搜索
```

例子：

```csharp
Queue<string> messages = new();

messages.Enqueue("获得金币 +10");
messages.Enqueue("获得经验 +20");
messages.Enqueue("任务完成");

while (messages.Count > 0)
{
    string message = messages.Dequeue();
    Debug.Log(message);
}
```

输出顺序：

```text
获得金币 +10
获得经验 +20
任务完成
```

## Stack 是什么

`Stack<T>` 是栈：

```text
后进先出。
```

也叫 LIFO：

```text
Last In, First Out
```

就像一摞盘子：

```text
最后放上去的盘子，最先被拿走。
```

声明：

```csharp
Stack<string> stack = new();
```

入栈：

```csharp
stack.Push("PageA");
stack.Push("PageB");
stack.Push("PageC");
```

出栈：

```csharp
string top = stack.Pop();
```

拿到的是：

```text
PageC
```

## Stack 常用操作

入栈：

```csharp
stack.Push("PageA");
```

出栈并移除：

```csharp
string page = stack.Pop();
```

查看栈顶但不移除：

```csharp
string top = stack.Peek();
```

数量：

```csharp
int count = stack.Count;
```

清空：

```csharp
stack.Clear();
```

空栈时直接 `Pop()` 或 `Peek()` 也会报错。

所以通常：

```csharp
if (stack.Count > 0)
{
    string page = stack.Pop();
}
```

## Stack 适合什么场景

`Stack` 适合回退、撤销、嵌套结构：

```text
UI 页面返回栈
撤销操作 Undo
递归改成非递归
括号匹配
DFS 深度优先搜索
状态压栈和恢复
```

例子：UI 页面返回。

```csharp
Stack<string> pageStack = new();

pageStack.Push("Home");
pageStack.Push("Bag");
pageStack.Push("ItemDetail");

string current = pageStack.Pop();   // ItemDetail
string previous = pageStack.Peek(); // Bag
```

含义：

```text
当前关闭 ItemDetail，回到 Bag。
```

## Queue 和 Stack 对比

同样放入：

```text
1, 2, 3
```

`Queue` 取出：

```text
1, 2, 3
```

`Stack` 取出：

```text
3, 2, 1
```

示例：

```csharp
Queue<int> queue = new();
queue.Enqueue(1);
queue.Enqueue(2);
queue.Enqueue(3);

Debug.Log(queue.Dequeue()); // 1
```

```csharp
Stack<int> stack = new();
stack.Push(1);
stack.Push(2);
stack.Push(3);

Debug.Log(stack.Pop()); // 3
```

## 和 List 的区别

可以用 `List` 模拟栈：

```csharp
list.Add(item); // push
var item = list[^1];
list.RemoveAt(list.Count - 1); // pop
```

但队列用 `List` 从头删很差：

```csharp
var item = list[0];
list.RemoveAt(0);
```

`RemoveAt(0)` 会导致后面所有元素前移，成本是 `O(n)`。

`Queue.Dequeue()` 更适合队列场景。

## 最重要的收获

```text
Queue：适合排队处理，先来的先处理。
Stack：适合回退撤销，后来的先处理。
```

最常记的 API：

```csharp
queue.Enqueue(item);
queue.Dequeue();
queue.Peek();

stack.Push(item);
stack.Pop();
stack.Peek();
```
