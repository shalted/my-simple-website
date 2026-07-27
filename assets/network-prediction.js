(function bootstrapNetworkPrediction() {
  "use strict";

  const ns = "http://www.w3.org/2000/svg";
  const $ = (selector) => document.querySelector(selector);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function readNumber(input, min, max, integer, label) {
    const value = Number(input.value);
    const valid = Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
    if (!valid) {
      const message = `${label}必须是 ${min}—${max}${integer ? " 的整数" : ""}。`;
      input.setCustomValidity(message);
      input.reportValidity();
      throw new Error(`[NetworkPrediction] ${message}`);
    }
    input.setCustomValidity("");
    return value;
  }

  const code = Object.freeze({
    input: [
      "MoveInput Capture(uint tick)",
      "{",
      "    Vector2 direction = Normalize(rawInput);",
      "    return new MoveInput(tick, direction);",
      "}"
    ],
    predict: [
      "void Predict(MoveInput input)",
      "{",
      "    inputHistory.Add(input);",
      "    predicted = Simulate(predicted, input);",
      "    Send(inputHistory.RecentWindow());",
      "}"
    ],
    authority: [
      "void AuthorityTick(uint tick)",
      "{",
      "    MoveInput input = queue.TakeFor(tick);",
      "    authority = Simulate(authority, input);",
      "    SendState(tick, authority);",
      "}"
    ],
    compare: [
      "void Receive(StateSnapshot snapshot)",
      "{",
      "    State predicted = states.Find(snapshot.tick);",
      "    error = Distance(predicted.position, snapshot.position);",
      "}"
    ],
    restore: [
      "void RestoreAuthority(StateSnapshot snapshot)",
      "{",
      "    state = snapshot.state;",
      "    confirmedTick = snapshot.tick;",
      "    inputHistory.RemoveThrough(confirmedTick);",
      "}"
    ],
    replay: [
      "foreach (MoveInput input in inputHistory.After(confirmedTick))",
      "{",
      "    // 重放与正常预测必须调用同一套模拟逻辑。",
      "    state = Simulate(state, input);",
      "    stateHistory.Replace(input.tick, state);",
      "}"
    ],
    cleanup: [
      "void StopPrediction()",
      "{",
      "    tickSource.Unsubscribe(OnTick);",
      "    inputHistory.Clear();",
      "    stateHistory.Clear();",
      "}"
    ]
  });

  const baseSteps = Object.freeze({
    normal: [
      ["CAPTURE INPUT", "采样并编号输入", "把当前方向封装成 Tick 输入快照。", "输入历史新增当前 Tick", "输入与状态共享 Tick，才能在回包时对齐。", "input", [2, 3]],
      ["LOCAL PREDICTION", "客户端立即推进", "同一份输入先在本地执行，画面无需等待往返。", "预测位置前进，状态快照写入历史", "低延迟手感来自本地先执行，而非网络更快。", "predict", [2, 3, 4]],
      ["SEND HISTORY", "发送输入窗口", "当前输入连同最近历史进入教学网络。", "数据包进入传输带", "少量历史冗余能增加偶发丢包后的恢复机会。", "predict", [2, 4]],
      ["AUTHORITY SIMULATION", "服务器权威推进", "服务器按 Tick 消费已到达输入，并执行同一模拟函数。", "权威轨迹新增一点", "最终状态由权威端规则和碰撞结果决定。", "authority", [2, 3, 4]],
      ["STATE RETURN", "权威状态带着确认 Tick 返回", "客户端收到可与历史对齐的状态快照。", "确认 Tick 更新", "没有确认 Tick，就不知道哪些历史已经安全结束。", "compare", [2, 3]],
      ["COMPARE", "比较同一 Tick 的状态", "预测点与权威点在确认 Tick 上计算误差。", "误差变得可见", "只比较“当前点”会把网络延迟误当成模拟误差。", "compare", [2, 3]],
      ["RESTORE & PRUNE", "恢复并裁剪已确认历史", "逻辑状态回到权威结果，确认 Tick 之前的输入被删除。", "历史队列只保留未确认输入", "裁剪是历史内存的确定清理点。", "restore", [2, 3, 4]],
      ["REPLAY", "重放未确认输入", "按 Tick 顺序重新执行仍在队列中的输入。", "预测轨迹从权威点追回现在", "重放同一模拟函数才能让结果稳定收敛。", "replay", [0, 2, 3]]
    ],
    jitter: [
      ["CAPTURE INPUT", "连续采样多个 Tick", "客户端在较长往返中继续接收输入。", "输入历史连续增长", "延迟不能阻塞本地输入采样。", "input", [0, 2, 3]],
      ["LOCAL PREDICTION", "预测先跑在前面", "客户端已经推进多个 Tick，服务器仍在处理较旧输入。", "两条轨迹的时间端点分离", "轨迹端点差不等于同 Tick 的模拟误差。", "predict", [2, 3, 4]],
      ["JITTER", "数据包到达间隔抖动", "相邻输入可能在不同时间成批到达。", "传输带出现等待和堆积", "必须按 Tick 排序，而不能按到达时刻直接模拟。", "authority", [2]],
      ["AUTHORITY SIMULATION", "服务器推进到较旧 Tick", "权威端只消费已经到达且可接受的输入。", "权威轨迹落后于客户端端点", "服务器不能假装未来输入已经到达。", "authority", [2, 3, 4]],
      ["STATE RETURN", "较旧确认返回", "客户端当前 Tick 已明显领先确认 Tick。", "确认 Tick 切开历史队列", "确认只覆盖过去，不代表当前预测全部正确。", "compare", [2, 3]],
      ["RESTORE", "回到权威状态", "客户端先恢复确认 Tick 的完整运动状态。", "逻辑状态回退", "只改位置而保留错误速度，会让重放继续偏离。", "restore", [2, 3]],
      ["PRUNE", "裁剪已确认输入", "确认 Tick 及以前的历史退出队列。", "待重放集合变得明确", "先裁剪可以避免同一输入被重放两次。", "restore", [2, 3, 4]],
      ["LONG REPLAY", "重放较长队列", "剩余输入逐 Tick 把客户端追回现在。", "重放次数随延迟上升", "长延迟会把校正成本集中到一次更新。", "replay", [0, 2, 3]],
      ["CONVERGE", "轨迹重新收敛", "新的预测轨迹从权威点出发，继续等待下一次确认。", "误差归入下一轮可比较状态", "预测是持续循环，不是一次性修正。", "replay", [0]]
    ],
    conflict: [
      ["CAPTURE INPUT", "输入进入历史", "客户端正常采样并立即预测。", "本地轨迹向前", "丢包不能阻塞本地响应。", "input", [0, 2, 3]],
      ["PACKET LOSS", "一个输入包未到达", "教学丢包规则把一个传输单元标为丢失。", "服务器输入队列出现缺口", "丢包必须保留为可观察状态，不能伪装成成功。", "predict", [2, 4]],
      ["REDUNDANT WINDOW", "后续窗口再次携带旧输入", "后续发送可包含最近历史，缺失输入因此可能补达。", "旧 Tick 获得第二次到达机会", "冗余提高机会，但不是可靠送达保证。", "predict", [2, 4]],
      ["AUTHORITY CONFLICT", "权威规则产生不同结果", "教学场景在服务器侧加入阻挡，实际位移短于客户端预测。", "同 Tick 的两条轨迹分叉", "客户端未知的约束必须由权威结果纠正。", "authority", [2, 3, 4]],
      ["STATE RETURN", "冲突状态回传", "确认 Tick 与权威位置到达客户端。", "确认点可用于精确比较", "不能用最新客户端位置直接减权威旧位置。", "compare", [2, 3]],
      ["ERROR DETECTED", "同 Tick 误差被量化", "调试器连接预测点与权威点并显示距离。", "误差从观感变成数据", "量化后才能区分延迟和模拟分歧。", "compare", [2, 3]],
      ["RESTORE", "应用权威状态", "位置与运动状态一起恢复到确认 Tick。", "客户端接受权威分支", "校正不能吞掉冲突或返回一个中性结果。", "restore", [2, 3]],
      ["PRUNE", "删除已确认历史", "确认 Tick 之前的输入离开历史。", "只剩真正未确认的 Tick", "清理边界与权威确认绑定。", "restore", [2, 3, 4]],
      ["REPLAY", "重放剩余输入", "未确认输入从新的权威状态继续执行。", "轨迹绕开错误起点重新生成", "同一模拟函数是收敛前提。", "replay", [0, 2, 3]],
      ["CLEANUP", "结束时释放历史与 Tick 订阅", "对象停止预测后不再接收 Tick，也不保留旧输入。", "运行队列归零", "旧生命周期数据不能进入下一次运行。", "cleanup", [2, 3, 4]]
    ]
  });

  const state = {
    scenario: "normal",
    delay: 2,
    loss: 0,
    step: 0,
    timer: null
  };

  function simulate() {
    const ticks = Array.from({ length: 9 }, (_, index) => index);
    const predicted = ticks.map((tick) => {
      const wave = tick > 4 ? (tick - 4) * 0.08 : 0;
      return { tick, value: tick * 0.72 + wave };
    });
    const conflict = state.scenario === "conflict" ? 0.9 : 0;
    const authority = ticks.map((tick) => ({
      tick,
      value: Math.max(0, tick * 0.72 - (tick >= 4 ? conflict : 0))
    }));
    const localTick = Math.min(8, 2 + state.step);
    const confirmLag = state.delay + (state.scenario === "jitter" && state.step >= 2 ? 2 : 0);
    const confirmedTick = state.step < 4 ? null : clamp(localTick - confirmLag, 1, 6);
    const displayAuthorityTick = state.step < 3 ? 0 : clamp(localTick - state.delay, 0, 8);
    const replayQueue = confirmedTick === null ? [] : ticks.filter((tick) => tick > confirmedTick && tick <= localTick);
    const predictedAtAck = confirmedTick === null ? 0 : predicted[confirmedTick].value;
    const authorityAtAck = confirmedTick === null ? 0 : authority[confirmedTick].value;
    const error = Math.abs(predictedAtAck - authorityAtAck);
    return { ticks, predicted, authority, localTick, confirmedTick, displayAuthorityTick, replayQueue, error };
  }

  function svgElement(name, attrs, text) {
    const element = document.createElementNS(ns, name);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function point(item) {
    return { x: 52 + item.tick * 82, y: 300 - item.value * 34 };
  }

  function renderTrajectory(model) {
    const predictionVisible = model.predicted.filter((item) => item.tick <= model.localTick);
    const authorityVisible = model.authority.filter((item) => item.tick <= model.displayAuthorityTick);
    $("#prediction-line").setAttribute("points", predictionVisible.map((item) => {
      const p = point(item); return `${p.x},${p.y}`;
    }).join(" "));
    $("#authority-line").setAttribute("points", authorityVisible.map((item) => {
      const p = point(item); return `${p.x},${p.y}`;
    }).join(" "));

    const axis = $("#tick-axis");
    axis.replaceChildren(...model.ticks.map((tick) =>
      svgElement("text", { x: 52 + tick * 82, y: 330, "text-anchor": "middle", class: "tick-label" }, `T${tick}`)
    ));

    const predictionPoints = $("#prediction-points");
    predictionPoints.replaceChildren(...model.predicted.map((item) => {
      const p = point(item);
      const classes = ["prediction-point"];
      if (item.tick > model.localTick) classes.push("future-point");
      if (item.tick === model.localTick) classes.push("current-point");
      return svgElement("circle", { cx: p.x, cy: p.y, r: 6, class: classes.join(" ") });
    }));
    const authorityPoints = $("#authority-points");
    authorityPoints.replaceChildren(...model.authority.map((item) => {
      const p = point(item);
      const classes = ["authority-point"];
      if (item.tick > model.displayAuthorityTick) classes.push("future-point");
      if (item.tick === model.displayAuthorityTick) classes.push("current-point");
      return svgElement("circle", { cx: p.x, cy: p.y, r: 6, class: classes.join(" ") });
    }));

    const errorLayer = $("#error-link");
    errorLayer.replaceChildren();
    if (model.confirmedTick !== null) {
      const a = point(model.predicted[model.confirmedTick]);
      const b = point(model.authority[model.confirmedTick]);
      errorLayer.append(svgElement("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "error-link" }));
    }
  }

  function isLost(tick) {
    if (state.loss <= 0) return false;
    const interval = Math.max(2, Math.round(100 / state.loss));
    return tick > 0 && tick % interval === 0;
  }

  function renderPackets(model) {
    const list = $("#packet-list");
    list.replaceChildren(...model.ticks.slice(1).map((tick) => {
      const item = document.createElement("li");
      const arrival = tick + state.delay + (state.scenario === "jitter" && tick % 3 === 0 ? 2 : 0);
      const lost = isLost(tick) || (state.scenario === "conflict" && tick === 3);
      const delivered = !lost && arrival <= model.localTick;
      item.className = lost ? "lost" : delivered ? "delivered" : "transit";
      item.innerHTML = `<strong>T${tick}</strong><br>${lost ? "丢失" : delivered ? "已到达" : `→T${arrival}`}`;
      return item;
    }));
  }

  function renderCode(key, activeLines) {
    $("#code-status").textContent = key.toUpperCase();
    $("#code-lines").replaceChildren(...code[key].map((line, index) => {
      const item = document.createElement("li");
      item.textContent = line || " ";
      if (activeLines.includes(index)) item.classList.add("is-active");
      return item;
    }));
  }

  function renderDots(steps) {
    const dots = $("#step-dots");
    dots.replaceChildren(...steps.map((step, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = index === state.step ? "is-active" : "";
      button.setAttribute("aria-label", `跳到第 ${index + 1} 步：${step[1]}`);
      button.addEventListener("click", () => { stopAuto(); state.step = index; render(); });
      return button;
    }));
  }

  function render() {
    const steps = baseSteps[state.scenario];
    state.step = clamp(state.step, 0, steps.length - 1);
    const step = steps[state.step];
    const model = simulate();

    $("#step-label").textContent = `STEP ${String(state.step + 1).padStart(2, "0")}`;
    $("#step-count").textContent = `${state.step + 1} / ${steps.length}`;
    $("#phase").textContent = step[0];
    $("#step-title").textContent = step[1];
    $("#step-copy").textContent = step[2];
    $("#step-change").textContent = step[3];
    $("#step-why").textContent = step[4];
    $("#teaching-note").textContent = `教学场景 · 延迟 ${state.delay} Tick / 丢包 ${state.loss}%`;

    $("#local-tick").textContent = model.localTick;
    $("#confirmed-tick").textContent = model.confirmedTick === null ? "—" : model.confirmedTick;
    $("#error-value").textContent = model.error.toFixed(2);
    $("#replay-count").textContent = model.replayQueue.length;
    $("#predicted-position").textContent = model.predicted[model.localTick].value.toFixed(2);
    $("#authority-position").textContent = model.authority[model.displayAuthorityTick].value.toFixed(2);
    $("#history-size").textContent = model.confirmedTick === null ? model.localTick : model.replayQueue.length;
    $("#network-status").textContent = state.scenario === "conflict" && state.step >= 3 ? "权威冲突" : state.scenario === "jitter" ? "延迟抖动" : "按序传输";

    const queue = $("#replay-queue");
    queue.replaceChildren(...model.replayQueue.map((tick) => {
      const chip = document.createElement("i");
      chip.textContent = `T${tick}`;
      return chip;
    }));
    if (!model.replayQueue.length) {
      const chip = document.createElement("i");
      chip.textContent = "空";
      queue.append(chip);
    }
    $("#queue-note").textContent = model.confirmedTick === null
      ? "等待权威状态，当前历史尚未裁剪"
      : `T${model.confirmedTick} 已确认，只重放更晚输入`;

    renderTrajectory(model);
    renderPackets(model);
    renderCode(step[5], step[6]);
    renderDots(steps);
    $("#prev-button").disabled = state.step === 0;
    $("#next-button").disabled = state.step === steps.length - 1;
  }

  function stopAuto() {
    if (state.timer !== null) window.clearInterval(state.timer);
    state.timer = null;
    $("#auto-button").textContent = "自动播放";
    $("#auto-button").setAttribute("aria-pressed", "false");
  }

  function toggleAuto() {
    if (state.timer !== null) {
      stopAuto();
      return;
    }
    const seconds = readNumber($("#speed-seconds"), 0.8, 8, false, "自动播放秒数");
    $("#speed-seconds").value = String(seconds);
    $("#speed-message").textContent = `每步 ${seconds.toFixed(1)} 秒`;
    $("#auto-button").textContent = "暂停";
    $("#auto-button").setAttribute("aria-pressed", "true");
    state.timer = window.setInterval(() => {
      const last = baseSteps[state.scenario].length - 1;
      if (state.step >= last) {
        stopAuto();
        return;
      }
      state.step += 1;
      render();
    }, seconds * 1000);
  }

  function move(delta) {
    stopAuto();
    state.step = clamp(state.step + delta, 0, baseSteps[state.scenario].length - 1);
    render();
  }

  document.querySelectorAll(".scenario-tab").forEach((button) => {
    button.addEventListener("click", () => {
      stopAuto();
      state.scenario = button.dataset.scenario;
      state.step = 0;
      document.querySelectorAll(".scenario-tab").forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });

      render();
    });
  });

  $("#apply-network").addEventListener("click", () => {
    stopAuto();
    state.delay = readNumber($("#delay-ticks"), 1, 6, true, "教学延迟");
    state.loss = readNumber($("#loss-percent"), 0, 80, true, "教学丢包");
    $("#delay-ticks").value = String(state.delay);
    $("#loss-percent").value = String(state.loss);
    state.step = 0;
    render();
  });
  $("#reset-button").addEventListener("click", () => { stopAuto(); state.step = 0; render(); });
  $("#prev-button").addEventListener("click", () => move(-1));
  $("#next-button").addEventListener("click", () => move(1));
  $("#auto-button").addEventListener("click", toggleAuto);
  $("#speed-seconds").addEventListener("change", () => {
    const seconds = readNumber($("#speed-seconds"), 0.8, 8, false, "自动播放秒数");
    $("#speed-seconds").value = String(seconds);
    $("#speed-message").textContent = `每步 ${seconds.toFixed(1)} 秒`;
    if (state.timer !== null) { stopAuto(); toggleAuto(); }
  });

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input, textarea, select, button")) return;
    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") move(1);
    if (event.key === " ") { event.preventDefault(); toggleAuto(); }
    if (event.key.toLowerCase() === "r") { stopAuto(); state.step = 0; render(); }
  });

  render();
})();
