# 游戏 AI 与逻辑建模

这个分类用于沉淀游戏 AI、流程控制和逻辑建模相关知识：状态机、行为树、效用 AI、GOAP、技能流程、角色控制、怪物决策与团队行为。

## 先建立总模型

游戏 AI 通常分三层：长期选择目标和计划，中期决定当前行为，短期把期望运动修正为安全速度。GOAP、HTN、MCTS 偏规划，FSM、行为树、效用 AI 偏执行决策，Steering、RVO、ORCA 偏移动。

### 一个敌人的三层决策

```text
规划层：UseKey -> OpenDoor -> Chase
行为层：Sequence [靠近门, 开门, 追击]
移动层：期望速度 (4,0) 被 ORCA 修正为 (3.2,1.1)
```

## 推荐顺序

1. 先比较 FSM、行为树、效用 AI 与 GOAP。
2. 深入行为树的 Running、中断和执行栈。
3. 学习 HTN 与 MCTS 的规划方式。
4. 最后连接 Steering、RVO 和 ORCA 的速度空间。

## 已收录

- [状态机、行为树、效用 AI 与 GOAP 对比](./状态机行为树效用AI与GOAP对比.md)
- [局部避障：RVO 与 ORCA 理解笔记](./局部避障-RVO与ORCA理解笔记.md)
- [行为树执行栈、节点返回值与中断](./行为树执行栈节点返回值与中断.md)
- [HTN 与 MCTS 决策模型](./HTN与MCTS决策模型.md)
- [Steering、RVO 与 ORCA 速度空间](./Steering-RVO-ORCA速度空间.md)
