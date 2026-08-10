# GJK：凸形状碰撞检测理解笔记

分类：算法 / 物理碰撞

状态：理解笔记，后续可继续深入 Simplex 更新、EPA 和具体代码实现。

## GJK 解决什么问题

GJK 全名：

```text
Gilbert-Johnson-Keerthi
```

它主要用于判断：

```text
两个凸形状是否相交。
```

常见对象：

```text
凸多边形
凸多面体
盒子
胶囊体
凸包
```

它和 SAT 一样，主要处理凸形状。

区别可以先这样记：

```text
SAT：找分离轴。
GJK：看闵可夫斯基差 A - B 是否包含原点。
```

## 跟着代码算出第一个 Support 点

先实现最基础的“沿某方向找最远顶点”：

```csharp
using System;
using System.Collections.Generic;
using System.Numerics;

static Vector2 Furthest(Vector2[] vertices, Vector2 direction)
{
    Vector2 best = vertices[0];
    float bestDot = Vector2.Dot(best, direction);

    for (int i = 1; i < vertices.Length; i++)
    {
        float dot = Vector2.Dot(vertices[i], direction);
        if (dot > bestDot)
        {
            best = vertices[i];
            bestDot = dot;
        }
    }

    return best;
}

static Vector2 MinkowskiSupport(
    Vector2[] shapeA,
    Vector2[] shapeB,
    Vector2 direction)
{
    return Furthest(shapeA, direction)
         - Furthest(shapeB, -direction);
}
```

两个正方形左右分开：

```csharp
Vector2[] a =
{
    new(-1, -1), new(1, -1),
    new( 1,  1), new(-1, 1)
};

Vector2[] b =
{
    new(2, -1), new(4, -1),
    new(4,  1), new(2, 1)
};

Vector2 direction = Vector2.UnitX;
Vector2 support = MinkowskiSupport(a, b, direction);

Console.WriteLine(support);                    // <-1, 0>
Console.WriteLine(Vector2.Dot(support, direction)); // -1
```

沿右方向计算时：

```text
A 在 +X 最远的点 x = 1
B 在 -X 最远的点 x = 2
A - B 的 support.x = 1 - 2 = -1
```

Support 点在原点左侧，且沿搜索方向的点积仍小于 0。这说明闵可夫斯基差在这个方向到不了原点，可以提前判定两个形状不相交。

## 第二步：让两个方块发生重叠

把 B 左移：

```csharp
b = new[]
{
    new Vector2(0.5f, -1), new Vector2(2.5f, -1),
    new Vector2(2.5f,  1), new Vector2(0.5f,  1)
};

support = MinkowskiSupport(a, b, Vector2.UnitX);
Console.WriteLine(support); // <0.5, 0>
```

现在点积为正，只能说明沿这个方向没有立即找到分离证据，**不能只凭一个点判定相交**。GJK 接下来会把 Support 点加入 Simplex，并把搜索方向转向原点：

```csharp
List<Vector2> simplex = new() { support };
direction = -support;
```

后续迭代反复执行：

```text
1. 沿 direction 取新的 Minkowski Support
2. 新点沿 direction 仍越不过原点 -> 不相交
3. 否则把点加入 Simplex
4. 根据点、线段或三角形中离原点最近的区域更新 Simplex
5. Simplex 包含原点 -> 相交
```

### 用日志观察一次迭代

```csharp
for (int iteration = 0; iteration < maxIterations; iteration++)
{
    Vector2 point = MinkowskiSupport(a, b, direction);
    float progress = Vector2.Dot(point, direction);

    Console.WriteLine(
        $"iter={iteration}, dir={direction}, " +
        $"support={point}, dot={progress}");

    if (progress < 0f)
        return false;

    simplex.Add(point);

    if (UpdateSimplexAndDirection(simplex, ref direction))
        return true;
}
```

`UpdateSimplexAndDirection` 是 GJK 最容易写错的部分：它要根据 Simplex 的 Voronoi 区域删点、换方向，并判断原点是否被包围。教学时可以继续沿后文的一维、二维图理解；项目里应使用经过验证的物理库实现，并为重合点、零方向和迭代上限保留测试，而不是只复制这段循环骨架。

## 原点不是选出来的

GJK 里的原点不是算法随便选的点。

2D 里原点是：

```text
(0, 0)
```

3D 里原点是：

```text
(0, 0, 0)
```

它不是：

```text
A 的中心
B 的中心
两个物体中点
碰撞点
某个顶点
```

GJK 之所以看原点，是因为：

```text
如果 A 和 B 有相同位置的点 p，
那么 p - p = 0。
```

也就是说：

```text
A 和 B 相交
= 存在 a == b
= 存在 a - b == 0
= A - B 包含原点
```

## 一维例子

A 是线段：

```text
A = [2, 5]
```

B 是线段：

```text
B = [4, 7]
```

它们重叠：

```text
重叠区间是 [4, 5]
```

A - B 的范围：

```text
最小：2 - 7 = -5
最大：5 - 4 = 1
```

所以：

```text
A - B = [-5, 1]
```

里面包含 0。

因为可以取：

```text
a = 4.5
b = 4.5
```

那么：

```text
a - b = 0
```

所以 A 和 B 相交。

## 二维例子

A 是正方形：

```text
x: 0 ~ 2
y: 0 ~ 2
```

B 是正方形：

```text
x: 1 ~ 3
y: 1 ~ 3
```

它们有重叠区域：

```text
x: 1 ~ 2
y: 1 ~ 2
```

可以取重叠点：

```text
a = (1.5, 1.5)
b = (1.5, 1.5)
```

那么：

```text
a - b = (0, 0)
```

所以 A - B 包含原点。

如果换成不相交的 B：

```text
B:
x: 4 ~ 6
y: 1 ~ 3
```

A - B 的 x 范围：

```text
0 - 6 = -6
2 - 4 = -2
```

也就是：

```text
x: -6 ~ -2
```

这个范围不包含 0，所以 A - B 不包含原点，A 和 B 不相交。

## 三维里不是只看 x/y/z

容易误解的一点：

```text
三维里是不是只要 x、y、z 三个方向的差值集合都包含 0，就相交？
```

不是。

这对 AABB 这种轴对齐盒子可以成立，因为 AABB 只需要检查 x/y/z 三个轴的范围。

但对一般 3D 凸形状，只看 x/y/z 不够。

正确理解是：

```text
GJK 看的是三维空间里的 A - B 整个差集体，是否包含原点 (0,0,0)。
```

不是分别看：

```text
x 轴包含 0
y 轴包含 0
z 轴包含 0
```

因为三个轴投影都有重叠，只能说明：

```text
从 x/y/z 三个方向看，它们范围重叠。
```

但从某个斜方向看，两个物体仍然可能分开。

## Support 点是什么

GJK 不会真的生成完整的 A - B。

如果 A 有 100 个顶点，B 有 100 个顶点，完整差集需要：

```text
100 * 100 = 10000 个差值点
```

GJK 每次只问：

```text
A - B 在当前方向上最远的点在哪里？
```

这个点叫 Support 点。

计算方式：

```text
Support(A, B, dir)
= A 在 dir 方向上的最远点
- B 在 -dir 方向上的最远点
```

伪代码：

```csharp
Vector3 Support(Shape a, Shape b, Vector3 dir)
{
    Vector3 pointA = a.FarthestPoint(dir);
    Vector3 pointB = b.FarthestPoint(-dir);

    return pointA - pointB;
}
```

## 当前方向上最远点怎么找

最朴素的做法是：

```text
对所有顶点做点积。
谁的 dot(point, dir) 最大，谁就是这个方向上的最远点。
```

例如 2D 三角形：

```text
P1 = (0, 0)
P2 = (2, 0)
P3 = (1, 2)
```

方向：

```text
dir = (1, 1)
```

点积：

```text
dot(P1, dir) = 0
dot(P2, dir) = 2
dot(P3, dir) = 3
```

所以当前方向最远点是：

```text
P3 = (1, 2)
```

3D 也是一样：

```text
dot = x * dx + y * dy + z * dz
```

谁的 dot 最大，谁就是当前方向最远点。

## 每次都要跑所有点吗

朴素实现里，是的。

一次 Support 查询：

```text
A：遍历 n 个顶点，找 dir 方向最远点。
B：遍历 m 个顶点，找 -dir 方向最远点。
```

所以一次 Support 是：

```text
O(n + m)
```

如果 GJK 迭代 k 次，大概是：

```text
O(k * (n + m))
```

但它不是：

```text
O(n * m)
```

因为它没有把所有 `a - b` 都列出来。

实际引擎会优化 Support：

```text
球体：center + normalize(dir) * radius
盒子：根据 dir 的正负快速选角点
凸包：用邻接信息从上次最远点开始爬山
缓存：复用上一帧或上次查询的极点
Broad Phase：先过滤掉大量不可能碰撞的对象
```

## 方向是怎么选的

GJK 的方向不是随便选一条边。

方向来自：

```text
当前 Simplex 和原点的位置关系。
```

GJK 的目标是：

```text
判断 A - B 是否包含原点。
```

所以每一步都在问：

```text
当前 Simplex 离包住原点还差哪个方向的信息？
```

2D 里：

```text
点：朝点到原点的方向继续找。
线段：朝线段到原点的最近方向继续找。
三角形：如果包住原点，碰撞；否则保留靠近原点的边继续找。
```

3D 里：

```text
点：朝原点方向。
线段：朝线段到原点的最近方向。
三角形：看原点在三角形哪一侧，朝那一侧继续找。
四面体：如果原点在内部，碰撞；否则保留原点所在外侧相关面继续找。
```

所以：

```text
SAT 是枚举轴。
GJK 是动态追原点。
```

## Simplex 是什么

Simplex 是 GJK 当前收集到的少量 Support 点组成的小形状。

2D 里 Simplex 可能是：

```text
点
线段
三角形
```

如果三角形包住原点：

```text
碰撞
```

3D 里 Simplex 可能是：

```text
点
线段
三角形
四面体
```

如果四面体包住原点：

```text
碰撞
```

注意：

```text
不是原物体必须是四面体。
```

而是 GJK 在闵可夫斯基差边界上找到的几个 Support 点，在 3D 里组成四面体。

只要这个四面体包住原点，就说明 A - B 包含原点。

## 最重要的收获

```text
GJK 用于判断两个凸形状是否相交。
它把问题变成：A - B 是否包含原点。
原点不是选出来的，而是坐标系里的 0。
因为重叠点 p - p = 0。
GJK 不生成完整 A - B，而是用 Support 函数逐步找边界点。
朴素 Support 每次是 O(n + m)，不是 O(n * m)。
2D 中三角形 Simplex 包住原点即可判定碰撞。
3D 中四面体 Simplex 包住原点即可判定碰撞。
```
