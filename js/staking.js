/* Staking page — live contract reads and the stake flow.
   Wallet-based NFT discovery only: no token-id scanning, no manual entry. */
(function () {
  var CH = window.MBChain, CFG = MB.cfg;
  var grid = MB.el('st-nfts-grid'), statusGrid = MB.el('st-grid');
  if (!grid) return;

  var owned = [], stakedSet = {}, selected = {}, busy = false;
  var approved = null;   // null = unknown, true/false = read from the NFT contract

  // isApprovedForAll(owner, stakingContract) — the permission stake() needs to
  // pull the NFT. Without it stake() reverts, which was the failure.
  function readApproval() {
    if (!CH.account || CH.wrongNetwork) { approved = null; return Promise.resolve(); }
    return CH.nftWrite().then(function (nft) {
      return nft.isApprovedForAll(CH.account, (CFG.contracts || {}).staking);
    }).then(function (ok) { approved = !!ok; }).catch(function () { approved = null; });
  }

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
      // The contract decides; the clock only labels and counts down.
      var sched = CH.schedule();
      var open = winOpen === true && stakeOn !== false && sysOn !== false;
      if (winOpen == null) open = sched.open && stakeOn !== false && sysOn !== false;
      window.__mbWindowOpen = open;

      var cap = (MB.cfg.staking || {}).totalCapacity || 5000;
      var lock = (MB.cfg.staking || {}).lockDays || 5;
      var day = CH.num(r[3]);
      statusGrid.innerHTML =
        tile('STAKING', open ? 'OPEN' : 'CLOSED') +
        '<div class="panel panel--flat"><span class="pixel" style="font-size:10px;line-height:1.7;color:var(--red)">' +
          (sched.open ? 'CLOSES IN' : 'OPENS IN') +
          '</span><div class="pixel" id="st-clock" style="font-size:14px;margin-top:10px">' + CH.dur(sched.until) + '</div></div>' +
        tile('CURRENT DAY', day == null ? '——' : (day > 0 ? 'DAY ' + day : 'NOT STARTED')) +
        tile("TODAY'S LIMIT", CH.dash(CH.num(r[4]))) +
        tile('STAKED TODAY', CH.dash(CH.num(r[5]))) +
        tile('REMAINING TODAY', CH.dash(CH.num(r[6]))) +
        tile('TOTAL STAKED', CH.dash(CH.num(r[7]) != null ? CH.num(r[7]) : CH.num(r[8]))) +
        tile('TOTAL CAPACITY', cap.toLocaleString()) +
        tile('STAKING WINDOW', '14:00-18:00 UTC') +
        tile('LOCK PERIOD', lock + ' DAYS') +
        tile('SEASON', r[9] === true ? 'COMPLETE' : (r[9] === false ? 'IN PROGRESS' : '——'));
      startClock();
      refreshActions();
    }).catch(function () {
      unavailable('Live staking values are temporarily unavailable. Please try again shortly.');
    });
  }

  // One local ticker between authoritative reads: no per-second chain calls.
  var clockIv = null, lastOpen = null;
  function startClock() {
    if (clockIv) window.clearInterval(clockIv);
    lastOpen = CH.schedule().open;
    clockIv = window.setInterval(function () {
      var s = CH.schedule();
      var el = MB.el('st-clock');
      if (el) el.textContent = CH.dur(s.until);
      if (s.open !== lastOpen) { lastOpen = s.open; loadStatus(); }
    }, 1000);
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
    msg.textContent = 'LOADING YOUR MINI BROKER NFTs...';
    grid.innerHTML = '';
    CH.ownedNfts(CH.account).then(function (list) {
      owned = list;
      selected = {};
      if (!list.length) {
        // A successful query with zero results is never an error state.
        msg.textContent = 'NO MINI BROKER NFTs FOUND IN THIS WALLET.';
        MB.show(MB.el('st-actions'), false);
        return;
      }
      msg.textContent = list.length + (list.length === 1 ? ' NFT found.' : ' NFTs found.');
      return markStaked(list).then(readApproval).then(draw);
    }).catch(function () {
      // Every endpoint failed: distinct from "zero NFTs", and retryable.
      msg.innerHTML = 'NFT DATA TEMPORARILY UNAVAILABLE ' +
        '<button class="btn btn--sm" id="st-retry" style="margin-left:10px">RETRY</button>';
      var r = MB.el('st-retry');
      if (r) r.addEventListener('click', loadNfts);
      MB.show(MB.el('st-actions'), false);
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
    var b = MB.el('st-stake'), ap = MB.el('st-approve');
    if (!b) return;
    var open = window.__mbWindowOpen === true;
    var needsApproval = approved === false;

    // APPROVE NFT appears only while permission is missing; STAKE waits for it.
    MB.show(ap, needsApproval);
    if (ap) {
      ap.disabled = busy;
      ap.classList.toggle('btn--off', busy);
    }

    var can = ids.length > 0 && open && !busy && !needsApproval;
    b.disabled = !can;
    b.classList.toggle('btn--off', !can);
    b.classList.toggle('btn--green', can);
    b.textContent = ids.length > 1 ? 'STAKE ' + ids.length + ' SELECTED' : 'STAKE SELECTED';
    MB.el('st-sel').textContent = needsApproval
      ? 'Approve the staking contract once, then stake.'
      : (!open ? 'Staking is currently closed.'
        : (ids.length ? ids.length + (ids.length === 1 ? ' NFT selected.' : ' NFTs selected.') : 'Select one or more available NFTs.'));
  }

  /* ---- stake flow: approve, then send to the staking contract ---- */
  /* ---- approval transaction ---- */
  MB.el('st-approve').addEventListener('click', function () {
    if (busy) return;
    var msg = MB.el('st-msg');
    busy = true; refreshActions();
    msg.textContent = 'Approve the staking contract in your wallet...';
    var staking = (CFG.contracts || {}).staking;
    CH.nftWrite().then(function (nft) {
      return CH.gasFor(nft, 'setApprovalForAll', [staking, true]).then(function (gas) {
        return nft.setApprovalForAll(staking, true, gas ? { gasLimit: gas } : {});
      });
    }).then(function (tx) {
      msg.textContent = 'Approval pending...';
      return tx.wait();
    }).then(function () {
      return readApproval();
    }).then(function () {
      busy = false;
      msg.textContent = approved ? 'Approval confirmed. You can stake now.' : '';
      refreshActions();
    }).catch(function (e) {
      busy = false;
      msg.textContent = CH.message(e);
      refreshActions();
    });
  });

  /* ---- stake transaction ---- */
  MB.el('st-stake').addEventListener('click', function () {
    var ids = selectedIds();
    if (!ids.length || busy) return;
    var msg = MB.el('st-msg');
    busy = true; refreshActions();
    msg.textContent = 'Checking staking conditions...';

    var staking = (CFG.contracts || {}).staking;
    // Every gate is read from the live contract, and the NFT contract the
    // staking contract actually accepts is verified, before anything is signed.
    CH.stakingRead().then(function (c) {
      return Promise.all([
        CH.safe(c, 'isSystemEnabled'), CH.safe(c, 'isStakingEnabled'),
        CH.safe(c, 'isStakingWindowOpen'), CH.safe(c, 'remainingTodayCapacity'),
        CH.safe(c, 'seasonComplete'), CH.safe(c, 'emergencyPaused'),
        CH.safe(c, 'nftContract')
      ]).then(function (r) {
        if (r[5] === true) throw new Error('EmergencyPausedActive');
        if (r[4] === true) throw new Error('TotalCapacityReached');
        if (r[0] === false) throw new Error('SystemIsDisabled');
        if (r[1] === false) throw new Error('StakingIsDisabled');
        if (r[2] === false) throw new Error('StakingWindowClosed');
        if (r[3] != null && Number(r[3]) < ids.length) throw new Error('DailyCapacityReached');
        var want = String((CFG.contracts || {}).nft || '').toLowerCase();
        if (r[6] && String(r[6]).toLowerCase() !== want) throw new Error('wrongCollection');
      });
    }).then(function () {
      // Ownership and current stake state, straight from the NFT contract.
      return CH.nftWrite().then(function (nft) {
        return Promise.all(ids.map(function (id) {
          return nft.ownerOf(id).then(function (o) {
            if (String(o).toLowerCase() !== String(CH.account).toLowerCase()) throw new Error('notOwner');
          });
        }));
      });
    }).then(function () {
      return CH.stakingRead().then(function (c) {
        return Promise.all(ids.map(function (id) {
          return CH.safe(c, 'isStaked', [id]).then(function (v) {
            if (v === true) throw new Error('AlreadyStaked');
          });
        }));
      });
    }).then(function () {
      if (approved === true) return null;
      // Approval is a separate, explicit transaction — never bundled silently.
      throw new Error('approvalNeeded');
    }).then(function () {
      return CH.stakingWrite();
    }).then(function (c) {
      var batch = ids.length > 1 && typeof c.stakeBatch === 'function';
      var fn = batch ? 'stakeBatch' : 'stake';
      var args = batch ? [ids] : [ids[0]];

      if (!batch && ids.length > 1) {
        // No batch support: one confirmed transaction per NFT, in sequence.
        return ids.reduce(function (p, id) {
          return p.then(function () {
            return CH.simulate(c, 'stake', [id])
              .then(function () { return CH.gasFor(c, 'stake', [id]); })
              .then(function (gas) {
                msg.textContent = 'Confirm NFT #' + id + ' in your wallet...';
                return c.stake(id, gas ? { gasLimit: gas } : {});
              })
              .then(function (tx) { msg.textContent = 'Transaction pending...'; return tx.wait(); });
          });
        }, Promise.resolve()).then(function () { return null; });
      }

      // Dry-run first: a revert is caught here, before the wallet opens.
      msg.textContent = 'Simulating the transaction...';
      return CH.simulate(c, fn, args)
        .then(function () { return CH.gasFor(c, fn, args); })
        .then(function (gas) {
          msg.textContent = 'Confirm the staking transaction in your wallet...';
          return c[fn].apply(c, gas ? args.concat([{ gasLimit: gas }]) : args);
        });
    }).then(function (tx) {
      if (!tx) return null;
      msg.textContent = 'Transaction pending...';
      return tx.wait();
    }).then(function (receipt) {
      // Confirmed only: success is never shown before the receipt arrives.
      if (receipt && receipt.status === 0) throw new Error('failed');
      msg.textContent = 'STAKE CONFIRMED';
      selected = {};
      busy = false;
      loadStatus();
      readApproval().then(loadNfts);
    }).catch(function (e) {
      busy = false;
      msg.textContent = CH.message(e);
      refreshActions();
    });
  });

  var rb = MB.el('st-refresh');
  if (rb) rb.addEventListener('click', function () {
    var b = this;
    b.disabled = true;
    loadStatus();
    loadNfts();
    window.setTimeout(function () { b.disabled = false; }, 1200);
  });

  CH.on(function () { approved = null; loadStatus(); loadNfts(); });
  loadStatus();
})();
