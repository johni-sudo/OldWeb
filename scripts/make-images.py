from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
import math, random

root = Path(r"C:\Users\johni\OneDrive\Рабочий стол\сайт OldWeb")
src = Image.open(root / "logo-source.jpg").convert("RGB")
out = root / "public" / "assets" / "images"

# Square web variants
src.resize((512, 512), Image.Resampling.LANCZOS).save(out / "logo-512.jpg", quality=92, optimize=True)
src.resize((192, 192), Image.Resampling.LANCZOS).save(out / "logo-192.jpg", quality=90, optimize=True)

# Circular mark with transparent corners, sized so the C/W stays comfortably inside
size = 1024
canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
scale = 0.92
img = src.resize((int(size * scale), int(size * scale)), Image.Resampling.LANCZOS)
mask = Image.new("L", img.size, 0)
md = ImageDraw.Draw(mask)
md.ellipse((0, 0, img.size[0] - 1, img.size[1] - 1), fill=255)
# crisp anti-aliased edge
mask = mask.filter(ImageFilter.GaussianBlur(0.4))
x = y = (size - img.size[0]) // 2
canvas.paste(img, (x, y), mask)

# subtle inner border ring
ring = Image.new("RGBA", (size, size), (0, 0, 0, 0))
rd = ImageDraw.Draw(ring)
pad = 27
rd.ellipse((pad, pad, size-pad-1, size-pad-1), outline=(255, 255, 255, 150), width=4)
canvas.alpha_composite(ring)
canvas.save(out / "logo-mark.png", optimize=True)

# Favicons
for s in (32, 64):
    canvas.resize((s, s), Image.Resampling.LANCZOS).save(out / f"favicon-{s}.png", optimize=True)
canvas.resize((180, 180), Image.Resampling.LANCZOS).save(out / "apple-touch-icon.png", optimize=True)
canvas.resize((48, 48), Image.Resampling.LANCZOS).save(out / "favicon.ico", sizes=[(16,16),(32,32),(48,48)])

# Open Graph cover, original identity on a deep-ice gradient with layered waves
W, H = 1200, 630
og = Image.new("RGB", (W, H), "#d7ebf5")
px = og.load()
for yy in range(H):
    for xx in range(W):
        t = (xx / W) * 0.55 + (yy / H) * 0.45
        # blend ice blue -> sky -> mint
        if t < 0.5:
            k = t / 0.5
            c1 = (215, 235, 245); c2 = (125, 200, 235)
        else:
            k = (t - 0.5) / 0.5
            c1 = (125, 200, 235); c2 = (174, 232, 225)
        px[xx, yy] = tuple(int(c1[i] + (c2[i] - c1[i]) * k) for i in range(3))

# semi-transparent wave ribbons painted on overlay
overlay = Image.new("RGBA", (W, H), (0,0,0,0))
od = ImageDraw.Draw(overlay)
random.seed(7)
for i, (base, amp, alpha, col) in enumerate([
    (460, 60, 80, (255,255,255)),
    (510, 70, 65, (156,224,216)),
    (560, 55, 75, (94,168,206)),
    (600, 40, 95, (27,59,90)),
]):
    points = []
    for x in range(-20, W + 40, 20):
        y = base + math.sin(x / 180 + i * 1.1) * amp + math.sin(x / 73 + i) * 10
        points.append((x, y))
    points += [(W, H), (-20, H)]
    od.polygon(points, fill=(*col, alpha))
og = Image.alpha_composite(og.convert("RGBA"), overlay).convert("RGB")

# glass dark panel for typography
panel = Image.new("RGBA", (W, H), (0,0,0,0))
pd = ImageDraw.Draw(panel)
pd.rounded_rectangle((70, 96, 690, 534), radius=42, fill=(18,50,78,196), outline=(255,255,255,70), width=2)
og = Image.alpha_composite(og.convert("RGBA"), panel).convert("RGB")

mark = canvas.resize((380, 380), Image.Resampling.LANCZOS)
og_rgba = og.convert("RGBA")
og_rgba.alpha_composite(mark, (750, 125))
og = og_rgba.convert("RGB")
d = ImageDraw.Draw(og)
try:
    f_eyebrow = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 22)
    f_title = ImageFont.truetype(r"C:\Windows\Fonts\bahnschrift.ttf", 98)
    f_sub = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 29)
    f_tiny = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 18)
except Exception:
    f_eyebrow = f_title = f_sub = f_tiny = ImageFont.load_default()
d.text((112, 155), "ИГРОВОЕ СООБЩЕСТВО", font=f_eyebrow, fill=(198, 238, 247))
d.text((112, 205), "PROJECT", font=f_title, fill=(255,255,255), spacing=0)
d.rounded_rectangle((112, 330, 330, 334), radius=2, fill=(124, 207, 231))
d.text((112, 368), "Новая волна игровых проектов:", font=f_sub, fill=(215, 235, 245))
d.text((112, 408), "серверы, привилегии и сообщество.", font=f_sub, fill=(215, 235, 245))
d.text((112, 472), "PROJECT / ВРЕМЕННОЕ НАЗВАНИЕ", font=f_tiny, fill=(156, 224, 216))
og.save(out / "og-cover.jpg", quality=91, optimize=True)

# avatar fallback / placeholder tile used by UI
tile = Image.new("RGB", (512,512), "#d7ebf5")
td = ImageDraw.Draw(tile)
for r in range(300, 0, -10):
    td.ellipse((256-r, 256-r, 256+r, 256+r), fill=(215-int(r*0.2), 235-int(r*0.14), 245-int(r*0.1)))
tile.save(out / "avatar-fallback.jpg", quality=88, optimize=True)

for p in sorted(out.glob("*")):
    print(p.name, p.stat().st_size)
