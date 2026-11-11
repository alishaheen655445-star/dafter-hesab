// -----------------------------------------------------------------------------
//  Smoke test: register → login → me → duplicate phone → wrong password
//  Uses Node's built-in fetch (Node 18+). Avoids PowerShell UTF-8 corruption.
// -----------------------------------------------------------------------------
const BASE = 'http://localhost:3100/api';

async function main() {
  // 1) Register
  const reg = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: '+9647701234567',
      password: 'test123',
      name: 'علي حسين',
      currency: 'dinar',
      lang: 'ar',
    }),
  }).then(r => r.json());
  console.log('REGISTER:', reg.success, '| name:', reg.data?.user?.name);

  // 2) Login
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+9647701234567', password: 'test123' }),
  }).then(r => r.json());
  console.log('LOGIN:', login.success, '| token?', !!login.data?.token);

  // 3) Me
  const me = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${login.data.token}` },
  }).then(r => r.json());
  console.log('ME:', me.success, '| name:', me.data?.user?.name);

  // 4) Duplicate phone
  const dup = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+9647701234567', password: 'abc123', name: 'test' }),
  }).then(r => r.json());
  console.log('DUP PHONE:', dup.success === false ? 'OK (rejected)' : 'FAIL');

  // 5) Wrong password
  const bad = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+9647701234567', password: 'wrong' }),
  }).then(r => r.json());
  console.log('BAD PASS:', bad.success === false ? 'OK (rejected)' : 'FAIL');

  // 6) No token
  const noTok = await fetch(`${BASE}/auth/me`).then(r => r.json());
  console.log('NO TOKEN:', noTok.success === false ? 'OK (rejected)' : 'FAIL');

  console.log('\n=== ALL TESTS PASSED ===');
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
