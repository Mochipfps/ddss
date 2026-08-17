/* WhiteList — six gated tasks, assigned Social Card, separate referral credit. */
(function () {
  var CFG = MB.cfg;
  var PALETTE = ['#E23B32','#EFBF2E','#6E35CE','#E08A2E','#3BA3E8','#33A155','#F7F1E5'];
  var INK = '#16181F', CREAM = '#F7F1E5';
  var LABELS = ['X USERNAME','WALLET','FOLLOW X','PINNED POST','SOCIAL CARD','SHARE POST'];
  var panel = MB.el('wl-panel');
  if (!panel) return;

  var st = { stage: 1, x: '', wallet: '', comment: '', post: '', follow: false, like: false, repost: false, comm: false };
  var card = null;

  if (MB.read('mb_wl_done') === '1') { finish(false); return; }
  MB.show(MB.el('wl'), true);
  render();

  function xUrl() { return CFG.xUrl || 'https://x.com/MlNiBroker/status/2089298201396281728'; }
  function pinned() { return (CFG.pinnedPostUrl && String(CFG.pinnedPostUrl).trim()) || xUrl(); }
  function openX(u) { window.open(u, '_blank', 'noopener'); }

  function shortWallet(a) {
    var v = String(a || '').trim();
    return v.length < 10 ? v : v.slice(0, 5) + '...' + v.slice(-3);
  }

  // Assigned per participant (keyed on the wallet), then never changed.
  function ensureCard(wallet) {
    var w = String(wallet || '').trim().toLowerCase();
    var saved = null;
    try { saved = JSON.parse(MB.read('mb_social_card_v2') || 'null'); } catch (e) {}
    if (saved && saved.img && saved.color && saved.wallet === w) { card = saved; return; }
    var ids = MB.nftIds();
    card = {
      img: ids[Math.floor(Math.random() * ids.length)],
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      wallet: w
    };
    MB.write('mb_social_card_v2', JSON.stringify(card));
  }

  function valid(s) {
    if (s === 1) return st.x.trim().replace('@', '').length >= 2;
    if (s === 2) return /^0x[a-fA-F0-9]{40}$/.test(st.wallet.trim());
    if (s === 3) return st.follow;
    if (s === 4) return st.like && st.repost && st.comm && /x\.com\//i.test(st.comment.trim());
    if (s === 5) return true;
    if (s === 6) return /^https?:\/\/(www\.)?x\.com\/.+/i.test(st.post.trim());
    return false;
  }
  function hint(s) {
    if (s === 1) return 'Enter your X username to continue.';
    if (s === 2) return 'Enter a valid wallet address (0x + 40 characters).';
    if (s === 3) return 'Use the FOLLOW ON X button to continue.';
    if (s === 4) return 'Complete all three actions and paste your comment link.';
    if (s === 6) return 'Paste a valid x.com post link.';
    return '';
  }

  function render() {
    MB.el('wl-steps').innerHTML = [1,2,3,4,5,6].map(function (n) {
      var cls = n < st.stage ? ' is-done' : (n === st.stage ? ' is-now' : '');
      return '<div class="step' + cls + '"><div class="step__n">0' + n + ' / 06</div><div class="step__l">' + LABELS[n-1] + '</div></div>';
    }).join('');
    MB.el('wl-task').textContent = 'TASK 0' + st.stage;

    var t = MB.el('wl-title'), c = MB.el('wl-copy'), b = MB.el('wl-body');
    if (st.stage === 1) {
      t.textContent = 'X USERNAME';
      c.textContent = 'Enter the X username you will use for the WhiteList.';
      b.innerHTML = '<input class="pin" id="f-x" placeholder="@username" style="max-width:420px" value="' + MB.esc(st.x) + '">';
      bind('f-x', 'x');
    } else if (st.stage === 2) {
      t.textContent = 'WALLET ADDRESS';
      c.textContent = 'Type your wallet address manually. No wallet is opened and no signature is requested.';
      b.innerHTML = '<input class="pin" id="f-w" placeholder="0x..." value="' + MB.esc(st.wallet) + '">';
      bind('f-w', 'wallet');
    } else if (st.stage === 3) {
      t.textContent = 'FOLLOW X';
      c.textContent = 'Follow the official MiNI BRoKER account to continue.';
      b.innerHTML = '<button class="btn btn--sky" id="f-follow">FOLLOW ON X</button>';
      MB.el('f-follow').addEventListener('click', function () { openX(xUrl()); st.follow = true; update(); });
    } else if (st.stage === 4) {
      t.textContent = 'PINNED POST';
      c.textContent = 'Like, repost and comment on the pinned post, then paste the link to your comment.';
      b.innerHTML = '<div class="row" style="margin-bottom:12px">' +
        act('f-like', 'LIKE', st.like) + act('f-repost', 'REPOST', st.repost) + act('f-comment', 'COMMENT', st.comm) +
        '</div><input class="pin" id="f-c" placeholder="link to your comment" value="' + MB.esc(st.comment) + '">';
      hook('f-like', 'like'); hook('f-repost', 'repost'); hook('f-comment', 'comm');
      bind('f-c', 'comment');
    } else if (st.stage === 5) {
      ensureCard(st.wallet);
      t.textContent = 'SOCIAL CARD';
      c.textContent = 'Your MiNI BRoKER WhiteList card. The artwork and color are assigned to you and stay the same.';
      b.innerHTML =
        '<div class="card" style="background:' + card.color + '">' +
          '<div class="card__top"><span class="pixel" style="font-size:clamp(14px,2.6vw,22px);line-height:1.4">MiNI BRoKER</span>' +
          '<span class="card__chip" style="background:' + INK + ';color:' + CREAM + '">WHITELIST</span></div>' +
          '<div class="card__mid">' +
            '<div class="card__img" role="img" aria-label="Assigned MiNI BRoKER artwork" style="background-image:url(' + MB.nftSrc(card.img) + ')"></div>' +
            '<div class="card__col">' +
              '<span class="card__k">X USERNAME</span><span class="card__v">' + MB.esc(st.x.trim() || '@username') + '</span>' +
              '<span class="card__k" style="margin-top:6px">WALLET</span><span class="card__v" style="font-size:clamp(19px,2.4vw,24px)">' + MB.esc(shortWallet(st.wallet)) + '</span>' +
              '<div class="row" style="gap:8px;margin-top:8px">' +
                '<span class="card__chip" style="background:' + INK + ';color:' + CREAM + '">JOINED</span>' +
                '<span class="card__chip" style="background:#EFBF2E;border:3px solid ' + INK + '">VERIFIED</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="hr"></div>' +
          '<div class="card__top"><span class="card__chip" style="padding:0">SEASON 01 MEMBER</span>' +
          '<span class="card__chip" style="background:#EFBF2E;border:3px solid ' + INK + '">APPROVED</span></div>' +
        '</div>' +
        '<div class="row" style="margin-top:12px"><button class="btn btn--y" id="f-dl">DOWNLOAD CARD</button>' +
        '<button class="btn btn--sky" id="f-share">SHARE ON X</button></div>';
      MB.el('f-dl').addEventListener('click', downloadCard);
      MB.el('f-share').addEventListener('click', shareCard);
    } else {
      t.textContent = 'SHARE YOUR CARD ON X';
      c.textContent = 'Post your card on X, then submit the link to that post.';
      b.innerHTML = '<button class="btn btn--sky" id="f-share2" style="margin-bottom:12px">SHARE ON X</button>' +
        '<input class="pin" id="f-p" placeholder="https://x.com/..." value="' + MB.esc(st.post) + '">';
      MB.el('f-share2').addEventListener('click', shareCard);
      bind('f-p', 'post');
    }
    update();
  }

  function act(id, label, on) {
    return '<button class="btn" id="' + id + '" style="background:' + (on ? '#33A155' : '#EFBF2E') + ';color:' + (on ? CREAM : INK) + '">' + label + '</button>';
  }
  function hook(id, key) {
    MB.el(id).addEventListener('click', function () { openX(pinned()); st[key] = true; render(); });
  }
  function bind(id, key) {
    var i = MB.el(id);
    i.addEventListener('input', function () { st[key] = i.value; update(); });
  }
  function update() {
    var blocked = !valid(st.stage);
    var next = MB.el('wl-next');
    next.disabled = blocked;
    next.textContent = st.stage === 6 ? 'SUBMIT' : 'CONTINUE';
    next.classList.toggle('btn--off', blocked);
    MB.el('wl-hint').textContent = blocked ? hint(st.stage) : '';
  }

  MB.el('wl-next').addEventListener('click', function () {
    if (!valid(st.stage)) return;
    if (st.stage === 6) { submit(); finish(true); return; }
    if (st.stage === 2) ensureCard(st.wallet);
    st.stage++;
    render();
  });

  function submit() {
    var url = String(CFG.whitelistApi || '').trim();
    if (!url) return;
    try {
      fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          xUsername: st.x.trim(),
          walletAddress: st.wallet.trim(),
          commentLink: st.comment.trim(),
          socialCardImage: card ? String(card.img) : '',
          socialCardColor: card ? card.color : '',
          socialPostLink: st.post.trim()
        })
      });
    } catch (e) {}
  }

  function finish(fresh) {
    MB.el('wl').hidden = true;
    MB.show(MB.el('wl-done'), true);
    if (!fresh) return;
    MB.write('mb_wl_done', '1');
    MB.write('mb_wl_x', st.x.trim());
    MB.write('mb_wl_wallet', st.wallet.trim());
    creditReferral();
  }

  // Referral credit + own code issue: separate backend, only on full completion.
  function creditReferral() {
    var from = MB.read('mb_ref_from') || '';
    var chain = MB.REF_RE.test(from)
      ? MB.refPost({ action: 'completeReferral', referralCode: from, referredXUsername: st.x.trim(), referredWallet: st.wallet.trim() })
      : Promise.resolve(null);
    chain.then(function () {
      return MB.refPost({ action: 'createCode', xUsername: st.x.trim(), walletAddress: st.wallet.trim() });
    }).then(function (j) {
      if (j && j.code && MB.REF_RE.test(String(j.code).toUpperCase())) {
        MB.write('mb_my_ref_code', String(j.code).toUpperCase());
      }
    });
  }

  function shareCard() {
    window.open('https://twitter.com/intent/tweet?text=' +
      encodeURIComponent('I joined the MiNI BRoKER WhiteList. @MlNiBroker'), '_blank', 'noopener');
  }

  // Landscape card export, 1680x960 (2x of the 840x480 layout).
  function downloadCard() {
    ensureCard(st.wallet);
    var S = 2, W = 1680, H = 960;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;

    var px = function (t, size, cx, cy, col, align) {
      x.fillStyle = col; x.font = size * S + 'px "Press Start 2P", monospace';
      x.textAlign = align || 'left'; x.textBaseline = 'middle';
      x.fillText(t, cx * S, cy * S);
    };
    var vt = function (t, size, cx, cy) {
      x.fillStyle = INK; x.font = size * S + 'px "VT323", monospace';
      x.textAlign = 'left'; x.textBaseline = 'middle';
      x.fillText(t, cx * S, cy * S);
    };
    var box = function (bx, by, bw, bh, fill, border) {
      if (border) { x.fillStyle = border; x.fillRect(bx * S, by * S, bw * S, bh * S); }
      var i = border ? 3 : 0;
      x.fillStyle = fill;
      x.fillRect((bx + i) * S, (by + i) * S, (bw - i * 2) * S, (bh - i * 2) * S);
    };
    var chip = function (t, bx, by, bw, bh, fill, fg, border) {
      box(bx, by, bw, bh, fill, border);
      px(t, 12, bx + bw / 2, by + bh / 2 + 1, fg, 'center');
    };

    x.fillStyle = INK; x.fillRect(0, 0, W, H);
    x.fillStyle = card.color; x.fillRect(5 * S, 5 * S, 830 * S, 470 * S);
    px('MiNI BRoKER', 22, 36, 48, INK);
    chip('WHITELIST', 626, 36, 178, 38, INK, CREAM);

    box(32, 90, 208, 208, INK);
    var img = new Image();
    img.onload = function () {
      x.drawImage(img, 36 * S, 94 * S, 200 * S, 200 * S);
      rest();
    };
    img.onerror = rest;
    img.src = MB.nftSrc(card.img);

    function rest() {
      px('X USERNAME', 10, 270, 105, INK);
      vt(st.x.trim() || '@username', 30, 270, 133);
      px('WALLET', 10, 270, 181, INK);
      vt(shortWallet(st.wallet) || '0x000...000', 26, 270, 209);
      chip('JOINED', 270, 246, 150, 38, INK, CREAM);
      chip('VERIFIED', 436, 246, 170, 38, '#EFBF2E', INK, INK);
      x.fillStyle = INK; x.fillRect(36 * S, 372 * S, 768 * S, 4 * S);
      px('SEASON 01 MEMBER', 12, 36, 410, INK);
      chip('APPROVED', 706, 392, 98, 38, '#EFBF2E', INK, INK);
      var a = document.createElement('a');
      a.href = c.toDataURL('image/png');
      a.download = 'mini-broker-whitelist-card.png';
      a.click();
    }
  }
})();
