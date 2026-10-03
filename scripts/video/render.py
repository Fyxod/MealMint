#!/usr/bin/env python3
"""Render an edited walkthrough from actual, secret-free hosted UI captures.
Requires Pillow and ffmpeg. Captures/output belong in ignored .local/hosting.
"""
import argparse, json, math, subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
W, H, FPS = 1920, 1080, 30
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def font(n, bold=False): return ImageFont.truetype(BOLD if bold else FONT, n)
def ease(x):
    x=max(0,min(1,x)); return x*x*(3-2*x)
def text(draw, xy, s, size, color='#243a29', bold=False, center=False):
    f=font(size,bold)
    if center: xy=(xy[0]-draw.textlength(s,font=f)/2,xy[1])
    draw.text(xy,s,font=f,fill=color)
def background():
    im=Image.new('RGB',(W,H)); d=ImageDraw.Draw(im)
    for y in range(H):
        a=y/H; d.line((0,y,W,y),fill=(int(245-13*a),int(246-10*a),int(237-15*a)))
    return im
BG=background()
X,Y,BW,BH=150,162,1620,864
CH=48
MASK=Image.new('L',(BW,BH)); ImageDraw.Draw(MASK).rounded_rectangle((0,0,BW-1,BH-1),radius=22,fill=255)
shadow=Image.new('RGBA',(W,H)); ImageDraw.Draw(shadow).rounded_rectangle((X,Y+20,X+BW,Y+BH+20),radius=28,fill=(31,54,34,60)); shadow=shadow.filter(ImageFilter.GaussianBlur(28))
BASE=BG.convert('RGBA'); BASE.alpha_composite(shadow); BASE=BASE.convert('RGB')

def browser(src,z,focus):
    vw,vh=BW,BH-CH
    cw=src.width/z; ch=src.height/z
    cx=max(cw/2,min(src.width-cw/2,focus[0]*src.width))
    cy=max(ch/2,min(src.height-ch/2,focus[1]*src.height))
    view=src.transform((vw,vh),Image.Transform.EXTENT,(cx-cw/2,cy-ch/2,cx+cw/2,cy+ch/2),Image.Resampling.BICUBIC)
    out=Image.new('RGB',(BW,BH),'#f9faf6'); out.paste(view,(0,CH))
    d=ImageDraw.Draw(out)
    for xx,c in [(26,'#f2766b'),(49,'#efbf50'),(72,'#62bf77')]: d.ellipse((xx,18,xx+12,30),fill=c)
    d.rounded_rectangle((475,9,1145,38),radius=9,fill='#eef0e9')
    text(d,(810,13),'mealmint.parthkatiyar.xyz',16,'#5c6d5c',center=True)
    return out,(cx-cw/2,cy-ch/2,cw,ch)

def pointer(im,px,py,click=None):
    layer=Image.new('RGBA',im.size); d=ImageDraw.Draw(layer)
    if click is not None:
        r=12+click*42; alpha=int(150*(1-click))
        d.ellipse((px-r,py-r,px+r,py+r),outline=(237,138,67,alpha),width=4)
    pts=[(0,0),(0,40),(10,30),(18,47),(25,43),(17,27),(32,27)]
    poly=[(px+a,py+b) for a,b in pts]
    sh=Image.new('RGBA',im.size); ImageDraw.Draw(sh).polygon([(a+3,b+4) for a,b in poly],fill=(0,0,0,80)); sh=sh.filter(ImageFilter.GaussianBlur(3)); layer.alpha_composite(sh)
    d=ImageDraw.Draw(layer); d.polygon(poly,fill='white',outline='#233529',width=3)
    im.alpha_composite(layer)

def frame(t,scenes,captures):
    im=BASE.copy().convert('RGBA'); d=ImageDraw.Draw(im)
    if t<4 or t>=51:
        im=BG.convert('RGBA'); d=ImageDraw.Draw(im)
        intro=t<4; p=ease(t/1.2) if intro else ease((t-51)/1.1)
        off=int((1-p)*32)
        d.rounded_rectangle((896,230+off,1024,358+off),radius=34,fill='#315f3b')
        text(d,(960,257+off),'M',64,'#ffffff',True,True)
        text(d,(960,395+off),'MealMint',72,bold=True,center=True)
        text(d,(960,506+off),'Good food. A smaller bill.',52,center=True)
        if intro:
            text(d,(960,620),'A personal food assistant, powered by Codex',28,'#5b705c',center=True)
        else:
            text(d,(960,620),'mealmint.parthkatiyar.xyz/demo/',30,'#315f3b',center=True)
            text(d,(960,677),'Web chat  •  Telegram adapter',24,'#5b705c',center=True)
            text(d,(960,760),'github.com/Fyxod/MealMint',23,'#5b705c',center=True)
        text(d,(960,985),'Prototype • Synthetic Swiggy data • No orders or payments',22,'#687663',center=True)
        return im.convert('RGB')
    scene=next(s for s in scenes if s['start']<=t<s['end'])
    dt=t-scene['start']; dur=scene['end']-scene['start']
    z=1+(scene.get('zoom',1)-1)*ease(min(dt/1.4,(dur-dt)/0.7))
    win, crop=browser(captures[scene['file']],z,scene.get('focus',[.5,.5]))
    im.paste(win,(X,Y),MASK); d=ImageDraw.Draw(im)
    text(d,(150,36),scene['caption'],43,bold=True)
    text(d,(152,102),scene.get('sub',''),23,'#5b705c')
    text(d,(150,1040),'SYNTHETIC SWIGGY DATA',17,'#65725c',True)
    text(d,(1145,1040),'Edited hosted walkthrough · waits condensed',17,'#65725c')
    d.rounded_rectangle((150,145,1770,149),radius=2,fill='#dce3d5')
    d.rounded_rectangle((150,145,150+int(1620*(t-4)/47),149),radius=2,fill='#cf8b4b')
    route=scene.get('pointer',[])
    if route:
        prev=route[0]; nxt=route[-1]
        for a,b in zip(route,route[1:]):
            if a[0]<=dt<=b[0]: prev,nxt=a,b; break
            if dt>b[0]: prev=nxt=b
        p=ease((dt-prev[0])/max(.001,nxt[0]-prev[0]))
        sx=prev[1]+(nxt[1]-prev[1])*p; sy=prev[2]+(nxt[2]-prev[2])*p
        cx,cy,cw,ch=crop
        px=X+(sx-cx)/cw*BW; py=Y+CH+(sy-cy)/ch*(BH-CH)
        click=next(((dt-c)/.35 for c in scene.get('clicks',[]) if 0<=dt-c<.35),None)
        pointer(im,px,py,click)
    # A brief dip at each editorial cut makes condensed timing explicit.
    alpha=int(255*max(0,1-dt/.22))
    if alpha: im=Image.blend(im,BG.convert('RGBA'),alpha/255*.55)
    return im.convert('RGB')

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--captures',type=Path,default=ROOT/'.local/hosting/demo'); ap.add_argument('--output',type=Path,default=ROOT/'.local/hosting/video/mealmint-demo.mp4'); ap.add_argument('--preview',action='store_true'); ap.add_argument('--start',type=float,default=0); ap.add_argument('--duration',type=float,default=58); a=ap.parse_args()
    scenes=json.loads((Path(__file__).with_name('scenes.json')).read_text())
    captures={s['file']:Image.open(a.captures/s['file']).convert('RGB') for s in scenes}
    a.output.parent.mkdir(parents=True,exist_ok=True)
    if a.preview:
        thumbs=[]
        for t in [1,5,8,12,18,24,29,36,46,54]:
            im=frame(t,scenes,captures).resize((640,360)); ImageDraw.Draw(im).text((10,335),f'{t}s',font=font(18),fill='black'); thumbs.append(im)
        contact=Image.new('RGB',(1280,1800),'white')
        for i,im in enumerate(thumbs): contact.paste(im,((i%2)*640,(i//2)*360))
        contact.save(a.output.with_name('contact-sheet.jpg')); frame(36,scenes,captures).save(a.output.with_name('poster.jpg')); return
    cmd=['ffmpeg','-hide_banner','-loglevel','warning','-y','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}','-framerate',str(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(a.output)]
    proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    try:
        for i in range(round(a.duration*FPS)):
            proc.stdin.write(frame(a.start+i/FPS,scenes,captures).tobytes())
            if i%(10*FPS)==0: print(f'Rendered {i//FPS}/{a.duration:g} seconds',flush=True)
        proc.stdin.close()
        if proc.wait(): raise RuntimeError('ffmpeg failed')
    except BaseException:
        proc.kill(); raise
    frame(36,scenes,captures).save(a.output.with_name('poster.jpg'))
    print(a.output,flush=True)
if __name__=='__main__': main()
