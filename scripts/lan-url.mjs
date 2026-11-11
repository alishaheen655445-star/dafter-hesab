// -----------------------------------------------------------------------------
//  lan-url.mjs — the address to type inside the packaged app.
//
//  A phone on the same wifi cannot reach "localhost" — that is the phone itself —
//  so it needs this computer's LAN address. This prints every IPv4 the machine has,
//  with the port from .env, ready to copy into Settings ▸ server address.
//
//  npm run lan
// -----------------------------------------------------------------------------
import { networkInterfaces } from 'node:os';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// PORT comes from .env (the same file the server reads), default 3100.
let port = '3100';
const envPath = join(ROOT, '.env');
if (existsSync(envPath)) {
  const line = readFileSync(envPath, 'utf8').split(/\r?\n/).find((l) => /^\s*PORT\s*=/.test(l));
  if (line) port = line.split('=')[1].trim();
}

const nets = networkInterfaces();
const found = [];
for (const [name, list] of Object.entries(nets)) {
  for (const n of list || []) {
    if (n.family === 'IPv4' && !n.internal) found.push({ name, address: n.address });
  }
}

console.log(`Port from .env: ${port}`);
console.log('');
console.log('Type ONE of these in Settings > server address inside the app:');
for (const f of found) console.log(`  http://${f.address}:${port}/api      (${f.name})`);
console.log('');
console.log(`  http://10.0.2.2:${port}/api        (Android emulator only — its own name for this PC)`);
console.log('');
if (!found.length) console.log('! No LAN IPv4 found — is wifi/ethernet up?');
else console.log('! If the phone still fails: allow port ' + port + ' through Windows Firewall for this network (Private).');
