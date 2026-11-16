/* Minimal QR Code generator (byte mode, versions 1–12, EC level M then L).
 * Used for webcast links so a phone can open them from across the room.
 * Standard ISO/IEC 18004 construction; bundled so it works offline.
 *   OW.qr.matrix(text) -> boolean[][] | null
 *   OW.qr.svg(text, {margin}) -> '<svg…>' ('' when the text does not fit) */
(function () {
  'use strict';
  // [ecc codewords per block, number of blocks] indexed by version (1..12)
  const EC = {
    M: [null, [10, 1], [16, 1], [26, 1], [18, 2], [24, 2], [16, 4], [18, 4], [22, 4], [22, 5], [26, 5], [30, 5], [22, 8]],
    L: [null, [7, 1], [10, 1], [15, 1], [20, 1], [26, 1], [18, 2], [20, 2], [24, 2], [30, 2], [18, 4], [20, 4], [24, 4]],
  };
  const FORMAT_BITS = { L: 1, M: 0 };
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58]];

  function rawModules(ver) {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const n = Math.floor(ver / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  const dataCodewords = (ver, lvl) => Math.floor(rawModules(ver) / 8) - EC[lvl][ver][0] * EC[lvl][ver][1];

  // ---- Reed–Solomon over GF(256), polynomial 0x11D ----
  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xff;
  }
  function rsDivisor(degree) {
    const res = new Array(degree).fill(0);
    res[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) {
        res[j] = gfMul(res[j], root);
        if (j + 1 < degree) res[j] ^= res[j + 1];
      }
      root = gfMul(root, 2);
    }
    return res;
  }
  function rsRemainder(data, divisor) {
    const res = new Array(divisor.length).fill(0);
    for (const b of data) {
      const factor = b ^ res.shift();
      res.push(0);
      for (let i = 0; i < divisor.length; i++) res[i] ^= gfMul(divisor[i], factor);
    }
    return res;
  }

  function utf8(text) {
    const s = unescape(encodeURIComponent(text));
    const out = [];
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function encode(text) {
    const bytes = utf8(text);
    let ver = 0, lvl = 'M';
    outer:
    for (const l of ['M', 'L']) {
      for (let v = 1; v <= 12; v++) {
        const need = 4 + (v <= 9 ? 8 : 16) + bytes.length * 8;
        if (need <= dataCodewords(v, l) * 8) { ver = v; lvl = l; break outer; }
      }
    }
    if (!ver) return null;

    // bit stream
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(4, 4);
    push(bytes.length, ver <= 9 ? 8 : 16);
    bytes.forEach((b) => push(b, 8));
    const cap = dataCodewords(ver, lvl) * 8;
    push(0, Math.min(4, cap - bits.length));
    push(0, (8 - (bits.length % 8)) % 8);
    for (let p = 0xec; bits.length < cap; p ^= 0xec ^ 0x11) push(p, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      data.push(b);
    }

    // split into blocks, add error correction, interleave
    const [eccLen, numBlocks] = EC[lvl][ver];
    const rawCw = Math.floor(rawModules(ver) / 8);
    const numShort = numBlocks - (rawCw % numBlocks);
    const shortLen = Math.floor(rawCw / numBlocks);
    const div = rsDivisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const len = shortLen - eccLen + (i < numShort ? 0 : 1);
      const dat = data.slice(k, k + len);
      k += len;
      const ecc = rsRemainder(dat, div);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const all = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((blk, j) => {
        if (i !== shortLen - eccLen || j >= numShort) all.push(blk[i]);
      });
    }

    // matrix
    const size = ver * 4 + 17;
    const m = [], fn = [];
    for (let y = 0; y < size; y++) { m.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    const set = (x, y, dark) => { m[y][x] = !!dark; fn[y][x] = true; };

    function finder(cx, cy) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    }
    function alignment(cx, cy) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    function formatBits(mask) {
      const d = (FORMAT_BITS[lvl] << 3) | mask;
      let rem = d;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((d << 10) | rem) ^ 0x5412;
      const bit = (i) => ((b >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(8, size - 8, true);
    }

    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const ap = ALIGN[ver];
    for (let i = 0; i < ap.length; i++) for (let j = 0; j < ap.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) continue;
      alignment(ap[i], ap[j]);
    }
    formatBits(0);
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const b = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const dark = ((b >>> i) & 1) !== 0, a = size - 11 + (i % 3), c = Math.floor(i / 3);
        set(a, c, dark); set(c, a, dark);
      }
    }

    // data placement (zigzag)
    let k = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!fn[y][x] && k < all.length * 8) {
            m[y][x] = ((all[k >>> 3] >>> (7 - (k & 7))) & 1) !== 0;
            k++;
          }
        }
      }
    }

    // masking: pick the pattern with the lowest penalty
    const MASKS = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ];
    const applyMask = (i) => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[i](x, y)) m[y][x] = !m[y][x];
    };
    function penalty() {
      let p = 0, dark = 0;
      for (let y = 0; y < size; y++) {
        let runX = 1, runY = 1;
        for (let x = 0; x < size; x++) {
          if (m[y][x]) dark++;
          if (x > 0) {
            if (m[y][x] === m[y][x - 1]) { runX++; if (runX === 5) p += 3; else if (runX > 5) p++; } else runX = 1;
            if (m[x][y] === m[x - 1][y]) { runY++; if (runY === 5) p += 3; else if (runY > 5) p++; } else runY = 1;
          }
          if (x < size - 1 && y < size - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
        }
      }
      // finder-like patterns 1:1:3:1:1 with 4 light modules on a side
      const pat = [true, false, true, true, true, false, true];
      const scan = (get) => {
        for (let a = 0; a < size; a++) for (let b = 0; b + 7 <= size; b++) {
          let ok = true;
          for (let i = 0; i < 7 && ok; i++) ok = get(a, b + i) === pat[i];
          if (!ok) continue;
          let before = true, after = true;
          for (let i = 1; i <= 4; i++) { if (b - i >= 0 && get(a, b - i)) before = false; if (b + 6 + i < size && get(a, b + 6 + i)) after = false; }
          if (before || after) p += 40;
        }
      };
      scan((a, b) => m[a][b]); scan((a, b) => m[b][a]);
      p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
      return p;
    }
    let best = 0, bestP = Infinity;
    for (let i = 0; i < 8; i++) {
      applyMask(i); formatBits(i);
      const p = penalty();
      if (p < bestP) { bestP = p; best = i; }
      applyMask(i);
    }
    applyMask(best); formatBits(best);
    return m;
  }

  function svg(text, opts) {
    const m = encode(text);
    if (!m) return '';
    const margin = (opts && opts.margin != null) ? opts.margin : 2;
    const n = m.length + margin * 2;
    let d = '';
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m.length; x++) {
        if (!m[y][x]) continue;
        let run = 1;
        while (x + run < m.length && m[y][x + run]) run++;
        d += 'M' + (x + margin) + ' ' + (y + margin) + 'h' + run + 'v1h-' + run + 'z';
        x += run - 1;
      }
    }
    return '<svg class="qr" viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
      '<rect width="' + n + '" height="' + n + '" fill="#fff"/><path d="' + d + '" fill="#0e0e14"/></svg>';
  }

  window.OW.qr = { matrix: encode, svg };
})();
