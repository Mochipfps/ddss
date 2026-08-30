/* MiNI BRoKER — wallet, provider failover, contract access.
   One centralized layer: no page duplicates provider or endpoint logic. */
(function () {
  var CFG = window.MB_CONFIG || {};
  var CHAIN = CFG.chain || {};
  var RPC = (CFG.rpc || []).slice();

  var CH = window.MBChain = {
    account: null,
    wrongNetwork: false,
    listeners: [],

    on: function (fn) { CH.listeners.push(fn); },
    emit: function () { CH.listeners.forEach(function (f) { try { f(CH); } catch (e) {} }); },

    hasAbi: function () { return !!(window.MB_STAKING_ABI && window.MB_STAKING_ABI.length); },
    // A wallet is available if any provider was discovered, or if WalletConnect
    // is configured (which needs no extension at all).
    hasWallet: function () { return CH.wallets().length > 0; },

    shortAddr: function (a) {
      var v = String(a || '');
      return v.length < 12 ? v : v.slice(0, 6) + '...' + v.slice(-4);
    },

    /* ---- ethers, loaded on demand from a CDN (no build step) ---- */
    ethers: null,
    loadEthers: function () {
      if (CH._ethersP) return CH._ethersP;
      CH._ethersP = new Promise(function (res, rej) {
        if (window.ethers) { CH.ethers = window.ethers; res(window.ethers); return; }
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.umd.min.js';
        s.onload = function () { CH.ethers = window.ethers; res(window.ethers); };
        s.onerror = function () { rej(new Error('provider unavailable')); };
        document.head.appendChild(s);
      });
      return CH._ethersP;
    },

    /* ---- read provider with endpoint failover ----
       Endpoints are held only here and never surfaced in the UI or logs. */
    _rpcIndex: 0,
    readProvider: function () {
      return CH.loadEthers().then(function (E) {
        return new E.JsonRpcProvider(RPC[CH._rpcIndex], CHAIN.id || undefined, { staticNetwork: true });
      });
    },

    // Runs fn(provider) against each endpoint in turn until one answers.
    withProvider: function (fn) {
      return CH.loadEthers().then(function (E) {
        var i = 0;
        function attempt() {
          if (i >= RPC.length) return Promise.reject(new Error('unavailable'));
          var idx = (CH._rpcIndex + i) % RPC.length;
          var p = new E.JsonRpcProvider(RPC[idx], CHAIN.id || undefined, { staticNetwork: true });
          return Promise.resolve()
            .then(function () { return fn(p, E); })
            .then(function (r) { CH._rpcIndex = idx; return r; })
            .catch(function () { i++; return attempt(); });
        }
        return attempt();
      });
    },

    /* ---- Alchemy NFT ownership, same failover order ----
       Wallet-based lookup only. No token-id scanning anywhere. */
    ownedNfts: function (owner) {
      var contract = (CFG.contracts || {}).nft;
      var i = 0;
      function attempt() {
        if (i >= RPC.length) return Promise.reject(new Error('unavailable'));
        var base = RPC[i].replace('/v2/', '/nft/v3/');
        var url = base + '/getNFTsForOwner?owner=' + encodeURIComponent(owner) +
          '&contractAddresses[]=' + encodeURIComponent(contract) +
          '&withMetadata=true&pageSize=100';
        return fetch(url, { headers: { accept: 'application/json' } })
          .then(function (r) { if (!r.ok) throw new Error('endpoint'); return r.json(); })
          .then(function (j) {
            if (!j || !j.ownedNfts) throw new Error('endpoint');
            return j.ownedNfts.map(function (n) {
              var img = (n.image && (n.image.cachedUrl || n.image.thumbnailUrl || n.image.originalUrl)) || '';
              return {
                id: String(Number(n.tokenId)),
                name: (n.name || ('MiNI BRoKER #' + Number(n.tokenId))),
                image: img
              };
            });
          })
          .catch(function () { i++; return attempt(); });
      }
      return attempt();
    },

    /* ---- contracts ---- */
    stakingRead: function () {
      if (!CH.hasAbi()) return Promise.reject(new Error('abi'));
      return CH.withProvider(function (p, E) {
        return new E.Contract((CFG.contracts || {}).staking, window.MB_STAKING_ABI, p);
      });
    },

    signer: function () {
      if (!CH.provider) return Promise.reject(new Error('nowallet'));
      return CH.loadEthers().then(function (E) {
        var bp = new E.BrowserProvider(CH.provider);
        return bp.getSigner();
      });
    },

    stakingWrite: function () {
      if (!CH.hasAbi()) return Promise.reject(new Error('abi'));
      return CH.signer().then(function (s) {
        return new CH.ethers.Contract((CFG.contracts || {}).staking, window.MB_STAKING_ABI, s);
      });
    },

    nftWrite: function () {
      return CH.signer().then(function (s) {
        return new CH.ethers.Contract((CFG.contracts || {}).nft, window.MB_ERC721_ABI, s);
      });
    },

    /* ---- wallet discovery (EIP-6963) ----
       Every announced provider is collected, so the user picks their own wallet.
       window.ethereum is only a last-resort fallback, never an automatic choice. */
    _found: [],
    _bound: null,
    provider: null,

    discover: function () {
      var seen = {};
      var out = [];

      // Providers that announce themselves per EIP-6963 (MetaMask, Coinbase
      // Wallet, Rabby, Trust, OKX, Phantom, Brave and others).
      CH._found.forEach(function (d) {
        var key = (d.info && (d.info.rdns || d.info.uuid)) || d.info.name;
        if (seen[key]) return;
        seen[key] = true;
        out.push({ id: key, name: d.info.name, icon: d.info.icon || '', provider: d.provider });
      });

      // Legacy fallback only when no wallet announced itself; an announced
      // wallet is the same object as window.ethereum and must not be re-listed.
      var eth = out.length ? null : window.ethereum;
      if (eth) {
        var legacy = eth.providers && eth.providers.length ? eth.providers : [eth];
        legacy.forEach(function (p, i) {
          var name = p.isCoinbaseWallet ? 'Coinbase Wallet'
            : p.isRabby ? 'Rabby'
            : p.isTrust || p.isTrustWallet ? 'Trust Wallet'
            : p.isBraveWallet ? 'Brave Wallet'
            : p.isMetaMask ? 'MetaMask'
            : 'Browser Wallet';
          if (seen[name]) return;
          seen[name] = true;
          out.push({ id: 'legacy-' + i + '-' + name, name: name, icon: '', provider: p });
        });
      }

      // WalletConnect covers every mobile wallet, and needs no extension.
      if (String(CFG.walletConnectProjectId || '').trim()) {
        out.push({ id: 'walletconnect', name: 'WalletConnect', icon: '', provider: null, wc: true });
      }
      return out;
    },

    wallets: function () { return CH.discover(); },

    // WalletConnect is loaded on demand, only when the user picks it.
    _wc: null,
    walletConnect: function () {
      if (CH._wc) return Promise.resolve(CH._wc);
      var pid = String(CFG.walletConnectProjectId || '').trim();
      if (!pid) return Promise.reject(new Error('nowallet'));
      return new Promise(function (res, rej) {
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.17.0/dist/index.umd.js';
        s.onload = res;
        s.onerror = function () { rej(new Error('nowallet')); };
        document.head.appendChild(s);
      }).then(function () {
        var EP = window.EthereumProvider || (window['@walletconnect/ethereum-provider'] || {}).EthereumProvider;
        if (!EP) throw new Error('nowallet');
        return EP.init({
          projectId: pid,
          chains: [CHAIN.id],
          optionalChains: [CHAIN.id],
          showQrModal: true,
          rpcMap: (function () { var m = {}; m[CHAIN.id] = RPC[0]; return m; })(),
          metadata: {
            name: 'MiNI BRoKER',
            description: 'MiNI BRoKER pixel NFT collection',
            url: window.location.origin,
            icons: [window.location.origin + '/assets/favicon.png']
          }
        });
      }).then(function (p) { CH._wc = p; return p; });
    },

    /* ---- connect to the wallet the user chose ---- */
    connect: function (choice) {
      var list = CH.wallets();
      if (!list.length) return Promise.reject(new Error('nowallet'));
      var pick = choice || (list.length === 1 ? list[0] : null);
      if (!pick) return Promise.reject(new Error('choose'));

      var ready = pick.wc ? CH.walletConnect().then(function (p) {
        return p.enable().then(function () { return p; });
      }) : Promise.resolve(pick.provider);

      return ready.then(function (p) {
        CH.provider = p;
        CH.bind(p);
        // Connection approval only. No signature is ever requested for login.
        return p.request({ method: 'eth_requestAccounts' });
      }).then(function (accts) {
        CH.account = (accts && accts[0]) || null;
        try { window.localStorage.setItem('mb_wallet', pick.id); } catch (e) {}
        return CH.checkNetwork();
      }).then(function () { CH.emit(); return CH.account; });
    },

    // Silent resume of the wallet chosen last time; never prompts.
    resume: function () {
      var saved = null;
      try { saved = window.localStorage.getItem('mb_wallet'); } catch (e) {}
      if (!saved || saved === 'walletconnect') return Promise.resolve(null);
      var pick = null;
      CH.wallets().forEach(function (w) { if (w.id === saved) pick = w; });
      if (!pick || !pick.provider) return Promise.resolve(null);
      CH.provider = pick.provider;
      CH.bind(pick.provider);
      return pick.provider.request({ method: 'eth_accounts' })
        .then(function (accts) {
          CH.account = (accts && accts[0]) || null;
          if (!CH.account) return null;
          return CH.checkNetwork().then(function () { CH.emit(); return CH.account; });
        })
        .catch(function () { return null; });
    },

    bind: function (p) {
      if (!p || !p.on || CH._bound === p) return;
      CH._bound = p;
      p.on('accountsChanged', function (accts) {
        var next = (accts && accts[0]) || null;
        if (!next) { CH.disconnect(); return; }
        // New account: the previous wallet's data is dropped, not reused.
        CH.account = next;
        CH.checkNetwork().then(function () { CH.emit(); });
      });
      p.on('chainChanged', function () { CH.checkNetwork().then(function () { CH.emit(); }); });
      if (p.on) p.on('disconnect', function () { CH.disconnect(); });
    },

    checkNetwork: function () {
      var p = CH.provider;
      if (!p || !CHAIN.idHex) return Promise.resolve(true);
      return p.request({ method: 'eth_chainId' })
        .then(function (id) {
          CH.wrongNetwork = String(id).toLowerCase() !== String(CHAIN.idHex).toLowerCase();
          return !CH.wrongNetwork;
        })
        .catch(function () { return true; });
    },

    switchNetwork: function () {
      var p = CH.provider;
      if (!p || !CHAIN.idHex) return Promise.resolve(false);
      return p.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CHAIN.idHex }]
      }).catch(function (err) {
        if (err && (err.code === 4902 || err.code === -32603)) {
          return p.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: CHAIN.idHex,
              chainName: CHAIN.name,
              nativeCurrency: CHAIN.currency,
              rpcUrls: [RPC[0]],
              blockExplorerUrls: CHAIN.explorer ? [CHAIN.explorer] : undefined
            }]
          });
        }
        throw err;
      }).then(function () { return CH.checkNetwork(); })
        .then(function () { CH.emit(); return !CH.wrongNetwork; })
        .catch(function () { return false; });
    },

    disconnect: function () {
      // Clear every piece of wallet-specific state.
      CH.account = null;
      CH.wrongNetwork = false;
      CH.provider = null;
      CH._bound = null;
      try { window.localStorage.removeItem('mb_wallet'); } catch (e) {}
      if (CH._wc && CH._wc.disconnect) { try { CH._wc.disconnect(); } catch (e) {} }
      CH._wc = null;
      CH.emit();
    },

    /* ---- plain-language errors ----
       The deployed contract uses custom errors, so the error NAME is matched
       first; raw revert data, RPC and endpoint detail is never surfaced. */
    ERRORS: {
      StakingWindowClosed: 'Staking is currently closed. Please return during the staking window.',
      StakingIsDisabled: 'Staking is currently disabled.',
      SystemIsDisabled: 'The staking system is currently unavailable.',
      EmergencyPausedActive: 'Staking is temporarily paused.',
      DailyCapacityReached: "Today's staking capacity has been reached.",
      TotalCapacityReached: 'The 5,000 NFT staking capacity has been reached.',
      AlreadyStaked: 'That NFT is already staked.',
      NotStaked: 'That NFT is not staked.',
      NotStaker: 'That NFT was staked by another wallet.',
      StillLocked: 'That NFT is still locked.',
      InvalidNFT: 'That NFT is not part of this collection.',
      EmptyBatch: 'Select at least one NFT.',
      ArrayLengthMismatch: 'That selection could not be processed. Please try again.',
      RewardNotAvailable: 'The reward is not currently available.',
      RewardAlreadyClaimed: 'The reward has already been claimed.',
      InsufficientRewardBalance: 'The reward pool is currently insufficient. Please try again later.',
      RefundNotAvailable: 'The refund is not currently available.',
      RefundAlreadyClaimed: 'The refund has already been claimed.',
      AirdropNotAvailable: 'The airdrop is not currently available.',
      AirdropAlreadyClaimed: 'The airdrop has already been claimed.',
      CannotRecoverReservedTokens: 'That action is not permitted.',
      CannotRecoverStakedNFT: 'That action is not permitted.',
      NothingToRecover: 'That action is not permitted.',
      InvalidAmount: 'That amount is not valid.',
      InvalidToken: 'That token is not valid.',
      InvalidBps: 'That value is not valid.',
      ZeroAddress: 'Something went wrong. Please try again.',
      Unauthorized: 'This wallet is not authorized for that action.',
      OwnableUnauthorizedAccount: 'This wallet is not authorized for that action.',
      OwnableInvalidOwner: 'This wallet is not authorized for that action.',
      NFTContractFinalizedError: 'That setting can no longer be changed.',
      RewardConfigFinalizedError: 'That setting can no longer be changed.',
      SafeERC20FailedOperation: 'The token transfer could not be completed.',
      FailedInnerCall: 'The transaction could not be completed. Please try again.',
      NativeTransferFailed: 'The transfer could not be completed. Please try again.',
      AddressEmptyCode: 'The transaction could not be completed. Please try again.',
      AddressInsufficientBalance: 'The transaction could not be completed. Please try again.',
      ReentrancyGuardReentrantCall: 'The transaction could not be completed. Please try again.'
    },

    // Selector -> name, computed from the ABI's own error list at runtime.
    _selectors: null,
    selectorTable: function () {
      if (CH._selectors) return Promise.resolve(CH._selectors);
      return CH.loadEthers().then(function (E) {
        var t = {};
        (window.MB_STAKING_ABI || []).forEach(function (a) {
          if (a.type !== 'error') return;
          var sig = a.name + '(' + (a.inputs || []).map(function (i) { return i.type; }).join(',') + ')';
          t[E.id(sig).slice(0, 10).toLowerCase()] = a.name;
        });
        // Nested ERC-721 failures surface from the NFT contract, not the staker.
        [
          'ERC721InsufficientApproval(address,uint256)',
          'ERC721NonexistentToken(uint256)',
          'ERC721IncorrectOwner(address,uint256,address)',
          'ERC721InvalidReceiver(address)',
          'ERC721InvalidOwner(address)',
          'ERC721InvalidApprover(address)',
          'ERC721InvalidOperator(address)',
          'ERC721InvalidSender(address)'
        ].forEach(function (sig) {
          t[E.id(sig).slice(0, 10).toLowerCase()] = sig.split('(')[0];
        });
        CH._selectors = t;
        return t;
      });
    },

    // Digs the 4-byte selector or revert string out of any provider's shape.
    rawRevert: function (err) {
      var e = err, hex = '', str = '';
      for (var hop = 0; hop < 6 && e; hop++) {
        var d = e.data;
        if (typeof d === 'string' && /^0x[0-9a-fA-F]*$/.test(d) && d.length >= 10) hex = d;
        else if (d && typeof d.data === 'string' && d.data.length >= 10) hex = d.data;
        else if (d && typeof d.originalError === 'object' && typeof d.originalError.data === 'string') hex = d.originalError.data;
        if (!str && typeof e.message === 'string') {
          var m = e.message.match(/0x[0-9a-fA-F]{8,}/);
          if (m && !hex) hex = m[0];
          var rs = e.message.match(/reverted with reason string ['"]([^'"]+)['"]/);
          if (rs) str = rs[1];
        }
        e = e.error || e.info || e.cause || e.originalError || null;
      }
      return { selector: hex ? hex.slice(0, 10).toLowerCase() : '', hex: hex, reason: str };
    },

    // Names that belong to the staking contract's own ABI.
    isStakingError: function (name) {
      return !!(name && (CH.ERRORS[name] !== undefined) &&
        (window.MB_STAKING_ABI || []).some(function (a) { return a.type === 'error' && a.name === name; }));
    },

    // Full decode: name, selector, and a plain sentence — nothing swallowed.
    decode: function (err) {
      var raw = CH.rawRevert(err);
      var named = CH.errName(err);
      return CH.selectorTable().then(function (t) {
        var name = named || (raw.selector && t[raw.selector]) || '';
        var text = (name && CH.ERRORS[name]) || CH.EXTRA[name] || raw.reason || CH.message(err);
        // A revert with no match in either ABI, carrying real revert data, came
        // from the NFT contract's transfer rules rather than the staking logic.
        if (!name && raw.selector && raw.selector !== '0x08c379a0') {
          text = 'This NFT could not be transferred. Its collection is currently blocking the transfer.';
        }
        return { name: name, selector: raw.selector, reason: raw.reason, text: text };
      }).catch(function () {
        return { name: named, selector: raw.selector, reason: raw.reason, text: CH.message(err) };
      });
    },

    // Nested ERC-721 causes, reported as the NFT contract's own refusal.
    EXTRA: {
      ERC721InsufficientApproval: 'Approve the staking contract before staking.',
      ERC721NonexistentToken: 'That NFT could not be found.',
      ERC721IncorrectOwner: 'That NFT is not in the connected wallet.',
      ERC721InvalidReceiver: 'That NFT could not be transferred. Please try again.',
      InvalidNFT: 'That NFT is not part of this collection.',
      NFTContractFinalizedError: 'That setting can no longer be changed.',
      Unauthorized: 'This wallet is not authorized for that action.',
      ReentrancyGuardReentrantCall: 'The transaction could not be completed. Please try again.'
    },

    // Pulls a custom-error name out of anywhere ethers reports it.
    errName: function (err) {
      if (!err) return '';
      var e = err;
      for (var hop = 0; hop < 4 && e; hop++) {
        if (e.revert && e.revert.name) return e.revert.name;
        if (e.errorName) return e.errorName;
        e = e.error || e.info || e.cause || null;
      }
      // Error.message is non-enumerable, so JSON.stringify alone yields "{}".
      // The message/shortMessage/reason strings are scanned explicitly.
      var blob = String((err && err.message) || '') + ' ' +
                 String((err && err.shortMessage) || '') + ' ' +
                 String((err && err.reason) || '') + ' ' +
                 String((err && err.data) || '');
      try { blob += ' ' + JSON.stringify(err); } catch (x) {}
      var keys = Object.keys(CH.ERRORS);
      for (var i = 0; i < keys.length; i++) {
        if (blob.indexOf(keys[i]) > -1) return keys[i];
      }
      return '';
    },

    message: function (err) {
      var named = CH.errName(err);
      if (named && CH.ERRORS[named]) return CH.ERRORS[named];

      var code = err && (err.code || (err.info && err.info.error && err.info.error.code));
      var raw = String((err && (err.shortMessage || err.reason || err.message)) || '').toLowerCase();

      if (code === 4001 || code === 'ACTION_REJECTED' || raw.indexOf('reject') > -1 || raw.indexOf('denied') > -1) return 'Transaction cancelled.';
      if (raw.indexOf('nowallet') > -1) return 'Connect your wallet to continue.';
      if (raw.indexOf('choose') > -1) return 'Choose a wallet to continue.';
      if (raw.indexOf('wrongnetwork') > -1 || raw.indexOf('chain') > -1) return 'Switch to ' + ((CFG.chain || {}).name || 'the correct network') + ' to continue.';
      if (raw.indexOf('abi') > -1) return 'Staking is temporarily unavailable. Please try again shortly.';
      if (raw.indexOf('approvalneeded') > -1) return 'Approve the staking contract before staking.';
      if (raw.indexOf('notowner') > -1) return 'This NFT is no longer owned by the connected wallet.';
      if (raw.indexOf('wrongcollection') > -1) return 'That NFT is not part of this collection.';
      if (raw.indexOf('insufficient funds') > -1) return 'Not enough funds for the network fee.';
      if (raw.indexOf('unavailable') > -1 || raw.indexOf('fetch') > -1 || raw.indexOf('timeout') > -1) return 'Network error. Please try again.';
      return 'The transaction could not be completed. Please try again.';
    },

    // Dry-run a write call against the node. Throws the decoded custom error
    // instead of letting the user sign a transaction that cannot succeed.
    simulate: function (contract, fn, args) {
      if (!contract || !contract[fn] || !contract[fn].staticCall) return Promise.resolve(true);
      return contract[fn].staticCall.apply(contract[fn], args || []).then(function () { return true; });
    },

    // Wallet-estimated gas with a small headroom; never a hardcoded low limit.
    gasFor: function (contract, fn, args) {
      if (!contract || !contract[fn] || !contract[fn].estimateGas) return Promise.resolve(undefined);
      return contract[fn].estimateGas.apply(contract[fn], args || [])
        .then(function (g) { return (g * 125n) / 100n; })
        .catch(function () { return undefined; });
    },

    /* ---- helpers ---- */
    // Any live view call: missing from the ABI or reverting resolves to null so
    // the UI shows a dash instead of a fabricated value.
    safe: function (c, name, args) {
      try {
        if (!c || typeof c[name] !== 'function') return Promise.resolve(null);
        return c[name].apply(c, args || []).catch(function () { return null; });
      } catch (e) { return Promise.resolve(null); }
    },
    num: function (v) { return v == null ? null : Number(v); },
    dash: function (v) { return v == null ? '——' : String(v); },
    dur: function (secs) {
      var s = Math.max(0, Math.floor(Number(secs) || 0));
      var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
          m = Math.floor((s % 3600) / 60), ss = s % 60;
      if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
      if (h > 0) return h + 'h ' + m + 'm ' + ss + 's';
      return m + 'm ' + ss + 's';
    },
    // Next window boundary, computed from UTC only - never local time. The
    // hours come from the contract's DAILY_WINDOW_START/END; this is display
    // support for the contract's own window state, not a substitute for it.
    schedule: function () {
      var S = (CFG.staking || {});
      var openH = S.windowOpenUtcHour == null ? 14 : S.windowOpenUtcHour;
      var closeH = S.windowCloseUtcHour == null ? 18 : S.windowCloseUtcHour;
      var now = new Date();
      var h = now.getUTCHours();
      var open = h >= openH && h < closeH;
      var target = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
        open ? closeH : openH, 0, 0, 0
      ));
      if (!open && h >= closeH) target.setUTCDate(target.getUTCDate() + 1);
      return { open: open, until: Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000)) };
    },

    utc: function (secs) {
      if (!secs) return '——';
      var d = new Date(Number(secs) * 1000);
      if (isNaN(d.getTime())) return '——';
      return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    }
  };

  // EIP-6963: collect every wallet that announces itself.
  window.addEventListener('eip6963:announceProvider', function (e) {
    var d = e && e.detail;
    if (!d || !d.provider || !d.info) return;
    var key = d.info.rdns || d.info.uuid || d.info.name;
    for (var i = 0; i < CH._found.length; i++) {
      var f = CH._found[i].info || {};
      if ((f.rdns || f.uuid || f.name) === key) { CH._found[i] = d; return; }
    }
    CH._found.push(d);
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));

  // Wallets can announce late; re-request shortly after load.
  window.setTimeout(function () {
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    CH.emit();
  }, 350);
})();
