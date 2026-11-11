// -----------------------------------------------------------------------------
//  Phase 7 test: the Android wrap.
//  Needs the server running for the two network checks: npm run dev
//  Run with: node scripts/test-phase7.mjs
//
//  Most of this suite is static on purpose. A missing Android SDK stops a gradle
//  build on THIS machine, but it must never stop the wrap from being correct: the
//  config, the manifest, the staged web assets and the code branches that only
//  fire inside a WebView are all checkable without one.
//
//  The privacy assertion is the important one: client/uploads/ holds pictures
//  people uploaded while testing, and an APK is copied around — so nothing under
//  assets/public may be an upload, and the staging script is what guarantees it.
// -----------------------------------------------------------------------------
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_BASE = 'http://localhost:3100/api';
const ASSETS = join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'public');

let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
};

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const readAsset = (rel) => readFileSync(join(ASSETS, rel), 'utf8');

/** Width, height and colour type from a PNG header — no image library needed. */
function pngInfo(file) {
  const b = readFileSync(file);
  const sig = b.subarray(1, 4).toString('latin1') === 'PNG';
  if (!sig) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] };
}

/** Every local js/ and css/ reference in one HTML file. */
function localRefs(html) {
  const out = [];
  const re = /<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const p = m[1];
    if (/^(js|css)\//.test(p)) out.push(p);
  }
  return out;
}

async function main() {
  // 1) the Capacitor config --------------------------------------------------
  let cfg = null;
  try { cfg = JSON.parse(read('capacitor.config.json')); } catch (_e) { /* reported below */ }
  check('capacitor.config.json parses', !!cfg);

  if (cfg) {
    check('appId is reverse-domain ASCII', /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(cfg.appId || ''), cfg.appId);
    check('appId is NOT the reference app id', cfg.appId !== 'ir.rezadev.payment');
    check('appName is the Arabic name', /دفتر/.test(cfg.appName || ''), cfg.appName);
    check('webDir is the staged folder, not client/', cfg.webDir === 'android-web', cfg.webDir);
    check('mixed content is allowed (LAN http API)', cfg.android?.allowMixedContent === true);
    check('the WebView is not left debuggable', cfg.android?.webContentsDebuggingEnabled === false);
  }

  // 2) dependencies and scripts ---------------------------------------------
  const pkg = JSON.parse(read('package.json'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  check('@capacitor/core is installed', !!deps['@capacitor/core'], deps['@capacitor/core'] || '');
  check('@capacitor/cli is installed', !!deps['@capacitor/cli'], deps['@capacitor/cli'] || '');
  check('@capacitor/android is installed', !!deps['@capacitor/android'], deps['@capacitor/android'] || '');
  for (const s of ['cap:prep', 'cap:sync', 'cap:open', 'cap:apk', 'cap:icons', 'lan']) {
    check(`npm run ${s} exists`, !!pkg.scripts[s], pkg.scripts[s] || '');
  }
  check('cap:sync stages the web files first', /prepare-android-web\.mjs/.test(pkg.scripts['cap:sync'] || ''));
  check('cap:apk syncs before gradle runs', /cap sync android[\s\S]*gradlew/.test(pkg.scripts['cap:apk'] || ''));
  check('the gitignore keeps the staging copy out', /android-web\//.test(read('.gitignore')));

  // 3) the generated Android project ----------------------------------------
  check('android/ project exists', existsSync(join(ROOT, 'android')), 'run: npx cap add android');
  if (!existsSync(join(ROOT, 'android'))) { report(); return; }

  for (const f of ['settings.gradle', 'build.gradle', 'gradlew.bat', 'app/build.gradle']) {
    check(`android/${f} exists`, existsSync(join(ROOT, 'android', f)));
  }

  const manifest = readFileSync(join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
  check('manifest is closed (no truncation)', /<\/manifest>\s*$/.test(manifest.trim()));
  check('INTERNET permission is declared', /uses-permission android:name="android\.permission\.INTERNET"/.test(manifest));
  check('supportsRtl so the RTL layout survives', /android:supportsRtl="true"/.test(manifest));
  check('cleartext http is allowed for the LAN server', /android:usesCleartextTraffic="true"/.test(manifest));
  check('the keyboard does not cover the entry forms', /android:windowSoftInputMode="adjustResize"/.test(manifest));

  const strings = readFileSync(join(ROOT, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml'), 'utf8');
  check('launcher label is دفتر حساب', /<string name="app_name">[^<]*دفتر[^<]*<\/string>/.test(strings));
  const appGradle = readFileSync(join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');
  check('applicationId matches the config', (appGradle.match(/applicationId "([^"]+)"/) || [])[1] === cfg?.appId);

  // 4b) the launcher icon and the splash ------------------------------------
  // A generated android/ project ships the Capacitor template icons. These checks
  // are what tells "the brand mark was drawn" apart from "nobody ran cap:icons".
  const res = join(ROOT, 'android', 'app', 'src', 'main', 'res');
  const square = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  const fore = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
  let iconOk = true;
  let foreOk = true;
  for (const [d, px] of Object.entries(square)) {
    const i = pngInfo(join(res, `mipmap-${d}`, 'ic_launcher.png'));
    if (!i || i.w !== px || i.h !== px) { iconOk = false; console.log(`  ! mipmap-${d}/ic_launcher.png is ${i && i.w}x${i && i.h}, expected ${px}`); }
    const f = pngInfo(join(res, `mipmap-${d}`, 'ic_launcher_foreground.png'));
    // 6 = RGBA: the adaptive foreground must be transparent behind the mark.
    if (!f || f.w !== fore[d] || f.colorType !== 6) { foreOk = false; console.log(`  ! mipmap-${d}/ic_launcher_foreground.png ${f && f.w}x${f && f.h} type ${f && f.colorType}`); }
  }
  check('every launcher icon density is drawn', iconOk);
  check('adaptive foregrounds are transparent and sized', foreOk);

  const splashes = ['drawable', 'drawable-land-mdpi', 'drawable-land-hdpi', 'drawable-land-xhdpi', 'drawable-land-xxhdpi',
    'drawable-land-xxxhdpi', 'drawable-port-mdpi', 'drawable-port-hdpi', 'drawable-port-xhdpi', 'drawable-port-xxhdpi', 'drawable-port-xxxhdpi']
    .filter((d) => existsSync(join(res, d, 'splash.png')));
  check('all 11 splash screens exist', splashes.length === 11, `${splashes.length}/11`);
  check('the adaptive background is the brand blue', /#1565C0/i.test(readFileSync(join(res, 'values', 'ic_launcher_background.xml'), 'utf8')));

  // 5) what actually gets shipped -------------------------------------------
  check('assets/public/index.html exists', existsSync(join(ASSETS, 'index.html')), 'run: npm run cap:sync');
  check('assets/capacitor.config.json exists',
    existsSync(join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'capacitor.config.json')));
  check('NO uploaded pictures are packaged', !existsSync(join(ASSETS, 'uploads')));

  const pages = readdirSync(ASSETS).filter((f) => f.endsWith('.html'));
  check('every screen made it into the bundle', pages.length >= 8, pages.join(' '));

  // A missing js/css file is an APK that opens a blank screen, so both copies of
  // every reference are checked: the source tree and the staged bundle.
  let missingClient = [];
  let missingAsset = [];
  for (const page of readdirSync(join(ROOT, 'client')).filter((f) => f.endsWith('.html'))) {
    for (const ref of localRefs(readFileSync(join(ROOT, 'client', page), 'utf8'))) {
      if (!existsSync(join(ROOT, 'client', ref))) missingClient.push(`${page} -> ${ref}`);
    }
  }
  for (const page of pages) {
    for (const ref of localRefs(readAsset(page))) {
      if (!existsSync(join(ASSETS, ref))) missingAsset.push(`${page} -> ${ref}`);
    }
  }
  check('client html references nothing missing', missingClient.length === 0, missingClient.join(', '));
  check('bundled html references nothing missing', missingAsset.length === 0, missingAsset.join(', '));

  // 6) the branches that only fire inside the WebView ------------------------
  const configJs = read('client/js/config.js');
  check('config knows about the packaged app', /isNative\s*\(/.test(configJs) && /NATIVE_FALLBACK/.test(configJs));
  const nativeLine = configJs.indexOf('if (isNative()) return NATIVE_FALLBACK;');
  const sameOriginLine = configJs.indexOf("return '/api';");
  check('native is decided BEFORE the same-origin answer',
    nativeLine > -1 && nativeLine < sameOriginLine, `native@${nativeLine} api@${sameOriginLine}`);
  check('the bridge object is the primary signal', /global\.Capacitor/.test(configJs) && /isNativePlatform/.test(configJs));
  check('Config.isNative is exposed', /isNative:\s*isNative\(\)/.test(configJs));

  const attachJs = read('client/js/attach.js');
  check('picture URLs are rebuilt against the API origin', /function assetUrl/.test(attachJs));

  // Clipboard work belongs in one helper: an embedded WebView refuses the async API
  // and only obeys a real selection, so both screens must share that logic.
  const uiJs = read('client/js/ui.js');
  check('UI.copyText exists and tries both ways',
    /async function copyText/.test(uiJs) && /clipboard\.writeText/.test(uiJs) && /execCommand\('copy'\)/.test(uiJs));
  check('UI exports copyText', /copyText,/.test(uiJs));

  const reportJs = read('client/js/report.js');
  check('the app swaps print for a text copy',
    /Config\.isNative/.test(reportJs) && /rep\.nativeHint/.test(reportJs) && /UI\.copyText/.test(reportJs));
  const backupJs = read('client/js/backup.js');
  check('the app shows the snapshot instead of downloading it',
    /Config\.isNative/.test(backupJs) && /showNativeSnapshot/.test(backupJs) && /UI\.copyText/.test(backupJs));

  const i18n = read('client/js/i18n.js');
  for (const key of ['nativeHint', 'copyBtn', 'copied', 'copyOk', 'copyFail', 'testOk', 'testFail', 'modeNative',
    'serverTitle', 'serverHint']) {
    const hits = (i18n.match(new RegExp(`\\b${key}:`, 'g')) || []).length;
    check(`i18n has ${key} in both languages`, hits >= 2, `${hits}x`);
  }

  // 7) the first screen of an install ---------------------------------------
  // The login screen builds no shell, so it must carry its own toast host — without
  // one UI.toast() returns early and every error on that screen is silent. And the
  // server address has to be reachable from THERE, because Settings is behind login.
  const indexHtml = read('client/index.html');
  check('login screen has a toast host', /class="toast-host"/.test(indexHtml));
  check('login screen can set the server address', /id="srv-box"/.test(indexHtml) && /id="srv-input"/.test(indexHtml));
  const loginJs = read('client/js/login.js');
  check('the box opens by itself inside the app', /if \(Config\.isNative\) openServerBox\(\);/.test(loginJs));
  check('and opens itself when the server cannot be reached', /err\.status === 0\) openServerBox\(\)/.test(loginJs));
  check('the address box tests the connection before claiming success',
    /API\.get\('\/health'\)/.test(loginJs) && /set\.testOk/.test(loginJs));

  // 8) the phone will talk cross-origin --------------------------------------
  let serverUp = true;
  try {
    await fetch(`${API_BASE}/health`, { method: 'GET' });
  } catch (_e) { serverUp = false; }
  if (!serverUp) {
    console.log('\n! server not running — the two CORS checks were skipped (start: npm run dev)');
  } else {
    // The bundled app asks from https://localhost; a real phone asks from the LAN.
    const res = await fetch(`${API_BASE}/health`, { headers: { Origin: 'https://localhost' } });
    const acao = res.headers.get('access-control-allow-origin') || '';
    check('health answers the packaged origin with CORS', !!acao, `status=${res.status} acao=${acao}`);

    const pre = await fetch(`${API_BASE}/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://localhost',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,authorization,x-app-lang',
      },
    });
    const allow = (pre.headers.get('access-control-allow-headers') || '').toLowerCase();
    check('preflight allows the headers api.js sends',
      pre.status < 400 && allow.includes('authorization') && allow.includes('x-app-lang'),
      `status=${pre.status} allow=${allow.slice(0, 60)}`);
  }

  report();
}

function report() {
  console.log(`\nphase7: ${pass}/${pass + fail} assertions`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => { console.error('phase7 crashed:', err); process.exit(1); });
