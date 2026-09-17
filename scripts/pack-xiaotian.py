"""打包已验收的哮天透明图；只切帧、统一缩放和对齐，不修改分割结果。"""
from pathlib import Path
import json

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "games/jiuyue/art/xiaotian"
REVIEW = ROOT / "output/xiaotian-review"
# 现有游戏协议与已确认尺寸；原图是实测 3×2 网格，最后一格留空。
CELL = 512
FRAME_SIZE = (416, 480)
ANCHOR = (208, 440)
TIMINGS = {"idle": [200] * 5, "move": [200] * 5, "attack": [100, 100, 200, 200, 200]}
BACKGROUNDS = {"white": "#FFFFFF", "black": "#000000", "board": "#F3EAD8"}


def read_frames(action):
    path = REVIEW / "matting" / f"{action}-magenta" / "matted.png"
    image = Image.open(path)
    if image.mode != "RGBA" or image.size != (CELL * 3, CELL * 2):
        raise ValueError(f"透明源图模式或尺寸错误：{path}")
    return [image.crop((i % 3 * CELL, i // 3 * CELL, (i % 3 + 1) * CELL, (i // 3 + 1) * CELL)) for i in range(5)]


def main():
    frames = {action: read_frames(action) for action in TIMINGS}
    reference = Image.open(REVIEW / "jiuyue-idle-reference.png").crop((0, 0, *FRAME_SIZE))
    reference_bounds = reference.getchannel("A").getbbox()
    source_bounds = frames["idle"][0].getchannel("A").getbbox()
    # 所有动作共用一个比例：以九月第一帧的可见高度为尺寸参照，禁止逐帧拉伸。
    desired_scale = (reference_bounds[3] - reference_bounds[1]) / (source_bounds[3] - source_bounds[1])
    scaled_cell = round(CELL * desired_scale)
    scale = scaled_cell / CELL
    metadata = {"frameSize": FRAME_SIZE, "anchor": ANCHOR, "sourceCell": CELL,
                "scale": scale, "referenceBounds": reference_bounds, "sourceBounds": source_bounds,
                "backdrop": "#FF00FF", "actions": {}}
    ART.mkdir(parents=True, exist_ok=True)
    for action, source_frames in frames.items():
        packed = []
        offsets = []
        for index, source in enumerate(source_frames):
            resized = source.resize((scaled_cell, scaled_cell), Image.Resampling.LANCZOS)
            bounds = resized.getchannel("A").getbbox()
            offset = (ANCHOR[0] - scaled_cell // 2, ANCHOR[1] - bounds[3])
            if bounds[0] + offset[0] < 0 or bounds[2] + offset[0] > FRAME_SIZE[0] or bounds[1] + offset[1] < 0:
                raise ValueError(f"{action}/{index + 1} 超出固定画布，停止打包，不能静默裁切")
            frame = Image.new("RGBA", FRAME_SIZE)
            frame.paste(resized, offset)
            pixels = np.array(frame)
            pixels[pixels[:, :, 3] == 0, :3] = 0
            frame = Image.fromarray(pixels)
            frame.save(ART / f"{action}-{index + 1}.png")
            packed.append(frame)
            offsets.append({"sourceBounds": source.getchannel("A").getbbox(), "offset": offset,
                            "outputBounds": frame.getchannel("A").getbbox()})
        sheet = Image.new("RGBA", (FRAME_SIZE[0] * len(packed), FRAME_SIZE[1]))
        for index, frame in enumerate(packed):
            sheet.paste(frame, (index * FRAME_SIZE[0], 0))
        sheet.save(ART / f"{action}.png")
        for name, color in BACKGROUNDS.items():
            background = Image.new("RGBA", sheet.size, color)
            background.alpha_composite(sheet)
            background.convert("RGB").save(REVIEW / f"{action}-packed-{name}.png")
        # APNG 每帧完整替换；不让透明区域显露上一帧。
        packed[0].save(REVIEW / f"{action}-preview.png", save_all=True, append_images=packed[1:],
                       duration=TIMINGS[action], loop=0, disposal=1, blend=0)
        metadata["actions"][action] = {"durationsMs": TIMINGS[action], "frames": offsets}
    (ART / "manifest.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
