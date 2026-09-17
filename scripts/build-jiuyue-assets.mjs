import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetFile = path.join(root, 'games/jiuyue/js/assets.js');
const characters = ['xiaotian', 'xiaoyu', 'aolie', 'yangjian', 'nezha'];
// 四套正式敌方目录已经齐备；缺图直接中止，不替换成英雄素材。
const enemies = ['nian', 'carrier', 'guard', 'thrower'];
const source = fs.readFileSync(assetFile, 'utf8');
const pattern = /^const ASSETS=(\{[^\n]*\});\s*$/;
const match = source.match(pattern);
if (!match) throw new Error('独立素材清单格式错误，停止构建');
const assets = JSON.parse(match[1]);

// 只接受已经验收的五帧 RGBA 精灵表；不自动补图或替换缺失动作。
for (const characterId of [...characters, ...enemies]) for (const action of ['idle', 'move', 'attack']) {
  const art = path.join(root, 'games/jiuyue/art', characterId);
  const bytes = fs.readFileSync(path.join(art, `${action}.png`));
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      || bytes.readUInt32BE(16) !== 416 * 5 || bytes.readUInt32BE(20) !== 480
      || bytes[25] !== 6) {
    throw new Error(`${action}.png 必须是 2080×480 RGBA PNG`);
  }
  assets[`${characterId}_${action}`] = `data:image/png;base64,${bytes.toString('base64')}`;
}
for (const characterId of ['jiuyue', ...characters]) {
  const bytes = fs.readFileSync(path.join(root, 'games/jiuyue/art', characterId, 'skill.png'));
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      || bytes.readUInt32BE(16) !== 416 * 5 || bytes.readUInt32BE(20) !== 480
      || bytes[25] !== 6) {
    throw new Error(`${characterId}/skill.png 必须是 2080×480 RGBA PNG`);
  }
  assets[`${characterId}_skill`] = `data:image/png;base64,${bytes.toString('base64')}`;
}
for (const star of [1, 2, 3]) {
  const bytes = fs.readFileSync(path.join(root, 'games/jiuyue/art/shrimp', `star${star}.png`));
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      || bytes.readUInt32BE(16) !== 416 * 5 || bytes.readUInt32BE(20) !== 480
      || bytes[25] !== 6) {
    throw new Error(`shrimp/star${star}.png 必须是 2080×480 RGBA PNG`);
  }
  assets[`shrimp_star${star}`] = `data:image/png;base64,${bytes.toString('base64')}`;
}
fs.writeFileSync(assetFile, `const ASSETS=${JSON.stringify(assets)};`, 'utf8');
console.log('已更新英雄及四套敌方动作、六套技能与三星虾兵素材；保留整个游戏目录可离线打开。');
