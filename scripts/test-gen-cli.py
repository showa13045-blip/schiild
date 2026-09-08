"""End-to-end JPEG/CLI/revision contract tests. Requires Pillow and numpy."""
import argparse,importlib.util,json,subprocess,tempfile,uuid
from pathlib import Path
import numpy as np
from PIL import Image

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--gen',required=True);args=parser.parse_args()
    spec=importlib.util.spec_from_file_location('palette',Path(__file__).with_name('build-palette.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    palette=module.build();assert palette==module.build() and len(palette)==32 and len({tuple(c) for c in palette})==32
    assert palette[:6]==[[v]*3 for v in [0,51,102,153,204,255]]
    with tempfile.TemporaryDirectory() as temporary:
        root=Path(temporary);inputs=root/'input';inputs.mkdir();pal=root/'palette.json';pal.write_text(json.dumps(palette))
        yy,xx=np.mgrid[:1080,:1080]
        for n in range(3):Image.fromarray(np.stack(((xx+n*50)%256,yy%256,(xx//4+yy//4)%256),axis=-1).astype('uint8')).save(inputs/f'{n}.jpg',quality=85)
        entries=[dict(user_id=str(uuid.UUID(int=n+1)),slot_index=n,image=f'{n%2}.jpg') for n in range(3)]
        def run(capacity,name,items,extra=(),success=True):
            (inputs/'manifest.json').write_text(json.dumps(items));destination=root/name
            command=[args.gen,'--atelier-id',str(uuid.UUID(int=100)),'--date','2026-09-08','--capacity',str(capacity),'--input-dir',str(inputs),'--palette',str(pal),'--out',str(destination),*extra]
            result=subprocess.run(command,capture_output=True,text=True)
            assert (result.returncode==0)==success,(command,result.stderr)
            return destination
        for capacity in [12,2000]:
            first=run(capacity,f'first{capacity}',entries);second=run(capacity,f'second{capacity}',entries[::-1])
            for filename in ['schiild.png','thumbnail.png','region_map.json','metadata.json','state.json','used_seed.txt']:assert (first/filename).read_bytes()==(second/filename).read_bytes(),filename
            seed=(first/'used_seed.txt').read_text().strip();extra=['--frozen-seed',seed,'--previous',str(first)]
            revised=run(capacity,f'revised{capacity}',entries[1:],extra)
            before=np.asarray(Image.open(first/'schiild.png'));after=np.asarray(Image.open(revised/'schiild.png'))
            regions=json.loads((first/'region_map.json').read_text());rect=next(r['rect'] for r in regions if r['slot_index']==0)
            scale=8 if capacity==12 else 4;mask=np.ones((1024,1024),dtype=bool);mask[rect['y']*scale:(rect['y']+rect['h'])*scale,rect['x']*scale:(rect['x']+rect['w'])*scale]=False
            assert np.array_equal(before[mask],after[mask])
            if capacity>800:
                assert (first/'metadata.json').read_bytes()==(revised/'metadata.json').read_bytes()
                run(capacity,'missing-previous',entries[1:],['--frozen-seed',seed],success=False)
                run(capacity,'wrong-seed',entries[1:],['--frozen-seed','00'*32,'--previous',str(first)],success=False)
                replacement=[{**entries[0],'image':'2.jpg'},*entries[1:]]
                run(capacity,'replacement',replacement,extra,success=False)
        run(12,'duplicate',entries+[entries[0]],success=False)
        bad=[{**entries[0],'image_sha256':'00'*32}];run(12,'bad-hash',bad,success=False)
        Image.new('RGB',(100,100)).save(inputs/'bad.jpg');run(12,'bad-size',[{**entries[0],'image':'bad.jpg'}],success=False)
    print('CLI JPEG determinism, BSP/bucket removal, collision, frozen metadata, input validation and palette checks passed')
if __name__=='__main__':main()
