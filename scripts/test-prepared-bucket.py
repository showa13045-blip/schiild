"""Prepared bucket transport, JPEG independence and rejection contracts."""
import argparse, hashlib, json, subprocess, tempfile, uuid
from pathlib import Path
import numpy as np
from PIL import Image

FILES = ['schiild.png', 'thumbnail.png', 'region_map.json', 'metadata.json', 'state.json', 'used_seed.txt']

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--gen', required=True)
    parser.add_argument('--performance', action='store_true')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        inputs = root / 'input'
        inputs.mkdir()
        yy, xx = np.mgrid[:1080, :1080]
        entries = []
        merged = {'schema': 'schiild-bucket-mean-v1', 'images': {}}
        def execute(command, success=True):
            result = subprocess.run([args.gen, *map(str, command)], capture_output=True, text=True)
            assert (result.returncode == 0) == success, (command, result.stderr)
            return json.loads(result.stdout) if success else None
        for n in range(3):
            path = inputs / f'{n}.jpg'
            Image.fromarray(np.stack(((xx+n*30)%256, yy%256, (xx//3+yy//7)%256), axis=-1).astype('uint8')).save(path, quality=85)
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            entries.append(dict(user_id=str(uuid.UUID(int=n+1)), slot_index=n, image=path.name, image_sha256=digest))
            execute(['--prepare-image', path, '--out', root/f'upload{n}'])
            record = json.loads((root/f'upload{n}'/'bucket-means.json').read_text())
            assert list(record['images']) == [digest]
            merged['images'].update(record['images'])
        cache = root/'means.json'
        cache.write_text(json.dumps(merged))
        def run(name, members, extra=(), success=True):
            (inputs/'manifest.json').write_text(json.dumps(members))
            stats = execute(['--atelier-id',str(uuid.UUID(int=100)), '--date','2026-09-08', '--capacity','2000', '--input-dir',inputs,'--palette',Path(__file__).resolve().parents[1]/'services/gen/palettes/provisional-32.json','--out',root/name,*extra],success)
            return root/name,stats
        direct,_ = run('direct',entries)
        batch,_ = run('batch',entries,['--prepare-bucket'])
        assert json.loads((batch/'bucket-means.json').read_text()) == merged, (json.loads((batch/'bucket-means.json').read_text()), merged)
        for path in inputs.glob('*.jpg'): path.rename(path.with_suffix('.unavailable'))
        prepared,stats = run('prepared',entries[::-1],['--prepared-bucket',cache])
        assert stats['decode_count'] == 0 and stats['unique_paths'] == 0
        for filename in FILES: assert (direct/filename).read_bytes() == (prepared/filename).read_bytes(),filename
        seed=(direct/'used_seed.txt').read_text().strip()
        revised,_=run('revised',entries[1:],['--prepared-bucket',cache,'--frozen-seed',seed,'--previous',prepared])
        for path in inputs.glob('*.unavailable'): path.rename(path.with_suffix('.jpg'))
        reference,_=run('reference',entries[1:],['--frozen-seed',seed,'--previous',direct])
        for filename in FILES: assert (reference/filename).read_bytes() == (revised/filename).read_bytes(),filename
        empty,_=run('empty',[],['--prepared-bucket',cache])
        empty_direct,_=run('empty-direct',[])
        for filename in FILES: assert (empty/filename).read_bytes() == (empty_direct/filename).read_bytes()
        run('missing-hash',[{k:v for k,v in entries[0].items() if k!='image_sha256'}],['--prepared-bucket',cache],False)
        run('bsp',entries,['--prepared-bucket',cache,'--render-tier','bsp_256'],False)
        for name, transform in [
            ('schema',lambda x:x.update(schema='future')),
            ('missing',lambda x:x['images'].pop(entries[0]['image_sha256'])),
            ('range',lambda x:x['images'].update({entries[0]['image_sha256']:[2,0,0]})),
            ('nan',lambda x:x['images'].update({entries[0]['image_sha256']:[float('nan'),0,0]})),
        ]:
            invalid=json.loads(json.dumps(merged));transform(invalid);bad=root/f'{name}.json';bad.write_text(json.dumps(invalid))
            run(name,entries,['--prepared-bucket',bad],False)
        Image.new('RGB',(1080,1080)).save(inputs/'wrong.png')
        execute(['--prepare-image',inputs/'wrong.png','--out',root/'wrong-format'],False)
        Image.new('RGB',(100,100)).save(inputs/'wrong.jpg')
        execute(['--prepare-image',inputs/'wrong.jpg','--out',root/'wrong-size'],False)
        if args.performance:
            # Synthetic prepared records exercise file IO and 2000 distinct bucket hashes.
            # Actual JPEG-derived 2000-image timings are recorded separately in docs.
            fixture = {'schema': merged['schema'], 'images': {}}
            people = []
            values = list(merged['images'].values())
            for n in range(2000):
                digest = hashlib.sha256(f'prepared-perf-fixture-{n}'.encode()).hexdigest()
                fixture['images'][digest] = values[n % len(values)]
                people.append(dict(user_id=str(uuid.UUID(int=n+1)),slot_index=n,image='not-read.jpg',image_sha256=digest))
            perf_cache=root/'perf.json';perf_cache.write_text(json.dumps(fixture))
            times=[]
            for n in range(3):
                _,stats=run(f'perf-{n}',people,['--prepared-bucket',perf_cache])
                assert stats['decode_count']==0
                times.append(stats['total_ms'])
            assert sorted(times)[1] < 200, times
            print('2000 synthetic prepared records CLI ms (median gate <200):',times)
    print('Prepared bucket: exact direct/batch/upload equality, no JPEG access, removal, empty and invalid inputs passed')

if __name__=='__main__': main()
