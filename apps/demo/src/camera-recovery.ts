// DEMO ONLY. Browser camera failures and permission guidance for the Web demo.
export type CameraProblem='permission'|'missing'|'busy'|'unsupported'|'insecure'|'interrupted'|'unknown';
export type CameraGuide='ios'|'android'|'desktop'|'other';
export function cameraProblem(error:unknown):CameraProblem{
 const name=error instanceof Error?error.name:'';
 if(name==='NotAllowedError'||name==='PermissionDeniedError'||name==='SecurityError')return 'permission';
 if(name==='NotFoundError'||name==='DevicesNotFoundError')return 'missing';
 if(name==='NotReadableError'||name==='TrackStartError'||name==='AbortError')return 'busy';
 if(name==='camera_unsupported')return 'unsupported';
 if(name==='camera_insecure')return 'insecure';
 return 'unknown';
}
export function cameraGuide():CameraGuide{
 if(/iPad|iPhone|iPod/.test(navigator.userAgent)||(/Mac/.test(navigator.platform)&&navigator.maxTouchPoints>1))return 'ios';
 if(/Android/.test(navigator.userAgent))return 'android';
 if(/Chrome|Edg/.test(navigator.userAgent))return 'desktop';
 return 'other';
}
