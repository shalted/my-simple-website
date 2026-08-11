(() => {
  const GUEST_STORAGE_KEY = "xianyuwo.learning.guest.v1";
  const USER_STORAGE_PREFIX = "xianyuwo.learning.user.";
  const MERGE_DECISION_PREFIX = "xianyuwo.learning.merge-decision.";
  const accountButton = document.querySelector("[data-account-open]");
  const accountDialog = document.querySelector("[data-account-dialog]");
  const accountClose = document.querySelector("[data-account-close]");
  const anonymousPanel = document.querySelector("[data-account-anonymous]");
  const signedInPanel = document.querySelector("[data-account-signed-in]");
  const accountUsername = document.querySelector("[data-account-username]");
  const accountStatus = document.querySelector("[data-account-status]");
  const mergePrompt = document.querySelector("[data-account-merge]");
  const mergeButton = document.querySelector("[data-account-merge-confirm]");
  const cloudOnlyButton = document.querySelector("[data-account-cloud-only]");
  const logoutButton = document.querySelector("[data-account-logout]");
  const tabs = [...document.querySelectorAll("[data-account-tab]")];
  const forms = [...document.querySelectorAll("[data-account-form]")];
  const toast = document.querySelector("[data-sync-toast]");
  const articleRoot = document.querySelector("[data-learning-article]");
  const articleBody = document.querySelector(".article-body");
  const articleCards = [...document.querySelectorAll("[data-article-card][data-article-id]")];
  const dashboard = document.querySelector("[data-learning-dashboard]");

  const state = {
    user: null,
    records: readRecords(GUEST_STORAGE_KEY),
    storageKey: GUEST_STORAGE_KEY,
    cloudAvailable: false,
    dirtyArticleId: null,
    initialized: false,
  };

  function readRecords(key) {
    try {
      const source = localStorage.getItem(key);
      if (!source) return {};
      const records = JSON.parse(source);
      if (!records || typeof records !== "object" || Array.isArray(records)) {
        throw new Error("本机学习记录不是对象。");
      }
      return records;
    } catch (error) {
      showToast(`本机学习记录读取失败：${error.message}`, true);
      return {};
    }
  }

  function writeRecords() {
    try {
      localStorage.setItem(state.storageKey, JSON.stringify(state.records));
    } catch (error) {
      showToast(`本机学习记录保存失败：${error.message}`, true);
    }
  }

  function showToast(message, isError = false) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("is-error", isError);
    toast.hidden = false;
  }

  function setAccountStatus(message, type = "") {
    if (!accountStatus) return;
    accountStatus.textContent = message;
    accountStatus.classList.toggle("is-error", type === "error");
    accountStatus.classList.toggle("is-success", type === "success");
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    const payload = await response.json().catch(() => ({ error: `服务器返回了无法识别的内容（HTTP ${response.status}）。` }));
    if (!response.ok) {
      const error = new Error(payload.error ?? `请求失败（HTTP ${response.status}）。`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function recordsFromList(records) {
    return Object.fromEntries(records.map((record) => [record.articleId, record]));
  }

  function latestRecordUpdate(records) {
    return Object.values(records).map((record) => String(record.updatedAt ?? "")).sort().at(-1) ?? "";
  }

  function shouldOfferGuestMerge(guestRecords) {
    if (!state.user || !Object.keys(guestRecords).length) return false;
    try {
      const decisionAt = localStorage.getItem(`${MERGE_DECISION_PREFIX}${state.user.id}.v1`) ?? "";
      return latestRecordUpdate(guestRecords) > decisionAt;
    } catch (error) {
      showToast(`本机合并选择读取失败：${error.message}`, true);
      return true;
    }
  }

  function rememberGuestMergeDecision(guestRecords) {
    if (!state.user) return;
    try {
      localStorage.setItem(`${MERGE_DECISION_PREFIX}${state.user.id}.v1`, latestRecordUpdate(guestRecords));
    } catch (error) {
      showToast(`本机合并选择保存失败：${error.message}`, true);
    }
  }

  function renderAccount() {
    if (accountButton) accountButton.textContent = state.user ? state.user.username : "登录 / 进度";
    if (anonymousPanel) anonymousPanel.hidden = Boolean(state.user);
    if (signedInPanel) signedInPanel.hidden = !state.user;
    if (accountUsername) accountUsername.textContent = state.user?.username ?? "";
  }

  function recordLabel(record) {
    if (!record) return { text: "未开始", className: "" };
    if (record.status === "completed") return { text: "已完成", className: "is-complete" };
    return { text: `学习中 · ${record.maxProgress}%`, className: "is-progress" };
  }

  function renderCardsAndDashboard() {
    articleCards.forEach((card) => {
      const badge = card.querySelector("[data-progress-label]");
      if (!badge) return;
      const label = recordLabel(state.records[card.dataset.articleId]);
      badge.textContent = label.text;
      badge.classList.toggle("is-progress", label.className === "is-progress");
      badge.classList.toggle("is-complete", label.className === "is-complete");
    });
    if (!dashboard) return;
    const total = articleCards.length;
    const values = Object.values(state.records);
    const completed = articleCards.filter((card) => state.records[card.dataset.articleId]?.status === "completed").length;
    const inProgress = articleCards.filter((card) => state.records[card.dataset.articleId]?.status === "in_progress").length;
    const percentage = total ? Math.round((completed / total) * 100) : 0;
    dashboard.querySelector("[data-dashboard-completed]").textContent = `${completed} / ${total}`;
    dashboard.querySelector("[data-dashboard-progress]").textContent = String(inProgress);
    dashboard.querySelector("[data-dashboard-percent]").textContent = `${percentage}%`;
    dashboard.querySelector("[data-dashboard-bar]").style.transform = `scaleX(${percentage / 100})`;
    dashboard.querySelector("[data-dashboard-identity]").textContent = state.user
      ? `已登录为 ${state.user.username}，学习记录正在使用云端同步。`
      : "当前未登录，学习记录保存在这台设备。";

    const continueBox = dashboard.querySelector("[data-dashboard-continue]");
    const recent = values
      .filter((record) => record.status === "in_progress" && articleCards.some((card) => card.dataset.articleId === record.articleId))
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))[0];
    if (!recent) {
      continueBox.textContent = completed ? "当前没有进行中的文章。" : "打开任意文章即可开始记录进度。";
      return;
    }
    const card = articleCards.find((item) => item.dataset.articleId === recent.articleId);
    const link = document.createElement("a");
    link.href = card.href;
    link.textContent = `继续学习：${card.dataset.articleTitle} · ${recent.maxProgress}% →`;
    continueBox.replaceChildren(link);
  }

  function renderArticleProgress() {
    if (!articleRoot) return;
    const articleId = articleRoot.dataset.articleId;
    const record = state.records[articleId];
    const status = document.querySelector("[data-article-progress-status]");
    const detail = document.querySelector("[data-article-progress-detail]");
    const resume = document.querySelector("[data-article-progress-resume]");
    const complete = document.querySelector("[data-article-progress-complete]");
    if (!status || !detail || !resume || !complete) return;

    if (!record) {
      status.textContent = "尚未开始";
      detail.textContent = state.user ? "阅读位置会同步到你的账号。" : "阅读位置将保存在这台设备。";
      resume.hidden = true;
      complete.textContent = "标记为已完成";
      complete.disabled = false;
      return;
    }
    if (record.status === "completed") {
      status.textContent = "这篇文章已完成";
      detail.textContent = state.user ? "完成状态已关联到当前账号。" : "完成状态保存在这台设备。";
      resume.hidden = true;
      complete.textContent = "已完成";
      complete.disabled = true;
      return;
    }
    status.textContent = `学习中 · 已读到 ${record.maxProgress}%`;
    detail.textContent = record.lastHeading ? `上次位置：${record.lastHeading}` : "已保存当前阅读位置。";
    resume.hidden = record.maxProgress <= 0;
    complete.textContent = "标记为已完成";
    complete.disabled = false;
  }

  function renderAll() {
    renderAccount();
    renderCardsAndDashboard();
    renderArticleProgress();
  }

  function currentHeading() {
    if (!articleBody) return null;
    const headings = [...articleBody.querySelectorAll("h2[id], h3[id]")];
    let current = null;
    headings.forEach((heading) => {
      if (heading.getBoundingClientRect().top <= window.innerHeight * 0.35) current = heading.textContent.trim();
    });
    return current;
  }

  function updateArticleRecord(forceComplete = false) {
    if (!state.initialized || !articleRoot || !articleBody) return null;
    const articleId = articleRoot.dataset.articleId;
    const previous = state.records[articleId];
    if (previous?.status === "completed" && !forceComplete) return previous;
    const bounds = articleBody.getBoundingClientRect();
    const total = Math.max(1, articleBody.offsetHeight - window.innerHeight);
    const current = Math.min(total, Math.max(0, -bounds.top));
    const measuredProgress = Math.round((current / total) * 100);
    const maxProgress = forceComplete ? 100 : Math.max(previous?.maxProgress ?? 0, measuredProgress);
    const status = forceComplete ? "completed" : "in_progress";
    const lastHeading = currentHeading();
    if (previous && previous.status === status && previous.maxProgress === maxProgress && previous.lastHeading === lastHeading) {
      return previous;
    }
    const now = new Date().toISOString();
    const record = {
      articleId,
      status,
      maxProgress,
      lastHeading,
      updatedAt: now,
      completedAt: forceComplete ? now : previous?.completedAt ?? null,
    };
    state.records[articleId] = record;
    state.dirtyArticleId = articleId;
    writeRecords();
    renderArticleProgress();
    return record;
  }

  async function syncRecord(record, keepalive = false) {
    if (!state.user || !record) return;
    try {
      await api("/api/progress", {
        method: "PUT",
        body: JSON.stringify(record),
        keepalive,
      });
      state.cloudAvailable = true;
      state.dirtyArticleId = null;
      if (!keepalive) showToast("学习进度已同步到账号。");
    } catch (error) {
      state.cloudAvailable = false;
      showToast(`云同步失败，本机记录已保留：${error.message}`, true);
    }
  }

  async function loadCloudProgress() {
    try {
      const payload = await api("/api/progress");
      state.user = payload.user;
      state.storageKey = `${USER_STORAGE_PREFIX}${state.user.id}.v1`;
      state.records = recordsFromList(payload.records);
      state.cloudAvailable = true;
      state.dirtyArticleId = null;
      writeRecords();
      renderAll();
      return true;
    } catch (error) {
      if (error.status === 401) {
        state.user = null;
        state.storageKey = GUEST_STORAGE_KEY;
        state.records = readRecords(GUEST_STORAGE_KEY);
        renderAll();
        return false;
      }
      if (state.user) {
        state.storageKey = `${USER_STORAGE_PREFIX}${state.user.id}.v1`;
        state.records = readRecords(state.storageKey);
      }
      state.cloudAvailable = false;
      renderAll();
      showToast(`云端学习记录读取失败，正在使用本机记录：${error.message}`, true);
      return false;
    }
  }

  async function finishAuthentication(payload) {
    state.user = payload.user;
    const guestRecords = readRecords(GUEST_STORAGE_KEY);
    await loadCloudProgress();
    if (!state.user) throw new Error("登录成功，但账号状态读取失败。");
    if (mergePrompt) mergePrompt.hidden = !shouldOfferGuestMerge(guestRecords);
    setAccountStatus(`已登录为 ${state.user.username}。`, "success");
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => {
    tabs.forEach((item) => item.setAttribute("aria-selected", String(item === tab)));
    forms.forEach((form) => { form.hidden = form.dataset.accountForm !== tab.dataset.accountTab; });
    setAccountStatus("");
  }));

  forms.forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const action = form.dataset.accountForm;
    const submit = form.querySelector("button[type='submit']");
    submit.disabled = true;
    setAccountStatus(action === "register" ? "正在创建账号…" : "正在登录…");
    try {
      const data = new FormData(form);
      const payload = await api(`/api/auth/${action}`, {
        method: "POST",
        body: JSON.stringify({
          username: data.get("username"),
          password: data.get("password"),
        }),
      });
      form.reset();
      await finishAuthentication(payload);
    } catch (error) {
      setAccountStatus(error.message, "error");
    } finally {
      submit.disabled = false;
    }
  }));

  mergeButton?.addEventListener("click", async () => {
    mergeButton.disabled = true;
    setAccountStatus("正在合并本机记录…");
    try {
      const guestRecords = Object.values(readRecords(GUEST_STORAGE_KEY));
      const payload = await api("/api/progress/merge", {
        method: "POST",
        body: JSON.stringify({ records: guestRecords }),
      });
      state.records = recordsFromList(payload.records);
      writeRecords();
      rememberGuestMergeDecision(Object.fromEntries(guestRecords.map((record) => [record.articleId, record])));
      mergePrompt.hidden = true;
      renderAll();
      setAccountStatus("本机记录已经合并到账号。", "success");
    } catch (error) {
      setAccountStatus(`合并失败，本机记录仍然保留：${error.message}`, "error");
    } finally {
      mergeButton.disabled = false;
    }
  });

  cloudOnlyButton?.addEventListener("click", () => {
    rememberGuestMergeDecision(readRecords(GUEST_STORAGE_KEY));
    mergePrompt.hidden = true;
    setAccountStatus("当前使用云端记录，本机访客记录仍然保留。", "success");
  });

  logoutButton?.addEventListener("click", async () => {
    logoutButton.disabled = true;
    setAccountStatus("正在退出…");
    try {
      await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
      state.user = null;
      state.storageKey = GUEST_STORAGE_KEY;
      state.records = readRecords(GUEST_STORAGE_KEY);
      state.cloudAvailable = false;
      mergePrompt.hidden = true;
      renderAll();
      setAccountStatus("已经退出，网站仍可正常浏览。", "success");
    } catch (error) {
      setAccountStatus(`退出失败：${error.message}`, "error");
    } finally {
      logoutButton.disabled = false;
    }
  });

  accountButton?.addEventListener("click", () => accountDialog?.showModal());
  accountClose?.addEventListener("click", () => accountDialog?.close());
  accountDialog?.addEventListener("click", (event) => {
    if (event.target === accountDialog) accountDialog.close();
  });

  if (articleRoot && articleBody) {
    const articleId = articleRoot.dataset.articleId;
    let framePending = false;
    document.addEventListener("scroll", () => {
      if (framePending) return;
      framePending = true;
      requestAnimationFrame(() => {
        framePending = false;
        const previousProgress = state.records[articleId]?.maxProgress ?? 0;
        const record = updateArticleRecord();
        if (record && record.maxProgress !== previousProgress) renderArticleProgress();
      });
    }, { passive: true });

    document.querySelector("[data-article-progress-resume]")?.addEventListener("click", () => {
      const record = state.records[articleId];
      if (!record) return;
      const total = Math.max(1, articleBody.offsetHeight - window.innerHeight);
      const articleTop = window.scrollY + articleBody.getBoundingClientRect().top;
      window.scrollTo({ top: articleTop + total * (record.maxProgress / 100), behavior: "smooth" });
    });

    document.querySelector("[data-article-progress-complete]")?.addEventListener("click", async () => {
      const record = updateArticleRecord(true);
      renderAll();
      await syncRecord(record);
    });

    const syncCurrentArticle = () => {
      const record = updateArticleRecord();
      if (state.user && state.dirtyArticleId === articleId) void syncRecord(record, true);
    };
    window.addEventListener("pagehide", syncCurrentArticle);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") syncCurrentArticle();
    });
  }

  async function initialize() {
    const guestRecords = readRecords(GUEST_STORAGE_KEY);
    const cloudLoaded = await loadCloudProgress();
    state.initialized = true;
    if (cloudLoaded && mergePrompt) mergePrompt.hidden = !shouldOfferGuestMerge(guestRecords);
    if (articleRoot && !state.records[articleRoot.dataset.articleId]) updateArticleRecord();
    renderAll();
  }

  renderAll();
  void initialize();
})();
