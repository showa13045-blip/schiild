// Pure SVG QR generation. No external QR service, tracking or image uploads.
import QRCode from 'qrcode/lib/core/qrcode.js';
import svg from 'qrcode/lib/renderer/svg-tag.js';
export function atelierQr(code){if(typeof code!=='string'||!/^[A-Z0-9]{8}$/.test(code))throw Error('invalid_atelier_code');return receptionQr('0'.repeat(32),code);}
export function receptionQr(key,code){if(typeof key!=='string'||!/^[a-f0-9]{32}$/.test(key))throw Error('invalid_reception_key');return svg.render(QRCode.create(code&&/^[A-Z0-9]{8}$/.test(code)?'https://schiild.app/atelier/'+code+'/':'https://schiild.app/collect/'+key+'/',{errorCorrectionLevel:'M'}),{margin:4,width:1024,color:{dark:'#000000',light:'#ffffff'}});}
