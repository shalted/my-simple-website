"""复用哮天切帧管线，打包已确认的小玉/烈烈；源 alpha 不再加工。"""
import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / 'output/characters-review'
spec = importlib.util.spec_from_file_location('pack_xiaotian', ROOT / 'scripts/pack-xiaotian.py')
packer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packer)


def inspect_mattes(character_id):
    """生成验收联系图；仅缩略诊断预览，不缩小送入模型的源图。"""
    for action in packer.TIMINGS:
        folder = REVIEW / 'matting' / character_id / action
        report = json.loads((folder / 'matted_qa.json').read_text(encoding='utf-8'))
        assert report['source_size'] == [1536, 1024]
        assert report['transparent_rgb_nonzero'] == 0
        assert report['unique_alpha_values'] > 2
        names = ['birefnet_probability', 'trimap', 'vitmatte_alpha', 'matted',
                 'matted_preview_white', 'matted_preview_black', 'matted_preview_board']
        contact = Image.new('RGB', (1536, 816), '#dddddd')
        draw = ImageDraw.Draw(contact)
        for index, name in enumerate(names):
            image = Image.open(folder / (name + '.png'))
            if name in ('birefnet_probability', 'vitmatte_alpha'):
                image = Image.fromarray((np.asarray(image) / 257).astype(np.uint8))
            image.thumbnail((512, 248))
            left, top = index % 3 * 512, index // 3 * 272
            draw.text((left + 8, top + 3), name, fill='black')
            if image.mode == 'RGBA':
                contact.paste(image, (left, top + 24), image.getchannel('A'))
            else:
                contact.paste(image.convert('RGB'), (left, top + 24))
        contact.save(REVIEW / f'{character_id}-{action}-matte-review.png')


def inspect_single_mattes(character_id):
    """逐帧展示所有诊断阶段；保留整表失败结果作对照，不修改模型 Alpha。"""
    names = ['birefnet_probability', 'trimap', 'vitmatte_alpha', 'matted',
             'matted_preview_white', 'matted_preview_black', 'matted_preview_board']
    for action in packer.TIMINGS:
        contact = Image.new('RGB', (1280, 1960), '#dddddd')
        draw = ImageDraw.Draw(contact)
        for index in range(5):
            folder = REVIEW / 'matting' / character_id / action / 'single' / f'frame-{index+1}'
            report = json.loads((folder / 'matted_qa.json').read_text(encoding='utf-8'))
            assert report['source_size'] == [512, 512]
            assert report['transparent_rgb_nonzero'] == 0 and report['unique_alpha_values'] > 2
            for row, name in enumerate(names):
                image = Image.open(folder / (name + '.png'))
                if name in ('birefnet_probability', 'vitmatte_alpha'):
                    image = Image.fromarray((np.asarray(image) / 257).astype(np.uint8))
                image.thumbnail((256, 256))
                left, top = index * 256, row * 280
                draw.text((left+4, top+3), f'{index+1}: {name}', fill='black')
                if image.mode == 'RGBA':
                    contact.paste(image, (left, top+24), image.getchannel('A'))
                else:
                    contact.paste(image.convert('RGB'), (left, top+24))
        contact.save(REVIEW / f'{character_id}-{action}-single-review.png')


def pack(character_id):
    """所有动作共用待机首帧推导的缩放比例，沿用 416×480/脚底 208,440。"""
    def read_frames(action):
        frames = []
        for index in range(5):
            path = REVIEW / 'matting' / character_id / action / 'single' / f'frame-{index+1}' / 'matted.png'
            source = Image.open(path)
            if source.mode != 'RGBA' or source.size != (512, 512):
                raise ValueError(f'独立帧模式或尺寸错误：{path}')
            frames.append(source)
        return frames
    packer.ART = ROOT / 'games/jiuyue/art' / character_id
    packer.REVIEW = REVIEW / character_id
    packer.REVIEW.mkdir(parents=True, exist_ok=True)
    # 九月参照图保持原字节；公共打包器据其可见高度确定角色统一比例。
    reference = ROOT / 'output/xiaotian-review/jiuyue-idle-reference.png'
    (packer.REVIEW / reference.name).write_bytes(reference.read_bytes())
    packer.read_frames = read_frames
    packer.main()


if __name__ == '__main__':
    import sys
    actions = {'inspect': inspect_mattes, 'inspect-single': inspect_single_mattes, 'pack': pack}
    if len(sys.argv) != 2 or sys.argv[1] not in actions:
        raise ValueError('请指定 inspect、inspect-single 或 pack，不自动选择制作阶段')
    for character_id in ('xiaoyu', 'aolie'):
        actions[sys.argv[1]](character_id)
