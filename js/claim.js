/* GTD Claim — four sequential social tasks, then the details, then one
   submission to the separate Claim backend. Availability and duplicate checks
   are decided server-side; the page never assumes a spot is free. */
(function () {
  var CFG = MB.cfg;
  var LIMIT = ((CFG.claim || {}).limit) || 500;
  var LABELS = ['FOLLOW', 'LIKE', 'REPOST', 'COMMENT', 'DETAILS'];
  var flow = MB.el('cl-flow');
  if (!flow) return;

  var st = { stage: 1, follow: false, like: false, repost: false, comment: '', x: '', wallet: '' };

  function post() { return (CFG.pinnedPostUrl && String(CFG.pinnedPostUrl).trim()) || CFG.xUrl; }
  function openX(u) { window.open(u, '_blank', 'noopener'); }
  function api() { return String(CFG.claimApi || '').trim(); }

  /* ---- availability ---- */
  function counts() {
    var url = api();
    if (!url) { MB.show(flow, true); render(); return; }
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || j.status !== 'success') throw new Error('x');
      paintCount(j.claimed, j.remaining);
      if (j.full) { MB.show(MB.el('cl-full'), true); return; }
      MB.show(flow, true);
      render();
    }).catch(function () {
      MB.show(flow, true);
      render();
    });
  }

  function paintCount(claimed, remaining) {
    MB.el('cl-claimed').textContent = claimed == null ? '——' : claimed;
    MB.el('cl-left').textContent = remaining == null ? '——' : remaining;
  }

  /* ---- gating ---- */
  function valid(s) {
    if (s === 1) return st.follow;
    if (s === 2) return st.like;
    if (s === 3) return st.repost;
    if (s === 4) return /x\.com\//i.test(st.comment.trim());
    if (s === 5) return st.x.trim().replace('@', '').length >= 2 && /^0x[a-fA-F0-9]{40}$/.test(st.wallet.trim());
    return false;
  }
  function hint(s) {
    if (s === 1) return 'Use the FOLLOW ON X button to continue.';
    if (s === 2) return 'Use the LIKE POST button to continue.';
    if (s === 3) return 'Use the REPOST button to continue.';
    if (s === 4) return 'Comment on the post, then paste the link to your comment.';
    if (s === 5) {
      if (st.x.trim().replace('@', '').length < 2) return 'Enter your X username.';
      return 'Enter a valid wallet address (0x + 40 characters).';
    }
    return '';
  }

  function render() {
    MB.el('cl-steps').innerHTML = [1, 2, 3, 4, 5].map(function (n) {
      var cls = n < st.stage ? ' is-done' : (n === st.stage ? ' is-now' : '');
      return '<div class="step' + cls + '"><div class="step__n">0' + n + ' / 05</div><div class="step__l">' + LABELS[n - 1] + '</div></div>';
    }).join('');
    MB.el('cl-task').textContent = st.stage === 5 ? 'YOUR DETAILS' : 'TASK 0' + st.stage;

    var t = MB.el('cl-title'), c = MB.el('cl-copy'), b = MB.el('cl-body');
    if (st.stage === 1) {
      t.textContent = 'FOLLOW @MlNiBroker';
      c.textContent = 'Follow the official MiNI BRoKER account on X.';
      b.innerHTML = '<button class="btn btn--sky" id="f-1">FOLLOW ON X</button>';
      MB.el('f-1').addEventListener('click', function () { openX(CFG.xUrl); st.follow = true; render(); });
    } else if (st.stage === 2) {
      t.textContent = 'LIKE THE PINNED POST';
      c.textContent = 'Open the pinned post and like it.';
      b.innerHTML = '<button class="btn btn--sky" id="f-2">LIKE POST</button>';
      MB.el('f-2').addEventListener('click', function () { openX(post()); st.like = true; render(); });
    } else if (st.stage === 3) {
      t.textContent = 'REPOST THE PINNED POST';
      c.textContent = 'Repost the same pinned post.';
      b.innerHTML = '<button class="btn btn--sky" id="f-3">REPOST</button>';
      MB.el('f-3').addEventListener('click', function () { openX(post()); st.repost = true; render(); });
    } else if (st.stage === 4) {
      t.textContent = 'COMMENT ON THE PINNED POST';
      c.textContent = 'Comment on the post, then paste the link to your comment.';
      b.innerHTML = '<button class="btn btn--sky" id="f-4" style="margin-bottom:12px">OPEN POST</button>' +
        '<input class="pin" id="f-c" placeholder="link to your comment" value="' + MB.esc(st.comment) + '">';
      MB.el('f-4').addEventListener('click', function () { openX(post()); });
      bind('f-c', 'comment');
    } else {
      t.textContent = 'YOUR DETAILS';
      c.textContent = 'Enter the X username you used and the wallet address for your GTD spot.';
      b.innerHTML = '<input class="pin" id="f-x" placeholder="@username" style="max-width:420px;margin-bottom:12px" value="' + MB.esc(st.x) + '">' +
        '<input class="pin" id="f-w" placeholder="0x..." value="' + MB.esc(st.wallet) + '">';
      bind('f-x', 'x');
      bind('f-w', 'wallet');
    }
    update();
  }

  function bind(id, key) {
    var i = MB.el(id);
    i.addEventListener('input', function () { st[key] = i.value; update(); });
  }

  function update() {
    var blocked = !valid(st.stage);
    var n = MB.el('cl-next');
    n.disabled = blocked;
    n.textContent = st.stage === 5 ? 'CLAIM GTD' : 'CONTINUE';
    n.classList.toggle('btn--off', blocked);
    MB.el('cl-hint').textContent = blocked ? hint(st.stage) : '';
  }

  MB.el('cl-next').addEventListener('click', function () {
    if (!valid(st.stage)) return;
    if (st.stage < 5) { st.stage++; render(); return; }
    submit();
  });

  /* ---- submission ---- */
  function submit() {
    var n = MB.el('cl-next');
    n.disabled = true;
    MB.el('cl-hint').textContent = 'Submitting your claim...';
    var url = api();
    if (!url) { MB.el('cl-hint').textContent = 'Claims are not open yet. Please try again shortly.'; n.disabled = false; return; }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        xUsername: st.x.trim(),
        walletAddress: st.wallet.trim(),
        commentLink: st.comment.trim()
      })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j) throw new Error('x');
      if (j.status === 'success') {
        paintCount(j.claimed, j.remaining);
        MB.show(flow, false);
        MB.el('cl-mint').textContent = ((CFG.claim || {}).mintDate || '').trim() || 'UPCOMING';
        MB.show(MB.el('cl-done'), true);
        window.scrollTo(0, 0);
        return;
      }
      if (j.status === 'duplicate') {
        MB.show(flow, false);
        MB.show(MB.el('cl-dupe'), true);
        window.scrollTo(0, 0);
        return;
      }
      if (j.status === 'full') {
        paintCount(j.claimed, 0);
        MB.show(flow, false);
        MB.show(MB.el('cl-full'), true);
        window.scrollTo(0, 0);
        return;
      }
      throw new Error('x');
    }).catch(function () {
      MB.el('cl-hint').textContent = 'Your claim could not be submitted. Please try again shortly.';
      n.disabled = false;
    });
  }

  counts();
})();
