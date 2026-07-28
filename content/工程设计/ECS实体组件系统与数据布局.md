# ECS：实体、组件、系统与数据布局

分类：工程设计

## 生活化模型：仓库、货箱与作业站

想象一个大型仓库：

```text
货箱编号：只负责标识某个货箱。
货箱标签：记录重量、温度要求、目的地等数据。
作业站：批量处理带有特定标签的货箱。
货架布局：决定同类货箱怎样排列，影响查找和搬运效率。
```

对应到 ECS：

```text
Entity：身份。
Component：数据。
System：按组件条件批量执行逻辑。
Storage：组件在内存中的组织方式。
```

ECS 的核心不只是“用组件代替继承”，还包括：

```text
让处理逻辑围绕数据查询组织。
让数据布局与访问模式可以被明确设计。
```

## 通用概念与具体框架边界

ECS 是一组架构思想，不是只有一种标准实现。

通用概念通常包括：

```text
Entity 提供稳定身份。
Component 描述某一方面的数据。
System 查询满足条件的实体并处理组件。
结构变化指添加或移除组件、创建或销毁实体。
```

具体框架会选择：

```text
Entity ID 的编码方式。
Component 是否允许行为。
查询怎样缓存。
结构变化何时提交。
是否允许并行 System。
采用 archetype、sparse-set 或混合存储。
```

不能把某个框架的限制写成 ECS 的普遍定义。

## 职责图

```text
              ┌──────────────────┐
              │      Entity      │
              │ ID + generation  │
              └────────┬─────────┘
                       │ 关联
          ┌────────────┼────────────┐
          ▼            ▼            ▼
     Position      Velocity       Health
     Component     Component      Component
          └────────────┬────────────┘
                       │ 被查询
                       ▼
              ┌──────────────────┐
              │      System      │
              │ Query + Process  │
              └────────┬─────────┘
                       │ 访问
                       ▼
              ┌──────────────────┐
              │ Component Storage│
              │ 数据布局与索引    │
              └──────────────────┘
```

Entity 并不一定是一个包含全部 Component 的对象引用。许多实现中，它只是能定位存储的轻量标识。

## Entity：身份与代次

Entity 常用整数 ID 表示，但只使用可复用 ID 会产生陈旧引用：

```text
实体 ID 7 被销毁。
后来新实体复用了 ID 7。
旧引用误把新实体当成原实体。
```

一种常见解决方式是组合：

```text
Entity = index + generation
```

销毁并复用槽位时 generation 改变。访问组件前同时验证 index 与 generation。

这是一种常见选择，不是唯一实现。也可以使用不复用 ID、句柄表或其他身份方案。

## Component：围绕访问组织数据

Component 适合表达：

```text
位置。
速度。
生命值。
阵营。
可渲染数据。
某种状态标签。
```

组件粒度应服务于查询和更新方式。

过粗：

```text
一个大组件包含大量很少一起访问的字段。
System 每次加载无关数据。
变化追踪和并行写入范围扩大。
```

过细：

```text
组件数量和查询组合迅速增加。
结构变化更频繁。
元数据与调度复杂度上升。
```

“组件只能有数据、绝不能有任何方法”是某些实现的规则，不是所有 ECS 的共同定义。关键是数据所有权和 System 访问边界清晰。

## System：查询并批量处理

移动 System 可能声明：

```text
读取 Velocity。
读写 Position。
排除 Frozen。
```

然后批量处理所有匹配实体：

```text
for each entity with Position and Velocity and without Frozen:
    Position += Velocity * deltaTime
```

这里的 `deltaTime` 来自调度上下文，不应在 System 内凭空硬编码。

明确读写集合还能帮助框架判断：

```text
哪些 System 可以并行。
哪些 System 存在写写或读写冲突。
哪些查询需要更新。
```

## Archetype 布局

Archetype 按“组件集合完全相同”对实体分组。

例如：

```text
Archetype A：Position + Velocity
Archetype B：Position + Velocity + Health
Archetype C：Position + Renderable
```

每个 Archetype 内可以把同类组件紧密存储，以便 System 顺序访问。

### 优点

```text
同一查询常能连续遍历匹配数据。
数据局部性较好。
批处理和向量化更容易。
组件集合本身就是快速筛选条件。
```

### 代价

添加或移除组件会改变实体所属 Archetype：

```text
从旧 Archetype 复制保留组件。
在新 Archetype 写入新增组件。
更新 Entity 的位置记录。
从旧位置移除。
```

结构变化频繁时，搬迁成本和命令缓冲管理会变得重要。

## Sparse-set 布局

Sparse-set 常为某种 Component 维护：

```text
sparse：Entity index → dense 位置。
denseEntities：紧密排列的 Entity。
denseComponents：与 denseEntities 对齐的组件数据。
```

查询某实体是否拥有组件时，可以通过 sparse 索引快速验证；遍历某种组件时可以顺序扫描 dense 数组。

### 优点

```text
单组件添加、移除和成员判断直接。
组件池彼此独立。
对稀疏拥有的组件较自然。
```

### 代价

```text
多组件查询需要选择一个池驱动遍历，再检查其他池。
多个组件数组不一定以相同实体顺序排列。
移除时的 swap-back 可能改变 dense 顺序。
跨多个组件的内存局部性取决于实现和查询。
```

Sparse-set 也有许多变体，不能假定所有实现都用相同删除策略。

## Archetype 与 Sparse-set 的取舍

| 关注点 | Archetype 常见倾向 | Sparse-set 常见倾向 |
|---|---|---|
| 多组件批量遍历 | 同签名数据集中 | 由一个池驱动并检查其他池 |
| 添加/移除组件 | 可能跨 Archetype 搬迁 | 更新独立组件池 |
| 单组件成员判断 | 通过实体位置与签名 | sparse 索引直接定位 |
| 数据局部性 | 同一 Archetype 内较集中 | 每种组件各自紧密 |
| 实现复杂度 | Chunk、迁移、查询缓存 | 多池连接与顺序一致性 |

这不是绝对性能结论。真实结果取决于：

```text
组件大小。
查询组合。
结构变化频率。
Chunk 容量与对齐。
实体数量。
硬件缓存。
调度方式。
```

还有表式存储、位集合索引、关系型 ECS 和混合布局等选择。Archetype 与 sparse-set 不是二选一的唯一世界。

## 逐步状态：添加一个组件

以 Archetype 存储为**教学示例**：

```text
初始：
Entity E 属于 [Position, Velocity]

命令：
Add Health to E

步骤 1：
验证 E 的 generation 仍有效

步骤 2：
找到或创建 [Position, Velocity, Health] Archetype

步骤 3：
在目标存储分配位置

步骤 4：
复制 Position、Velocity，初始化 Health

步骤 5：
更新 E → 新位置映射

步骤 6：
从旧存储移除 E

完成：
查询结果在安全提交点刷新
```

初始化 `Health` 的值必须来自调用参数或明确规则，不能由存储层猜测。

### 可交互面板

可以显示：

```text
Entity 的 index 与 generation。
当前组件签名。
源存储和目标存储。
每个 System 的读写集合。
结构变更命令队列。
提交前后查询结果。
本次搬迁的字节量。
```

切换为 sparse-set 后，可以观察同一次 Add 如何变成独立池插入，而不是 Archetype 搬迁。

## 为什么结构变化常延迟提交

System 正在遍历集合时立即添加、删除实体，可能导致：

```text
迭代器失效。
跳过或重复处理元素。
Chunk 搬迁改变当前指针。
并行任务同时修改索引。
```

一种常见做法是使用结构变更命令缓冲：

```text
System 遍历时记录 Create / Destroy / Add / Remove。
到明确同步点后统一验证并提交。
```

延迟提交是常见实现选择，不是所有 ECS 的强制规则。支持稳定迭代器或专门并发结构的实现可能采用其他方法。

## 最小 C# 示例：带 generation 的实体句柄

下面示例只演示身份验证，不是完整 ECS：

```csharp
public readonly record struct Entity(int Index, int Generation);

public sealed class EntityTable
{
    private readonly List<int> _generations = new();
    private readonly Stack<int> _freeIndices = new();
    private readonly HashSet<int> _alive = new();
    private readonly int _initialGeneration;

    public EntityTable(int initialGeneration)
    {
        _initialGeneration = initialGeneration;
    }

    public Entity Create()
    {
        int index;

        if (_freeIndices.Count > 0)
        {
            index = _freeIndices.Pop();
        }
        else
        {
            index = _generations.Count;
            _generations.Add(_initialGeneration);
        }

        _alive.Add(index);
        return new Entity(index, _generations[index]);
    }

    public void Destroy(Entity entity)
    {
        RequireAlive(entity);
        _alive.Remove(entity.Index);
        _generations[entity.Index] =
            checked(_generations[entity.Index] + 1);
        _freeIndices.Push(entity.Index);
    }

    public void RequireAlive(Entity entity)
    {
        bool indexExists =
            entity.Index >= 0 && entity.Index < _generations.Count;

        if (!indexExists ||
            !_alive.Contains(entity.Index) ||
            _generations[entity.Index] != entity.Generation)
        {
            throw new InvalidOperationException("Stale or invalid entity.");
        }
    }
}
```

示例把初始 generation 作为构造参数交给身份规则提供者，不在存储内部猜测。溢出使用 `checked` 暴露错误，不静默复用。

完整 ECS 还需要：

```text
Component 类型注册。
存储与查询。
结构变化提交。
并发访问规则。
序列化与版本迁移。
错误传播和诊断。
```

## 正常路径

```text
创建 Entity 并获得有效 generation。
按明确输入添加 Components。
查询匹配到该 Entity。
System 按声明的读写权限批量处理。
结构变化在安全点提交。
销毁后 generation 改变，旧句柄失效。
```

## 边界路径

```text
查询结果为空。
实体只有标签组件，没有数据字段。
多个 Entity 拥有相同组件组合。
System 只读同一组件，可以并行调度。
同一帧先 Add 后 Remove 同一种组件。
结构变更命令引用了稍早已销毁的 Entity。
组件数据跨 Chunk 边界。
```

同一帧冲突命令的先后规则必须明确，不能由容器偶然顺序决定。

## 失败路径

```text
旧 Entity 句柄命中新复用的 index。
遍历期间直接搬迁当前 Entity，导致迭代失效。
两个 System 未声明写冲突却并发修改同一数据。
添加组件时使用未经定义的默认业务值。
Component 引用在结构迁移后仍被长期持有。
Archetype 查询缓存未随结构变化更新。
Sparse-set 的 sparse 与 dense 映射失配。
序列化数据的组件版本无法迁移。
```

失败应该携带 Entity、Component 类型和操作阶段。不能在组件缺失时静默返回一个可写默认对象。

## 代价与复杂度

常见成本可以拆成：

```text
查询匹配成本。
组件顺序遍历成本。
Entity 到存储位置的间接寻址。
结构变化与数据搬迁。
查询缓存维护。
System 同步和任务调度。
空 Chunk 与容量预留造成的内存浪费。
```

对匹配到的 `N` 个实体做一次线性 System 更新，处理本身通常至少是：

```text
O(N)
```

但总成本还包括找到这些实体和结构管理。

Sparse-set 的成员判断与单组件插入、删除常可设计为平均常数时间；Archetype 的签名定位也可通过哈希或索引加速。但实际常数、搬迁字节量和缓存命中往往比大 O 表达更重要。

## 最重要的收获

```text
Entity 是身份，Component 是数据，System 是批量逻辑。
Entity generation 可以阻止旧句柄误命中新实体。
数据布局必须围绕真实查询和结构变化频率选择。
Archetype 擅长聚合同签名数据，但增删组件可能搬迁。
Sparse-set 让独立组件池定位直接，但多组件连接有代价。
没有一种 ECS 存储布局适合所有访问模式。
结构变化、并发权限和失败可见性与数据布局同样重要。
```
