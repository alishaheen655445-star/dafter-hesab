// -----------------------------------------------------------------------------
//  prepare-android-web.mjs — the staging copy Capacitor packages into the APK.
//
//  The client has no build step, so this is only a file copy: client/ -> android-web/.
//  It exists for one reason: client/uploads/ holds the pictures people actually
//  uploaded while testing, and that must never end up inside a shipped APK. The
//  copy also lets us drop files that only make sense on the web (nothing today).
//
//  Run before every `npx cap sync` (npm run cap:sync does both).
// -----------------------------------------------------------------------------
import { cpSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'client');
const DEST = join(ROOT, 'android-web');

// Anything we do not want in the packaged app. Directory names are matched at the
// top level of client/; patterns are matched against the file name.
const SKIP_DIRS = new Set(['uploads']);
const SKIP_FILES = /\.(md|log|tmp)$/i;

function filter(relPath) {
  const top = relPath.split(/[\\/]/)[0];
  if (SKIP_DIRS.has(top)) return false;
  return !SKIP_FILES.test(relPath);
}

rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });
cpSync(SRC, DEST, { recursive: true, filter: (src) => filter(src.slice(SRC.length + 1)) });

let files = 0;
let bytes = 0;
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else { files += 1; bytes += statSync(p).size; }
  }
};
walk(DEST);

const skippedTop = readdirSync(SRC, { withFileTypes: true })
  .filter((e) => e.isDirectory() && SKIP_DIRS.has(e.name))
  .map((e) => e.name + '/');

console.log(`android-web ready: ${files} files, ${(bytes / 1024).toFixed(0)} KB (skipped: ${skippedTop.join(', ') || 'nothing'})`);
