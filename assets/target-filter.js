(function bootstrapTargetFilter() {
  "use strict";

  const SCALE = 75;
  const ORIGIN = Object.freeze({ x: 360, y: 260 });
  const TARGET_RADIUS = 0.22;
  const shapeConfig = Object.freeze({
    circle: Object.freeze({ radius: 2.8, rotation: 0 }),
    sector: Object.freeze({ radius: 3.2, angle: 100, rotation: 0 }),
    box: Object.freeze({ width: 4, depth: 3, rotation: 0 })
  });

  const code = Object.freeze({
    pose: [
      "QueryPose ResolvePose(Caster caster, Shape shape)",
      "{",
      "    center = caster.position + Rotate(shape.offset, caster.rotation);",
      "    rotation = caster.rotation + shape.rotation;",
      "    return new QueryPose(center, rotation);",
      "}"
    ],
    broad: [
      "Candidates BroadPhase(QueryPose pose, Shape shape)",
      "{",
      "    float range = shape.OuterRadius + targetRadius;",
      "    return spatialIndex.QueryRange(pose.center, range);",
      "}"
    ],
    camp: [
      "foreach (Target target in broadCandidates)",
      "{",
      "    if (!campRule.Accept(caster, target))",
      "        trace.Reject(target, \"阵营不匹配\");",
      "    else",
      "        preciseCandidates.Add(target);",
      "}"
    ],
    circle: [
      "bool HitCircle(Target target, Circle circle)",
      "{",
      "    float r = circle.radius + target.radius;",
      "    float d2 = DistanceSquared(target.position, circle.center);",
      "    return d2 <= r * r;",
      "}"
    ],
    sector: [
      "bool HitSector(Target target, Sector sector)",
      "{",
      "    if (!HitCircle(target, sector.range)) return false;",
      "    float angle = Angle(sector.forward, target.position - sector.center);",
      "    float tolerance = TargetAngularRadius(target);",
      "    return angle <= sector.angle * 0.5f + tolerance;",
      "}"
    ],
    box: [
      "bool HitBox(Target target, Box box)",
      "{",
      "    Vector2 local = RotateInverse(target.position - box.center, box.rotation);",
      "    Vector2 q = Abs(local) - box.halfSize;",
      "    float signedDistance = Length(Max(q, 0)) + Min(Max(q.x, q.y), 0);",
      "    return signedDistance <= target.radius;",
      "}"
    ],
    consume: [
      "void ConsumeHits(IReadOnlyList<Target> hits)",
      "{",
      "    foreach (Target target in hits)",
      "        effects.Apply(target);",
      "    results.Clear(); // 列表留给下一次查询复用",
      "}"
    ]
  });

  const scenarioSteps = Object.freeze({
    normal: Object.freeze([
      { phase: "WORLD POSE", title: "解析查询姿态", copy: "本地偏移和旋转组合到施法者的世界姿态。", change: "得到世界中心与前向", why: "所有比较必须发生在同一坐标系。", layer: 0, code: "pose", active: [2, 3] },
      { phase: "SPATIAL BROAD PHASE", title: "用外接圆缩小候选", copy: "空间索引只返回查询中心附近的对象。", change: "全场对象 → 粗筛候选", why: "扇形和盒形先用便宜的外接圆，减少精确计算。", layer: 1, code: "broad", active: [2, 3] },
      { phase: "CAMP FILTER", title: "先排除关系不匹配", copy: "友方、自身或无效对象不进入几何热路径。", change: "粗筛候选 → 关系通过", why: "先做简单规则，避免无意义的角度和局部坐标计算。", layer: 2, code: "camp", active: [2, 3, 5] },
      { phase: "PRECISE GEOMETRY", title: "执行形状专属判断", copy: "圆形看距离，扇形追加角度，盒形转到局部坐标。", change: "关系通过 → 几何通过", why: "进入外接圆并不代表进入真实形状。", layer: 3, code: "shape", active: [2, 3, 4] },
      { phase: "EXPLAIN RESULT", title: "为每个目标写下原因", copy: "入选与排除都保留发生在哪一层、使用了什么数据。", change: "布尔结果 → 可读诊断", why: "可解释的查询比一个最终列表更容易调试。", layer: 4, code: "shape", active: [4] },
      { phase: "CONSUME", title: "命中任务消费最终集合", copy: "只有最终入选目标进入效果与反馈管线，结果列表随后清空复用。", change: "最终集合 → Effect 输入", why: "查询器只选目标，不负责结算。", layer: 5, code: "consume", active: [2, 3, 4] }
    ]),
    boundary: Object.freeze([
      { phase: "WORLD POSE", title: "把边界放进世界", copy: "目标被放在形状边缘附近，拖动可观察判定翻转。", change: "得到边界的世界位置", why: "边界错误通常来自坐标系或半径遗漏。", layer: 0, code: "pose", active: [2, 3] },
      { phase: "TARGET RADIUS", title: "目标不是数学上的点", copy: "教学目标半径 0.22 会扩展技能形状的可接触边界。", change: "边界加入 targetRadius", why: "中心在形状外，目标边缘仍可能相交。", layer: 0, code: "broad", active: [2] },
      { phase: "SPATIAL BROAD PHASE", title: "粗筛范围也要加目标半径", copy: "若粗筛不扩展，精确阶段永远看不到贴边目标。", change: "查询半径 = 外接半径 + 0.22", why: "粗筛必须是精确判断的保守上界。", layer: 1, code: "broad", active: [2, 3] },
      { phase: "CAMP FILTER", title: "关系规则通过", copy: "边界目标属于教学敌方，进入精确判断。", change: "候选 → 精确候选", why: "空间边界与关系规则是不同维度。", layer: 2, code: "camp", active: [5] },
      { phase: "PRECISE GEOMETRY", title: "计算带半径的边界", copy: "圆形使用组合半径；扇形使用角度容差；盒形使用点到盒的距离。", change: "计算精确边界距离", why: "简单扩大盒子的宽高会错误填满圆角区域。", layer: 3, code: "shape", active: [2, 3, 4] },
      { phase: "INCLUSIVE EDGE", title: "等于边界也算命中", copy: "教学模型使用 <=，刚好接触边界时进入最终集合。", change: "临界值 → 入选或排除", why: "边界是否包含必须显式且在所有层保持一致。", layer: 4, code: "shape", active: [4] },
      { phase: "CONSUME", title: "消费边界命中结果", copy: "最终集合交给效果管线，查询临时列表随后复用。", change: "最终集合 → Effect 输入", why: "几何规则结束后才产生业务效果。", layer: 5, code: "consume", active: [2, 3, 4] }
    ]),
    failure: Object.freeze([
      { phase: "WORLD POSE", title: "失败也从正确姿态开始", copy: "查询中心与朝向有效，失败不是由空引用造成。", change: "世界姿态已解析", why: "先排除基础数据错误，再讨论几何结果。", layer: 0, code: "pose", active: [2, 3] },
      { phase: "SPATIAL BROAD PHASE", title: "粗筛故意带入多余对象", copy: "外接圆会包含扇形背后或盒角外的目标。", change: "多个对象进入候选", why: "粗筛追求不漏，不追求最终精确。", layer: 1, code: "broad", active: [2, 3] },
      { phase: "CAMP FILTER", title: "友方在关系层失败", copy: "即使位置完全在形状内，关系不匹配也不会进入精确几何。", change: "友方候选 → 排除", why: "规则过滤要早于昂贵计算。", layer: 2, code: "camp", active: [2, 3] },
      { phase: "PRECISE GEOMETRY", title: "外接圆候选在几何层失败", copy: "剩余对象会因距离、角度或盒形局部边界被排除。", change: "精确候选 → 排除原因", why: "候选不等于命中，必须保留失败维度。", layer: 3, code: "shape", active: [2, 3, 4] },
      { phase: "EMPTY RESULT", title: "空集合是明确结果", copy: "没有目标进入效果管线，但每个目标为何失败仍然可见。", change: "最终命中数 = 0", why: "空结果不应被替换成最近目标或默认目标。", layer: 4, code: "consume", active: [1] }
    ])
  });

  const shapePositions = Object.freeze({
    normal: Object.freeze({
      circle: [[1.0, .5], [1.8, 2.0], [-2.4, .2], [3.2, -1.0]],
      sector: [[1.4, .3], [1.0, 2.1], [-2.0, .1], [2.6, -1.6]],
      box: [[1.1, .4], [1.7, 1.8], [-2.2, .2], [2.7, -1.6]]
    }),
    boundary: Object.freeze({
      circle: [[3.02, 0], [2.6, 1.7], [-1.2, 0], [3.5, -1.2]],
      sector: [[1.43, 2.04], [2.7, .3], [-1.0, 0], [1.1, -2.5]],
      box: [[2.22, 0], [1.8, 1.7], [-1.0, 0], [2.4, -1.7]]
    }),
    failure: Object.freeze({
      circle: [[3.5, 0], [0.3, .2], [-3.4, .4], [2.8, 1.8]],
      sector: [[-1.5, 0], [.5, .2], [-2.4, 1.2], [1.4, 2.8]],
      box: [[2.5, 2.0], [.4, .2], [-2.5, 1.8], [2.8, -1.6]]
    })
  });

  function requireElement(id) {
    const element = document.getElementById(id);
    if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) {
      throw new Error(`[TargetFilter] 缺少元素 #${id}`);
    }
    return element;
  }

  const el = {
    stage: requireElement("world-stage"), broadShape: requireElement("broad-shape"),
    exactShape: requireElement("exact-shape"), casterLayer: requireElement("caster-layer"),
    targetLayer: requireElement("target-layer"), parameter: requireElement("teaching-parameter"),
    phase: requireElement("phase"), title: requireElement("step-title"), copy: requireElement("step-copy"),
    change: requireElement("step-change"), why: requireElement("step-why"), selected: requireElement("selected-target"),
    world: requireElement("world-position"), local: requireElement("local-position"), distance: requireElement("distance-value"),
    angle: requireElement("angle-value"), reason: requireElement("target-reason"), sceneCount: requireElement("scene-count"),
    broadCount: requireElement("broad-count"), campCount: requireElement("camp-count"),
    exactCount: requireElement("exact-count"), hitCount: requireElement("hit-count"),
    trace: requireElement("target-trace"), codeStatus: requireElement("code-status"),
    codeLines: requireElement("code-lines"), stepLabel: requireElement("step-label"),
    stepCount: requireElement("step-count"), dots: requireElement("step-dots"),
    previous: requireElement("prev-button"), next: requireElement("next-button"),
    auto: requireElement("auto-button"), reset: requireElement("reset-button"),
    speed: requireElement("speed-seconds"), speedMessage: requireElement("speed-message")
  };

  let shapeKey = "circle";
  let scenarioKey = "normal";
  let caster = { x: -1, y: 0, rotation: 0 };
  let targets = [];
  let selectedIndex = 0;
  let player = null;
  let currentLayer = 0;
  let dragging = null;

  function svgPoint(world) {
    return { x: ORIGIN.x + world.x * SCALE, y: ORIGIN.y - world.y * SCALE };
  }
  function worldPoint(svg) {
    return { x: (svg.x - ORIGIN.x) / SCALE, y: (ORIGIN.y - svg.y) / SCALE };
  }
  function rotate(point, degrees) {
    const radians = degrees * Math.PI / 180;
    const c = Math.cos(radians), s = Math.sin(radians);
    return { x: point.x * c - point.y * s, y: point.x * s + point.y * c };
  }
  function localPoint(target) {
    return rotate({ x: target.x - caster.x, y: target.y - caster.y }, -caster.rotation);
  }
  function length(point) { return Math.hypot(point.x, point.y); }
  function outerRadius() {
    const cfg = shapeConfig[shapeKey];
    return shapeKey === "box" ? Math.hypot(cfg.width / 2, cfg.depth / 2) : cfg.radius;
  }

  function preciseResult(target) {
    const local = localPoint(target);
    const distance = length(local);
    if (shapeKey === "circle") {
      const limit = shapeConfig.circle.radius + TARGET_RADIUS;
      return { hit: distance <= limit, local, distance, angle: null, detail: `距离 ${distance.toFixed(2)} ${distance <= limit ? "≤" : ">"} ${limit.toFixed(2)}` };
    }
    if (shapeKey === "sector") {
      const cfg = shapeConfig.sector;
      const limit = cfg.radius + TARGET_RADIUS;
      const angle = distance === 0 ? 0 : Math.abs(Math.atan2(local.y, local.x) * 180 / Math.PI);
      const tolerance = Math.asin(Math.min(1, TARGET_RADIUS / Math.max(distance, TARGET_RADIUS))) * 180 / Math.PI;
      const hit = distance <= limit && angle <= cfg.angle / 2 + tolerance;
      return { hit, local, distance, angle, detail: distance > limit ? `距离 ${distance.toFixed(2)} > ${limit.toFixed(2)}` : `角度 ${angle.toFixed(1)}° ${hit ? "≤" : ">"} ${(cfg.angle / 2 + tolerance).toFixed(1)}°` };
    }
    const cfg = shapeConfig.box;
    const qx = Math.abs(local.x) - cfg.width / 2;
    const qy = Math.abs(local.y) - cfg.depth / 2;
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
    const inside = Math.min(Math.max(qx, qy), 0);
    const signedDistance = outside + inside;
    return { hit: signedDistance <= TARGET_RADIUS, local, distance, angle: null, detail: `点到盒边 ${signedDistance.toFixed(2)} ${signedDistance <= TARGET_RADIUS ? "≤" : ">"} ${TARGET_RADIUS.toFixed(2)}` };
  }

  function evaluate(target) {
    const distance = Math.hypot(target.x - caster.x, target.y - caster.y);
    const broad = distance <= outerRadius() + TARGET_RADIUS;
    const camp = broad && target.camp === "enemy";
    const precise = preciseResult(target);
    return {
      broad, camp, exact: camp && precise.hit, precise,
      reason: !broad ? "空间粗筛外" : !camp ? "阵营不匹配" : precise.hit ? "精确几何通过" : precise.detail
    };
  }

  function resetPositions() {
    caster = { x: scenarioKey === "normal" ? -1 : 0, y: 0, rotation: scenarioKey === "boundary" ? 25 : scenarioKey === "failure" ? -20 : 0 };
    const positions = shapePositions[scenarioKey][shapeKey];
    targets = positions.map((position, index) => ({
      x: position[0], y: position[1], name: String.fromCharCode(65 + index),
      camp: (scenarioKey === "failure" && index === 1) || index === 2 ? "friendly" : "enemy"
    }));
    selectedIndex = 0;
  }

  function svgNode(name, attributes) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  }

  function renderShapes() {
    el.broadShape.replaceChildren();
    el.exactShape.replaceChildren();
    const c = svgPoint(caster);
    const broad = svgNode("circle", { cx: c.x, cy: c.y, r: (outerRadius() + TARGET_RADIUS) * SCALE, class: "broad-shape" });
    el.broadShape.append(broad);
    const cfg = shapeConfig[shapeKey];
    if (shapeKey === "circle") {
      el.exactShape.append(svgNode("circle", { cx: c.x, cy: c.y, r: cfg.radius * SCALE, class: "exact-shape" }));
    } else if (shapeKey === "sector") {
      const half = cfg.angle / 2;
      const start = rotate({ x: cfg.radius, y: 0 }, caster.rotation - half);
      const end = rotate({ x: cfg.radius, y: 0 }, caster.rotation + half);
      const sp = svgPoint({ x: caster.x + start.x, y: caster.y + start.y });
      const ep = svgPoint({ x: caster.x + end.x, y: caster.y + end.y });
      const path = `M ${c.x} ${c.y} L ${sp.x} ${sp.y} A ${cfg.radius * SCALE} ${cfg.radius * SCALE} 0 0 0 ${ep.x} ${ep.y} Z`;
      el.exactShape.append(svgNode("path", { d: path, class: "exact-shape" }));
    } else {
      const half = [{x:-cfg.width/2,y:-cfg.depth/2},{x:cfg.width/2,y:-cfg.depth/2},{x:cfg.width/2,y:cfg.depth/2},{x:-cfg.width/2,y:cfg.depth/2}];
      const points = half.map((p) => {
        const r = rotate(p, caster.rotation);
        const s = svgPoint({ x: caster.x + r.x, y: caster.y + r.y });
        return `${s.x},${s.y}`;
      }).join(" ");
      el.exactShape.append(svgNode("polygon", { points, class: "exact-shape" }));
    }
  }

  function renderActors() {
    el.casterLayer.replaceChildren();
    el.targetLayer.replaceChildren();
    const cp = svgPoint(caster);
    const casterGroup = svgNode("g", { class: "drag-handle", "data-drag": "caster" });
    casterGroup.append(svgNode("circle", { cx: cp.x, cy: cp.y, r: 20, class: "caster-body" }));
    const forward = rotate({ x: 55, y: 0 }, caster.rotation);
    casterGroup.append(svgNode("line", { x1: cp.x, y1: cp.y, x2: cp.x + forward.x, y2: cp.y - forward.y, class: "caster-forward", "marker-end": "url(#arrow)" }));
    el.casterLayer.append(casterGroup);

    targets.forEach((target, index) => {
      const p = svgPoint(target);
      const result = evaluate(target);
      const stateClass = currentLayer < 1 ? "" :
        currentLayer === 1 && result.broad ? " is-candidate" :
        currentLayer === 2 && result.camp ? " is-candidate" :
        currentLayer >= 3 && result.exact ? " is-hit" :
        currentLayer >= 2 && (!result.camp || currentLayer >= 3) ? " is-rejected" : "";
      const group = svgNode("g", {
        class: `target-group drag-handle${stateClass}${index === selectedIndex ? " is-selected" : ""}`,
        "data-drag": `target-${index}`
      });
      group.append(svgNode("circle", { cx: p.x, cy: p.y, r: TARGET_RADIUS * SCALE, class: "target-body" }));
      const label = svgNode("text", { x: p.x, y: p.y, class: "target-label" });
      label.textContent = target.name;
      group.append(label);
      el.targetLayer.append(group);
    });
  }

  function renderTrace() {
    el.trace.replaceChildren();
    let broadCount = 0, campCount = 0, exactCount = 0, hitCount = 0;
    targets.forEach((target, index) => {
      const result = evaluate(target);
      if (result.broad) broadCount++;
      if (result.camp) campCount++;
      if (result.camp && currentLayer >= 3) exactCount++;
      if (result.exact) hitCount++;
      const button = document.createElement("button");
      button.type = "button";
      button.classList.toggle("is-selected", index === selectedIndex);
      const visibleResult = currentLayer < 1 ? "等待" :
        currentLayer === 1 ? (result.broad ? "粗筛候选" : "粗筛外") :
        currentLayer === 2 ? (result.camp ? "关系通过" : result.reason) :
        result.exact ? "最终入选" : result.reason;
      button.setAttribute("data-result", currentLayer >= 3 ? (result.exact ? "hit" : "rejected") : "pending");
      button.innerHTML = `<b>${target.name}</b><span>${target.camp === "enemy" ? "教学敌方" : "教学友方"}</span><em>${visibleResult}</em>`;
      button.addEventListener("click", () => { selectedIndex = index; renderAll(); });
      const item = document.createElement("li");
      item.append(button);
      el.trace.append(item);
    });
    el.sceneCount.textContent = String(targets.length);
    el.broadCount.textContent = currentLayer >= 1 ? String(broadCount) : "0";
    el.campCount.textContent = currentLayer >= 2 ? String(campCount) : "0";
    el.exactCount.textContent = currentLayer >= 3 ? String(exactCount) : "0";
    el.hitCount.textContent = currentLayer >= 4 ? String(hitCount) : "0";
  }

  function renderSelected() {
    const target = targets[selectedIndex];
    const result = evaluate(target);
    const local = result.precise.local;
    el.selected.textContent = `目标 ${target.name}`;
    el.world.textContent = `(${target.x >= 0 ? "+" : ""}${target.x.toFixed(2)}, ${target.y >= 0 ? "+" : ""}${target.y.toFixed(2)})`;
    el.local.textContent = currentLayer >= 3 ? `(${local.x >= 0 ? "+" : ""}${local.x.toFixed(2)}, ${local.y >= 0 ? "+" : ""}${local.y.toFixed(2)})` : "尚未计算";
    el.distance.textContent = currentLayer >= 1 ? result.precise.distance.toFixed(2) : "尚未计算";
    el.angle.textContent = currentLayer >= 3 && result.precise.angle !== null ? `${result.precise.angle.toFixed(1)}°` : "—";
    el.reason.textContent = currentLayer < 1 ? "等待空间粗筛" :
      currentLayer === 1 ? (result.broad ? "进入粗筛候选" : "不在外接圆内") :
      currentLayer === 2 ? (result.camp ? "阵营通过，等待精确判断" : result.reason) :
      result.exact ? `入选：${result.precise.detail}` : `排除：${result.reason}`;
  }

  function renderCode(step) {
    const key = step.code === "shape" ? shapeKey : step.code;
    el.codeStatus.textContent = key.toUpperCase();
    el.codeLines.replaceChildren();
    code[key].forEach((line, index) => {
      const item = document.createElement("li");
      item.textContent = line || " ";
      item.classList.toggle("is-active", step.active.includes(index));
      el.codeLines.append(item);
    });
  }

  function renderAll(step) {
    renderShapes();
    renderActors();
    renderTrace();
    renderSelected();
    if (step) renderCode(step);
  }

  function renderStep({ step, index, total }) {
    currentLayer = step.layer;
    el.phase.textContent = step.phase;
    el.title.textContent = step.title;
    el.copy.textContent = step.copy;
    el.change.textContent = step.change;
    el.why.textContent = step.why;
    el.stepLabel.textContent = `STEP ${String(index + 1).padStart(2, "0")}`;
    el.stepCount.textContent = `${index + 1} / ${total}`;
    renderAll(step);
  }

  function readAutoStepMs() {
    const seconds = Number(el.speed.value);
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("每步秒数必须大于 0");
    return Math.round(seconds * 1000);
  }

  function createPlayer() {
    player = window.XianyuInteractiveLab.createStepPlayer({
      steps: scenarioSteps[scenarioKey], autoStepMs: readAutoStepMs(), endBehavior: "restart",
      dotElement: "button", dotsInteractive: true,
      controls: { previous: el.previous, next: el.next, auto: el.auto, reset: el.reset, dots: el.dots },
      labels: { play: "▶ 自动播放", pause: "Ⅱ 暂停", complete: "自动完成", next: "下一步 →", done: "演示完成", dot: (i, total) => `第 ${i + 1} 步，共 ${total} 步` },
      classes: { playing: "is-playing", dot: "step-dot", dotActive: "is-active", dotPast: "is-past" },
      renderStep,
      onModeChange: ({ mode }) => { el.speed.disabled = mode === "auto"; }
    });
  }

  function rebuild() {
    if (player) player.destroy();
    resetPositions();
    const cfg = shapeConfig[shapeKey];
    el.parameter.textContent = shapeKey === "circle" ? `教学参数 · 半径 ${cfg.radius} / 目标半径 ${TARGET_RADIUS}` :
      shapeKey === "sector" ? `教学参数 · 半径 ${cfg.radius} / 角度 ${cfg.angle}° / 目标半径 ${TARGET_RADIUS}` :
      `教学参数 · 宽 ${cfg.width} / 深 ${cfg.depth} / 目标半径 ${TARGET_RADIUS}`;
    createPlayer();
  }

  function bindTabs(selector, readKey, writeKey) {
    document.querySelectorAll(selector).forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.getAttribute(readKey);
        if (writeKey === "shape") shapeKey = key;
        else scenarioKey = key;
        document.querySelectorAll(selector).forEach((candidate) => {
          const selected = candidate === button;
          candidate.classList.toggle("is-active", selected);
          candidate.setAttribute("aria-pressed", String(selected));
        });
        rebuild();
      });
    });
  }

  function eventToSvg(event) {
    const point = el.stage.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(el.stage.getScreenCTM().inverse());
  }

  el.stage.addEventListener("pointerdown", (event) => {
    const group = event.target.closest("[data-drag]");
    if (!group) return;
    dragging = group.getAttribute("data-drag");
    if (dragging.startsWith("target-")) selectedIndex = Number(dragging.slice(7));
    el.stage.setPointerCapture(event.pointerId);
    if (player) player.pause();
  });
  el.stage.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const world = worldPoint(eventToSvg(event));
    if (dragging === "caster") {
      caster.x = world.x; caster.y = world.y;
    } else {
      const index = Number(dragging.slice(7));
      targets[index].x = world.x; targets[index].y = world.y;
    }
    const stepIndex = player.state().index;
    renderStep({ step: scenarioSteps[scenarioKey][stepIndex], index: stepIndex, total: scenarioSteps[scenarioKey].length });
  });
  el.stage.addEventListener("pointerup", () => { dragging = null; });
  el.stage.addEventListener("pointercancel", () => { dragging = null; });

  el.reset.addEventListener("click", () => {
    resetPositions();
    const state = player.state();
    renderStep({ step: scenarioSteps[scenarioKey][state.index], index: state.index, total: state.total });
  });
  el.speed.addEventListener("change", () => {
    try {
      const seconds = Number(el.speed.value);
      readAutoStepMs();
      el.speedMessage.textContent = `自动每 ${seconds} 秒推进`;
      rebuild();
    } catch (error) {
      if (player) player.pause();
      el.speedMessage.textContent = error.message;
      el.speed.focus();
    }
  });

  bindTabs("[data-shape]", "data-shape", "shape");
  bindTabs("[data-scenario]", "data-scenario", "scenario");
  if (!window.XianyuInteractiveLab) throw new Error("[TargetFilter] 共享播放器未加载");
  rebuild();
})();
