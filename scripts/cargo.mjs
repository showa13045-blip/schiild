import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localRust = path.resolve(root, '../../work/rust');
const localCargo = path.join(localRust, 'cargo/bin/cargo.exe');
const useLocal = process.platform === 'win32' && existsSync(localCargo);
const child = spawn(useLocal ? localCargo : 'cargo', process.argv.slice(2), {
  cwd: root, stdio: 'inherit',
  env: useLocal ? { ...process.env, CARGO_HOME: path.join(localRust, 'cargo'), RUSTUP_HOME: path.join(localRust, 'rustup') } : process.env,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
