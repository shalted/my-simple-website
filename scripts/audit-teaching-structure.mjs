import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const contentRoot = path.join(repoRoot, "content");
const strict = process.argv.includes("--strict");

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(fullPath);
  }

  return files;
}

function headings(markdown) {
  return [...markdown.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1].trim());
}

function inspect(markdown) {
  const articleHeadings = headings(markdown);
  const openingHeadings = articleHeadings.slice(0, 2).join(" ");
  const issues = [];

  if (!/(结论|解决|问题|是什么|理解|先|核心|场景|开始)/.test(openingHeadings)) {
    issues.push("前两个章节没有明确的入门入口");
  }

  if (!/(例如|比如|假设|场景|输入|先看|先用)/.test(markdown)) {
    issues.push("缺少具体场景或输入");
  }

  if (!/(逐步|步骤|第一步|运行一次|运行过程|调用顺序|变化过程|状态变化|初始|第一次|下一帧|最终|->|→)/.test(markdown)) {
    issues.push("缺少可跟踪的运行过程");
  }

  if (!/(常见误解|误区|容易混淆|常见错误|常见坑|坑一|失败路径|不能|不等于|否则|不要|必须)/.test(markdown)) {
    issues.push("缺少常见误解或失败触发说明");
  }

  if (!/(最后总结|最终总结|最后用|最后记住|最后只记住|最重要的收获|最重要的写法|小结|总结)/.test(articleHeadings.at(-1) ?? "")) {
    issues.push("结尾缺少核心模型收束");
  }

  if (markdown.length >= 6500 && !articleHeadings.some((heading) => /进阶|深入|实现差异|标准.*实现/.test(heading))) {
    issues.push("长文没有把进阶内容与入门主线分层");
  }

  return issues;
}

const files = (await walk(contentRoot)).filter((file) => {
  const name = path.basename(file);
  return name !== "README.md" && name !== "后续学习计划.md";
});

const findings = [];
for (const file of files) {
  const markdown = await fs.readFile(file, "utf8");
  const issues = inspect(markdown);
  if (issues.length > 0) {
    findings.push({
      file: path.relative(repoRoot, file).split(path.sep).join("/"),
      issues,
    });
  }
}

if (findings.length === 0) {
  console.log(`教学结构审计通过：${files.length} 篇正文均符合渐进式讲解基线。`);
} else {
  console.log(`教学结构审计：${findings.length} / ${files.length} 篇建议调整。`);
  for (const finding of findings) {
    console.log(`- ${finding.file}`);
    for (const issue of finding.issues) console.log(`  - ${issue}`);
  }

  if (strict) process.exitCode = 1;
}
