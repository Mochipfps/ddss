/* Staking page — live contract reads and the stake flow.
   Wallet-based NFT discovery only: no token-id scanning, no manual entry. */
(function () {
  var CH = window.MBChain, CFG = MB.cfg;
  var grid = MB.el('st-nfts-grid'), statusGrid = MB.el('st-grid');
  if (!grid) return;

  var owned = [], stakedSet = {}, selected = {}, busy = false;

  function tile(label, value) {
    return '<div class="panel panel--flat"><span class="pixel" style="font-size:10px;line-height:1.7;color:var(--red)">' +
      label + '</span><div class="pixel" style="font-size:14px;margin-top:10px;word-break:break-word">' + value + '</div></div>';
  }

  function unavailable(msg) {
    statusGrid.innerHTML = '';
    MB.el('st-status').insertAdjacentHTML('beforeend', '');
    statusGrid.innerHTML = '<div class="panel panel--flat"><p class="txt">' + msg + '</p></div>';
  }

  /* ---- live status ---- */
  function loadStatus() {
    if (!CH.hasAbi()) {
      unavailable('Live staking values are temporarily unavailable. Please try again shortly.');
      return;
    }
    CH.stakingRead().then(function (c) {
      return Promise.all([
        CH.safe(c, 'isSystemEnabled'), CH.safe(c, 'isStakingEnabled'), CH.safe(c, 'isStakingWindowOpen'),
        CH.safe(c, 'currentDayIndex'), CH.safe(c, 'currentDailyCapacity'), CH.safe(c, 'stakedToday'),
        CH.safe(c, 'remainingTodayCapacity'), CH.safe(c, 'totalActiveStaked'), CH.safe(c, 'totalStaked'),
        CH.safe(c, 'seasonComplete')
      ]);
    }).then(function (r) {
      var sysOn = r[0], stakeOn = r[1], winOpen = r[2];
      var open = winOpen === true && stakeOn !== false && sysOn !== false;
      window.__mbWindowOpen = open;
      statusGrid.innerHTML =
        tile('STAKING', open ? 'OPEN' : (winOpen === null ? '——' : 'CLOSED')) +
        tile('CURRENT DAY', CH.dash(CH.num(r[3]))) +
        tile('DAILY CAPACITY', CH.dash(CH.num(r[4]))) +
        tile('STAKED TODAY', CH.dash(CH.num(r[5]))) +
        tile('REMAINING TODAY', CH.dash(CH.num(r[6]))) +
        tile('TOTAL STAKED', CH.dash(CH.num(r[7]) != null ? CH.num(r[7]) : CH.num(r[8]))) +
        tile('SEASON', r[9] === true ? 'COMPLETE' : (r[9] === false ? 'IN PROGRESS' : '——'));
      refreshActions();
    }).catch(function () {
      unavailable('Live staking values are temporarily unavailable. Please try again shortly.');
    });
  }

  /* ---- owned NFTs ---- */
  function loadNfts() {
    var msg = MB.el('st-nfts-msg');
    if (!CH.account) {
      grid.innerHTML = '';
      owned = []; selected = {};
      msg.textContent = 'Connect your wallet to load the MiNI BRoKER NFTs it holds.';
      MB.show(MB.el('st-actions'), false);
      return;
    }
    if (CH.wrongNetwork) {
      grid.innerHTML = '';
      msg.textContent = 'Switch to the correct network to load your NFTs.';
      MB.show(MB.el('st-actions'), false);
      return;
    }
    msg.textContent = 'Loading your NFTs...';
    grid.innerHTML = '';
    CH.ownedNfts(CH.account).then(function (list) {
      owned = list;
      selected = {};
      if (!list.length) {
        msg.textContent = 'No MiNI BRoKER NFTs found in this wallet.';
        MB.show(MB.el('st-actions'), false);
        return;
      }
      msg.textContent = list.length + (list.length === 1 ? ' NFT found.' : ' NFTs found.');
      return markStaked(list).then(draw);
    }).catch(function () {
      msg.textContent = 'NFT data is temporarily unavailable. Please try again shortly.';
    });
  }

  function markStaked(list) {
    stakedSet = {};
    if (!CH.hasAbi()) return Promise.resolve();
    return CH.stakingRead().then(function (c) {
      return Promise.all(list.map(function (n) {
        return CH.safe(c, 'isStaked', [n.id]).then(function (v) { if (v === true) stakedSet[n.id] = true; });
      }));
    }).catch(function () {});
  }

  function draw() {
    grid.innerHTML = owned.map(function (n) {
      var isStaked = !!stakedSet[n.id];
      var sel = !!selected[n.id];
      var cap = isStaked
        ? '<div class="tile__cap" style="background:var(--purple);color:var(--cream)">STAKED</div>'
        : '<div class="tile__cap" style="background:' + (sel ? 'var(--green)' : 'var(--panel)') + ';color:' + (sel ? 'var(--cream)' : 'var(--ink)') + '">' + (sel ? 'SELECTED' : 'AVAILABLE') + '</div>';
      return '<button class="tile" data-id="' + MB.esc(n.id) + '" ' + (isStaked ? 'disabled' : '') +
        ' style="padding:0;cursor:' + (isStaked ? 'not-allowed' : 'pointer') + ';border:4px solid var(--ink);box-shadow:5px 5px 0 var(--ink)">' +
        '<div class="tile__img" role="img" aria-label="' + MB.esc(n.name) + '" style="background-image:url(' + MB.esc(n.image || MB.nftSrc(91)) + ')"></div>' +
        '<div class="tile__cap">#' + MB.esc(n.id) + '</div>' + cap + '</button>';
    }).join('');
    refreshActions();
  }

  grid.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button[data-id]') : null;
    if (!b || b.disabled || busy) return;
    var id = b.getAttribute('data-id');
    if (selected[id]) delete selected[id]; else selected[id] = true;
    draw();
  });

  function selectedIds() { return Object.keys(selected); }

  function refreshActions() {
    var ids = selectedIds();
    var actions = MB.el('st-actions');
    MB.show(actions, !!owned.length && !!CH.account && !CH.wrongNetwork);
    var b = MB.el('st-stake');
    if (!b) return;
    var open = window.__mbWindowOpen === true;
    var can = ids.length > 0 && open && !busy;
    b.disabled = !can;
    b.classList.toggle('btn--off', !can);
    b.classList.toggle('btn--green', can);
    b.textContent = ids.length > 1 ? 'STAKE ' + ids.length + ' SELECTED' : 'STAKE SELECTED';
    MB.el('st-sel').textContent = !open
      ? 'Staking is currently closed.'
      : (ids.length ? ids.length + (ids.length === 1 ? ' NFT selected.' : ' NFTs selected.') : 'Select one or more available NFTs.');
  }

  /* ---- stake flow: approve, then send to the staking contract ---- */
  MB.el('st-stake').addEventListener('click', function () {
    var ids = selectedIds();
    if (!ids.length || busy) return;
    var msg = MB.el('st-msg');
    busy = true; refreshActions();
    msg.textContent = 'Confirm in your wallet...';

    var staking = (CFG.contracts || {}).staking;
    CH.nftWrite().then(function (nft) {
      return nft.isApprovedForAll(CH.account, staking).then(function (ok) {
        if (ok) return null;
        msg.textContent = 'Approve the staking contract in your wallet...';
        return nft.setApprovalForAll(staking, true).then(function (tx) {
          msg.textContent = 'Approval pending...';
          return tx.wait();
        });
      });
    }).then(function () {
      return CH.stakingWrite();
    }).then(function (c) {
      msg.textContent = 'Confirm the staking transaction in your wallet...';
      if (ids.length > 1 && typeof c.stakeBatch === 'function') return c.stakeBatch(ids);
      if (ids.length > 1) {
        // No batch function in the ABI: send them one at a time.
        return ids.reduce(function (p, id) {
          return p.then(function () { return c.stake(id).then(function (tx) { return tx.wait(); }); });
        }, Promise.resolve()).then(function () { return null; });
      }
      return c.stake(ids[0]);
    }).then(function (tx) {
      if (!tx) return null;
      msg.textContent = 'Transaction pending...';
      return tx.wait();
    }).then(function () {
      msg.textContent = 'Stake confirmed.';
      selected = {};
      busy = false;
      loadStatus();
      loadNfts();
    }).catch(function (e) {
      busy = false;
      msg.textContent = CH.message(e);
      refreshActions();
    });
  });

  CH.on(function () { loadStatus(); loadNfts(); });
  loadStatus();
})();
