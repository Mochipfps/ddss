/* Staking page - live contract reads and the real stake flow.
   Wallet-based NFT discovery only: no token-id scanning, no manual entry.
   Every figure on this page is read from the deployed staking contract. */
(function () {
  var CH = window.MBChain, CFG = MB.cfg;
  var grid = MB.el('st-nfts-grid'), statusGrid = MB.el('st-grid');
  if (!grid) return;

  var owned = [], stakedSet = {}, selected = {}, busy = false;
  var approved = null;   // null = unknown; read from the NFT contract

  /* ---- transfer path ----
     Two mechanisms exist on the deployed pair:
       PUSH  nft.safeTransferFrom(owner, staking, id) -> onERC721Received
       PULL  staking.stake(id), which needs operator approval first
     Push is preferred: the owner sends their own token, so no approval is
     required at all. The path is chosen by preflighting the real calldata
     against the node, never by assumption. */
  var pathMode = null;      // 'push' | 'pull' | null
  var approved = null;      // only meaningful for the pull path

  function readApproval() {
    if (!CH.account || CH.wrongNetwork) { approved = null; return Promise.resolve(); }
    var staker = String((CFG.contracts || {}).staking || '').toLowerCase();
    return CH.nftWrite().then(function (nft) {
      return nft.isApprovedForAll(CH.account, (CFG.contracts || {}).staking).then(function (all) {
        if (all) return true;
        var ids = selectedIds();
        if (!ids.length) return false;
        return Promise.all(ids.map(function (id) {
          return nft.getApproved(id)
            .then(function (a) { return String(a).toLowerCase() === staker; })
            .catch(function () { return false; });
        })).then(function (rs) { return rs.every(function (v) { return v; }); });
      });
    }).then(function (ok) { approved = !!ok; }).catch(function () { approved = null; });
  }

  // Dry-run the exact push calldata as the owner. Resolves to the decoded
  // failure, or null when the transfer would go through.
  function tryPush(id) {
    return CH.loadEthers().then(function (E) {
      var i = new E.Interface(window.MB_ERC721_ABI);
      var data = i.encodeFunctionData('safeTransferFrom', [CH.account, (CFG.contracts || {}).staking, id]);
      return CH.withProvider(function (p) {
        return p.call({ from: CH.account, to: (CFG.contracts || {}).nft, data: data, value: 0 });
      });
    }).then(function () { return null; }, function (e) { return e; });
  }

  // Dry-run the pull calldata. Only meaningful once approval is in place.
  function tryPull(id) {
    return CH.stakingWrite().then(function (c) {
      return c.stake.staticCall(id);
    }).then(function () { return null; }, function (e) { return e; });
  }

  function tile(label, value) {
    return '<div class="panel panel--flat"><span class="pixel" style="font-size:10px;line-height:1.7;color:var(--red)">' +
      label + '</span><div class="pixel" style="font-size:14px;margin-top:10px;word-break:break-word">' + value + '</div></div>';
  }

  function unavailable(msg) {
    statusGrid.innerHTML = '<div class="panel panel--flat"><p class="txt">' + msg + '</p></div>';
  }

  function hhmm(secs) {
    if (secs == null) return null;
    var s = Number(secs) % 86400, h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  /* ---- live status: the contract supplies window, lock and capacity ---- */
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
        CH.safe(c, 'seasonComplete'), CH.safe(c, 'emergencyPaused'), CH.safe(c, 'cycleStarted'),
        CH.safe(c, 'TOTAL_CAPACITY'), CH.safe(c, 'DAILY_WINDOW_START'), CH.safe(c, 'DAILY_WINDOW_END'),
        CH.safe(c, 'LOCK_DURATION'), CH.safe(c, 'totalAccepted')
      ]);
    }).then(function (r) {
      var sysOn = r[0], stakeOn = r[1], winOpen = r[2], paused = r[10];

      // The contract's own window configuration drives the countdown.
      var S = CFG.staking || (CFG.staking = {});
      if (r[13] != null) S.windowOpenUtcHour = Number(r[13]) / 3600;
      if (r[14] != null) S.windowCloseUtcHour = Number(r[14]) / 3600;
      if (r[15] != null) S.lockDays = Math.round(Number(r[15]) / 86400);
      if (r[12] != null) S.totalCapacity = Number(r[12]);

      var sched = CH.schedule();
      var open = winOpen === true && stakeOn !== false && sysOn !== false && paused !== true;
      if (winOpen == null) open = sched.open && stakeOn !== false && sysOn !== false && paused !== true;
      window.__mbWindowOpen = open;
      window.__mbSeasonDone = r[9] === true;
      window.__mbPaused = paused === true;

      var day = CH.num(r[3]);
      var started = r[11];
      var winTxt = (r[13] != null && r[14] != null)
        ? hhmm(r[13]) + '-' + hhmm(r[14]) + ' UTC'
        : '——';

      statusGrid.innerHTML =
        tile('STAKING', paused === true ? 'PAUSED' : (open ? 'OPEN' : 'CLOSED')) +
        '<div class="panel panel--flat"><span class="pixel" style="font-size:10px;line-height:1.7;color:var(--red)">' +
          (sched.open ? 'CLOSES IN' : 'OPENS IN') +
          '</span><div class="pixel" id="st-clock" style="font-size:14px;margin-top:10px">' + CH.dur(sched.until) + '</div></div>' +
        tile('CURRENT CYCLE DAY', started === false ? 'NOT STARTED' : (day == null ? '——' : 'DAY ' + day)) +
        tile("TODAY'S CAPACITY", CH.dash(CH.num(r[4]))) +
        tile('STAKED TODAY', CH.dash(CH.num(r[5]))) +
        tile('REMAINING TODAY', CH.dash(CH.num(r[6]))) +
        tile('TOTAL STAKED', CH.dash(CH.num(r[7]) != null ? CH.num(r[7]) : CH.num(r[8]))) +
        tile('TOTAL ACCEPTED', CH.dash(CH.num(r[16]))) +
        tile('TOTAL CAPACITY', r[12] != null ? Number(r[12]).toLocaleString() : '——') +
        tile('STAKING WINDOW', winTxt) +
        tile('LOCK PERIOD', r[15] != null ? Math.round(Number(r[15]) / 86400) + ' DAYS' : '——') +
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
      var s = CH.schedule(), el = MB.el('st-clock');
      if (el) el.textContent = CH.dur(s.until);
      if (s.open !== lastOpen) { lastOpen = s.open; loadStatus(); }
    }, 1000);
  }

  /* ---- owned NFTs: real ownership, discovered from the wallet ---- */
  function loadNfts() {
    var msg = MB.el('st-nfts-msg');
    if (!CH.account) {
      grid.innerHTML = ''; owned = []; selected = {};
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
    msg.textContent = 'Loading your MiNI BRoKER NFTs...';
    grid.innerHTML = '';
    CH.ownedNfts(CH.account).then(function (list) {
      owned = list; selected = {};
      if (!list.length) {
        // A successful query with zero results is never an error state.
        msg.textContent = 'No MiNI BRoKER NFTs found in this wallet.';
        MB.show(MB.el('st-actions'), false);
        return;
      }
      msg.textContent = list.length + (list.length === 1 ? ' NFT found.' : ' NFTs found.');
      return markStaked(list).then(draw);
    }).catch(function () {
      // Every provider failed: distinct from "zero NFTs", and retryable.
      msg.innerHTML = 'NFT data is temporarily unavailable. ' +
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
      var isStaked = !!stakedSet[n.id], sel = !!selected[n.id];
      var cap = isStaked
        ? '<div class="tile__cap" style="background:var(--purple);color:var(--cream)">STAKED</div>'
        : '<div class="tile__cap" style="background:' + (sel ? 'var(--green)' : 'var(--panel)') +
          ';color:' + (sel ? 'var(--cream)' : 'var(--ink)') + '">' + (sel ? 'SELECTED' : 'AVAILABLE') + '</div>';
      return '<button class="tile" data-id="' + MB.esc(n.id) + '" ' + (isStaked ? 'disabled' : '') +
        ' style="padding:0;cursor:' + (isStaked ? 'not-allowed' : 'pointer') +
        ';border:4px solid var(--ink);box-shadow:5px 5px 0 var(--ink)">' +
        '<div class="tile__img" role="img" aria-label="' + MB.esc(n.name) +
        '" style="background-image:url(' + MB.esc(n.image || MB.nftSrc(91)) + ')"></div>' +
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
    MB.show(MB.el('st-actions'), !!owned.length && !!CH.account && !CH.wrongNetwork);
    var b = MB.el('st-stake'), ap = MB.el('st-approve');
    if (!b) return;
    var open = window.__mbWindowOpen === true;
    // Push needs no approval; only a pull-only pair can require it.
    var needsApproval = pathMode === 'pull' && approved === false;

    MB.show(ap, needsApproval);
    if (ap) { ap.disabled = busy; ap.classList.toggle('btn--off', busy); }

    var can = ids.length > 0 && open && !busy && !needsApproval && !window.__mbSeasonDone;
    b.disabled = !can;
    b.classList.toggle('btn--off', !can);
    b.classList.toggle('btn--green', can);
    b.textContent = ids.length > 1 ? 'STAKE ' + ids.length + ' SELECTED' : 'STAKE SELECTED';

    MB.el('st-sel').textContent =
      window.__mbSeasonDone ? 'The 5,000 NFT staking capacity has been reached.'
      : window.__mbPaused ? 'Staking is temporarily paused.'
      : needsApproval ? 'Approve the staking contract once, then stake.'
      : !open ? 'Staking is currently closed. Please return during the staking window.'
      : (ids.length ? ids.length + (ids.length === 1 ? ' NFT selected.' : ' NFTs selected.')
                    : 'Select one or more available NFTs.');
  }

  function fail(msg, e) {
    busy = false;
    refreshActions();
    CH.decode(e).then(function (d) { msg.textContent = d.text; });
  }

  /* ---- approval transaction ---- */
  MB.el('st-approve').addEventListener('click', function () {
    if (busy) return;
    var msg = MB.el('st-msg');
    busy = true; refreshActions();
    msg.textContent = 'Confirm the approval in your wallet.';
    var staker = (CFG.contracts || {}).staking;
    CH.nftWrite().then(function (nft) {
      return CH.gasFor(nft, 'setApprovalForAll', [staker, true]).then(function (gas) {
        return nft.setApprovalForAll(staker, true, gas ? { gasLimit: gas } : {});
      });
    }).then(function (tx) {
      msg.textContent = 'Transaction submitted.';
      return tx.wait();
    }).then(function () { return readApproval(); })
      .then(function () {
        busy = false;
        msg.textContent = approved ? 'Approval confirmed. You can stake now.' : '';
        refreshActions();
      })
      .catch(function (e) { fail(msg, e); });
  });

  /* ---- stake transaction: real, push-based, on-chain ---- */
  MB.el('st-stake').addEventListener('click', function () {
    var ids = selectedIds().map(function (v) { return BigInt(v); });
    if (!ids.length || busy) return;
    var msg = MB.el('st-msg');
    busy = true; refreshActions();
    msg.textContent = 'Checking staking conditions...';

    var nftAddr = (CFG.contracts || {}).nft;
    var staker = (CFG.contracts || {}).staking;
    var receipts = [];

    // 1. Live contract gates. The contract is the authority; nothing here
    //    recreates its logic, it only avoids a call it would certainly reject.
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
        if (r[6] && String(r[6]).toLowerCase() !== String(nftAddr).toLowerCase()) throw new Error('wrongCollection');
      });
    }).then(function () {
      // 2. Ownership, read from the NFT contract rather than the cached list.
      return CH.nftWrite().then(function (nft) {
        return Promise.all(ids.map(function (id) {
          return nft.ownerOf(id).then(function (o) {
            if (String(o).toLowerCase() !== String(CH.account).toLowerCase()) throw new Error('notOwner');
          });
        }));
      });
    }).then(function () {
      // 3. Already staked?
      return CH.stakingRead().then(function (c) {
        return Promise.all(ids.map(function (id) {
          return CH.safe(c, 'isStaked', [id]).then(function (v) {
            if (v === true) throw new Error('AlreadyStaked');
          });
        }));
      });
    }).then(function () {
      // 4. Choose the transfer path by preflighting the real calldata.
      msg.textContent = 'Preparing the transaction...';
      return tryPush(ids[0]).then(function (pushErr) {
        if (!pushErr) { pathMode = 'push'; return 'push'; }
        return readApproval().then(function () {
          if (approved !== true) {
            pathMode = 'pull';
            refreshActions();
            // Push is blocked and pull is unapproved: surface the push reason,
            // which is the NFT contract's own refusal.
            throw pushErr;
          }
          return tryPull(ids[0]).then(function (pullErr) {
            if (!pullErr) { pathMode = 'pull'; return 'pull'; }
            throw pullErr;
          });
        });
      });
    }).then(function (mode) {
      if (mode === 'push') {
        // PUSH: the owner transfers each NFT in; onERC721Received records it.
        return CH.nftWrite().then(function (nft) {
          var fn = nft['safeTransferFrom(address,address,uint256)'] || nft.safeTransferFrom;
          return ids.reduce(function (p, id, n) {
            return p.then(function () {
              msg.textContent = ids.length > 1
                ? 'Confirm NFT #' + id + ' in your wallet (' + (n + 1) + ' of ' + ids.length + ').'
                : 'Confirm the transaction in your wallet.';
              return fn(CH.account, staker, id).then(function (tx) {
                msg.textContent = 'Transaction submitted.';
                return tx.wait();
              }).then(function (rc) {
                if (rc && rc.status === 0) throw new Error('failed');
                receipts.push(rc);
              });
            });
          }, Promise.resolve());
        });
      }
      // PULL: the contract pulls the token; approval already verified above.
      return CH.stakingWrite().then(function (c) {
        var batch = ids.length > 1;
        var fn = batch ? 'stakeBatch' : 'stake';
        var args = batch ? [ids] : [ids[0]];
        return CH.gasFor(c, fn, args).then(function (gas) {
          msg.textContent = 'Confirm the transaction in your wallet.';
          return c[fn].apply(c, gas ? args.concat([{ gasLimit: gas }]) : args);
        }).then(function (tx) {
          msg.textContent = 'Transaction submitted.';
          return tx.wait();
        }).then(function (rc) {
          if (rc && rc.status === 0) throw new Error('failed');
          receipts.push(rc);
        });
      });
    }).then(function () {
      // 5. Confirmed on-chain before the UI calls anything staked.
      return CH.stakingRead().then(function (c) {
        return Promise.all(ids.map(function (id) { return CH.safe(c, 'isStaked', [id]); }));
      });
    }).then(function (flags) {
      var done = flags.filter(function (v) { return v === true; }).length;
      if (done === 0) {
        msg.textContent = 'The transaction did not complete. Please try again.';
        busy = false; refreshActions();
        return;
      }
      msg.textContent = 'Transaction confirmed.';
      selected = {};
      busy = false;
      loadStatus();
      loadNfts();
      // The contract attempts the welcome reward as it records the stake. The
      // receipt logs say whether that payment actually happened.
      return reportReward(ids, receipts);
    }).catch(function (e) { fail(msg, e); });
  });

  /* ---- welcome reward ----
     Four distinct outcomes, each read from the chain, never assumed:
       paid automatically during staking
       pending and claimable
       already claimed
       unavailable under the current configuration or pool balance */
  function fmtAmount(v, dec) {
    var d = dec || 18;
    var s = BigInt(v).toString().padStart(d + 1, '0');
    var whole = s.slice(0, -d), frac = s.slice(-d).replace(/0+$/, '').slice(0, 4);
    return Number(whole).toLocaleString() + (frac ? '.' + frac : '');
  }

  function rewardPaidIn(receipts, id) {
    // A RewardClaimed log in the stake receipt means the automatic payment ran.
    var out = null;
    (receipts || []).forEach(function (rc) {
      ((rc && rc.logs) || []).forEach(function (lg) {
        try {
          var p = window.__mbStakeIface.parseLog({ topics: lg.topics, data: lg.data });
          if (p && p.name === 'RewardClaimed' && String(p.args.tokenId) === String(id)) out = p.args.amount;
        } catch (x) {}
      });
    });
    return out;
  }

  function reportReward(ids, receipts) {
    var box = MB.el('st-reward');
    if (!box) return;
    return CH.loadEthers().then(function (E) {
      if (!window.__mbStakeIface) window.__mbStakeIface = new E.Interface(window.MB_STAKING_ABI);
      return CH.stakingRead();
    }).then(function (c) {
      return Promise.all([
        CH.safe(c, 'rewardAmount'), CH.safe(c, 'rewardClaimsEnabled'),
        CH.safe(c, 'rewardToken'), CH.safe(c, 'rewardTokenBalance'),
        CH.safe(c, 'availableRewardBalance'), CH.safe(c, 'reservedRewardBalance'),
        Promise.all(ids.map(function (id) { return CH.safe(c, 'canClaimReward', [id]); })),
        Promise.all(ids.map(function (id) { return CH.safe(c, 'stakeInfo', [id]); }))
      ]);
    }).then(function (r) {
      var amt = r[0], enabled = r[1], avail = r[4], canList = r[6], infos = r[7];
      var dec = ((CFG.contracts || {}).rewardTokenDecimals) || 18;
      var sym = ((CFG.contracts || {}).rewardTokenSymbol) || '';
      var claimable = [];

      var rows = ids.map(function (id, i) {
        var auto = rewardPaidIn(receipts, id);
        var info = infos[i];
        var claimedFlag = info && (info.rewardClaimed !== undefined ? info.rewardClaimed : info[7]);
        var can = canList[i] === true;
        var line;
        if (auto != null) {
          line = 'Welcome reward paid: ' + fmtAmount(auto, dec) + (sym ? ' ' + sym : '');
        } else if (can) {
          claimable.push(id);
          line = 'Welcome reward pending' +
            (amt != null && BigInt(amt) > 0n ? ' - ' + fmtAmount(amt, dec) + (sym ? ' ' + sym : '') : '') +
            '. Claim it below.';
        } else if (claimedFlag === true) {
          line = 'Welcome reward already claimed.';
        } else if (enabled === false) {
          line = 'Welcome reward is not currently available.';
        } else if (avail != null && amt != null && BigInt(avail) < BigInt(amt)) {
          line = 'Welcome reward is not currently available. The reward pool is being topped up.';
        } else {
          line = 'Welcome reward is not currently available.';
        }
        return '<div class="row" style="justify-content:space-between;gap:10px">' +
          '<span class="pixel" style="font-size:9px;line-height:1.7">NFT #' + MB.esc(String(id)) + '</span>' +
          '<span class="txt" style="text-align:right;word-break:break-word">' + line + '</span></div>';
      }).join('');

      box.innerHTML = '<span class="kicker">WELCOME REWARD</span>' + rows +
        (claimable.length
          ? '<div class="row" style="margin-top:12px"><button class="btn btn--y" id="st-claim" data-ids="' +
            MB.esc(claimable.join(',')) + '">CLAIM REWARD</button>' +
            '<span class="note" id="st-claim-note"></span></div>'
          : '');
      MB.show(box, true);
    }).catch(function () {});
  }

  var rewardBox = MB.el('st-reward');
  if (rewardBox) rewardBox.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('#st-claim') : null;
    if (!b || b.disabled) return;
    var ids = b.getAttribute('data-ids').split(',').map(function (v) { return BigInt(v); });
    var note = MB.el('st-claim-note');
    b.disabled = true;
    b.classList.add('btn--off');
    note.textContent = 'Confirm the transaction in your wallet.';

    CH.stakingWrite().then(function (c) {
      return ids.reduce(function (p, id) {
        return p.then(function () {
          return CH.gasFor(c, 'claimReward', [id]).then(function (gas) {
            return c.claimReward(id, gas ? { gasLimit: gas } : {});
          }).then(function (tx) {
            note.textContent = 'Transaction submitted.';
            return tx.wait();
          }).then(function (rc) {
            if (rc && rc.status === 0) throw new Error('failed');
          });
        });
      }, Promise.resolve());
    }).then(function () {
      // Confirmed against the contract's own record, not the submission.
      return CH.stakingRead().then(function (c) {
        return Promise.all(ids.map(function (id) { return CH.safe(c, 'stakeInfo', [id]); }));
      });
    }).then(function (infos) {
      var ok = infos.every(function (i) {
        return i && (i.rewardClaimed !== undefined ? i.rewardClaimed : i[7]) === true;
      });
      note.textContent = ok ? 'Reward claimed.' : 'The claim did not complete. Please try again.';
      if (!ok) { b.disabled = false; b.classList.remove('btn--off'); }
      else { reportReward(ids, []); }
    }).catch(function (er) {
      b.disabled = false;
      b.classList.remove('btn--off');
      CH.decode(er).then(function (d) { note.textContent = d.text; });
    });
  });

  var rb = MB.el('st-refresh');
  if (rb) rb.addEventListener('click', function () {
    var b = this;
    b.disabled = true;
    loadStatus(); loadNfts();
    window.setTimeout(function () { b.disabled = false; }, 1200);
  });

  CH.on(function () { approved = null; pathMode = null; loadStatus(); loadNfts(); });
  loadStatus();
})();
