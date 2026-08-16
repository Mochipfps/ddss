/* FIND THE BROKER — three hidden brokers, three chances. */
(function () {
  var grid = MB.el('h-grid'), game = null;
  if (!grid) return;

  function fresh() {
    var pool = MB.shuffle(MB.nftIds()).slice(0, 16);
    var targets = MB.shuffle([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]).slice(0, 3);
    return {
      cards: pool.map(function (n, i) { return { n: n, rev: false, target: targets.indexOf(i) > -1 }; }),
      chances: 3, found: 0, won: false
    };
  }

  function draw() {
    MB.el('h-chances').textContent = game.chances;
    MB.el('h-found').textContent = game.found;
    MB.show(MB.el('h-win'), game.won);
    MB.show(MB.el('h-lost'), !game.won && game.chances <= 0);
    grid.innerHTML = game.cards.map(function (c, i) {
      if (!c.rev) return '<button data-i="' + i + '"><span class="hunt__q">?</span></button>';
      var cap = c.target
        ? '<div class="tile__cap" style="background:var(--green);color:var(--cream)">BROKER</div>'
        : '<div class="tile__cap">#' + c.n + '</div>';
      return '<button data-i="' + i + '" style="background:var(--panel)">' +
        '<div class="tile__img" role="img" aria-label="Revealed NFT" style="background-image:url(' + MB.nftSrc(c.n) + ')"></div>' + cap + '</button>';
    }).join('');
  }

  grid.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button[data-i]') : null;
    if (!b) return;
    var i = Number(b.getAttribute('data-i'));
    if (game.won || game.chances <= 0 || game.cards[i].rev) return;
    game.cards[i].rev = true;
    if (game.cards[i].target) game.found++;
    game.chances--;
    game.won = game.found === 3;
    draw();
  });

  MB.el('h-new').addEventListener('click', function () { game = fresh(); draw(); });
  game = fresh();
  draw();
})();
