# Queue 与 Stack 常用操作

分类：CSharp 基础数据结构

## 先说结论

Queue 和 Stack 保存的可以是同一批数据，区别只在“下一次取谁”：Queue 先进先出，Stack 后进先出。选择它们是在选择处理顺序，而不仅是在选择 API。

### 同一组数据的两种结果

```text
依次放入：A、B、C
Queue.Dequeue() -> A，剩余 [B, C]
Stack.Pop()     -> C，剩余 [A, B]
```

任务排队通常希望 A 先执行，所以用 Queue；撤销操作通常希望最后执行的 C 先撤销，所以用 Stack。若业务需要从中间任意删除，两者都不是天然合适的结构。

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

## 完整运行：任务排队与操作撤销

为什么 Queue 适合任务处理：先到的请求必须先执行。

```csharp
Queue<string> jobs = new();
jobs.Enqueue("加载配置");
jobs.Enqueue("创建角色");
jobs.Enqueue("进入场景");

while (jobs.TryDequeue(out string? job))
    Console.WriteLine(job);
```

输出严格保持入队顺序：

```text
加载配置
创建角色
进入场景
```

为什么 Stack 适合撤销：最后完成的操作必须最先回退。

```csharp
Stack<string> undo = new();
undo.Push("放置节点 A");
undo.Push("移动节点 A");
undo.Push("删除节点 A");

while (undo.TryPop(out string? operation))
    Console.WriteLine($"撤销: {operation}");
```

输出顺序相反：

```text
撤销: 删除节点 A
撤销: 移动节点 A
撤销: 放置节点 A
```

### 边界：空容器不能直接取值

队列为空时调用 `Dequeue()`、栈为空时调用 `Pop()` 都会抛出异常。输入是否可能为空不确定时，使用 `TryDequeue` 和 `TryPop`：

```csharp
if (!jobs.TryDequeue(out string? nextJob))
    Console.WriteLine("当前没有待处理任务");

if (!undo.TryPop(out string? lastOperation))
    Console.WriteLine("当前没有可撤销操作");
```

另一个边界是容量无限增长：生产者持续入队而消费者处理不过来时，Queue 会占用越来越多内存。工程系统要监控队列长度，并明确限流、丢弃、合并或背压策略。

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
