/* MiNI BRoKER — central configuration.
   Everything an operator needs to edit lives in this one file. */
window.MB_CONFIG = {

  /* ---- external links ---- */
  openSeaUrl: 'https://opensea.io/collection/minibroker/overview',
  tokenUrl: '',
  xUrl: 'https://x.com/MlNiBroker',
  pinnedPostUrl: 'https://x.com/MlNiBroker/status/2089290879622152358',

  /* ---- referral links ---- */
  // Empty builds links from the current address (works on a custom domain and
  // at username.github.io/repo/ alike). Set only to force one canonical domain.
  siteDomain: '',

  /* ---- data layer (Google Sheets web apps) ---- */
  whitelistApi: 'https://script.google.com/macros/s/AKfycbz4WPYJc_udXklKFD98nOSLxmqBX5JDofGJs5_bmPlcOP3dY1y_eABzj3SNIUgNmopeHQ/exec',
  referralApi: 'https://script.google.com/macros/s/AKfycby9U_19PzuqfaSLxmTAlgaLSAAbCWyOUtoPyohvTSjmhw2zB8Q0NSMXijgPZahaG_n_/exec',
  // Separate GTD Claim web app. Paste the /exec URL from claim-apps-script.gs.
  claimApi: 'https://script.google.com/macros/s/AKfycbwLCmhCGfIcvxFj_UQKko7dxVZKCnUW97k-ikF1TrpT7SrpzloqyPVyGAnPh-075ymT/exec',

  /* ---- staking schedule ----
     Display fallbacks only. DAILY_WINDOW_START/END, LOCK_DURATION and
     TOTAL_CAPACITY are read from the contract, which is always authoritative. */
  staking: { windowOpenUtcHour: 0, windowCloseUtcHour: 18, lockDays: 7, totalCapacity: 5000 },

  /* ---- GTD claim ---- */
  claim: {
    limit: 500,
    // Approved mint date, shown on the claim confirmation. Empty reads UPCOMING.
    mintDate: ''
  },

  /* ---- artwork ---- */
  nft: { first: 91, count: 60, dir: 'assets/nft/' },
  favicon: 'assets/favicon.png',

  /* ---- live contracts ---- */
  contracts: {
    nft: '0x66007297055229066d86294a18edb6e1a2db32d7',
    // The only staking contract. No previous address is kept as a fallback.
    staking: '0xcd7558123046a58918425066c51dF649498C7DC1',
    // Reward token: AAPL - Robinhood Token. Amounts are never hardcoded; only
    // the decimals are fixed. Every figure comes from the staking contract.
    rewardToken: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9',
    rewardTokenSymbol: 'AAPL',
    rewardTokenDecimals: 18,
    token: ''
  },

  // Optional: a WalletConnect project id adds WalletConnect (and every mobile
  // wallet that supports it) to the wallet chooser. Leave empty to offer only
  // the wallets installed in the visitor's browser.
  walletConnectProjectId: '',

  /* ---- network ---- */
  chain: {
    name: 'Robinhood Chain',
    addName: 'Robinhood Chain',
    addRpc: 'https://rpc.mainnet.chain.robinhood.com',
    id: 4663,                 // used for wallet switching only, never displayed
    idHex: '0x1237',
    currency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    explorer: ''
  },

  /* ---- data providers: tried in order, first working one wins ---- */
  rpc: [
    'https://robinhood-mainnet.g.alchemy.com/v2/alch_McYvJojnla9lRXtQly00Y',
    'https://robinhood-mainnet.g.alchemy.com/v2/alch_34ySfd2cXlOXJm2vyFwnc',
    'https://robinhood-mainnet.g.alchemy.com/v2/alch_f9SqZxURXSHOLd4oM044L',
    'https://robinhood-mainnet.g.alchemy.com/v2/alch_oHYYjbyuGFtnh9_wm-H-e',
    'https://robinhood-mainnet.g.alchemy.com/v2/alch_oOC4tUR-UDuWhyJLVMVld',
    'https://robinhood-mainnet.g.alchemy.com/v2/alch_erF7xrrtINpx1NVybSsDc',
    'https://robinhood-mainnet.g.alchemy.com/v2/alch_fIuRTDRk82CrYm69hcich',
    'https://robinhood-mainnet.g.alchemy.com/v2/alch_h9KokhlM8xHwvRO1cfKXW',
    // Public network RPC, used only if every provider above is unreachable.
    'https://rpc.mainnet.chain.robinhood.com'
  ],

  /* ---- future trading ---- */
  trading: {
    // Lifetime countdown reference. Distinct from activation.
    countdownStart: '2026-08-20T13:30:00Z',
    // Trading stays disabled until this moment.
    activation: '2026-08-22T18:00:00Z',
    // Step 5: live. The countdown is published.
    reveal: true,
    // Set true only once a real trading interface is implemented. While false,
    // the page stays in its disabled state even after activation has passed —
    // the clock alone never announces that trading is open.
    live: false
  }
};
