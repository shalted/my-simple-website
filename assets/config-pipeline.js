(function bootstrapConfigPipeline() {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  function readNumber(input, label) {
    const raw = input.value.trim();
    const value = Number(raw);
    if (raw === "" || !Number.isFinite(value)) {
      return { ok: false, message: `${label}必须是有限数字` };
    }
    return { ok: true, value };
  }
  const stages = ["source", "shape", "reference", "semantic", "snapshot", "index", "query"];

  const code = Object.freeze({
    source: [
      "SourceRow[] ReadSource(Workbook file)",
      "{",
      "    return file.Rows.Select(row =>",
      "        new SourceRow(row.Number, row.Cells));",
      "}"
    ],
    shape: [
      "void ValidateShape(SourceRow row, ErrorBag errors)",
      "{",
      "    RequireInt(row, \"id\", errors);",
      "    RequireText(row, \"name\", errors);",
      "    RequireInt(row, \"cost\", errors);",
      "    errors.CheckUnique(row, \"id\");",
      "}"
    ],
    reference: [
      "void ValidateReference(TypedRow row, ErrorBag errors)",
      "{",
      "    if (!effectIds.Contains(row.effectId))",
      "        errors.Add(row, \"effect_id\", \"目标不存在\");",
      "}"
    ],
    semantic: [
      "void ValidateMeaning(TypedRow row, ErrorBag errors)",
      "{",
      "    if (row.cost < 0 || row.cost > 100)",
      "        errors.Add(row, \"cost\", \"超出教学范围\");",
      "}"
    ],
    snapshot: [
      "BuildResult Build(SourceData source)",
      "{",
      "    ErrorBag errors = ValidateAll(source);",
      "    if (errors.Count > 0)",
      "        return BuildResult.Failed(errors);",
      "    return GenerateTypedSnapshot(source);",
      "}"
    ],
    index: [
      "Dictionary<int, ActionConfig> BuildIndex(ActionConfig[] rows)",
      "{",
      "    var byId = new Dictionary<int, ActionConfig>(rows.Length);",
      "    foreach (ActionConfig row in rows)",
      "        byId.Add(row.Id, row);",
      "    return byId;",
      "}"
    ],
    query: [
      "bool TryQuery(int id, out ActionConfig result)",
      "{",
      "    if (!snapshotPublished)",
      "        throw new SnapshotUnavailable();",
      "    return byId.TryGetValue(id, out result);",
      "}"
    ]
  });

  const stepCopy = Object.freeze({
    source: ["SOURCE ROWS", "读取源记录", "保留来源、行号和原始字段，错误才能回到作者位置。", "源单元格 → 带来源的记录", "只报“生成失败”无法定位需要修改的行。"],
    shape: ["SHAPE VALIDATION", "校验字段形状与主键", "检查必填字段、类型和 ID 唯一性，错误继续累计。", "记录 → 可解析字段 / 结构错误", "引用与范围规则依赖正确的字段类型。"],
    reference: ["REFERENCE VALIDATION", "检查引用目标", "用目标表主键集合验证每个 effect_id。", "外键值 → 已连接或缺失引用", "一个整数只有通过目标存在性检查，才是一条有效引用。"],
    semantic: ["SEMANTIC VALIDATION", "检查值域与组合规则", "教学 Schema 要求 cost 位于闭区间 [0, 100]。", "类型正确的值 → 语义通过或失败", "合法整数也可能代表非法业务值。"],
    snapshot: ["TYPED SNAPSHOT", "决定是否生成快照", "只有错误袋为空，源记录才转换为强类型只读记录。", "验证结果 → 成功快照或明确失败", "失败时生成空快照会把构建错误伪装成成功。"],
    index: ["PRIMARY INDEX", "建立主键索引", "为每条强类型记录建立 ID 到记录的映射。", "记录数组 → O(1) 平均查询索引", "运行时查询不应每次扫描全表。"],
    query: ["RUNTIME QUERY", "消费发布快照", "功能代码通过索引读取记录字段；失败构建没有可查询的新快照。", "ID → 强类型记录 → cost", "只有真实字段消费才能证明配置已接入功能。"]
  });

  const scenarioDefaults = Object.freeze({
    normal: { duplicate: false, missingRef: false, range: false },
    boundary: { duplicate: false, missingRef: false, range: false },
    failure: { duplicate: true, missingRef: true, range: true }
  });

  const state = {
    scenario: "normal",
    step: 0,
    duplicate: false,
    missingRef: false,
    range: false,
    timer: null,
    lastQuery: null,
    lastQueryError: ""
  };

  function rows() {
    const boundary = state.scenario === "boundary";
    return [
      { line: 2, id: 101, name: "轻击", cost: boundary ? 0 : 12, effectId: 501 },
      { line: 3, id: state.duplicate ? 101 : 102, name: "突进", cost: state.range ? 140 : 28, effectId: state.missingRef ? 999 : 502 },
      { line: 4, id: 103, name: "蓄力", cost: boundary ? 100 : 64, effectId: 503 }
    ];
  }

  function validate(data, stageIndex) {
    const errors = [];
    if (stageIndex >= 1) {
      const seen = new Map();
      data.forEach((row) => {
        if (!Number.isInteger(row.id)) errors.push({ line: row.line, field: "id", message: "必须是整数", stage: "shape" });
        if (!row.name.trim()) errors.push({ line: row.line, field: "name", message: "不能为空", stage: "shape" });
        if (seen.has(row.id)) errors.push({ line: row.line, field: "id", message: `与第 ${seen.get(row.id)} 行重复`, stage: "shape" });
        else seen.set(row.id, row.line);
      });
    }
    if (stageIndex >= 2) {
      const effectIds = new Set([501, 502, 503]);
      data.forEach((row) => {
        if (!effectIds.has(row.effectId)) errors.push({ line: row.line, field: "effect_id", message: `引用 ${row.effectId} 不存在`, stage: "reference" });
      });
    }
    if (stageIndex >= 3) {
      data.forEach((row) => {
        if (row.cost < 0 || row.cost > 100) errors.push({ line: row.line, field: "cost", message: `${row.cost} 超出 [0, 100]`, stage: "semantic" });
      });
    }
    return errors;
  }

  function firstFailureStage(data) {
    const all = validate(data, 3);
    if (!all.length) return -1;
    return Math.min(...all.map((error) => stages.indexOf(error.stage)));
  }

  function model() {
    const data = rows();
    const errors = validate(data, state.step);
    const failureStage = firstFailureStage(data);
    const blocked = failureStage >= 0 && state.step >= stages.indexOf("snapshot");
    const published = failureStage < 0 && state.step >= 4;
    const indexed = published && state.step >= 5;
    return { data, errors, failureStage, blocked, published, indexed };
  }

  function rowError(errors, line) {
    return errors.filter((error) => error.line === line);
  }

  function renderRows(current) {
    const body = $("#source-rows");
    body.replaceChildren(...current.data.map((row) => {
      const item = document.createElement("tr");
      const errors = rowError(current.errors, row.line);
      if (errors.length) item.classList.add("has-error");
      else if (state.step > 0) item.classList.add("is-current");
      const statusClass = errors.length ? "fail" : state.step > 0 ? "pass" : "";
      const status = errors.length ? `${errors.length} 个错误` : state.step > 0 ? "通过当前层" : "待检查";
      [row.line, row.id, row.name, row.cost, row.effectId].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        item.append(cell);
      });
      const statusCell = document.createElement("td");
      statusCell.className = `row-status ${statusClass}`;
      statusCell.textContent = status;
      item.append(statusCell);
      return item;
    }));
  }

  function renderErrors(current) {
    const list = $("#error-list");
    if (!current.errors.length) {
      const item = document.createElement("li");
      item.className = "no-error";
      item.textContent = state.step === 0 ? "等待校验阶段" : "当前已执行阶段无错误";
      list.replaceChildren(item);
      return;
    }
    list.replaceChildren(...current.errors.map((error) => {
      const item = document.createElement("li");
      item.textContent = `第 ${error.line} 行 · ${error.field} · ${error.message}`;
      return item;
    }));
  }

  function renderArtifact(current) {
    const view = $("#artifact-view");
    const status = $("#artifact-status");
    if (current.blocked) {
      status.textContent = "构建失败 / 未发布";
      status.style.color = "var(--red)";
      view.textContent = [
        "BuildResult.Failed {",
        `    errors: ${current.errors.length},`,
        "    snapshot: null,",
        "    index: null,",
        "    published: false",
        "}",
        "",
        "// 保留全部错误；不生成假快照。"
      ].join("\n");
      return;
    }
    if (current.indexed) {
      status.textContent = "索引已发布";
      status.style.color = "var(--green)";
      view.textContent = [
        "ActionIndex {",
        ...current.data.map((row) => `    [${row.id}] => ActionConfig(\"${row.name}\", cost: ${row.cost}),`),
        "}",
        "",
        "// build O(n) / query average O(1)"
      ].join("\n");
      return;
    }
    if (current.published) {
      status.textContent = "强类型快照可发布";
      status.style.color = "var(--green)";
      view.textContent = [
        "ActionConfig[] snapshot = {",
        ...current.data.map((row) => `    new(${row.id}, \"${row.name}\", ${row.cost}, ${row.effectId}),`),
        "};"
      ].join("\n");
      return;
    }
    status.textContent = "尚未生成";
    status.style.color = "var(--amber)";
    view.textContent = "等待结构、引用与语义校验全部通过…";
  }

  function renderPipeline(current) {
    const errorsByStage = new Set(current.errors.map((error) => error.stage));
    document.querySelectorAll("[data-stage]").forEach((button, index) => {
      const stage = stages[index];
      button.className = "";
      if (index === state.step) button.classList.add("is-active");
      if (index > 0 && index <= 3 && index <= state.step) {
        button.classList.add(errorsByStage.has(stage) ? "is-fail" : "is-pass");
      }
      if (stage === "snapshot" && state.step >= index) {
        button.classList.add(current.failureStage >= 0 ? "is-fail" : "is-pass");
      }
      if (current.failureStage >= 0 && index > stages.indexOf("snapshot")) button.classList.add("is-blocked");
    });
  }

  function renderCode(key) {
    const active = key === "snapshot" ? [2, 3, 4, 5] : [2, 3];
    $("#code-status").textContent = key.toUpperCase();
    $("#code-lines").replaceChildren(...code[key].map((line, index) => {
      const item = document.createElement("li");
      item.textContent = line || " ";
      if (active.includes(index)) item.classList.add("is-active");
      return item;
    }));
  }

  function renderDots() {
    $("#step-dots").replaceChildren(...stages.map((stage, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = index === state.step ? "is-active" : "";
      button.setAttribute("aria-label", `跳到第 ${index + 1} 步：${stepCopy[stage][1]}`);
      button.addEventListener("click", () => { stopAuto(); state.step = index; state.lastQuery = null; render(); });
      return button;
    }));
  }

  function renderQuery(current) {
    const result = $("#query-result");
    if (!current.indexed || state.step < 6) {
      result.textContent = current.failureStage >= 0 ? "构建失败：没有发布可查询的新快照" : "索引发布后才能查询";
      $("#query-cost").textContent = "—";
      return;
    }
    if (state.lastQuery === null) {
      result.textContent = state.lastQueryError || "输入教学 ID 后执行查询";
      $("#query-cost").textContent = "—";
      return;
    }
    const hit = current.data.find((row) => row.id === state.lastQuery);
    result.textContent = hit ? `命中 ${hit.name} · cost=${hit.cost}` : `ID ${state.lastQuery} 未命中`;
    $("#query-cost").textContent = hit ? String(hit.cost) : "MISS";
  }

  function render() {
    const current = model();
    const stage = stages[state.step];
    const copy = stepCopy[stage];

    $("#step-label").textContent = `STEP ${String(state.step + 1).padStart(2, "0")}`;
    $("#step-count").textContent = `${state.step + 1} / ${stages.length}`;
    $("#phase").textContent = copy[0];
    $("#step-title").textContent = current.blocked ? "构建已停止" : copy[1];
    $("#step-copy").textContent = current.blocked ? "前置校验失败，当前阶段不会执行。" : copy[2];
    $("#step-change").textContent = current.blocked ? "无新产物" : copy[3];
    $("#step-why").textContent = current.blocked ? "失败后继续生成会产生残缺或伪造快照。" : copy[4];

    $("#row-count").textContent = current.data.length;
    $("#error-count").textContent = current.errors.length;
    $("#index-count").textContent = current.indexed ? current.data.length : 0;
    const buildState = $("#build-state");
    buildState.textContent = current.blocked ? "FAILED" : current.indexed ? "PUBLISHED" : current.errors.length ? "ERRORS FOUND" : "CHECKING";
    buildState.classList.toggle("failed", current.errors.length > 0);

    renderRows(current);
    renderErrors(current);
    renderArtifact(current);
    renderPipeline(current);
    renderCode(stage);
    renderDots();
    renderQuery(current);
    $("#prev-button").disabled = state.step === 0;
    $("#next-button").disabled = state.step === stages.length - 1;
  }

  function applyScenario(name) {
    const defaults = scenarioDefaults[name];
    state.scenario = name;
    state.duplicate = defaults.duplicate;
    state.missingRef = defaults.missingRef;
    state.range = defaults.range;
    state.step = 0;
    state.lastQuery = null;
    state.lastQueryError = "";
    $("#duplicate-toggle").checked = state.duplicate;
    $("#missing-ref-toggle").checked = state.missingRef;
    $("#range-toggle").checked = state.range;
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
    const speed = readNumber($("#speed-seconds"), "自动间隔");
    if (!speed.ok) {
      $("#speed-message").textContent = speed.message;
      return;
    }
    const seconds = clamp(speed.value, 0.8, 8);
    $("#speed-seconds").value = String(seconds);
    $("#speed-message").textContent = `每步 ${seconds.toFixed(1)} 秒`;
    $("#auto-button").textContent = "暂停";
    $("#auto-button").setAttribute("aria-pressed", "true");
    state.timer = window.setInterval(() => {
      if (state.step >= stages.length - 1) {
        stopAuto();
        return;
      }
      state.step += 1;
      state.lastQuery = null;
      render();
    }, seconds * 1000);
  }

  function move(delta) {
    stopAuto();
    state.step = clamp(state.step + delta, 0, stages.length - 1);
    state.lastQuery = null;
    render();
  }

  document.querySelectorAll(".scenario-tab").forEach((button) => {
    button.addEventListener("click", () => {
      stopAuto();
      document.querySelectorAll(".scenario-tab").forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      applyScenario(button.dataset.scenario);
      render();
    });
  });

  document.querySelectorAll("[data-stage]").forEach((button, index) => {
    button.addEventListener("click", () => { stopAuto(); state.step = index; state.lastQuery = null; render(); });
  });
  $("#apply-faults").addEventListener("click", () => {
    stopAuto();
    state.duplicate = $("#duplicate-toggle").checked;
    state.missingRef = $("#missing-ref-toggle").checked;
    state.range = $("#range-toggle").checked;
    state.step = 0;
    state.lastQuery = null;
    render();
  });
  $("#query-button").addEventListener("click", () => {
    const query = readNumber($("#query-id"), "查询 ID");
    state.lastQuery = query.ok && Number.isInteger(query.value) ? query.value : null;
    state.lastQueryError = query.ok ? "查询 ID 必须是整数" : query.message;
    if (state.lastQuery !== null) state.lastQueryError = "";
    render();
  });
  $("#reset-button").addEventListener("click", () => { stopAuto(); applyScenario(state.scenario); render(); });
  $("#prev-button").addEventListener("click", () => move(-1));
  $("#next-button").addEventListener("click", () => move(1));
  $("#auto-button").addEventListener("click", toggleAuto);
  $("#speed-seconds").addEventListener("change", () => {
    const speed = readNumber($("#speed-seconds"), "自动间隔");
    if (!speed.ok) {
      $("#speed-message").textContent = speed.message;
      stopAuto();
      return;
    }
    const seconds = clamp(speed.value, 0.8, 8);
    $("#speed-seconds").value = String(seconds);
    $("#speed-message").textContent = `每步 ${seconds.toFixed(1)} 秒`;
    if (state.timer !== null) { stopAuto(); toggleAuto(); }
  });

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input, textarea, select, button")) return;
    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") move(1);
    if (event.key === " ") { event.preventDefault(); toggleAuto(); }
    if (event.key.toLowerCase() === "r") { stopAuto(); applyScenario(state.scenario); render(); }
  });

  render();
})();
