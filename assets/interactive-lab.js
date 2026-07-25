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

  global.XianyuInteractiveLab = Object.freeze({ createStepPlayer });
})(window);
