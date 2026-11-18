"""生成录屏舞台背景、圆角遮罩和字幕条。"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os

W, H = 1920, 1080
OUT = os.path.join(os.path.dirname(__file__), 'stage')
os.makedirs(OUT, exist_ok=True)

WIN_W, WIN_H = 1258, 800
WIN_X = (W - WIN_W) // 2
WIN_Y = 58
RADIUS = 26

FONT = r'C:\Windows\Fonts\msyh.ttc'


def stage():
    im = Image.new('RGB', (W, H), (7, 10, 18))
    px = im.load()
    for y in range(H):
        t = y / (H - 1)
        base = int(7 + 10 * t)
        for x in range(W):
            px[x, y] = (base, base + 2, base + 8)
    # 光晕
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(620, 0, -8):
        a = int(34 * (1 - i / 620) ** 2)
        d.ellipse([W / 2 - i * 1.5, H / 2 - i, W / 2 + i * 1.5, H / 2 + i], fill=(46, 106, 200, a))
    layer = layer.filter(ImageFilter.GaussianBlur(80))
    im.paste(layer, (0, 0), layer)
    # 窗口投影
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ds = ImageDraw.Draw(sh)
    ds.rounded_rectangle([WIN_X - 6, WIN_Y + 12, WIN_X + WIN_W + 6, WIN_Y + WIN_H + 26], radius=RADIUS + 6, fill=(0, 0, 0, 190))
    sh = sh.filter(ImageFilter.GaussianBlur(34))
    im.paste(sh, (0, 0), sh)
    im.save(os.path.join(OUT, 'bg_window.png'))


def mask():
    m = Image.new('L', (WIN_W, WIN_H), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, WIN_W - 1, WIN_H - 1], radius=RADIUS, fill=255)
    m.convert('RGBA').save(os.path.join(OUT, 'mask.png'))


def caption(text, name, sub=None):
    """底部字幕条：半透明黑底 + 白字（透明 PNG）。"""
    h = 118 if not sub else 150
    im = Image.new('RGBA', (W, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(FONT, 42)
    fs = ImageFont.truetype(FONT, 26)
    tw = d.textlength(text, font=f)
    box_w = int(tw + 120)
    x0 = (W - box_w) // 2
    d.rounded_rectangle([x0, 25, x0 + box_w, h - 25], radius=16, fill=(6, 9, 16, 205))
    d.text(((W - tw) / 2, 42), text, font=f, fill=(240, 246, 255))
    if sub:
        ws = d.textlength(sub, font=fs)
        d.text(((W - ws) / 2, 96), sub, font=fs, fill=(150, 175, 205))
    im.save(os.path.join(OUT, name))


if __name__ == '__main__':
    stage()
    mask()
    caption('一个页面，三样东西', 'cap1.png', '名片 · 鱼友册 · 信箱')
    caption('写一封信，寄给册子上的鱼', 'cap2.png', '寄给谁 / 写点什么 / 寄出去')
    caption('信箱里躺着别人递进来的信', 'cap3.png')
    print('stage ok')
    for f in sorted(os.listdir(OUT)):
        print(' ', f)
