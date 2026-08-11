# 物理碰撞检测基础：Broad Phase、AABB、OBB、BVH 与 SAT

分类：算法 / 数据结构 / 游戏逻辑常用模式

## 先说结论

碰撞检测分阶段，是因为“快速排除绝大多数不可能碰撞的对象”比“对所有对象都做精确几何计算”更划算。Broad Phase 产生候选对，Narrow Phase 再用 AABB、OBB、SAT 或其他形状算法确认。

### 1000 个物体为什么不能全配对

```text
1000 个物体的无序两两组合：
1000 * 999 / 2 = 499,500 对

Broad Phase 假设缩到 120 对：
Narrow Phase 只需精判 120 次
```

120 是示意值，不是固定比例。若所有物体都堆在一个小区域，Broad Phase 也会产生大量候选；它保证的是不漏掉可能碰撞对，而不是保证候选永远很少。

## 碰撞检测为什么要分阶段

物理碰撞检测解决的是：

```text
场景里有很多物体，怎么高效判断谁和谁碰撞。
```

如果有 1000 个物体，直接两两检测大概需要：

```text
1000 * 999 / 2 = 499500 次
```

每帧都这样做会很贵。

所以物理引擎通常分成两步：

```text
Broad Phase：宽阶段，快速筛出可能碰撞的物体对。
Narrow Phase：窄阶段，对候选物体对做精确碰撞检测。
```

一句话：

```text
Broad Phase 负责少算。
Narrow Phase 负责算准。
```

## 跟着代码筛一次碰撞对

先用二维 AABB 跑通宽阶段。把包围盒类型放在 `Aabb.cs`：

```csharp
using System.Numerics;

readonly record struct Aabb(Vector2 Min, Vector2 Max)
{
    public bool Overlaps(Aabb other)
    {
        bool separated =
            Max.X < other.Min.X ||
            Min.X > other.Max.X ||
            Max.Y < other.Min.Y ||
            Min.Y > other.Max.Y;

        return !separated;
    }
}
```

准备三个物体：

```csharp
using System;
using System.Numerics;

Aabb player = new(
    new Vector2(0, 0),
    new Vector2(2, 2));

Aabb enemy = new(
    new Vector2(1, 1),
    new Vector2(3, 3));

Aabb tree = new(
    new Vector2(10, 10),
    new Vector2(12, 12));

Console.WriteLine(player.Overlaps(enemy)); // True
Console.WriteLine(player.Overlaps(tree));  // False
```

`player` 与 `enemy` 在 X、Y 两个方向都有重叠，所以进入候选；`tree` 在 X 方向已经完全分开，不需要继续做精确形状检测。

### 第二步：从所有组合中收集候选对

```csharp
var bodies = new[]
{
    (Name: "Player", Bounds: player),
    (Name: "Enemy", Bounds: enemy),
    (Name: "Tree", Bounds: tree)
};

for (int i = 0; i < bodies.Length; i++)
{
    for (int j = i + 1; j < bodies.Length; j++)
    {
        if (!bodies[i].Bounds.Overlaps(bodies[j].Bounds))
            continue;

        Console.WriteLine(
            $"候选对: {bodies[i].Name} - {bodies[j].Name}");
    }
}
```

输出只有：

```text
候选对: Player - Enemy
```

注意它仍然叫“候选对”。AABB 重叠不保证内部的旋转多边形真的接触，只保证它们**可能**接触。

### 第三步：只对候选对做窄阶段

```csharp
foreach ((Shape A, Shape B) pair in broadPhasePairs)
{
    CollisionResult result = Sat.Test(pair.A, pair.B);

    if (result.Intersects)
        Resolve(pair, result.Normal, result.Depth);
}
```

这段是项目接口示意：`broadPhasePairs` 来自宽阶段；`Sat.Test` 才检查凸形状在各条候选轴上的投影；只有确认相交后才进入响应。

完整运行链是：

```text
3 个物体产生 3 个两两组合
-> AABB 快速排除 Player-Tree、Enemy-Tree
-> 只把 Player-Enemy 送入 SAT
-> SAT 返回是否相交、法线和穿透深度
-> 响应层决定推开、反弹或触发事件
```

后文的 OBB、BVH 和 SAT 分别改进包围体精度、候选查询效率和窄阶段准确性，但不会改变“先少算，再算准”的调用顺序。

## Broad Phase

Broad Phase 不追求精确。

它只回答：

```text
这两个物体有没有可能碰撞？
```

如果两个物体明显离得很远，就直接排除。

常见做法：

```text
AABB 粗包围
空间 Hash / 网格
四叉树 / 八叉树
BVH
Sweep and Prune
```

它的核心目标是：

```text
用便宜判断，排除大量不可能碰撞的对象。
```

## Narrow Phase

Narrow Phase 处理 Broad Phase 筛出来的候选对。

Broad Phase 只会说：

```text
它们可能碰撞。
```

Narrow Phase 才会确认：

```text
它们是不是真的碰撞。
```

并且计算碰撞信息：

```text
碰撞点
碰撞法线
穿透深度
最小分离方向
```

常见精确检测包括：

```text
球和球
胶囊体和胶囊体
AABB 和 AABB
OBB 和 OBB
凸多边形和凸多边形
三角形网格
```

可能用到的算法：

```text
SAT
GJK
EPA
CCD
```

## AABB

AABB 全名：

```text
Axis-Aligned Bounding Box
轴对齐包围盒
```

它的边永远和世界坐标轴对齐。

2D 里可以理解成一个不旋转的矩形：

```text
+---------+
|         |
|  物体    |
|         |
+---------+
```

3D 里通常用两个点表示：

```text
minX, minY, minZ
maxX, maxY, maxZ
```

判断两个 AABB 是否相交很便宜：

```csharp
bool Intersects(AABB a, AABB b)
{
    if (a.Max.x < b.Min.x || a.Min.x > b.Max.x) return false;
    if (a.Max.y < b.Min.y || a.Min.y > b.Max.y) return false;
    if (a.Max.z < b.Min.z || a.Min.z > b.Max.z) return false;

    return true;
}
```

优点：

```text
判断快
实现简单
适合 Broad Phase
```

缺点：

```text
不会跟着物体旋转
旋转物体可能包得很松
误报较多
```

误报没关系，因为后面还有 Narrow Phase 精筛。

## Unity 里的 Bounds

Unity 里的：

```csharp
Renderer.bounds
Collider.bounds
Bounds.Intersects(...)
```

这些 `Bounds` 是世界空间 AABB。

也就是说：

```text
它永远和世界坐标轴对齐。
```

物体旋转后，`bounds` 可能变大，因为 Unity 要用一个不旋转的盒子把它包住。

注意：

```text
Collider.bounds 是包围盒。
Collider 本身的真实碰撞形状不一定是 AABB。
```

例如 `BoxCollider` 会跟随 Transform 旋转，从碰撞形状上更接近 OBB。

Unity 3D 物理主要由 PhysX 处理：

```text
Broad Phase 用粗包围结构筛候选。
Narrow Phase 对 BoxCollider、SphereCollider、CapsuleCollider、MeshCollider 等具体形状做精确检测。
```

Unity 2D 物理则主要由 Box2D 处理。

## OBB

OBB 全名：

```text
Oriented Bounding Box
有方向包围盒
```

它可以跟着物体旋转。

AABB 包旋转长条可能是：

```text
+-------------+
|      /      |
|     /       |
|    /        |
+-------------+
```

OBB 更贴合：

```text
   +---+
  /   /
 /   /
+---+
```

优点：

```text
比 AABB 更贴合旋转物体
误报更少
```

缺点：

```text
判断更复杂
性能比 AABB 贵
通常需要 SAT 这类算法
```

可以粗略记：

```text
AABB：便宜但粗。
OBB：更贴合但更贵。
```

## BVH

BVH 全名：

```text
Bounding Volume Hierarchy
包围体层次结构
```

它不是一种盒子，而是一种组织方式。

核心思想：

```text
用大包围盒包住一组小包围盒。
再用更大的包围盒包住更多组。
形成一棵树。
```

例如：

```text
Root 包住全部
├── Left 包住 A B C D
│   ├── 包住 A B
│   └── 包住 C D
└── Right 包住 E F G H
    ├── 包住 E F
    └── 包住 G H
```

查询时，如果和某个大包围盒不相交，就可以跳过整个子树。

BVH 的价值是：

```text
一次排除一大片对象。
```

常见用途：

```text
射线检测
三角形网格碰撞
物理引擎 Broad Phase
渲染加速
光线追踪
场景查询
```

AABB / OBB 是：

```text
用什么形状包住物体。
```

BVH 是：

```text
怎么把这些包围体组织成层级结构。
```

## SAT

SAT 全名：

```text
Separating Axis Theorem
分离轴定理
```

常用于：

```text
凸多边形碰撞
旋转矩形碰撞
OBB 碰撞
```

它的核心是：

```text
如果两个凸形状没有相交，一定存在一条轴，让它们投影到这条轴后互不重叠。
```

反过来：

```text
如果所有候选轴上的投影都重叠，那么两个形状相交。
```

## SAT 的投影

对某条轴 `axis`，把形状的所有顶点投影上去：

```csharp
float value = Vector2.Dot(point, axis);
```

对所有顶点取最小和最大值：

```text
[min, max]
```

这就是形状在这条轴上的投影区间。

如果两个区间不重叠：

```csharp
if (aMax < bMin || bMax < aMin)
{
    return false;
}
```

说明找到分离轴，不碰撞。

如果所有候选轴都重叠，说明碰撞。

## SAT 流程

伪代码：

```csharp
bool Intersects(Polygon a, Polygon b)
{
    foreach (var axis in GetAxes(a, b))
    {
        Project(a, axis, out float aMin, out float aMax);
        Project(b, axis, out float bMin, out float bMax);

        if (aMax < bMin || bMax < aMin)
        {
            return false;
        }
    }

    return true;
}
```

候选轴通常来自：

```text
多边形每条边的法线方向。
```

两个 2D 旋转矩形通常检查：

```text
A 的两个局部轴
B 的两个局部轴
```

两个 3D OBB 通常最多检查 15 个轴：

```text
A 的 3 个局部轴
B 的 3 个局部轴
A 的轴和 B 的轴两两叉乘得到的 9 个轴
```

## 进阶：SAT 的限制

SAT 适合凸形状。

例如：

```text
矩形
三角形
六边形
凸包
```

不适合直接处理凹形状：

```text
L 形
U 形
星形
```

凹形状通常要先拆成多个凸形状，再分别检测。

## SAT 还能得到穿透方向

如果所有轴都重叠，可以记录每条轴上的重叠长度。

重叠长度最小的轴通常就是最小分离方向：

```text
MTV：Minimum Translation Vector
```

它可以用于：

```text
把两个物体沿最小方向分开。
计算碰撞法线。
估计穿透深度。
```

## 知识总结

碰撞检测流程：

```text
碰撞检测通常分 Broad Phase 和 Narrow Phase。Broad Phase 用 AABB、空间划分、BVH、Sweep and Prune 等方法快速筛出可能碰撞的对象对，目标是减少候选数量。Narrow Phase 再对候选对做精确形状检测，比如球、胶囊体、OBB、凸多边形，可能用 SAT、GJK 等算法。确认碰撞后，会生成碰撞点、法线、穿透深度等信息，后续交给物理求解器或游戏逻辑处理。
```

AABB、OBB 与 BVH：

```text
AABB 是轴对齐包围盒，判断便宜但对旋转物体包得较松；OBB 是有方向包围盒，可以跟随物体旋转，包得更紧但检测更贵；BVH 是包围体层次结构，用一棵包围盒树组织对象，可以快速跳过大量不相交对象。
```

SAT：

```text
SAT 用于凸形状碰撞检测。它会把两个形状投影到候选分离轴上，如果任意一条轴上的投影区间不重叠，就说明不碰撞；如果所有候选轴上都重叠，就说明碰撞。候选轴通常来自多边形边的法线方向，也可以通过最小重叠轴得到碰撞法线和穿透深度。
```

## 最重要的收获

```text
Broad Phase 负责少算。
Narrow Phase 负责算准。
AABB 便宜但粗。
OBB 更贴合但更贵。
BVH 用层级包围盒一次跳过一大片对象。
SAT 通过寻找分离轴判断凸形状是否碰撞。
```
