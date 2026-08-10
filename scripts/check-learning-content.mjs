import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const contentRoot = path.join(repoRoot, "content");

const checks = [
  ["实现代码", /```(?:csharp|cpp|c\+\+)/i],
  ["具体场景", /例如|比如|假设|场景|输入|先准备|构造/],
  ["运行跟踪", /输出|结果|逐步|第一步|第二步|运行|变化|调用顺序|状态/],
  ["原因说明", /为什么|解决|作用|目的|原因|为了|负责/],
  ["边界说明", /边界|失败|注意|限制|代价|坑|错误|异常|不适合|风险/],
];

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

const files = (await walk(contentRoot)).filter((file) => {
  const name = path.basename(file);
  return name !== "README.md" && name !== "后续学习计划.md";
});

const failures = [];
for (const file of files) {
  const markdown = await fs.readFile(file, "utf8");
  const missing = checks
    .filter(([, pattern]) => !pattern.test(markdown))
    .map(([label]) => label);

  if (missing.length > 0) {
    failures.push({
      file: path.relative(repoRoot, file).split(path.sep).join("/"),
      missing,
    });
  }
}

if (failures.length > 0) {
  console.error(`教学内容检查失败：${failures.length} / ${files.length} 篇存在缺项。`);
  for (const failure of failures) {
    console.error(`- ${failure.file}: 缺少 ${failure.missing.join("、")}`);
  }
  process.exitCode = 1;
} else {
  console.log(`教学内容检查通过：${files.length} 篇正文均包含代码、场景、运行跟踪、原因和边界。`);
}
