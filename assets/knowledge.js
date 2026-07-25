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
