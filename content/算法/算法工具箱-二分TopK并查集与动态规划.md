# 算法工具箱：二分、Top K、并查集与动态规划

分类：算法

## 四种工具分别解决什么

想象整理一座资料室：

- **二分查找**：书架已经按编号排序，每次查看中间位置，排除一半范围。
- **Top K**：传送带持续送来物品，只保留当前最值得关注的 `K` 件。
- **并查集**：不断把小组连接起来，并快速判断两个人是否已在同一组。
- **动态规划**：把复杂任务拆成重复子任务，保存已经算过的答案再组合。

它们并不是同一类算法，而是四种常见问题模型：

```text
有序范围定位 -> 二分查找
海量候选保留少量极值 -> Top K
动态合并与连通判断 -> 并查集
重叠子问题与最优子结构 -> 动态规划
```

## 二分查找：每次排除一半范围

### 为什么需要二分查找

顺序查找从头逐个比较，最坏要检查 `n` 个元素。

如果数据已经按与查询规则一致的顺序排列，就可以比较中间元素：

```text
目标更小 -> 只保留左半边
目标更大 -> 只保留右半边
目标相等 -> 找到
```

每一步都把候选范围缩小约一半，所以时间复杂度是 `O(log n)`。

### 逐步过程

教学示例数组：

```text
[2, 5, 8, 12, 16, 23, 38]
```

查找教学示例目标 `16`：

| 步骤 | 左边界 | 右边界 | 中间值 | 处理 |
|---:|---:|---:|---:|---|
| 1 | 0 | 6 | 12 | 16 更大，左边界移到 4 |
| 2 | 4 | 6 | 23 | 16 更小，右边界移到 4 |
| 3 | 4 | 4 | 16 | 找到索引 4 |

### C# 最小示例

```csharp
static int BinarySearch(int[] sortedValues, int target)
{
    int left = 0;
    int right = sortedValues.Length - 1;

    while (left <= right)
    {
        // 这种写法避免直接计算 left + right 可能产生的溢出。
        int middle = left + (right - left) / 2;
        int value = sortedValues[middle];

        if (value == target)
        {
            return middle;
        }

        if (value < target)
        {
            left = middle + 1;
        }
        else
        {
            right = middle - 1;
        }
    }

    return -1;
}

int[] values = { 2, 5, 8, 12, 16, 23, 38 }; // 教学示例数据
Console.WriteLine(BinarySearch(values, 16));   // 16 是教学示例目标
```

### 边界与失败情况

- 输入未按比较规则排序时，结果不可信。
- 有重复值时，普通二分只保证找到某一个匹配项，不保证第一个或最后一个。
- `left <= right`、边界移动和中点计算容易出现差一错误。
- 空数组会直接结束循环并返回未找到。
- 若排序使用一种比较规则、查找使用另一种规则，二分前提同样被破坏。

若需要第一个“大于等于目标”的位置，可以把“满足条件的位置”作为答案，并在找到后继续向左收缩。这是二分答案边界，而不是简单的相等查找。

## Top K：只维护当前最重要的 K 个候选

### 为什么需要 Top K

若只需要最大的 `K` 个元素，把全部 `n` 个元素排序需要 `O(n log n)`。

当 `K` 远小于 `n` 时，可以维护一个容量为 `K` 的**最小堆**：

```text
堆顶 = 当前 Top K 中最小的元素
新元素不大于堆顶 -> 不进入 Top K
新元素大于堆顶 -> 移除堆顶，再加入新元素
```

这样每次更新堆的成本为 `O(log K)`，总时间为 `O(n log K)`，额外空间为 `O(K)`。

### 逐步过程

教学示例数据：

```text
7, 2, 9, 4, 12, 6
K = 3
```

| 读入 | 当前保留的三个最大值 |
---:|---|
| 7 | 7 |
| 2 | 2、7 |
| 9 | 2、7、9 |
| 4 | 4、7、9 |
| 12 | 7、9、12 |
| 6 | 7、9、12 |

表格为了阅读按升序展示；堆内部只保证堆顶最小，不保证整体有序。

### C# 最小示例

```csharp
static int[] LargestK(IEnumerable<int> source, int k)
{
    if (k < 0)
    {
        throw new ArgumentOutOfRangeException(nameof(k));
    }

    var minHeap = new PriorityQueue<int, int>();

    foreach (int value in source)
    {
        if (minHeap.Count < k)
        {
            minHeap.Enqueue(value, value);
            continue;
        }

        if (k > 0 && minHeap.TryPeek(out _, out int smallest) && value > smallest)
        {
            minHeap.Dequeue();
            minHeap.Enqueue(value, value);
        }
    }

    var result = new List<int>(minHeap.Count);
    while (minHeap.TryDequeue(out int value, out _))
    {
        result.Add(value);
    }

    return result.ToArray();
}

int[] source = { 7, 2, 9, 4, 12, 6 }; // 教学示例数据
Console.WriteLine(string.Join(", ", LargestK(source, 3))); // 3 是教学示例 K
```

### 边界与失败情况

- `K = 0` 时结果为空，这是示例函数明确支持的输入。
- `K` 大于元素数量时，会返回全部元素。
- “最大”必须有稳定的比较规则；复合对象常需要显式比较键。
- 相同值是否允许重复，属于结果契约。上例保留输入中的重复项。
- 堆输出不是最终排名；需要有序结果时还要排序，增加 `O(K log K)` 成本。
- 数据全部已在内存且 `K` 接近 `n` 时，完整排序可能更简单。

## 并查集：维护不断合并的分组

并查集也叫 Disjoint Set Union，简称 DSU。

### 为什么需要并查集

如果连接关系会不断加入，并且经常要问：

```text
x 和 y 是否已经连通？
把 x 所在组与 y 所在组合并。
```

每次都重新遍历整张图会重复大量工作。并查集为每个集合维护一个代表节点，也叫根。

核心操作：

```text
Find(x)：找到 x 所属集合的根。
Union(a, b)：把两个集合合并。
```

### 树形表示

教学示例初始状态：

```text
0   1   2   3   4
```

执行：

```text
Union(0, 1)
Union(1, 2)
Union(3, 4)
```

形成两个集合：

```text
{0, 1, 2}
{3, 4}
```

此时：

```text
Find(0) == Find(2)  -> 连通
Find(0) != Find(4)  -> 不连通
```

### 路径压缩与按大小合并

若父节点链很长，`Find` 会变慢。

路径压缩在查找根后，让沿途节点直接指向根。按大小合并则把较小的树接到较大的树下，避免树快速变高。

两种优化一起使用时，一系列操作的均摊时间接近常数，严格表示为 `O(α(n))`；`α` 是反阿克曼函数，在常见有限规模下增长极慢。

### C# 最小示例

```csharp
public sealed class DisjointSet
{
    private readonly int[] _parent;
    private readonly int[] _size;

    public DisjointSet(int count)
    {
        if (count < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(count));
        }

        _parent = new int[count];
        _size = new int[count];

        for (int i = 0; i < count; i++)
        {
            _parent[i] = i;
            _size[i] = 1;
        }
    }

    public int Find(int value)
    {
        if (_parent[value] != value)
        {
            // 路径压缩：让当前节点直接连接到根。
            _parent[value] = Find(_parent[value]);
        }

        return _parent[value];
    }

    public bool Union(int left, int right)
    {
        int leftRoot = Find(left);
        int rightRoot = Find(right);

        if (leftRoot == rightRoot)
        {
            return false;
        }

        // 始终把较小的树连接到较大的树。
        if (_size[leftRoot] < _size[rightRoot])
        {
            (leftRoot, rightRoot) = (rightRoot, leftRoot);
        }

        _parent[rightRoot] = leftRoot;
        _size[leftRoot] += _size[rightRoot];
        return true;
    }

    public bool Connected(int left, int right)
    {
        return Find(left) == Find(right);
    }
}

var groups = new DisjointSet(5); // 5 是教学示例元素数量
groups.Union(0, 1);
groups.Union(1, 2);
Console.WriteLine(groups.Connected(0, 2)); // 输出 True
```

### 边界与失败情况

- 上例使用连续整数索引，越界会暴露为异常；其他标识需要先建立映射。
- 并查集擅长“合并”，不擅长删除连接或把集合拆开。
- 它能判断是否同组，但不会直接给出两个节点之间的具体路径。
- 路径压缩会改变内部父子结构，因此不能把父数组误当成原始连接关系。
- 若操作包含动态删除，应重新审视问题模型，而不是给并查集添加未经证明的修补逻辑。

## 动态规划：保存重复子问题的答案

### 为什么需要动态规划

有些问题可以拆成更小问题，但不同分支会反复计算相同子问题。

以教学示例阶梯为例：

```text
每次允许走 1 级或 2 级。
到第 i 级的走法数 =
到第 i - 1 级的走法数 +
到第 i - 2 级的走法数。
```

直接递归会形成大量重复计算。动态规划把子问题答案保存下来，使每个状态只计算一次。

适合动态规划的问题通常同时具有：

- **重叠子问题**：不同路径反复需要同一状态的答案。
- **最优子结构或可组合结构**：大问题答案可以由小问题答案推导。

### 五个设计步骤

```text
1. 定义状态：dp[i] 表示什么？
2. 写转移：当前状态怎样由更小状态得到？
3. 定初值：最小状态的答案是什么？
4. 定顺序：计算当前状态前，依赖是否已算出？
5. 取结果：最终需要哪个状态？
```

### 逐步过程

教学示例定义：

```text
dp[i] = 到达第 i 级的走法数
dp[0] = 1
dp[1] = 1
dp[i] = dp[i - 1] + dp[i - 2]
```

计算教学示例 `4` 级：

| i | 推导 | dp[i] |
|---:|---|---:|
| 0 | 初值 | 1 |
| 1 | 初值 | 1 |
| 2 | 1 + 1 | 2 |
| 3 | 2 + 1 | 3 |
| 4 | 3 + 2 | 5 |

### C# 最小示例

```csharp
static long CountWays(int steps)
{
    if (steps < 0)
    {
        throw new ArgumentOutOfRangeException(nameof(steps));
    }

    if (steps <= 1)
    {
        return 1;
    }

    long twoStepsBack = 1;
    long oneStepBack = 1;

    for (int current = 2; current <= steps; current++)
    {
        // checked 让示例在结果超出 long 范围时显式失败。
        long ways = checked(oneStepBack + twoStepsBack);
        twoStepsBack = oneStepBack;
        oneStepBack = ways;
    }

    return oneStepBack;
}

Console.WriteLine(CountWays(4)); // 4 是教学示例级数，输出 5
```

这里没有保存整个 `dp` 数组，因为当前状态只依赖前两个状态。空间由 `O(n)` 优化为 `O(1)`。

### 记忆化搜索与递推

动态规划常见两种写法：

```text
自顶向下：递归求解，使用缓存避免重复计算。
自底向上：从初始状态开始，按依赖顺序递推。
```

自顶向下只计算实际访问到的状态，表达接近问题定义；但要承担递归调用和栈深度代价。

自底向上没有递归深度问题，状态顺序通常更直观；但可能计算最终答案并不需要的状态。

### 边界与失败情况

- 状态定义含糊时，转移公式即使能运行也可能回答了另一个问题。
- 初始状态遗漏会让后续所有结果偏移。
- 状态间存在循环依赖时，简单递推顺序不成立。
- 不是所有递归都适合动态规划；若子问题不重叠，缓存可能只增加空间。
- 计数或代价可能溢出，需要依据输入范围选择数值类型和溢出策略。
- 局部最优选择不等于动态规划。能否由子问题组合出正确答案，需要证明，而不是凭直觉套公式。

## 四种工具的复杂度

| 工具 | 典型时间复杂度 | 额外空间 | 关键前提 |
|---|---:|---:|---|
| 二分查找 | `O(log n)` | 迭代写法 `O(1)` | 数据按同一比较规则有序 |
| 最小堆求最大 Top K | `O(n log K)` | `O(K)` | 只需保留 K 个极值 |
| 并查集合并/查询 | 均摊 `O(α(n))` | `O(n)` | 主要操作是合并和连通判断 |
| 一维动态规划示例 | `O(n)` | 可优化到 `O(1)` | 状态只依赖前两个状态 |

复杂度只是选择的一部分。输入是否有序、是否流式到达、连接能否删除、状态转移是否成立，才是算法能否正确使用的前提。

## 小结

```text
二分查找用有序性换取每次排除一半。
Top K 用小容量堆避免对全部候选完整排序。
并查集用代表节点维护不断合并的集合。
动态规划用状态复用消除重复子问题。
```

遇到新问题时，可以依次问：

1. 数据是否已经有序，或答案是否具有单调边界？
2. 是否只关心少量最大或最小候选？
3. 是否反复进行集合合并和连通查询？
4. 大问题是否由重复的小问题组合而成？

问题结构与其中一个模型吻合时，再引入对应工具；不要先看到算法名称，再勉强把问题塞进去。
