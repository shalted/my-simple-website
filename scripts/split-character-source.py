"""原尺寸切开已确认的 512 格子，供逐帧模型细缝复验，不改 RGB 或缩放。"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
for character_id in ('xiaoyu', 'aolie'):
    for action in ('idle', 'move', 'attack'):
        source = Image.open(ROOT / 'games/jiuyue/art' / character_id / f'source-{action}-magenta.png')
        assert source.size == (1536, 1024)
        folder = ROOT / 'output/characters-review/matting' / character_id / action / 'single'
        folder.mkdir(parents=True, exist_ok=True)
        for i in range(5):
            source.crop((i%3*512, i//3*512, (i%3+1)*512, (i//3+1)*512)).save(folder / f'source-{i+1}.png')
