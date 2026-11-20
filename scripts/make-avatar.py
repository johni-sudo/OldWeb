from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import math
out = Path(r"C:\Users\johni\OneDrive\Рабочий стол\сайт OldWeb\public\assets\images\avatar-fallback.jpg")
S=512
im=Image.new('RGB',(S,S),'#d7ebf5')
px=im.load()
for y in range(S):
    for x in range(S):
        t=(x+y)/(2*S)
        c1=(215,235,245); c2=(156,224,216)
        px[x,y]=tuple(int(c1[i]+(c2[i]-c1[i])*t) for i in range(3))
d=ImageDraw.Draw(im,'RGBA')
# soft wave layers
for i,(base,amp,alpha,col) in enumerate([(320,32,55,(255,255,255)),(365,26,40,(125,200,235)),(410,18,40,(94,168,206))]):
    pts=[]
    for x in range(-10,S+20,10):
        yy=base+math.sin(x/52+i*1.2)*amp
        pts.append((x,yy))
    pts += [(S,S),(-10,S)]
    d.polygon(pts,fill=(*col,alpha))
# glass circle
d.ellipse((74,54,438,418), fill=(255,255,255,38), outline=(255,255,255,120), width=2)
# person silhouette
d.ellipse((196,132,316,252), fill=(255,255,255,188))
d.rounded_rectangle((154,274,358,476), radius=100, fill=(255,255,255,188))
# highlight
gl=Image.new('RGBA',(S,S),(0,0,0,0)); gd=ImageDraw.Draw(gl)
gd.ellipse((80,58,230,190),fill=(255,255,255,60)); gl=gl.filter(ImageFilter.GaussianBlur(22)); im=Image.alpha_composite(im.convert('RGBA'),gl).convert('RGB')
im.save(out,quality=90,optimize=True)
print(out.stat().st_size)
