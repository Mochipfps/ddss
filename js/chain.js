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

    /* ---- plain-language errors: never a raw revert or RPC dump ---- */
    message: function (err) {
      var code = err && (err.code || (err.info && err.info.error && err.info.error.code));
      var raw = String((err && (err.shortMessage || err.reason || err.message)) || '').toLowerCase();
      if (code === 4001 || code === 'ACTION_REJECTED' || raw.indexOf('reject') > -1) return 'Transaction rejected in your wallet.';
      if (raw.indexOf('nowallet') > -1) return 'No compatible wallet was detected.';
      if (raw.indexOf('choose') > -1) return 'Choose a wallet to continue.';
      if (raw.indexOf('abi') > -1) return 'Staking data is temporarily unavailable. Please try again shortly.';
      if (raw.indexOf('insufficient') > -1) return 'Not enough funds to cover the network fee.';
      if (raw.indexOf('window') > -1 || raw.indexOf('closed') > -1) return 'Staking is currently closed.';
      if (raw.indexOf('capacity') > -1) return 'The daily staking capacity has been reached.';
      if (raw.indexOf('already') > -1 && raw.indexOf('stak') > -1) return 'That NFT is already staked.';
      if (raw.indexOf('lock') > -1) return 'That NFT is still locked.';
      if (raw.indexOf('unavailable') > -1 || raw.indexOf('network') > -1 || raw.indexOf('fetch') > -1) return 'NFT data is temporarily unavailable. Please try again shortly.';
      if (raw.indexOf('revert') > -1 || raw.indexOf('execution') > -1) return 'The transaction could not be completed.';
      return 'Something went wrong. Please try again shortly.';
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
