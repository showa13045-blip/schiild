"""Synthetic evaluation inputs only; never displayed as generated user works in the app."""
import argparse,json,subprocess,uuid,hashlib,time
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--gen',required=True);parser.add_argument('--palette',required=True);parser.add_argument('--out',required=True)
    args=parser.parse_args();out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=False)
    inputs=out/'input';inputs.mkdir(); yy,xx=np.mgrid[:1080,:1080]
    bases=[(170,65,45),(60,145,85),(55,95,170),(175,140,50),(50,145,150),(165,80,145),(115,115,115),(120,85,60)]
    texture=xx/1079*40+yy/1079*30-35+((xx//80+yy//80)%2)*24-12
    for k in range(8):
        rgb=np.stack([np.clip(base+texture,0,255) for base in bases[k]],axis=-1).astype('uint8')
        Image.fromarray(rgb).save(inputs/f'{k}.jpg',quality=85)
    timings=[]
    def run(label,capacity,fill,extra=()):
        count=int(capacity*fill+.5)
        entries=[dict(user_id=str(uuid.UUID(int=n+1)),slot_index=n,image=f'{n%8}.jpg') for n in range(count)]
        (inputs/'manifest.json').write_text(json.dumps(entries),encoding='utf-8')
        target=out/label
        command=[args.gen,'--atelier-id',str(uuid.UUID(int=1)),'--date','2026-09-08','--capacity',str(capacity),'--input-dir',str(inputs),'--palette',args.palette,'--out',str(target),*extra]
        result=subprocess.run(command,check=True,capture_output=True,text=True)
        stats=json.loads(result.stdout);stats.update(label=label,capacity=capacity,fill_rate=fill);timings.append(stats)
        print(label,round(stats['total_ms'],1),'ms',flush=True)
        return target/'thumbnail.png'
    def sheet(cells,cols,filename):
        image=Image.new('RGB',(cols*256,((len(cells)+cols-1)//cols)*284),'white');draw=ImageDraw.Draw(image)
        for index,(label,path) in enumerate(cells):
            x=index%cols*256;y=index//cols*284;image.paste(Image.open(path),(x,y));draw.text((x+6,y+260),label,fill='black')
        image.save(out/filename)
    cells=[]
    for capacity in [1,3,7,12,50,200,500,2000]:
        for fill in [.25,.5,.75,1.0]:
            label=f'n{capacity}-fill{fill:g}';cells.append((label,run(label,capacity,fill)))
    sheet(cells,4,'participation.png')
    sheet([(f'gutter {g}',run(f'gutter-{g}',12,.75,['--gutter',str(g)])) for g in range(4)],4,'gutters.png')
    cells=[]
    for resolution in [96,128]:
        for dither in [0,.6,1]:
            for posterize in [4,8]:
                label=f'r{resolution}-d{dither}-p{posterize}';cells.append((label,run(label,12,.75,['--resolution',str(resolution),'--dither',str(dither),'--posterize',str(posterize)])))
    sheet(cells,6,'parameters.png')
    (out/'timings.json').write_text(json.dumps(timings,indent=2),encoding='utf-8')
if __name__=='__main__': main()
