# C++ 对象模型、虚表与动态绑定

分类：C++ 基础

## 先用生活模型理解动态绑定

想象一个统一的“发声”按钮。

按钮只规定：

```text
按下后，请当前设备发声。
```

不同设备有不同实现：

- 门铃播放铃声；
- 计时器播放提示音；
- 静音设备记录一次请求。

调用者只持有“可发声设备”的引用。实际按下按钮时，系统根据对象的动态类型选择对应实现。

这就是动态绑定要解决的问题：

```text
调用代码只依赖基类接口，
运行时根据实际对象选择虚函数实现。
```

## 静态类型与动态类型

```cpp
struct Device
{
    virtual ~Device() = default;
    virtual void sound() const = 0;
};

struct Bell final : Device
{
    void sound() const override
    {
        std::cout << "教学示例铃声\n";
    }
};

Bell bell;
Device& device = bell;
device.sound();
```

这里：

```text
device 的静态类型：Device&
device 引用对象的动态类型：Bell
```

编译器根据静态类型检查“能否调用 `sound`”。运行时虚调用根据动态类型选择 `Bell::sound`。

## 标准保证与常见实现必须分开

C++ 语言标准规定的是可观察语义，例如：

- 虚函数调用会按规则选择最终覆写函数；
- 多态基类可以通过虚析构正确销毁派生对象；
- `dynamic_cast` 和 `typeid` 在规定条件下提供运行时类型操作；
- 对象布局、大小和地址关系满足标准规定的约束。

C++ 标准**没有强制规定**：

- 对象必须含有一个名为 `vptr` 的字段；
- 虚表必须是某种数组；
- 虚表位于对象前几个字节；
- 每个类只有一张虚表；
- 虚函数槽位按源码声明顺序排列；
- 多继承必须使用某一种固定指针调整方式。

许多 ABI 和编译器使用虚表实现动态绑定，这是常见实现方式，不是语言标准唯一允许的实现。

后文会使用“虚表”和“虚表指针”帮助理解常见机器实现，但不能把示意布局当成可移植代码依据。

## 常见虚表实现怎样工作

一种常见的简化示意：

```text
Bell 对象
┌──────────────┐
│ vptr ──────────────┐
│ Bell 的实例数据 │  │
└──────────────┘  │
                  ▼
            Bell 的虚表
            ┌────────────────┐
            │ 析构相关入口    │
            │ Bell::sound    │
            │ 其他 ABI 信息   │
            └────────────────┘
```

教学式虚调用过程：

```text
1. 通过对象取得实现使用的虚表信息。
2. 在对应虚函数入口处取得函数地址。
3. 必要时调整 this 指针。
4. 调用最终覆写函数。
```

这些步骤描述常见 ABI 的思路。具体表项、析构函数槽位、RTTI 信息和指针调整方式由实现与 ABI 决定。

## 覆写怎样确定

派生类成员要与基类虚函数形成合法覆写关系。

```cpp
#include <iostream>
#include <memory>

struct Shape
{
    virtual ~Shape() = default;
    virtual void draw() const
    {
        std::cout << "绘制教学示例形状\n";
    }
};

struct Circle final : Shape
{
    void draw() const override
    {
        std::cout << "绘制教学示例圆形\n";
    }
};

int main()
{
    std::unique_ptr<Shape> shape = std::make_unique<Circle>();
    shape->draw();
}
```

`override` 不是动态绑定本身，但它让编译器验证当前函数确实覆写了基类虚函数。

如果签名不匹配：

```cpp
struct WrongCircle : Shape
{
    // void draw() override; // 编译失败：缺少 const，未形成覆写
};
```

这比悄悄创建一个新的同名函数更容易发现问题。

## 正常调用的逐步状态

以上面的 `Shape` 示例为教学流程：

```text
创建 Circle 对象
    ↓
用 unique_ptr<Shape> 保存其基类指针
    ↓
表达式 shape->draw() 通过基类接口发起调用
    ↓
动态绑定选择 Circle::draw()
    ↓
输出教学示例圆形
    ↓
unique_ptr 析构，通过 Shape 的虚析构链销毁对象
```

动态绑定发生的前提是通过指针或引用调用虚函数。若对象已经被按值复制为基类对象，派生部分不会保留。

## 对象切片

```cpp
struct Animal
{
    virtual ~Animal() = default;
    virtual const char* name() const
    {
        return "教学示例动物";
    }
};

struct Cat final : Animal
{
    const char* name() const override
    {
        return "教学示例猫";
    }
};

Cat cat;
Animal sliced = cat;
std::cout << sliced.name() << '\n';
```

`sliced` 是一个独立的 `Animal` 对象。把 `Cat` 按值赋给它时，只有基类子对象被复制，派生部分被切掉。

此后的动态类型就是 `Animal`，虚调用不会“记住它原来来自 Cat”。

需要保留多态对象时，通常通过引用或具有明确所有权的智能指针传递，而不是按基类值传递。

## 为什么多态基类通常需要虚析构

```cpp
struct Base
{
    virtual ~Base() = default;
};

struct Derived final : Base
{
    ~Derived() override
    {
        std::cout << "销毁教学示例派生对象\n";
    }
};

Base* value = new Derived();
delete value;
```

通过基类指针删除派生对象时，基类析构函数必须满足虚析构规则，才能按动态类型执行正确析构链。

如果基类析构函数不是虚函数，而代码通过基类指针删除派生对象，行为不满足正确多态销毁要求，可能进入未定义行为。

另一种明确边界是让基类析构函数不可被外部通过基类指针调用，并由专门所有者负责销毁。但只要类型被设计为公开多态删除，虚析构通常是必要契约。

## 构造与析构期间的虚调用

在基类构造函数执行时，派生部分尚未完成构造；在基类析构函数执行时，派生部分已经结束相应生命周期。

因此，构造和析构期间的虚调用不会像完整对象状态下那样分派到尚未构造或已经销毁的派生部分。

```cpp
struct Base
{
    Base()
    {
        show(); // 调用 Base::show，不会调用 Derived::show
    }

    virtual ~Base() = default;

    virtual void show() const
    {
        std::cout << "教学示例基类\n";
    }
};

struct Derived final : Base
{
    void show() const override
    {
        std::cout << "教学示例派生类\n";
    }
};
```

不要依靠基类构造函数中的虚调用初始化派生状态。此时派生对象不具备完整不变量。

在构造或析构过程中调用纯虚函数还可能进入未定义行为；具体诊断形式由实现决定，不能依赖某种固定运行时报错。

## 纯虚函数与抽象类

```cpp
struct Encoder
{
    virtual ~Encoder() = default;
    virtual void encode() = 0;
};
```

包含未被实现的纯虚函数时，类型是抽象类，不能直接创建实例。

纯虚函数表达接口要求，但 C++ 仍允许纯虚函数具有定义。是否提供定义、何时能以限定名调用，是独立的语言规则；它不改变类因纯虚声明而成为抽象类这一事实。

## 多重继承与指针调整

```cpp
struct Readable
{
    virtual ~Readable() = default;
    virtual void read() const = 0;
};

struct Writable
{
    virtual ~Writable() = default;
    virtual void write() = 0;
};

struct Buffer final : Readable, Writable
{
    void read() const override {}
    void write() override {}
};
```

一个 `Buffer` 对象包含 `Readable` 和 `Writable` 基类子对象。

转换：

```cpp
Buffer buffer;
Readable* readable = &buffer;
Writable* writable = &buffer;
```

两个基类指针的数值表示不保证相同，因为它们可能指向对象内部不同的基类子对象。

常见 ABI 会在转换或虚调用时调整指针，并可能使用多个虚表相关指针或跳板函数。但具体布局不是标准保证。

## RTTI 与 `dynamic_cast`

当基类是多态类型时，可以使用 `dynamic_cast` 检查运行时类型关系：

```cpp
void inspect(Shape& shape)
{
    if (auto* circle = dynamic_cast<Circle*>(&shape))
    {
        circle->draw();
        return;
    }

    std::cout << "不是教学示例圆形\n";
}
```

指针形式转换失败返回空指针；引用形式转换失败抛出 `std::bad_cast`。

若大量代码反复通过 `dynamic_cast` 区分每个派生类型，可能说明基类接口没有承载真正需要的多态行为。但类型检查也有合理用途，不能仅凭出现一次就断定设计错误。

RTTI 的内部布局和查找算法同样受实现与 ABI 影响。

## `final` 与去虚拟化

`final` 可以表示类不能继续派生，或虚函数不能继续覆写：

```cpp
struct FinalShape final : Shape
{
    void draw() const override final
    {
    }
};
```

编译器在能证明动态类型时，可能把虚调用优化为直接调用，这常被称为去虚拟化。

是否发生优化取决于编译器、优化级别、链接信息和上下文。`final` 提供更多证明条件，但不保证生成某一条特定机器指令。

## 失败与边界路径

### 忘记虚析构

通过基类指针删除派生对象会破坏多态销毁契约。

### 签名看似相同但未覆写

遗漏 `const`、引用限定符或参数差异都可能创建新函数。使用 `override` 让编译器检查。

### 对象切片

按基类值传递会丢失派生部分。需要动态类型时使用引用或明确所有权指针。

### 悬空引用

动态绑定只选择函数，不管理对象生命周期。指针或引用指向已销毁对象时，调用虚函数仍是无效访问。

### 构造期间访问派生状态

基类构造阶段派生不变量尚未建立，虚调用不会提供完整派生行为。

### 跨二进制边界的 ABI 变化

改变虚函数集合、继承结构或编译选项可能改变 ABI。具体兼容规则依赖平台、编译器和接口约定，不能从 C++ 源码语义直接推断二进制兼容。

### 手工读取虚表

通过偏移读取对象内存并调用猜测的表项，不是可移植 C++，还可能违反对象模型、别名和函数调用约定。

## 复杂度与代价

从抽象算法角度，单次虚调用通常视为 `O(1)`。常见实现的实际代价可能包括：

- 通过间接地址调用；
- 更难内联；
- 对象可能增加一个或多个实现相关指针；
- 多重继承可能需要指针调整；
- RTTI 查询存在额外运行时工作。

但编译器可能去虚拟化，硬件预测也会影响实际成本。不能只凭“出现 virtual”判断性能问题，应该在真实编译配置下测量。

| 操作 | 抽象时间量级 | 主要风险 |
|---|---:|---|
| 单次虚调用 | `O(1)` | 间接调用、内联机会 |
| 基类到派生类 `dynamic_cast` | 实现相关 | 运行时类型查找 |
| 按值复制基类 | 复制成本 | 对象切片 |
| 多态销毁 | 与析构工作相关 | 基类需满足虚析构契约 |

## 标准语义与 ABI 示意对照

| 问题 | C++ 标准层面 | 常见 ABI 实现 |
|---|---|---|
| 调哪个覆写函数 | 按虚函数最终覆写规则 | 查虚表槽位 |
| 怎样保存分派信息 | 未规定固定布局 | 对象中保存虚表相关指针 |
| 多继承怎样转换指针 | 结果需指向正确基类子对象 | 使用固定偏移或调整跳板 |
| RTTI 怎样存储 | 规定可观察行为 | 类型信息常与虚表关联 |
| 虚析构怎样调用 | 按动态类型执行析构链 | 可能有多个析构入口 |

学习常见实现有助于读汇编、理解 ABI 和分析内存，但写可移植代码时应依赖左侧标准语义。

## 小结

```text
静态类型决定编译期可用接口。
动态类型决定虚调用的最终覆写函数。
虚表是常见实现，不是 C++ 标准强制布局。
多态基类公开支持基类指针删除时需要虚析构。
按基类值复制会切片。
构造与析构期间不能假设完整派生行为。
```

设计多态层次时，先回答：

1. 调用方真正需要哪些稳定行为？
2. 对象由谁拥有并销毁？
3. 是否会通过基类指针销毁派生对象？
4. 是否真的需要运行时多态，还是编译期组合更清楚？
5. 当前结论来自语言标准，还是某个平台 ABI？

最后一个问题能避免把调试器里看到的一种布局误写成所有 C++ 实现的规则。
