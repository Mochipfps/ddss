/* Future Trading gate.
   The activation and lifetime-countdown timestamps stay in config and trading
   stays disabled until activation. Nothing time-based is published yet: until
   MB_CONFIG.trading.reveal is set to true (Step 5), every state reads UPCOMING. */
(function () {
  var T = (MB.cfg.trading || {});
  var START = Date.parse(T.countdownStart || '');
  var GO = Date.parse(T.activation || '');
  var until = MB.el('tr-until'), life = MB.el('tr-life'), state = MB.el('tr-state');
  if (!until) return;

  if (!T.reveal) {
    state.textContent = 'UPCOMING';
    until.textContent = 'UPCOMING';
    life.textContent = 'UPCOMING';
    return;
  }
  if (isNaN(GO)) return;

  function fmt(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
        m = Math.floor((s % 3600) / 60), ss = s % 60;
    return d + 'd ' + h + 'h ' + m + 'm ' + ss + 's';
  }

  function tick() {
    var now = Date.now();
    var live = now >= GO;
    state.textContent = live ? 'TRADING OPEN' : 'COMING SOON';
    until.textContent = live ? 'OPEN' : fmt(GO - now);
    life.textContent = (isNaN(START) || now < START) ? 'NOT STARTED' : fmt(now - START);
    if (live) window.clearInterval(iv);
  }
  var iv = window.setInterval(tick, 1000);
  tick();
})();
