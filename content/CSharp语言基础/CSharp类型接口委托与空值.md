# C# 类型、接口、委托与空值

分类：C# 语言基础

## 先用生活模型理解四个概念

想象一个物品寄存处：

- **类型**像物品的制作规格，决定它有哪些数据、能做哪些事。
- **接口**像统一的取件窗口，只约定“能办理什么”，不限制柜子内部怎样实现。
- **委托**像一张写着联系人和办理事项的通知单，持有它就能在稍后发起调用。
- **空值**表示当前没有可用对象；它不是一个内容为空的对象，而是缺少对象本身。

这四个概念解决的是不同问题：

```text
类型：数据以什么形态存在？
接口：调用方依赖什么能力？
委托：哪段行为可以被保存并稍后调用？
空值：对象缺失时，代码怎样明确表达并处理？
```

## 类型为什么重要

类型让编译器知道一段数据的结构和允许的操作。它既是约束，也是沟通方式。

C# 类型常被分为值类型和引用类型：

```text
值类型：变量直接保存一个值，例如 int、bool、struct。
引用类型：变量保存对象的引用，例如 class、string、数组。
```

### 值类型的复制

把一个值类型变量赋给另一个变量，会复制当前值。之后修改副本，原变量通常不受影响。

```csharp
public struct Counter
{
    public int Value;
}

Counter first = new Counter { Value = 3 }; // 3 是教学示例值
Counter second = first;
second.Value = 8;                          // 8 是教学示例值

Console.WriteLine(first.Value);  // 输出 3
Console.WriteLine(second.Value); // 输出 8
```

### 引用类型的复制

把一个引用类型变量赋给另一个变量，复制的是引用。两个变量可能指向同一个对象。

```csharp
public sealed class Counter
{
    public int Value;
}

Counter first = new Counter { Value = 3 }; // 3 是教学示例值
Counter second = first;
second.Value = 8;                          // 修改同一个对象

Console.WriteLine(first.Value); // 输出 8
```

“值类型一定在栈上、引用类型一定在堆上”不是可靠的语言层判断。存储位置会受到上下文和运行时实现影响。学习类型时，更稳妥的关注点是**复制语义、可变性和对象身份**。

## `class` 与 `struct` 怎样选择

`class` 适合表达具有对象身份、需要被多处共享或生命周期相对独立的事物。

`struct` 适合表达一个完整的小值：它的各部分共同构成一个值，复制后通常应当互不影响。

可以按下面的问题判断：

```text
两个内容相同的实例，是否仍要区分“这是两个不同对象”？
实例是否需要在多处共享修改结果？
复制整个值是否符合直觉，成本是否可接受？
```

如果前两个问题回答“是”，通常更接近 `class`。如果对象天然像坐标、范围或颜色值，通常更接近 `struct`。

### 边界与代价

- 大型 `struct` 被频繁按值传递时，会产生复制成本。
- 可变 `struct` 容易出现“修改的是副本还是原值”的混淆。
- `class` 实例需要通过引用访问，并可能增加托管堆分配与垃圾回收压力。
- 把值类型装箱为 `object` 或某些接口类型时，通常会产生装箱。

因此不存在“永远使用某一种”的规则，选择要与数据语义一致。

## 接口为什么存在

如果调用方直接依赖每个具体类型，它就必须知道所有实现细节。接口把依赖缩小为一组明确能力。

生活模型中的取件窗口只承诺：

```text
给出编号，可以查询状态。
```

至于内部使用纸质登记还是电子登记，不属于窗口契约。

在 C# 中：

```csharp
public interface IReadable
{
    string Read();
}

public sealed class PlainNote : IReadable
{
    private readonly string _text;

    public PlainNote(string text)
    {
        _text = text;
    }

    public string Read()
    {
        return _text;
    }
}

public static class Reader
{
    public static void Print(IReadable source)
    {
        // 调用方只依赖“可读取”能力，不依赖具体实现类型。
        Console.WriteLine(source.Read());
    }
}

Reader.Print(new PlainNote("示例文本"));
```

### 调用过程

1. `PlainNote` 声明实现 `IReadable`。
2. 编译器检查它是否提供了契约要求的成员。
3. `Reader.Print` 只接收 `IReadable`。
4. 运行时根据实际对象调用对应的 `Read` 实现。

### 接口的边界

- 接口不能自动消除实现差异，语义仍需写清楚。
- 过大的接口会迫使实现类依赖自己不需要的成员。
- 只为“以后可能会用”而创建接口，会增加跳转和理解成本。
- 将值类型作为接口使用时，要留意装箱场景。

接口最有价值的时候，是调用方确实只关心一项稳定能力，而且存在或预期存在合理的不同实现。

## 委托为什么存在

普通方法调用要求调用方现在就知道要调用哪个方法。委托把“要调用的行为”保存成一个值，使行为能够：

- 作为参数传递；
- 保存在字段或局部变量中；
- 在条件满足时稍后执行；
- 组合多个签名兼容的方法。

### 最小示例

```csharp
public delegate int NumberRule(int value);

public static int Double(int value)
{
    return value * 2; // 2 是教学示例倍率
}

NumberRule rule = Double;
int result = rule(4); // 4 是教学示例输入

Console.WriteLine(result); // 输出 8
```

调用步骤是：

```text
方法 Double
    ↓ 转换为签名兼容的委托
变量 rule 保存调用目标
    ↓ 调用 rule(4)
委托转发到 Double(4)
```

.NET 还提供常用泛型委托：

```text
Action：无返回值的调用。
Func：有返回值的调用。
Predicate<T>：接收 T 并返回 bool 的判断。
```

例如：

```csharp
Func<int, bool> isPositive = value => value > 0;
Console.WriteLine(isPositive(5)); // 5 是教学示例输入
```

### 委托、回调与事件

“回调”描述一种使用方式：把行为交给另一段代码，由它在合适时间调用。

“委托”是承载这个行为的 C# 类型机制。

“事件”则在委托基础上增加发布边界：外部通常只能订阅和取消订阅，不能直接替发布者触发事件。

```csharp
public sealed class Bell
{
    public event Action? Rang;

    public void Ring()
    {
        // 没有订阅者时不调用；有订阅者时调用当前订阅列表。
        Rang?.Invoke();
    }
}

var bell = new Bell();
bell.Rang += () => Console.WriteLine("收到示例通知");
bell.Ring();
```

### 委托的边界与代价

- 订阅者忘记取消订阅，可能让对象比预期存活更久。
- 多播委托按订阅顺序逐个调用；其中一个处理器抛出异常时，后续处理器不会自动保证继续执行。
- 捕获外部变量的 Lambda 可能生成闭包对象，并延长被捕获对象的生命周期。
- 回调层级过深会让实际调用链难以追踪。

这些行为不应靠猜测处理。需要隔离异常、改变调用顺序或允许部分失败时，应当把规则显式设计出来。

## 空值为什么容易出错

引用变量可能没有指向对象。若直接访问空引用的成员，会抛出 `NullReferenceException`。

```csharp
string? title = null;
Console.WriteLine(title.Length); // 不安全：title 可能为 null
```

开启可空引用类型后，`string` 与 `string?` 表达不同意图：

```text
string：设计意图是不应为 null。
string?：设计意图是允许为 null。
```

它主要提供编译期分析和警告，不会把所有运行时空引用自动消除。

### 明确处理空值

```csharp
static int CountCharacters(string? text)
{
    if (text is null)
    {
        // 空值的处理规则由这个函数的契约明确规定。
        return 0;
    }

    return text.Length;
}

Console.WriteLine(CountCharacters(null));
Console.WriteLine(CountCharacters("示例"));
```

也可以使用空条件运算符：

```csharp
int? length = title?.Length;
```

这里的结果仍可能为空。它没有“修复”缺失对象，只是避免立即访问空引用，并把缺失继续传递下去。

### `??` 与 `!` 的含义

`??` 在左侧为空时选取右侧值：

```csharp
string display = title ?? "未命名示例";
```

这是一条明确的替代规则。是否允许替代、替代成什么，必须来自函数或数据契约，不能为了消除警告随意添加。

空包容运算符 `!` 只是在编译期告诉分析器“这里按非空处理”：

```csharp
Console.WriteLine(title!.Length);
```

它不会在运行时创建对象，也不会阻止 `NullReferenceException`。只有已有可靠证据证明该值非空、但分析器无法推导时，才适合使用。

## 一段组合示例

下面把接口、委托与可空引用放在一起：

```csharp
#nullable enable

public interface ITextSource
{
    string? TryRead();
}

public sealed class FixedTextSource : ITextSource
{
    private readonly string? _text;

    public FixedTextSource(string? text)
    {
        _text = text;
    }

    public string? TryRead()
    {
        return _text;
    }
}

public static class TextPipeline
{
    public static void Run(ITextSource source, Action<string> onText)
    {
        string? text = source.TryRead();
        if (text is null)
        {
            // 保留“没有文本”这一结果，不把它伪装成成功读取。
            Console.WriteLine("没有可读取的示例文本");
            return;
        }

        onText(text);
    }
}

ITextSource source = new FixedTextSource("示例内容");
TextPipeline.Run(source, text => Console.WriteLine(text.Length));
```

逐步看：

1. `ITextSource` 只约定读取能力，并明确结果可能为空。
2. `FixedTextSource` 是一种具体实现。
3. `Action<string>` 把读取成功后的行为交给调用方。
4. `Run` 先检查空值，只在确有文本时调用委托。

## 复杂度与工程代价

这些语言机制通常不以算法复杂度作为主要选择标准，但仍有运行成本：

| 操作 | 常见时间量级 | 主要代价 |
|---|---:|---|
| 字段读取 | `O(1)` | 取决于对象布局和运行时优化 |
| 接口方法调用 | `O(1)` | 需要解析实际实现，具体优化由运行时决定 |
| 单个委托调用 | `O(1)` | 比直接调用多一层间接调用语义 |
| 多播委托调用 | `O(n)` | `n` 为当前处理器数量 |
| 空值判断 | `O(1)` | 主要成本是分支和契约复杂度 |

比微小调用开销更常见的代价，是契约不清导致的错误：谁拥有对象、谁负责取消订阅、空值是否正常、缺失时能否替代，都应在接口和方法边界中明确表达。

## 小结

```text
类型定义数据的形态与复制语义。
接口定义调用方真正依赖的能力。
委托把行为保存为可传递、可延迟调用的值。
可空标注让“可能缺失”进入类型契约。
```

判断代码是否清楚，可以问四个问题：

1. 这个数据是一个可复制的值，还是有身份的共享对象？
2. 调用方需要具体类型，还是只需要一项能力？
3. 这段行为是否需要被传递或稍后调用？
4. 空值是正常结果、错误状态，还是根本不应出现？

回答清楚后，语言关键字只是把这些设计意图准确写出来。
