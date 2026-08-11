# C# 属性、常量、静态与只读语义

分类：C# 语言基础

## 先说结论

字段保存数据，属性控制读写入口，`readonly` 限制对象建立后的重新赋值，`const` 表示编译期固定值，`static` 表示数据属于类型而不是某个实例。选择它们时只问一句：这个值由谁拥有，允许在什么时候改变？

### 用四个数字区分它们

```text
player.Speed = 5          // 每个玩家自己的可变状态
MaxSpeed = 10             // const，编译期固定规则
player.Id = 42            // readonly，构造后不再换身份
Player.AliveCount = 3     // static，三个实例共享的类型状态
```

把 `player.Speed` 改成 7，只影响这个玩家；把 `AliveCount` 从 3 改成 4，所有代码看到的都是同一个共享计数；`Id` 和 `MaxSpeed` 则分别在构造边界和编译边界之后禁止改写。

## 先用生活模型理解

想象一张设备登记卡：

- **字段**像卡片内部实际记录的数据。
- **属性**像读取或填写信息的窗口，可以在访问时执行规则。
- **`const`** 像印刷在统一说明书上的固定文字，编译时就必须确定。
- **`readonly`** 像设备装配完成后封存的铭牌，创建期间可以确定，之后不能重新指向另一个值。
- **`static`** 像整类设备共用的总计数器，不属于某一台实例。

它们解决的不是同一个问题：

```text
属性：外部怎样访问对象状态？
const：编译期常量是什么？
readonly：实例或类型初始化后，哪个字段不能再赋值？
static：成员属于类型，还是属于每个实例？
```

## 字段与属性的区别

字段直接保存数据：

```csharp
public int Count;
```

属性是带有访问器的成员：

```csharp
public int Count { get; set; }
```

自动属性看起来像字段，但编译器会为它生成隐藏的后备存储。调用方访问的是 `get` 或 `set` 访问器，而不是直接操作公开字段。

属性可以：

- 只允许读取；
- 限制谁能写入；
- 在读取或写入时验证；
- 计算后返回结果；
- 保持公开访问形式稳定，同时调整内部存储。

属性也会执行代码，因此不能仅凭 `obj.Value` 的外观假设它一定是零成本字段读取。

## `get` 与 `set`

### 可读写属性

```csharp
public sealed class Counter
{
    private int _value;

    public int Value
    {
        get
        {
            return _value;
        }
        set
        {
            if (value < 0)
            {
                throw new ArgumentOutOfRangeException(
                    nameof(value),
                    "计数不能为负数。");
            }

            _value = value;
        }
    }
}

var counter = new Counter();
counter.Value = 3; // 3 是教学示例值
Console.WriteLine(counter.Value);
```

逐步过程：

```text
执行 counter.Value = 3
    ↓
进入 set，隐式参数 value 等于 3
    ↓
验证通过
    ↓
写入后备字段 _value
    ↓
读取 counter.Value 时进入 get
```

验证失败会抛出异常，原字段不会被这次赋值修改。示例没有把非法输入替换成默认值。

### 只读属性

```csharp
public sealed class Rectangle
{
    public int Width { get; }
    public int Height { get; }

    public int Area => checked(Width * Height);

    public Rectangle(int width, int height)
    {
        if (width < 0 || height < 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(width),
                "宽和高不能为负数。");
        }

        Width = width;
        Height = height;
    }
}
```

`Width` 和 `Height` 只有 `get`，但可以在构造函数中赋值。`Area` 是计算属性，每次读取都会计算，不额外保存面积。

### 访问器可见性

```csharp
public sealed class Session
{
    public bool IsOpen { get; private set; }

    public void Open()
    {
        if (IsOpen)
        {
            throw new InvalidOperationException("当前已经是打开状态。");
        }

        IsOpen = true;
    }
}
```

外部可以读取 `IsOpen`，只有类内部能调用它的 `set`。这让状态改变集中到明确的方法中。

## `init`：只允许在初始化阶段赋值

`init` 访问器允许属性在对象初始化期间被设置，初始化完成后不能通过普通赋值再次修改。

```csharp
public sealed class Note
{
    public required string Title { get; init; }
    public string Content { get; init; } = string.Empty;
}

var note = new Note
{
    Title = "教学示例标题",
    Content = "教学示例内容"
};

// note.Title = "另一个标题";
// 编译错误：初始化完成后不能调用 init 访问器。
```

逐步状态：

```text
分配 Note 实例
    ↓
执行对象初始化器中的 init 赋值
    ↓
初始化表达式结束
    ↓
外部只能读取这些属性
```

`required` 表示创建者必须在允许的初始化路径中提供该成员。它改善编译期契约，但不自动验证字符串是否为空，也不能替代业务含义上的验证。

### `init` 不等于深度不可变

```csharp
public sealed class Container
{
    public List<string> Items { get; init; } = new();
}

var container = new Container();
container.Items.Add("教学示例元素");
```

`Items` 属性不能在初始化后重新指向另一张列表，但列表对象本身仍然可变。

这说明：

```text
引用不能重新赋值
≠
引用指向的对象不可变
```

若需要不可变集合，应选择具有相应语义的类型，并明确更新方式。

## `readonly` 字段

实例 `readonly` 字段可以在字段声明处或该类型的实例构造函数中赋值，之后不能再次赋值。

```csharp
public sealed class Label
{
    private readonly string _text;

    public Label(string text)
    {
        ArgumentNullException.ThrowIfNull(text);
        _text = text;
    }

    public string Text => _text;
}
```

它表达：

```text
每个 Label 实例有自己的 _text；
构造完成后，_text 不再指向另一个字符串。
```

### `static readonly`

`static readonly` 字段属于类型，可以在声明处或静态构造函数中赋值。

```csharp
public sealed class FormatRules
{
    public static readonly StringComparer NameComparer =
        StringComparer.Ordinal;
}
```

它适合需要在运行时构造、但初始化后不应重新赋值的共享对象。

### `readonly` 的边界

对引用类型字段，`readonly` 限制的是字段重新赋值：

```csharp
private readonly List<int> _values = new();
```

类内部仍可以修改 `_values` 指向的列表内容。

对值类型字段，防御性复制、`readonly struct` 和 `readonly` 成员会影响可变成员的调用语义。最清楚的做法是让表示值的结构体保持不可变。

## `readonly struct`

`readonly struct` 表示其实例字段都应保持只读语义，实例成员不会修改当前值。

```csharp
public readonly struct Point
{
    public int X { get; }
    public int Y { get; }

    public Point(int x, int y)
    {
        X = x;
        Y = y;
    }

    public int ManhattanDistance()
    {
        return checked(Math.Abs(X) + Math.Abs(Y));
    }
}

var point = new Point(2, -3); // 2 和 -3 是教学示例坐标
Console.WriteLine(point.ManhattanDistance());
```

这适合表达一个完整的小值。它不保证引用类型字段指向的对象也不可变。

## `const`：编译期常量

`const` 成员必须能在编译期确定，并且隐式为静态成员。

```csharp
public static class MathExamples
{
    public const int SidesInTriangle = 3;
    // 3 是由“三角形边数”定义决定的教学常量。
}
```

常见可用于 `const` 的类型包括数值类型、`bool`、`char`、`string`、枚举和 `null` 引用常量。

下面不能作为 `const`：

```csharp
// public const DateTime CreatedAt = DateTime.UtcNow;
```

`DateTime.UtcNow` 只有运行时才能得到，因此若确实需要初始化后固定，应研究 `static readonly`：

```csharp
public static readonly DateTime ProcessStartedAt = DateTime.UtcNow;
```

这里的值是类型首次初始化过程的一部分，不是编译期常量。

### `const` 的跨程序集边界

调用方编译时会把引用到的常量值编入自己的代码。若只重新编译常量提供方而不重新编译调用方，调用方可能仍使用旧值。

因此：

- 真正稳定、定义上固定的值适合公开 `const`；
- 未来可能改变的公开值应谨慎使用 `const`；
- `static readonly` 通过字段访问运行时值，但仍需考虑版本兼容和初始化时机。

这不是“所有常量都用 `static readonly`”的规则，而是要先区分编译期定义与运行时固定值。

## `static`：属于类型的成员

实例成员依附于某个对象：

```csharp
counter.Value
```

静态成员依附于类型：

```csharp
Counter.CreatedCount
```

### 最小示例

```csharp
public sealed class Ticket
{
    private static int _createdCount;

    public static int CreatedCount => _createdCount;

    public int Number { get; }

    public Ticket(int number)
    {
        Number = number;
        _createdCount++;
    }
}

var first = new Ticket(101);
var second = new Ticket(102);
// 101 和 102 是教学示例编号。

Console.WriteLine(Ticket.CreatedCount); // 教学示例输出 2
```

所有 `Ticket` 实例共享 `_createdCount`。

### 静态类

静态类不能创建实例，只能包含静态成员：

```csharp
public static class Temperature
{
    public static double CelsiusToFahrenheit(double celsius)
    {
        // 9、5 和 32 来自温标换算定义，不是可调默认值。
        return celsius * 9 / 5 + 32;
    }
}
```

它适合没有实例状态、仅按输入计算结果的工具集合。若逻辑依赖可替换状态、生命周期或外部环境，全部放入静态成员会增加测试隔离和依赖追踪难度。

## 静态初始化的逐步状态

静态字段在类型初始化过程中建立。若定义了显式静态构造函数，它在运行时首次需要初始化该类型之前执行一次。

```csharp
public sealed class Lookup
{
    public static readonly IReadOnlyDictionary<string, int> Values;

    static Lookup()
    {
        Values = new Dictionary<string, int>
        {
            ["甲"] = 1,
            ["乙"] = 2
        }; // 键和值均为教学示例。
    }
}
```

概念过程：

```text
类型尚未初始化
    ↓
运行时首次触发类型初始化
    ↓
执行静态字段初始化与静态构造逻辑
    ├─ 成功：类型可正常使用
    └─ 失败：类型初始化异常保持可见
```

静态构造函数抛出异常时，外部会观察到类型初始化失败。不能捕获后填入未经定义的默认值并假装初始化成功。

具体初始化时机受到是否声明显式静态构造函数、运行时规则与访问方式影响。不要依赖“恰好在某一行之前发生”的猜测来设计副作用顺序。

## 怎样组合这些机制

下面的教学类型组合了属性、`init`、`readonly`、`const` 和 `static`：

```csharp
public sealed class Measurement
{
    public const string Unit = "cm";
    // "cm" 是此教学类型定义选择的固定单位。

    private static int _createdCount;
    private readonly DateTime _createdAt;

    public required string Name { get; init; }
    public double Value { get; private set; }

    public static int CreatedCount => _createdCount;
    public DateTime CreatedAt => _createdAt;

    public Measurement(double initialValue)
    {
        if (!double.IsFinite(initialValue))
        {
            throw new ArgumentOutOfRangeException(nameof(initialValue));
        }

        Value = initialValue;
        _createdAt = DateTime.UtcNow;
        _createdCount++;
    }

    public void ChangeValue(double nextValue)
    {
        if (!double.IsFinite(nextValue))
        {
            throw new ArgumentOutOfRangeException(nameof(nextValue));
        }

        Value = nextValue;
    }
}

var measurement = new Measurement(12.5)
{
    Name = "教学示例长度"
}; // 12.5 是教学示例初值。

measurement.ChangeValue(13.0); // 13.0 是教学示例新值。
```

这里的边界是：

```text
Unit：编译期定义常量。
_createdCount：所有实例共享的可变静态状态。
_createdAt：每个实例构造时确定，之后不重新赋值。
Name：必须在初始化阶段提供。
Value：外部可读，只能通过明确方法改变。
```

## 进阶：正常、边界与失败路径

### 属性验证失败

非法值应在属性或方法边界明确失败，且不要在验证前修改状态。

### `init` 漏填

对 `required` 成员，正常编译会提示创建者补齐。但反射、反序列化和特定互操作路径可能有不同的对象建立机制，仍需根据入口验证对象不变量。

### `readonly` 引用指向可变对象

字段不能重新赋值，不表示对象内容冻结。调用方需要的是浅只读还是深不可变，必须明确。

### 静态可变状态

静态字段被所有调用方共享。并发修改时需要明确同步；测试之间也可能互相影响。

### `const` 值发生变化

公开常量更新后，已编译调用方可能继续携带旧值，需要重新编译相关调用方。

### 属性隐藏高成本工作

属性访问在语义上像状态读取。若 `get` 执行阻塞 I/O、长时间计算或不可见副作用，调用方很难从语法判断代价。高成本动作通常更适合用明确方法表达。

### 可变结构体属性

从属性返回值类型会得到值。修改这个副本并不一定能改变属性背后的原值。可变结构体会放大这种困惑，应优先使用不可变值语义或明确的更新方法。

## 复杂度与代价

这些机制主要表达所有权和修改边界，常见操作本身多为 `O(1)`：

| 操作 | 常见时间量级 | 主要代价 |
|---|---:|---|
| 自动属性读取/写入 | `O(1)` | 访问器调用通常可被优化 |
| 计算属性 | 取决于计算内容 | 每次读取重新计算 |
| 静态字段访问 | `O(1)` | 共享状态与初始化边界 |
| `readonly` 字段读取 | `O(1)` | 大型值类型可能涉及复制语义 |
| `const` 使用 | 编译期替换 | 跨程序集版本更新风险 |

真正需要权衡的是：

- 是否让无效状态进入对象；
- 可变状态由谁修改；
- 共享状态是否需要同步；
- 只读是字段不能重指向，还是对象真正不可变；
- 属性访问是否隐藏了意外成本。

## 小结

```text
get 决定怎样读取属性。
set 允许对象初始化后继续赋值。
init 把赋值限制在初始化阶段。
readonly 限制字段在初始化完成后重新赋值。
const 表达编译期固定值，并隐式属于类型。
static 表达成员由整个类型共享。
```

选择关键字前，先问：

1. 外部是否应该直接改变这个状态？
2. 值在对象初始化后还能不能换？
3. 只要求引用固定，还是对象内容也必须不可变？
4. 数据属于每个实例，还是属于整个类型？
5. 这个值是编译期定义，还是运行时初始化后固定？

这些问题回答清楚，属性和字段才真正表达了设计意图。
