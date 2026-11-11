// -----------------------------------------------------------------------------
//  icons.js — one inline SVG sprite, ~45 line icons.
//
//  Why hand-drawn instead of an icon font or CDN: the APK runs OFFLINE under a
//  strict helmet CSP, so a <link> to fonts.googleapis or a CDN sprite would be
//  blocked and the screen would show empty squares. A sprite injected once at
//  startup costs one function call and works everywhere, and because it is
//  `currentColor` the icons take the colour of whatever button holds them.
//
//  Usage: UI.icon('phone') -> <svg class="dh-i"><use href="#dh-phone"></use></svg>
//  Geometry is 24x24, stroke-based, no fills — stroke settings live in CSS
//  (.dh-i) so every icon stays visually consistent without repeating attributes.
// -----------------------------------------------------------------------------
(function (global) {
  'use strict';

  // name -> path data. Everything is strokes on a 24x24 box.
  const P = {
    // --- navigation ---------------------------------------------------------
    home: 'M3 11l9-7 9 7v8a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z',
    bell: 'M6 9a6 6 0 1 1 12 0c0 4.5 2 6 2 6H4s2-1.5 2-6M10 20a2 2 0 0 0 4 0',
    gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM4.2 10.6l-1.6-1.1 1.3-2.9 1.9.5 1.5-1.4-.4-1.9 2.9-1.3 1.1 1.6h2.1l1.1-1.6 2.9 1.3-.4 1.9 1.5 1.4 1.9-.5 1.3 2.9-1.6 1.1v2.1l1.6 1.1-1.3 2.9-1.9-.5-1.5 1.4.4 1.9-2.9 1.3-1.1-1.6h-2.1l-1.1 1.6-2.9-1.3.4-1.9-1.5-1.4-1.9.5-1.3-2.9 1.6-1.1z',

    // --- people -------------------------------------------------------------
    user: 'M20 21v-1.6a4.4 4.4 0 0 0-4.4-4.4H8.4A4.4 4.4 0 0 0 4 19.4V21M12 11a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2z',
    'user-add': 'M14 21v-1.6a4.4 4.4 0 0 0-4.4-4.4H6.4A4.4 4.4 0 0 0 2 19.4V21M10 11a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2zM18 8v6M15 11h6',
    'user-card': 'M2 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM8 10.4a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8zM5.4 16c.4-1.5 1.5-2.2 2.6-2.2s2.2.7 2.6 2.2M14 9h6M14 13h6M14 17h4',
    users: 'M16 21v-1.6a4.4 4.4 0 0 0-4.4-4.4H6.4A4.4 4.4 0 0 0 2 19.4V21M9 11a3.6 3.6 0 1 0 0-7.2A3.6 3.6 0 0 0 9 11zM22 21v-1.6a4.4 4.4 0 0 0-3.3-4.3M15.5 4.1a3.6 3.6 0 0 1 0 6.9',

    // --- money --------------------------------------------------------------
    'trend-up': 'M3 17l6-6 4 4 8-8M16 7h5v5',
    'trend-down': 'M3 7l6 6 4-4 8 8M16 17h5v-5',
    coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.2 9.4c0-1.3 1.2-2 2.8-2s2.8.7 2.8 2-1.2 1.7-2.8 2-2.8.7-2.8 2 1.2 2 2.8 2 2.8-.7 2.8-2M12 5.8v12.4',
    wallet: 'M3 7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6H5a2 2 0 0 1-2-2zM17.5 13.5h.01',
    card: 'M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 11h20M6 15h4',
    'card-add': 'M2 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 11h16M19 17h4M21 15v4M6 15h4',
    banknote: 'M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM6 9h.01M18 15h.01',
    cash: 'M4 10h16v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10l1.6-4.8A2 2 0 0 1 7.5 4h9a2 2 0 0 1 1.9 1.2L20 10M4 10h16M12 14h.01',

    // --- documents ----------------------------------------------------------
    doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
    'doc-edit': 'M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5M13 3l5 5h-5zM20.2 13.8a1.7 1.7 0 0 1 2.4 2.4l-4.6 4.6-3.1.7.7-3.1z',
    pdf: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M8.5 17v-3.5h1a1.2 1.2 0 0 1 0 2.4h-1M13 17v-3.5h.9a1.75 1.75 0 0 1 0 3.5zM17.5 13.5H19v3.5',
    book: 'M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2zM4 17h15M9 7h6',
    checkbook: 'M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 3v18M11 8h5M11 12h5M11 16h3',
    archive: 'M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3H3zM5 7h14v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM10 11h4',
    print: 'M6 9V3h12v6M6 18H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1M6 14h12v7H6z',
    note: 'M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z',
    edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
    trash: 'M3 6h18M8 6V3.8A1.8 1.8 0 0 1 9.8 2h4.4A1.8 1.8 0 0 1 16 3.8V6M6 6l1.2 14.2A1.8 1.8 0 0 0 9 22h6a1.8 1.8 0 0 0 1.8-1.8L18 6M10 11v6M14 11v6',
    sign: 'M3 17c2.5-7 4.5 3 7-2s3.5-5 6.5-5.5c2-.3 3.5 1 4.5 2M4 21h16',
    list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
    filter: 'M4 6h16M7 12h10M10 18h4',
    sort: 'M4 6h16M6 12h12M8 18h8',

    // --- actions ------------------------------------------------------------
    phone: 'M21 16.9v2.6a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.1 3.7 2 2 0 0 1 3.1 1.5h2.6a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7 9.1a16 16 0 0 0 6 6l1-1a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
    chat: 'M21 14.5a2 2 0 0 1-2 2H7.5L3 20.5V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5.2l3.4 2',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.9-4.9',
    plus: 'M12 5v14M5 12h14',
    'plus-circle': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8.5v7M8.5 12h7',
    'minus-circle': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 12h7',
    x: 'M18 6L6 18M6 6l12 12',
    'chev-l': 'M15 18l-6-6 6-6',
    'chev-r': 'M9 18l6-6-6-6',
    'chev-d': 'M6 9l6 6 6-6',
    'check-double': 'M1.5 12.5l4 4 8.5-9.5M10 15.5l2.5 2.5 8.5-9.5',
    // The two keys of the code pad (Phase 9): confirm and delete-one-digit.
    check: 'M4.5 12.6l5 5L19.8 7',
    backspace: 'M8.5 4H20a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8.5L2 12zM12 9.5l5 5M17 9.5l-5 5',
    'badge-check': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.4 12.2l2.5 2.5 4.7-5',
    refresh: 'M21 4v6h-6M3 20v-6h6M4.5 9.5A8 8 0 0 1 18 7l3 3M20 14.5a8 8 0 0 1-13.5 2.5L3.5 14',
    logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
    calculator: 'M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v4M8 19h4',
    lock: 'M5 11h14a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM8 11V7a4 4 0 0 1 8 0v4M12 15v2',
    image: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 16l5-5 4 4 3-3 6 6M8.5 9.5h.01',
    'image-add': 'M21 12V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7M3 16l5-5 4 4 2.5-2.5M17 14v7M13.5 17.5h7',
    calendar: 'M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM16 2.5v5M8 2.5v5M3 10h18',
    tag: 'M20.6 13.4L13 21 2.5 10.5V3.5H9.5l11.1 9.9zM6.5 6.5h.01',
    star: 'M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5-4.7-4.6 6.5-.9z',
    help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.3 9.3a2.8 2.8 0 0 1 5.4.9c0 1.9-2.7 2.3-2.7 3.8M12 17h.01',
    headset: 'M4 14v-2a8 8 0 0 1 16 0v2M2 14.5A2.5 2.5 0 0 1 4.5 12H6v6H4.5A2.5 2.5 0 0 1 2 15.5zM22 14.5A2.5 2.5 0 0 0 19.5 12H18v6h1.5A2.5 2.5 0 0 0 22 15.5zM18 19.5a3 3 0 0 1-3 3h-2',
    cloud: 'M18.5 13.5H17a7.5 7.5 0 1 0-7 10h8.5a4.5 4.5 0 0 0 0-10z',
    'cloud-check': 'M17.5 13.5H16a7.5 7.5 0 1 0-6.4 10h7.9a4.6 4.6 0 0 0 0-10zM8.5 16.5l2.2 2.2 4.3-4.7',
    'cloud-up': 'M18 13.5h-1.5a7.5 7.5 0 1 0-7.3 9.3M12 12v9M9 15l3-3 3 3',
    'cloud-down': 'M18 13.5h-1.5a7.5 7.5 0 1 0-7.3 9.3M12 12v9M9 18l3 3 3-3',
    'arrow-down': 'M12 4v15M6 13l6 6 6-6',
    'arrow-up': 'M12 20V5M6 11l6-6 6 6',
    dots: 'M12 13a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8zM19 13a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8zM5 13a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8z',
    settle: 'M4 4h16v13H4zM2 20h20M8 9l2.5 2.5L16 7',
  };

  const NS = 'http://www.w3.org/2000/svg';

  /**
   * Injected once, hidden, before the first paint of any screen. Built with
   * createElementNS rather than innerHTML: the path data is a constant in this
   * file, but an SVG parser fed by hand stays free of any markup question.
   */
  function install() {
    if (document.getElementById('dh-sprite')) return;
    const svg = document.createElementNS(NS, 'svg');
    svg.id = 'dh-sprite';
    svg.setAttribute('aria-hidden', 'true');
    svg.style.display = 'none';
    for (const [name, d] of Object.entries(P)) {
      const sym = document.createElementNS(NS, 'symbol');
      sym.id = `dh-${name}`;
      sym.setAttribute('viewBox', '0 0 24 24');
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      sym.appendChild(path);
      svg.appendChild(sym);
    }
    (document.body || document.documentElement).appendChild(svg);
  }

  global.Icons = { install, names: Object.keys(P) };

  // Loaded at the end of <body>, so the sprite is in the DOM before the screen
  // script runs and the first UI.icon() markup finds something to point at.
  install();
})(window);
