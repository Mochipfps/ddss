/* MiNI BRoKER — central configuration.
   Everything an operator needs to edit lives in this one file. */
window.MB_CONFIG = {

  /* ---- external links ---- */
  openSeaUrl: 'https://opensea.io/collection/minibroker/overview',
  tokenUrl: '',
  xUrl: 'https://x.com/MlNiBroker',
  pinnedPostUrl: '',

  /* ---- referral links ---- */
  // Empty builds links from the current address (works on a custom domain and
  // at username.github.io/repo/ alike). Set only to force one canonical domain.
  siteDomain: '',

  /* ---- data layer (Google Sheets web apps) ---- */
  whitelistApi: 'https://script.google.com/macros/s/AKfycbz4WPYJc_udXklKFD98nOSLxmqBX5JDofGJs5_bmPlcOP3dY1y_eABzj3SNIUgNmopeHQ/exec',
  referralApi: 'https://script.google.com/macros/s/AKfycby9U_19PzuqfaSLxmTAlgaLSAAbCWyOUtoPyohvTSjmhw2zB8Q0NSMXijgPZahaG_n_/exec',

  /* ---- artwork ---- */
  nft: { first: 91, count: 60, dir: 'assets/nft/' },
  favicon: 'assets/favicon.png',

  /* ---- live contracts ---- */
  contracts: {
    nft: '0x66007297055229066d86294a18edb6e1a2db32d7',
    staking: '0x0D91b7900A25C4F9e55528DA3A1A5B1b8B3a266f',
    token: ''
  },

  // Optional: a WalletConnect project id adds WalletConnect (and every mobile
  // wallet that supports it) to the wallet chooser. Leave empty to offer only
  // the wallets installed in the visitor's browser.
  walletConnectProjectId: '',

  /* ---- network ---- */
  chain: {
    name: 'Robinhood Mainnet',
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
    'https://robinhood-mainnet.g.alchemy.com/v2/alch_h9KokhlM8xHwvRO1cfKXW'
  ],

  /* ---- future trading ---- */
  trading: {
    // Lifetime countdown reference. Distinct from activation.
    countdownStart: '2026-08-20T13:30:00Z',
    // Trading stays disabled until this moment.
    activation: '2026-08-22T18:00:00Z',
    // Step 5 sets this to true to publish the countdown and activation state.
    // While false, every public time display reads UPCOMING.
    reveal: false
  }
};
