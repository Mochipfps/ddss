/* Shared wallet bar plus the wallet chooser.
   CONNECT WALLET never picks a wallet for the user: it opens a chooser listing
   every compatible wallet detected, in the MiNI BRoKER pixel style. */
(function () {
  var host = MB.el('mb-wallet-bar');
  if (!host || !window.MBChain) return;
  var CH = window.MBChain;
  var CHAIN = MB.cfg.chain || {};

  /* ---- chooser ---- */
  var modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'mb-wallets';
  modal.innerHTML =
    '<div class="modal__box" style="text-align:left;max-width:420px">' +
      '<h3 class="pixel" style="font-size:clamp(13px,2.6vw,18px);line-height:1.5;margin:0">CONNECT WALLET</h3>' +
      '<p class="txt" style="margin:12px 0 0">Choose the wallet you want to use.</p>' +
      '<div class="wallets" id="mb-wallet-list"></div>' +
      '<p class="note note--red" id="mb-wallet-msg" style="margin:12px 0 0"></p>' +
      '<div class="row" style="margin-top:14px"><button class="btn" id="mb-wallet-cancel">CANCEL</button></div>' +
    '</div>';
  document.body.appendChild(modal);

  var list = MB.el('mb-wallet-list'), note = MB.el('mb-wallet-msg');

  MB.el('mb-wallet-cancel').addEventListener('click', close);
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  function close() { modal.classList.remove('is-open'); }

  function openChooser() {
    var wallets = CH.wallets();
    note.textContent = '';
    if (!wallets.length) {
      list.innerHTML = '';
      note.textContent = 'No compatible wallet was detected. Install an EVM wallet, or open this page in your wallet app\'s browser.';
    } else {
      list.innerHTML = wallets.map(function (w, i) {
        var icon = w.icon
          ? '<img src="' + MB.esc(w.icon) + '" alt="">'
          : '<span class="wallet__dot"></span>';
        return '<button class="wallet" data-i="' + i + '">' + icon + '<span>' + MB.esc(w.name) + '</span></button>';
      }).join('');
    }
    modal.classList.add('is-open');
  }

  list.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button[data-i]') : null;
    if (!b) return;
    var pick = CH.wallets()[Number(b.getAttribute('data-i'))];
    if (!pick) return;
    Array.prototype.forEach.call(list.children, function (c) { c.disabled = true; });
    note.textContent = 'Approve the connection in ' + pick.name + '...';
    CH.connect(pick).then(function () {
      close();
    }).catch(function (err) {
      note.textContent = CH.message(err);
      Array.prototype.forEach.call(list.children, function (c) { c.disabled = false; });
    });
  });

  /* ---- bar ---- */
  function render() {
    if (!CH.account) {
      host.innerHTML = '<div class="dark" style="border:4px solid var(--sky);flex-direction:row;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px">' +
        '<span class="pixel" style="font-size:clamp(10px,1.8vw,13px);line-height:1.7;color:var(--sky)">WALLET NOT CONNECTED</span>' +
        '<button class="btn btn--sky btn--on-dark" id="w-connect">CONNECT WALLET</button></div>';
      MB.el('w-connect').addEventListener('click', openChooser);
      return;
    }
    if (CH.wrongNetwork) {
      host.innerHTML = '<div class="dark" style="border:4px solid var(--red)">' +
        '<span class="pixel" style="font-size:clamp(10px,1.8vw,13px);line-height:1.7;color:var(--red)">WRONG NETWORK</span>' +
        '<p class="txt">Switch your wallet to ' + MB.esc(CHAIN.name || '') + ' to continue.</p>' +
        '<div class="row"><button class="btn btn--red btn--on-dark" id="w-switch">SWITCH NETWORK</button>' +
        '<button class="btn btn--on-dark" id="w-dc">DISCONNECT</button></div></div>';
      MB.el('w-switch').addEventListener('click', function () {
        var b = this; b.disabled = true;
        CH.switchNetwork().then(function () { b.disabled = false; });
      });
      MB.el('w-dc').addEventListener('click', function () { CH.disconnect(); });
      return;
    }
    host.innerHTML = '<div class="dark" style="border:4px solid var(--green);flex-direction:row;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px">' +
      '<span class="pixel" style="font-size:clamp(10px,1.8vw,13px);line-height:1.7;color:var(--green);word-break:break-all">CONNECTED ' + MB.esc(CH.shortAddr(CH.account)) + '</span>' +
      '<div class="row" style="gap:10px"><span class="pixel" style="font-size:clamp(9px,1.6vw,12px);line-height:1.7">' + MB.esc(CHAIN.name || '') + '</span>' +
      '<button class="btn btn--sm btn--on-dark" id="w-dc">DISCONNECT</button></div></div>';
    MB.el('w-dc').addEventListener('click', function () { CH.disconnect(); });
  }

  CH.on(render);
  render();
  CH.resume();

  // Any CONNECT WALLET button elsewhere on a live page opens the same chooser.
  Array.prototype.forEach.call(document.querySelectorAll('[data-mb="wallet"]'), function (b) {
    b.addEventListener('click', function (e) {
      e.stopImmediatePropagation();
      var m = MB.el('mb-modal');
      if (m) m.classList.remove('is-open');
      openChooser();
    }, true);
  });
})();
