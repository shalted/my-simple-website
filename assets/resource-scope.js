(function bootstrapResourceScopeLab() {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const code = {
    scope: ["scope = CreateScope(ownerLabel);", "Scopes.Add(scope.Id, scope);", "scope.Locations = new Set();"],
    request: ["location = Resolve(request.Key);", "if (Entries.TryGet(location, out entry))", "    return Retain(scope, entry);", "return JoinOrStartLoad(request);"],
    merge: ["if (Pending.TryGet(location, out load)) {", "    RequireSameType(load, request);", "    load.Requests.Add(request);", "    return; // 不再启动底层加载", "}"],
    complete: ["pending = Pending.Remove(location);", "foreach (request in pending.Requests)", "    if (IsLive(request))", "        TrackOwner(request.Scope, entry);", "if (entry.Owners.Count == 0)", "    Unload(entry.Asset);"],
    release: ["scope.Locations.Remove(location);", "entry.Owners.Remove(scope.Id);", "if (entry.Owners.Count == 0) {", "    Entries.Remove(location);", "    Unload(entry.Asset);", "}"],
    dispose: ["foreach (location in scope.Locations.Copy())", "    Release(scope.Id, location);", "SceneBindings.Remove(scope.Id);", "Scopes.Remove(scope.Id);"],
    failure: ["if (pending.AssetType != request.Type) {", "    request.Complete(null);", "    return TypeConflict;", "}", "if (loadedAsset == null)", "    CompleteAllWithFailure();"]
  };

  function view(overrides) {
    return Object.assign({
      owners: [], a: false, b: false, aState: "open", bState: "open",
      requests: 0, pending: 0, loads: 0, entries: 0, entry: "不存在",
      asset: "未加载", unloads: 0, events: [], scopeCount: 2, pendingRequests: "0",
      sceneBindings: "0", callback: "—"
    }, overrides);
  }

  function step(phase, title, copy, change, why, state, codeKey, line) {
    return { phase, title, copy, change, why, state, codeKey, line };
  }

  const cases = {
    shared: {
      problem: "两个 Owner 同时请求相同资源，如果各自启动加载，会浪费 I/O 并可能返回不同对象。",
      mechanism: "以 location 为键建立 PendingLoad；同类型请求加入等待列表，完成后一次性登记 Owners。",
      boundary: "同一 Scope 重复请求只保留一个 Owner，不按 Load 次数计数。",
      cost: "缓存与 Pending 查找平均 O(1)，完成时按等待请求数 O(P)。",
      steps: [
        step("01 / SCOPES", "创建两个独立 Scope", "界面与音频两个 Owner 各自拥有一份 location 集合。", "Scope 数从 0 变为 2。", "生命周期负责人不相同，就不应共享一个不可拆分的释放开关。", view(), "scope", 1),
        step("02 / REQUEST A", "Owner A 发起异步请求", "缓存未命中，也没有 PendingLoad，于是建立等待条目并启动一次底层加载。", "Requests=1，Pending=1，Underlying Loads=1。", "Pending 必须在启动底层操作前可见，后来的请求才能合并。", view({ requests: 1, pending: 1, loads: 1, pendingRequests: "A", events: ["A 请求资源 α：缓存未命中", "创建 PendingLoad，启动底层加载"] }), "request", 3),
        step("03 / MERGE B", "Owner B 加入同一次加载", "B 请求相同 location 与类型，只追加等待请求，不启动第二次加载。", "Requests=2，但 Underlying Loads 仍为 1。", "合并的是底层工作，不是 Owner；完成后 A、B 仍分别拥有资源。", view({ requests: 2, pending: 1, loads: 1, pendingRequests: "A, B", events: ["A 请求资源 α：缓存未命中", "B 合并到相同 PendingLoad"] }), "merge", 3),
        step("04 / COMPLETE", "加载完成并分发", "系统先移除 PendingLoad，再为两个仍有效的 Scope 登记所有权并回调。", "Entries=1，Owners={A,B}，两个 Scope 的矩阵格都点亮。", "先确认 Scope 仍存活，避免把完成太晚的资源交给已经结束的 Owner。", view({ owners: ["A", "B"], a: true, b: true, requests: 2, loads: 1, entries: 1, entry: "READY", asset: "对象 #1", pendingRequests: "0", callback: "A ✓ / B ✓", events: ["底层加载完成：对象 #1", "登记 A、B 所有权并执行回调"] }), "complete", 3),
        step("05 / CACHE HIT", "后续请求直接命中缓存", "B 再次请求资源 α，返回同一对象。Owner 集合不会重复增加 B。", "Requests=3，Loads 仍为 1，Owners 仍是两个。", "Owner 集合描述作用域所有权，不描述调用次数。", view({ owners: ["A", "B"], a: true, b: true, requests: 3, loads: 1, entries: 1, entry: "CACHE HIT", asset: "对象 #1", callback: "B ✓", events: ["B 再次请求：缓存命中", "Owners.Add(B) 无重复项"] }), "request", 2),
        step("06 / RELEASE A", "A 单独释放", "同时从 A.Locations 和 Entry.Owners 移除关系。B 仍持有，所以不卸载。", "Owners={B}，底层对象仍为 #1。", "只看一个引用计数数字无法解释谁还在用；所有权矩阵可以。", view({ owners: ["B"], b: true, aState: "open", bState: "open", requests: 3, loads: 1, entries: 1, entry: "RETAINED", asset: "对象 #1", events: ["A Release(α)", "Owners 仍非空：保留底层对象"] }), "release", 1),
        step("07 / RELEASE B", "最后一个 Owner 释放", "B 移除后 Owners 归零，缓存条目删除并调用底层卸载。", "Entries=0，Unloads=1。", "底层释放只发生在所有权真正归零的这一刻。", view({ requests: 3, loads: 1, unloads: 1, asset: "已卸载", events: ["B Release(α)", "Owners=∅：删除 Entry 并 Unload"] }), "release", 4)
      ]
    },
    "single-release": {
      problem: "一个 Owner 释放共享资源时，不能破坏另一个 Owner 的有效引用。",
      mechanism: "Release 同时更新 Scope→Locations 与 Entry→Owners；只有 Owners 归零才卸载。",
      boundary: "重复 Release 返回失败，不应再次卸载或影响其他 Owner。",
      cost: "单资源 Release 平均 O(1)，但需要维护双向集合一致性。",
      steps: [
        step("01 / SHARED", "资源已经被两个 Scope 共享", "A 与 B 都持有资源 α，缓存只有一个底层对象。", "Owners={A,B}。", "共享对象与独立所有权可以同时成立。", view({ owners: ["A","B"], a: true, b: true, entries: 1, entry: "READY", asset: "对象 #1", loads: 1 }), "complete", 3),
        step("02 / RELEASE A", "A 释放自己的关系", "A 的 location 集合和 Entry 的 Owners 同步删除 A。", "矩阵只熄灭 A×α；B×α 仍亮。", "更新双向索引，诊断数据才不会与真实释放状态分叉。", view({ owners: ["B"], b: true, entries: 1, entry: "RETAINED", asset: "对象 #1", loads: 1, events: ["A Release(α)：成功"] }), "release", 1),
        step("03 / REPEAT", "A 重复释放失败", "A 已不持有 α，第二次 Release 不做任何状态改变。", "Unloads 仍为 0，B 不受影响。", "幂等边界必须显式返回失败，不能把别人的引用一起减掉。", view({ owners: ["B"], b: true, entries: 1, entry: "RETAINED", asset: "对象 #1", loads: 1, events: ["A Release(α)：成功", "A 再次 Release(α)：false"] }), "release", 0),
        step("04 / RELEASE B", "B 释放后归零", "最后一个 Owner 消失，删除缓存并卸载。", "Unloads 从 0 变为 1。", "最终释放点由 Owners 归零决定。", view({ loads: 1, unloads: 1, asset: "已卸载", events: ["B Release(α)", "Owners=∅：Unload"] }), "release", 4)
      ]
    },
    scene: {
      problem: "场景内多个管理器各自保留资源，卸载时逐个记住清理容易遗漏。",
      mechanism: "创建时登记 scene→scopeIds；卸载事件对 ID 快照逐个 Dispose。",
      boundary: "普通 Scope 不属于场景索引，不会被任意场景卸载自动释放。",
      cost: "场景卸载约为 O(S + ΣR)，S 为 Scope 数，R 为各 Scope 持有数。",
      steps: [
        step("01 / BIND", "创建两个场景 Scope", "A、B 被绑定到同一教学场景，并各自进入场景索引。", "SceneBindings=2。", "索引只保存 Scope ID，释放规则仍由 Scope 统一执行。", view({ sceneBindings: "2", scopeCount: 2 }), "scope", 1),
        step("02 / RETAIN", "场景 Scope 持有共享资源", "一次底层加载完成后，A、B 都成为资源 α 的 Owner。", "Entries=1，Owners={A,B}。", "场景绑定不改变共享缓存语义。", view({ owners:["A","B"],a:true,b:true,entries:1,entry:"READY",asset:"对象 #1",loads:1,sceneBindings:"2" }), "complete", 3),
        step("03 / UNLOAD", "场景卸载获取 Scope 快照", "卸载事件复制当前 scopeIds，避免 Dispose 过程中修改正在遍历的集合。", "准备依次 Dispose A、B。", "清理集合时先快照，是避免迭代失效的简单防线。", view({ owners:["A","B"],a:true,b:true,entries:1,entry:"READY",asset:"对象 #1",loads:1,sceneBindings:"2",events:["scene unloaded：snapshot [A,B]"] }), "dispose", 0),
        step("04 / DISPOSE A", "Dispose 第一个 Scope", "ReleaseAll 移除 A 的所有 location，再删除 A 的场景绑定和 Scope 状态。", "Owners={B}，资源继续保留。", "Dispose 是批量 Release，不是无条件卸载。", view({ owners:["B"],b:true,aState:"disposed",entries:1,entry:"RETAINED",asset:"对象 #1",loads:1,scopeCount:1,sceneBindings:"1",events:["A.Dispose：释放全部所有权"] }), "dispose", 1),
        step("05 / DISPOSE B", "最后一个 Scope 完成释放", "B 的所有权移除后 Owners 归零，底层对象卸载。", "Scope=0，Entries=0，Unloads=1。", "场景退出最终仍遵守 Owner 归零规则。", view({ aState:"disposed",bState:"disposed",loads:1,unloads:1,asset:"已卸载",scopeCount:0,sceneBindings:"0",events:["B.Dispose", "Owners=∅：Unload"] }), "dispose", 3)
      ]
    },
    failure: {
      problem: "相同 location 的并发请求若要求不同类型，合并会让至少一个调用者收到错误对象。",
      mechanism: "PendingLoad 记录类型；冲突请求立即失败，不登记 Owner，也不遮蔽原始错误。",
      boundary: "加载失败或完成时无有效 Scope，都不能留下无人认领的缓存条目。",
      cost: "严格类型检查增加分支，但避免错误缓存扩散到后续命中。",
      steps: [
        step("01 / REQUEST A", "A 启动类型 X 的加载", "创建 PendingLoad<X>，开始一次底层加载。", "Pending=1，Loads=1。", "进行中的加载必须携带预期类型。", view({requests:1,pending:1,loads:1,pendingRequests:"A:X",events:["A 请求 α as X"]}), "request", 3),
        step("02 / CONFLICT", "B 请求相同位置的类型 Y", "类型与 PendingLoad 不同，B 立即收到失败结果，不加入等待列表。", "Pending 请求仍只有 A；B callback=null。", "不能因 location 相同就忽略类型契约。", view({requests:2,pending:1,loads:1,pendingRequests:"A:X",callback:"B: null",events:["B 请求 α as Y", "TYPE CONFLICT：拒绝合并"]}), "failure", 2),
        step("03 / LOAD FAIL", "底层加载返回失败", "PendingLoad 被移除，A 收到 null；系统不创建缓存 Entry。", "Pending=0，Entries=0。", "失败必须保持可见，不能用空对象伪装成功缓存。", view({requests:2,loads:1,callback:"A: null / B: null",events:["底层加载失败", "移除 Pending，通知 A"]}), "failure", 4),
        step("04 / NO LEAK", "失败路径没有 Owner 与缓存", "两个 Scope 仍存在，但都不拥有资源 α，也没有底层卸载次数。", "矩阵为空，状态回到可重试前。", "没有成功创建底层对象就不调用 Unload；也不能残留假 Entry。", view({requests:2,loads:1,callback:"失败保持可见",events:["最终：Entries=0, Owners=∅"]}), "complete", 5)
      ]
    }
  };

  const el = {
    tabs: Array.from(document.querySelectorAll("[data-case]")), problem:$("#problem"), mechanism:$("#mechanism"),
    boundary:$("#boundary"), cost:$("#cost"), phase:$("#phase"), title:$("#title"), copy:$("#copy"),
    change:$("#change"), why:$("#why"), stepLabel:$("#step-label"), stepCount:$("#step-count"), status:$("#status"),
    matrix:$("#owner-matrix"), requests:$("#requests"), pending:$("#pending"), loads:$("#loads"), entries:$("#entries"),
    entry:$("#entry-state"), owners:$("#owners"), asset:$("#asset"), unloads:$("#unloads"), log:$("#event-log"),
    metrics:$("#metrics"), codeStatus:$("#code-status"), codeLines:$("#code-lines"), speed:$("#speed"),
    reset:$("#reset"), previous:$("#previous"), auto:$("#auto"), next:$("#next"), dots:$("#dots")
  };
  let activeCase = "shared";
  let player;

  function renderMatrix(state) {
    el.matrix.replaceChildren();
    [["A",state.a,state.aState],["B",state.b,state.bState]].forEach(([owner, owned, scopeState]) => {
      const row=document.createElement("tr");
      const values=[`Scope ${owner}`,owned?"OWNER":"—","—",scopeState];
      values.forEach((value,index)=>{const cell=document.createElement("td");cell.textContent=value;if(index===1&&owned)cell.className="owned";if(index===3&&scopeState==="disposed")cell.className="disposed";row.append(cell);});
      el.matrix.append(row);
    });
  }

  function renderList(target, values) {
    target.replaceChildren();
    (values.length ? values : ["等待第一步"]).forEach(value=>{const item=document.createElement("li");item.textContent=value;target.append(item);});
  }

  function renderMetrics(state) {
    const rows=[["Active Scopes",state.scopeCount],["Pending Requests",state.pendingRequests],["Scene Bindings",state.sceneBindings],["Callbacks",state.callback]];
    el.metrics.replaceChildren();
    rows.forEach(([key,value])=>{const wrap=document.createElement("div"),dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=key;dd.textContent=value;wrap.append(dt,dd);el.metrics.append(wrap);});
  }

  function renderCode(item) {
    el.codeLines.replaceChildren();
    code[item.codeKey].forEach((line,index)=>{const li=document.createElement("li");li.textContent=line;li.classList.toggle("is-active",index===item.line);el.codeLines.append(li);});
    el.codeStatus.textContent=item.codeKey.toUpperCase();
  }

  function renderStep({step:item,index,total}) {
    const state=item.state;
    el.phase.textContent=item.phase;el.title.textContent=item.title;el.copy.textContent=item.copy;el.change.textContent=item.change;el.why.textContent=item.why;
    el.stepLabel.textContent=`STEP ${String(index+1).padStart(2,"0")}`;el.stepCount.textContent=`${index+1} / ${total}`;el.status.textContent=state.entry;
    el.requests.textContent=state.requests;el.pending.textContent=state.pending;el.loads.textContent=state.loads;el.entries.textContent=state.entries;
    el.entry.textContent=state.entry;el.owners.textContent=state.owners.length?state.owners.join(", "):"∅";el.asset.textContent=state.asset;el.unloads.textContent=state.unloads;
    renderMatrix(state);renderList(el.log,state.events);renderMetrics(state);renderCode(item);
  }

  function syncCopy() {
    const current=cases[activeCase];el.problem.textContent=current.problem;el.mechanism.textContent=current.mechanism;el.boundary.textContent=current.boundary;el.cost.textContent=current.cost;
  }

  function createPlayer() {
    if(player)player.destroy();
    player=window.XianyuInteractiveLab.createStepPlayer({
      steps:cases[activeCase].steps,autoStepMs:Number(el.speed.value),endBehavior:"disable",dotElement:"button",dotsInteractive:true,
      controls:{previous:el.previous,next:el.next,auto:el.auto,reset:el.reset,dots:el.dots},
      labels:{play:"自动演示",pause:"暂停",complete:"演示完成",next:"下一步 →",done:"已完成",dot:(index,total)=>`跳到第 ${index+1} 步，共 ${total} 步`},
      classes:{playing:"is-playing",dot:"lab-dot",dotActive:"is-active",dotPast:"is-past"},renderStep,onModeChange:()=>{}
    });
  }

  el.tabs.forEach(button=>button.addEventListener("click",()=>{activeCase=button.dataset.case;el.tabs.forEach(tab=>{const selected=tab===button;tab.classList.toggle("is-active",selected);tab.setAttribute("aria-pressed",String(selected));});syncCopy();player.replaceSteps(cases[activeCase].steps);}));
  el.speed.addEventListener("change",createPlayer);
  if(!window.XianyuInteractiveLab)throw new Error("资源作用域实验需要 interactive-lab.js");
  syncCopy();createPlayer();
})();
