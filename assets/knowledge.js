const tocLinks = [...document.querySelectorAll("[data-toc-link]")];
if (tocLinks.length) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      tocLinks.forEach((link) => link.classList.toggle("active", link.hash === `#${entry.target.id}`));
    });
  }, { rootMargin: "-18% 0px -68%", threshold: 0 });
  document.querySelectorAll(".article-body h2[id], .article-body h3[id]").forEach((heading) => observer.observe(heading));
}

const searchInput = document.querySelector("#knowledge-search");
const cards = [...document.querySelectorAll("[data-article-card]")];
const emptyState = document.querySelector("#search-empty");
if (searchInput && cards.length) {
  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLocaleLowerCase("zh-CN");
    let visible = 0;
    cards.forEach((card) => {
      const match = !query || card.dataset.search.includes(query);
      card.hidden = !match;
      if (match) visible += 1;
    });
    if (emptyState) emptyState.hidden = visible !== 0;
  });
}
document.querySelectorAll("[data-dynamic-deck]").forEach((deck) => {
  const slides = [...deck.querySelectorAll("[data-deck-slide]")];
  const jumpButtons = [...deck.querySelectorAll("[data-deck-jump]")];
  const deckNavigation = deck.querySelector(".deck-nav");
  const previousButton = deck.querySelector("[data-deck-prev]");
  const nextButton = deck.querySelector("[data-deck-next]");
  const playButton = deck.querySelector("[data-deck-play]");
  const currentLabel = deck.querySelector("[data-deck-current]");
  const progress = deck.querySelector("[data-deck-progress]");
  const dots = deck.querySelector("[data-deck-runtime-dots]");

  const player = window.XianyuInteractiveLab.createStepPlayer({
    steps: slides,
    autoStepMs: 2000,
    endBehavior: "restart",
    dotElement: "i",
    dotsInteractive: false,
    controls: {
      previous: previousButton,
      next: nextButton,
      auto: playButton,
      reset: null,
      dots,
    },
    labels: {
      play: "自动播放",
      pause: "暂停播放",
      complete: "自动完成",
      next: "下一步 →",
      done: "下一步 →",
      dot: (index) => `第 ${index + 1} 步`,
    },
    classes: {
      playing: "is-playing",
      dot: "deck-runtime-dot",
      dotActive: "is-active",
      dotPast: "is-past",
    },
    renderStep: ({ index, total, mode }) => {
      deck.dataset.mode = mode;
      slides.forEach((slide, slideIndex) => {
        const active = slideIndex === index;
        slide.hidden = !active;
        slide.classList.toggle("active", active);
      });
      jumpButtons.forEach((button, buttonIndex) => button.classList.toggle("active", buttonIndex === index));
      currentLabel.textContent = String(index + 1).padStart(2, "0");
      progress.style.width = `${((index + 1) / total) * 100}%`;
      deckNavigation.scrollTo({
        top: Math.max(0, jumpButtons[index].offsetTop - deckNavigation.clientHeight / 2),
        left: Math.max(0, jumpButtons[index].offsetLeft - deckNavigation.clientWidth / 2),
        behavior: "smooth",
      });
    },
    onModeChange: ({ mode }) => {
      deck.dataset.mode = mode;
    },
  });

  jumpButtons.forEach((button) => button.addEventListener("click", () => {
    player.goTo(Number(button.dataset.deckJump));
  }));
});

/* HASHSET_STATE_EXPLAINER */
document.querySelectorAll("[data-hashset-lab]").forEach((lab) => {
  const required = (selector) => {
    const element = lab.querySelector(selector);
    if (!(element instanceof Element)) throw new Error(`[HashSetLab] 缺少元素：${selector}`);
    return element;
  };
  const input = ["A", "B", "A", "C", "B"];
  const steps = [
    { token: -1, phase: "idle", before: [], after: [], operation: "等待第一个输入", explanation: "集合从空状态开始。下一步会读取 A，但此时还没有执行 Add。", verdict: "SET = ∅", line: 1 },
    { token: 0, phase: "check", before: [], after: [], operation: '准备 Add("A")', explanation: "先检查 A 是否已经登记。当前是空集合，所以没见过 A。", verdict: "正在查重", line: 2 },
    { token: 0, phase: "true", before: [], after: ["A"], operation: 'Add("A") → true', explanation: "第一次见到 A：写入集合，Add 返回 true。", verdict: "写入 A", line: 4 },
    { token: 1, phase: "check", before: ["A"], after: ["A"], operation: '准备 Add("B")', explanation: "检查 B。集合中只有 A，因此 B 尚未出现。", verdict: "正在查重", line: 2 },
    { token: 1, phase: "true", before: ["A"], after: ["A", "B"], operation: 'Add("B") → true', explanation: "第一次见到 B：集合从 { A } 变为 { A, B }。", verdict: "写入 B", line: 4 },
    { token: 2, phase: "check", before: ["A", "B"], after: ["A", "B"], operation: '准备 Add("A")', explanation: "再次检查 A。此时集合里已经登记了 A。", verdict: "发现重复", line: 2 },
    { token: 2, phase: "false", before: ["A", "B"], after: ["A", "B"], operation: 'Add("A") → false', explanation: "A 已存在：不重复写入，集合保持不变。", verdict: "duplicates + 1", line: 3 },
    { token: 3, phase: "check", before: ["A", "B"], after: ["A", "B"], operation: '准备 Add("C")', explanation: "检查 C。它不在集合中，可以登记。", verdict: "正在查重", line: 2 },
    { token: 3, phase: "true", before: ["A", "B"], after: ["A", "B", "C"], operation: 'Add("C") → true', explanation: "第一次见到 C：集合新增 C。", verdict: "写入 C", line: 4 },
    { token: 4, phase: "check", before: ["A", "B", "C"], after: ["A", "B", "C"], operation: '准备 Add("B")', explanation: "再次检查 B。集合中已经有 B。", verdict: "发现重复", line: 2 },
    { token: 4, phase: "false", before: ["A", "B", "C"], after: ["A", "B", "C"], operation: 'Add("B") → false', explanation: "B 已存在：拒绝重复写入。最终集合只有 A、B、C。", verdict: "2 个重复被拒绝", line: 3 }
  ];
  const refs = {
    current: required("[data-hashset-current]"),
    stream: required("[data-hashset-stream]"),
    before: required("[data-hashset-before]"),
    after: required("[data-hashset-after]"),
    operation: required("[data-hashset-operation]"),
    explanation: required("[data-hashset-explanation]"),
    verdict: required("[data-hashset-verdict]"),
    reset: required("[data-hashset-reset]"),
    previous: required("[data-hashset-prev]"),
    auto: required("[data-hashset-auto]"),
    next: required("[data-hashset-next]"),
    dots: required("[data-hashset-dots]"),
    liveInput: required("[data-hashset-input]"),
    liveSet: required("[data-hashset-live-set]"),
    liveResult: required("[data-hashset-live-result]"),
    clear: required("[data-hashset-clear]")
  };
  const codeLines = [...lab.querySelectorAll(".hashset-code > div")];
  if (codeLines.length !== 4) throw new Error(`[HashSetLab] 代码行数量错误：${codeLines.length}`);

  function renderValues(container, values) {
    container.replaceChildren();
    container.classList.toggle("is-empty", values.length === 0);
    values.forEach((value) => {
      const chip = document.createElement("span");
      chip.className = "hashset-value";
      chip.textContent = value;
      container.append(chip);
    });
  }

  input.forEach((value, index) => {
    const token = document.createElement("span");
    token.className = "hashset-token";
    token.dataset.tokenIndex = String(index);
    token.textContent = value;
    refs.stream.append(token);
  });

  const player = window.XianyuInteractiveLab.createStepPlayer({
    steps,
    autoStepMs: 2000,
    endBehavior: "restart",
    dotElement: "button",
    dotsInteractive: true,
    controls: {
      previous: refs.previous,
      next: refs.next,
      auto: refs.auto,
      reset: refs.reset,
      dots: refs.dots
    },
    labels: {
      play: "自动演示",
      pause: "暂停演示",
      complete: "重新播放",
      next: "下一步 →",
      done: "已完成",
      dot: (index) => `查看第 ${index + 1} 步`
    },
    classes: {
      playing: "is-playing",
      dot: "hashset-dot",
      dotActive: "is-active",
      dotPast: "is-past"
    },
    renderStep: ({ step, index }) => {
      refs.current.textContent = String(index + 1).padStart(2, "0");
      refs.operation.textContent = step.operation;
      refs.explanation.textContent = step.explanation;
      refs.verdict.textContent = step.verdict;
      refs.verdict.classList.toggle("is-true", step.phase === "true");
      refs.verdict.classList.toggle("is-false", step.phase === "false");
      renderValues(refs.before, step.before);
      renderValues(refs.after, step.after);
      refs.stream.querySelectorAll("[data-token-index]").forEach((token) => {
        const tokenIndex = Number(token.dataset.tokenIndex);
        token.classList.toggle("is-current", tokenIndex === step.token);
        token.classList.toggle("is-past", tokenIndex < step.token);
      });
      codeLines.forEach((line, lineIndex) => line.classList.toggle("is-active", lineIndex + 1 === step.line));
    },
    onModeChange: () => {}
  });


  const liveValues = new Set();
  function renderLive(message) {
    renderValues(refs.liveSet, [...liveValues]);
    refs.liveResult.textContent = message;
  }
  lab.querySelectorAll("[data-hashset-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const value = refs.liveInput.value.trim();
      if (value.length === 0) {
        renderLive("请输入一个非空值；本次没有执行任何操作。");
        refs.liveInput.focus();
        return;
      }
      const action = button.dataset.hashsetAction;
      if (action === "add") {
        const sizeBefore = liveValues.size;
        liveValues.add(value);
        const added = liveValues.size !== sizeBefore;
        renderLive(`Add("${value}") → ${added}；${added ? "集合新增该值。" : "值已存在，集合没有变化。"}`);
      } else if (action === "contains") {
        renderLive(`Contains("${value}") → ${liveValues.has(value)}；Contains 只查询，不修改集合。`);
      } else if (action === "remove") {
        const removed = liveValues.delete(value);
        renderLive(`Remove("${value}") → ${removed}；${removed ? "该值已被删除。" : "没有找到该值，集合没有变化。"}`);
      } else {
        throw new Error(`[HashSetLab] 未知操作：${action}`);
      }
    });
  });
  refs.clear.addEventListener("click", () => {
    liveValues.clear();
    refs.liveInput.value = "";
    renderLive("Clear() 已执行；集合回到空状态。");
  });
  refs.liveInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") required('[data-hashset-action="add"]').click();
  });
  renderLive("集合目前为空，请输入一个值。");
});

/* TIMELINE_RUNTIME_EDITOR */
document.querySelectorAll("[data-timeline-lab]").forEach((lab) => {
  const required = (selector) => {
    const element = lab.querySelector(selector);
    if (!(element instanceof Element)) throw new Error(`[TimelineLab] 缺少元素：${selector}`);
    return element;
  };

  const initialClips = [
    { id: "action", track: "动作", name: "播放攻击动作", start: 0, end: 12, tone: "cyan" },
    { id: "audio", track: "音效", name: "挥击音效", start: 6, end: 10, tone: "amber" },
    { id: "hit", track: "判定", name: "执行命中", start: 8, end: 9, tone: "coral" },
    { id: "state", track: "状态", name: "锁定普通移动", start: 0, end: 14, tone: "mint" }
  ];
  const state = {
    length: 15,
    fps: 6,
    frame: 0,
    clips: initialClips.map((clip) => ({ ...clip })),
    playing: false,
    interruptedAt: null,
    hideLog: false,
    catchupFrom: null
  };
  let timer = null;

  const refs = {
    length: required("[data-timeline-length]"),
    fps: required("[data-timeline-fps]"),
    notice: required("[data-timeline-notice]"),
    canvas: required("[data-timeline-canvas]"),
    ruler: required("[data-timeline-ruler]"),
    tracks: required("[data-timeline-tracks]"),
    playhead: required("[data-timeline-playhead]"),
    frame: required("[data-timeline-frame]"),
    time: required("[data-timeline-time]"),
    phase: required("[data-timeline-phase]"),
    stage: required("[data-timeline-stage]"),
    actor: required("[data-timeline-actor]"),
    attack: required("[data-timeline-attack]"),
    target: required("[data-timeline-target]"),
    sound: required("[data-timeline-sound]"),
    caption: required("[data-timeline-caption]"),
    action: required("[data-timeline-action]"),
    audio: required("[data-timeline-audio]"),
    hit: required("[data-timeline-hit]"),
    movement: required("[data-timeline-movement]"),
    activeCount: required("[data-timeline-active-count]"),
    activeTasks: required("[data-timeline-active-tasks]"),
    log: required("[data-timeline-log]"),
    codeState: required("[data-timeline-code-state]"),
    reset: required("[data-timeline-reset]"),
    previous: required("[data-timeline-prev]"),
    play: required("[data-timeline-play]"),
    next: required("[data-timeline-next]"),
    catchup: required("[data-timeline-catchup]"),
    interrupt: required("[data-timeline-interrupt]"),
    clearLog: required("[data-timeline-clear-log]")
  };
  const codeLines = [...lab.querySelectorAll("[data-code-line]")];

  const clipById = (id) => {
    const clip = state.clips.find((candidate) => candidate.id === id);
    if (!clip) throw new Error(`[TimelineLab] 未知 Clip：${id}`);
    return clip;
  };
  const isActive = (clip, frame = state.frame) => frame >= clip.start && frame <= clip.end;
  const stop = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    state.playing = false;
    refs.play.textContent = state.frame >= state.length - 1 ? "播放完成" : "自动播放";
    refs.play.setAttribute("aria-pressed", "false");
  };
  const setNotice = (message, error = false) => {
    refs.notice.textContent = message;
    refs.notice.classList.toggle("is-error", error);
  };

  function renderRuler() {
    refs.ruler.replaceChildren();
    refs.ruler.style.setProperty("--timeline-frames", String(state.length));
    for (let frame = 0; frame < state.length; frame += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.frame = String(frame);
      button.textContent = String(frame);
      button.title = `跳到第 ${frame} 帧`;
      button.classList.toggle("is-current", frame === state.frame);
      button.addEventListener("click", () => goTo(frame));
      refs.ruler.append(button);
    }
  }

  function bindClipDrag(element, clip) {
    element.addEventListener("pointerdown", (event) => {
      if (!(event.target instanceof Element)) return;
      const handle = event.target.closest("[data-resize]");
      const mode = handle?.getAttribute("data-resize") ?? "move";
      stop();
      event.preventDefault();
      const body = element.parentElement;
      if (!(body instanceof HTMLElement)) throw new Error("[TimelineLab] Clip 缺少轨道容器。");
      const rect = body.getBoundingClientRect();
      const originX = event.clientX;
      const originStart = clip.start;
      const originEnd = clip.end;
      element.classList.add("is-dragging" );

      const move = (moveEvent) => {
        const delta = Math.round(((moveEvent.clientX - originX) / rect.width) * state.length);
        if (mode === "start") {
          clip.start = Math.max(0, Math.min(originEnd, originStart + delta));
        } else if (mode === "end") {
          clip.end = Math.max(originStart, Math.min(state.length - 1, originEnd + delta));
        } else {
          const duration = originEnd - originStart;
          const nextStart = Math.max(0, Math.min(state.length - duration - 1, originStart + delta));
          clip.start = nextStart;
          clip.end = nextStart + duration;
        }
        state.interruptedAt = null;
        state.frame = Math.min(state.frame, state.length - 1);
        state.hideLog = false;
        renderAll();
        setNotice(`${clip.track} / ${clip.name}：${clip.start}—${clip.end} 帧`);
      };
      const end = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        renderAll();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end, { once: true });
    });
  }

  function renderTracks() {
    refs.tracks.replaceChildren();
    state.clips.forEach((clip) => {
      const row = document.createElement("div");
      row.className = "timeline-track";
      const label = document.createElement("div");
      label.className = "timeline-track__label";
      label.innerHTML = `<span>${clip.track}</span><small>${clip.id.toUpperCase()}</small>`;
      const body = document.createElement("div");
      body.className = "timeline-track__body";
      body.style.setProperty("--timeline-frames", String(state.length));
      const segment = document.createElement("div");
      segment.className = `timeline-clip is-${clip.tone}`;
      segment.dataset.clipId = clip.id;
      segment.style.left = `${(clip.start / state.length) * 100}%`;
      segment.style.width = `${((clip.end - clip.start + 1) / state.length) * 100}%`;
      segment.classList.toggle("is-active", isActive(clip));
      segment.innerHTML = `<button type="button" data-resize="start" aria-label="调整${clip.name}开始帧"></button><span><b>${clip.name}</b><small>${clip.start}—${clip.end}</small></span><button type="button" data-resize="end" aria-label="调整${clip.name}结束帧"></button>`;
      bindClipDrag(segment, clip);
      body.append(segment);
      row.append(label, body);
      refs.tracks.append(row);
    });
  }

  function buildEvents(frame) {
    const events = [];
    for (let logicalFrame = 0; logicalFrame <= frame; logicalFrame += 1) {
      state.clips.forEach((clip) => {
        if (logicalFrame === clip.start) events.push({ frame: logicalFrame, type: "BEGIN", clip });
        if (logicalFrame === clip.end) events.push({ frame: logicalFrame, type: "FINISH", clip });
      });
    }
    if (state.interruptedAt !== null) {
      state.clips.filter((clip) => isActive(clip, state.interruptedAt)).forEach((clip) => {
        events.push({ frame: state.interruptedAt, type: "INTERRUPT", clip });
      });
    }
    return events.sort((left, right) => left.frame - right.frame || left.type.localeCompare(right.type));
  }

  function renderPreview() {
    const action = clipById("action");
    const audio = clipById("audio");
    const hit = clipById("hit");
    const movement = clipById("state");
    const interrupted = state.interruptedAt !== null;
    const actionActive = !interrupted && isActive(action);
    const audioActive = !interrupted && isActive(audio);
    const hitActive = !interrupted && isActive(hit);
    const movementLocked = !interrupted && isActive(movement);
    const actionSpan = action.end - action.start + 1;
    const actionStep = state.frame - action.start;
    const actionThird = actionSpan / 3;
    let actionPhase = "idle";
    if (actionActive) actionPhase = actionStep < actionThird ? "windup" : actionStep < actionThird * 2 ? "strike" : "recover";

    refs.stage.dataset.actionPhase = actionPhase;
    refs.stage.classList.toggle("has-action", actionActive);
    refs.stage.classList.toggle("has-audio", audioActive);
    refs.stage.classList.toggle("has-hit", hitActive);
    refs.stage.classList.toggle("is-interrupted", interrupted);
    refs.action.textContent = actionActive ? ({ windup: "蓄力", strike: "挥击", recover: "收招" })[actionPhase] : "Idle";
    refs.audio.textContent = audioActive ? "播放中" : state.frame > audio.end ? "已结束" : "未播放";
    refs.hit.textContent = hitActive ? "命中提交" : state.frame > hit.end ? "已结算" : "未触发";
    refs.movement.textContent = movementLocked ? "Timeline 锁定" : "自由";

    if (interrupted) {
      refs.phase.textContent = `第 ${state.interruptedAt} 帧中断`;
      refs.caption.textContent = "Interrupt 回收活动 Task，实体控制权已释放";
    } else if (hitActive) {
      refs.phase.textContent = "实体消费 / 命中";
      refs.caption.textContent = "命中 Task 提交语义命令，目标组件产生反馈";
    } else if (actionActive) {
      refs.phase.textContent = `动作执行 / ${refs.action.textContent}`;
      refs.caption.textContent = movementLocked ? "动作播放中；状态 Task 正在维持移动锁" : "动作播放中";
    } else {
      refs.phase.textContent = state.frame >= state.length - 1 ? "Timeline 完成" : "等待事件";
      refs.caption.textContent = "当前帧没有表现类 Task；播放器仍保持确定性推进";
    }
  }

  function renderRuntime() {
    const interrupted = state.interruptedAt !== null;
    const active = interrupted ? [] : state.clips.filter((clip) => isActive(clip));
    refs.activeCount.textContent = String(active.length);
    refs.activeTasks.replaceChildren();
    if (active.length === 0) {
      const empty = document.createElement("p");
      empty.className = "timeline-runtime__empty";
      empty.textContent = interrupted ? "所有活动 Task 已 Interrupt 并释放" : "当前帧没有活动 Task";
      refs.activeTasks.append(empty);
    } else {
      active.forEach((clip) => {
        const item = document.createElement("div");
        item.className = `timeline-task is-${clip.tone}`;
        item.innerHTML = `<span>${clip.track}</span><strong>${clip.name}</strong><small>Tick(${state.frame}) · ${clip.start}—${clip.end}</small>`;
        refs.activeTasks.append(item);
      });
    }

    refs.log.replaceChildren();
    if (!state.hideLog) {
      const events = buildEvents(state.frame);
      if (state.catchupFrom !== null) {
        const catchup = document.createElement("li");
        catchup.className = "is-catchup";
        catchup.innerHTML = `<b>${state.catchupFrom}→${state.frame}</b><span>CATCH-UP</span><p>逐帧补算中间帧，短 Clip 事件不会丢失</p>`;
        refs.log.append(catchup);
      }
      events.slice(-10).forEach((event) => {
        const item = document.createElement("li");
        item.className = `is-${event.type.toLowerCase()}`;
        item.innerHTML = `<b>F${String(event.frame).padStart(2, "0")}</b><span>${event.type}</span><p>${event.clip.track} / ${event.clip.name}</p>`;
        refs.log.append(item);
      });
    }
    if (refs.log.childElementCount === 0) {
      const empty = document.createElement("li");
      empty.className = "is-empty";
      empty.textContent = state.hideLog ? "显示已清空；继续移动播放头会重新生成事件。" : "尚未产生生命周期事件。";
      refs.log.append(empty);
    }

    let activeLine = 2;
    let codeState = "TICK";
    if (interrupted) { activeLine = 7; codeState = "INTERRUPT"; }
    else if (state.clips.some((clip) => clip.end === state.frame)) { activeLine = 5; codeState = "FINISH"; }
    else if (state.clips.some((clip) => clip.start === state.frame)) { activeLine = 3; codeState = "BEGIN"; }
    else if (active.length) { activeLine = 4; codeState = "TICK"; }
    codeLines.forEach((line) => line.classList.toggle("is-active", Number(line.dataset.codeLine) === activeLine));
    refs.codeState.textContent = codeState;
  }

  function renderPlayhead() {
    refs.frame.textContent = String(state.frame).padStart(2, "0");
    refs.time.textContent = `${(state.frame / state.fps).toFixed(2)}s`;
    const playheadLeft = refs.ruler.offsetLeft + ((state.frame + 0.5) / state.length) * refs.ruler.offsetWidth;
    refs.playhead.style.left = `${playheadLeft}px`;
    refs.playhead.querySelector("span").textContent = String(state.frame);
    refs.previous.toggleAttribute("disabled", state.frame === 0 || state.interruptedAt !== null);
    refs.next.toggleAttribute("disabled", state.frame >= state.length - 1 || state.interruptedAt !== null);
    refs.catchup.toggleAttribute("disabled", state.frame >= state.length - 1 || state.interruptedAt !== null);
    refs.interrupt.toggleAttribute("disabled", state.interruptedAt !== null);
    refs.play.toggleAttribute("disabled", state.frame >= state.length - 1 || state.interruptedAt !== null);
  }

  function renderAll() {
    renderRuler();
    renderTracks();
    renderPlayhead();
    renderPreview();
    renderRuntime();
  }

  function goTo(frame, catchupFrom = null) {
    if (state.interruptedAt !== null) return;
    state.frame = Math.max(0, Math.min(state.length - 1, frame));
    state.catchupFrom = catchupFrom;
    state.hideLog = false;
    renderAll();
    if (state.frame >= state.length - 1) stop();
  }

  function start() {
    if (state.playing) { stop(); return; }
    if (state.frame >= state.length - 1 || state.interruptedAt !== null) return;
    state.playing = true;
    refs.play.textContent = "暂停播放";
    refs.play.setAttribute("aria-pressed", "true");
    timer = window.setInterval(() => goTo(state.frame + 1), 1000 / state.fps);
    renderAll();
  }

  function bindPlayhead() {
    refs.playhead.addEventListener("pointerdown", (event) => {
      stop();
      event.preventDefault();
      const ruler = refs.ruler.getBoundingClientRect();
      const move = (moveEvent) => {
        const ratio = Math.max(0, Math.min(0.999999, (moveEvent.clientX - ruler.left) / ruler.width));
        goTo(Math.floor(ratio * state.length));
      };
      move(event);
      const end = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end, { once: true });
    });
  }

  refs.length.addEventListener("input", () => {
    const next = Number(refs.length.value);
    const maxEnd = Math.max(...state.clips.map((clip) => clip.end));
    if (!Number.isInteger(next) || next < 1 || next > 120) {
      refs.length.setCustomValidity("总帧数必须是 1—120 的整数。");
      setNotice("总帧数必须是 1—120 的整数；源数据没有改变。", true);
      return;
    }
    if (next <= maxEnd) {
      refs.length.setCustomValidity(`至少需要 ${maxEnd + 1} 帧才能容纳现有 Clip。`);
      setNotice(`无法缩短：现有 Clip 到第 ${maxEnd} 帧。请先拖短片段，或输入至少 ${maxEnd + 1} 帧。`, true);
      return;
    }
    refs.length.setCustomValidity("");
    state.length = next;
    state.frame = Math.min(state.frame, next - 1);
    state.interruptedAt = null;
    state.hideLog = false;
    setNotice(`Timeline 已改为 ${next} 帧；所有 Clip 保持原始区间。`);
    renderAll();
  });
  refs.fps.addEventListener("input", () => {
    const next = Number(refs.fps.value);
    if (!Number.isInteger(next) || next < 1 || next > 30) {
      refs.fps.setCustomValidity("播放帧率必须是 1—30 的整数。");
      setNotice("播放帧率必须是 1—30 的整数；播放速度没有改变。", true);
      return;
    }
    refs.fps.setCustomValidity("");
    stop();
    state.fps = next;
    setNotice(`播放帧率已改为 ${next} FPS。`);
    renderAll();
  });
  refs.previous.addEventListener("click", () => { stop(); goTo(state.frame - 1); });
  refs.next.addEventListener("click", () => { stop(); goTo(state.frame + 1); });
  refs.play.addEventListener("click", start);
  refs.catchup.addEventListener("click", () => {
    stop();
    const from = state.frame;
    goTo(Math.min(state.length - 1, state.frame + 3), from);
    setNotice(`模拟渲染卡顿：目标从第 ${from} 帧跳到第 ${state.frame} 帧，但播放器依次补算了中间逻辑帧。`);
  });
  refs.interrupt.addEventListener("click", () => {
    stop();
    state.interruptedAt = state.frame;
    state.hideLog = false;
    setNotice(`第 ${state.frame} 帧触发 Interrupt：活动 Task 清理状态并释放实体控制权。`);
    renderAll();
  });
  refs.clearLog.addEventListener("click", () => { state.hideLog = true; state.catchupFrom = null; renderRuntime(); });
  refs.reset.addEventListener("click", () => {
    stop();
    state.length = 15;
    state.fps = 6;
    state.frame = 0;
    state.clips = initialClips.map((clip) => ({ ...clip }));
    state.interruptedAt = null;
    state.hideLog = false;
    state.catchupFrom = null;
    refs.length.value = "15";
    refs.fps.value = "6";
    refs.length.setCustomValidity("");
    refs.fps.setCustomValidity("");
    setNotice("已恢复文章中的最小 Timeline 示例。拖动片段开始编辑。" );
    renderAll();
  });

  bindPlayhead();
  window.addEventListener("resize", renderPlayhead);
  renderAll();
});
