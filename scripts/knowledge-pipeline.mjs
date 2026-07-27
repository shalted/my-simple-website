import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const contentRoot = path.join(repoRoot, "content");
const outputRoot = path.join(repoRoot, "knowledge", "library");
const supportedExtensions = new Set([".md", ".svg"]);

const command = process.argv[2] ?? "all";
const sourceFlagIndex = process.argv.indexOf("--source");
const sourceArg = sourceFlagIndex >= 0 ? process.argv[sourceFlagIndex + 1] : undefined;

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function assertInside(root, target) {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`拒绝操作非预期目录：${target}`);
  }
}

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function cleanLocalPaths(markdown) {
  let replacements = 0;
  const windowsPath = /[A-Za-z]:[\\/](?:[^\\/:*?"<>|\r\n`，。；、）\]}>]+[\\/])*[^\\/:*?"<>|\r\n`，。；、）\]}>]+/g;
  const cleaned = markdown.replace(windowsPath, (match) => {
    replacements += 1;
    return match.split(/[\\/]/).at(-1);
  });
  return { cleaned, replacements };
}

async function importKnowledge(sourceDirectory) {
  if (!sourceDirectory) {
    throw new Error("缺少知识源目录。用法：npm run knowledge:all -- --source \"<知识源目录>\"");
  }

  const sourceRoot = path.resolve(sourceDirectory);
  const sourceStat = await fs.stat(sourceRoot);
  if (!sourceStat.isDirectory()) throw new Error(`知识源不是目录：${sourceRoot}`);

  assertInside(repoRoot, contentRoot);
  await fs.rm(contentRoot, { recursive: true, force: true });
  await fs.mkdir(contentRoot, { recursive: true });

  const sourceFiles = (await walk(sourceRoot))
    .filter((file) => supportedExtensions.has(path.extname(file).toLowerCase()));
  let markdownCount = 0;
  let assetCount = 0;
  let pathReplacementCount = 0;

  for (const sourceFile of sourceFiles) {
    const relative = path.relative(sourceRoot, sourceFile);
    const destination = path.join(contentRoot, relative);
    assertInside(contentRoot, destination);
    await fs.mkdir(path.dirname(destination), { recursive: true });

    if (path.extname(sourceFile).toLowerCase() === ".md") {
      const original = await fs.readFile(sourceFile, "utf8");
      const { cleaned, replacements } = cleanLocalPaths(original);
      await fs.writeFile(destination, `${cleaned.replace(/\s+$/u, "")}\n`, "utf8");
      markdownCount += 1;
      pathReplacementCount += replacements;
    } else {
      await fs.copyFile(sourceFile, destination);
      assetCount += 1;
    }
  }

  console.log(`导入完成：${markdownCount} 篇 Markdown，${assetCount} 个资源，清理 ${pathReplacementCount} 处本地路径。`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugify(value, usedSlugs) {
  const base = value
    .trim()
    .toLocaleLowerCase("zh-CN")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "section";
  let slug = base;
  let suffix = 2;
  while (usedSlugs.has(slug)) slug = `${base}-${suffix++}`;
  usedSlugs.add(slug);
  return slug;
}

function outputPartsForMarkdown(relativeMarkdown) {
  const parsed = path.posix.parse(relativeMarkdown);
  if (parsed.base.toLocaleLowerCase("en-US") === "readme.md") {
    return parsed.dir ? parsed.dir.split("/") : [];
  }
  return [...(parsed.dir ? parsed.dir.split("/") : []), parsed.name];
}

function urlForMarkdown(relativeMarkdown) {
  const parts = outputPartsForMarkdown(relativeMarkdown).map(encodeURIComponent);
  return `/knowledge/library/${parts.length ? `${parts.join("/")}/` : ""}`;
}

function outputFileForMarkdown(relativeMarkdown) {
  return path.join(outputRoot, ...outputPartsForMarkdown(relativeMarkdown), "index.html");
}

function rewriteHref(href, relativeMarkdown) {
  if (/^(?:https?:|mailto:|#|\/)/i.test(href)) return href;
  const [filePart, fragment] = href.split("#", 2);
  const decoded = decodeURIComponent(filePart);
  const currentDirectory = path.posix.dirname(relativeMarkdown);
  const target = path.posix.normalize(path.posix.join(currentDirectory, decoded));
  if (target.toLocaleLowerCase("en-US").endsWith(".md")) {
    return `${urlForMarkdown(target)}${fragment ? `#${fragment}` : ""}`;
  }
  if (target.toLocaleLowerCase("en-US").endsWith(".svg")) {
    return `/knowledge/library/${target.split("/").map(encodeURIComponent).join("/")}${fragment ? `#${fragment}` : ""}`;
  }
  return href;
}

function renderInline(value, relativeMarkdown) {
  const tokens = [];
  const reserve = (html) => {
    const token = `@@KNOWLEDGE_TOKEN_${tokens.length}@@`;
    tokens.push(html);
    return token;
  };

  let text = value.replace(/`([^`]+)`/g, (_, code) => reserve(`<code>${escapeHtml(code)}</code>`));
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const rewritten = rewriteHref(href.trim(), relativeMarkdown);
    const external = /^https?:/i.test(rewritten) ? ' target="_blank" rel="noreferrer"' : "";
    return reserve(`<a href="${escapeHtml(rewritten)}"${external}>${escapeHtml(label)}</a>`);
  });
  text = escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>");
  tokens.forEach((html, index) => {
    text = text.replace(`@@KNOWLEDGE_TOKEN_${index}@@`, html);
  });
  return text;
}

function isTableDivider(line) {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line);
}

function tableCells(line) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function renderMarkdown(markdown, relativeMarkdown, documentTitle) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  const toc = [];
  const usedSlugs = new Set();
  let paragraph = [];
  let listType = null;
  let inCode = false;
  let codeLanguage = "";
  let codeLines = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${renderInline(paragraph.join(" "), relativeMarkdown)}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };
  const openList = (type) => {
    if (listType === type) return;
    closeList();
    html.push(`<${type}>`);
    listType = type;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = line.match(/^\s*```(.*)$/);
    if (fence) {
      flushParagraph();
      closeList();
      if (!inCode) {
        inCode = true;
        codeLanguage = fence[1].trim();
        codeLines = [];
      } else {
        const languageClass = codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : "";
        html.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      const label = heading[2].replace(/\s+#+\s*$/, "").trim();
      if (level === 1 && label === documentTitle) continue;
      const renderedLevel = Math.max(2, level);
      const slug = slugify(label, usedSlugs);
      if (renderedLevel <= 3) toc.push({ level: renderedLevel, label, slug });
      html.push(`<h${renderedLevel} id="${escapeHtml(slug)}">${renderInline(label, relativeMarkdown)}</h${renderedLevel}>`);
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      flushParagraph();
      closeList();
      const headers = tableCells(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      index -= 1;
      html.push("<table><thead><tr>");
      headers.forEach((cell) => html.push(`<th>${renderInline(cell, relativeMarkdown)}</th>`));
      html.push("</tr></thead><tbody>");
      rows.forEach((row) => {
        html.push("<tr>");
        headers.forEach((_, cellIndex) => html.push(`<td>${renderInline(row[cellIndex] ?? "", relativeMarkdown)}</td>`));
        html.push("</tr>");
      });
      html.push("</tbody></table>");
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const type = unordered ? "ul" : "ol";
      openList(type);
      html.push(`<li>${renderInline((unordered ?? ordered)[1], relativeMarkdown)}</li>`);
      continue;
    }

    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
      flushParagraph();
      closeList();
      html.push("<hr>");
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    closeList();
    paragraph.push(line.trim());
  }

  if (inCode) {
    const languageClass = codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : "";
    html.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  flushParagraph();
  closeList();
  return { html: html.join("\n"), toc };
}

function extractDocument(markdown, relativeMarkdown) {
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  if (!titleMatch) throw new Error(`缺少一级标题：${relativeMarkdown}`);
  const title = titleMatch[1].trim();
  const category = relativeMarkdown.includes("/") ? relativeMarkdown.split("/")[0] : "知识路线";
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let inCode = false;
  let summary = "";
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (
      inCode || !line || line.startsWith("#") || line.startsWith("-") ||
      /^\d+[.)]\s/.test(line) || line.startsWith("|") ||
      /^(?:分类|关联代码|状态)\s*[：:]/.test(line)
    ) continue;
    summary = line
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`~]/g, "")
      .trim();
    if (summary) break;
  }
  if (!summary) throw new Error(`无法提取摘要：${relativeMarkdown}`);
  if (summary.length > 118) summary = `${summary.slice(0, 115)}…`;
  return {
    title,
    category,
    summary,
    relativeMarkdown,
    url: urlForMarkdown(relativeMarkdown),
    isReadme: path.posix.basename(relativeMarkdown).toLocaleLowerCase("en-US") === "readme.md",
  };
}

function siteHeader() {
  return `
  <header class="knowledge-header">
    <nav class="knowledge-nav knowledge-shell" aria-label="主导航">
      <a class="knowledge-brand" href="/">
        <span class="knowledge-brand-mark">X</span>
        <span>XIANYUWO / DEV LAB</span>
      </a>
      <div class="knowledge-nav-links">
        <a href="/#lab">交互实验</a>
        <a href="/knowledge/library/">知识库</a>
        <a href="https://github.com/shalted/my-simple-website" target="_blank" rel="noreferrer">GitHub ↗</a>
      </div>
    </nav>
  </header>`;
}

function siteFooter() {
  return `
  <footer class="knowledge-footer">
    <div class="knowledge-shell">XIANYUWO / KNOWLEDGE PIPELINE · 从 Markdown 自动生成</div>
  </footer>`;
}

function pageDocument({ title, description, body, interactive }) {
  if (typeof interactive !== "boolean") {
    throw new Error("pageDocument 需要明确指定 interactive。");
  }
  const interactiveAssets = interactive
    ? `  <link rel="stylesheet" href="/assets/interactive-lab.css">
  <script src="/assets/interactive-lab.js" defer></script>
`
    : "";
  const document = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)} · XIANYUWO</title>
${interactiveAssets}  <link rel="stylesheet" href="/assets/knowledge.css">
  <script src="/assets/knowledge.js" defer></script>
</head>
<body>
${siteHeader()}
${body}
${siteFooter()}
</body>
</html>
`;
  return document.replace(/[ \t]+\n/g, "\n");
}

function interactiveCallout(document) {
  const combined = `${document.title} ${document.relativeMarkdown}`;
  if (/一次技能从输入到结束/i.test(combined)) {
    return `
      <aside class="article-callout">
        <strong>配套全链路调试器</strong>
        <span>切换正常、资源不足、标签阻止与高优先级打断，逐步观察资源、标签、冷却、实例和清理状态。</span>
        <p><a href="/knowledge/ability-flow/">打开技能运行地图 →</a></p>
      </aside>`;
  }
  if (/Effect.*Buff|Buff.*Effect/i.test(combined)) {
    return `
      <aside class="article-callout">
        <strong>配套生命周期实验</strong>
        <span>切换叠层、刷新与过期策略，同步比较基础值、最终值、层数、剩余时间和周期事件。</span>
        <p><a href="/knowledge/effect-lifecycle/">打开 Effect / Buff 实验 →</a></p>
      </aside>`;
  }
  if (/网络预测|服务器校正/i.test(combined)) {
    return `
      <aside class="article-callout">
        <strong>配套预测校正实验</strong>
        <span>调整教学延迟与丢包，逐步观察输入 Tick、预测轨迹、权威确认、历史裁剪与重放。</span>
        <p><a href="/knowledge/network-prediction/">打开网络预测实验 →</a></p>
      </aside>`;
  }
  if (/虚拟列表|节点复用/i.test(combined)) {
    return `
      <aside class="article-callout">
        <strong>配套节点复用实验</strong>
        <span>对比普通列表与固定槽位，观察首个可见索引、节点映射、快速跳转和异步旧结果。</span>
        <p><a href="/knowledge/virtual-list/">打开虚拟列表实验 →</a></p>
      </aside>`;
  }
  if (/配置数据生成管线/i.test(combined)) {
    return `
      <aside class="article-callout">
        <strong>配套构建闸门实验</strong>
        <span>注入重复 ID、缺失引用与非法范围，观察错误袋、强类型快照、主键索引和运行时查询。</span>
        <p><a href="/knowledge/config-pipeline/">打开配置生成实验 →</a></p>
      </aside>`;
  }
  if (/UI.*页面栈|页面栈.*面板池/i.test(combined)) {
    return `
      <aside class="article-callout">
        <strong>配套页面生命周期实验</strong>
        <span>逐步观察打开、覆盖、返回、面板复用、数据绑定、事件解绑和旧回调冲突。</span>
        <p><a href="/knowledge/ui-stack-pool/">打开页面栈实验 →</a></p>
      </aside>`;
  }
  if (/状态来源与技能仲裁|标签来源|打断优先级/i.test(combined)) {
    return `
      <aside class="article-callout">
        <strong>配套来源与仲裁实验</strong>
        <span>观察固定状态、临时来源、层级查询，以及普通激活、预输入窗口和外部强制打断的分轨决策。</span>
        <p><a href="/knowledge/tag-arbitration/">打开技能仲裁实验 →</a></p>
      </aside>`;
  }
  if (/命中后的运动与投射物|投射物|击退曲线/i.test(combined)) {
    return `
      <aside class="article-callout">
        <strong>配套运动反馈实验</strong>
        <span>逐步观察追踪与穿透、扫掠命中历史、目标丢失、击退曲线和碰撞反馈后的清理。</span>
        <p><a href="/knowledge/projectile-motion/">打开运动与投射物实验 →</a></p>
      </aside>`;
  }
  if (/属性脏标记|局部重算/i.test(combined)) {
    return `
      <aside class="article-callout">
        <strong>配套局部重算实验</strong>
        <span>拆开实体粗筛与属性精筛，比较同帧合并、即时读取、两级缺标和失效引用清理。</span>
        <p><a href="/knowledge/dirty-attribute/">打开属性重算实验 →</a></p>
      </aside>`;
  }
  if (/目标筛选|命中判定/i.test(combined)) {
    return `
      <aside class="article-callout">
        <strong>配套几何调试器</strong>
        <span>拖动施法者与目标，逐层观察世界姿态、空间粗筛、阵营过滤、精确判断和入选原因。</span>
        <p><a href="/knowledge/target-filter/">打开目标筛选实验 →</a></p>
      </aside>`;
  }
  if (/资源作用域|引用释放/i.test(combined)) {
    return `
      <aside class="article-callout">
        <strong>配套所有权实验</strong>
        <span>观察并发请求合并、Owner 矩阵、单独 Release、场景 Dispose 与最终底层释放。</span>
        <p><a href="/knowledge/resource-scope/">打开资源作用域实验 →</a></p>
      </aside>`;
  }
  if (/Flags|BitMask|位标记/i.test(combined)) {
    return `
      <aside class="article-callout">
        <strong>配套交互实验</strong>
        <span>观察二进制位如何组合、判断和移除，并对比合法组合与互斥业务结果。</span>
        <p><a href="/knowledge/systems-lab/#flags">打开 Flags 状态实验 →</a></p>
      </aside>`;
  }
  if (/随机系统/i.test(combined)) {
    return `
      <aside class="article-callout">
        <strong>配套交互实验</strong>
        <span>切换加权、保底、洗牌袋和稳定随机案例，逐步查看分布策略。</span>
        <p><a href="/knowledge/systems-lab/#random">打开随机策略实验 →</a></p>
      </aside>`;
  }
  if (/空间划分|九宫格|四叉树/i.test(combined)) {
    return `
      <aside class="article-callout">
        <strong>配套交互实验</strong>
        <span>观察九宫格、空间 Hash、四叉树和粗筛到精筛的候选集变化。</span>
        <p><a href="/knowledge/systems-lab/#space">打开空间查询实验 →</a></p>
      </aside>`;
  }
  if (/二叉堆|优先队列/i.test(combined)) {
    return `
      <aside class="article-callout">
        <strong>配套交互实验</strong>
        <span>同步观察数组、隐式树、关键下标和代码，逐步调试 BubbleUp 与 BubbleDown。</span>
        <p><a href="/knowledge/binary-heap/">打开二叉堆实验 →</a></p>
      </aside>`;
  }
  if (/HashSet/i.test(combined)) {
    return `
      <aside class="article-callout">
        <strong>先看状态，不背 API</strong>
        <span>下方实验会把每次 Add 拆成“查重 → 返回结果 → 是否写入”，并同步展示集合与代码。</span>
      </aside>`;
  }
  if (/集群|群体|怪物.*AI/i.test(combined)) {
    return `
      <aside class="article-callout">
        <strong>配套交互实验</strong>
        <span>用手动单步或慢速自动模式，观察怪物群体的感知、仲裁与行动。</span>
        <p><a href="/knowledge/swarm-ai/">打开集群 AI 实验 →</a></p>
      </aside>`;
  }
  if (/A\*|A星|寻路/i.test(combined)) {
    return `
      <aside class="article-callout">
        <strong>配套交互实验</strong>
        <span>逐步查看 Open、Closed、Parent 和代价如何变化。</span>
        <p><a href="/#lab">打开 A* 寻路实验 →</a></p>
      </aside>`;
  }
  return "";
}

function renderToc(toc) {
  if (!toc.length) return "";
  return `<nav class="toc" aria-label="文章目录">
    <strong>CONTENTS</strong>
    ${toc.map((item) => `<a${item.level === 3 ? ' class="sub"' : ""} data-toc-link href="#${escapeHtml(item.slug)}">${escapeHtml(item.label)}</a>`).join("\n    ")}
  </nav>`;
}

function extractDynamicSections(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections = [];
  let section = null;
  let inCode = false;
  let codeLanguage = "";
  let codeLines = [];

  const finishCode = () => {
    if (!section || !codeLines.length || section.code) {
      codeLines = [];
      return;
    }
    section.code = codeLines.join("\n");
    section.codeLanguage = codeLanguage;
    codeLines = [];
  };

  const finishSection = () => {
    if (!section) return;
    finishCode();
    const paragraphs = [];
    let paragraph = [];
    for (const line of section.body) {
      const trimmed = line.trim();
      if (!trimmed || /^#{3,6}\s/.test(trimmed) || /^[-*+]\s/.test(trimmed) || /^\d+[.)]\s/.test(trimmed)) {
        if (paragraph.length) {
          paragraphs.push(paragraph.join(" "));
          paragraph = [];
        }
        continue;
      }
      paragraph.push(trimmed);
    }
    if (paragraph.length) paragraphs.push(paragraph.join(" "));
    section.summary = paragraphs[0] ?? "";
    section.bullets = section.body
      .map((line) => line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)$/)?.[1])
      .filter(Boolean);
    if (section.summary || section.bullets.length || section.code) sections.push(section);
    section = null;
  };

  for (const line of lines) {
    const fence = line.match(/^\s*```(.*)$/);
    if (fence) {
      if (!inCode) {
        inCode = true;
        codeLanguage = fence[1].trim();
        codeLines = [];
      } else {
        inCode = false;
        finishCode();
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      finishSection();
      section = { title: heading[1].trim(), body: [], code: "", codeLanguage: "", bullets: [], summary: "" };
      continue;
    }
    if (section) section.body.push(line);
  }
  finishSection();
  return sections;
}

function renderDynamicDeck(markdown, relativeMarkdown) {
  const sections = extractDynamicSections(markdown);
  const hasObservableStructure = sections.some((section) => section.code || section.bullets.length);
  if (sections.length < 2 || !hasObservableStructure) return "";
  const steps = sections.map((section, index) => {
    const type = section.code ? "CODE / LOGIC" : section.bullets.length ? "FLOW / RULES" : "CONCEPT";
    const summary = section.summary
      ? `<p>${renderInline(section.summary, relativeMarkdown)}</p>`
      : "";
    const bullets = section.bullets.length
      ? `<ul>${section.bullets.map((item) => `<li>${renderInline(item, relativeMarkdown)}</li>`).join("")}</ul>`
      : "";
    const code = section.code
      ? `<pre><code${section.codeLanguage ? ` class="language-${escapeHtml(section.codeLanguage)}"` : ""}>${escapeHtml(section.code)}</code></pre>`
      : "";
    return `
      <article class="deck-slide${index === 0 ? " active" : ""}" data-deck-slide="${index}"${index === 0 ? "" : " hidden"}>
        <div class="deck-step-meta">STEP ${String(index + 1).padStart(2, "0")} / ${type}</div>
        <h3>${renderInline(section.title, relativeMarkdown)}</h3>
        ${summary}
        ${bullets}
        ${code}
      </article>`;
  }).join("");
  const navigation = sections.map((section, index) => `
    <button class="${index === 0 ? "active" : ""}" type="button" data-deck-jump="${index}" aria-label="查看第 ${index + 1} 步：${escapeHtml(section.title)}">
      <span>${String(index + 1).padStart(2, "0")}</span>
      <strong>${escapeHtml(section.title)}</strong>
    </button>`).join("");

  return `
    <section class="dynamic-deck" data-dynamic-deck data-interactive-lab>
      <header class="deck-header">
        <div>
          <span class="deck-kicker">DYNAMIC EXPLAINER / ARTICLE FLOW</span>
          <h2>把章节变成可单步观察的过程</h2>
        </div>
        <span class="deck-counter"><b data-deck-current>01</b> / ${String(sections.length).padStart(2, "0")}</span>
      </header>
      <div class="deck-stage">
        <nav class="deck-nav" aria-label="动态讲解步骤">${navigation}</nav>
        <div class="deck-slides">${steps}</div>
      </div>
      <footer class="deck-controls">
        <button type="button" data-deck-prev data-lab-control>← 上一步</button>
        <button class="deck-play" type="button" data-deck-play data-lab-control aria-pressed="false">自动播放</button>
        <button type="button" data-deck-next data-lab-control>下一步 →</button>
        <div class="deck-progress" aria-hidden="true"><i data-deck-progress></i></div>
        <div data-deck-runtime-dots hidden></div>
      </footer>
    </section>`;
}
function isHashSetDocument(document) {
  return /HashSet/i.test(`${document.title} ${document.relativeMarkdown}`);
}

function isTimelineDocument(document) {
  return /数据驱动\s*Timeline|Timeline.*实体消费/i.test(`${document.title} ${document.relativeMarkdown}`);
}

function renderTimelineLab() {
  return `
    <section class="timeline-lab" data-timeline-lab data-interactive-lab aria-labelledby="timeline-lab-title">
      <header class="timeline-lab__header">
        <div>
          <span class="timeline-lab__kicker">RUNTIME TIMELINE / LIVE EDITOR</span>
          <h2 id="timeline-lab-title">拖动一段时间，观察整条执行链</h2>
          <p>这里的轨道不是装饰。移动或缩放 Clip 后，播放实例、Task 生命周期、实体状态与预览画面都会读取同一份数据。</p>
        </div>
        <div class="timeline-lab__settings">
          <label>总帧数<input data-timeline-length type="number" min="1" max="120" value="15" inputmode="numeric"></label>
          <label>Flow 起播帧<input data-timeline-start-frame type="number" min="0" max="14" value="0" inputmode="numeric" disabled></label>
          <label>演示速度（网页帧/秒）<input data-timeline-demo-speed type="number" min="1" max="30" value="6" inputmode="numeric"></label>
        </div>
      </header>
      <div class="timeline-lab__notice" data-timeline-notice role="status" aria-live="polite">拖动片段主体可改变位置，拖动两侧把手可修改起止帧。</div>
      <div class="timeline-lab__workspace">
        <div class="timeline-editor">
          <div class="timeline-editor__toolbar">
            <div><span>SOURCE DATA</span><strong>4 TRACKS / 4 CLIPS</strong></div>
            <div class="timeline-editor__readout">FRAME <b data-timeline-frame>00</b><span data-timeline-time>逻辑帧 0</span></div>
          </div>
          <div class="timeline-editor__scroll">
            <div class="timeline-editor__canvas" data-timeline-canvas>
              <div class="timeline-ruler"><div class="timeline-ruler__label">FRAME</div><div class="timeline-ruler__ticks" data-timeline-ruler></div></div>
              <div class="timeline-tracks" data-timeline-tracks></div>
              <button class="timeline-playhead" data-timeline-playhead type="button" aria-label="当前播放帧，可拖动定位"><i></i><span></span></button>
            </div>
          </div>
          <p class="timeline-editor__hint">拖动播放头可逐帧预览；片段边缘吸附到整数帧。</p>
        </div>
        <div class="timeline-preview">
          <div class="timeline-preview__topline"><span>ENTITY PREVIEW</span><strong data-timeline-phase>等待播放</strong></div>
          <div class="timeline-stage" data-timeline-stage>
            <div class="timeline-stage__grid" aria-hidden="true"></div>
            <div class="timeline-actor" data-timeline-actor><i class="timeline-actor__head"></i><i class="timeline-actor__body"></i><i class="timeline-actor__arm"></i><span>ACTOR</span></div>
            <div class="timeline-attack" data-timeline-attack aria-hidden="true"></div>
            <div class="timeline-target" data-timeline-target><i></i><span>TARGET</span></div>
            <div class="timeline-sound" data-timeline-sound aria-hidden="true"><i></i><i></i><i></i></div>
            <div class="timeline-stage__caption" data-timeline-caption>实体尚未收到命令</div>
          </div>
          <div class="timeline-entity-state">
            <div><span>动作</span><strong data-timeline-action>Idle</strong></div><div><span>音效</span><strong data-timeline-audio>未播放</strong></div>
            <div><span>命中</span><strong data-timeline-hit>未触发</strong></div><div><span>移动</span><strong data-timeline-movement>自由</strong></div>
          </div>
        </div>
      </div>
      <div class="timeline-runtime">
        <section class="timeline-runtime__tasks"><header><span>ACTIVE TASKS</span><b data-timeline-active-count>0</b></header><div data-timeline-active-tasks></div></section>
        <section class="timeline-runtime__log"><header><span>EVENT STREAM</span><button type="button" data-timeline-clear-log>清空显示</button></header><ol data-timeline-log aria-live="polite"></ol></section>
        <section class="timeline-runtime__code">
          <header><span>SYNCED PSEUDOCODE</span><b data-timeline-code-state>IDLE</b></header>
          <div data-timeline-code>
            <p data-code-line="1"><span>1</span><code>targetFrame = floor(elapsed × globalLogicFrameRate)</code></p><p data-code-line="2"><span>2</span><code>while currentFrame &lt; targetFrame</code></p>
            <p data-code-line="3"><span>3</span><code>if frame == start → Begin()</code></p><p data-code-line="4"><span>4</span><code>if clip is active → Tick()</code></p>
            <p data-code-line="5"><span>5</span><code>if frame == end → Finish()</code></p><p data-code-line="6"><span>6</span><code>command → entity component</code></p><p data-code-line="7"><span>7</span><code>Interrupt() → release active state</code></p>
          </div>
        </section>
      </div>
      <div class="timeline-runtime" aria-label="Timeline 宿主与清理扩展">
        <section class="timeline-runtime__tasks">
          <header><span>HOST ADAPTER</span><button type="button" data-timeline-host aria-pressed="false">独立 Timeline</button></header>
          <div data-timeline-host-state></div>
        </section>
        <section class="timeline-runtime__tasks">
          <header><span>FLOW SCOPED TASK</span><button type="button" data-timeline-scope-finish>演示正常清理</button><button type="button" data-timeline-scope-cancel>演示取消清理</button></header>
          <div data-timeline-scope-state></div>
        </section>
        <section class="timeline-runtime__tasks">
          <header><span>CONTROL LOCK OWNERS</span><button type="button" data-timeline-lock-a aria-pressed="false">来源 A</button><button type="button" data-timeline-lock-b aria-pressed="false">来源 B</button></header>
          <div data-timeline-lock-state></div>
        </section>
      </div>
      <details data-timeline-boundaries>
        <summary>展开运行边界：节点预算、断链、命令桥与 Dispose</summary>
        <ul>
          <li>Flow 可在同一次 Tick 连续通过多个立即完成节点，但必须受安全预算约束；耗尽预算时取消，避免同步死循环。</li>
          <li>当前运行模型中，“没有下一节点”和“下一节点引用找不到”都会结束宿主；未知节点执行器与显式取消才进入取消终态。</li>
          <li>命令桥提交失败不会自动阻止宿主启动。失败保持可见，本实验不伪造重试、默认成功或静默补偿。</li>
          <li>普通 Timeline Clip 只展示 Finish / Interrupt；只有明确由 Flow 作用域托管的 Task 才在终态后展示 Dispose。</li>
        </ul>
      </details>
      <footer class="timeline-lab__controls">
        <button type="button" data-timeline-reset data-lab-control>重置数据</button><button type="button" data-timeline-prev data-lab-control>← 上一帧</button>
        <button class="is-primary" type="button" data-timeline-play data-lab-control aria-pressed="false">自动播放</button><button type="button" data-timeline-next data-lab-control>下一帧 →</button>
        <button type="button" data-timeline-catchup data-lab-control>模拟卡顿 +3 帧</button><button type="button" data-timeline-same-frame data-lab-control aria-pressed="false">同帧命中：已关闭</button>
        <button type="button" data-timeline-loop data-lab-control aria-pressed="false" disabled>Flow 循环：已关闭</button><button type="button" data-timeline-loop-marker data-lab-control aria-pressed="true" disabled>循环锚点：动作标记</button>
        <button class="is-danger" type="button" data-timeline-interrupt data-lab-control>中断 Timeline</button>
      </footer>
    </section>`;
}

function renderHashSetLab() {
  return `
    <section class="hashset-lab" data-hashset-lab aria-labelledby="hashset-lab-title">
      <header class="hashset-lab__header">
        <div>
          <span>HASHSET / STATE DEBUGGER</span>
          <h2 id="hashset-lab-title">同一个值为什么加不进去？</h2>
          <p>输入序列固定为 A → B → A → C → B。手动逐步观察：HashSet 会先询问“见过吗”，只有没见过时才改变集合。</p>
        </div>
        <strong><b data-hashset-current>01</b> / 11</strong>
      </header>
      <div class="hashset-stream" aria-label="待处理输入序列">
        <span>输入序列</span>
        <div data-hashset-stream></div>
      </div>
      <div class="hashset-lab__stage">
        <div class="hashset-state">
          <span class="hashset-label">BEFORE / 操作前</span>
          <div class="hashset-values" data-hashset-before></div>
        </div>
        <div class="hashset-operation">
          <span class="hashset-label">CURRENT OPERATION</span>
          <strong data-hashset-operation>等待开始</strong>
          <p data-hashset-explanation></p>
          <div class="hashset-verdict" data-hashset-verdict></div>
        </div>
        <div class="hashset-state">
          <span class="hashset-label">AFTER / 操作后</span>
          <div class="hashset-values" data-hashset-after></div>
        </div>
      </div>
      <div class="hashset-code">
        <div><span>1</span><code>foreach (string value in input)</code></div>
        <div><span>2</span><code>bool added = seen.Add(value);</code></div>
        <div><span>3</span><code>if (!added) duplicates++;</code></div>
        <div><span>4</span><code>else uniqueValues.Add(value);</code></div>
      </div>
      <div class="hashset-controls">
        <button type="button" data-hashset-reset>重置</button>
        <button type="button" data-hashset-prev>← 上一步</button>
        <button type="button" data-hashset-auto aria-pressed="false">自动演示</button>
        <button class="is-primary" type="button" data-hashset-next>下一步 →</button>
        <div class="hashset-dots" data-hashset-dots></div>
      </div>
      <div class="hashset-playground">
        <div>
          <span class="hashset-label">TRY IT / 自由操作</span>
          <h3>亲手试一次 Add、Contains、Remove</h3>
          <p>输入一个值后选择操作。空输入会明确提示，不会被悄悄写入集合。</p>
        </div>
        <div class="hashset-playground__actions">
          <label for="hashset-value">值</label>
          <input id="hashset-value" data-hashset-input type="text" autocomplete="off" placeholder="例如 Alice">
          <button type="button" data-hashset-action="add">Add</button>
          <button type="button" data-hashset-action="contains">Contains</button>
          <button type="button" data-hashset-action="remove">Remove</button>
          <button type="button" data-hashset-clear>Clear</button>
        </div>
        <div class="hashset-playground__result">
          <div><span>当前集合</span><div class="hashset-values" data-hashset-live-set></div></div>
          <p data-hashset-live-result aria-live="polite">集合目前为空，请输入一个值。</p>
        </div>
      </div>
    </section>`;
}

function renderArticlePage(document, markdown, previous, next) {
  const rendered = renderMarkdown(markdown, document.relativeMarkdown, document.title);
  const previousLink = previous
    ? `<a href="${previous.url}"><small>← PREVIOUS</small>${escapeHtml(previous.title)}</a>`
    : "<span></span>";
  const nextLink = next
    ? `<a href="${next.url}"><small>NEXT →</small>${escapeHtml(next.title)}</a>`
    : "<span></span>";

  const body = `
  <main>
    <section class="article-hero knowledge-shell">
      <div class="eyebrow">${escapeHtml(document.category)} / KNOWLEDGE NOTE</div>
      <h1>${escapeHtml(document.title)}</h1>
      <p class="hero-copy">${escapeHtml(document.summary)}</p>
    </section>
    <div class="article-layout knowledge-shell">
      ${renderToc(rendered.toc)}
      <article class="article-body" id="article-start">
        ${interactiveCallout(document)}
        ${document.isReadme ? "" : isTimelineDocument(document) ? renderTimelineLab() : isHashSetDocument(document) ? renderHashSetLab() : renderDynamicDeck(markdown, document.relativeMarkdown)}
        ${rendered.html}
        <nav class="article-pager" aria-label="上下篇">
          ${previousLink}
          ${nextLink}
        </nav>
      </article>
    </div>
  </main>`;
  return pageDocument({ title: document.title, description: document.summary, body, interactive: !document.isReadme });
}

function renderLibraryIndex(documents) {
  const articles = documents.filter((document) => !document.isReadme);
  const counts = new Map();
  articles.forEach((document) => counts.set(document.category, (counts.get(document.category) ?? 0) + 1));
  const categories = [...counts.entries()].sort(([left], [right]) => left.localeCompare(right, "zh-CN"));

  const categoryCards = categories.map(([category, count]) => {
    const readme = documents.find((document) => document.isReadme && document.category === category);
    const firstArticle = articles.find((document) => document.category === category);
    const href = readme?.url ?? firstArticle.url;
    return `
      <a class="category-card" href="${href}">
        <small>${String(count).padStart(2, "0")} NOTES</small>
        <h3>${escapeHtml(category)}</h3>
        <span class="card-arrow">进入专题 →</span>
      </a>`;
  }).join("");

  const articleCards = articles.map((document) => {
    const search = `${document.title} ${document.category} ${document.summary}`.toLocaleLowerCase("zh-CN");
    return `
      <a class="article-card" data-article-card data-search="${escapeHtml(search)}" href="${document.url}">
        <small>${escapeHtml(document.category)}</small>
        <div>
          <h3>${escapeHtml(document.title)}</h3>
          <p>${escapeHtml(document.summary)}</p>
        </div>
        <span class="card-arrow">阅读笔记 →</span>
      </a>`;
  }).join("");

  const body = `
  <main>
    <section class="library-hero knowledge-shell">
      <div class="eyebrow">KNOWLEDGE LIBRARY / ${String(articles.length).padStart(2, "0")} NOTES</div>
      <h1>把知识变成<br>可探索的系统</h1>
      <p class="hero-copy">算法、数据结构、游戏 AI 与工程设计。普通笔记用于系统阅读，重点主题配有可单步调试的交互实验。</p>
      <div class="library-search">
        <input id="knowledge-search" type="search" placeholder="搜索标题、分类或关键词…" autocomplete="off" aria-label="搜索知识库">
      </div>
    </section>
    <section class="section knowledge-shell">
      <div class="section-heading"><h2>交互专题</h2><span>LEARN BY DOING</span></div>
      <div class="feature-grid">
        <a class="feature-card" href="/knowledge/ability-flow/">
          <small>ABILITY / END-TO-END FLOW</small>
          <div><h3>一次技能从输入到结束</h3><p>沿激活闸门、运行实例、编排、命中、结算与清理逐步调试完整链路。</p></div>
          <span class="card-arrow">进入实验 →</span>
        </a>
        <a class="feature-card" href="/knowledge/effect-lifecycle/">
          <small>EFFECT / LIFECYCLE</small>
          <div><h3>Effect / Buff 生命周期</h3><p>对比瞬时、持续、周期、叠层、刷新、到期和主动移除。</p></div>
          <span class="card-arrow">进入实验 →</span>
        </a>
        <a class="feature-card" href="/knowledge/target-filter/">
          <small>TARGET QUERY / GEOMETRY TRACE</small>
          <div><h3>目标筛选与命中判定</h3><p>拖动角色与目标，拆开圆形、扇形、盒形的粗筛和精确判断。</p></div>
          <span class="card-arrow">进入实验 →</span>
        </a>
        <a class="feature-card" href="/knowledge/resource-scope/">
          <small>RESOURCE / OWNERSHIP</small>
          <div><h3>资源作用域与引用释放</h3><p>观察请求合并、缓存命中、Owner 矩阵和最终底层释放。</p></div>
          <span class="card-arrow">进入实验 →</span>
        </a>
        <a class="feature-card" href="/knowledge/network-prediction/">
          <small>NETWORK / RECONCILE</small>
          <div><h3>网络预测与服务器校正</h3><p>调整延迟与丢包，对齐输入 Tick、预测轨迹、权威状态和重放队列。</p></div>
          <span class="card-arrow">进入实验 →</span>
        </a>
        <a class="feature-card" href="/knowledge/virtual-list/">
          <small>UI / VIRTUALIZATION</small>
          <div><h3>虚拟列表与节点复用</h3><p>用固定槽位滚动大量数据，观察索引映射、复用和异步取消。</p></div>
          <span class="card-arrow">进入实验 →</span>
        </a>
        <a class="feature-card" href="/knowledge/config-pipeline/">
          <small>CONFIG / BUILD GATE</small>
          <div><h3>配置数据生成管线</h3><p>从源数据到强类型快照，观察分层校验、错误袋、索引和发布闸门。</p></div>
          <span class="card-arrow">进入实验 →</span>
        </a>
        <a class="feature-card" href="/knowledge/ui-stack-pool/">
          <small>UI / STACK &amp; POOL</small>
          <div><h3>UI 页面栈与面板池</h3><p>拆解打开、覆盖、返回、复用、绑定清理和旧回调冲突。</p></div>
          <span class="card-arrow">进入实验 →</span>
        </a>
        <a class="feature-card" href="/knowledge/tag-arbitration/">
          <small>STATE SOURCE / ARBITRATION</small>
          <div><h3>状态来源与技能仲裁</h3><p>用来源账本和阶段矩阵拆解标签聚合、激活阻挡、预输入与打断清理。</p></div>
          <span class="card-arrow">进入实验 →</span>
        </a>
        <a class="feature-card" href="/knowledge/projectile-motion/">
          <small>PROJECTILE / MOTION FEEDBACK</small>
          <div><h3>命中后的运动与投射物</h3><p>沿运动策略、扫掠命中、击退曲线、碰撞反馈和终态清理逐步调试。</p></div>
          <span class="card-arrow">进入实验 →</span>
        </a>
        <a class="feature-card" href="/knowledge/dirty-attribute/">
          <small>DIRTY FLAGS / LOCAL RECOMPUTE</small>
          <div><h3>属性脏标记与局部重算</h3><p>观察实体粗筛、属性精筛、同帧合并、即时刷新和失效引用清理。</p></div>
          <span class="card-arrow">进入实验 →</span>
        </a>
        <a class="feature-card" href="/#lab">
          <small>PATHFINDING / STEP DEBUG</small>
          <div><h3>A* 寻路</h3><p>逐步观察代价、Open / Closed 集合与 Parent 回溯。</p></div>
          <span class="card-arrow">进入实验 →</span>
        </a>
        <a class="feature-card" href="/knowledge/swarm-ai/">
          <small>SWARM AI / LIVE LOGIC</small>
          <div><h3>怪物集群 AI</h3><p>在手动与自动模式间切换，观察群体决策的最小闭环。</p></div>
          <span class="card-arrow">进入实验 →</span>
        </a>
        <a class="feature-card" href="/knowledge/binary-heap/">
          <small>BINARY HEAP / LIVE STRUCTURE</small>
          <div><h3>二叉堆优先队列</h3><p>同步观察数组与树，逐步调试 BubbleUp 和 BubbleDown。</p></div>
          <span class="card-arrow">进入实验 →</span>
        </a>
        <a class="feature-card" href="/knowledge/systems-lab/#flags">
          <small>BITMASK / LIVE STATE</small>
          <div><h3>Flags / BitMask</h3><p>覆盖组合、判断、移除、合法叠加与互斥结果建模。</p></div>
          <span class="card-arrow">进入实验 →</span>
        </a>
        <a class="feature-card" href="/knowledge/systems-lab/#random">
          <small>RANDOM / DISTRIBUTION</small>
          <div><h3>随机系统</h3><p>对比权重、保底、洗牌袋、Seed 与稳定随机。</p></div>
          <span class="card-arrow">进入实验 →</span>
        </a>
        <a class="feature-card" href="/knowledge/systems-lab/#space">
          <small>SPATIAL / QUERY PIPELINE</small>
          <div><h3>空间划分</h3><p>覆盖九宫格、空间 Hash、四叉树和两阶段范围查询。</p></div>
          <span class="card-arrow">进入实验 →</span>
        </a>
      </div>
    </section>
    <section class="section knowledge-shell">
      <div class="section-heading"><h2>专题地图</h2><span>${categories.length} CATEGORIES</span></div>
      <div class="category-grid">${categoryCards}</div>
    </section>
    <section class="section knowledge-shell">
      <div class="section-heading"><h2>全部笔记</h2><span>${articles.length} ARTICLES</span></div>
      <div class="article-grid">${articleCards}</div>
      <p class="search-empty" id="search-empty" hidden>没有找到匹配的笔记，换一个关键词试试。</p>
    </section>
  </main>`;
  return pageDocument({
    title: "知识库",
    description: "XIANYUWO 的算法、数据结构、游戏 AI 与工程设计知识库。",
    body,
    interactive: false,
  });
}

async function buildKnowledge() {
  const contentStat = await fs.stat(contentRoot);
  if (!contentStat.isDirectory()) {
    throw new Error("content 目录不存在，请先执行 knowledge:import。");
  }

  const contentFiles = await walk(contentRoot);
  const markdownFiles = contentFiles.filter((file) => path.extname(file).toLowerCase() === ".md");
  if (!markdownFiles.length) throw new Error("content 目录中没有 Markdown 文件。");

  const records = [];
  for (const file of markdownFiles) {
    const relativeMarkdown = toPosix(path.relative(contentRoot, file));
    const markdown = await fs.readFile(file, "utf8");
    records.push({ ...extractDocument(markdown, relativeMarkdown), markdown });
  }
  records.sort((left, right) =>
    `${left.category}/${left.title}`.localeCompare(`${right.category}/${right.title}`, "zh-CN"));
  const articleRecords = records.filter((record) => !record.isReadme);

  assertInside(repoRoot, outputRoot);
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(outputRoot, { recursive: true });

  for (const record of records) {
    const articleIndex = articleRecords.indexOf(record);
    const previous = articleIndex > 0 ? articleRecords[articleIndex - 1] : null;
    const next = articleIndex >= 0 && articleIndex < articleRecords.length - 1 ? articleRecords[articleIndex + 1] : null;
    const outputFile = outputFileForMarkdown(record.relativeMarkdown);
    assertInside(outputRoot, outputFile);
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, renderArticlePage(record, record.markdown, previous, next), "utf8");
  }

  const assetFiles = contentFiles.filter((file) => path.extname(file).toLowerCase() === ".svg");
  for (const asset of assetFiles) {
    const destination = path.join(outputRoot, path.relative(contentRoot, asset));
    assertInside(outputRoot, destination);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(asset, destination);
  }

  await fs.writeFile(path.join(outputRoot, "index.html"), renderLibraryIndex(records), "utf8");
  console.log(`构建完成：${records.length} 个知识页面，${articleRecords.length} 篇文章，${assetFiles.length} 个资源。`);
}

if (!["import", "build", "all"].includes(command)) {
  throw new Error(`未知命令：${command}`);
}
if (command === "import" || command === "all") await importKnowledge(sourceArg);
if (command === "build" || command === "all") await buildKnowledge();
