/* NFT gallery: home marquee and the full grid on /nfts/. */
(function () {
  var ids = MB.nftIds();
  var tile = function (id) {
    return '<div class="tile"><div class="tile__img" role="img" aria-label="MiNI BRoKER NFT" style="background-image:url(' +
      MB.nftSrc(id) + ')"></div><div class="tile__cap">#' + id + '</div></div>';
  };
  var m = MB.el('mb-marquee');
  if (m) {
    var strip = ids.filter(function (_, i) { return i % 2 === 0; });
    m.innerHTML = strip.concat(strip).map(tile).join('');
  }
  var g = MB.el('mb-grid');
  if (g) g.innerHTML = ids.map(tile).join('');
})();
