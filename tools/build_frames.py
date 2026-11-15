"""把 Q 版三张图转成 mod 用的素材：终端半块字符帧 + 其他端的 SVG 像素画。
用法：python3 build_frames.py <Q版目录> <输出 frames.ts> [预览图.png]
"""
import base64
import struct
import sys
from collections import Counter, deque

from PIL import Image

src, out_ts = sys.argv[1], sys.argv[2]
preview = sys.argv[3] if len(sys.argv) > 3 else None
NAMES = ["idle", "working", "done"]
COLS, ROWS = 36, 16          # 终端字符格；每格上下两个像素
PW, PH = COLS, ROWS * 2
DEFAULT = 0x01000000         # 终端默认色
PALETTE = 24
SVG_PX, SVG_COLORS = 96, 32


def load(name):
    im = Image.open(f"{src}/{name}.png").convert("RGBA")
    im.putalpha(im.getchannel("A").point(lambda v: 255 if v > 127 else 0))
    return im


ims = {n: load(n) for n in NAMES}
boxes = [im.getchannel("A").getbbox() for im in ims.values()]
x0, y0, x1 = min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes)
w = x1 - x0
box = (x0, y0, x1, y0 + round(w * PH / PW))   # 半身：从头顶往下取到胸口
crops = {n: im.crop(box) for n, im in ims.items()}

# 三张图共用一个调色板，状态切换时颜色不跳
strip = Image.new("RGB", (w * 3, box[3] - box[1]), (255, 0, 255))
for i, n in enumerate(NAMES):
    strip.paste(crops[n].convert("RGB"), (i * w, 0), crops[n].getchannel("A"))
pal_img = strip.quantize(PALETTE + 1, method=Image.MEDIANCUT, kmeans=3, dither=Image.NONE)
pal = pal_img.getpalette()[: (PALETTE + 1) * 3]


def grid(name):
    """每个像素块取出现最多的调色板色，平涂不发灰。"""
    c = crops[name]
    idx = c.convert("RGB").quantize(palette=pal_img, dither=Image.NONE).load()
    alpha = c.getchannel("A").load()
    ch = c.size[1]
    out = []
    for py in range(PH):
        row = []
        ys = range(py * ch // PH, (py + 1) * ch // PH)
        for px in range(PW):
            xs = range(px * w // PW, (px + 1) * w // PW)
            seen = Counter(idx[x, y] for y in ys for x in xs if alpha[x, y])
            total = len(xs) * len(ys)
            if sum(seen.values()) * 2 < total:
                row.append(None)
            else:
                i = seen.most_common(1)[0][0]
                row.append((pal[i * 3] << 16) | (pal[i * 3 + 1] << 8) | pal[i * 3 + 2])
        out.append(row)
    return out


def face_box(g):
    """找到脸部区域：用皮肤色（亮色里偏粉的那批）的包围盒。
    眼睛和嘴在脸里，比脸小一圈；噪点基本在头发和轮廓外边。"""
    SKIN = [t for t, n in Counter(c for row in g for c in row if c is not None).most_common(6)
            if (t >> 16 & 255) > 200 and (t >> 8 & 255) > 150 and (t & 255) > 130]
    if not SKIN:
        return None
    pts = [(x, y) for y in range(PH) for x in range(PW) if g[y][x] in SKIN]
    if not pts:
        return None
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return (min(xs), min(ys), max(xs), max(ys))


def despeckle(g, max_dark=6, protect_face=True):
    """降采样后描边会碎成 1-6 像素的深色孤点，像脸上长了黑痣。
    把这种小块整块换成邻近的亮色；眼睛、睫毛是大块，不受影响。

    但 done 是闭眼笑，眼睛只有一道细线，碎成小点后会被当成噪点删掉，
    变成一张没有五官的脸。所以脸范围里的小深色块当五官保留，只清脸外的。"""
    H, W = PH, PW

    def lum(v):
        return 0.299 * (v >> 16 & 255) + 0.587 * (v >> 8 & 255) + 0.114 * (v & 255)

    face = face_box(g) if protect_face else None
    dark = {(x, y) for y in range(H) for x in range(W) if g[y][x] is not None and lum(g[y][x]) < 70}
    seen = set()
    comps = []
    for p in dark:
        if p in seen:
            continue
        q = deque([p])
        seen.add(p)
        comp = [p]
        while q:
            x, y = q.popleft()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if not (dx or dy):
                        continue
                    nb = (x + dx, y + dy)
                    if nb in dark and nb not in seen:
                        seen.add(nb)
                        q.append(nb)
                        comp.append(nb)
        comps.append(comp)

    out = [row[:] for row in g]
    for comp in comps:
        if len(comp) > max_dark:
            continue
        if face is not None:
            fx0, fy0, fx1, fy1 = face
            inside = sum(1 for (x, y) in comp if fx0 <= x <= fx1 and fy0 <= y <= fy1)
            if inside * 2 > len(comp):
                continue
        for (x, y) in comp:
            near = Counter(
                g[yy][xx]
                for yy in range(max(0, y - 1), min(H, y + 2))
                for xx in range(max(0, x - 1), min(W, x + 2))
                if g[yy][xx] is not None and lum(g[yy][xx]) >= 70
            )
            if near:
                out[y][x] = near.most_common(1)[0][0]
    return out




def cells(g):
    buf = bytearray()
    for r in range(ROWS):
        for c in range(COLS):
            top, bot = g[2 * r][c], g[2 * r + 1][c]
            if top is None and bot is None:
                cell = (0x20, DEFAULT, DEFAULT)
            elif top is None:
                cell = (0x2584, bot, DEFAULT)      # ▄ 只画下半
            elif bot is None:
                cell = (0x2580, top, DEFAULT)      # ▀ 只画上半
            else:
                cell = (0x2580, top, bot)
            buf += struct.pack("<3I", *cell)
    return base64.b64encode(bytes(buf)).decode()


# 桌面、VSCode、手机端：全身图降到 SVG_PX 见方的像素画，每种颜色一条 <path>。
# 不用内嵌 PNG：VSCode 里 <image href="data:..."> 不显示，只剩 alt 文字（2026-11-14 实测）。
fb = [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]
side = max(fb[2] - fb[0], fb[3] - fb[1])
fx, fy = (fb[0] + fb[2] - side) // 2, (fb[1] + fb[3] - side) // 2
smalls = {
    n: im.crop((fx, fy, fx + side, fy + side)).convert("RGBa").resize((SVG_PX, SVG_PX), Image.LANCZOS).convert("RGBA")
    for n, im in ims.items()
}
sstrip = Image.new("RGB", (SVG_PX * 3, SVG_PX), (255, 0, 255))
for i, n in enumerate(NAMES):
    sstrip.paste(smalls[n].convert("RGB"), (i * SVG_PX, 0), smalls[n].getchannel("A").point(lambda v: 255 if v > 127 else 0))
spal_img = sstrip.quantize(SVG_COLORS + 1, method=Image.MEDIANCUT, kmeans=3, dither=Image.NONE)
spal = spal_img.getpalette()[: (SVG_COLORS + 1) * 3]


def svg_body(name):
    im = smalls[name]
    idx = im.convert("RGB").quantize(palette=spal_img, dither=Image.NONE).load()
    alpha = im.getchannel("A").load()
    runs = {}
    for y in range(SVG_PX):
        x = 0
        while x < SVG_PX:
            if alpha[x, y] <= 127:
                x += 1
                continue
            c, x0 = idx[x, y], x
            while x < SVG_PX and alpha[x, y] > 127 and idx[x, y] == c:
                x += 1
            runs.setdefault(c, []).append(f"M{x0} {y}h{x - x0}v1h-{x - x0}z")
    return "".join(
        f'<path fill="#{spal[c * 3]:02x}{spal[c * 3 + 1]:02x}{spal[c * 3 + 2]:02x}" d="{"".join(d)}"/>'
        for c, d in sorted(runs.items())
    )


grids = {n: despeckle(grid(n)) for n in NAMES}
term = {n: cells(g) for n, g in grids.items()}
svgs = {n: svg_body(n) for n in NAMES}


def table(d):
    return "{\n" + "".join(f"  {n}: '{v}',\n" for n, v in d.items()) + "}"


with open(out_ts, "w") as f:
    f.write("// 由 tools/build_frames.py 生成，不要手改。\n")
    f.write("export type PetState = 'idle' | 'working' | 'done'\n\n")
    f.write(f"// 终端 Raster 的 cells：{COLS} 列 x {ROWS} 行，每格 [码点, 前景, 背景] 三个小端 u32\n")
    f.write(f"export const TERM = {{ columns: {COLS}, rows: {ROWS} }} as const\n")
    f.write(f"export const TERM_CELLS: Record<PetState, string> = {table(term)}\n\n")
    f.write(f"// 桌面、VSCode、手机端用：{SVG_PX} 见方像素画的 <path> 串，外面套一层 <svg viewBox>\n")
    f.write(f"export const SVG_PX = {SVG_PX}\n")
    f.write(f"export const SVG_BODY: Record<PetState, string> = {table(svgs)}\n")

for n in NAMES:
    used = {c for row in grids[n] for c in row if c is not None}
    print(n, "终端 cells", len(term[n]), "字符，用色", len(used), "| SVG path", len(svgs[n]), "字符")

if preview:
    K = 10
    sheet = Image.new("RGB", (3 * (PW * K + 20) + 20, PH * K + 40), (30, 30, 30))
    for i, n in enumerate(NAMES):
        im = Image.new("RGB", (PW, PH), (30, 30, 30))
        px = im.load()
        for y, row in enumerate(grids[n]):
            for x, c in enumerate(row):
                if c is not None:
                    px[x, y] = (c >> 16, (c >> 8) & 255, c & 255)
        sheet.paste(im.resize((PW * K, PH * K), Image.NEAREST), (20 + i * (PW * K + 20), 20))
    sheet.save(preview)
