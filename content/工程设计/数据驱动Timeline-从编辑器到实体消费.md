# 数据驱动 Timeline：从编辑器到实体消费

分类：工程设计

## 先建立完整心智模型

一套可用于战斗、剧情或复杂交互的 Timeline，不只是“在某一秒播放动画”。它更像一条小型编译与执行管线：编辑器负责描述意图，构建阶段负责验证并生成运行时数据，播放器负责调度，实体组件负责真正执行。

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

```pseudo
runtimeTimeline = new TimelineData(
    id       = source.id,
    lifeTime = deriveLifeTime(source),
    tracks   = source.tracks.map(compileTrack)
)
```

这一步相当于把“方便编辑的语言”翻译成“方便执行的语言”。收益是启动更快、类型更确定，也能让错误集中出现在构建阶段。

## 第七步：启动时建立只读索引

运行时启动后先加载 Timeline 快照，再加载引用 Timeline 的能力或流程。顺序不能反过来，因为上层对象创建时就可能需要解析 Timeline。

- 快照创建后按唯一标识建立字典
- Timeline 数据先于上层能力注册
- 上层只保存标识或只读引用
- 查询入口保持单一，调用方不关心数据来自哪里

```pseudo
for each timeline in snapshot.timelines:
    timelineById[timeline.id] = timeline

for each ability in snapshot.abilities:
    ability.timeline = timelineById[ability.timelineId]
```

索引解决的是定位，不负责复制数据。只读 Timeline 可以被多个实例共享；真正的播放进度、Task 状态和目标实体必须属于每次播放实例。

## 第八步：激活时创建播放实例

Timeline 数据是模板，播放器才是一次执行。激活前，播放器会遍历全部 Clip，根据 Task 类型从工厂创建执行对象，并注入参数与上下文。

- Task 工厂把字符串类型映射为具体执行器
- 每个 Clip 获得独立的 Task 实例
- Task 保存本次执行所需的拥有者、目标和参数
- 播放状态与共享模板分离
- 可变状态不能写回 Timeline 配置

```pseudo
for each clip in timeline.allClips:
    task = taskFactory.create(clip.taskType, context)
    task.initialize(clip.parameters)
    runtimeClips.add(
        task,
        clip.startFrame,
        resolveEndFrame(task, clip)
    )
```

部分 Task 的真实持续时间可能由曲线或资源长度决定，因此允许 Task 在实例化阶段修正结束帧，但修正结果只能属于本次运行时 Clip。

## 第九步：用固定帧推进并补齐丢帧

播放器通常把真实时间转换成逻辑帧。一次渲染帧可能跨过多个逻辑帧，因此不能只处理目标帧，必须依次补齐中间帧。

- 累加经过速度修正的真实时间
- 将时间换算为目标逻辑帧
- 从当前帧逐帧推进到目标帧
- 每个逻辑帧按统一顺序检查全部 Clip
- 到达生命周期后结束播放器

```pseudo
elapsed += deltaTime * playbackSpeed
targetFrame = floor(elapsed * frameRate)

while currentFrame < targetFrame:
    currentFrame += 1
    tickFrame(currentFrame)
```

逐帧追赶可以保证低帧率下不会跳过短 Clip。代价是单帧卡顿后可能集中执行多次，因此 Task 的每帧逻辑应保持轻量，并避免无界循环。

## 第十步：统一 Clip 的四段生命周期

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

## 第十一步：Task 只发语义命令

Task 不应直接操纵具体角色控制器。它只表达“想做什么”，通过桥接层提交带有实体目标、来源标识和参数的语义命令。

- 表现类：播放动作、音效、特效
- 结算类：查询目标、应用效果
- 控制类：允许移动、禁止输入、锁定朝向
- 运动类：提交位移意图或瞬移请求
- 生成类：创建投射物或临时实体

```pseudo
onBegin:
    commandBus.submit(
        targetEntity,
        sourceId,
        command = AllowMove(speedScale)
    )

onFinishOrInterrupt:
    commandBus.release(targetEntity, sourceId)
```

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

完整调试也应沿这条链逐层观察：

1. 源数据是否正确
2. 构建结果是否包含该 Clip
3. 播放器是否进入正确帧
4. Task 是否 Begin、Tick、Finish 或 Interrupt
5. 语义命令是否被接收
6. 实体组件是否因优先级、锁或状态拒绝
7. 最终执行结果是否符合请求

最重要的原则是：Timeline 负责确定性顺序，Task 负责翻译意图，实体组件负责世界规则。三层各自可观察，问题才不会全部堆进一个巨大的播放器。

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
