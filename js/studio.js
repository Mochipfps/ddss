/* PIXEL ART STUDIO — 16x16 pad plus a drawn signature pad.
   The @MlNiBroker tag is composed into the export only, never onto the canvas. */
(function () {
  var PALETTE = ['#E23B32','#EFBF2E','#6E35CE','#E08A2E','#3BA3E8','#33A155','#F7F1E5','#16181F'];
  var CREAM = '#F7F1E5', INK = '#16181F';
  var pad = MB.el('s-pad'), tools = MB.el('s-tools');
  if (!pad) return;

  var cells = new Array(256), brush = PALETTE[0], painting = false, sigDone = false;
  for (var i = 0; i < 256; i++) cells[i] = '';

  tools.innerHTML = PALETTE.map(function (c, i) {
    return '<button class="swatch" data-c="' + c + '" aria-label="Color ' + (i + 1) + '" style="background:' + c + '"></button>';
  }).join('') +
    '<button class="btn btn--y" id="s-eraser">ERASER</button>' +
    '<button class="btn btn--red" id="s-clear">CLEAR</button>';

  tools.addEventListener('click', function (e) {
    var s = e.target.closest ? e.target.closest('[data-c]') : null;
    if (s) { brush = s.getAttribute('data-c'); return; }
    if (e.target.id === 's-eraser') brush = '';
    if (e.target.id === 's-clear') {
      for (var i = 0; i < 256; i++) { cells[i] = ''; pad.children[i].style.background = CREAM; }
    }
  });

  var frag = '';
  for (var k = 0; k < 256; k++) frag += '<div data-i="' + k + '" style="background:' + CREAM + '"></div>';
  pad.innerHTML = frag;

  function paint(i) {
    if (i < 0 || i > 255) return;
    cells[i] = brush;
    pad.children[i].style.background = brush || CREAM;
  }
  function idxFrom(target) {
    if (!target || !target.getAttribute) return -1;
    var a = target.getAttribute('data-i');
    return a === null ? -1 : Number(a);
  }
  pad.addEventListener('mousedown', function (e) { painting = true; paint(idxFrom(e.target)); e.preventDefault(); });
  pad.addEventListener('mouseover', function (e) { if (painting) paint(idxFrom(e.target)); });
  window.addEventListener('mouseup', function () { painting = false; });
  pad.addEventListener('touchstart', touch, { passive: false });
  pad.addEventListener('touchmove', touch, { passive: false });
  function touch(e) {
    var t = e.touches && e.touches[0];
    if (!t) return;
    e.preventDefault();
    paint(idxFrom(document.elementFromPoint(t.clientX, t.clientY)));
  }

  /* ---------------- signature pad ---------------- */
  var sig = MB.el('s-sig'), sx = sig.getContext('2d'), drawing = false, sigUsed = false;
  sx.lineWidth = 6;
  sx.lineCap = 'round';
  sx.lineJoin = 'round';
  sx.strokeStyle = INK;
  clearSig();

  function clearSig() {
    sx.fillStyle = CREAM;
    sx.fillRect(0, 0, sig.width, sig.height);
    sigUsed = false;
    sigDone = false;
    MB.show(MB.el('s-sig-ok'), false);
    MB.el('s-sig-warn').hidden = false;
    lockDownload(true);
  }
  function pt(e) {
    var r = sig.getBoundingClientRect();
    var src = e.touches && e.touches[0] ? e.touches[0] : e;
    return {
      x: (src.clientX - r.left) * (sig.width / r.width),
      y: (src.clientY - r.top) * (sig.height / r.height)
    };
  }
  function start(e) { drawing = true; sigUsed = true; var p = pt(e); sx.beginPath(); sx.moveTo(p.x, p.y); e.preventDefault(); }
  function move(e) { if (!drawing) return; var p = pt(e); sx.lineTo(p.x, p.y); sx.stroke(); e.preventDefault(); }
  function end() { drawing = false; }
  sig.addEventListener('mousedown', start);
  sig.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  sig.addEventListener('touchstart', start, { passive: false });
  sig.addEventListener('touchmove', move, { passive: false });
  sig.addEventListener('touchend', end);

  function lockDownload(lock) {
    var b = MB.el('s-dl');
    b.disabled = !!lock;
    b.classList.toggle('btn--off', !!lock);
    b.classList.toggle('btn--green', !lock);
  }

  MB.el('s-sig-clear').addEventListener('click', clearSig);
  MB.el('s-sig-done').addEventListener('click', function () {
    if (!sigUsed) return;
    sigDone = true;
    MB.show(MB.el('s-sig-ok'), true);
    MB.el('s-sig-warn').hidden = true;
    lockDownload(false);
  });

  /* ---------------- export ---------------- */
  MB.el('s-dl').addEventListener('click', function () {
    if (!sigDone) return;
    var S = 32, W = 512, ART = 512, SIG = 128, FOOT = 40, H = ART + SIG + FOOT;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;

    x.fillStyle = CREAM; x.fillRect(0, 0, W, H);
    for (var i = 0; i < 256; i++) {
      if (!cells[i]) continue;
      x.fillStyle = cells[i];
      x.fillRect((i % 16) * S, Math.floor(i / 16) * S, S, S);
    }
    x.fillStyle = INK; x.fillRect(0, ART, W, 4);
    x.drawImage(sig, 0, 0, sig.width, sig.height, 8, ART + 12, W - 16, SIG - 24);
    x.fillStyle = INK; x.fillRect(0, ART + SIG, W, FOOT);
    x.fillStyle = '#EFBF2E';
    x.font = '12px "Press Start 2P", monospace';
    x.textAlign = 'right';
    x.textBaseline = 'middle';
    x.fillText('@MlNiBroker', W - 14, ART + SIG + FOOT / 2);

    var a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = 'mini-broker-pixel-art.png';
    a.click();
  });
})();
