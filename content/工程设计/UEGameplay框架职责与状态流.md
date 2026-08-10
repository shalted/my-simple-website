# UE Gameplay 框架：职责与状态流

分类：工程设计

## 生活化模型：一场有裁判和记分牌的比赛

可以把一局多人比赛想成：

```text
裁判：决定规则、允许谁入场、何时开始和结束。
记分牌：展示所有参赛者都应该知道的局面。
每位参赛者的遥控席：接收这个人的操作意图。
场上的运动员：在世界中移动、碰撞并执行动作。
场地物件：球门、球、触发区和道具。
物件上的部件：碰撞、外观、声音、移动能力。
```

这个类比对应 UE Gameplay Framework 中几个常见职责：

```text
GameMode         → 服务端规则与流程裁决
GameState        → 全局可观察的会话状态
PlayerController → 某位人类玩家的控制入口
Pawn             → 可被玩家或 AI Controller 控制的场上 Actor
Actor            → 能存在于世界中的基础对象
Component        → 组合到 Actor 上的可复用能力或数据
```

类比只帮助理解职责，不能替代引擎的生命周期、网络权限和复制规则。

## 通用概念与 UE 具体约定

“规则、共享状态、输入代理、世界实体、组合能力”是通用架构概念。

下面这些则是 UE Gameplay Framework 的具体约定：

```text
AGameModeBase / AGameMode 作为规则类。
AGameStateBase / AGameState 作为全局状态类。
APlayerController 代表人类玩家的 Controller。
APawn 是可被 Controller Possess 的 Actor。
AActor 是世界对象的基础类型。
UActorComponent 及其派生类型用于组合 Actor 能力。
```

其他框架可能把这些职责合并或拆得更细。不能因为 UE 有这些类，就把同样的类名当成所有游戏架构的必需结构。

## 跟着代码走一遍：玩家加入一局游戏

先设一个具体目标：玩家连接服务器后生成一个角色；服务器把在线人数写入共享状态；玩家按键后控制自己的角色移动。

下面是 UE C++ 教学骨架。它依赖 Unreal 类型和宏，不是独立控制台程序，但每段都可以对应到 UE 项目中的一个类。

### 第一步：GameMode 接受玩家并生成 Pawn

```cpp
void AMyGameMode::PostLogin(APlayerController* NewPlayer)
{
    Super::PostLogin(NewPlayer);

    APawn* NewPawn = SpawnDefaultPawnFor(
        NewPlayer,
        FindPlayerStart(NewPlayer));

    NewPlayer->Possess(NewPawn);

    AMyGameState* SharedState = GetGameState<AMyGameState>();
    SharedState->SetPlayerCount(GetNumPlayers());
}
```

沿调用顺序看：

```text
PostLogin(NewPlayer)          服务器确认一名玩家完成登录
FindPlayerStart              规则层选择出生点
SpawnDefaultPawnFor          在世界中创建可控制角色
Possess(NewPawn)             Controller 与 Pawn 建立控制关系
SetPlayerCount               把所有客户端需要看到的信息写进 GameState
```

这里故意没有把人数存在 `GameMode` 里供客户端读取。`GameMode` 只存在于服务端；共享信息应该进入可复制的 `GameState`。

### 第二步：GameState 复制共享人数

```cpp
UCLASS()
class AMyGameState : public AGameStateBase
{
    GENERATED_BODY()

public:
    UPROPERTY(ReplicatedUsing = OnRep_PlayerCount)
    int32 PlayerCount = 0;

    void SetPlayerCount(int32 NewCount)
    {
        check(HasAuthority());
        PlayerCount = NewCount;
        OnRep_PlayerCount(); // 让服务器本地界面也走同一刷新入口
    }

protected:
    UFUNCTION()
    void OnRep_PlayerCount()
    {
        UE_LOG(LogTemp, Log, TEXT("当前玩家数: %d"), PlayerCount);
    }
};
```

运行两名玩家加入的测试时，状态变化应是：

```text
玩家 A 登录 -> 服务端 PlayerCount = 1 -> 客户端收到 1
玩家 B 登录 -> 服务端 PlayerCount = 2 -> 两个客户端都收到 2
```

`OnRep_PlayerCount` 不是决定人数的地方，它只消费服务器已经决定的结果。规则仍归 `GameMode`，共享事实归 `GameState`。

项目中还要在 `GetLifetimeReplicatedProps` 注册该字段：

```cpp
void AMyGameState::GetLifetimeReplicatedProps(
    TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);
    DOREPLIFETIME(AMyGameState, PlayerCount);
}
```

### 第三步：Pawn 接收本地移动输入

```cpp
void AMyCharacter::SetupPlayerInputComponent(
    UInputComponent* PlayerInputComponent)
{
    Super::SetupPlayerInputComponent(PlayerInputComponent);
    PlayerInputComponent->BindAxis(
        "MoveForward", this, &AMyCharacter::MoveForward);
}

void AMyCharacter::MoveForward(float Value)
{
    if (!FMath::IsNearlyZero(Value))
        AddMovementInput(GetActorForwardVector(), Value);
}
```

按下 `W` 后的职责链是：

```text
本机输入系统产生 MoveForward = 1
-> 当前玩家控制的 Pawn 收到输入
-> Pawn 把移动意图交给 MovementComponent
-> CharacterMovement 处理预测、服务端验证与移动复制
```

这里不应让 `GameMode` 每帧读取键盘，也不需要把移动输入写进 `GameState`。它们分别是规则层和共享会话状态，不是某个 Pawn 的运动入口。

### 第四步：把整条运行链连起来

在 PIE 中用 `2 Players`、`Play As Listen Server` 测试，可以沿日志观察：

```text
1. 服务端 AMyGameMode::PostLogin 被调用两次
2. 每次为对应 PlayerController 生成并 Possess 一个 Pawn
3. AMyGameState::PlayerCount 从 1 变成 2
4. 客户端 OnRep_PlayerCount 收到共享人数
5. 每个客户端的输入只驱动自己 Possess 的 Pawn
```

如果出现问题，可以按职责反查：

```text
没有生成角色       -> 查 GameMode 的出生规则和 PlayerStart
角色生成但不能控制 -> 查 PlayerController 是否成功 Possess
服务端人数正确但 UI 不更新 -> 查 GameState 字段是否注册复制和 OnRep
所有角色一起响应输入 -> 查输入是否错误地写在全局对象上
```

这就是后文职责图的实际用途：不是记继承关系，而是让一次运行故障能够沿所有权边界定位。

## 职责图

```text
                    服务端

          ┌─────────────────────┐
          │      GameMode       │
          │ 规则、准入、出生流程 │
          └──────────┬──────────┘
                     │ 更新全局结果
                     ▼
          ┌─────────────────────┐
          │      GameState      │────────复制────────> 客户端可观察状态
          └─────────────────────┘

拥有客户端输入
      │
      ▼
┌──────────────────┐   Possess   ┌──────────────────┐
│ PlayerController │────────────>│       Pawn       │
│ 玩家意图与视角入口│             │ 世界中的受控实体  │
└──────────────────┘             └────────┬─────────┘
                                          │ 是一种
                                          ▼
                                  ┌──────────────────┐
                                  │      Actor       │
                                  │ 世界身份与生命周期│
                                  └────────┬─────────┘
                                           │ 拥有
                                  ┌────────▼─────────┐
                                  │    Components    │
                                  │ 碰撞、表现、移动等│
                                  └──────────────────┘
```

这张图表示职责与常见关系，不表示每次调用都沿箭头直接发生，也不表示所有属性都会自动复制。

## Actor：世界对象的基础

`AActor` 是 UE 中可以放入关卡或在运行时生成、销毁的世界对象基础类型。许多 Gameplay Framework 类型本身也是 Actor 的派生类。

Actor 常负责：

```text
世界中的身份与生命周期。
变换或变换根节点的组织。
拥有一组 Actor Components。
按明确配置参与网络复制。
接收引擎生命周期事件。
```

不要把 Actor 等同于“所有数据对象”。不需要世界身份、生成销毁或组件组合的数据，未必应该做成 Actor。

### 网络边界

Actor 支持网络复制机制，不等于：

```text
创建 Actor 后所有客户端天然都有完全相同的数据。
```

是否复制、复制哪些属性、由谁拥有、哪些连接相关，都是具体配置和代码选择。

## Component：组合能力

Actor Component 是附着于 Actor 的可复用构建块。

适合表达：

```text
可被多个 Actor 复用的能力。
与拥有者生命周期相关的数据。
碰撞、移动、音频、渲染等可组合职责。
```

UE 中 Component 还有不同派生层次。例如需要变换层级的 Scene Component 与不以场景变换为核心的一般 Actor Component 并不相同。

Component 不应被理解为：

```text
脱离拥有者的全局规则中心。
任意跨世界对象共享的单例。
自动拥有网络权威的模块。
```

组件是否复制及如何初始化仍取决于具体类型和配置。

## Pawn：可被控制的世界实体

`APawn` 是一种 Actor，核心语义是：

```text
它可以被玩家 Controller 或 AI Controller 控制。
```

Pawn 可以是人物、车辆或其他可控实体，并不天然限定为人形。

Pawn 通常承载：

```text
世界中的身体表现。
移动与碰撞相关组件。
与当前身体绑定的动作状态。
接受 Controller 转换后的控制意图。
```

“可以被控制”不等于“当前一定已被 Possess”。一个 Pawn 可以暂时没有 Controller，一个 Controller 也可能在切换 Pawn 时暂时没有受控对象。

## PlayerController：玩家控制入口

`APlayerController` 是用于人类玩家的 Controller。它可以 Possess Pawn，把玩家输入与视角意图传给当前受控对象。

适合承载：

```text
与玩家连接和控制视角相关的逻辑。
输入意图到受控 Pawn 命令的转换。
切换或失去 Pawn 后仍应存在的控制上下文。
拥有客户端与服务端之间的玩家请求入口。
```

### 网络可见性边界

在网络游戏中，某位玩家的 PlayerController 通常存在于：

```text
服务端。
该玩家自己的拥有客户端。
```

其他远端客户端通常没有这位玩家的 PlayerController 实例。因此“让所有客户端从其他人的 PlayerController 读取公开数据”不是可靠设计。

面向所有人的玩家状态通常应由合适的复制对象承担；具体是否使用 PlayerState 取决于数据语义。本文只聚焦题目指定的六类职责。

## GameMode：服务端规则与流程

`AGameModeBase` / `AGameMode` 表达当前会话的规则和结构，例如：

```text
玩家如何加入。
使用哪些默认框架类型。
如何选择出生位置与生成 Pawn。
何时允许开始、暂停或结束。
如何判定规则事件。
```

关键边界：

```text
GameMode 实例只存在于服务端，不复制给远端客户端。
```

所以客户端不能把读取 GameMode 变量当成获取实时规则状态的通用方式。

`AGameMode` 在 `AGameModeBase` 基础上提供了更具体的 Match State 支持；选择哪一个是 UE 内的实现决定，不是所有玩法都必须使用完整比赛状态机。

## GameState：全局可观察状态

`AGameStateBase` / `AGameState` 表达与当前会话相关、并且需要让所有连接方知道的状态。

例如：

```text
会话是否已经开始。
全局阶段。
队伍分数。
公共目标进度。
所有参与者都需要观察的计时信息。
```

GameState 存在于服务端，并可复制到客户端。它不是第二个 GameMode：

```text
GameMode 决定和裁决规则。
GameState 公开规则执行后形成的全局事实。
```

客户端看到复制后的 GameState 是已同步状态，不意味着客户端获得了服务端裁决权。

## 一次加入与受控流程

下面是职责级状态流，具体回调名称和扩展点应以所用 UE 版本文档为准：

```text
1. 世界加载并选择 GameMode 类型。
2. 服务端创建 GameMode 与对应 GameState。
3. 玩家连接请求到达服务端。
4. GameMode 执行准入和加入流程。
5. 服务端建立该玩家的 PlayerController。
6. GameMode 按规则选择出生位置并创建 Pawn。
7. PlayerController Possess Pawn。
8. 拥有客户端产生输入意图。
9. 服务端验证并驱动权威状态变化。
10. 公共结果写入合适的复制状态，例如 GameState。
11. 客户端接收状态更新并刷新表现。
```

不是每个体验都必须自动生成默认 Pawn。观察者、载具切换、死亡等待或无身体控制模式都可能改变第 6、7 步。

## 最小伪代码

以下伪代码表达职责，不对应完整 UE API：

```text
class SessionGameMode:
    function TryJoin(connection):
        decision = ValidateJoinRules(connection)

        if decision is Failure:
            return Failure(decision.Error)

        controller = CreatePlayerController(connection)
        spawn = SelectAndValidateSpawn(controller)

        if spawn is Failure:
            return Failure(spawn.Error)

        pawn = SpawnPawn(spawn.Position)

        if pawn is Failure:
            return Failure(pawn.Error)

        controller.Possess(pawn)
        return Success(controller)

    function ApplyScoringEvent(event):
        result = EvaluateAuthoritativeRule(event)

        if result is Failure:
            return Failure(result.Error)

        SessionGameState.PublishScore(result.NewScore)
        return Success
```

这里没有“出生失败就使用原点”或“规则失败仍返回成功”的分支。出生选择、默认 Pawn 类型和失败处理都必须来自明确规则。

## 可交互的逐步状态

教学面板可以同时显示：

| 步骤 | 服务端对象 | 拥有客户端对象 | 其他客户端对象 |
|---|---|---|---|
| 世界建立 | GameMode、GameState | GameState 副本 | GameState 副本 |
| 玩家加入 | PlayerController 建立 | 自己的 PlayerController | 不持有该远端 PlayerController |
| Pawn 生成 | 权威 Pawn | 相关 Pawn 表现 | 相关 Pawn 表现 |
| Possess | 绑定 Controller 与 Pawn | 获得控制关系 | 只观察相关状态 |
| 规则更新 | GameMode 裁决 | 接收 GameState 更新 | 接收 GameState 更新 |

这是一张**教学状态表**。实际网络相关性、生成时序和对象复制必须以运行配置为准。

可交互演示可以切换：

```text
准入成功或失败。
Pawn 生成成功或失败。
Possess、UnPossess 与切换 Pawn。
GameMode 规则变化是否正确写入 GameState。
某字段配置为复制或不复制。
```

## 正常路径

```text
服务端 GameMode 接受玩家。
PlayerController 建立。
合法出生位置被规则确认。
Pawn 成功生成并被 Possess。
输入从拥有玩家进入控制链。
服务端裁决产生全局结果。
GameState 把公共状态同步给客户端。
```

## 边界路径

```text
Controller 已存在，但 Pawn 尚未生成。
Pawn 已销毁，PlayerController 等待重新 Possess。
一个 PlayerController 在不同 Pawn 之间切换。
Pawn 由 AIController 而不是 PlayerController 控制。
客户端收到 GameState，但相关 Pawn 尚未完成生成。
Component 初始化顺序与 Actor 生命周期交错。
关卡切换导致世界级 Actor 生命周期结束。
```

这些状态都说明“玩家、控制者和身体”不是同一个对象。

## 失败路径

```text
客户端尝试读取不存在的远端 PlayerController。
把仅服务端存在的 GameMode 当成客户端数据源。
把公共比赛状态只存在 GameMode，导致客户端无法观察。
出生点无效但仍生成 Pawn。
Possess 失败后仍报告玩家已可控制。
Actor 复制开启，但关键属性未按规则复制。
Component 依赖的拥有者状态尚未准备好。
服务端拒绝请求，却由客户端本地表现成规则已成功。
```

失败必须保留所属阶段和原因，不能用默认 Pawn、默认出生点或默认成功掩盖。

## 代价与权衡

职责分离增加：

```text
对象之间的状态同步。
生命周期与初始化顺序管理。
服务端权威和客户端表现的两套观察视角。
复制配置、带宽和调试成本。
Possess 与重生等边界状态。
```

它换来：

```text
规则、公开状态、玩家控制和世界身体不再混成一个类。
Pawn 可以切换，而玩家控制上下文继续存在。
客户端只接收需要观察的状态，不获得服务端规则对象。
Actor 能通过 Component 组合能力。
```

Component 过细会增加依赖和调度成本，过粗又会降低复用；复制字段过多增加网络代价，过少则无法形成正确客户端状态。这些粒度需要根据已验证的数据所有权决定。

## 最重要的收获

```text
GameMode 是服务端规则裁决者。
GameState 是面向全体的会话状态。
PlayerController 是某位人类玩家的控制入口，不会出现在所有远端客户端。
Pawn 是可被 Controller 控制的 Actor，不等于玩家身份本身。
Actor 提供世界身份与生命周期。
Component 为 Actor 组合可复用职责。
框架类型给出边界，但具体数据放置、复制与失败策略仍需明确设计。
```
