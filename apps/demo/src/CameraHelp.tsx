import React,{useRef,useState} from 'react';
import {t} from './copy';
import {cameraGuide} from './camera-recovery';
import type {CameraGuide} from './camera-recovery';

export default function CameraHelp(){
 const [guide,setGuide]=useState<CameraGuide>(cameraGuide);
 const input=useRef<HTMLInputElement>(null),[message,setMessage]=useState('');
 const steps={ios:['demo.camera.ios.site','demo.camera.ios.system'],android:['demo.camera.android.site','demo.camera.android.system'],desktop:['demo.camera.desktop.site','demo.camera.desktop.system'],other:['demo.camera.other.site','demo.camera.other.system']} as const;
 const url=window.location.href;
 async function copy(){try{await navigator.clipboard.writeText(url);setMessage(t('common.done'));}catch{input.current?.focus();input.current?.select();setMessage(t('demo.camera.copy_manual'));}}
 return <section className="camera-help" id="camera-help" tabIndex={-1} aria-labelledby="camera-help-title">
  <h2 id="camera-help-title">{t('demo.camera.help')}</h2><p>{t('demo.camera.manual')}</p>
  <label className="field">{t('demo.camera.browser')}<select value={guide} onChange={e=>setGuide(e.target.value as CameraGuide)}>{(['ios','android','desktop','other'] as const).map(value=><option key={value} value={value}>{t(`demo.camera.guide.${value}`)}</option>)}</select></label>
  <ol>{steps[guide].map(key=><li key={key}>{t(key,{site:window.location.hostname})}</li>)}<li>{t('demo.camera.return')}</li></ol>
  <p>{t('demo.camera.embedded')}</p><label className="field">{t('demo.camera.url')}<input ref={input} value={url} readOnly onFocus={e=>e.currentTarget.select()}/></label><button className="button secondary" onClick={()=>void copy()}>{t('demo.camera.copy')}</button>{message&&<p role="status">{message}</p>}
 </section>;
}
