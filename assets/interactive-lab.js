(function bootstrapInteractiveLab(global) {
  "use strict";

  function fail(message) {
    throw new Error(`[InteractiveLab] ${message}`);
  }

  function requireElement(value, name, allowNull) {
    if (allowNull && value === null) return;
    if (!(value instanceof Element)) fail(`${name} 必须是 DOM Element`);
  }

  function requireString(value, name) {
    if (typeof value !== "string" || value.length === 0) fail(`${name} 必须是非空字符串`);
  }

  function requireFunction(value, name) {
    if (typeof value !== "function") fail(`${name} 必须是函数`);
  }

  function validateSteps(value) {
    if (!Array.isArray(value) || value.length === 0) fail("steps 必须是非空数组");
  }

  const labArticles = {
    "/knowledge/ability-flow/": ["一次技能从输入到结束", "/knowledge/library/工程设计/一次技能从输入到结束/"],
    "/knowledge/binary-heap/": ["二叉堆优先队列", "/knowledge/library/数据结构/二叉堆优先队列/"],
    "/knowledge/config-pipeline/": ["配置数据生成管线", "/knowledge/library/工程设计/配置数据生成管线/"],
    "/knowledge/dirty-attribute/": ["属性脏标记与局部重算", "/knowledge/library/游戏逻辑常用模式/属性脏标记与局部重算/"],
    "/knowledge/effect-lifecycle/": ["Effect / Buff 生命周期", "/knowledge/library/工程设计/Effect与Buff生命周期/"],
    "/knowledge/network-prediction/": ["网络预测与服务器校正", "/knowledge/library/工程设计/网络预测与服务器校正/"],
    "/knowledge/projectile-motion/": ["命中后的运动与投射物", "/knowledge/library/工程设计/命中后的运动与投射物/"],
    "/knowledge/resource-scope/": ["资源作用域与引用释放", "/knowledge/library/工程设计/资源作用域与引用释放/"],
    "/knowledge/swarm-ai/": ["集群 AI 槽位与行为", "/knowledge/library/算法/集群AI槽位分配与非攻击意图/"],
    "/knowledge/tag-arbitration/": ["状态来源与技能仲裁", "/knowledge/library/工程设计/状态来源与技能仲裁/"],
    "/knowledge/target-filter/": ["目标筛选与命中判定", "/knowledge/library/算法/目标筛选与命中判定/"],
    "/knowledge/ui-stack-pool/": ["UI 页面栈与面板池", "/knowledge/library/工程设计/UI页面栈与面板池/"],
    "/knowledge/virtual-list/": ["虚拟列表与节点复用", "/knowledge/library/工程设计/虚拟列表与节点复用/"]
  };

  function getLabArticle() {
    if (window.location.pathname === "/knowledge/systems-lab/") {
      if (window.location.hash === "#random") {
        return ["随机系统", "/knowledge/library/游戏逻辑常用模式/随机系统/"];
      }
      if (window.location.hash === "#space") {
        return ["空间划分：九宫格与四叉树", "/knowledge/library/算法/空间划分-九宫格与四叉树/"];
      }
      return ["位标记 Flags 与 BitMask", "/knowledge/library/游戏逻辑常用模式/位标记Flags与BitMask/"];
    }

    return labArticles[window.location.pathname] || null;
  }

  function renderLearningPath(main, article) {
    if (!article) return;

    const [title, href] = article;
    const learningPath = document.createElement("aside");
    learningPath.className = "lab-learning-path";
    learningPath.setAttribute("aria-label", "推荐学习顺序");
    learningPath.innerHTML = `
      <div class="lab-learning-path__label">RECOMMENDED PATH</div>
      <div class="lab-learning-path__steps">
        <a href="${href}"><span>01</span><strong>先读完整讲解</strong><small>${title} · 概念、代码与具体示例</small></a>
        <i aria-hidden="true">→</i>
        <div><span>02</span><strong>再操作当前实验</strong><small>单步观察代码与状态变化</small></div>
      </div>`;
    main.prepend(learningPath);
  }

  /**
   * 交互专题由独立页面组成，这里只统一站点级导航与层级，不介入专题自身逻辑。
   */
  function enhanceSiteShell() {
    const header = document.querySelector(".site-header");
    if (!(header instanceof HTMLElement)) return;

    const isHome = window.location.pathname === "/";
    document.documentElement.classList.add(isHome ? "xianyu-home" : "xianyu-lab");

    const articleLink = [...header.querySelectorAll("a")].find((link) => /完整文章|阅读文章/.test(link.textContent));

    header.classList.add("unified-site-header");
    header.innerHTML = `
      <nav class="site-shell-nav" aria-label="主导航">
        <a class="site-shell-brand" href="/"><span>X</span><strong>XIANYUWO / DEV LAB</strong></a>
        <button class="site-shell-menu-toggle" type="button" data-lab-site-menu-toggle aria-expanded="false" aria-controls="lab-site-menu"><span>导航</span><i aria-hidden="true"></i></button>
        <div class="site-shell-links" id="lab-site-menu" data-lab-site-menu>
          <a href="/">首页</a>
          <a href="/knowledge/library/">知识库</a>
          <a href="/knowledge/library/%E5%90%8E%E7%BB%AD%E5%AD%A6%E4%B9%A0%E8%AE%A1%E5%88%92/">学习路线</a>
          <a href="/#lab">交互专题</a>
          <form class="site-shell-search" action="/knowledge/library/" role="search">
            <label for="lab-site-search">搜索知识库</label>
            <input id="lab-site-search" name="q" type="search" placeholder="搜索" autocomplete="off">
            <button type="submit" aria-label="提交搜索">搜索</button>
          </form>
          <a href="https://github.com/shalted/my-simple-website" target="_blank" rel="noreferrer">GitHub ↗</a>
        </div>
      </nav>`;

    const mappedArticle = getLabArticle();
    const mappedHref = mappedArticle ? mappedArticle[1] : null;
    if (articleLink instanceof HTMLAnchorElement || mappedHref) {
      const articleHref = articleLink instanceof HTMLAnchorElement
        ? articleLink.getAttribute("href")
        : mappedHref;
      if (!articleHref) fail("配套文章链接缺少 href");
      const contextLink = document.createElement("a");
      contextLink.className = "site-context-link";
      contextLink.href = articleHref;
      contextLink.textContent = "配套文章";
      const search = header.querySelector(".site-shell-search");
      if (!(search instanceof HTMLFormElement)) fail("统一导航缺少搜索表单");
      search.before(contextLink);
    }

    const toggle = header.querySelector("[data-lab-site-menu-toggle]");
    const menu = header.querySelector("[data-lab-site-menu]");
    if (!(toggle instanceof HTMLButtonElement) || !(menu instanceof HTMLElement)) {
      fail("统一导航缺少菜单控件");
    }
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      menu.classList.toggle("is-open", open);
    });
    menu.addEventListener("click", (event) => {
      if (!(event.target instanceof HTMLAnchorElement)) return;
      toggle.setAttribute("aria-expanded", "false");
      menu.classList.remove("is-open");
    });

    if (isHome) return;

    const main = document.querySelector("main");
    if (!(main instanceof HTMLElement)) fail("交互专题缺少 main 元素");
    renderLearningPath(main, mappedArticle);
    const pageTitle = document.title.split("·")[0].trim();
    const context = document.createElement("div");
    context.className = "lab-site-context";
    context.innerHTML = `<nav aria-label="面包屑"><a href="/">首页</a><a href="/#lab">交互专题</a><span aria-current="page"></span></nav>`;
    const currentPage = context.querySelector("[aria-current='page']");
    if (!(currentPage instanceof HTMLSpanElement)) fail("交互专题面包屑缺少当前页");
    currentPage.textContent = pageTitle;
    main.before(context);
  }

  function createStepPlayer(config) {
    if (!config || typeof config !== "object") fail("createStepPlayer 需要配置对象");

    const {
      steps: initialSteps,
      autoStepMs,
      endBehavior,
      dotElement,
      dotsInteractive,
      controls,
      labels,
      classes,
      renderStep,
      onModeChange
    } = config;

    validateSteps(initialSteps);
    if (!Number.isInteger(autoStepMs) || autoStepMs <= 0) fail("autoStepMs 必须是正整数");
    if (endBehavior !== "restart" && endBehavior !== "disable") {
      fail('endBehavior 必须是 "restart" 或 "disable"');
    }
    if (dotElement !== "button" && dotElement !== "i") fail('dotElement 必须是 "button" 或 "i"');
    if (typeof dotsInteractive !== "boolean") fail("dotsInteractive 必须是布尔值");
    if (!controls || typeof controls !== "object") fail("controls 配置缺失");
    if (!labels || typeof labels !== "object") fail("labels 配置缺失");
    if (!classes || typeof classes !== "object") fail("classes 配置缺失");

    requireElement(controls.previous, "controls.previous", false);
    requireElement(controls.next, "controls.next", false);
    requireElement(controls.auto, "controls.auto", false);
    requireElement(controls.reset, "controls.reset", true);
    requireElement(controls.dots, "controls.dots", false);
    requireString(labels.play, "labels.play");
    requireString(labels.pause, "labels.pause");
    requireString(labels.complete, "labels.complete");
    requireString(labels.next, "labels.next");
    requireString(labels.done, "labels.done");
    requireFunction(labels.dot, "labels.dot");
    requireString(classes.playing, "classes.playing");
    requireString(classes.dot, "classes.dot");
    requireString(classes.dotActive, "classes.dotActive");
    requireString(classes.dotPast, "classes.dotPast");
    requireFunction(renderStep, "renderStep");
    requireFunction(onModeChange, "onModeChange");

    if (dotsInteractive && dotElement !== "button") {
      fail("可交互进度点必须使用 button");
    }

    let steps = initialSteps;
    let index = 0;
    let timer = null;
    let destroyed = false;
    const listeners = [];

    function assertAlive() {
      if (destroyed) fail("播放器已经销毁");
    }

    function atEnd() {
      return index === steps.length - 1;
    }

    function mode() {
      return timer === null ? "manual" : "auto";
    }

    function emitMode(reason) {
      controls.auto.classList.toggle(classes.playing, mode() === "auto");
      controls.auto.setAttribute("aria-pressed", String(mode() === "auto"));
      onModeChange({ mode: mode(), atEnd: atEnd(), index, total: steps.length, reason });
    }

    function updateControls() {
      controls.previous.disabled = index === 0;
      controls.next.disabled = atEnd();
      controls.next.textContent = atEnd() ? labels.done : labels.next;

      const autoDisabled = endBehavior === "disable" && atEnd();
      controls.auto.disabled = autoDisabled;
      if (mode() === "auto") controls.auto.textContent = labels.pause;
      else if (autoDisabled) controls.auto.textContent = labels.complete;
      else controls.auto.textContent = labels.play;
    }

    function render(reason) {
      assertAlive();
      renderStep({
        step: steps[index],
        index,
        total: steps.length,
        mode: mode(),
        reason
      });

      Array.from(controls.dots.children).forEach((dot, dotIndex) => {
        dot.classList.toggle(classes.dotPast, dotIndex < index);
        dot.classList.toggle(classes.dotActive, dotIndex === index);
        if (dotElement === "button") {
          dot.setAttribute("aria-current", dotIndex === index ? "step" : "false");
        }
      });
      updateControls();
    }

    function pause(reason) {
      assertAlive();
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      updateControls();
      emitMode(reason);
    }

    function setIndex(nextIndex, reason) {
      assertAlive();
      if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= steps.length) {
        fail(`步骤下标越界：${nextIndex}`);
      }
      index = nextIndex;
      render(reason);
      emitMode(reason);
    }

    function goTo(nextIndex) {
      pause("manual-navigation");
      setIndex(nextIndex, "manual-navigation");
    }

    function previous() {
      if (index === 0) return;
      goTo(index - 1);
    }

    function next() {
      if (atEnd()) return;
      goTo(index + 1);
    }

    function reset() {
      pause("reset");
      setIndex(0, "reset");
    }

    function play() {
      assertAlive();
      if (timer !== null) return;
      if (atEnd()) {
        if (endBehavior === "disable") return;
        index = 0;
        render("restart");
      }

      timer = window.setInterval(() => {
        if (atEnd()) {
          pause("complete");
          return;
        }
        index += 1;
        render("auto-step");
        if (atEnd()) pause("complete");
      }, autoStepMs);
      updateControls();
      emitMode("play");
    }

    function toggleAuto() {
      if (timer === null) play();
      else pause("pause");
    }

    function rebuildDots() {
      controls.dots.replaceChildren();
      steps.forEach((_, dotIndex) => {
        const dot = document.createElement(dotElement);
        dot.className = classes.dot;
        dot.setAttribute("data-lab-dot", "");
        if (dotElement === "button") {
          dot.type = "button";
          dot.setAttribute("aria-label", labels.dot(dotIndex, steps.length));
        } else {
          dot.setAttribute("aria-hidden", "true");
        }
        if (dotsInteractive) {
          const handler = () => goTo(dotIndex);
          dot.addEventListener("click", handler);
          listeners.push(() => dot.removeEventListener("click", handler));
        }
        controls.dots.append(dot);
      });
    }

    function replaceSteps(nextSteps) {
      assertAlive();
      validateSteps(nextSteps);
      pause("replace-steps");
      steps = nextSteps;
      index = 0;
      rebuildDots();
      render("replace-steps");
      emitMode("replace-steps");
    }

    function listen(element, type, handler) {
      element.addEventListener(type, handler);
      listeners.push(() => element.removeEventListener(type, handler));
    }

    listen(controls.previous, "click", previous);
    listen(controls.next, "click", next);
    listen(controls.auto, "click", toggleAuto);
    if (controls.reset !== null) listen(controls.reset, "click", reset);
    listen(document, "visibilitychange", () => {
      if (document.hidden) pause("document-hidden");
    });

    function destroy() {
      if (destroyed) return;
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      listeners.splice(0).forEach((remove) => remove());
      destroyed = true;
    }

    rebuildDots();
    render("initial");
    emitMode("initial");

    return Object.freeze({
      destroy,
      goTo,
      next,
      pause,
      play,
      previous,
      replaceSteps,
      reset,
      state: () => Object.freeze({ index, total: steps.length, mode: mode(), atEnd: atEnd() })
    });
  }

  function createProcessPlayer(config) {
    if (!config || typeof config !== "object") fail("createProcessPlayer 需要配置对象");

    const {
      autoStepMs,
      controls,
      labels,
      classes,
      initializeProcess,
      advanceProcess,
      resetProcess,
      readState,
      onStateChange
    } = config;

    if (!Number.isInteger(autoStepMs) || autoStepMs <= 0) fail("autoStepMs 必须是正整数");
    if (!controls || typeof controls !== "object") fail("controls 配置缺失");
    if (!labels || typeof labels !== "object") fail("labels 配置缺失");
    if (!classes || typeof classes !== "object") fail("classes 配置缺失");
    requireElement(controls.initialize, "controls.initialize", false);
    requireElement(controls.next, "controls.next", false);
    requireElement(controls.auto, "controls.auto", false);
    requireElement(controls.reset, "controls.reset", false);
    requireString(labels.play, "labels.play");
    requireString(labels.pause, "labels.pause");
    requireString(labels.complete, "labels.complete");
    requireString(classes.playing, "classes.playing");
    requireFunction(initializeProcess, "initializeProcess");
    requireFunction(advanceProcess, "advanceProcess");
    requireFunction(resetProcess, "resetProcess");
    requireFunction(readState, "readState");
    requireFunction(onStateChange, "onStateChange");

    let timer = null;
    let destroyed = false;
    const listeners = [];

    function assertAlive() {
      if (destroyed) fail("动态过程播放器已经销毁");
    }

    function state() {
      const value = readState();
      if (!value || typeof value !== "object") fail("readState 必须返回状态对象");
      if (typeof value.initialized !== "boolean") fail("readState.initialized 必须是布尔值");
      if (typeof value.complete !== "boolean") fail("readState.complete 必须是布尔值");
      if (!value.initialized && value.complete) fail("未初始化的过程不能标记为完成");
      return value;
    }

    function mode() {
      return timer === null ? "manual" : "auto";
    }

    function sync(reason) {
      assertAlive();
      const current = state();
      controls.initialize.disabled = current.initialized && !current.complete;
      controls.next.disabled = !current.initialized || current.complete;
      controls.auto.disabled = !current.initialized || current.complete;
      controls.auto.classList.toggle(classes.playing, mode() === "auto");
      controls.auto.setAttribute("aria-pressed", String(mode() === "auto"));
      if (mode() === "auto") controls.auto.textContent = labels.pause;
      else if (current.complete) controls.auto.textContent = labels.complete;
      else controls.auto.textContent = labels.play;
      onStateChange({ ...current, mode: mode(), reason });
      return current;
    }

    function pause(reason) {
      assertAlive();
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      sync(reason);
    }

    function initialize() {
      pause("initialize");
      initializeProcess();
      sync("initialize");
    }

    function advanceOnce(reason) {
      const before = state();
      if (!before.initialized || before.complete) return;
      advanceProcess();
      const after = sync(reason);
      if (after.complete && timer !== null) pause("complete");
    }

    function next() {
      pause("manual-step");
      advanceOnce("manual-step");
    }

    function play() {
      assertAlive();
      const current = state();
      if (!current.initialized || current.complete || timer !== null) return;
      timer = window.setInterval(() => advanceOnce("auto-step"), autoStepMs);
      sync("play");
    }

    function toggleAuto() {
      if (timer === null) play();
      else pause("pause");
    }

    function reset() {
      pause("reset");
      resetProcess();
      sync("reset");
    }

    function listen(element, type, handler) {
      element.addEventListener(type, handler);
      listeners.push(() => element.removeEventListener(type, handler));
    }

    listen(controls.initialize, "click", initialize);
    listen(controls.next, "click", next);
    listen(controls.auto, "click", toggleAuto);
    listen(controls.reset, "click", reset);
    listen(document, "visibilitychange", () => {
      if (document.hidden) pause("document-hidden");
    });

    function destroy() {
      if (destroyed) return;
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      listeners.splice(0).forEach((remove) => remove());
      destroyed = true;
    }

    sync("initial");

    return Object.freeze({
      destroy,
      initialize,
      next,
      pause,
      play,
      reset,
      state: () => Object.freeze({ ...state(), mode: mode() })
    });
  }

  enhanceSiteShell();
  global.XianyuInteractiveLab = Object.freeze({ createStepPlayer, createProcessPlayer });
})(window);
