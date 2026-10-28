import subprocess, json
import os
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../promo-out'))
F=os.path.join(ROOT,'frames'); B=os.path.join(ROOT,'build')
def run(cmd):
    r=subprocess.run(cmd,capture_output=True,text=True)
    if r.returncode: print(r.stderr[-1500:]); raise SystemExit(1)
def dur(f): return float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f],capture_output=True,text=True).stdout)
cuts={'s1':('s1-clinical',[(5.9,9.9,1.0),(9.9,11.4,1.0),(22.0,24.4,1.0),(24.4,34.6,1.8)]),
      's2':('s2-prevention',[(5.3,20.0,1.6)]),
      's3':('s3-simulator',[(5.8,27.6,1.9)]),
      's4':('s4-pregnancy',[(4.5,24.4,1.8)]),
      's5':('s5-fertility',[(4.8,24.0,1.8)])}
segs=[]
for sid,(src,parts) in cuts.items():
    fc=[]; labels=[]
    for i,(a,b,sp) in enumerate(parts):
        fc.append(f"[0:v]trim={a}:{b},setpts=(PTS-STARTPTS)/{sp}[p{i}]"); labels.append(f"[p{i}]")
    fc.append(f"{''.join(labels)}concat=n={len(parts)}:v=1:a=0,fps=30,scale=700:1517[vid]")
    fc.append("[1:v][vid]overlay=190:330:shortest=1[t1]; [t1][2:v]overlay=0:0:shortest=1,format=yuv420p[out]")
    out=f'{B}/seg-{sid}.mp4'
    run(['ffmpeg','-y','-loglevel','error','-i',f'{F}/{src}.mp4','-loop','1','-i',f'{B}/bg-{sid}.png','-loop','1','-i',f'{B}/bezel.png','-filter_complex',';'.join(fc),'-map','[out]','-r','30','-c:v','libx264','-crf','18','-preset','veryfast',out])
    segs.append(out); print(sid, round(dur(out),2))
for name,d in (('intro',2.4),('outro',3.6)):
    out=f'{B}/seg-{name}.mp4'
    run(['ffmpeg','-y','-loglevel','error','-loop','1','-i',f'{B}/{name}.png','-vf',f"scale=1188:2112,zoompan=z='min(zoom+0.0009,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={int(d*30)}:s=1080x1920:fps=30,format=yuv420p",'-t',str(d),'-c:v','libx264','-crf','18',out])
    print(name, round(dur(out),2))
order=[f'{B}/seg-intro.mp4']+segs+[f'{B}/seg-outro.mp4']
X=0.4; inputs=[]; fc=[]; prev='[0:v]'; t=dur(order[0])
for f in order: inputs+=['-i',f]
for i in range(1,len(order)):
    off=t-X; lab=f'[x{i}]'
    fc.append(f"{prev}[{i}:v]xfade=transition=fade:duration={X}:offset={off:.3f}{lab}"); prev=lab; t=off+dur(order[i])
fc.append(f"{prev}fade=t=out:st={t-0.6:.3f}:d=0.6,format=yuv420p[v]")
out=os.path.join(ROOT,'gmai-promo.mp4')
run(['ffmpeg','-y','-loglevel','error',*inputs,'-filter_complex',';'.join(fc),'-map','[v]','-r','30','-c:v','libx264','-crf','19','-preset','slow','-profile:v','high','-pix_fmt','yuv420p','-movflags','+faststart',out])
print('FINAL', round(dur(out),2))
