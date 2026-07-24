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
  let current = 0;
  let timer = null;

  const stop = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    playButton.setAttribute("aria-pressed", "false");
    playButton.textContent = "自动播放";
  };

  const show = (index) => {
    current = Math.max(0, Math.min(index, slides.length - 1));
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === current;
      slide.hidden = !active;
      slide.classList.toggle("active", active);
    });
    jumpButtons.forEach((button, buttonIndex) => button.classList.toggle("active", buttonIndex === current));
    currentLabel.textContent = String(current + 1).padStart(2, "0");
    progress.style.width = `${((current + 1) / slides.length) * 100}%`;
    deckNavigation.scrollTo({
      top: Math.max(0, jumpButtons[current].offsetTop - deckNavigation.clientHeight / 2),
      left: Math.max(0, jumpButtons[current].offsetLeft - deckNavigation.clientWidth / 2),
      behavior: "smooth",
    });
  };

  const advance = () => {
    if (current === slides.length - 1) {
      stop();
      return;
    }
    show(current + 1);
  };

  previousButton.addEventListener("click", () => {
    stop();
    show(current - 1);
  });
  nextButton.addEventListener("click", () => {
    stop();
    show(current + 1);
  });
  jumpButtons.forEach((button) => button.addEventListener("click", () => {
    stop();
    show(Number(button.dataset.deckJump));
  }));
  playButton.addEventListener("click", () => {
    if (timer !== null) {
      stop();
      return;
    }
    if (current === slides.length - 1) show(0);
    playButton.setAttribute("aria-pressed", "true");
    playButton.textContent = "暂停播放";
    timer = window.setInterval(advance, 2000);
  });

  show(0);
});
