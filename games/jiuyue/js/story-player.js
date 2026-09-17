(function (global) {
  'use strict';

  const REQUIRED_FRAME_FIELDS = ['id', 'image', 'speaker', 'line', 'ariaLabel', 'motion', 'bubble'];
  const BUBBLE_PLACEMENTS = new Set(['upper-left', 'upper-center', 'upper-right', 'lower-center']);

  function assertStory(story) {
    if (!story || typeof story !== 'object' || !Array.isArray(story.frames) || story.frames.length === 0) {
      throw new TypeError('StoryPlayer requires a story with at least one frame.');
    }
    if (typeof story.id !== 'string' || story.id.trim() === '') {
      throw new TypeError('StoryPlayer story is missing id.');
    }
    if (typeof story.title !== 'string' || story.title.trim() === '') {
      throw new TypeError('StoryPlayer story is missing title.');
    }
    story.frames.forEach((frame, index) => {
      REQUIRED_FRAME_FIELDS.forEach((field) => {
        if (typeof frame[field] !== 'string' || frame[field].trim() === '') {
          throw new TypeError(`StoryPlayer frame ${index + 1} is missing ${field}.`);
        }
      });
      if (!BUBBLE_PLACEMENTS.has(frame.bubble)) {
        throw new TypeError(`StoryPlayer frame ${index + 1} has unknown bubble placement: ${frame.bubble}.`);
      }
    });
  }

  function createElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  class StoryPlayer {
    constructor(container, options) {
      if (!(container instanceof HTMLElement)) {
        throw new TypeError('StoryPlayer requires an HTMLElement container.');
      }
      if (!options || typeof options !== 'object') {
        throw new TypeError('StoryPlayer requires an options object.');
      }
      const settings = options;
      assertStory(settings.story);
      if (typeof settings.assetBase !== 'string') {
        throw new TypeError('StoryPlayer assetBase must be a string.');
      }
      if (typeof settings.onComplete !== 'function') {
        throw new TypeError('StoryPlayer onComplete must be a function.');
      }

      this.container = container;
      this.story = settings.story;
      this.assetBase = settings.assetBase;
      this.onComplete = settings.onComplete;
      this.index = 0;
      this.destroyed = false;
      this.completed = false;
      this.revealTimer = 0;
      this.boundKeydown = this.handleKeydown.bind(this);
      this.renderShell();
      document.addEventListener('keydown', this.boundKeydown);
      this.showFrame(0);
    }

    renderShell() {
      this.container.classList.add('story-player');
      this.container.setAttribute('role', 'dialog');
      this.container.setAttribute('aria-modal', 'true');
      this.container.setAttribute('aria-label', this.story.title);

      this.stage = createElement('div', 'story-player__stage');
      this.image = createElement('img', 'story-player__image');
      this.image.alt = '';
      this.image.decoding = 'async';
      this.image.addEventListener('load', () => this.handleImageLoad());
      this.image.addEventListener('error', () => this.handleImageError());

      this.vignette = createElement('div', 'story-player__vignette');
      this.error = createElement('div', 'story-player__error');
      this.error.setAttribute('role', 'alert');
      this.error.hidden = true;

      this.dialogue = createElement('section', 'story-player__dialogue');
      this.speaker = createElement('p', 'story-player__speaker');
      this.line = createElement('p', 'story-player__line');
      this.line.setAttribute('aria-live', 'polite');
      this.dialogue.append(this.speaker, this.line);

      this.progress = createElement('div', 'story-player__progress');
      this.progress.setAttribute('aria-label', '漫画进度');

      this.controls = createElement('div', 'story-player__controls');
      this.replayButton = createElement('button', 'story-player__button story-player__button--quiet', '重播');
      this.replayButton.type = 'button';
      this.replayButton.addEventListener('click', () => this.replay());
      this.skipButton = createElement('button', 'story-player__button story-player__button--quiet', '跳过');
      this.skipButton.type = 'button';
      this.skipButton.addEventListener('click', () => this.finish('skip'));
      this.nextButton = createElement('button', 'story-player__button story-player__button--next', '下一格');
      this.nextButton.type = 'button';
      this.nextButton.addEventListener('click', () => this.next());
      this.controls.append(this.replayButton, this.skipButton, this.nextButton);

      this.stage.append(this.image, this.vignette, this.error, this.dialogue, this.progress, this.controls);
      this.container.replaceChildren(this.stage);
    }

    showFrame(index) {
      if (this.destroyed) return;
      const frame = this.story.frames[index];
      this.index = index;
      this.clearRevealTimer();
      this.stage.classList.remove('story-player__stage--ready', 'story-player__stage--celebration');
      this.image.className = `story-player__image story-player__image--${frame.motion}`;
      this.image.alt = frame.ariaLabel;
      this.error.hidden = true;
      this.dialogue.hidden = true;
      this.dialogue.className = `story-player__dialogue story-player__dialogue--${frame.bubble}`;
      this.speaker.textContent = frame.speaker;
      this.line.textContent = '';
      this.nextButton.disabled = true;
      this.nextButton.textContent = index === this.story.frames.length - 1 ? '结束' : '下一格';
      this.renderProgress();
      this.image.src = this.assetBase + frame.image;
    }

    handleImageLoad() {
      if (this.destroyed) return;
      const frame = this.story.frames[this.index];
      this.dialogue.hidden = false;
      this.stage.classList.add('story-player__stage--ready');
      if (frame.celebration) this.stage.classList.add('story-player__stage--celebration');

      if (this.prefersReducedMotion()) {
        this.line.textContent = frame.line;
        this.nextButton.disabled = false;
        this.nextButton.focus({ preventScroll: true });
        return;
      }

      let cursor = 0;
      const revealNext = () => {
        if (this.destroyed || this.story.frames[this.index] !== frame) return;
        cursor += 1;
        this.line.textContent = frame.line.slice(0, cursor);
        if (cursor < frame.line.length) {
          this.revealTimer = global.setTimeout(revealNext, 42);
        } else {
          this.revealTimer = 0;
          this.nextButton.disabled = false;
        }
      };
      this.revealTimer = global.setTimeout(revealNext, 260);
    }

    handleImageError() {
      if (this.destroyed) return;
      this.clearRevealTimer();
      const frame = this.story.frames[this.index];
      this.dialogue.hidden = true;
      this.nextButton.disabled = true;
      this.error.hidden = false;
      this.error.textContent = `漫画图片加载失败：${frame.image}`;
    }

    renderProgress() {
      this.progress.replaceChildren();
      this.story.frames.forEach((frame, index) => {
        const dot = createElement('span', 'story-player__dot');
        dot.setAttribute('aria-label', `第 ${index + 1} 格：${frame.speaker}`);
        if (index === this.index) dot.classList.add('story-player__dot--active');
        if (index < this.index) dot.classList.add('story-player__dot--seen');
        this.progress.append(dot);
      });
    }

    next() {
      if (this.destroyed || this.nextButton.disabled) return;
      if (this.index < this.story.frames.length - 1) {
        this.showFrame(this.index + 1);
      } else {
        this.finish('complete');
      }
    }

    replay() {
      if (this.destroyed) return;
      this.completed = false;
      this.showFrame(0);
    }

    finish(reason) {
      if (this.destroyed || this.completed) return;
      this.completed = true;
      const callback = this.onComplete;
      this.destroy();
      callback({ storyId: this.story.id, reason });
    }

    handleKeydown(event) {
      if (this.destroyed) return;
      if (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.next();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.finish('skip');
      } else if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        this.replay();
      }
    }

    prefersReducedMotion() {
      return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    clearRevealTimer() {
      if (this.revealTimer) {
        global.clearTimeout(this.revealTimer);
        this.revealTimer = 0;
      }
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.clearRevealTimer();
      document.removeEventListener('keydown', this.boundKeydown);
      this.container.classList.remove('story-player');
      this.container.removeAttribute('role');
      this.container.removeAttribute('aria-modal');
      this.container.removeAttribute('aria-label');
      this.container.replaceChildren();
    }
  }

  global.LionStoryPlayer = Object.freeze({
    create(container, options) {
      return new StoryPlayer(container, options);
    }
  });
})(typeof window!=='undefined'?window:globalThis);
