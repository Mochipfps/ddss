/* MiNI BRoKER — central configuration.
   Everything an operator needs to edit lives in this one file. */
window.MB_CONFIG = {

  /* ---- external links ---- */
  // Paste the OpenSea collection URL here. Every MARKETPLACE button uses it.
  openSeaUrl: '',
  // Optional $MINiBRKR token page. Empty keeps the button in its SOON state.
  tokenUrl: '',
  xUrl: 'https://x.com/MlNiBroker/status/2089298201396281728',
  // Pinned post used by WhiteList task 04. Empty falls back to the X profile.
  pinnedPostUrl: '',

  /* ---- referral links ---- */
  // Leave empty to build referral links from the current address (works on a
  // custom domain and on username.github.io/repo/ alike). Set it only to force
  // one canonical domain, e.g. 'https://minibroker.xyz/'.
  siteDomain: '',

  /* ---- data layer (Google Sheets web apps) ---- */
  // Existing WhiteList web app. Do not repoint this at the referral script.
  whitelistApi: 'https://script.google.com/macros/s/AKfycbz4WPYJc_udXklKFD98nOSLxmqBX5JDofGJs5_bmPlcOP3dY1y_eABzj3SNIUgNmopeHQ/exec',
  // Separate Referral + Collabs web app.
  referralApi: 'https://script.google.com/macros/s/AKfycby9U_19PzuqfaSLxmTAlgaLSAAbCWyOUtoPyohvTSjmhw2zB8Q0NSMXijgPZahaG_n_/exec',

  /* ---- artwork ---- */
  nft: { first: 91, count: 60, dir: 'assets/nft/' },
  favicon: 'assets/favicon.png',

  /* ---- STEP 4 / STEP 5 placeholders: keep empty until the real values exist ---- */
  contracts: { nft: '', staking: '', token: '' },
  chain: { name: 'Robinhood Mainnet', id: null, rpc: '' }
};
