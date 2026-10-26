import type {ExpoConfig} from 'expo/config';
const config:ExpoConfig={
 name:'Schiild',slug:'schiild-ios',version:'1.0.0',scheme:'schiild',
 // Expo's account-binding schema requires this property; it is not product terminology.
 // eslint-disable-next-line schiild/domain-names
 owner:'show.a.13045',
 platforms:['ios'],orientation:'default',userInterfaceStyle:'light',
 icon:'./assets/icon.png',
 ios:{bundleIdentifier:'app.schiild.mobile',appleTeamId:'PQ7WUU6HWC',supportsTablet:true,usesAppleSignIn:true,
  infoPlist:{NSCameraUsageDescription:'今日のシールを撮影するためにカメラを使用します。',
   ITSAppUsesNonExemptEncryption:false,CFBundleAllowMixedLocalizations:true,
   LSApplicationQueriesSchemes:['line','whatsapp'],
   NSAppTransportSecurity:{NSAllowsArbitraryLoads:false}}},
 plugins:['expo-apple-authentication','expo-web-browser'],
 extra:{eas:{projectId:'f6511507-2153-47f3-8e36-6285327747dd'}}
};
export default config;
