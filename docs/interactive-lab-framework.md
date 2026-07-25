# 交互专题框架

`assets/interactive-lab.js` 提供所有专题共用的步骤播放器。专题只负责两件事：

1. 提供步骤数据；
2. 在 `renderStep` 中把当前步骤画出来。

框架统一处理：

- 上一步、下一步与直接跳步；
- 重置；
- 手动 / 自动模式；
- 自动播放到末尾后停止；
- 页面隐藏时暂停；
- 进度点与按钮状态；
- `aria-pressed`、`aria-current` 和键盘焦点。

## 必填配置

框架没有隐式业务默认值。播放间隔、末尾行为、按钮文字、CSS 类名和 DOM 控件都必须由专题明确传入；缺失时直接抛出错误。

```js
const player = XianyuInteractiveLab.createStepPlayer({
  steps,
  autoStepMs: 2000,
  endBehavior: "restart",
  dotElement: "button",
  dotsInteractive: true,
  controls: {
    previous,
    next,
    auto,
    reset,
    dots
  },
  labels: {
    play: "自动演示",
    pause: "暂停演示",
    complete: "自动完成",
    next: "下一步 →",
    done: "下一步 →",
    dot: (index) => `跳到第 ${index + 1} 步`
  },
  classes: {
    playing: "is-playing",
    dot: "step-dot",
    dotActive: "is-active",
    dotPast: "is-past"
  },
  renderStep: ({ step, index, total, mode, reason }) => {
    // 专题可视化逻辑
  },
  onModeChange: ({ mode, atEnd }) => {
    // 可选的专题状态文字由适配器显式处理
  }
});
```

## 末尾行为

- `restart`：在末步再次点击自动播放，从第一步重新开始；
- `disable`：到达末步后禁用自动播放按钮。

## 动态替换步骤

同一专题存在多个场景时，使用：

```js
player.replaceSteps(nextScenario.steps);
```

播放器会暂停当前自动播放、回到第一步、重建进度点并重新渲染。

## 动态过程

运行时才能知道下一步的算法（例如 A*）使用 `createProcessPlayer`。专题继续负责真实计算，框架只管理初始化、手动推进、自动推进、重置与完成状态。

```js
const player = XianyuInteractiveLab.createProcessPlayer({
  autoStepMs: 2000,
  controls: { initialize, next, auto, reset },
  labels: {
    play: "自动演示",
    pause: "暂停演示",
    complete: "自动完成"
  },
  classes: { playing: "is-playing" },
  initializeProcess,
  advanceProcess,
  resetProcess,
  readState: () => ({
    initialized: processState !== null,
    complete: processState ? processState.complete : false
  }),
  onStateChange
});
```

`readState` 是完成条件的唯一来源。框架不会猜测总步数，也不会把异常转换成“完成”。

## Markdown 文章自动交互

知识管线会检查普通文章的二级章节。文章同时满足以下条件时，自动生成章节推演器：

- 至少存在两个 `##` 章节；
- 至少一个章节包含列表或代码块，可形成可观察的规则、状态或逻辑。

推演步骤完全来自源 Markdown 的章节标题、首段、列表与首个代码块。播放器复用 `createStepPlayer`，支持手动跳步和 2000ms 自动播放。只有连续段落的纯概念文章不生成推演器，避免把普通翻页包装成伪交互。

## 专题边界

框架不理解 A*、二叉堆、集群 AI 等领域数据，也不接管 SVG、网格、代码高亮或角色动画。领域逻辑保留在各自适配器中，避免把公共运行时变成难维护的万能组件。
