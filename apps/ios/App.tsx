// iOS distribution client for the public demo. Production M1–M4 stay separate.
import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Linking,Modal,Pressable,Share,StyleSheet,Text,View} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import {WebView} from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import * as Clipboard from 'expo-clipboard';
import * as AppleAuthentication from 'expo-apple-authentication';
import officialCopy from '../demo/src/copy.json';
import {APP_ORIGIN,APP_CALLBACK,isAppURL,lineAuthorization,lineReturn,externalURL,nativeMessage} from './src/policy';
import {nativeBridge,bridgeResult} from './src/bridge';
import type {AppleMessage} from './src/policy';
export default function App(){
 const web=useRef<WebView>(null),authBusy=useRef(false),currentURL=useRef(APP_ORIGIN+'/');
 const [uri,setUri]=useState(APP_ORIGIN+'/'),[revision,setRevision]=useState(0),[failed,setFailed]=useState(false);
 const [apple,setApple]=useState<AppleMessage|null>(null),[appleReady,setAppleReady]=useState(false),[appleBusy,setAppleBusy]=useState(false);
 useEffect(()=>{void AppleAuthentication.isAvailableAsync().then(setAppleReady).catch(()=>{});},[]);
 function appleCancel(){if(apple)web.current?.injectJavaScript(bridgeResult(apple.requestId,false));authBusy.current=false;setApple(null);}
 async function appleAuthorize(){
  if(!apple||appleBusy||!appleReady)return;setAppleBusy(true);
  try{
   const result=await AppleAuthentication.signInAsync({nonce:apple.nonce,state:apple.state,requestedScopes:apple.intent==='register'?[AppleAuthentication.AppleAuthenticationScope.FULL_NAME]:[]});
   if(result.state!==apple.state||!result.identityToken||!result.authorizationCode)throw Error('apple_invalid');
   web.current?.injectJavaScript(bridgeResult(apple.requestId,true,{state:result.state,identityToken:result.identityToken,code:result.authorizationCode,name:result.fullName?AppleAuthentication.formatFullName(result.fullName):undefined}));
  }catch{web.current?.injectJavaScript(bridgeResult(apple.requestId,false));}finally{authBusy.current=false;setApple(null);setAppleBusy(false);}
 }
 async function authorization(value:string){
  const request=lineAuthorization(value);if(!request||authBusy.current)return;
  authBusy.current=true;
  try{
   const relay=new URL('/native-auth/line',APP_ORIGIN);relay.searchParams.set('authorize',request.url);
   const result=await WebBrowser.openAuthSessionAsync(relay.href,APP_CALLBACK);
   if(result.type==='success'){
    const callback=lineReturn(result.url,request.state);
    if(callback){setUri(callback);setRevision(n=>n+1);}
   }
  }finally{authBusy.current=false;}
 }
 function navigate(url:string){
  if(isAppURL(url))return true;
  if(lineAuthorization(url)){void authorization(url).catch(()=>setFailed(true));return false;}
  const external=externalURL(url);if(external)void Linking.openURL(external).catch(()=>{});
  return false;
 }
 async function message(data:string,source:string){
  if(!isAppURL(source)||!isAppURL(currentURL.current))return;
  const value=nativeMessage(data);if(!value)return;
  if(value.action==='apple'){if(!appleReady||authBusy.current||apple){web.current?.injectJavaScript(bridgeResult(value.requestId,false));return;}authBusy.current=true;setApple(value);return;}
  let ok=false;
  try{
   if(value.action==='clipboard'){await Clipboard.setStringAsync(value.text);ok=true;}
   else{const result=await Share.share({message:value.text,...(value.url?{url:value.url}:{}),...(value.title?{title:value.title}:{})});ok=result.action!==Share.dismissedAction;}
  }finally{web.current?.injectJavaScript(bridgeResult(value.requestId,ok));}
 }
 return <SafeAreaProvider><StatusBar style="dark"/><SafeAreaView style={styles.screen} edges={['top','bottom','left','right']}>
  {failed?<View style={styles.failure}><Text style={styles.brand}>Schiild</Text><Text style={styles.error}>{officialCopy['error.server.body']}</Text><Pressable style={styles.retry} accessibilityRole="button" onPress={()=>{setFailed(false);setUri(APP_ORIGIN+'/');setRevision(n=>n+1);}}><Text>{officialCopy['common.retry']}</Text></Pressable></View>:
  <WebView key={revision} ref={web} source={{uri}} style={styles.screen}
   applicationNameForUserAgent="SchiildNative/1.1" originWhitelist={['https://*']}
   onShouldStartLoadWithRequest={request=>request.isTopFrame===false?false:navigate(request.url)}
   onNavigationStateChange={state=>{currentURL.current=state.url;}}
   onMessage={event=>{void message(event.nativeEvent.data,event.nativeEvent.url).catch(()=>{});}}
   injectedJavaScriptBeforeContentLoaded={nativeBridge} injectedJavaScript={nativeBridge}
   injectedJavaScriptBeforeContentLoadedForMainFrameOnly injectedJavaScriptForMainFrameOnly
   onOpenWindow={event=>{navigate(event.nativeEvent.targetUrl);}}
   onError={()=>setFailed(true)} onHttpError={event=>{if(event.nativeEvent.statusCode>=500)setFailed(true);}}
   onContentProcessDidTerminate={()=>web.current?.reload()} startInLoadingState
   renderLoading={()=><View style={styles.loading}><ActivityIndicator accessibilityLabel={officialCopy['common.loading']}/></View>}
   allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} mediaCapturePermissionGrantType="prompt"
   allowsBackForwardNavigationGestures={false} allowsLinkPreview={false} javaScriptCanOpenWindowsAutomatically={false}
   sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} webviewDebuggingEnabled={false}/>
  }
 <Modal visible={Boolean(apple)} transparent animationType="fade" onRequestClose={()=>{if(!appleBusy)appleCancel();}}><View style={styles.modal}><View style={styles.applePanel}><Text style={styles.brand}>Schiild</Text>{appleReady&&<AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE} buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK} cornerRadius={6} style={styles.appleButton} onPress={()=>void appleAuthorize()}/>}<Pressable style={styles.retry} disabled={appleBusy} accessibilityRole="button" onPress={appleCancel}><Text>{officialCopy['common.back']}</Text></Pressable>{appleBusy&&<ActivityIndicator/>}</View></View></Modal>
 </SafeAreaView></SafeAreaProvider>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#ffffff'},loading:{position:'absolute',top:0,bottom:0,left:0,right:0,alignItems:'center',justifyContent:'center',backgroundColor:'#ffffff'},failure:{flex:1,justifyContent:'center',padding:32,gap:24},brand:{fontSize:28,color:'#272c2b'},error:{fontSize:15,lineHeight:26,color:'#5c6260'},retry:{minHeight:48,justifyContent:'center',alignItems:'center',borderWidth:1,borderColor:'#e8ebe8'},modal:{flex:1,justifyContent:'center',alignItems:'center',padding:24,backgroundColor:'#00000044'},applePanel:{width:'100%',maxWidth:420,padding:28,gap:24,backgroundColor:'#ffffff'},appleButton:{height:50,width:'100%'}});
