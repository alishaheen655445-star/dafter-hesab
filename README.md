# دفتر حساب — Daftar Hesab (Personal Ledger)

Web app to track debts/credits (طلب و بدهی) with parties, checks, and loans.
Mobile-first, RTL, bilingual (Arabic + Persian), wrapped in Capacitor as an
Android app for the graduation project.


---

## Tech Stack

| Layer       | Choice                                       |
|-------------|----------------------------------------------|
| Backend     | Node.js + Express + MySQL (mysql2 pool)      |
| Auth        | JWT (Bearer) + bcrypt                        |
| Frontend    | Vanilla JS + hand-written CSS (no build)     |
| i18n        | Arabic (ar) + Persian (fa), full RTL         |
| Calendar    | Jalali (fa) + Gregorian (ar)                 |
| Money       | Integer minor units (BIGINT cents)           |
| Uploads     | Multer (local disk under `client/uploads/`)  |
| Android     | Capacitor 7 (`android/` generated project)   |

---

## Features (mirroring the reference app)

Everything below is live, **and everything below is free**. The reference app puts
lock, automatic backup, the installment calculator, settlement and the full support
pages behind «نسخه کامل»; here they are ordinary features. Two behave differently
inside the APK (no print dialog, no file downloads) — see
[Android](#android-capacitor).

- 👥 Unlimited parties (طرف حساب)
- 💰 Unlimited transactions per party (credit / debit)
- ✏️ Edit transactions
- 🔔 Reminders with date/time
- ☁️ Online backup on server (via phone number)
- 💾 Offline backup (JSON export/import)
- 💳 Bank card / account / IBAN per party
- 📝 Multiple notes per party (shown on the party header)
- 🗑 Deleting a party closes its transactions, cheques, loans and reminders with it —
  totals and reports never count a book that can no longer be opened
- 📞 Phone number per party
- 💱 Currency unit (Toman / Rial / Dinar / Dollar / Dirham / Euro / Afghani)
- ⚙️ Settings screen (name, currency, language, footer, password, server address)
- 🗓 Jalali date preview next to every native date picker
- 📝 Footer text on messages & reports
- 📑 Printable report → PDF (party statement + whole-book summary)
- 🖼 Image attachment per transaction and per check
- 🧾 Check management (issued / received)
- 🏦 Loan management with installments
- 🔒 App lock with a PIN pad (قفل التطبيق)
- 🔁 Automatic backup to the server — daily on open and after every write (نسخهٔ خودکار)
- 🧮 Installment calculator inside the loan form (محاسبه قسط)
- ✅ One-tap settlement of a party's balance (تسوية)
- ℹ️ Support page: about, guide, privacy, share (الدعم)

---

## Project Structure

```
دفتر حساب/
├── client/                    Static frontend (vanilla JS, no build step)
│   ├── index.html             Login / Register
│   ├── home.html              Parties list (main screen)
│   ├── party.html             Party detail: statement, notes, bank card
│   ├── checks.html            Checks management
│   ├── loans.html             Loans / installments + reminders
│   ├── report.html            Printable report (statement / book summary)
│   ├── backup.html            Offline file + server copies
│   ├── settings.html          Profile, currency, language, footer, password, lock
│   ├── lock.html              The PIN pad screen (app lock)
│   ├── support.html           About · guide · privacy · share
│   ├── css/styles.css         RTL design system (logical properties)
│   ├── js/                    api, i18n, jalali, ui, icons, attach, report, backup,
│   │                          party-select, lock, support, autobackup, *-form
│   └── uploads/               Image attachments (served, gitignored)
├── server/                    Express API
│   ├── server.js              Entry point
│   ├── config/db.js           MySQL pool
│   ├── controllers/           Thin HTTP handlers
│   ├── services/              Business logic (auth, parties, transactions, checks,
│   │                          loans, reminders, attachments, reports, backup)
│   ├── models/                SQL data access
│   ├── routes/                Express routers
│   ├── middleware/            auth, errorHandler (answers in ar/fa), validate, upload (multer)
│   ├── validators/            express-validator chains
│   └── utils/                 ApiError, asyncHandler, jwt, money, response, i18nMessages
├── storage/backups/           Server-side backup copies (NOT web-served)
├── capacitor.config.json      Android identity (appId, appName, webDir)
├── android-web/               Staged copy of client/ that gets packaged (generated)
├── android/                   Generated Capacitor Android project (npx cap add android)
├── database/
│   ├── schema.sql             Tables + FKs
│   └── seed.sql               Optional demo data
├── scripts/
│   ├── load-db.ps1            Loads schema+seed into MySQL
│   ├── lan-url.mjs            Prints the LAN API address to type inside the app
│   ├── prepare-android-web.mjs Copies client/ -> android-web/ (drops uploads/)
│   ├── make-android-icons.ps1 Draws the launcher icons + splash (System.Drawing)
│   ├── smoke-test.mjs         Auth smoke (register/login/me)
│   ├── test-i18n.mjs          Static i18n audit (dictionaries, keys, previews)
│   ├── test-config.mjs        The DB pool: a URL deploy keeps its options
│   └── test-*.mjs             Per-phase API suites (see Testing)
├── package.json
├── .env / .env.example
└── .gitignore
```

---

## Testing

Start the server first (`npm run dev`), then run any of:

| Command               | Covers                                            | Result |
|-----------------------|---------------------------------------------------|--------|
| `npm run test:jalali` | Jalali ↔ Gregorian conversion                     | 13/13  |
| `npm run test:config` | the DB pool: URL deploy keeps its options          | 10/10  |
| `npm run test:parties`| parties + notes + bank info                       | 17/17  |
| `npm run test:txns`   | transactions + running balance + filters          | 26/26  |
| `npm run test:phase4` | checks + loans/installments + reminders           | 67/67  |
| `npm run test:phase5` | uploads + reports + backup export/import/online   | 80/80  |
| `npm run test:i18n`   | ar/fa dictionary parity + key + Jalali previews    | 27/27  |
| `npm run test:phase6` | settings API + server replies in ar/fa             | 36/36  |
| `npm run test:phase7` | the Android wrap: config, manifest, bundle, CORS   | 67/67  |
| `npm run test:phase8` | the redesign: tokens, sprite, shell, fields, art    | 136/136 |
| `npm run test:phase9` | lock + automatic backup + settle + calculator + support | 141/141 |

`npm test` runs the whole chain: **620 assertions**, all green.

Each suite cleans up after itself — including the fixture party the transactions
suite needs — and measures counters as deltas, so it can be re-run against an
account that already holds demo rows without leaving a trace in the lists.
`test:i18n`, `test:phase8` and `test:config` are static — they read the source files
(or a lazily-built pool that never connects), so they also run with the server
stopped.

---

## Getting Started

1. Install Node.js 18+ and XAMPP (MySQL).
2. Copy `.env.example` → `.env` and adjust values.
3. Create the database: `CREATE DATABASE daftar_hesab_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
4. Load schema: `npm run db:load`
5. Install deps: `npm install`
6. Run: `npm run dev` → open http://localhost:3100

On a managed provider the same image reads either `DB_*` or one `DATABASE_URL` —
both paths go through the same pool options (`dateStrings`, exact money as text,
ten connections), which is what `npm run test:config` pins down.

---

## Build Phases

- [x] Phase 1: Setup + DB schema + Auth
- [x] Phase 2: Parties CRUD
- [x] Phase 3: Transactions + Running balance
- [x] Phase 4: Checks + Loans + Reminders
- [x] Phase 5: Image upload + PDF + Backup
- [x] Phase 6: i18n (ar/fa) + RTL + Jalali + UI polish
- [x] Phase 7: Capacitor Android wrap
- [x] Phase 8: visual redesign to match the reference app
- [x] Phase 9: the reference app's «full version» features, free here

---

## Android (Capacitor)

The APK holds the static client; the API stays on the Node server. The app is one
origin on the web and two on the phone, so everything else in this section follows
from that.

**Identity** (`capacitor.config.json`): appId `com.daftarhesab.app`, label «دفتر حساب»,
`webDir: android-web`. The reference app's own id (`ir.rezadev.payment`) is not used.

| Command | What it does |
|---|---|
| `npm run lan` | Prints this machine's LAN API address to type into the app |
| `npm run cap:prep` | Copies `client/` → `android-web/`, leaving `client/uploads/` out |
| `npm run cap:sync` | Prep + `cap sync android` (run after any client change) |
| `npm run cap:icons` | Draws launcher icons (5 densities × 3 files) + 11 splash screens |
| `npm run cap:open` | Opens the project in Android Studio |
| `npm run cap:apk` | Prep + sync + `gradlew assembleDebug` → debug APK |

**What changes inside the app** (decided by `Config.isNative`, which reads
`window.Capacitor` — the Android scheme is `https://localhost`, so a protocol test
alone would wrongly answer "web"):

- The API base is absolute (`http://<lan-ip>:3100/api`); the login screen shows an
  address box with a connection test, because Settings sits behind the login.
- Reports: no print dialog in a WebView, so the sheet is offered as copyable text.
- Offline backup: no download manager, so the JSON is shown as text — the server
  copies are the real mobile path.
- Attachments work through `<input type="file">` (the WebView opens a picker) and
  picture URLs are rebuilt against the API origin.

**Prerequisites for the build itself** (neither is present on this dev machine, so
`npm run cap:apk` cannot produce an APK here):

1. Android SDK + Android Studio (`ANDROID_HOME` set, platform-tools + build-tools).
2. Gradle 8.11.1 — the wrapper downloads it from `services.gradle.org` on the first
   run; that download stalled here (0 bytes after 17 min), so use a network where it
   completes, or point `distributionUrl` in `android/gradle/wrapper/gradle-wrapper.properties`
   at a local copy.

Everything that does not need those two — the config, the patched manifest, the
staged bundle, the WebView code branches and CORS — is covered by
`npm run test:phase7` (67 assertions).

---

## Look (Phase 8)

The client is restyled to read like the reference app rather than like a generic
web form. Nothing about the API or the data model changed — only how it is drawn.

**Colour carries meaning, so it is never decorative:**

| Token | Used for |
|---|---|
| `--credit #2196f3` | money in: «I received», a cheque coming to me, the blue FAB |
| `--debit #e91e63` | money out: «I gave», a cheque I issued, overdue, destructive actions |
| `--teal #10c690` | the active tab, confirmations, the bar over a transaction list |
| `--indigo #5c6bc0` | the loan book and its FAB |
| `--navy #0f3d63` | the pill that names a section |
| `--grad` | identity cards: the home hero, a party header, a summary card |

A colour is deliberately **not** mapped to `received`/`given` on the cheque and
loan segments: «received» means money in for a cheque and a debt on me for a loan,
so the same word would need opposite colours — those pills stay teal.

**Icons and illustrations are hand-drawn SVG.** `client/js/icons.js` injects one
sprite of ~45 `currentColor` line icons; static markup writes
`<span class="ico-slot" data-ico="phone">` and `UI.mountIcons()` fills it during
`I18n.applyDocument()`. `client/img/empty-*.svg` are the four empty states. No icon
font and no CDN: the APK is offline under a CSP that would block both, and an
emoji renders differently on every device.

**One field style.** `<label class="fld">` with a `<span class="lbl">` punched into
the border (Material outlined), `<em class="err-text">` that costs nothing while
empty, `aria-invalid` for the red ring, `<span class="suffix">` to keep the currency
unit inside a money box, `.fld.pair` for two-up rows and `.fld.tall` for textareas.
Tab strips became `.seg` pills (`.on-white` inside a card, `.money` where the choice
is credit/debit), and every date field shows its Jalali reading in a `.date-preview`
chip under the native picker.

**Screens:** a 3-tab bottom bar (reminders · home · settings); home is a gradient
hero with a balance donut and the loans/cheques tiles; a party opens with a gradient
identity card over seven quick actions and two floating buttons (gave / got);
cheques and loans each open with a gradient summary card describing the **whole
book**, with segments and a Jalali-correct month navigator narrowing only the list
under it; settings is a profile card, mint icon rows to backup and reports, navy
section pills, and a red sign-out row.

**The last row stays reachable.** The bottom bar is `position: fixed`, so the page
column reserves `--nav-h` under itself — and that only works while the body is allowed
to grow. As long as it carried `height: 100%`, a long screen painted its own overflow
over that padding: on a party the «حفظ المعلومات» button sat 43px under the bar, with
the bar swallowing the click. Measured per screen in the browser (party, settings,
home, loans, report, checks, reminders, backup, support), every last button now clears
the bar, and a sheet's own submit keeps 18px above the physical edge.

Covered by `npm run test:phase8` (136 assertions) and checked in the browser on
every screen in both languages: no console errors, no unmounted icon slots, no
untranslated keys.

---

## Premium, for free (Phase 9)

The reference app sells five things as «نسخه کامل». They are built here, wired to
the database, and cost nothing — and the settings screen only ever advertises what
actually works.

**🔒 App lock (`lock.html` + `PUT /auth/pin`)** — a 4-to-8-digit PIN on its own pad
screen. The hash lives in `users.pin_hash` (bcrypt, cost 8) and the profile endpoint
only ever answers `has_pin`, never the code. `API.Auth.require()` gates every
signed-in screen and bounces to `lock.html?back=…`, keeping the place the user was
looking at. The unlock state is per-tab (`sessionStorage`), so a new tab has to pass
the pad again. Five wrong codes lock the pad for 60 seconds in memory. Because a
forgotten PIN must not mean a lost ledger, **the account password is the only way
back**: setting, changing or removing a PIN always pays with it, and a forgotten PIN
is reset with the password — never bypassed.

**🔁 Automatic backup (`js/autobackup.js`)** — on by default, and silent by design.
`api.js` fires `dh:written` after any successful non-GET except `/backup*` (otherwise
a copy would announce a write and ask for another copy, forever); the copier waits
for 15 seconds of quiet, never copies twice within 3 minutes, and also copies once a
day when a screen opens. A failure is swallowed: a background task that shouts
"network error" while you are typing a number is worse than none. Copies are stored
with a `kind` — the server prunes **automatic** ones to the newest 5 and **manual**
ones to 10, so the background task can never push the copy you saved yourself off
the list. An automatic copy is a normal copy: downloadable and restorable — and the
list badges the app's own copies («تلقائي» / «خودکار») so nobody reads them as a press
they forgot making.

**✅ Settlement (`POST /parties/:id/settle`)** — one entry on the opposite side that
brings the balance to zero. It takes no amount from the body (the server reads its
own balance, so a stale sheet cannot invent money), it is a normal transaction so it
can be deleted if you change your mind, and nothing in the history is erased.

**🧮 Installment calculator (`loan-form.js`)** — two of the three numbers give the
third: principal + monthly → how many, or principal + how many → monthly (rounded up,
so the plan never ends short; the server still moves the difference to the last
installment). It is an *expander* inside the loan sheet, not a second sheet, because
`UI.modal()` closes whatever is open. Nothing it computes is sent: `c_monthly` and
`c_count` never enter the payload.

**ℹ️ Support (`support.html`)** — about, a seven-step guide, a data-and-privacy panel
that states where the book really lives (the server address the user set), what the
lock stores, and how long copies are kept, plus the honest note that there are no
app-store review screens to rate, and a share/copy row. It shows the live mode
(browser or APK), the API base and the last automatic stamp.

Field-level validation messages are now drawn under the input that caused them:
`api.js` reads the failure list from the envelope's `errors` array, so a wrong
password, a short PIN or a repeated-code mismatch name the box in Arabic or Persian
(the server translates through `X-App-Lang`), instead of only flashing a toast.

Two things the review pass found and fixed, because a book must not lie:

**🧾 A deleted party closes its own book** — `partyModel.softDeleteLedger()` marks that
party's transactions, cheques and loans as gone the moment the party is gone. Nothing
is erased, but a whole-book sum filters on `deleted_at IS NULL`, and rows under an
account no screen can open any more would still have been counted in the totals and in
the reports. `reminderModel` follows the same rule: a reminder that carries a closed
account's name stops showing and stops firing — while reminders the user wrote for
themselves (no party at all) stay. A one-off backfill closed the 138 rows that older
deletes had left open.

**📝 The note on a file is readable on the screen** — the party header shows its note
under the phone number (`.phead .nt`, clamped to two lines), not only inside the edit
sheet it was written in.

Covered by `npm run test:phase9` (135 assertions) and walked through in the browser:
set a PIN → get bounced → unlock on the pad → remove it again, settle a live party,
run the calculator in both directions, and read the support page in both languages.

---

## Project Home

This folder (`Desktop\دفتر حساب`) is the single working copy of the app — it is not
moved or split. The reference app being mirrored is `ir.rezadev.payment`
(دفتر حساب | طلب ، بدهی ، چک ، وام) on CafeBazaar.

- Dev server: `npm run dev` → http://localhost:3100 (API + static client, one origin)
- Health: `GET /api/health` → `{ success, database: 'connected' }`
- Smoke test (needs the server running): `node scripts/smoke-test.mjs`
- Database: MySQL/MariaDB via XAMPP on `127.0.0.1:3306`, schema `daftar_hesab_app`,
  loaded with `npm run db:load` (forces `utf8mb4` so Arabic/Persian text survives)
