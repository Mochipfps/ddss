/* Planned asset tiles. Pixel monograms until real logo files are supplied. */
(function () {
  var host = MB.el('mb-assets');
  if (!host) return;
  var ASSETS = [
    ['AAPL', '--cream', '--ink'], ['MSFT', '--sky', '--ink'], ['NVDA', '--green', '--cream'],
    ['AMZN', '--orange', '--ink'], ['GOOGL', '--yellow', '--ink'], ['META', '--sky', '--ink'],
    ['TSLA', '--red', '--cream'], ['PLTR', '--purple', '--cream'], ['AMD', '--red', '--cream'],
    ['GME', '--orange', '--ink'], ['SPCX', '--purple', '--cream'], ['BTC', '--orange', '--ink'],
    ['ETH', '--purple', '--cream'], ['SOL', '--green', '--cream']
  ];
  host.innerHTML = ASSETS.map(function (a) {
    return '<div class="panel panel--flat" style="flex-direction:row;align-items:center;gap:9px;padding:11px;box-shadow:4px 4px 0 var(--ink)">' +
      '<span class="num" style="width:28px;height:28px;background:var(' + a[1] + ');color:var(' + a[2] + ')">' + a[0].charAt(0) + '</span>' +
      '<span class="pixel" style="font-size:10px;line-height:1.5">' + a[0] + '</span></div>';
  }).join('');
})();
