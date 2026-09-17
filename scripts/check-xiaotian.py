"""验证最终 PNG 和 APNG 的真实解码结果，而不只检查扩展名。"""
from pathlib import Path
import json

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "games/jiuyue/art/xiaotian"
REVIEW = ROOT / "output/xiaotian-review"

results = {}
for action in ("idle", "move", "attack"):
    sheet = Image.open(ART / f"{action}.png")
    assert sheet.mode == "RGBA" and sheet.size == (2080, 480), action
    pixels = np.array(sheet)
    assert not np.any(pixels[pixels[:, :, 3] == 0, :3]), f"透明 RGB 未清零：{action}"
    assert len(np.unique(pixels[:, :, 3])) > 2, f"丢失连续 alpha：{action}"
    animation = Image.open(REVIEW / f"{action}-preview.png")
    assert animation.n_frames == 5, f"APNG 帧数错误：{action}"
    for index in range(5):
        source = Image.open(ART / f"{action}-{index + 1}.png")
        animation.seek(index)
        assert np.array_equal(np.array(animation.convert("RGBA")), np.array(source)), f"APNG 留有前帧残影：{action}/{index}"
        crop = sheet.crop((index * 416, 0, (index + 1) * 416, 480))
        assert np.array_equal(np.array(crop), np.array(source)), f"图集帧错位：{action}/{index}"
        assert source.getchannel("A").getbbox()[3] == 440, f"脚底未对齐：{action}/{index}"
    results[action] = {"size": sheet.size, "alphaValues": len(np.unique(pixels[:, :, 3])),
                       "apngFrames": animation.n_frames, "fullFrameReplacement": True}
print(json.dumps(results, ensure_ascii=False, indent=2))
