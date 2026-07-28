import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".git") continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }
  return files;
}

function assertInside(target) {
  const relative = path.relative(repoRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`链接越出站点根目录：${target}`);
  }
}

function decode(value, source) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(`链接编码无效：${source} -> ${value}`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function resolveLocalTarget(sourceFile, pathname) {
  const decoded = decode(pathname, sourceFile);
  const absolute = decoded.startsWith("/")
    ? path.resolve(repoRoot, decoded.slice(1))
    : path.resolve(path.dirname(sourceFile), decoded);
  assertInside(absolute);

  if (decoded.endsWith("/")) return path.join(absolute, "index.html");
  try {
    const stat = await fs.stat(absolute);
    return stat.isDirectory() ? path.join(absolute, "index.html") : absolute;
  } catch {
    return absolute;
  }
}

const htmlFiles = (await walk(repoRoot)).filter((file) => path.extname(file).toLowerCase() === ".html");
const htmlCache = new Map();
const failures = [];
let references = 0;

for (const htmlFile of htmlFiles) {
  const html = await fs.readFile(htmlFile, "utf8");
  htmlCache.set(htmlFile, html);
  const attributes = html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi);
  for (const match of attributes) {
    const raw = match[1].trim();
    if (!raw || /^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(raw)) continue;
    references += 1;

    const [beforeHash, rawHash = ""] = raw.split("#", 2);
    const pathname = beforeHash.split("?", 1)[0];
    const target = await resolveLocalTarget(htmlFile, pathname);
    try {
      const stat = await fs.stat(target);
      if (!stat.isFile()) throw new Error("目标不是文件");
    } catch {
      failures.push(`${path.relative(repoRoot, htmlFile)} -> ${raw}（目标不存在）`);
      continue;
    }

    if (!rawHash || path.extname(target).toLowerCase() !== ".html") continue;
    const id = decode(rawHash, htmlFile);
    const targetHtml = htmlCache.get(target) ?? await fs.readFile(target, "utf8");
    htmlCache.set(target, targetHtml);
    const escaped = escapeRegExp(id);
    if (!new RegExp(`\\b(?:id|name|data-scenario)=["']${escaped}["']`).test(targetHtml)) {
      failures.push(`${path.relative(repoRoot, htmlFile)} -> ${raw}（锚点不存在）`);
    }
  }
}

if (failures.length) {
  throw new Error(`静态链接检查失败：\n${failures.join("\n")}`);
}
console.log(`静态链接检查通过：${htmlFiles.length} 个 HTML，${references} 个本地引用。`);
