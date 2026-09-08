"""Deterministic provisional palette, or corpus Oklab k-means. Requires numpy and Pillow."""
import argparse, json
from pathlib import Path
import numpy as np
from PIL import Image

def oklab(rgb):
    c=np.asarray(rgb,dtype=np.float64)/255
    c=np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
    lms=c @ np.array([[.4122214708,.2119034982,.0883024619],[.5363325363,.6806995451,.2817188376],[.0514459929,.1073969566,.6299787005]])
    return np.cbrt(lms) @ np.array([[.2104542553,1.9779984951,.0259040371],[.7936177850,-2.4285922050,.7827717662],[-.0040720468,.4505937099,-.8086757660]])

def build(corpus=None):
    candidates=np.array([(r,g,b) for r in range(0,256,17) for g in range(0,256,17) for b in range(0,256,17)],dtype=np.float64)
    labs=oklab(candidates)
    colors=[[n,n,n] for n in [0,51,102,153,204,255]]
    distances=np.full(len(candidates),np.inf)
    for color in colors: distances=np.minimum(distances,np.sum((labs-oklab(color))**2,axis=1))
    while len(colors)<32:
        choice=int(np.argmax(distances)); colors.append(candidates[choice].astype(int).tolist())
        distances=np.minimum(distances,np.sum((labs-labs[choice])**2,axis=1))
    if corpus:
        paths=sorted(p for p in Path(corpus).rglob('*') if p.suffix.lower() in {'.jpg','.jpeg','.png'})
        if not paths: raise ValueError('Corpus contains no images')
        rgb=np.concatenate([np.asarray(Image.open(p).convert('RGB').resize((8,8)),dtype=np.float64).reshape(-1,3) for p in paths])
        samples=oklab(rgb); centers=oklab(colors)
        for iteration in range(20):
            distance=np.full(len(samples),np.inf); groups=np.zeros(len(samples),dtype=int)
            for cluster,center in enumerate(centers):
                delta=np.sum((samples-center)**2,axis=1); better=delta<distance
                groups[better]=cluster;distance[better]=delta[better]
            for cluster in range(6,32):
                selected=samples[groups==cluster]
                if len(selected): centers[cluster]=selected.mean(axis=0)
        # Snap centroids into the sRGB gamut deterministically. Neutral ramp remains fixed.
        used={tuple(c) for c in colors[:6]}
        for cluster in range(6,32):
            order=np.argsort(np.sum((labs-centers[cluster])**2,axis=1),kind='stable')
            choice=next(n for n in order if tuple(candidates[n].astype(int)) not in used)
            colors[cluster]=candidates[choice].astype(int).tolist();used.add(tuple(colors[cluster]))
    return colors

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--corpus');parser.add_argument('--out',required=True)
    args=parser.parse_args();path=Path(args.out);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(build(args.corpus),indent=2)+'\n',encoding='utf-8')
    print('Corpus candidate; manual palette review required' if args.corpus else 'Analytical provisional palette; no photo corpus supplied')
