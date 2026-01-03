#!/usr/bin/env python
from PIL import Image, ImageDraw
import os, zipfile

out_dir = "../icons"
os.makedirs(out_dir, exist_ok=True)

def make_icon(size):
    img = Image.new("RGBA", (size, size), (0,0,0,0))
    d = ImageDraw.Draw(img)

    s = size
    pad = max(1, round(s*0.08))
    r = max(1, round(s*0.18))
    stroke = max(1, round(s*0.07))
    inset = pad + stroke//2

    x0, y0 = inset, inset
    x1, y1 = s - inset, s - inset
    fold = max(2, round(s*0.22))

    fill = (245,245,245,255)
    outline = (40,40,40,255)

    d.rounded_rectangle([x0,y0,x1,y1], radius=r, fill=fill, outline=outline, width=stroke)

    fx0, fy0 = x1 - fold, y0
    fx1, fy1 = x1, y0 + fold
    d.polygon([(fx0, fy0), (fx1, fy0), (fx1, fy1)], fill=(230,230,230,255), outline=outline)
    d.line([(fx0, fy0), (fx1, fy1)], fill=outline, width=max(1, stroke//2))

    bx0 = x0 + max(2, round(s*0.20))
    bx1 = x1 - max(2, round(s*0.20))
    by0 = y0 + max(2, round(s*0.28))
    by1 = y1 - max(2, round(s*0.22))

    midy = (by0 + by1)/2
    brace_w = max(2, round(s*0.12))
    brace_gap = max(1, round(s*0.06))
    brace_stroke = max(1, round(s*0.08))

    lx = bx0
    d.line([
        (lx + brace_w, by0),
        (lx, by0),
        (lx, midy - brace_gap),
        (lx + brace_w*0.55, midy),
        (lx, midy + brace_gap),
        (lx, by1),
        (lx + brace_w, by1),
    ], fill=outline, width=brace_stroke, joint="curve")

    rx = bx1
    d.line([
        (rx - brace_w, by0),
        (rx, by0),
        (rx, midy - brace_gap),
        (rx - brace_w*0.55, midy),
        (rx, midy + brace_gap),
        (rx, by1),
        (rx - brace_w, by1),
    ], fill=outline, width=brace_stroke, joint="curve")

    crack_stroke = max(1, round(s*0.07))
    cx = (x0 + x1)/2
    crack = [
        (cx, by0 - round(s*0.06)),
        (cx - round(s*0.05), midy - round(s*0.02)),
        (cx + round(s*0.04), midy + round(s*0.01)),
        (cx - round(s*0.03), by1 + round(s*0.05)),
    ]
    d.line(crack, fill=(220,60,60,255), width=crack_stroke)
    d.line([(p[0]+1, p[1]+1) for p in crack], fill=(0,0,0,80), width=max(1, crack_stroke//2))

    return img

sizes = [16, 32, 48, 96]
paths = []

for size in sizes:
    img = make_icon(size)
    path = os.path.join(out_dir, f"icon-{size}.png")
    img.save(path, format="PNG", optimize=True)
    paths.append(path)

# zip_path = "../icons/.icons.zip"
# with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as z:
#     for p in paths:
#         z.write(p, arcname=os.path.basename(p))

# paths, zip_path
paths
