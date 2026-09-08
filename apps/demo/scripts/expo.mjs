import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/expo/bin/cli',import.meta.url)),...process.argv.slice(2)],{cwd:root,stdio:'inherit',env:{...process.env,EXPO_NO_TELEMETRY:'1',__UNSAFE_EXPO_HOME_DIRECTORY:fileURLToPath(new URL('../.expo-home',import.meta.url))}});
child.on('error',()=>{console.error('expo_start_failed');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
