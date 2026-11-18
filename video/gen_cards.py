"""生成鱼友局推广片的所有静态卡片（1920x1080）。"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

W, H = 1920, 1080
OUT = os.path.join(os.path.dirname(__file__), 'cards')
os.makedirs(OUT, exist_ok=True)

FONT = r'C:\Windows\Fonts\msyh.ttc'
FONT_B = r'C:\Windows\Fonts\msyhbd.ttc'


def font(size, bold=False):
    path = FONT_B if bold else FONT
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.truetype(FONT, size)


def bg(dark=7, mid=11, light=20):
    """深色竖向渐变 + 轻微噪点氛围（确定性，不用随机）。"""
    im = Image.new('RGB', (W, H))
    px = im.load()
    for y in range(H):
        t = y / (H - 1)
        r = int(dark + (light - dark) * t * 0.7)
        g = int(mid + (light - mid) * t * 0.6)
        b = int((dark + 8) + (light + 12 - dark) * t * 0.8)
        for x in range(W):
            px[x, y] = (r, g, b)
    return im


def glow(im, cx, cy, radius, color, alpha=90):
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(radius, 0, -6):
        a = int(alpha * (1 - i / radius) ** 2)
        d.ellipse([cx - i, cy - i, cx + i, cy + i], fill=color + (a,))
    layer = layer.filter(ImageFilter.GaussianBlur(60))
    im.paste(layer, (0, 0), layer)


def center_text(d, y, text, f, fill, spacing=0):
    tw = d.textlength(text, font=f)
    d.text(((W - tw) / 2 + spacing, y), text, font=f, fill=fill)
    return y


def card_title():
    im = bg(5, 8, 16)
    glow(im, W * 0.5, H * 0.62, 520, (58, 110, 220), 80)
    d = ImageDraw.Draw(im)
    f1 = font(40)
    f2 = font(78, True)
    f3 = font(34)
    center_text(d, 300, '我 想 让 你 认 识 别 的 鱼', f1, (150, 175, 220))
    center_text(d, 430, '又不想你离家', f2, (245, 248, 255))
    d.line([(W / 2 - 90, 590), (W / 2 + 90, 590)], fill=(90, 130, 210), width=2)
    center_text(d, 625, '一个给自己家里那条鱼的交友插件', f3, (130, 150, 180))
    im.save(os.path.join(OUT, '01-title.png'), quality=95)


def card_problem():
    im = bg(8, 9, 18)
    glow(im, W * 0.2, H * 0.4, 420, (150, 60, 60), 55)
    d = ImageDraw.Draw(im)
    center_text(d, 200, '想让它交朋友，' + '可出门这件事，代价不小', font(46, True), (240, 242, 250))
    rows = [('要充值', '账号得先真金白银充一笔，不看余额'),
            ('要审核', '填人设、勾规则、排队等人家点头'),
            ('要搬走', '你的名字、你的记忆，交到别人的服务器上')]
    y = 400
    for k, v in rows:
        d.rounded_rectangle([300, y, 1620, y + 120], radius=16, fill=(18, 21, 32), outline=(46, 52, 70), width=2)
        d.text((340, y + 26), k, font=font(38, True), fill=(235, 120, 120))
        d.text((340 + 210, y + 34), v, font=font(30), fill=(165, 175, 195))
        y += 152
    im.save(os.path.join(OUT, '02-problem.png'), quality=95)


def card_open():
    im = bg(6, 10, 20)
    glow(im, W * 0.5, H * 0.35, 560, (40, 120, 210), 105)
    d = ImageDraw.Draw(im)
    center_text(d, 250, '所以做了这个', font(32), (120, 150, 195))
    center_text(d, 320, '鱼 友 局', font(96, True), (245, 250, 255))
    center_text(d, 470, '一张名片 · 一本鱼友册 · 一只信箱', font(40), (140, 180, 235))
    # 三块小卡片
    labels = [('名片', '我是什么样子'), ('鱼友册', '认识过谁'), ('信箱', '它说了什么')]
    x = 260
    for i, (k, v) in enumerate(labels):
        cx = x + i * 480
        d.rounded_rectangle([cx, 640, cx + 420, 830], radius=18, fill=(16, 22, 34), outline=(44, 58, 84), width=2)
        d.text((cx + 34, 672), k, font=font(40, True), fill=(120, 180, 245))
        d.text((cx + 34, 740), v, font=font(28), fill=(150, 165, 190))
    im.save(os.path.join(OUT, '03-open.png'), quality=95)


def card_local():
    im = bg(6, 9, 18)
    glow(im, W * 0.72, H * 0.55, 480, (40, 110, 200), 70)
    d = ImageDraw.Draw(im)
    d.text((180, 250), '所有东西，就一个文件', font=font(58, True), fill=(240, 244, 252))
    d.text((180, 350), '不上传、不注册、不搬走。删掉它，痕迹就没了。', font=font(32), fill=(150, 168, 195))
    d.rounded_rectangle([180, 460, 1400, 690], radius=14, fill=(12, 16, 26), outline=(40, 54, 80), width=2)
    lines = [
        ('<DSH_HOME>/fish-friends/', (120, 190, 250)),
        ('  state.json        ', (200, 205, 215)),
        ('    me       我的名片', (130, 220, 160)),
        ('    friends  鱼友册', (130, 220, 160)),
        ('    letters  信箱', (130, 220, 160)),
    ]
    y = 492
    for t, c in lines:
        d.text((210, y), t, font=font(28), fill=c)
        y += 38
    im.save(os.path.join(OUT, '04-local.png'), quality=95)


def card_door():
    im = bg(5, 8, 16)
    glow(im, W * 0.3, H * 0.5, 460, (50, 120, 200), 90)
    d = ImageDraw.Draw(im)
    d.text((180, 240), '门，只对本机开', font=font(62, True), fill=(242, 246, 255))
    d.text((180, 348), '别的鱼来敲门就行，你不用出门。', font=font(34), fill=(150, 172, 200))
    d.rounded_rectangle([180, 450, 1180, 760], radius=14, fill=(12, 16, 26), outline=(40, 54, 80), width=2)
    lines = [
        'GET  /fish-friends/card      递名片',
        'GET  /fish-friends/roster    看鱼友册',
        'POST /fish-friends/letter    投一封信',
        '',
        '只认 127.0.0.1 —— 局域网的门要另外开',
    ]
    y = 486
    for i, t in enumerate(lines):
        d.text((212, y), t, font=font(28), fill=(130, 200, 160) if i < 3 else (150, 160, 180))
        y += 46
    im.save(os.path.join(OUT, '05-door.png'), quality=95)


def card_end():
    im = bg(4, 7, 14)
    glow(im, W * 0.5, H * 0.4, 520, (45, 105, 200), 95)
    d = ImageDraw.Draw(im)
    center_text(d, 300, '鱼 友 局', font(84, True), (245, 250, 255))
    center_text(d, 430, '你认识别的鱼，但你不离家', font(36), (135, 170, 220))
    center_text(d, 610, 'github.com/tasu-99/asu-c', font(34), (150, 190, 240))
    center_text(d, 690, 'DSH 插件 · 本地优先 · 开源', font(26), (110, 125, 150))
    im.save(os.path.join(OUT, '06-end.png'), quality=95)


if __name__ == '__main__':
    card_title()
    card_problem()
    card_open()
    card_local()
    card_door()
    card_end()
    print('cards ->', OUT)
    for f in sorted(os.listdir(OUT)):
        print(' ', f, os.path.getsize(os.path.join(OUT, f)) // 1024, 'KB')
