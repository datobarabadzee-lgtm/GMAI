"""Phone bezel overlay (1080x1920 PNG, transparent screen hole) used by assemble.py."""
import os
from PIL import Image, ImageDraw
OUT = os.path.join(os.path.dirname(__file__), '../../promo-out/build/bezel.png')
W, H = 1080, 1920; x, y, w, h = 190, 330, 700, 1517; b = 14
im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
d.rounded_rectangle((x - b, y - b, x + w + b, y + h + b), radius=72, fill=(11, 21, 32, 255))
d.rounded_rectangle((x - b + 1, y - b + 1, x + w + b - 1, y + h + b - 1), radius=71, outline=(255, 255, 255, 46), width=2)
m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).rounded_rectangle((x, y, x + w, y + h), radius=58, fill=255)
a = im.getchannel('A'); a.paste(0, mask=m); im.putalpha(a)
os.makedirs(os.path.dirname(OUT), exist_ok=True); im.save(OUT)
