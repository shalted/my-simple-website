# RAII、智能指针与资源所有权

分类：C++ 基础

## 先用生活模型理解所有权

想象借用一把钥匙：

- 钥匙只能由一个保管员负责归还，这是**独占所有权**。
- 多名登记人共同决定何时归还，这是**共享所有权**。
- 门口告示牌可以观察“钥匙是否仍在”，但不能阻止归还，这是**弱观察关系**。
- 保管员离开岗位时自动归还钥匙，这是 **RAII**。

资源管理最重要的问题不是“用哪个智能指针”，而是：

```text
谁负责释放资源？
责任能否转移？
资源可以被几名所有者共同延长生命周期？
谁只观察而不拥有？
```

## RAII 是什么

RAII 是 Resource Acquisition Is Initialization，常译为“资源获取即初始化”。

它的核心不是“所有资源必须在构造函数里申请”，而是：

```text
把资源生命周期绑定到对象生命周期。
对象建立有效状态时获得资源。
对象析构时释放资源。
```

当控制流因正常返回、提前返回或异常离开作用域时，已经完成构造的局部对象都会按语言规则析构，因此资源释放不依赖每条路径手写清理代码。

## 一个最小 RAII 类型

```cpp
#include <cstdio>
#include <stdexcept>

class FileHandle
{
public:
    explicit FileHandle(const char* path)
        : file_(std::fopen(path, "rb"))
    {
        if (file_ == nullptr)
        {
            throw std::runtime_error("教学示例文件打开失败。");
        }
    }

    ~FileHandle()
    {
        if (file_ != nullptr)
        {
            std::fclose(file_);
        }
    }

    FileHandle(const FileHandle&) = delete;
    FileHandle& operator=(const FileHandle&) = delete;

    FileHandle(FileHandle&& other) noexcept
        : file_(other.file_)
    {
        // 转移所有权后，源对象不再负责关闭文件。
        other.file_ = nullptr;
    }

    FileHandle& operator=(FileHandle&& other) noexcept
    {
        if (this == &other)
        {
            return *this;
        }

        if (file_ != nullptr)
        {
            std::fclose(file_);
        }

        file_ = other.file_;
        other.file_ = nullptr;
        return *this;
    }

    std::FILE* get() const noexcept
    {
        return file_;
    }

private:
    std::FILE* file_;
};
```

这个教学类型展示：

- 构造失败时抛出异常，不产生一个假装有效的对象；
- 析构函数释放资源；
- 禁止复制，避免两个对象都以为自己负责关闭同一文件；
- 移动操作显式转移责任；
- 被移动对象进入不拥有资源的有效状态。

实际代码优先复用标准库和成熟资源封装。手写 RAII 类型时还要仔细验证移动赋值、自赋值、析构不抛异常等边界。

## RAII 的逐步状态

```text
尚未获得资源
    ↓ 构造
Owning：对象持有资源
    ↓ 移动
源对象 NonOwning，目标对象 Owning
    ↓ 离开作用域
析构 Owning 对象并释放资源
```

构造失败路径：

```text
尝试获取资源
    ↓ 失败
抛出异常
    ↓
对象未完成构造，不调用该对象析构函数
```

因此构造函数中若依次获取多个裸资源，后一个步骤失败时，前一个资源也必须已经由完成构造的成员对象管理。组合多个 RAII 成员比在构造函数末尾统一手工释放更安全。

## `std::unique_ptr`：独占所有权

`std::unique_ptr<T>` 表示一个资源在当前时刻只有一个所有者。

```cpp
#include <iostream>
#include <memory>

struct Message
{
    explicit Message(int value)
        : value(value)
    {
    }

    int value;
};

int main()
{
    auto first = std::make_unique<Message>(7);
    // 7 是教学示例值。

    std::unique_ptr<Message> second = std::move(first);

    if (first == nullptr)
    {
        std::cout << "所有权已转移\n";
    }

    std::cout << second->value << '\n';
}
```

逐步状态：

```text
make_unique 创建对象
    ↓
first 独占对象
    ↓ std::move
second 独占对象
first 不再拥有对象
    ↓
second 离开作用域，对象被销毁
```

`unique_ptr` 不能复制，但可以移动。`std::move` 本身只是允许选择移动操作，真正的所有权转移由移动构造或移动赋值完成。

### 自定义删除器

不是所有资源都用 `delete` 释放。`unique_ptr` 可以携带删除器：

```cpp
struct FileCloser
{
    void operator()(std::FILE* file) const noexcept
    {
        if (file != nullptr)
        {
            std::fclose(file);
        }
    }
};

using UniqueFile = std::unique_ptr<std::FILE, FileCloser>;
```

删除器类型可能影响 `unique_ptr` 的大小。具体对象布局是实现细节，不应假设智能指针永远只占一个机器字。

### 观察而不转移

函数若只在调用期间使用对象，可以接收引用或指针：

```cpp
void print(const Message& message)
{
    std::cout << message.value << '\n';
}

print(*second);
```

不要为了“安全”把所有参数都改成 `shared_ptr`。参数类型应该表达它是否共享所有权。

## `std::shared_ptr`：共享所有权

`std::shared_ptr<T>` 允许多个所有者共同延长对象生命周期。

常见实现使用控制块保存：

```text
强引用计数；
弱引用相关计数；
删除器；
可能还有分配器和其他实现数据。
```

控制块的具体布局不是 C++ 标准规定的固定 ABI。

### 最小示例

```cpp
#include <iostream>
#include <memory>

struct Document
{
    explicit Document(int id)
        : id(id)
    {
    }

    ~Document()
    {
        std::cout << "销毁教学示例文档\n";
    }

    int id;
};

int main()
{
    auto first = std::make_shared<Document>(42);
    // 42 是教学示例编号。

    {
        std::shared_ptr<Document> second = first;
        std::cout << second->id << '\n';
    } // second 释放一份共享所有权，对象仍由 first 拥有。

    std::cout << first->id << '\n';
} // 最后一份共享所有权结束，对象被销毁。
```

概念状态：

```text
first 创建共享所有权
    ↓
second 复制，共享所有权数量增加
    ↓
second 析构，数量减少
    ↓
first 析构，最后一份共享所有权结束
    ↓
托管对象析构
```

引用计数的精确内部表示与更新策略属于实现细节。

### `make_shared`

`std::make_shared<T>` 一次建立对象和相应共享所有权管理信息。

实现通常可以把对象与控制块放在一次分配中，从而减少分配次数并改善局部性，但不应依赖它们的具体相邻布局。

当仍有 `weak_ptr` 关联控制块时，即使托管对象已经析构，合并分配所占的整块存储也可能继续保留到弱引用结束。这是选择 `make_shared` 时需要理解的生命周期代价。

### 不要从同一个裸指针创建两个独立控制块

```cpp
int* raw = new int(5); // 5 是教学示例值。

std::shared_ptr<int> first(raw);
// std::shared_ptr<int> second(raw); // 错误所有权设计
```

若 `first` 和 `second` 分别从同一个裸指针构造，它们不知道彼此存在，会分别认为自己最终负责删除对象，可能导致重复释放和未定义行为。

共享所有权必须通过已有 `shared_ptr` 复制，或从同一控制块派生。

## `std::weak_ptr`：不延长生命周期的观察者

`std::weak_ptr<T>` 与 `shared_ptr` 关联，但不增加强所有权。

使用前通过 `lock()` 尝试取得临时 `shared_ptr`：

```cpp
#include <iostream>
#include <memory>

int main()
{
    std::weak_ptr<int> observer;

    {
        auto owner = std::make_shared<int>(9);
        observer = owner;
        // 9 是教学示例值。

        if (auto value = observer.lock())
        {
            std::cout << *value << '\n';
        }
    }

    if (observer.expired())
    {
        std::cout << "教学示例对象已结束生命周期\n";
    }
}
```

逐步状态：

```text
owner 持有对象
observer 只观察控制块
    ↓
lock 成功，临时 shared_ptr 保证本次使用期间对象存活
    ↓
owner 和临时所有者都结束
对象析构
    ↓
observer 仍可判断过期，但不能取得对象
```

不要先调用 `expired()` 再假设对象持续有效。检查与使用之间可能发生状态变化。`lock()` 把“检查并在成功时取得临时所有权”合成一个操作。

## 共享指针环

如果两个对象用 `shared_ptr` 互相拥有，强引用计数可能永远不能归零。

```cpp
struct Parent;

struct Child
{
    std::shared_ptr<Parent> parent;
};

struct Parent
{
    std::shared_ptr<Child> child;
};
```

教学环：

```text
Parent --shared--> Child
   ^                 |
   |------shared-----|
```

外部所有者离开后，两个对象仍互相提供强所有权，不能自动销毁。

如果子对象只需要观察父对象，而不负责延长父对象生命周期，可以把反向关系改为 `weak_ptr`：

```cpp
struct Child
{
    std::weak_ptr<Parent> parent;
};
```

但不能机械规定“反向指针一律 weak”。必须先画出所有权图，确定哪条边真正负责延长生命周期。

## `enable_shared_from_this`

对象成员有时需要取得与现有控制块共享所有权的 `shared_ptr`：

```cpp
struct Node : std::enable_shared_from_this<Node>
{
    std::shared_ptr<Node> share()
    {
        return shared_from_this();
    }
};

auto node = std::make_shared<Node>();
auto sameOwner = node->share();
```

不能在成员函数中写：

```cpp
// return std::shared_ptr<Node>(this);
```

这会创建新的独立控制块，产生重复释放风险。

`shared_from_this()` 只有在对象已经由合适的 `shared_ptr` 所有权关系管理后才能成功使用。过早调用会失败；构造函数执行期间通常尚不具备可用的共享所有权上下文。

## 智能指针的线程安全边界

“`shared_ptr` 是线程安全的”这句话不够精确。

C++ 标准提供的关键边界是：

```text
不同 shared_ptr 对象即使共享同一控制块，
也可以由不同线程执行相应的所有权操作，
而不会仅因控制块引用计数产生数据竞争。
```

例如两个线程各自持有 `shared_ptr` 副本，并分别销毁自己的副本，控制块计数管理具备所需同步。

但以下内容不自动安全：

### 同一个 `shared_ptr` 对象

多个线程同时对同一个 `shared_ptr` 变量执行非只读操作，会产生数据竞争，除非使用相应同步机制或 `std::atomic<std::shared_ptr<T>>`。

```cpp
std::shared_ptr<int> sharedVariable;
```

“同一控制块”与“同一个变量对象”是两个不同概念。

### 指向的对象

引用计数安全不代表 `T` 的成员安全：

```cpp
auto value = std::make_shared<int>(0);
```

多个线程同时写 `*value` 仍需要满足普通数据竞争规则。`shared_ptr` 管理生命周期，不为对象内容自动加锁。

### `weak_ptr::lock`

`lock()` 能以线程安全的所有权语义尝试取得共享所有权，但取得对象后怎样访问其成员，仍由对象自己的同步策略决定。

### `unique_ptr`

`unique_ptr` 表达单一所有权，但它可以被移动到另一个线程。转移前后必须有明确同步，不能在一个线程移动所有权时另一个线程仍访问原指针。

## 异常与失败路径

### 分配失败

`make_unique` 和 `make_shared` 在无法分配时通常通过异常报告失败。不要捕获后返回一个未经约定的空指针并声称创建成功。

### 解引用空智能指针

默认构造、移动后的 `unique_ptr`、失败的 `weak_ptr::lock` 都可能得到空状态。解引用前必须由控制流证明非空。

### `release()` 后遗失裸指针

`unique_ptr::release()` 放弃所有权并返回裸指针，但不删除对象。调用方必须立即把责任交给另一个明确所有者，否则会泄漏。

### 错误使用 `get()`

`get()` 只借出裸指针，不转移所有权。把它交给会 `delete` 的代码会造成重复释放。

### 循环强引用

所有引用计数都可能正常工作，但计数永远不归零，造成逻辑泄漏。

### 析构函数抛出异常

资源释放函数应设计为不抛异常。尤其在栈展开期间，析构函数再抛异常可能导致程序终止。需要报告关闭失败的资源，应提供显式关闭操作并设计错误边界，同时让析构保持不抛异常。

### 所有权语义不清

一个函数接收裸指针并不自动说明它会不会保存或删除该指针。接口应通过引用、智能指针类型、命名和文档明确借用与转移。

## 标准保证与常见实现细节

| 问题 | 标准语义 | 常见实现 |
|---|---|---|
| `unique_ptr` 是否独占 | 不可复制、可移动，按删除器释放 | 保存指针及可能的删除器状态 |
| `shared_ptr` 何时销毁对象 | 最后一份强所有权结束 | 控制块维护原子式引用计数 |
| 控制块布局 | 未规定固定布局 | 存放强弱计数、删除器等 |
| `make_shared` 对象地址关系 | 不应依赖具体布局 | 常见为对象与控制块合并分配 |
| `weak_ptr` 是否延长对象生命 | 不延长强所有权 | 保留控制块观察关系 |
| 引用计数是否保护对象内容 | 不保护 `T` 的普通成员访问 | 只同步所有权元数据 |

写可移植代码时依赖左侧语义；分析内存和性能时再结合具体标准库实现。

## 怎样选择所有权类型

```text
对象只由一个责任方拥有
    -> unique_ptr

所有权需要明确转移
    -> 移动 unique_ptr

多个独立责任方确实需要共同延长生命周期
    -> shared_ptr

只观察共享对象，不负责延长生命周期
    -> weak_ptr

仅在调用期间借用，调用者保证生命周期
    -> 引用或非拥有指针
```

优先从 `unique_ptr` 开始，因为它的所有权图最清楚。只有确认存在真实共享生命周期需求时，才引入 `shared_ptr`。

## 复杂度与代价

| 操作 | 常见抽象时间 | 主要代价 |
|---|---:|---|
| `unique_ptr` 移动 | `O(1)` | 转移指针与删除器状态 |
| `unique_ptr` 析构 | `O(1)` 加资源释放成本 | 调用删除器 |
| `shared_ptr` 复制 | `O(1)` | 更新共享计数，可能含同步成本 |
| `shared_ptr` 析构 | `O(1)` 加可能的对象销毁 | 更新计数 |
| `weak_ptr::lock` | `O(1)` | 尝试增加强所有权 |
| `make_shared` | `O(1)` 次对象建立，加构造成本 | 分配与控制块管理 |

智能指针解决的是生命周期正确性，不保证它们没有成本：

- `shared_ptr` 的控制块需要额外内存；
- 引用计数更新可能带来跨线程同步与缓存竞争；
- 自定义删除器和分配器增加类型或控制块状态；
- `weak_ptr` 可能让控制块在对象析构后继续存活；
- 所有权图复杂时，理解成本会超过裸指针语法本身。

## 一段完整所有权示例

```cpp
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>

class Page
{
public:
    explicit Page(std::string title)
        : title_(std::move(title))
    {
    }

    const std::string& title() const noexcept
    {
        return title_;
    }

private:
    std::string title_;
};

class Viewer
{
public:
    explicit Viewer(std::weak_ptr<Page> page)
        : page_(std::move(page))
    {
    }

    void print() const
    {
        std::shared_ptr<Page> page = page_.lock();
        if (!page)
        {
            throw std::runtime_error("教学示例页面已结束生命周期。");
        }

        std::cout << page->title() << '\n';
    }

private:
    std::weak_ptr<Page> page_;
};

int main()
{
    auto page = std::make_shared<Page>("教学示例页面");
    Viewer viewer(page); // Viewer 只观察，不拥有 Page。

    viewer.print();
}
```

这里：

```text
main 中的 shared_ptr 拥有 Page；
Viewer 只保存 weak_ptr；
print 使用 lock 取得本次调用期间的临时所有权；
若 Page 已结束生命周期，失败通过异常保持可见。
```

## 小结

```text
RAII 把资源释放绑定到对象析构。
unique_ptr 表达独占所有权和可移动的责任。
shared_ptr 表达真实的共享生命周期。
weak_ptr 观察共享对象并打破不应存在的强所有权环。
引用计数线程安全不等于对象内容线程安全。
控制块和内存布局属于实现细节，不是固定标准 ABI。
```

选择智能指针前，先画出所有权图：

1. 哪条边负责让对象继续存活？
2. 哪条边只是临时借用？
3. 是否形成强引用环？
4. 所有权会在哪个线程转移或结束？
5. 资源释放失败怎样保持可见？

智能指针只有在这些问题已经清楚时，才能准确表达设计，而不是替代设计。
