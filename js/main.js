/* MiNI BRoKER — shared site behaviour: navigation, wallet notice,
   referral capture, marketplace links, collab loading. */
(function () {
  var CFG = window.MB_CONFIG || {};
  var body = document.body;
  var BASE = body.getAttribute('data-base') || '';
  var PAGE = body.getAttribute('data-page') || 'home';

  var NAV = [
    ['Home', '', 'home'],
    ['NFTs', 'nfts/', 'nfts'],
    ['WhiteList', 'whitelist/', 'whitelist'],
    ['Referral', 'referral/', 'referral'],
    ['Collabs', 'collabs/', 'collabs'],
    ['Staking', 'staking/', 'staking'],
    ['My Stack', 'mystack/', 'mystack'],
    ['Trading', 'trading/', 'trading'],
    ['Roadmap', 'roadmap/', 'roadmap'],
    ['Token', 'token/', 'token'],
    ['FIND THE BROKER', 'huntgame/', 'huntgame'],
    ['PIXEL ART STUDIO', 'studio/', 'studio']
  ];

  var MB = window.MB = {
    base: BASE,
    page: PAGE,
    cfg: CFG,
    REF_RE: /^[A-Z0-9]{6}$/,
    GTD_TARGET: 3,
    asset: function (p) { return BASE + p; },
    nftSrc: function (id) { return BASE + (CFG.nft && CFG.nft.dir ? CFG.nft.dir : 'assets/nft/') + id + '.png'; },
    nftIds: function () {
      var first = (CFG.nft && CFG.nft.first) || 91;
      var count = (CFG.nft && CFG.nft.count) || 60;
      var out = [];
      for (var i = 0; i < count; i++) out.push(first + i);
      return out;
    },
    read: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    write: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} },
    shuffle: function (a) {
      var r = a.slice(), i, j, t;
      for (i = r.length - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); t = r[i]; r[i] = r[j]; r[j] = t; }
      return r;
    },
    el: function (id) { return document.getElementById(id); },
    show: function (node, on) { if (node) node.hidden = !on; }
  };

  /* ---------------- navigation ---------------- */
  var navHost = MB.el('mb-nav');
  if (navHost) {
    navHost.innerHTML = NAV.map(function (n) {
      var on = n[2] === PAGE ? ' class="is-on"' : '';
      return '<a href="' + BASE + n[1] + '"' + on + '>' + n[0] + '</a>';
    }).join('') + '<a href="#" data-mb="market" target="_blank" rel="noopener">MARKETPLACE</a>';
  }

  var footHost = MB.el('mb-foot');
  if (footHost) {
    footHost.innerHTML =
      '<span class="pixel" style="font-size:12px;line-height:1.6">MiNI BRoKER</span>' +
      '<div class="row" style="gap:10px">' +
        '<a class="btn btn--sm" href="' + (CFG.xUrl || '#') + '" target="_blank" rel="noopener">X</a>' +
        '<a class="btn btn--sm btn--y" href="' + BASE + 'whitelist/">WHITELIST</a>' +
        '<a class="btn btn--sm" href="' + BASE + 'roadmap/">ROADMAP</a>' +
        '<a class="btn btn--sm btn--sky" data-mb="market" href="#" target="_blank" rel="noopener">MARKETPLACE</a>' +
      '</div>';
  }

  // Marketplace: one configured external URL, no internal page.
  var market = CFG.openSeaUrl && String(CFG.openSeaUrl).trim();
  Array.prototype.forEach.call(document.querySelectorAll('[data-mb="market"]'), function (a) {
    if (market) { a.setAttribute('href', market); return; }
    a.setAttribute('href', '#');
    a.classList.add('btn--off');
    a.removeAttribute('target');
    a.addEventListener('click', function (e) { e.preventDefault(); });
    if (a.textContent.indexOf('OpenSea') > -1) a.textContent = 'OpenSea COLLECTION — SOON';
  });

  var tokenLink = document.querySelector('[data-mb="token"]');
  if (tokenLink) {
    var t = CFG.tokenUrl && String(CFG.tokenUrl).trim();
    if (t) {
      tokenLink.setAttribute('href', t);
      tokenLink.setAttribute('target', '_blank');
      tokenLink.setAttribute('rel', 'noopener');
      tokenLink.classList.remove('btn--off');
      tokenLink.classList.add('btn--green');
      tokenLink.textContent = '$MINiBRKR PAGE';
    } else {
      tokenLink.addEventListener('click', function (e) { e.preventDefault(); });
    }
  }

  var menuBtn = document.querySelector('[data-mb="menu"]');
  if (menuBtn && navHost) {
    menuBtn.addEventListener('click', function () { navHost.classList.toggle('is-open'); });
  }

  // Ordinary browser navigation; falls back to Home when there is no history.
  Array.prototype.forEach.call(document.querySelectorAll('[data-mb="back"]'), function (b) {
    b.addEventListener('click', function () {
      if (window.history.length > 1 && document.referrer) { window.history.back(); return; }
      window.location.href = BASE || './';
    });
  });

  /* ---------------- wallet notice ---------------- */
  var modal = MB.el('mb-modal');
  Array.prototype.forEach.call(document.querySelectorAll('[data-mb="wallet"]'), function (b) {
    b.addEventListener('click', function () { if (modal) modal.classList.add('is-open'); });
  });
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.getAttribute('data-mb') === 'modal-close') modal.classList.remove('is-open');
    });
  }

  /* ---------------- referral capture ----------------
     ?ref=CODE works on every page, changes no routing, and is stored once. */
  MB.captureRef = function () {
    var code = '';
    try { code = String(new URLSearchParams(window.location.search).get('ref') || '').toUpperCase().trim(); } catch (e) {}
    if (!MB.REF_RE.test(code)) return;
    if (!MB.read('mb_ref_from')) MB.write('mb_ref_from', code);
  };
  MB.captureRef();

  MB.refApi = function () { return String(CFG.referralApi || '').trim(); };

  MB.siteBase = function () {
    var d = String(CFG.siteDomain || '').trim();
    if (d) return d.replace(/\/+$/, '') + '/';
    // Base-path safe: works at a custom domain and under /repository-name/.
    var path = window.location.pathname.replace(/index\.html$/, '');
    var here = window.location.origin + path;
    if (BASE === '../') here = here.replace(/[^\/]+\/$/, '');
    return here;
  };

  MB.refPost = function (payload) {
    var url = MB.refApi();
    if (!url) return Promise.resolve(null);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); }).catch(function () { return null; });
  };

  MB.refStatus = function (code) {
    var url = MB.refApi();
    if (!url || !code) return Promise.resolve(null);
    return fetch(url + '?action=status&code=' + encodeURIComponent(code))
      .then(function (r) { return r.json(); }).catch(function () { return null; });
  };

  /* ---------------- collabs ---------------- */
  var host = MB.el('mb-collabs');
  if (host) {
    var empty = MB.el('mb-collabs-empty');
    var render = function (list) {
      if (!list.length) { MB.show(empty, true); return; }
      MB.show(empty, false);
      host.innerHTML = list.map(function (c) {
        var handle = c.username ? (String(c.username).charAt(0) === '@' ? c.username : '@' + c.username) : '';
        var post = c.post || CFG.xUrl || '#';
        return '<div class="collab">' +
          '<div class="collab__img" role="img" aria-label="' + esc(c.name) + '" style="background-image:url(' + esc(c.image) + ')"></div>' +
          '<span class="collab__n">' + esc(c.name) + '</span>' +
          '<span class="collab__u">' + esc(handle) + '</span>' +
          '<a class="btn btn--sm btn--sky" href="' + esc(post) + '" target="_blank" rel="noopener">VIEW POST</a>' +
          '</div>';
      }).join('');
    };
    var url = MB.refApi();
    if (!url) { render([]); }
    else {
      fetch(url + '?action=collabs')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var list = (j && j.collabs ? j.collabs : []).filter(function (c) { return c && c.name; });
          render(list);
        })
        .catch(function () { render([]); });
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  MB.esc = esc;

  /* ---------------- clipboard ----------------
     execCommand first: the async API is blocked inside embedded frames. */
  MB.copy = function (text, onOk, onManual) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'readonly');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:none;padding:0';
    document.body.appendChild(ta);
    var ok = false;
    try { ta.focus(); ta.select(); ta.setSelectionRange(0, text.length); ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (ok) { onOk(); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onOk, onManual);
      return;
    }
    onManual();
  };
})();
