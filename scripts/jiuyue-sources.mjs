import fs from 'node:fs';
import crypto from 'node:crypto';

// 与正式加载器一致，测试读取实际外置资源并核验内容，而不是继续测试未引用的旧大包。
export function loadGameAssets() {
  const entry=new URL('../games/jiuyue/index.html',import.meta.url);
  const manifest=JSON.parse(fs.readFileSync(new URL('./resources/manifest.json',entry),'utf8'));
  if(manifest.schema!=='lion-resource-manifest/v1')throw new Error('资源清单版本无效');
  return Object.fromEntries(manifest.entries.map(resource=>{
    const bytes=fs.readFileSync(new URL(resource.url,entry));
    if(bytes.length!==resource.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==resource.sha256)throw new Error('正式资源校验失败：'+resource.key);
    return [resource.key,'data:'+resource.mime+';base64,'+bytes.toString('base64')];
  }));
}

// 测试与构建读取页面实际引用顺序；缺文件或混入内嵌脚本直接失败。
export function loadGameSources() {
  const entry = new URL('../games/jiuyue/index.html', import.meta.url);
  const html = fs.readFileSync(entry, 'utf8');
  const tags = [...html.matchAll(/<script\s+src="([^"]+)"\s*>\s*<\/script>/g)];
  if (tags.length !== [...html.matchAll(/<script\b/g)].length || tags.length === 0) {
    throw new Error('游戏脚本必须以独立文件显式引用');
  }
  const scripts = tags.map(([, src]) => ({ src, code: fs.readFileSync(new URL(src, entry), 'utf8') }));
  const styles = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*>/g)]
    .map(([, src]) => ({ src, code: fs.readFileSync(new URL(src, entry), 'utf8') }));
  return { entry, html, scripts, styles };
}
