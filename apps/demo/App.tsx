import React,{useEffect,useRef,useState} from 'react';
import {t} from './src/copy';
import {dataUrl,decode,globalPixels,partition,random,render,shuffle,synthetic} from './src/engine';
import {dayAfter,initial,load,REVEAL,revealTimes,save} from './src/model';
import type {State,Work} from './src/model';
import './src/style.css';

const atelier='あさ';
const date=(day:string)=>day.replaceAll('-',' / ');
const short=(day:string)=>`${Number(day.slice(5,7))}/${Number(day.slice(8))}`;
const windowText=(day:string)=>t('atelier.window',{start:short(day)+' 09:00',end:short(dayAfter(day))+' 09:00'});
function Icon({kind}:{kind:'camera'|'grid'|'global'|'archive'|'arrow'}){return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">{kind==='camera'?<><path d="M3 7h5l2-3h4l2 3h5v14H3Z"/><rect x="9" y="11" width="6" height="6"/></>:kind==='grid'?<><rect x="3" y="3" width="18" height="18"/><path d="M3 12h18M13 3v9M9 12v9"/></>:kind==='global'?<><rect x="3" y="3" width="18" height="18"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></>:kind==='archive'?<><path d="M4 5h16v16H4ZM2 2h20M8 10h8"/></>:<path d="m9 5 7 7-7 7"/>}</svg>;}
function Button({children,onClick,secondary=false,disabled=false}:{children:React.ReactNode;onClick:()=>void;secondary?:boolean;disabled?:boolean}){return <button className={secondary?'button secondary':'button'} onClick={onClick} disabled={disabled}>{children}</button>;}

function Camera({day,onBack,onSubmit}:{day:string;onBack:()=>void;onSubmit:(url:string)=>void}){
 const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null);
 const [status,setStatus]=useState<'idle'|'loading'|'ready'|'denied'>('idle'),[preview,setPreview]=useState<string|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>()=>{stream.current?.getTracks().forEach(track=>track.stop());},[]);
 async function start(){setStatus('loading');setFailed(false);try{if(!navigator.mediaDevices?.getUserMedia)throw Error('camera_unavailable');const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1080},height:{ideal:1080}},audio:false});stream.current=media;if(!video.current){media.getTracks().forEach(track=>track.stop());return;}video.current.srcObject=media;await video.current.play();setStatus('ready');}catch{setStatus('denied');}}
 function capture(){try{const source=video.current;if(!source?.videoWidth)throw Error('camera_not_ready');const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1080;const side=Math.min(source.videoWidth,source.videoHeight);canvas.getContext('2d')?.drawImage(source,(source.videoWidth-side)/2,(source.videoHeight-side)/2,side,side,0,0,1080,1080);setPreview(canvas.toDataURL('image/jpeg',.88));stream.current?.getTracks().forEach(track=>track.stop());setStatus('idle');}catch{setFailed(true);}}
 return <section className="camera-page"><div className="subheader"><button className="text-button" onClick={onBack}>{t('common.back')}</button><span className="mono">{t('camera.date',{date:date(day)})}</span></div>
  <div className="viewfinder">{preview?<img src={preview} alt={t('camera.date',{date:date(day)})}/>:<video ref={video} playsInline muted autoPlay/>}{!preview&&status!=='ready'&&<div className="permission"><Icon kind="camera"/><h2>{t(status==='denied'?'camera.permission.denied.title':'camera.permission.title')}</h2><p>{t(status==='denied'?'camera.permission.denied.body':'camera.permission.body')}</p><Button onClick={()=>void start()} disabled={status==='loading'}>{t(status==='loading'?'common.loading':status==='denied'?'common.retry':'common.next')}</Button></div>}</div>
  {!preview&&<button className="shutter" disabled={status!=='ready'} aria-label={t('onboarding.1.title')} onClick={capture}><span/></button>}
  {failed&&<p role="alert">{t('camera.capture_failed')}</p>}
  {preview&&<div className="modal-shade"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><img className="confirm-photo" src={preview} alt={t('camera.date',{date:date(day)})}/><h2 id="confirm-title">{t('camera.confirm.title')}</h2><p>{t('camera.confirm.body',{ateliers:`「${atelier}」`})}</p><p className="mono muted">{t('camera.confirm.remaining',{date:short(day),countdown:'00:15:00'})}</p><Button onClick={()=>onSubmit(preview)}>{t('camera.confirm.submit')}</Button><Button secondary onClick={()=>{setPreview(null);setStatus('idle');}}>{t('camera.confirm.back')}</Button></section></div>}
 </section>;
}

function Reveal({work,onOpened,onNext}:{work:Work;onOpened:()=>void;onNext:()=>void}){
 const [started,setStarted]=useState(work.opened),[complete,setComplete]=useState(work.opened),[tiles,setTiles]=useState(work.opened?12:0),[record,setRecord]=useState(work.opened),[custody,setCustody]=useState(work.opened);
 const notify=useRef(onOpened);notify.current=onOpened;
 function finish(){setStarted(true);setTiles(12);setRecord(true);setCustody(true);setComplete(true);notify.current();}
 useEffect(()=>{if(!started||complete)return;if(matchMedia('(prefers-reduced-motion: reduce)').matches){finish();return;}const times=revealTimes(12),timers=work.order.map((_,n)=>setTimeout(()=>setTiles(n+1),REVEAL.start+n*REVEAL.interval));timers.push(setTimeout(()=>setRecord(true),times.record),setTimeout(()=>setCustody(true),times.custody),setTimeout(()=>{setComplete(true);notify.current();},times.custody+REVEAL.custodyFade));return()=>timers.forEach(clearTimeout);},[started,complete,work.day]);
 return <section className="reveal-page" data-testid="reveal" data-tiles={tiles} data-record={record} data-custody={custody}>
  <div className="wall-label">{t('schiild.label',{index:String(work.index).padStart(3,'0')})}</div>
  <button className="artboard reveal-board" aria-label={t(started?'common.done':'reveal.open')} onClick={()=>started?finish():setStarted(true)}>
   {started&&work.rects.map(rect=><div key={rect.slot} className="reveal-tile" style={{left:`${rect.x/128*100}%`,top:`${rect.y/128*100}%`,width:`${rect.w/128*100}%`,height:`${rect.h/128*100}%`,visibility:work.order.slice(0,tiles).includes(rect.slot)?'visible':'hidden'}}><img src={work.image} alt="" style={{width:`${128/rect.w*100}%`,height:`${128/rect.h*100}%`,left:`${-rect.x/rect.w*100}%`,top:`${-rect.y/rect.h*100}%`}}/></div>)}
   {!started&&<div className="unopened-mark"><span/><span/><span/><span/></div>}
  </button>
  {!started?<div className="ready-copy"><p>{t('reveal.ready',{date:short(work.day)})}</p><p className="mono muted">{t('reveal.date',{date:date(work.day)})}</p><Button onClick={()=>setStarted(true)}>{t('reveal.open')}</Button></div>:<>
   <div className="reveal-record" style={{opacity:record?1:0,transitionDuration:`${REVEAL.recordFade}ms`}}><h1>{atelier}</h1><p className="mono">{date(work.day)}　／　{work.count} {t('common.of')} 12</p><p className="window">{windowText(work.day)}</p></div>
   <div className="custody" style={{opacity:custody?1:0,transitionDuration:`${REVEAL.custodyFade}ms`}}><span className="wall-label">{t('reveal.custody_label')}</span><p>{t(work.custody==='self'?'reveal.custody.self':'reveal.custody.other',{name:'ゆき'})}</p></div>
   {complete&&<Button onClick={onNext}>{t('global.label')} <Icon kind="arrow"/></Button>}
  </>}
 </section>;
}

function Global({work}:{work:Work|undefined}){
 const [zoom,setZoom]=useState(false);useEffect(()=>setZoom(false),[work?.day]);
 if(!work?.global)return <section className="empty"><h1>{t('global.label')}</h1><p>{t('global.your_pixel_none')}</p></section>;
 const x=work.x??128,y=work.y??128;
 return <section className="global-page"><div className="wall-label">{t('global.label')}</div><h1>{date(work.day)}</h1><p className="window">{windowText(work.day)}</p>
  <div className="global-overview artboard"><img src={work.global} alt={t('global.label')}/><span className="pixel-marker" style={{left:`${x/256*100}%`,top:`${y/256*100}%`}}/></div>
  <button className="pixel-link" onClick={()=>setZoom(!zoom)}><span>{t('global.your_pixel',{n:y*256+x+1})}</span><Icon kind="arrow"/></button>
  <div className="zoom-stage" data-testid="global-zoom" data-zoom={zoom}><img src={work.global} alt={t('schiild.regions.mine')} style={{transformOrigin:`${(x+.5)/256*100}% ${(y+.5)/256*100}%`,transform:zoom?`translate(${(128-x-.5)/256*100}%, ${(128-y-.5)/256*100}%) scale(12)`:'scale(1)'}}/><span className={zoom?'zoom-target visible':'zoom-target'}/></div>
  <div className="loupe-row"><div className="loupe"><img src={work.global} alt={t('schiild.regions.mine')} style={{left:-(x-4)*12,top:-(y-4)*12}}/><span/></div><div><p className="mono">{t('global.coords',{x,y})}</p><p className="muted">{t('schiild.regions.mine')}</p></div></div>
  <div className="stats"><div><span>{t('global.stat.posts')}</span><b>2,048</b></div><div><span>{t('global.stat.ateliers')}</span><b>128</b></div></div><p className="quiet">{t('global.not_for_sale')}</p>
 </section>;
}

export default function App(){
 const [state,setState]=useState<State|null>(null),[screen,setScreen]=useState<'home'|'camera'|'work'|'global'|'archive'>('home'),[selected,setSelected]=useState<string|null>(null),[panel,setPanel]=useState(false),[busy,setBusy]=useState(false),[storageError,setStorageError]=useState(false);
 const taps=useRef<number[]>([]);
 useEffect(()=>{document.documentElement.lang='ja';document.title='Schiild';setState(load());},[]);
 useEffect(()=>{if(state)try{save(state);setStorageError(false);}catch{setStorageError(true);}},[state]);
 useEffect(()=>{if(!state?.photo||state.ready||state.count>=10)return;const timer=setTimeout(()=>setState(old=>old?{...old,count:Math.min(10,old.count+1)}:old),2200);return()=>clearTimeout(timer);},[state?.count,state?.photo,state?.ready]);
 if(!state)return <div className="loading">{t('common.loading')}</div>;
 const work=state.works.find(w=>w.day===selected),globalWork=state.works.find(w=>w.global&&w.opened);
 function hidden(){const now=Date.now();taps.current=[...taps.current.filter(time=>now-time<1100),now];if(taps.current.length>=3){setPanel(true);taps.current=[];}}
 function navigate(next:typeof screen){setScreen(next);window.scrollTo(0,0);}
 async function advance(){if(!state||busy)return;setBusy(true);try{
  const photo=state.photo?await decode(state.photo):null;
  const image=dataUrl(render(state.rects,state.rects.map(r=>r.slot===0?photo:r.slot<state.count?synthetic(state.seed+r.slot*33):null),state.seed));
  const global=photo?globalPixels(photo,state.seed):null;
  const made:Work={day:state.day,image,rects:state.rects,order:shuffle(state.rects.map(r=>r.slot),random(state.seed+31)),count:state.count,index:state.works[0].index+1,custody:state.winner,opened:false,...(global?{global:dataUrl(global.pixels),x:global.x,y:global.y}:{})};
  setState({...state,ready:state.day,works:[made,...state.works.filter(w=>w.day!==state.day)]});setSelected(state.day);navigate('work');setPanel(false);
 }catch{setStorageError(true);}finally{setBusy(false);}}
 function nextDay(){if(!state)return;const seed=state.seed+131;setState({...state,day:dayAfter(state.day),seed,rects:partition(12,random(seed)),photo:null,count:2,ready:null});setPanel(false);navigate('home');}
 const tabs=[['home','grid','home.title'],['global','global','global.label'],['archive','archive','archive.title']] as const;
 return <div className="app"><header className="header"><button className="brand" onClick={hidden} aria-label="Schiild"><span className="brand-symbol"><i/><i/><i/></span>Schiild</button><span className="header-date mono">{date(state.day)}</span></header>
 <main>{storageError&&<p className="error" role="alert">{t('error.server.title')}</p>}
 {screen==='home'&&<section><div className="eyebrow">{t('home.title')}</div><div className="title-row"><h1>{atelier}</h1><span className="mono">01 / 01</span></div>
  <div className="artboard today-board" data-testid="today-board">{state.rects.map(rect=>{const filled=rect.slot===0?Boolean(state.photo):rect.slot<=(state.photo?state.count-1:state.count);return <div key={rect.slot} className={`today-tile ${filled?'filled':''}`} style={{left:`${rect.x/128*100}%`,top:`${rect.y/128*100}%`,width:`${rect.w/128*100}%`,height:`${rect.h/128*100}%`,background:filled?['#b5b7a5','#c39582','#87a6b0','#d7c49a','#61777a'][rect.slot%5]:undefined}}/>;})}</div>
  <div className="today-details"><div><span className="wall-label">{t('atelier.closes_in')}</span><p className="countdown">{state.ready?'00:00:00':'00:15:00'}</p></div><div className="recorded"><span className="mono">{t('atelier.recorded',{n:state.count,cap:12})}</span><div className="members">{Array.from({length:12},(_,n)=><i key={n} className={n<state.count?'recorded':''}/>)}</div></div></div><p className="window">{windowText(state.day)}</p>
  {state.ready?<Button onClick={()=>{setSelected(state.ready);navigate('work');}}>{t('reveal.open')}</Button>:state.photo?<div className="posted"><p>{t('posted.title')}<br/>{t('posted.title2')}</p>{state.count>=10&&<span className="muted">{t('atelier.almost',{n:12-state.count})}</span>}</div>:<Button onClick={()=>navigate('camera')}><Icon kind="camera"/>{t('onboarding.1.title')}</Button>}
  <div className="section-heading"><h2>{t('atelier.past')}</h2><button className="text-button" onClick={()=>navigate('archive')}><Icon kind="arrow"/></button></div><div className="recent">{state.works.filter(w=>w.opened).slice(0,3).map(w=><button key={w.day} onClick={()=>{setSelected(w.day);navigate('work');}}><img src={w.image} alt={t('schiild.label',{index:w.index})}/><span className="mono">{short(w.day)}</span></button>)}</div>
 </section>}
 {screen==='camera'&&<Camera day={state.day} onBack={()=>navigate('home')} onSubmit={url=>{setState({...state,photo:url,count:state.count+1});navigate('home');}}/>}
 {screen==='work'&&work&&<Reveal key={work.day} work={work} onOpened={()=>setState(old=>old?{...old,works:old.works.map(w=>w.day===work.day?{...w,opened:true}:w)}:old)} onNext={()=>navigate('global')}/>}
 {screen==='global'&&<Global work={globalWork}/>}
 {screen==='archive'&&<section><div className="eyebrow">{t('me.link.archive')}</div><h1>{state.day.slice(0,4)}</h1><div className="stats"><div><span>{t('archive.total')}</span><b>{state.works.filter(w=>w.opened).length}</b></div><div><span>{t('archive.month_stat')}</span><b>{state.works.filter(w=>w.opened&&w.day.slice(0,7)===state.day.slice(0,7)).length}</b></div></div><p className="archive-note">{t('archive.note')}</p><div className="archive-grid">{state.works.filter(w=>w.opened).map(w=><button key={w.day} onClick={()=>{setSelected(w.day);navigate('work');}}><img src={w.image} alt={t('schiild.label',{index:w.index})}/><div className="archive-caption"><span className="mono">{short(w.day)}</span><span className="mono">{String(w.index).padStart(3,'0')}</span></div></button>)}</div></section>}
 </main><nav className="nav">{tabs.map(([next,kind,key])=><button key={next} className={screen===next?'active':''} onClick={()=>navigate(next)}><Icon kind={kind}/><span>{t(key)}</span></button>)}</nav>
 {panel&&<div className="modal-shade"><section className="dialog operator" role="dialog" aria-modal="true" aria-label={t('common.today')}><div className="title-row"><h2>{t('common.today')}</h2><button className="text-button" onClick={()=>setPanel(false)}>{t('common.close')}</button></div><p className="mono">{date(state.day)} → {date(dayAfter(state.day))}</p><Button disabled={busy} onClick={()=>state.ready?nextDay():void advance()}>{t(busy?'common.loading':'common.next')} → 00:15 UTC</Button><div className="choice"><button className={state.winner==='self'?'chosen':''} onClick={()=>setState({...state,winner:'self'})}>{t('reveal.custody.self')}</button><button className={state.winner==='other'?'chosen':''} onClick={()=>setState({...state,winner:'other'})}>{t('reveal.custody.other',{name:'ゆき'})}</button></div><Button secondary onClick={()=>{if(!state.ready)return;setState({...state,works:state.works.map(w=>w.day===state.ready?{...w,opened:false,custody:state.winner}:w)});setSelected(state.ready);navigate('work');setScreen('home');setTimeout(()=>navigate('work'),0);setPanel(false);}} disabled={!state.ready}>{t('reveal.open')}</Button><Button secondary onClick={()=>{setState(initial());setSelected(null);setPanel(false);navigate('home');}}>{t('common.retry')}</Button></section></div>}
 </div>;
}
