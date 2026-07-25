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
  const category = relativeMarkdown.includes("/") ? relativeMarkdown.split("/")[0] : "学习计划";
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
  if (/二叉堆|优先队列/i.test(combined)) {
    return `
      <aside class="article-callout">
        <strong>配套交互实验</strong>
        <span>同步观察数组、隐式树、关键下标和代码，逐步调试 BubbleUp 与 BubbleDown。</span>
        <p><a href="/knowledge/binary-heap/">打开二叉堆实验 →</a></p>
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
        ${document.isReadme ? "" : renderDynamicDeck(markdown, document.relativeMarkdown)}
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
