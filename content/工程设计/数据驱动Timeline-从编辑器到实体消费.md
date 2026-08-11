# 数据驱动 Timeline：从编辑器到实体消费

## 先说结论

Timeline 源数据由编辑器修改，构建阶段把它验证并编译成运行时快照，播放实例按固定逻辑帧推进，Clip 只发语义命令，最终由实体系统仲裁和落地。编辑器预览、配置快照和运行实例是三个不同状态。

### 一条 1.2 秒技能时间线

| Clip | 开始 | 结束 | 语义 |
|---|---:|---:|---|
| Windup | 0.0 | 0.3 | 禁止移动 |
| Hit | 0.3 | 0.4 | 发起一次命中查询 |
| Recover | 0.4 | 1.2 | 保持后摇，结束时恢复移动 |

逻辑帧从 0.25 跳到 0.45 时，系统不能漏掉 0.3 的 Hit 边界；它应补处理跨越区间内的进入、更新和退出事件。若实体在 0.35 被眩晕，Timeline 只提出命令，是否中断由实体侧规则决定。

分类：工程设计

## 先建立完整心智模型

一套可用于战斗、剧情或复杂交互的 Timeline，不只是“在某一秒播放动画”。它更像一条小型编译与执行管线：编辑器负责描述意图，构建阶段负责验证并生成运行时数据，播放器负责调度，实体组件负责真正执行。

> Timeline 是[一次技能从输入到结束](./一次技能从输入到结束.md)中的执行编排环节。这里深入讲编辑、构建、播放与 Task 生命周期；完整的激活、命中、结算和清理链路请回到父专题查看。

- 编辑态只描述“何时发生什么”
- 构建阶段把宽松配置变成确定的运行时结构
- 播放器只维护时间与 Clip 生命周期
- Task 把时间事件翻译成语义命令
- 实体组件仲裁多个系统的请求并落地

```text
编辑数据
  ↓ 校验与派生
运行时快照
  ↓ 建立索引
Timeline 实例
  ↓ 固定帧调度
Task 生命周期
  ↓ 语义命令
实体组件消费
```

这条边界非常重要：Timeline 决定顺序，实体决定如何执行。

## 第一步：准备最小数据模型

编辑器首先需要一套稳定、可序列化的数据模型。最小结构可以收敛为四层：

- Timeline：唯一标识、名称、轨道集合
- Track：用于组织同类片段，本身通常不执行逻辑
- Clip：开始帧、结束帧、名称和 Task
- Task：类型标识与该类型需要的参数

可以先把它写成不依赖任何引擎对象的纯数据类型，让编辑器数据可以独立保存、校验和构建。

```csharp
// 编辑态根对象：只保存可序列化数据，不保存播放进度。
public sealed record TimelineDocument(
    string Id,
    IReadOnlyList<TrackDocument> Tracks);

// Track 负责组织内容与提升可读性，不参与运行时业务判断。
public sealed record TrackDocument(
    string Name,
    TrackKind Kind,
    IReadOnlyList<ClipDocument> Clips);

// Clip 是最小调度单元，帧区间与 Task 一起保存。
public sealed record ClipDocument(
    int StartFrame,
    int EndFrame,
    TaskDefinition Task);

// Task 参数保持为纯数据，运行时再实例化具体执行器。
public abstract record TaskDefinition;
public sealed record PlayAnimationTask(string AnimationKey) : TaskDefinition;
public sealed record PlayAudioTask(string AudioKey) : TaskDefinition;
public sealed record ApplyHitTask(string HitProfile) : TaskDefinition;
public sealed record MovementLockTask(bool Locked) : TaskDefinition;
```

这里故意没有 `currentFrame`、预览对象或运行时 Task 实例。它们属于一次播放过程，不应该被保存进编辑文档。编辑器真正修改的只有 `StartFrame`、`EndFrame` 和 Task 参数。示例采用系统统一的全局逻辑帧率；如果另一套系统选择让每条 Timeline 自带帧率，也必须明确它是源字段还是全局调度规则，不能让网页播放速度冒充导出配置。

```text
Timeline
├─ Track：表现
│  ├─ Clip：0—12 帧 / 播放动作
│  └─ Clip：6—10 帧 / 播放音效
├─ Track：判定
│  └─ Clip：8—9 帧 / 执行命中
└─ Track：控制
   └─ Clip：0—14 帧 / 锁定普通移动
```

轨道主要解决可读性，Clip 才是运行时调度的基本单位。不要让轨道名称参与关键业务判断，否则改名就可能改变行为。

## 第二步：让编辑器只修改源数据

时间线窗口的职责是把拖拽、缩放、复制、删除等可视化操作转换成源数据变化，而不是直接创建运行时对象。

- 拖动 Clip：修改开始帧与结束帧
- 改变 Task 类型：替换参数结构
- 编辑参数：写回对应字段
- 撤销与重做：保存数据快照，而不是回滚场景对象
- 保存前：统一修正区间并执行结构校验

```pseudo
onClipDragged(clip, nextStart, nextEnd):
    clip.start = max(0, nextStart)
    clip.end = max(clip.start, nextEnd)
    markDocumentChanged()
```

这样编辑器 UI 可以不断重建，而真正的数据仍然稳定存在。窗口关闭、布局变化或预览对象销毁，都不应该破坏 Timeline 源数据。

一次拖动可以拆成四步：读取指针位移、换算成帧差、修正合法范围、写回文档。预览器只是在写回以后重新采样同一份数据。

```pseudo
onPointerMove(pointerX):
    deltaPixel = pointerX - dragStartX
    deltaFrame = round(deltaPixel / pixelsPerFrame)

    nextStart = originalStart + deltaFrame
    nextEnd   = originalEnd + deltaFrame

    require nextStart >= 0
    require nextEnd < editorFrameCount

    clip.startFrame = nextStart
    clip.endFrame   = nextEnd
    preview.sample(currentPreviewFrame, document)
```

编辑器保存的源数据可以使用 JSON、YAML 或其他序列化格式。下面给出与页面实验一致的 JSON 示例；它描述的是“作者编辑了什么”，还不是运行时对象。

```json
{
  "id": "demo_attack",
  "tracks": [
    {
      "name": "动作",
      "kind": "Action",
      "clips": [
        { "start": 0, "end": 12, "task": { "type": "PlayAnimation", "animationKey": "attack_basic" } }
      ]
    },
    {
      "name": "音效",
      "kind": "Audio",
      "clips": [
        { "start": 6, "end": 10, "task": { "type": "PlayAudio", "audioKey": "swing" } }
      ]
    },
    {
      "name": "判定",
      "kind": "Gameplay",
      "clips": [
        { "start": 8, "end": 9, "task": { "type": "ApplyHit", "hitProfile": "normal_hit" } }
      ]
    },
    {
      "name": "状态",
      "kind": "State",
      "clips": [
        { "start": 0, "end": 14, "task": { "type": "MovementLock", "locked": true } }
      ]
    }
  ]
}
```

读这个数据时要抓住两点：Track 只是分组；真正参与调度的是四个 Clip。资源只保存稳定键，不保存编辑器预览对象。

## 第三步：区分源字段与派生字段

总时长、缓存索引、运行时句柄等字段可以从 Clip 推导出来，不应要求使用者重复维护。典型做法是把总生命周期定义为所有 Clip 结束帧的最大值。

- 源数据保存开始帧、结束帧和参数
- 总生命周期在保存或构建时重新计算
- 预览资源、临时模型和当前播放帧不进入运行时配置
- 能推导的值不允许形成第二份人工真相

```pseudo
lifeTime = 1
for each track:
    for each clip:
        lifeTime = max(lifeTime, clip.endFrame)
```

如果总时长既能手填又能自动计算，就可能出现“Clip 已结束，但 Timeline 仍占用控制锁”的幽灵时间。派生字段只有一个计算入口，能够消除这类不一致。

构建以后可以保留 Track 作为组织层，也可以生成只含 Clip 的调度视图。关键不是必须展平，而是运行时调度不依赖 Track 名称。下面为了突出调度信息，展示同一份数据的展平视图：

```json
{
  "id": "demo_attack",
  "lifeTime": 14,
  "clips": [
    { "start": 0, "end": 12, "taskType": "PlayAnimation", "payload": { "animationKey": "attack_basic" } },
    { "start": 6, "end": 10, "taskType": "PlayAudio", "payload": { "audioKey": "swing" } },
    { "start": 8, "end": 9, "taskType": "ApplyHit", "payload": { "hitProfile": "normal_hit" } },
    { "start": 0, "end": 14, "taskType": "MovementLock", "payload": { "locked": true } }
  ]
}
```

`lifeTime = 14` 表示最后一个逻辑帧编号是 14，因此实际覆盖 0—14 共 15 帧。运行时不再依赖 Track 名称，也不需要重新解释编辑器布局。

## 第四步：预览不是运行时真相

编辑器预览可以采样动画、特效或位置，但它的目标是帮助创作者观察结果，不是替代真正的运行时执行。

- 预览允许使用临时对象和简化环境
- 预览只读取同一份 Clip 数据
- 预览状态必须与源数据分离
- 保存结果不能依赖当前场景中是否存在预览对象
- 最终正确性仍由运行时播放器验证

```text
同一份 Clip 数据
├─ 编辑器预览器：快速采样、方便拖动
└─ 运行时播放器：完整生命周期、真实实体与系统
```

预览与运行时可以共享数据契约，但不应共享大量执行代码。两者环境不同，强行共用会让编辑器依赖运行时世界，也会让运行时代码携带预览分支。

## 第五步：构建阶段设置两道校验门

保存时的第一道门检查单个 Timeline 的结构；构建时的第二道门检查整个数据世界。只有两层都通过，配置才能进入运行时。

- 结构校验：必填字段、合法 Task 类型、参数类型、帧区间
- 引用校验：资源、效果、目标定义等外部引用是否存在
- 语义校验：互斥参数、非法组合、超出能力范围的配置
- 唯一性校验：标识不能冲突
- 生命周期校验：运行时总帧数必须覆盖全部 Clip

```pseudo
validateDocument(timeline)
validateReferences(timeline, catalogs)
validateSemantics(timeline)

if errors.any:
    stopBuild(errors)
```

不要把损坏数据留到播放时才发现。编辑器错误离创作者最近，构建错误拥有完整上下文，这两个位置都比运行时更适合暴露问题。

## 第六步：把配置编译成运行时快照

通过校验后，源数据会被转换为强类型运行时快照。运行时不再逐个解析编辑文件，也不需要理解编辑器格式。

- 多态 Task 参数在构建阶段转换为明确类型
- 派生生命周期在这里写入
- 数据按类别分片，避免单个巨大文件
- 内容未变化时不重复写入
- 运行时只依赖生成结果，不依赖编辑工具

```csharp
TimelineData CompileTimeline(TimelineDocument source, ResourceCatalog catalog)
{
    // 一次收集全部构建错误，避免修完一个才看到下一个。
    var errors = ValidateStructure(source)
        .Concat(ValidateReferences(source, catalog))
        .Concat(ValidateSemantics(source))
        .ToArray();

    if (errors.Length > 0)
        throw new TimelineBuildException(errors);

    var runtimeClips = new List<CompiledClip>();

    // 这里选择生成调度视图；保留 Track 也可以，但调度不能依赖 Track 名称。
    foreach (TrackDocument track in source.Tracks)
    foreach (ClipDocument clip in track.Clips)
    {
        runtimeClips.Add(new CompiledClip(
            StartFrame: clip.StartFrame,
            EndFrame: clip.EndFrame,
            Task: CompileTask(clip.Task, catalog)));
    }

    // 生命周期由最晚结束的 Clip 推导，不维护第二份人工值。
    int lifeTime = runtimeClips.Max(clip => clip.EndFrame);
    return new TimelineData(source.Id, lifeTime, runtimeClips);
}

// 构建阶段解析资源键，并把每种参数固定成明确的运行时类型。
CompiledTask CompileTask(TaskDefinition source, ResourceCatalog catalog) => source switch
{
    PlayAnimationTask task => new AnimationTaskData(catalog.RequireAnimation(task.AnimationKey)),
    PlayAudioTask task     => new AudioTaskData(catalog.RequireAudio(task.AudioKey)),
    ApplyHitTask task      => new HitTaskData(catalog.RequireHitProfile(task.HitProfile)),
    MovementLockTask task  => new MovementLockTaskData(task.Locked),
    _ => throw new UnsupportedTaskTypeException(source.GetType())
};
```

这段代码的输入是编辑器文档，输出是只读 `TimelineData`。任何未知 Task、丢失资源或非法帧区间都会让构建明确失败，不会被替换成空行为。

这一步相当于把“方便编辑的语言”翻译成“方便执行的语言”。收益是启动更快、类型更确定，也能让错误集中出现在构建阶段。

## 第七步：启动时建立只读索引

运行时启动后先加载 Timeline 快照，再加载引用 Timeline 的能力或流程。顺序不能反过来，因为上层对象创建时就可能需要解析 Timeline。

- 快照创建后按唯一标识建立字典
- Timeline 数据先于上层能力注册
- 上层只保存标识或只读引用
- 查询入口保持单一，调用方不关心数据来自哪里

```csharp
IReadOnlyDictionary<string, TimelineData> BuildVerifiedIndex(RuntimeSnapshot verifiedSnapshot)
{
    // 重复 ID 已在构建期阻止；运行时只消费通过校验的快照。
    var index = new Dictionary<string, TimelineData>();
    foreach (TimelineData timeline in verifiedSnapshot.Timelines)
        index[timeline.Id] = timeline;
    return index;
}

bool TryResolveTimeline(
    IReadOnlyDictionary<string, TimelineData> index,
    string timelineId,
    out TimelineData timeline) => index.TryGetValue(timelineId, out timeline);

ActivationResult Activate(string timelineId)
{
    if (!TryResolveTimeline(index, timelineId, out TimelineData timeline))
    {
        // 运行时保留明确失败并取消本次激活，不伪装成成功的空 Timeline。
        diagnostics.ReportMissingTimeline(timelineId);
        return ActivationResult.Cancelled;
    }
    return StartTimeline(timeline);
}
```

重复标识和静态缺失引用应在构建期阻止生成。运行时查询仍可能因版本或装载问题失败，此时不要求所有实现都抛异常，但必须让调用方得到明确失败、记录诊断并取消本次流程，不能替换成“什么也不做却算成功”的空 Timeline。

索引解决的是定位，不负责复制数据。只读 Timeline 可以被多个实例共享；真正的播放进度、Task 状态和目标实体必须属于每次播放实例。

## 第八步：激活时创建播放实例

Timeline 数据是模板，播放器才是一次执行。激活前，播放器会遍历全部 Clip，根据 Task 类型从工厂创建执行对象，并注入参数与上下文。

- Task 工厂把字符串类型映射为具体执行器
- 每个 Clip 获得独立的 Task 实例
- Task 保存本次执行所需的拥有者、目标和参数
- 播放状态与共享模板分离
- 可变状态不能写回 Timeline 配置

```csharp
TimelinePlayer CreatePlayer(TimelineData template, PlayContext context)
{
    var runtimeClips = new List<RuntimeClip>();

    foreach (CompiledClip clip in template.Clips)
    {
        // 每次播放都创建独立 Task，避免把可变状态写回共享模板。
        IRuntimeTask task = taskFactory.Create(clip.Task.Type);
        task.Initialize(clip.Task, context);

        runtimeClips.Add(new RuntimeClip(
            task: task,
            startFrame: clip.StartFrame,
            endFrame: task.ResolveEndFrame(clip.EndFrame),
            begun: false,
            finished: false));
    }

    // 从 -1 开始，第一次 Advance 才会正式进入第 0 帧。
    return new TimelinePlayer(
        logicFrameRate: globalLogicFrameRate,
        lifeTime: template.LifeTime,
        clips: runtimeClips,
        currentFrame: -1);
}
```

模板中的四个 `CompiledClip` 会得到四个独立 Task 实例。两个实体同时播放同一个模板时，它们共享只读配置，但各自拥有 `currentFrame`、生命周期标记和实体上下文。这里的 `globalLogicFrameRate` 来自系统级调度配置，不是 Timeline 文档字段；页面上的“演示速度”也只控制网页自动播放节奏。

部分 Task 的真实持续时间可能由曲线或资源长度决定，因此允许 Task 在实例化阶段修正结束帧，但修正结果只能属于本次运行时 Clip。

### 一个生命周期核心，两种宿主适配

Clip 的 Begin、Tick、Finish、Interrupt 不需要因为上层流程不同而重写；变化的是“谁拥有播放器、从哪里开始、完成后通知谁”。

| 适配方式 | 起播位置 | 完成后的去向 | 循环责任 |
| --- | --- | --- | --- |
| 独立 Timeline | 固定从第 0 帧建立实例 | 直接结束当前宿主 | 不在该适配层循环 |
| Flow 宿主 | 可从指定 `startFrame` 建立本轮运行 | 把完成结果交还当前流程节点 | 流程上下文保存循环模板与重播锚点 |

从指定帧开始，不等于先偷偷执行前面的所有帧。已经在起播帧之前结束的 Clip 保持未开始；仍然跨越起播帧的 Clip 会在该帧补 Begin，然后继续 Tick。这样恢复的是“从此刻应当有效的状态”，不是伪造完整历史。

```pseudo
runStart = host == Flow ? requestedStartFrame : 0
currentFrame = runStart - 1

for each frame from runStart:
    if clip has not begun and frame is inside clip.range:
        clip.begin(frame)  // 从中段起播时允许晚 Begin
```

循环重播也需要明确锚点。本页只从有限、已识别的循环表现标记中选择最早开始帧；没有这种标记时明确回到第 0 帧，不从任意逻辑 Clip 的名字或外观猜测锚点。这个规则属于 Flow 适配边界，不是 Timeline 文档的新字段。

## 第九步：用固定帧推进并补齐丢帧

播放器通常把真实时间转换成逻辑帧。一次渲染帧可能跨过多个逻辑帧，因此不能只处理目标帧，必须依次补齐中间帧。

- 累加经过速度修正的真实时间
- 将时间换算为目标逻辑帧
- 从当前帧逐帧推进到目标帧
- 每个逻辑帧按统一顺序检查全部 Clip
- 到达生命周期后结束播放器

```csharp
void Advance(float deltaTime)
{
    elapsed += deltaTime * playbackSpeed;
    // 真实时间先换算成目标逻辑帧。
    int targetFrame = FloorToInt(elapsed * logicFrameRate);
    targetFrame = Min(targetFrame, lifeTime);

    // 逐帧追赶，保证短 Clip 的边界事件不会被跳过。
    while (currentFrame < targetFrame)
    {
        currentFrame += 1;
        TickFrame(currentFrame);
    }

    if (currentFrame == lifeTime)
        CompleteTimeline();
}

void TickFrame(int frame)
{
    foreach (RuntimeClip clip in runtimeClips)
    {
        // 同一逻辑帧内统一按 Begin → Tick → Finish 的顺序处理。
        if (frame == clip.StartFrame && !clip.Begun)
        {
            clip.Task.Begin(frame);
            clip.Begun = true;
        }

        if (clip.Begun && !clip.Finished && frame >= clip.StartFrame && frame <= clip.EndFrame)
            clip.Task.Tick(frame);

        if (frame == clip.EndFrame && !clip.Finished)
        {
            clip.Task.Finish(frame);
            clip.Finished = true;
        }
    }
}
```

假设渲染线程从第 7 帧一次跳到第 10 帧，`while` 会依次执行第 8、9、10 帧。因此 8—9 帧的短命中 Clip 仍然能够完整经历 Begin、Tick 和 Finish。

备注：如果 Begin 与 Finish 落在同一帧，这一帧仍会依次执行 Begin、Tick、Finish，生命周期不会缺段。页面下方可开启“同帧命中”观察：该 Clip 在这一帧处理完成后会立即退出活动集合，随后执行中断时不会再次收到 Interrupt。

逐帧追赶可以保证低帧率下不会跳过短 Clip。代价是单帧卡顿后可能集中执行多次，因此 Task 的每帧逻辑应保持轻量，并避免无界循环。

## 进阶：统一 Clip 的四段生命周期

每个运行时 Clip 至少需要 Begin、Tick、Finish、Interrupt 四种语义。播放器只根据帧和状态调用它们，不理解具体业务。

- Begin：首次进入片段，创建状态或提交持续请求
- Tick：片段有效期间更新连续行为
- Finish：正常到达结束帧，提交结果并清理
- Interrupt：Timeline 被取消，立即回收未结束状态

```pseudo
if frame == clip.start and not clip.begun:
    clip.task.begin(frame)
    clip.begun = true

if clip.begun and not clip.finished and frame in clip.range:
    clip.task.tick(frame)

if frame == clip.end and not clip.finished:
    clip.task.finish(frame)
    clip.finished = true
```

默认让 Interrupt 至少执行与 Finish 等价的清理，可以降低旧 Task 遗留状态的风险；如果中断与正常结束的业务结果不同，再显式覆盖。

播放器中断时不能只停止计时器，还必须访问所有已经 Begin 但尚未 Finish 的 Clip：

```csharp
void InterruptTimeline()
{
    foreach (RuntimeClip clip in runtimeClips)
    {
        // 只中断已经开始且尚未正常结束的 Clip。
        if (!clip.Begun || clip.Finished)
            continue;

        clip.Task.Interrupt(currentFrame);
        clip.Finished = true;
    }

    // 先清理所有活动 Task，再改变播放器状态。
    state = PlayerState.Interrupted;
}
```

把 `Finished` 设为 true 是为了阻止同一个 Task 在后续销毁流程里再次清理。正常完成与中断可以产生不同业务结果，但二者都必须释放持续状态。

### Flow 作用域 Task 还要经过 Dispose

Flow 作用域 Task 与普通 Timeline Clip 是两类所有权。作用域 Task 在创建时登记到当前流程上下文，宿主退出时按相反顺序统一处理：

```text
正常结束：Begin → Finish → Dispose
显式取消：Begin → Interrupt → Dispose
```

Finish 或 Interrupt 负责语义清理，Dispose 负责释放由流程作用域持有的对象资源。两步不能合成一个模糊的“清掉”。页面实验中的 FLOW SCOPED TASK 面板只说明这一条明确的托管路径；普通 Clip 只展示 Finish 或 Interrupt，不能据此宣称所有 Timeline Task 都会自动 Dispose。

## 第十一步：Task 只发语义命令

Task 不应直接操纵具体角色控制器。它只表达“想做什么”，通过桥接层提交带有实体目标、来源标识和参数的语义命令。

- 表现类：播放动作、音效、特效
- 结算类：查询目标、应用效果
- 控制类：允许移动、禁止输入、锁定朝向
- 运动类：提交位移意图或瞬移请求
- 生成类：创建投射物或临时实体

```csharp
sealed class MovementLockRuntimeTask : IRuntimeTask
{
    public void Begin(int frame)
    {
        // 用 sourceId 获取本次 Timeline 独有的控制锁。
        commands.Submit(targetEntity, sourceId, new AcquireMovementLock());
    }

    public void Tick(int frame)
    {
        // 锁是持续状态，不需要每帧重复提交。
    }

    public void Finish(int frame)
    {
        // 正常结束与中断都必须释放同一个 sourceId。
        commands.Submit(targetEntity, sourceId, new ReleaseMovementLock());
    }

    public void Interrupt(int frame)
    {
        commands.Submit(targetEntity, sourceId, new ReleaseMovementLock());
    }
}

sealed class HitRuntimeTask : IRuntimeTask
{
    public void Begin(int frame)
    {
        // 命中只提交语义命令，具体结算由实体侧完成。
        commands.Submit(targetEntity, sourceId, new ApplyHit(hitProfile));
    }

    public void Tick(int frame) { }
    public void Finish(int frame) { }
    public void Interrupt(int frame) { }
}
```

动作 Task 的 Begin 可以提交 `PlayAnimation`，音效 Task 的 Begin 可以提交 `PlayAudio`，命中 Task 的 Begin 提交 `ApplyHit`，状态 Task 则用 Begin/Finish 形成成对的获取与释放。播放器只看统一生命周期，不需要知道每条命令如何落地。

来源标识让同一实体能够区分多个并行请求。没有来源标识，某个 Clip 结束时可能错误清掉另一个系统仍在使用的状态。

## 第十二步：实体侧仲裁、落地并清理

命令桥把 Timeline 世界中的实体引用映射为真正的运行时单位，再路由到运动、动画、输入或效果组件。实体组件才拥有最终决定权。

- 命令接收器完成实体到运行时对象的映射
- 组件按优先级、来源和当前状态进行仲裁
- Timeline 控制锁可以压制普通移动
- 特殊 Clip 可以临时开放移动或旋转
- 片段结束、打断、实体销毁时都要按来源释放

```text
Task 发出移动意图
  ↓
命令桥定位实体
  ↓
运动组件收集多个来源
  ↓
优先级与控制锁仲裁
  ↓
最终速度和朝向
  ↓
移动组件真正修改实体
```

命令到达实体侧以后，还要经过一次明确的路由和仲裁：

```csharp
void Consume(EntityCommand command)
{
    // 接收器只负责路由，组件保留最终业务决定权。
    switch (command)
    {
        case PlayAnimation value:
            animation.Play(value.AnimationId, value.SourceId);
            break;

        case PlayAudio value:
            audio.Play(value.AudioId);
            break;

        case ApplyHit value:
            combat.ResolveHit(value.HitProfile, value.SourceId);
            break;

        case AcquireMovementLock value:
            // 保存来源集合，释放一个来源不会影响其他锁。
            movementLocks.Add(value.SourceId);
            movement.Recalculate(movementLocks);
            break;

        case ReleaseMovementLock value:
            movementLocks.Remove(value.SourceId);
            movement.Recalculate(movementLocks);
            break;

        default:
            throw new UnsupportedEntityCommandException(command.GetType());
    }
}
```

备注：移动锁保存的是 `SourceId` 集合，而不是单个布尔值。这样一个 Timeline 释放自己的锁时，不会误删另一个系统仍然持有的锁。

完整调试也应沿这条链逐层观察：

1. 源数据是否正确
2. 构建结果是否包含该 Clip
3. 播放器是否进入正确帧
4. Task 是否 Begin、Tick、Finish 或 Interrupt
5. 语义命令是否被接收
6. 实体组件是否因优先级、锁或状态拒绝
7. 最终执行结果是否符合请求

页面折叠边界卡还保留四个不能被成功路径掩盖的事实：Flow 在同一次 Tick 连续推进节点时必须有安全预算；没有下一节点与找不到下一节点引用在当前运行模型中都会结束宿主；命令桥返回失败不会自动阻止宿主启动；普通 Clip 的生命周期结束不能泛化为对象已经 Dispose。这里不添加重试、默认成功或断链转取消之类未经确认的补偿。

控制锁同样不是一个布尔值。它保存来源集合：A 与 B 同时持有时，释放 A 后集合仍有 B，控制必须继续锁定；只有最后一个来源离开才恢复。页面的 CONTROL LOCK OWNERS 面板可以逐个获取和释放两个来源，直接观察这个差异。

最重要的原则是：Timeline 负责确定性顺序，Task 负责翻译意图，实体组件负责世界规则。三层各自可观察，问题才不会全部堆进一个巨大的播放器。

## 把示例从第 0 帧完整跑一遍

现在把编辑器导出的四个 Clip 放回同一条时间线上，就能看到数据如何一步步变成实体行为：

| 帧 | 播放器发现的边界 | Task 生命周期 | 实体侧结果 |
| --- | --- | --- | --- |
| 0 | 动作与移动锁到达开始帧 | `PlayAnimation.Begin`、`MovementLock.Begin` | 播放攻击动作，普通移动被锁定 |
| 1—5 | 两个 Clip 都处于有效区间 | 两个 Task 持续 Tick | 动作继续采样，移动锁保持 |
| 6 | 音效到达开始帧 | `PlayAudio.Begin` | 播放挥击音效 |
| 8 | 命中到达开始帧 | `ApplyHit.Begin` | 提交命中语义命令并由战斗组件结算 |
| 9 | 命中到达结束帧 | `ApplyHit.Tick` 后 `Finish` | 命中 Clip 正常结束 |
| 10 | 音效到达结束帧 | `PlayAudio.Finish` | 音效 Clip 生命周期结束 |
| 12 | 动作到达结束帧 | `PlayAnimation.Finish` | 动作控制权释放 |
| 14 | 移动锁到达结束帧 | `MovementLock.Finish` | 移动锁按 SourceId 释放，Timeline 完成 |

可以把第 8 帧抽出来看成一次完整调用栈：

```text
Advance(deltaTime)
  → targetFrame = 8
  → TickFrame(8)
  → HitRuntimeTask.Begin(8)
  → Submit(ApplyHit)
  → EntityCommandReceiver.Consume(...)
  → CombatComponent.ResolveHit(...)
  → 目标实体产生结算结果
```

如果在第 8 帧点击页面实验里的“中断 Timeline”，动作、音效、命中和移动锁中仍然活动的 Task 都会收到 Interrupt；其中移动锁 Task 会提交释放命令，实体重新获得移动控制权。这就是为什么中断不能等同于简单地停止播放。

## 最终总结

一套完整的 Timeline 运行流程可以压缩成三个阶段：

```text
数据准备
编辑源数据 → 计算派生字段 → 结构与引用校验 → 生成强类型快照

Timeline 创建
建立只读索引 → 解析模板 → 实例化 Task → 初始化播放状态

实体消费
固定帧调度 → Clip 生命周期 → 语义命令 → 组件仲裁 → 状态释放
```

判断设计是否健康，可以检查五件事：

- 编辑数据与运行时状态是否分离
- 派生字段是否只有一个计算来源
- 损坏引用是否在构建前被拦截
- Task 是否通过语义边界影响实体
- Finish、Interrupt 和销毁是否都能回收状态

如果这五条成立，Timeline 就不再是难以维护的“巨大 if 时间表”，而是一条可验证、可扩展、可调试的数据驱动执行管线。
