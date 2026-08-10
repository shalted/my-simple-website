# UI 页面栈与面板池：导航历史、活动实例与可复用对象不是一回事

页面系统常同时维护三种状态：

- 页面栈：记录返回顺序和打开参数；
- 活动面板表：记录当前仍打开的实例；
- 面板池：保存已经关闭、可再次租用的实例。

把它们混为一个“页面列表”，重复打开、关闭动画、返回和复用就会互相覆盖。

## 跟着代码做：先实现最小返回栈

先只实现一个需求：打开首页，再打开设置页，按返回后回到首页。

```csharp
using System;
using System.Collections.Generic;

sealed class PageNavigator
{
    private readonly Stack<string> history = new();

    public void Open(string pageKey)
    {
        history.Push(pageKey);
        Console.WriteLine($"打开 {pageKey}");
    }

    public void Back()
    {
        if (history.Count <= 1)
            return;

        string closing = history.Pop();
        Console.WriteLine($"关闭 {closing}，返回 {history.Peek()}");
    }
}

PageNavigator navigator = new();
navigator.Open("Home");
navigator.Open("Settings");
navigator.Back();
```

运行状态逐步变化：

```text
Open(Home)     -> Stack = [Home]
Open(Settings) -> Stack = [Home, Settings]
Back()         -> Pop Settings，Stack = [Home]
```

这版能表达导航历史，但它只有字符串，不知道屏幕上真正显示的是哪个面板实例。

## 第二步：加入活动实例表

```csharp
sealed class Panel
{
    public string Key { get; }
    public bool Visible { get; private set; }

    public Panel(string key) => Key = key;

    public void Show()
    {
        Visible = true;
        Console.WriteLine($"显示实例 {Key}");
    }

    public void Hide()
    {
        Visible = false;
        Console.WriteLine($"隐藏实例 {Key}");
    }
}

readonly Dictionary<string, Panel> activePanels = new();
```

打开页面时既写历史，也登记真实实例：

```csharp
public Panel Open(string pageKey)
{
    if (activePanels.TryGetValue(pageKey, out Panel existing))
        return existing; // Single 页面不重复创建

    Panel panel = new(pageKey);
    panel.Show();
    activePanels.Add(pageKey, panel);
    history.Push(pageKey);
    return panel;
}
```

现在两个容器回答不同问题：

```text
history      -> 返回时应该关闭谁
activePanels -> 当前页面键对应哪个真实 Panel
```

例如覆盖页 `ConfirmDialog` 打开时，`Settings` 仍然可以保留在 `activePanels` 中；返回只关闭对话框，不必重新创建设置页。

## 第三步：关闭后不要销毁，放进池里

如果背包页经常开关，每次 `new Panel` 或加载预制体会产生重复成本。加入最小对象池：

```csharp
readonly Dictionary<string, Stack<Panel>> pool = new();

Panel Rent(string pageKey)
{
    if (pool.TryGetValue(pageKey, out Stack<Panel> panels) &&
        panels.Count > 0)
        return panels.Pop();

    return new Panel(pageKey);
}

void Return(Panel panel)
{
    panel.Hide();

    if (!pool.TryGetValue(panel.Key, out Stack<Panel> panels))
    {
        panels = new Stack<Panel>();
        pool.Add(panel.Key, panels);
    }

    panels.Push(panel);
}
```

然后把 `Open` 中的创建替换为：

```csharp
Panel panel = Rent(pageKey);
panel.Show();
activePanels.Add(pageKey, panel);
history.Push(pageKey);
```

运行两次打开/关闭背包：

```text
第一次 Open(Inventory)  -> 池为空，创建 Panel #1
Close(Inventory)         -> #1 隐藏并进入池
第二次 Open(Inventory)  -> 从池取出 #1，不再创建
```

## 第四步：复用前必须清理旧绑定

池化最危险的不是“取不到对象”，而是对象带着上一次使用的状态回来：

```csharp
sealed class Panel
{
    private Action? unsubscribe;

    public void Open(PlayerData data)
    {
        unsubscribe = data.GoldChanged.Subscribe(UpdateGold);
        UpdateGold(data.Gold);
        Show();
    }

    public void Close()
    {
        unsubscribe?.Invoke();
        unsubscribe = null;
        ClearViewState();
        Hide();
    }
}
```

如果 `Close` 不取消订阅，Panel #1 被另一个玩家数据复用后，旧玩家金币变化仍会调用它。于是完整顺序必须是：

```text
Rent -> 绑定本次数据 -> Show
Hide/动画结束 -> 取消本次绑定 -> 清理状态 -> Return
```

到这里再看文章开头的三个容器，就能沿一次调用区分它们：栈保存返回顺序，活动表保存正在使用的实例，池只保存已经清理、等待复用的实例。

## 1. 打开一页的完整链路

```text
解析页面定义与打开选项
    ↓
检查 Single 模式是否已有活动实例
    ↓
检查是否已有相同异步打开任务
    ↓
从池租用，或加载并创建面板
    ↓
预加载面板依赖
    ↓
挂到宿主或画布
    ↓
写入 ActivePanels
    ↓
按选项 Push StackFrame
    ↓
Open(data)：绑定、显示、动画、事件
```

教学场景使用“页面 A、页面 B、覆盖页 C”作为通用名称。

## 2. Single 与重复打开

Single 模式应先查活动实例。若实例仍有效，直接返回它，不再租用第二个面板，也不再压入重复栈帧。异步创建期间也可以共享同一个 PendingOpen，防止两个并发请求各自创建实例。

但“复用已有实例”是否会刷新新数据，要看 Open 的实际语义。如果面板已经处于 Open 状态，而 Open 直接返回，那么不能仅凭“重复打开成功”推断新 data 已被重新绑定；需要独立 Refresh 或明确的重复打开协议。

## 3. 页面栈只记录导航历史

栈帧可以记录页面键、打开数据、选项与打开时间。新面板完成挂载后，只有页面定义和本次选项都允许入栈时才 Push。

返回通常关闭栈顶：

```csharp
if (stack.Count <= 1)
    return;

Close(stack.Last.UIKey);
```

关闭流程会从栈中删除对应帧。覆盖页可以和下层页面同时保持 active；返回只关闭覆盖页，下层页面无需重新创建。

## 4. 面板池的创建与复用

可缓存页面先从池 Spawn：

- 命中：直接返回已有实例；
- 未命中：加载 Prefab、创建面板对象、Initialize 一次，并以 spawned 状态注册到池；
- 不允许缓存：创建独立实例，关闭时直接销毁。

关闭动画完成后才从 ActivePanels 删除并 Recycle。过早回池会让关闭动画与下一次打开同时操作同一对象。

池可以按最后访问时间清理：只有没有活动实例的过期池才能释放未使用对象、销毁池并释放其 Prefab 所有权。

## 5. 面板显示、绑定与隐藏

一次可复用面板应区分：

- `Initialize`：仅首次创建时缓存组件、建立动画控制；
- `Rent`：从池取出时保持隐藏，避免异步预载期间闪出旧画面；
- `Open(data)`：更新取消令牌，执行打开前数据设置，加载静态资源，先 Unbind 再 Bind，最后显示并播放动画；
- `Close`：取消面板令牌，执行关闭前逻辑，Unbind，再播放关闭动画；
- `Return`：隐藏，清宿主关系和状态，Unbind，Dispose ViewModel 与资源作用域；
- `Dispose`：先执行 Return 清理，再销毁对象。

绑定前先 Unbind 可以避免池对象残留上一次 ViewModel 的订阅。

## 6. 事件订阅与旧回调冲突

框架能统一清理 Binder，但页面子类在打开后自行订阅的业务事件，仍需要在关闭后显式解绑。一个安全模型是保存 `bindingVersion`：

```csharp
bindingVersion++;
var expected = bindingVersion;

subscription = source.Subscribe(value => {
    if (!IsOpen || expected != bindingVersion)
        return;
    Render(value);
});
```

Close 时 Dispose subscription 并增加版本。这样即使旧回调已经进入消息队列，版本检查也会阻止它改写复用后的页面。

版本保护是通用教学模型；若具体框架只提供可重写的 OnAfterOpen/OnAfterClose，而没有强制管理子类订阅，就不能宣称所有页面都会自动解绑。

## 7. 关闭与回收

```text
关闭宿主的子面板
    ↓
从 Canvas / Host 脱离
    ↓
从页面栈移除
    ↓
Close：取消令牌、Unbind、关闭动画
    ↓ animation complete
从 ActivePanels 删除
    ↓
可缓存 → Unspawn 回池
不可缓存 → Destroy
```

Shutdown 会立即关闭所有活动面板、释放所有栈帧、销毁面板池并清空活动表和 PendingOpen。

## 8. 复杂度与边界

- 活动面板按键查询平均 `O(1)`；
- Push 栈帧 `O(1)`，按 key 从后向前移除最坏 `O(S)`；
- 关闭同一 ID 的多个实例需要遍历快照；
- 池命中避免加载与实例化，但增加闲置内存；
- 过期池扫描约 `O(P)`，P 为池数量。

必须单独验证的边界：

- 重复打开已处于 Open 的 Single 页面是否消费新 data；
- 自定义事件是否在 OnAfterClose 中解除；
- 关闭动画期间的重复 Close；
- 异步预载失败后是否回收面板并释放临时 Scope；
- 宿主不存在时，子面板必须拒绝挂到全局层；
- 页面回池后旧异步回调是否有取消令牌或绑定版本保护；
- 关停捷径是否也显式取消并释放面板令牌。
