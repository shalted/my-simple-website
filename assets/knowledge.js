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
