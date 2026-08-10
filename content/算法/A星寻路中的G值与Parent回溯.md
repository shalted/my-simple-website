# A 星寻路中的 G 值与 Parent 回溯

分类：算法

## A 星解决什么问题

A 星寻路用于在地图中寻找一条从起点到终点的路径，并尽量绕开障碍、缩短距离。

它的核心公式是：

```text
F = G + H
```

其中：

```text
G：从起点走到当前点，已经花了多少成本。
H：从当前点到终点，估计还要多少成本。
F：综合评分。
```

## 跟着代码看一次“换父节点”

先只实现 A* 中最关键的一步：发现一条更便宜的路线时，更新邻居的 `G` 和 `Parent`。把下面两个类型放在 `Node.cs`：

```csharp
using System;
using System.Collections.Generic;

sealed class Node
{
    public string Id { get; }
    public int G { get; set; } = int.MaxValue;
    public Node? Parent { get; set; }

    public Node(string id) => Id = id;
}

static class AStarStep
{
    public static bool TryRelax(Node current, Node neighbor, int edgeCost)
    {
        int newG = current.G + edgeCost;

        if (newG >= neighbor.G)
            return false;

        neighbor.G = newG;
        neighbor.Parent = current;
        return true;
    }

    public static List<string> BuildPath(Node goal)
    {
        List<string> path = new();

        for (Node? node = goal; node != null; node = node.Parent)
            path.Add(node.Id);

        path.Reverse();
        return path;
    }
}
```

构造一个很小的图：

```text
S --3--> A
S --1--> B --1--> A
```

先从 S 直接发现 A：

```csharp
Node s = new("S") { G = 0 };
Node a = new("A");
Node b = new("B");

AStarStep.TryRelax(s, a, 3);
Console.WriteLine($"A: G={a.G}, Parent={a.Parent?.Id}");
// A: G=3, Parent=S
```

再经过 B 到达 A：

```csharp
AStarStep.TryRelax(s, b, 1); // B.G = 1
AStarStep.TryRelax(b, a, 1); // 新路线成本 1 + 1 = 2

Console.WriteLine($"A: G={a.G}, Parent={a.Parent?.Id}");
// A: G=2, Parent=B
```

第二次更新不是为 A 保存另一条完整路径，而是覆盖两个字段：

```text
A.G：3 -> 2
A.Parent：S -> B
```

### 第二步：沿 Parent 恢复最终路径

`BuildPath` 已经在 `AStarStep` 中。`Program.cs` 调用它：

```csharp
Console.WriteLine(string.Join(" -> ", AStarStep.BuildPath(a)));
// S -> B -> A
```

搜索阶段不断修改 `G` 和 `Parent`；只有找到终点后，才从终点沿 Parent 反向走回起点。后文所有关于 Open、Closed 和路径正确性的讨论，都可以对应到这两个操作：`TryRelax` 负责改进记录，`BuildPath` 负责最终回溯。

## G 值为什么重要

`G` 看起来像“过去的账”，但它非常关键。

A 星不是只想找“看起来离终点近”的点，而是想找：

```text
从起点到终点的总路程尽量短。
```

这个总路程必须包含：

```text
已经走过的距离 G
还没走的估计距离 H
```

如果只看 `H`，就会变成贪心搜索：

```text
谁看起来离终点近，就先选谁。
```

这样很容易被障碍骗。

例如某个点虽然离终点很近，但为了到达它已经绕了很远。

`G` 的作用就是提醒算法：

```text
你虽然看起来离目标近，但你已经付出了很高成本。
```

一句话：

```text
H 让 A 星有方向感。
G 让 A 星不被方向感骗。
```

## 数字例子

假设有两个候选点：

```text
A 点：
G = 10  已经走了 10 步
H = 2   估计离终点还差 2 步
F = 12

B 点：
G = 3   已经走了 3 步
H = 6   估计离终点还差 6 步
F = 9
```

如果只看 `H`：

```text
A 更好，因为 H = 2。
```

但看总成本：

```text
A 总成本约 12。
B 总成本约 9。
```

所以 B 可能更值得继续探索。

## 搜索阶段不是移动阶段

A 星搜索时，角色并没有真的移动。

搜索阶段只是算法在内存里推演：

```text
哪些点可能成为路线？
每个点当前最便宜的到达方式是什么？
哪个候选点最值得继续探索？
```

等找到最终路径之后，角色才开始沿路径移动。

所以不会发生：

```text
角色走到一半发现路线错了，再一步步倒退。
```

单次 A 星是：

```text
先计算路线，再执行移动。
```

## A 星不为每个候选点保存完整路径

如果每个候选点都保存一整条路径：

```text
A: [S, A]
B: [S, A, B]
C: [S, A, B, C]
D: [S, X, Y, D]
```

会浪费很多内存。

A 星更常见的做法是：

```text
每个节点只保存 Parent。
```

例如：

```text
B.parent = A
C.parent = B
G.parent = C
```

找到终点后，从终点往回追：

```text
G -> C -> B -> A -> S
```

再反转：

```text
S -> A -> B -> C -> G
```

这就是最终路径。

## 换路线时发生了什么

假设某个节点 `X` 之前是这样到达的：

```text
S -> A -> B -> X
```

成本：

```text
X.G = 10
X.Parent = B
```

后来发现另一条更短的路：

```text
S -> C -> X
```

成本：

```text
newG = 6
```

那就更新：

```text
X.G = 6
X.Parent = C
```

这不是让角色倒退，也不是修改一条正在走的路径 List。

它只是把数据记录改成：

```text
到 X 的当前最佳来源是 C。
```

以后如果最终路径经过 X，回溯出来的就是新路线：

```text
S -> C -> X
```

而不是旧路线：

```text
S -> A -> B -> X
```

## 保证路径正确的关键

关键规则是：

```text
如果第一次发现某个节点，记录它的 G 和 Parent。
如果之后发现更低 G 的路线，更新它的 G 和 Parent。
```

伪代码：

```csharp
if (newG < neighbor.G || !openSet.Contains(neighbor))
{
    neighbor.G = newG;
    neighbor.H = Heuristic(neighbor, goal);
    neighbor.F = neighbor.G + neighbor.H;
    neighbor.Parent = current;
}
```

这句就是保证最终路径正确的关键。

## 运行边界：什么时候没有路径

如果 Open 集合已经为空，终点仍未被发现，结果应该是“不可达”，而不是返回离终点最近的半条路径：

```csharp
if (open.Count == 0 && !states.ContainsKey(goal))
    return PathResult.Unreachable;
```

还要明确这些边界：

- 普通 A* 不能处理负成本边。
- `G + edgeCost` 要防止整数溢出，`int.MaxValue` 不能直接参与加法。
- 起点等于终点时，正确结果是只包含起点的零成本路径。
- 地图在搜索期间变化时，旧 Parent 链可能穿过新障碍，需要版本检查或重新寻路。
- 启发函数如果高估真实剩余成本，就不再保证最短路径。

失败结果应该返回状态和原因，调用方再决定原地等待、换目标还是请求最近可达点。

## 最重要的收获

```text
A 星搜索时不是角色在走路，而是在内存里推演路线。
```

```text
G 记录从起点到当前点的真实成本。
H 估计从当前点到终点的剩余成本。
Parent 记录当前节点目前最优的来源节点。
```

最终路径不是一路维护一个大 List，而是：

```text
从终点沿 Parent 回溯，再反转得到。
```
