# 图遍历与最短路：BFS、DFS、Dijkstra

分类：算法

## 先说结论

BFS 按层扩展，适合无权图最少边数；DFS 沿一条分支深入，适合遍历、回溯和结构检查；Dijkstra 每次扩展当前累计成本最低的节点，适合边权非负的最短路。三者的差异主要在“下一步从哪里取节点”。

### 同一张图得到不同关注点

```text
A -> B，成本 1
A -> C，成本 5
B -> D，成本 10
C -> D，成本 1
```

BFS 只数边数，会认为 A-B-D 与 A-C-D 都是 2 条边；Dijkstra 计算成本，选择 A-C-D，总成本 6，而 A-B-D 为 11。DFS 可能先完整走 A-B-D，但它第一次到达 D 不代表找到了最低成本。

## 先用生活模型理解图

想象一座展馆：

- 房间是**节点**。
- 房间之间的通道是**边**。
- 穿过通道所需的时间是**边权重**。

从入口开始参观时，常见目标有三种：

```text
BFS：先看离入口通道数最少的房间。
DFS：沿一条路线不断深入，走不通再退回。
Dijkstra：考虑每条通道的代价，寻找累计代价最小的路线。
```

图算法不只用于地图。只要数据之间存在“谁与谁相连”，就可以先把问题映射成图，再选择遍历或最短路算法。

## 图怎样存进内存

常见表示方法有邻接表和邻接矩阵。

邻接表为每个节点保存相邻节点：

```text
A -> B, C
B -> A, D
C -> A
D -> B
```

若节点数为 `V`、边数为 `E`，邻接表的空间通常是 `O(V + E)`，适合边相对稀疏的图。

邻接矩阵使用二维表：

```text
matrix[a, b] = 是否相连或边权重
```

它需要 `O(V²)` 空间，但判断任意两个节点是否直接相连通常是 `O(1)`。

下面的示例使用邻接表。

## BFS：像水波一样一层层扩散

BFS 是 Breadth-First Search，即广度优先搜索。

它使用**队列**保存待访问节点。队列先进先出，因此先发现的近层节点会先被处理。

### 为什么需要 BFS

在每条边代价相同的无权图中，BFS 第一次到达某节点时，走过的边数最少。因此它适合：

- 按层遍历；
- 查找无权图最少边数路径；
- 计算节点与起点相隔几层；
- 判断某个可达目标是否存在。

### 逐步过程

以下节点和连接均为教学示例：

```text
A -> B, C
B -> D
C -> E
D -> F
E -> F
```

从 `A` 开始：

| 步骤 | 取出 | 新发现 | 队列 |
|---:|---|---|---|
| 1 | A | B、C | B、C |
| 2 | B | D | C、D |
| 3 | C | E | D、E |
| 4 | D | F | E、F |
| 5 | E | 无，F 已发现 | F |
| 6 | F | 无 | 空 |

遍历顺序是：

```text
A, B, C, D, E, F
```

`visited` 必须在节点**入队时**标记，而不是等到出队才标记。否则同一个节点可能被多个前驱重复加入队列。

### C# 最小示例

```csharp
static List<string> BreadthFirst(
    Dictionary<string, List<string>> graph,
    string start)
{
    var order = new List<string>();
    var visited = new HashSet<string> { start };
    var queue = new Queue<string>();
    queue.Enqueue(start);

    while (queue.Count > 0)
    {
        string current = queue.Dequeue();
        order.Add(current);

        foreach (string next in graph[current])
        {
            // 入队时标记，确保每个节点最多入队一次。
            if (visited.Add(next))
            {
                queue.Enqueue(next);
            }
        }
    }

    return order;
}

var graph = new Dictionary<string, List<string>>
{
    ["A"] = new() { "B", "C" },
    ["B"] = new() { "D" },
    ["C"] = new() { "E" },
    ["D"] = new() { "F" },
    ["E"] = new() { "F" },
    ["F"] = new()
}; // 全部节点与连接均为教学示例

Console.WriteLine(string.Join(", ", BreadthFirst(graph, "A")));
```

## DFS：先沿一条路深入到底

DFS 是 Depth-First Search，即深度优先搜索。

它使用**栈**，或借助递归调用栈。每次选择一个尚未访问的邻居继续深入；当前路线没有新节点时，再退回上一个分叉点。

### 为什么需要 DFS

DFS 适合关注“深入关系”的问题，例如：

- 判断可达性；
- 枚举一条完整分支；
- 检测环；
- 拓扑排序；
- 寻找连通分量；
- 需要回溯的搜索。

DFS 能找到路径，但在普通无权图中不保证第一次找到的是最短路径。

### 逐步过程

仍使用上面的教学示例图，并按邻接表顺序选择节点：

```text
A
└─ B
   └─ D
      └─ F
返回 A
└─ C
   └─ E
```

可能得到：

```text
A, B, D, F, C, E
```

具体顺序取决于邻居的排列方式；改变邻接表顺序，合法的 DFS 顺序也可能改变。

### C# 最小示例

```csharp
static List<string> DepthFirst(
    Dictionary<string, List<string>> graph,
    string start)
{
    var order = new List<string>();
    var visited = new HashSet<string>();
    var stack = new Stack<string>();
    stack.Push(start);

    while (stack.Count > 0)
    {
        string current = stack.Pop();
        if (!visited.Add(current))
        {
            continue;
        }

        order.Add(current);

        // 逆序压栈，让邻接表中靠前的节点先被弹出访问。
        for (int i = graph[current].Count - 1; i >= 0; i--)
        {
            string next = graph[current][i];
            if (!visited.Contains(next))
            {
                stack.Push(next);
            }
        }
    }

    return order;
}
```

递归写法更接近定义，但图很深时，递归层数可能超过调用栈可承受范围。显式栈可以把这部分状态放到托管集合中，并让深度限制更容易控制。

## Dijkstra：按当前最便宜的累计代价扩展

BFS 把每条边都视为相同代价。如果通道耗时不同，仅比较经过几条边就不够了。

Dijkstra 算法维护：

```text
distance[x]：目前已知从起点到 x 的最小累计代价。
priority queue：按当前累计代价取出最小候选节点。
```

### 为什么需要 Dijkstra

当图的边权重**非负**时，Dijkstra 可以求一个起点到其他可达节点的最短距离，也可以通过记录前驱重建路径。

它的关键不是“选看起来离终点最近的节点”，而是：

```text
每次选当前已知累计代价最小的候选节点。
```

### 松弛操作

假设当前已知：

```text
起点到 A 的代价 = 4
A 到 B 的边权重 = 3
起点到 B 的旧代价 = 10
```

以上数值均为教学示例。

经过 `A` 到达 `B` 的新代价：

```text
4 + 3 = 7
```

因为 `7 < 10`，所以更新：

```text
distance[B] = 7
previous[B] = A
```

这个“发现更短路线就更新”的动作叫松弛。

### 逐步过程

教学示例图：

```text
S -> A，权重 4
S -> B，权重 1
B -> A，权重 2
A -> T，权重 1
B -> T，权重 5
```

| 步骤 | 取出节点 | 已确定候选代价 | 发生的更新 |
|---:|---|---|---|
| 1 | S | 0 | A=4，B=1 |
| 2 | B | 1 | A=3，T=6 |
| 3 | A | 3 | T=4 |
| 4 | T | 4 | 无 |

最终教学示例最短路径：

```text
S -> B -> A -> T
总代价 = 4
```

### C# 最小示例

```csharp
public readonly record struct Edge(string To, int Cost);

static Dictionary<string, int> Dijkstra(
    Dictionary<string, List<Edge>> graph,
    string start)
{
    var distance = graph.Keys.ToDictionary(
        node => node,
        _ => int.MaxValue);

    var queue = new PriorityQueue<string, int>();
    distance[start] = 0;
    queue.Enqueue(start, 0);

    while (queue.TryDequeue(out string? current, out int queuedDistance))
    {
        // 同一节点可能以旧距离留在队列中，跳过过期条目。
        if (queuedDistance != distance[current])
        {
            continue;
        }

        foreach (Edge edge in graph[current])
        {
            if (edge.Cost < 0)
            {
                throw new ArgumentOutOfRangeException(
                    nameof(graph),
                    "Dijkstra 不接受负权边。");
            }

            int candidate = checked(queuedDistance + edge.Cost);
            if (candidate < distance[edge.To])
            {
                distance[edge.To] = candidate;
                queue.Enqueue(edge.To, candidate);
            }
        }
    }

    return distance;
}

var weightedGraph = new Dictionary<string, List<Edge>>
{
    ["S"] = new() { new("A", 4), new("B", 1) },
    ["A"] = new() { new("T", 1) },
    ["B"] = new() { new("A", 2), new("T", 5) },
    ["T"] = new()
}; // 节点、边和权重均为教学示例

Dictionary<string, int> result = Dijkstra(weightedGraph, "S");
Console.WriteLine(result["T"]); // 教学示例输出 4
```

示例使用 `checked` 暴露整数加法溢出，而不是让溢出结果参与距离比较。

## 三种算法怎样选择

| 问题 | 合适算法 | 原因 |
|---|---|---|
| 只需遍历所有可达节点 | BFS 或 DFS | 两者都能覆盖可达区域 |
| 无权图最少边数路径 | BFS | 按层扩展 |
| 沿分支深入、回溯或检测结构 | DFS | 栈保存当前深入路径 |
| 非负权图最小累计代价 | Dijkstra | 按当前最小距离扩展 |

不要仅凭“这是地图”选择算法。先确认边是否有权重、权重是否可能为负、要最短路径还是只要可达。

## 边界与失败情况

### 图中存在环

没有 `visited` 或等价状态时，BFS 和 DFS 可能不断重复访问环中的节点。

### 起点或邻居缺失

示例假设图中包含起点，而且每个被引用的邻居也有邻接表项。实际使用时，应由输入契约保证，或在算法入口显式验证并暴露错误。

### 图不连通

从一个起点执行，只会访问该起点所在的连通区域。若要遍历整张不连通图，需要从每个尚未访问的节点再次启动遍历。

### 负权边

Dijkstra 的确定性依据依赖非负权重。出现负权边时，已经取出的“最小距离”仍可能在之后被降低，算法前提被破坏。此时应选择支持相应权重条件的算法，而不是继续使用 Dijkstra。

### 距离溢出

累计代价使用固定宽度整数时可能溢出。数值类型、允许范围和溢出处理必须与输入契约一致。

### 邻居顺序

BFS 和 DFS 的访问顺序会受到邻接表顺序影响。如果顺序属于结果契约，就应在建图时或遍历前明确排序；排序会带来额外成本。

## 复杂度与代价

邻接表表示下：

| 算法 | 时间复杂度 | 额外空间 | 主要数据结构 |
|---|---:|---:|---|
| BFS | `O(V + E)` | `O(V)` | 队列、访问集合 |
| DFS | `O(V + E)` | `O(V)` | 栈、访问集合 |
| Dijkstra（二叉堆） | `O((V + E) log V)` | `O(V + E)` | 优先队列、距离表 |

其中 `V` 是节点数，`E` 是边数。Dijkstra 的实现可能把同一节点的多个距离条目放入优先队列，因此队列大小还会受成功松弛次数影响。

## 小结

```text
BFS 用队列按层扩散，适合无权最短边数。
DFS 用栈沿分支深入，适合结构探索和回溯。
Dijkstra 用优先队列扩展当前累计代价最小的节点，
适合非负权图的最短路。
```

真正决定算法的不是名字，而是问题约束：边是否等价、权重能否为负、是否需要最短、输入规模有多大。先写清这些条件，再选数据结构，算法过程就会自然清晰。
