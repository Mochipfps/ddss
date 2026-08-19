/* Referral dashboard: code, link, copy, progress, GTD status. */
(function () {
  var open = MB.el('ref-open'), locked = MB.el('ref-locked');
  if (!open) return;

  var done = MB.read('mb_wl_done') === '1';
  var code = MB.read('mb_my_ref_code') || '';
  if (!done) return;

  MB.show(locked, false);
  MB.show(open, true);

  // Issue the code now if the completion call could not reach the backend earlier.
  if (!MB.REF_RE.test(code)) {
    MB.refPost({
      action: 'createCode',
      xUsername: MB.read('mb_wl_x') || '',
      walletAddress: MB.read('mb_wl_wallet') || ''
    }).then(function (j) {
      if (j && j.code && MB.REF_RE.test(String(j.code).toUpperCase())) {
        code = String(j.code).toUpperCase();
        MB.write('mb_my_ref_code', code);
        paint();
        refresh();
      }
    });
  }
  paint();
  refresh();

  function link() { return code ? MB.siteBase() + '?ref=' + code : ''; }

  function paint(count) {
    MB.el('ref-code').textContent = code || '——————';
    MB.el('ref-link').textContent = link();
    var n = count || 0;
    MB.el('ref-count').textContent = n;
    var bars = MB.el('ref-prog').children;
    for (var i = 0; i < bars.length; i++) bars[i].classList.toggle('is-on', n > i);
    var ok = n >= MB.GTD_TARGET;
    var g = MB.el('ref-gtd');
    g.textContent = ok ? 'ELIGIBLE' : 'NOT YET ELIGIBLE';
    g.style.background = ok ? 'var(--green)' : 'var(--grey)';
    g.style.color = ok ? 'var(--cream)' : 'var(--ink)';
    MB.show(MB.el('ref-win'), ok);
  }

  function refresh() {
    if (!MB.REF_RE.test(code)) return;
    MB.refStatus(code).then(function (j) {
      if (j && j.status === 'success') paint(Number(j.validReferrals) || 0);
    });
  }

  MB.el('ref-copy').addEventListener('click', function () {
    var l = link();
    if (!l) return;
    var ok = MB.el('ref-copied'), manual = MB.el('ref-manual');
    MB.copy(l, function () {
      MB.show(ok, true); MB.show(manual, false);
      window.setTimeout(function () { MB.show(ok, false); }, 2600);
    }, function () {
      selectLink();
      MB.show(manual, true); MB.show(ok, false);
      window.setTimeout(function () { MB.show(manual, false); }, 2600);
    });
  });

  function selectLink() {
    try {
      var r = document.createRange();
      r.selectNodeContents(MB.el('ref-link'));
      var s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    } catch (e) {}
  }
})();
