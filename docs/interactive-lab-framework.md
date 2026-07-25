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

## 专题边界

框架不理解 A*、二叉堆、集群 AI 等领域数据，也不接管 SVG、网格、代码高亮或角色动画。领域逻辑保留在各自适配器中，避免把公共运行时变成难维护的万能组件。
