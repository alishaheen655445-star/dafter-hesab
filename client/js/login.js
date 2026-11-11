// -----------------------------------------------------------------------------
//  login.js — one screen, two modes (login / register). No framework needed:
//  the only state is which tab is active.
// -----------------------------------------------------------------------------
(function () {
  'use strict';

  // Already signed in? Skip the whole screen.
  if (Auth.isLoggedIn()) location.replace('home.html');

  const tabs = document.getElementById('tabs');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');

  // --- where the server is ----------------------------------------------------
  // Inside the APK this box is open from the start: the address is not optional
  // there, and the place that normally holds it (Settings) sits behind the login,
  // so a wrong address would be a door with no handle. On the web it stays hidden
  // until a submit fails with "cannot reach the server".
  const srvBox = document.getElementById('srv-box');
  const srvInput = document.getElementById('srv-input');
  const srvBase = document.getElementById('srv-base');
  const srvState = document.getElementById('srv-state');

  function paintServer() {
    srvBase.textContent = Config.apiBase;
    // Never pull the text out from under a finger that is typing.
    if (document.activeElement !== srvInput) srvInput.value = Config.apiBaseOverride || '';
  }

  function openServerBox() {
    srvBox.hidden = false;
    paintServer();
  }

  /** /api/health needs no token, so this works before anyone is signed in. */
  async function testServer() {
    srvState.className = 'pill mute';
    srvState.textContent = '…';
    const t0 = Date.now();
    try {
      await API.get('/health');
      srvState.className = 'pill ok';
      srvState.textContent = I18n.t('set.testOk', { ms: UI.num(Date.now() - t0) });
      return true;
    } catch (_err) {
      srvState.className = 'pill bad';
      srvState.textContent = I18n.t('set.testFail');
      return false;
    }
  }

  document.getElementById('srv-save').addEventListener('click', async () => {
    const v = srvInput.value.trim();
    if (v && !/^https?:\/\//i.test(v)) {
      UI.showFieldErrors(srvBox, { apiBase: I18n.t('set.apiBaseBad') });
      return;
    }
    UI.showFieldErrors(srvBox, {});
    Config.apiBase = v; // an empty value clears the override
    paintServer();
    UI.toast(I18n.t('common.saved'), 'ok');
    await testServer(); // straight away: "saved" means nothing if it cannot be reached
  });

  document.getElementById('srv-test').addEventListener('click', testServer);

  if (Config.isNative) openServerBox();

  // Keep the language switcher on this page too (top-right of the card).
  I18n.applyDocument();

  function setTab(name) {
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    formLogin.hidden = name !== 'login';
    formRegister.hidden = name !== 'register';
  }

  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (btn) setTab(btn.dataset.tab);
  });

  /** Shared submit handler: call the endpoint, store the session, go home. */
  async function submit(form, path, payloadOf) {
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const res = await API.post(path, payloadOf(form));
      const { token, user } = res.data;
      Auth.setSession(token, user);
      I18n.setLang(user.lang || I18n.lang());
      location.replace('home.html');
    } catch (err) {
      UI.showFieldErrors(form, err.fields || {});
      if (!err.fields || Object.keys(err.fields).length === 0) UI.toast(err.message, 'bad');
      else UI.toast(I18n.t('common.somethingWrong'), 'bad');
      // status 0 = the fetch itself failed (no DNS, no route, wrong address). Show
      // the address box, because a retry with the same address fails the same way.
      if (err.status === 0) openServerBox();
    } finally {
      btn.disabled = false;
    }
  }

  formLogin.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(formLogin, '/auth/login', (f) => ({
      phone: UI.value(f, 'phone'),
      password: f.elements.password.value,
    }));
  });

  formRegister.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(formRegister, '/auth/register', (f) => ({
      name: UI.value(f, 'name'),
      phone: UI.value(f, 'phone'),
      password: f.elements.password.value,
      currency: f.elements.currency.value,
      lang: f.elements.lang.value,
    }));
  });

  // Prefill the language select from the last used one.
  formRegister.elements.lang.value = I18n.lang();
})();
