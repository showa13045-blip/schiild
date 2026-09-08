import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobile = path.join(project, 'apps', 'mobile');
const child = spawn(process.execPath, [path.join(mobile, 'node_modules', 'expo', 'bin', 'cli'), 'start', ...process.argv.slice(2)], {
  cwd: mobile,
  stdio: 'inherit',
  env: { ...process.env, EXPO_NO_TELEMETRY: '1', __UNSAFE_EXPO_HOME_DIRECTORY: process.env.__UNSAFE_EXPO_HOME_DIRECTORY || path.join(project, '.expo-home') },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
