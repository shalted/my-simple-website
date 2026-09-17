"""验证新角色帧尺寸、Alpha、脚底锚点以及 APNG 完整替帧。"""
from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
results = {}
for character_id in ('xiaoyu', 'aolie'):
    art = ROOT / 'games/jiuyue/art' / character_id
    review = ROOT / 'output/characters-review' / character_id
    for action in ('idle', 'move', 'attack'):
        sheet = Image.open(art / f'{action}.png')
        assert sheet.mode == 'RGBA' and sheet.size == (2080, 480)
        pixels = np.asarray(sheet)
        assert not np.any(pixels[pixels[:, :, 3] == 0, :3])
        assert len(np.unique(pixels[:, :, 3])) > 2
        animation = Image.open(review / f'{action}-preview.png')
        assert animation.n_frames == 5
        for index in range(5):
            source = Image.open(art / f'{action}-{index + 1}.png')
            animation.seek(index)
            assert np.array_equal(np.asarray(animation.convert('RGBA')), np.asarray(source))
            assert np.array_equal(np.asarray(sheet.crop((index*416, 0, (index+1)*416, 480))), np.asarray(source))
            assert source.getchannel('A').getbbox()[3] == 440
        results[f'{character_id}/{action}'] = {'frames':5,'alphaValues':len(np.unique(pixels[:,:,3])), 'fullFrameReplacement':True}
print(json.dumps(results, ensure_ascii=False, indent=2))
