/* My Stake — the connected wallet's staked NFTs, from getUserStakedTokens only. */
(function () {
  var CH = window.MBChain;
  var grid = MB.el('ms-grid'), msg = MB.el('ms-msg'), err = MB.el('ms-err');
  if (!grid) return;
  var busy = {};

  function load() {
    err.textContent = '';
    if (!CH.account) {
      grid.innerHTML = '';
      msg.textContent = 'Connect your wallet to load your stake.';
      return;
    }
    if (CH.wrongNetwork) {
      grid.innerHTML = '';
      msg.textContent = 'Switch to the correct network to load your stake.';
      return;
    }
    if (!CH.hasAbi()) {
      grid.innerHTML = '';
      msg.textContent = 'Stake data is temporarily unavailable. Please try again shortly.';
      return;
    }
    msg.textContent = 'LOADING YOUR STAKE...';
    grid.innerHTML = '';

    var images = {};
    CH.ownedNfts(CH.account).catch(function () { return []; })
      .then(function (list) {
        list.forEach(function (n) { images[n.id] = n.image; });
        return CH.stakingRead();
      })
      .then(function (c) {
        return CH.safe(c, 'getUserStakedTokens', [CH.account]).then(function (ids) {
          if (!ids || !ids.length) return { c: c, rows: [] };
          var list = Array.prototype.map.call(ids, function (v) { return String(v); });
          return Promise.all(list.map(function (id) {
            return Promise.all([
              CH.safe(c, 'stakeInfo', [id]),
              CH.safe(c, 'unlockTime', [id]),
              CH.safe(c, 'remainingLockTime', [id]),
              CH.safe(c, 'canUnstake', [id]),
              CH.safe(c, 'canClaimReward', [id]),
              CH.safe(c, 'canClaimRefund', [id]),
              CH.safe(c, 'canClaimAirdrop', [id])
            ]).then(function (r) {
              return {
                id: id, info: r[0], unlock: r[1], remaining: r[2],
                canUnstake: r[3], reward: r[4], refund: r[5], airdrop: r[6]
              };
            });
          })).then(function (rows) { return { c: c, rows: rows }; });
        });
      })
      .then(function (out) {
        var rows = out.rows;
        if (!rows.length) {
          msg.textContent = 'You have no staked MiNI BRoKER NFTs.';
          return;
        }
        msg.textContent = rows.length + (rows.length === 1 ? ' NFT staked.' : ' NFTs staked.');
        grid.innerHTML = rows.map(function (r) {
          var img = images[r.id] || MB.nftSrc(91);
          var staked = r.info && (r.info.stakedAt || r.info[1]);
          var line = function (k, v) {
            return '<div class="row" style="justify-content:space-between;gap:10px">' +
              '<span class="pixel" style="font-size:9px;line-height:1.7">' + k + '</span>' +
              '<span class="txt" style="text-align:right;word-break:break-word">' + v + '</span></div>';
          };
          var claim = function (kind, label, on) {
            var can = on === true;
            return '<button class="btn ' + (can ? 'btn--y' : 'btn--off') + '" data-act="' + kind + '" data-id="' + MB.esc(r.id) + '"' +
              (can ? '' : ' disabled') + '>' + label + '</button>';
          };
          return '<div class="panel">' +
            '<div class="row" style="gap:12px;align-items:flex-start">' +
              '<div class="tile__img" role="img" aria-label="Staked NFT" style="width:96px;flex:0 0 auto;border:4px solid var(--ink);background-image:url(' + MB.esc(img) + ')"></div>' +
              '<div style="flex:1;min-width:min(100%,170px);display:flex;flex-direction:column;gap:6px">' +
                '<span class="pixel" style="font-size:12px;line-height:1.5">#' + MB.esc(r.id) + '</span>' +
                '<span class="card__chip" style="background:var(--purple);color:var(--cream);align-self:flex-start">STAKED</span>' +
              '</div>' +
            '</div>' +
            line('STAKED', staked ? CH.utc(staked) : '——') +
            line('UNLOCKS', r.unlock ? CH.utc(r.unlock) : '——') +
            '<div class="row" style="justify-content:space-between;gap:10px">' +
              '<span class="pixel" style="font-size:9px;line-height:1.7">LOCK LEFT</span>' +
              '<span class="txt" style="text-align:right" data-lock="' + MB.esc(r.id) + '" data-until="' +
                (r.unlock ? Number(r.unlock) : '') + '">' +
                (r.remaining == null ? '——' : (Number(r.remaining) > 0 ? CH.dur(r.remaining) : 'UNLOCKED')) +
              '</span></div>' +
            '<div class="hr"></div>' +
            '<div class="row" style="gap:8px">' +
              '<button class="btn ' + (r.canUnstake === true ? 'btn--green' : 'btn--off') + '" data-act="unstake" data-id="' + MB.esc(r.id) + '"' +
                (r.canUnstake === true ? '' : ' disabled') + '>' + (r.canUnstake === true ? 'UNSTAKE' : 'LOCKED') + '</button>' +
              claim('reward', 'CLAIM REWARD', r.reward) +
              claim('refund', 'CLAIM REFUND', r.refund) +
              claim('airdrop', 'CLAIM AIRDROP', r.airdrop) +
            '</div>' +
            '<p class="note note--red" data-msg="' + MB.esc(r.id) + '"></p>' +
            '</div>';
        }).join('');
        startClocks();
      })
      .catch(function () {
        msg.textContent = 'Stake data is temporarily unavailable. Please try again shortly.';
      });
  }

  // Each staked NFT counts down from its own unlockTime — never one shared timer.
  var iv = null;
  function startClocks() {
    if (iv) window.clearInterval(iv);
    iv = window.setInterval(function () {
      var nodes = grid.querySelectorAll('[data-lock]');
      var expired = false;
      Array.prototype.forEach.call(nodes, function (n) {
        var until = Number(n.getAttribute('data-until'));
        if (!until) return;
        var left = until - Math.floor(Date.now() / 1000);
        if (left > 0) { n.textContent = CH.dur(left); return; }
        if (n.textContent !== 'UNLOCKED') { n.textContent = 'UNLOCKED'; expired = true; }
      });
      // A lock just elapsed: re-read so UNSTAKE reflects the contract.
      if (expired) load();
    }, 1000);
  }

  var FN = { unstake: 'unstake', reward: 'claimReward', refund: 'claimRefund', airdrop: 'claimAirdrop' };

  grid.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button[data-act]') : null;
    if (!b || b.disabled) return;
    var id = b.getAttribute('data-id'), act = b.getAttribute('data-act');
    if (busy[id]) return;
    var note = grid.querySelector('[data-msg="' + id + '"]');
    busy[id] = true;
    b.disabled = true;
    if (note) note.textContent = 'Confirm in your wallet...';

    CH.stakingWrite().then(function (c) {
      var fn = FN[act];
      if (typeof c[fn] !== 'function') throw new Error('unavailable');
      // Dry-run first so a revert is reported without opening the wallet.
      if (note) note.textContent = 'Checking...';
      return CH.simulate(c, fn, [id])
        .then(function () { return CH.gasFor(c, fn, [id]); })
        .then(function (gas) {
          if (note) note.textContent = 'Confirm in your wallet...';
          return c[fn](id, gas ? { gasLimit: gas } : {});
        });
    }).then(function (tx) {
      if (note) note.textContent = 'Transaction pending...';
      return tx.wait();
    }).then(function (receipt) {
      if (receipt && receipt.status === 0) throw new Error('failed');
      busy[id] = false;
      load();
    }).catch(function (er) {
      busy[id] = false;
      b.disabled = false;
      if (note) note.textContent = CH.message(er);
    });
  });

  var rb = MB.el('ms-refresh');
  if (rb) rb.addEventListener('click', function () {
    var b = this;
    b.disabled = true;
    load();
    window.setTimeout(function () { b.disabled = false; }, 1200);
  });

  CH.on(load);
  load();
})();
