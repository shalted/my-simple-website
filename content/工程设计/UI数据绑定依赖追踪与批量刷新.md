# UI 数据绑定：依赖追踪与批量刷新

分类：工程设计 / UI 架构

## 先说结论

UI 数据绑定应记录“哪个显示结果依赖哪些源数据”，源数据变化时只标记相关绑定，再在统一刷新点合并更新。它不是每个字段一变就立即递归刷新整棵 UI。

### 同一帧三次变化只刷新一次

```text
Gold：100 -> 120 -> 90
绑定文本："金币：{Gold}"
同一帧 dirty 记录：Gold
帧末刷新一次，最终显示：金币：90
```

中间值 120 没有被渲染，但业务状态变化仍可由日志或事件记录。若绑定表达式是 `IsVip ? VipPrice : NormalPrice`，依赖集合还会随条件改变，这类动态依赖需要重新收集。

## 这篇文章深化什么

虚拟列表解决的是：

```text
数据很多时，只创建和更新当前可见的少量 UI 项。
```

但“只保留可见项”之后，还有另一个问题：

```text
数据发生变化时，究竟哪些 UI 需要重算？
同一轮连续变化时，怎样避免反复刷新？
派生字段之间有依赖时，刷新顺序怎样确定？
```

这篇文章是在虚拟列表基础上，继续深入：

```text
数据绑定
依赖追踪
脏标记合并
批量刷新
刷新失败的可见性
```

它不替代虚拟化。两者职责不同：

```text
虚拟列表减少“同时存在多少视图”。
依赖追踪减少“数据变化后刷新哪些绑定”。
批量刷新减少“同一轮变化重复刷新多少次”。
```

## 先用账单看板理解问题

想象墙上有一块家庭账单看板：

```text
商品数量
商品单价
商品小计
全部商品总价
折扣
应付金额
```

如果某件商品数量从 1 连续改成 2、3、4：

```text
数量显示需要更新
该商品小计需要更新
总价需要更新
应付金额需要更新
```

但商品名称、图片、说明没有变化，不应一起重绘。

如果每次按键都立刻让所有字段刷新：

```text
数量刷新三次
小计刷新三次
总价刷新三次
应付金额刷新三次
```

而如果把同一轮修改先收集起来：

```text
数量最终为 4
相关绑定各刷新一次
```

这就是依赖追踪和批量刷新的生活化模型：

```text
先知道谁依赖谁。
变化时只标脏。
在明确的刷新边界统一重算。
```

## 数据绑定不是简单赋值

最简单的绑定像这样：

```text
nameText.text = item.Name
```

真正的绑定系统还要回答：

```text
数据源是谁？
读取了数据源的哪个字段？
结果写到哪个 UI 属性？
字段变化后由谁通知？
一个绑定依赖多个字段时怎样追踪？
绑定执行失败时怎样报告？
```

可以把一条绑定表示为：

```text
Binding =
    Source dependencies
    + Evaluate
    + Apply
    + Lifetime
```

例如：

```text
应付金额文本
  依赖：总价、折扣
  计算：总价 - 折扣
  写入：amountText.text
  生命周期：当前页面实例
```

## 依赖图

把数据和绑定画成图：

```text
Quantity ──┐
           ├─> ItemSubtotal ──┐
UnitPrice ─┘                  │
                              ├─> Total ──┐
OtherSubtotals ───────────────┘           ├─> PayableText
Discount ─────────────────────────────────┘
```

节点可以是：

```text
原始字段
派生字段
绑定表达式
UI 属性
```

边表示：

```text
目标计算依赖源值。
```

当 `Quantity` 变化时，失效传播路径是：

```text
Quantity
-> ItemSubtotal
-> Total
-> PayableText
```

依赖图的价值不是让所有更新自动发生，而是让系统能确定：

```text
哪些结果已经过期
哪些结果不受影响
刷新前后必须满足什么顺序
```

## 两类依赖追踪

### 显式声明依赖

注册绑定时直接声明字段：

```text
Bind(
    target = PayableText,
    dependencies = [Total, Discount],
    evaluate = total - discount)
```

优点：

```text
关系稳定
容易静态检查
容易生成依赖图
调试时能说明为什么刷新
```

代价：

```text
声明与实际读取必须保持一致
重构字段时需要同步维护
```

### 求值时动态收集依赖

绑定求值期间，数据访问器记录读过的字段：

```text
BeginCollect(binding)
value = model.Total - model.Discount
dependencies = EndCollect(binding)
```

优点：

```text
依赖能跟随实际读取分支变化
编写绑定时重复声明较少
```

代价：

```text
需要拦截属性读取
首次求值前依赖未知
条件分支可能让依赖集合变化
调试和性能模型更复杂
```

显式声明和动态收集都是实现选择，不是数据绑定的固定要求。

## 进阶：条件依赖为什么麻烦

考虑：

```text
displayName =
    useNickname
        ? nickname
        : fullName
```

当 `useNickname = true` 时，实际依赖：

```text
useNickname
nickname
```

当它变成 `false` 后，依赖应切换为：

```text
useNickname
fullName
```

如果系统只在第一次执行时收集依赖：

```text
后来 fullName 变化可能不会触发刷新。
```

可选模型包括：

```text
声明所有潜在依赖
每次求值重新收集实际依赖
由生成代码分析条件表达式
```

选择哪一种取决于绑定表达能力和运行成本。不能在不更新依赖集合的情况下，假设第一次收集永远正确。

## 从变化到刷新的逐步状态

一次批量刷新可以分成这些状态：

```text
Clean
  当前结果与数据一致。

Dirty
  依赖已经变化，结果需要重算。

Queued
  已进入本轮刷新队列。

Evaluating
  正在读取依赖并计算新值。

Applying
  正在把结果写入目标 UI。

Clean
  写入成功，绑定恢复一致。
```

失败状态必须独立存在：

```text
EvaluationFailed
ApplyFailed
DependencyCycle
DisposedTarget
```

不能把失败后的绑定直接标回 `Clean`，否则系统会错误声称 UI 与数据一致。

## 批量刷新怎样工作

### 第一步：数据源提交变化

一轮逻辑可能修改多个字段：

```text
Quantity changed
UnitPrice changed
Discount changed
```

数据源发布的是结构化变化：

```text
SourceId
FieldId
OldVersion
NewVersion
ChangeBatchId
```

具体字段标识和版本类型是实现选择，但变化来源必须可追踪。

### 第二步：传播失效

系统查询反向依赖索引：

```text
Field -> Bindings that depend on it
```

把相关绑定加入脏集合。

集合应去重：

```text
同一个绑定被三个字段同时影响，
本轮仍只需要排队一次。
```

### 第三步：等待刷新边界

刷新边界可以是：

```text
数据事务提交
当前事件处理完成
UI 调度器的固定阶段
明确调用 Flush
```

使用哪个边界是运行时协议选择。不能依赖“过一会儿自然会刷”的模糊时机。

### 第四步：按依赖顺序求值

如果派生绑定互相依赖：

```text
Subtotal -> Total -> Payable
```

应先更新上游，再更新下游。

可以对脏子图做拓扑排序。若检测到环：

```text
A depends on B
B depends on A
```

系统应报告 `DependencyCycle`，包括环上的绑定标识；不能任意挑一个顺序并声称刷新成功。

### 第五步：应用结果

只有求值成功，才进入 Apply。

Apply 成功后记录：

```text
绑定读取的数据版本
写入目标版本
本轮批次标识
耗时
```

如果 Apply 失败：

```text
保留失败状态
记录原始异常或错误
不把绑定标记为 Clean
```

## 最小 C# 模型

下面的示例展示去重队列和失败可见性，不绑定具体 UI 框架：

```csharp
public enum RefreshStatus
{
    Clean,
    Queued,
    Evaluating,
    Applying,
    EvaluationFailed,
    ApplyFailed
}

public sealed class BindingNode
{
    public string Id { get; }
    public RefreshStatus Status { get; private set; }
    public Exception? LastError { get; private set; }

    private readonly Func<object> evaluate;
    private readonly Action<object> apply;

    public BindingNode(
        string id,
        Func<object> evaluate,
        Action<object> apply)
    {
        Id = id;
        this.evaluate = evaluate;
        this.apply = apply;
    }

    public void MarkQueued()
    {
        Status = RefreshStatus.Queued;
    }

    public bool TryRefresh(out Exception? error)
    {
        LastError = null;
        error = null;

        object value;

        try
        {
            Status = RefreshStatus.Evaluating;
            value = evaluate();
        }
        catch (Exception exception)
        {
            Status = RefreshStatus.EvaluationFailed;
            LastError = exception;
            error = exception;
            return false;
        }

        try
        {
            Status = RefreshStatus.Applying;
            apply(value);
            Status = RefreshStatus.Clean;
            return true;
        }
        catch (Exception exception)
        {
            Status = RefreshStatus.ApplyFailed;
            LastError = exception;
            error = exception;
            return false;
        }
    }
}

public sealed class RefreshBatch
{
    private readonly HashSet<BindingNode> dirty = new();

    public void Enqueue(BindingNode binding)
    {
        if (dirty.Add(binding))
        {
            // 同一批次只让同一个绑定入队一次。
            binding.MarkQueued();
        }
    }

    public IReadOnlyList<(string Id, Exception Error)> Flush()
    {
        var failures = new List<(string, Exception)>();

        foreach (BindingNode binding in dirty)
        {
            if (!binding.TryRefresh(out Exception? error))
            {
                // 失败被收集并交给调用方，不转换成默认成功。
                failures.Add((binding.Id, error!));
            }
        }

        dirty.Clear();
        return failures;
    }
}
```

这段代码为了突出失败协议，省略了拓扑排序。`HashSet` 的遍历顺序不能作为依赖顺序；真实存在绑定间依赖时，必须先建立并验证有向无环图。

## 与虚拟列表怎样结合

虚拟列表会反复复用可见项：

```text
槽位 3 原来显示数据 18
滚动后改为显示数据 43
```

绑定生命周期必须跟随“槽位当前绑定的数据身份”。

一次复用应经过：

```text
解绑旧数据 18 的依赖订阅
增加槽位绑定代次
绑定新数据 43
立即建立新依赖
使用新数据版本求值
```

如果旧数据 18 的异步变化稍后到达：

```text
回调携带旧绑定代次
系统识别它不再属于当前槽位
报告为过期结果或忽略写入
```

“不让过期结果写入”不等于静默吞错。调试模式或观测数据应能看到过期结果数量、来源与绑定代次。

### 可见与不可见项

不可见数据变化时，常见选择有：

```text
只更新数据版本，等再次可见时求值
维护与视图无关的派生缓存
让特定后台绑定继续运行
```

具体策略取决于派生结果是否只服务 UI。不能默认所有不可见项都需要创建视图刷新。

## 正常路径

### 一个字段影响一个绑定

```text
Name 变化
NameText 进入脏集合
刷新边界到达
求值并写入成功
NameText -> Clean
```

### 多字段影响同一绑定

```text
Total 变化
Discount 变化
PayableText 被命中两次
脏集合只保留一个 PayableText
最终使用同一批次提交后的数据求值一次
```

### 虚拟列表槽位复用

```text
旧绑定解除
绑定代次增加
新数据依赖注册
新数据求值成功
旧回调不能写入当前槽位
```

## 边界路径

### 刷新期间再次发生变化

绑定 A 求值时触发了数据变化，使绑定 B 变脏。

系统必须定义：

```text
B 加入当前批次剩余队列
还是进入下一批次
```

无论选哪种，都应有：

```text
批次标识
最大传播保护
可观察的再次入队记录
```

否则自触发绑定可能形成无限刷新。

### 绑定目标已经销毁

数据仍在，但页面或列表槽位已经释放：

```text
Apply 不应写入无效目标。
```

这是生命周期错误或过期调度，应报告目标身份和绑定代次，而不是把写入跳过后标记为成功。

### 值没有改变

源字段通知了变化，但重新求值结果与已显示值相同。

系统可以在明确的相等性规则下跳过 Apply：

```text
精确相等
值对象自定义相等
特定领域比较器
```

相等性规则是实现选择。浮点容差等行为值不能未经依据直接写入。

## 失败路径

### 依赖图形成环

```text
A 显示依赖 B
B 显示依赖 A
```

应输出完整或最小环路：

```text
A -> B -> A
```

不能只记录“排序失败”，也不能任意使用旧值打破环。

### 求值异常

例如绑定表达式访问了已经失效的数据：

```text
状态 -> EvaluationFailed
保留原始异常
记录绑定 ID、数据源版本、批次
不进入 Apply
```

不得返回空字符串或零值冒充正常结果。

### Apply 异常

求值成功但目标拒绝写入：

```text
状态 -> ApplyFailed
保留求出的值摘要与原始异常
绑定不标记为 Clean
批次结果包含该失败
```

### 数据通知丢失

如果数据已变但没有发出字段通知，依赖系统不会自动知道。

可通过版本校验发现：

```text
绑定最后读取版本 != 当前数据版本
```

版本校验的频率是成本选择，但发现不一致后应报告通知链断裂，不能悄悄修正并隐藏来源。

## 性能代价

依赖追踪会增加：

```text
反向依赖索引内存
订阅与解绑成本
变化传播成本
拓扑排序或优先队列成本
诊断元数据
```

批量刷新减少重复工作，但会引入延迟：

```text
数据变化与 UI 可见更新之间存在批次窗口。
```

窗口多长、是否允许跨帧、单批次预算多少，都需要由交互要求与测量结果决定。

## 观测指标

一轮刷新至少应能观察：

```text
BatchId
SourceChangeCount
DirtyBindingCount
DeduplicatedEnqueueCount
EvaluatedCount
AppliedCount
FailedCount
CycleCount
StaleGenerationCount
BatchDuration
```

单个失败记录至少包含：

```text
绑定标识
目标标识
数据源标识与版本
状态阶段
原始错误
依赖链
批次标识
```

## 通用机制与实现选择

### 可验证的通用机制

```text
绑定结果依赖一个或多个数据源字段。
字段变化会让下游结果失效。
脏集合可以合并同一批次内的重复刷新请求。
有向依赖需要按上游到下游的顺序刷新。
目标复用时必须隔离旧绑定代次。
失败后的绑定不能声称与数据一致。
```

### 必须由具体系统确定

```text
显式依赖还是动态收集
刷新边界
批次调度与预算
相等性比较
可见项与不可见项策略
节点实例和数据订阅的生命周期
循环依赖的内容修复规则
错误上报与阻断级别
```

## 最后总结

虚拟列表回答：

```text
哪些视图现在需要存在？
```

依赖追踪回答：

```text
数据变化后，哪些现有视图结果已经过期？
```

批量刷新回答：

```text
怎样把同一轮失效合并，并按正确顺序更新？
```

可靠的数据绑定链需要保证：

```text
依赖关系可解释
刷新批次有边界
重复请求可合并
虚拟列表复用不串数据
循环依赖和写入失败保持可见
只有真正完成求值与应用后才标记为 Clean
```
