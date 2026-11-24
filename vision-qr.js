/* EYES · Vision's QR reader (4.4.3). Offline and dependency-free: nothing leaves the phone.
   Reads any standard QR code (versions 1–40, every error-correction level, numeric / alphanumeric /
   byte / kanji segments, ECI character sets), with Reed–Solomon error correction.
   Pipeline: luminance -> local-threshold binarizing -> finder patterns (1:1:3:1:1) -> alignment
   pattern -> perspective grid -> format/version info -> unmask -> de-interleave -> RS -> segments.
   Structure formulas (raw module count, alignment positions, block layout) match eyes-qr.js, the
   Eye.D. card maker, which only needs level M and so has no tables for the other levels.

   EyesQRScan.scan(imageData | {data, width, height})  -> result | null   (tries dark-on-light, then light-on-dark)
   EyesQRScan.decodeLuma(luma, width, height, inverted) -> result | null
   result = { text, bytes (when the code is one byte segment), version, ecLevel, mask, corners[4] }  */
'use strict';
(function (root) {
  // ---------- GF(256), primitive 0x11D, as QR uses ----------
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  const gdiv = (a, b) => (a ? EXP[(LOG[a] + 255 - LOG[b]) % 255] : 0);

  // Reed–Solomon correction in place. codewords[0] is the highest power. Returns false if uncorrectable.
  function correct(cw, ecLen) {
    const n = cw.length, S = new Array(ecLen);
    let clean = true;
    for (let i = 0; i < ecLen; i++) {
      let s = 0; const a = EXP[i];
      for (let k = 0; k < n; k++) s = gmul(s, a) ^ cw[k];
      S[i] = s; if (s) clean = false;
    }
    if (clean) return true;
    // Berlekamp–Massey: error locator C(x), lowest degree first
    let C = [1], B = [1], L = 0, m = 1, b = 1;
    for (let r = 0; r < ecLen; r++) {
      let d = S[r];
      for (let i = 1; i <= L; i++) d ^= gmul(C[i] || 0, S[r - i]);
      if (d === 0) { m++; continue; }
      const coef = gdiv(d, b), T = C.slice();
      const need = B.length + m;
      while (C.length < need) C.push(0);
      for (let i = 0; i < B.length; i++) C[i + m] ^= gmul(coef, B[i]);
      if (2 * L <= r) { L = r + 1 - L; B = T; b = d; m = 1; } else m++;
    }
    while (C.length > 1 && C[C.length - 1] === 0) C.pop();
    if (L === 0 || L * 2 > ecLen || C.length - 1 !== L) return false;
    const evalLow = (poly, x) => { let y = 0; for (let i = poly.length - 1; i >= 0; i--) y = gmul(y, x) ^ poly[i]; return y; };
    // Omega = S(x) C(x) mod x^ecLen
    const Om = new Array(ecLen).fill(0);
    for (let i = 0; i < ecLen; i++) for (let j = 0; j < C.length && i + j < ecLen; j++) Om[i + j] ^= gmul(S[i], C[j]);
    const dC = []; for (let i = 1; i < C.length; i++) dC.push(i & 1 ? C[i] : 0);   // formal derivative
    let found = 0;
    for (let p = 0; p < n; p++) {
      const xinv = EXP[(255 - p) % 255];               // X^-1, X = alpha^p
      if (evalLow(C, xinv) !== 0) continue;
      const den = evalLow(dC, xinv);
      if (!den) return false;
      const e = gmul(EXP[p], gdiv(evalLow(Om, xinv), den));   // Forney, first root alpha^0
      cw[n - 1 - p] ^= e;
      found++;
    }
    if (found !== L) return false;
    for (let i = 0; i < ecLen; i++) {                  // confirm the syndromes are now zero
      let s = 0; const a = EXP[i];
      for (let k = 0; k < n; k++) s = gmul(s, a) ^ cw[k];
      if (s) return false;
    }
    return true;
  }

  // ---------- version structure (ISO/IEC 18004; tables in L, M, Q, H order) ----------
  const ECC = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  ];
  const BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  ];
  const LEVEL_NAMES = ['L', 'M', 'Q', 'H'];
  const LEVEL_FROM_BITS = [1, 0, 3, 2];   // format bits 00=M 01=L 10=H 11=Q -> index into L,M,Q,H
  const rawModules = (v) => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; };
  function alignPositions(v) { if (v === 1) return []; const n = Math.floor(v / 7) + 2, step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, out = [6]; for (let p = v * 4 + 10; out.length < n; p -= step) out.splice(1, 0, p); return out; }

  // BCH-coded format (15,5) and version (18,6) words, for nearest-codeword lookup
  const bchRem = (value, poly, polyDeg) => { let v = value << polyDeg; const top = 31 - Math.clz32(poly); for (let i = 31 - Math.clz32(v); i >= top; i--) if ((v >>> i) & 1) v ^= poly << (i - top); return v; };
  const FORMATS = []; for (let d = 0; d < 32; d++) FORMATS.push({ bits: ((d << 10) | bchRem(d, 0x537, 10)) ^ 0x5412, d });
  const VERSIONS = []; for (let v = 7; v <= 40; v++) VERSIONS.push({ bits: (v << 12) | bchRem(v, 0x1f25, 12), v });
  const popcount = (x) => { let c = 0; while (x) { x &= x - 1; c++; } return c; };
  function nearest(table, a, b) {
    let best = null, bestD = 4;
    for (const e of table) {
      const d = Math.min(popcount(a ^ e.bits), b == null ? 99 : popcount(b ^ e.bits));
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  // ---------- binarizing: 8×8 blocks, threshold from the 5×5 block neighbourhood ----------
  function binarize(luma, W, H, inverted) {
    const B = 8, bw = Math.ceil(W / B), bh = Math.ceil(H / B), black = new Float32Array(bw * bh);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      let sum = 0, min = 255, max = 0, n = 0;
      const y0 = by * B, x0 = bx * B, y1 = Math.min(H, y0 + B), x1 = Math.min(W, x0 + B);
      for (let y = y0; y < y1; y++) { const row = y * W; for (let x = x0; x < x1; x++) { const l = luma[row + x]; sum += l; if (l < min) min = l; if (l > max) max = l; n++; } }
      let avg = sum / n;
      if (max - min <= 24) {
        avg = min / 2;
        if (by > 0 && bx > 0) {
          const nb = (black[(by - 1) * bw + bx] + 2 * black[by * bw + bx - 1] + black[(by - 1) * bw + bx - 1]) / 4;
          if (min < nb) avg = nb;
        }
      }
      black[by * bw + bx] = avg;
    }
    const out = new Uint8Array(W * H);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const cx = Math.max(2, Math.min(bw - 3, bx)), cy = Math.max(2, Math.min(bh - 3, by));
      let sum = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const yy = cy + dy, xx = cx + dx;
        if (yy >= 0 && yy < bh && xx >= 0 && xx < bw) { sum += black[yy * bw + xx]; n++; }
      }
      const th = sum / n, y0 = by * B, x0 = bx * B, y1 = Math.min(H, y0 + B), x1 = Math.min(W, x0 + B);
      for (let y = y0; y < y1; y++) { const row = y * W; for (let x = x0; x < x1; x++) { const dark = luma[row + x] <= th; out[row + x] = inverted ? (dark ? 0 : 1) : (dark ? 1 : 0); } }
    }
    return out;
  }

  // ---------- finder patterns ----------
  function crossOk(c) {
    const total = c[0] + c[1] + c[2] + c[3] + c[4];
    if (total < 7 || !c[0] || !c[1] || !c[2] || !c[3] || !c[4]) return false;
    const ms = total / 7, v = ms * 0.6;
    return Math.abs(ms - c[0]) < v && Math.abs(ms - c[1]) < v && Math.abs(3 * ms - c[2]) < 3 * v && Math.abs(ms - c[3]) < v && Math.abs(ms - c[4]) < v;
  }
  const centerFromEnd = (c, end) => end - c[4] - c[3] - c[2] / 2;

  function findFinders(img, W, H) {
    const at = (x, y) => img[y * W + x];
    const centers = [];
    function crossLine(x0, y0, dx, dy, maxCount, total) {
      const c = [0, 0, 0, 0, 0];
      let x = x0, y = y0;
      const inside = () => x >= 0 && y >= 0 && x < W && y < H;
      while (inside() && at(x, y)) { c[2]++; x -= dx; y -= dy; }
      if (!inside()) return NaN;
      while (inside() && !at(x, y) && c[1] <= maxCount) { c[1]++; x -= dx; y -= dy; }
      if (!inside() || c[1] > maxCount) return NaN;
      while (inside() && at(x, y) && c[0] <= maxCount) { c[0]++; x -= dx; y -= dy; }
      if (c[0] > maxCount) return NaN;
      x = x0 + dx; y = y0 + dy;
      while (inside() && at(x, y)) { c[2]++; x += dx; y += dy; }
      if (!inside()) return NaN;
      while (inside() && !at(x, y) && c[3] < maxCount) { c[3]++; x += dx; y += dy; }
      if (!inside() || c[3] >= maxCount) return NaN;
      while (inside() && at(x, y) && c[4] < maxCount) { c[4]++; x += dx; y += dy; }
      if (c[4] >= maxCount) return NaN;
      const t = c[0] + c[1] + c[2] + c[3] + c[4];
      if (total && 5 * Math.abs(t - total) >= 2 * total) return NaN;
      if (!crossOk(c)) return NaN;
      return (dx ? x : y) - c[4] - c[3] - c[2] / 2;   // centre along the scanned axis
    }
    function possibleCenter(c, row, end) {
      const total = c[0] + c[1] + c[2] + c[3] + c[4];
      let cx = centerFromEnd(c, end);
      const max = Math.max(c[2] * 2, 3);
      const cy = crossLine(Math.floor(cx), row, 0, 1, max, total);
      if (Number.isNaN(cy)) return false;
      cx = crossLine(Math.floor(cx), Math.floor(cy), 1, 0, max, total);
      if (Number.isNaN(cx)) return false;
      // diagonal sanity check (rejects text and stripes that pass both straight checks)
      if (Number.isNaN(crossLine(Math.floor(cx), Math.floor(cy), 1, 1, max * 1.5, 0))) return false;
      const ms = total / 7;
      for (const p of centers) {
        if (Math.abs(cy - p.y) <= ms && Math.abs(cx - p.x) <= ms && Math.abs(ms - p.ms) <= Math.max(1, p.ms)) {
          const n = p.count + 1;
          p.x = (p.x * p.count + cx) / n; p.y = (p.y * p.count + cy) / n; p.ms = (p.ms * p.count + ms) / n; p.count = n;
          return true;
        }
      }
      centers.push({ x: cx, y: cy, ms, count: 1 });
      return true;
    }
    const skip = H > 700 ? 2 : 1;
    for (let y = 0; y < H; y += skip) {
      const c = [0, 0, 0, 0, 0];
      let s = 0;
      const row = y * W;
      for (let x = 0; x < W; x++) {
        if (img[row + x]) {
          if (s & 1) s++;
          c[s]++;
        } else if (!(s & 1)) {
          if (s === 4) {
            if (crossOk(c) && possibleCenter(c, y, x)) { c[0] = c[1] = c[2] = c[3] = c[4] = 0; s = 0; }
            else { c[0] = c[2]; c[1] = c[3]; c[2] = c[4]; c[3] = 1; c[4] = 0; s = 3; }
          } else c[++s]++;
        } else c[s]++;
      }
      if (s === 4 && crossOk(c)) possibleCenter(c, y, W);
    }
    return centers;
  }

  // the three finder centres that best form a right isosceles corner; several candidates, best first
  function chooseTriples(centers) {
    let list = centers.filter((c) => c.count >= 2);
    if (list.length < 3) list = centers.slice();
    list.sort((a, b) => b.count - a.count);
    list = list.slice(0, 12);
    const out = [];
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) for (let k = j + 1; k < list.length; k++) {
      const P = [list[i], list[j], list[k]];
      const msMax = Math.max(P[0].ms, P[1].ms, P[2].ms), msMin = Math.min(P[0].ms, P[1].ms, P[2].ms);
      if (msMax > msMin * 1.6) continue;
      const ab = d(P[0], P[1]), bc = d(P[1], P[2]), ca = d(P[2], P[0]);
      // top-left is opposite the longest side
      let tl, a, b, long;
      if (bc >= ab && bc >= ca) { tl = P[0]; a = P[1]; b = P[2]; long = bc; }
      else if (ca >= ab && ca >= bc) { tl = P[1]; a = P[0]; b = P[2]; long = ca; }
      else { tl = P[2]; a = P[0]; b = P[1]; long = ab; }
      const s1 = d(tl, a), s2 = d(tl, b), ms = (P[0].ms + P[1].ms + P[2].ms) / 3;
      const modules = (s1 + s2) / 2 / ms;
      if (modules < 10 || modules > 180) continue;
      const iso = Math.abs(s1 - s2) / Math.max(s1, s2);
      const right = Math.abs(long * long - (s1 * s1 + s2 * s2)) / (long * long);
      const score = iso * 2 + right * 3 + (msMax / msMin - 1) - Math.min(tl.count + a.count + b.count, 12) * 0.01;
      if (iso > 0.5 || right > 0.6) continue;
      // orientation: with y pointing down, top-right is clockwise from top-left
      const cross = (a.x - tl.x) * (b.y - tl.y) - (a.y - tl.y) * (b.x - tl.x);
      const tr = cross > 0 ? a : b, bl = cross > 0 ? b : a;
      out.push({ tl, tr, bl, ms, score });
    }
    out.sort((x, y) => x.score - y.score);
    return out.slice(0, 4);
  }

  // ---------- perspective ----------
  function squareToQuad(x0, y0, x1, y1, x2, y2, x3, y3) {
    const dx3 = x0 - x1 + x2 - x3, dy3 = y0 - y1 + y2 - y3;
    if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9)
      return [x1 - x0, x2 - x1, x0, y1 - y0, y2 - y1, y0, 0, 0, 1];
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, den = dx1 * dy2 - dx2 * dy1;
    const a13 = (dx3 * dy2 - dx2 * dy3) / den, a23 = (dx1 * dy3 - dx3 * dy1) / den;
    return [x1 - x0 + a13 * x1, x3 - x0 + a23 * x3, x0, y1 - y0 + a13 * y1, y3 - y0 + a23 * y3, y0, a13, a23, 1];
  }
  // m = [a11, a21, a31, a12, a22, a32, a13, a23, a33] in ZXing's column layout
  const apply = (m, x, y) => { const den = m[6] * x + m[7] * y + m[8]; return [(m[0] * x + m[1] * y + m[2]) / den, (m[3] * x + m[4] * y + m[5]) / den]; };
  function adjoint(m) {
    const [a11, a21, a31, a12, a22, a32, a13, a23, a33] = m;
    return [a22 * a33 - a23 * a32, a23 * a31 - a21 * a33, a21 * a32 - a22 * a31,
      a13 * a32 - a12 * a33, a11 * a33 - a13 * a31, a12 * a31 - a11 * a32,
      a12 * a23 - a13 * a22, a13 * a21 - a11 * a23, a11 * a22 - a12 * a21];
  }
  function times(a, b) {   // a then b, both in the same layout
    const [a11, a21, a31, a12, a22, a32, a13, a23, a33] = a, [b11, b21, b31, b12, b22, b32, b13, b23, b33] = b;
    return [a11 * b11 + a21 * b12 + a31 * b13, a11 * b21 + a21 * b22 + a31 * b23, a11 * b31 + a21 * b32 + a31 * b33,
      a12 * b11 + a22 * b12 + a32 * b13, a12 * b21 + a22 * b22 + a32 * b23, a12 * b31 + a22 * b32 + a32 * b33,
      a13 * b11 + a23 * b12 + a33 * b13, a13 * b21 + a23 * b22 + a33 * b23, a13 * b31 + a23 * b32 + a33 * b33];
  }
  // maps module space (src quad) into image space (dst quad)
  function quadToQuad(src, dst) {
    const toImg = squareToQuad(...dst), toSrc = squareToQuad(...src);
    return times(toImg, adjoint(toSrc));
  }

  // ---------- alignment pattern: template match around the estimate ----------
  function findAlignment(img, W, H, est, ux, uy, vx, vy, radiusModules) {
    const at = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < W && y < H ? img[y * W + x] : -1; };
    const ms = Math.hypot(ux, uy), r = Math.max(4, radiusModules * ms);
    let best = -1, bx = 0, by = 0, n = 0;
    const step = ms > 6 ? 1 : 0.5;
    for (let oy = -r; oy <= r; oy += step) for (let ox = -r; ox <= r; ox += step) {
      const cx = est[0] + ox, cy = est[1] + oy;
      let score = 0;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
        const want = Math.max(Math.abs(i), Math.abs(j)) !== 1 ? 1 : 0;
        const v = at(cx + i * ux + j * vx, cy + i * uy + j * vy);
        if (v === want) score++;
      }
      if (score > best) { best = score; bx = cx; by = cy; n = 1; }
      else if (score === best) { bx += cx; by += cy; n++; }
    }
    if (best < 23) return null;
    return [bx / n, by / n];
  }

  // ---------- grid reading ----------
  const MASKS = [
    (i, j) => (i + j) % 2 === 0, (i) => i % 2 === 0, (i, j) => j % 3 === 0, (i, j) => (i + j) % 3 === 0,
    (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0, (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
    (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0, (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0
  ];
  function functionMap(v) {
    const dim = v * 4 + 17, f = new Uint8Array(dim * dim);
    const region = (x, y, w, h) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) f[yy * dim + xx] = 1; };
    region(0, 0, 9, 9); region(dim - 8, 0, 8, 9); region(0, dim - 8, 9, 8);
    const al = alignPositions(v), last = al.length - 1;
    for (let i = 0; i <= last; i++) for (let j = 0; j <= last; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      region(al[i] - 2, al[j] - 2, 5, 5);
    }
    region(6, 9, 1, dim - 17); region(9, 6, dim - 17, 1);
    if (v > 6) { region(dim - 11, 0, 3, 6); region(0, dim - 11, 6, 3); }
    return f;
  }

  function readGrid(grid, dim, mirrored) {
    const get = (x, y) => (mirrored ? grid[x * dim + y] : grid[y * dim + x]);
    // format information, both copies
    let f1 = 0, f2 = 0;
    const b1 = (x, y) => { f1 = (f1 << 1) | get(x, y); }, b2 = (x, y) => { f2 = (f2 << 1) | get(x, y); };
    for (let i = 0; i < 6; i++) b1(i, 8);
    b1(7, 8); b1(8, 8); b1(8, 7);
    for (let j = 5; j >= 0; j--) b1(8, j);
    for (let j = dim - 1; j >= dim - 7; j--) b2(8, j);
    for (let i = dim - 8; i < dim; i++) b2(i, 8);
    const fmt = nearest(FORMATS, f1, f2);
    if (!fmt) return null;
    const level = LEVEL_FROM_BITS[(fmt.d >> 3) & 3], mask = MASKS[fmt.d & 7];
    let version = (dim - 17) / 4;
    if (version >= 7) {
      let v1 = 0, v2 = 0;
      for (let j = 5; j >= 0; j--) for (let i = dim - 9; i >= dim - 11; i--) v1 = (v1 << 1) | get(i, j);
      for (let i = 5; i >= 0; i--) for (let j = dim - 9; j >= dim - 11; j--) v2 = (v2 << 1) | get(i, j);
      const ver = nearest(VERSIONS, v1, v2);
      if (ver && ver.v * 4 + 17 === dim) version = ver.v;
      else if (ver) return { redo: ver.v };
    }
    const fn = functionMap(version), cw = [];
    let byte = 0, bits = 0, up = true;
    for (let j = dim - 1; j > 0; j -= 2) {
      if (j === 6) j--;
      for (let c = 0; c < dim; c++) {
        const i = up ? dim - 1 - c : c;
        for (let k = 0; k < 2; k++) {
          const x = j - k;
          if (fn[i * dim + x]) continue;
          byte = (byte << 1) | (get(x, i) ^ (mask(i, x) ? 1 : 0));
          if (++bits === 8) { cw.push(byte); byte = 0; bits = 0; }
        }
      }
      up = !up;
    }
    // de-interleave and correct
    const nb = BLOCKS[level][version], ecl = ECC[level][version], raw = Math.floor(rawModules(version) / 8);
    if (cw.length < raw) return null;
    const shortLen = Math.floor(raw / nb), nShort = nb - (raw % nb);
    const blocks = [];
    for (let b = 0; b < nb; b++) blocks.push(new Array(shortLen + (b < nShort ? 0 : 1)));
    let p = 0;
    const shortData = shortLen - ecl;
    for (let i = 0; i < shortData + 1; i++) for (let b = 0; b < nb; b++) {
      if (i === shortData && b < nShort) continue;
      blocks[b][i] = cw[p++];
    }
    for (let i = 0; i < ecl; i++) for (let b = 0; b < nb; b++) {
      const len = blocks[b].length;
      blocks[b][len - ecl + i] = cw[p++];
    }
    const data = [];
    for (const blk of blocks) {
      if (!correct(blk, ecl)) return null;
      for (let i = 0; i < blk.length - ecl; i++) data.push(blk[i]);
    }
    const parsed = parseSegments(data, version);
    if (!parsed) return null;
    return { ...parsed, version, ecLevel: LEVEL_NAMES[level], mask: fmt.d & 7 };
  }

  // ---------- segments ----------
  const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  const ECI_CHARSETS = { 0: 'iso-8859-1', 1: 'iso-8859-1', 2: 'iso-8859-1', 3: 'iso-8859-1', 4: 'iso-8859-2', 5: 'iso-8859-3', 6: 'iso-8859-4', 7: 'iso-8859-5', 8: 'iso-8859-6', 9: 'iso-8859-7', 10: 'iso-8859-8', 11: 'iso-8859-9', 13: 'iso-8859-11', 15: 'iso-8859-13', 16: 'iso-8859-14', 17: 'iso-8859-15', 18: 'iso-8859-16', 20: 'shift_jis', 21: 'windows-1250', 22: 'windows-1251', 23: 'windows-1252', 24: 'windows-1256', 25: 'utf-16be', 26: 'utf-8', 27: 'us-ascii', 28: 'big5', 29: 'gb18030', 30: 'euc-kr' };
  function decodeBytes(bytes, charset) {
    const u8 = Uint8Array.from(bytes);
    const TD = root.TextDecoder;
    if (charset && TD) { try { return new TD(charset).decode(u8); } catch {} }
    if (TD) { try { return new TD('utf-8', { fatal: true }).decode(u8); } catch {} }
    let s = ''; for (const b of u8) s += String.fromCharCode(b); return s;
  }
  function parseSegments(data, version) {
    let pos = 0;
    const total = data.length * 8;
    const read = (n) => { if (pos + n > total) throw 0; let v = 0; for (let i = 0; i < n; i++) { v = (v << 1) | ((data[(pos >> 3)] >> (7 - (pos & 7))) & 1); pos++; } return v; };
    const g = version < 10 ? 0 : version < 27 ? 1 : 2;
    let text = '', charset = null, pend = [], segs = 0, onlyBytes = true;
    const all = [];
    const flush = () => { if (pend.length) { text += decodeBytes(pend, charset); pend = []; } };
    try {
      while (total - pos >= 4) {
        const mode = read(4);
        if (mode === 0) break;
        segs++;
        if (mode === 1) {
          flush(); onlyBytes = false;
          let n = read([10, 12, 14][g]);
          while (n >= 3) { const v = read(10); if (v > 999) return null; text += String(v).padStart(3, '0'); n -= 3; }
          if (n === 2) { const v = read(7); if (v > 99) return null; text += String(v).padStart(2, '0'); }
          else if (n === 1) { const v = read(4); if (v > 9) return null; text += v; }
        } else if (mode === 2) {
          flush(); onlyBytes = false;
          let n = read([9, 11, 13][g]);
          while (n >= 2) { const v = read(11); if (v >= 45 * 45) return null; text += ALNUM[Math.floor(v / 45)] + ALNUM[v % 45]; n -= 2; }
          if (n === 1) { const v = read(6); if (v >= 45) return null; text += ALNUM[v]; }
        } else if (mode === 4) {
          const n = read([8, 16, 16][g]);
          for (let i = 0; i < n; i++) { const b = read(8); pend.push(b); all.push(b); }
        } else if (mode === 8) {
          flush(); onlyBytes = false;
          const n = read([8, 10, 12][g]), sj = [];
          for (let i = 0; i < n; i++) {
            const v = read(13); let c = ((v / 0xc0) << 8) | v % 0xc0;
            c += c < 0x1f00 ? 0x8140 : 0xc140;
            sj.push(c >> 8, c & 0xff);
          }
          text += decodeBytes(sj, 'shift_jis');
        } else if (mode === 7) {
          flush();
          let v = read(8);
          if ((v & 0x80) === 0) v &= 0x7f;
          else if ((v & 0xc0) === 0x80) v = ((v & 0x3f) << 8) | read(8);
          else if ((v & 0xe0) === 0xc0) v = ((v & 0x1f) << 16) | read(16);
          else return null;
          charset = ECI_CHARSETS[v] || null;
        } else if (mode === 3) { read(16); }                 // structured append header: read past it
        else if (mode === 5 || mode === 9) { if (mode === 9) read(8); }   // FNC1 flags carry no text
        else if (mode === 13) {                              // GB2312 (Hanzi)
          flush(); onlyBytes = false;
          read(4); const n = read([8, 10, 12][g]), gb = [];
          for (let i = 0; i < n; i++) { const v = read(13); let c = ((v / 0x60) << 8) | v % 0x60; c += c < 0x0a00 ? 0xa1a1 : 0xa6a1; gb.push(c >> 8, c & 0xff); }
          text += decodeBytes(gb, 'gb18030');
        } else return null;
      }
    } catch { if (!segs) return null; }
    flush();
    if (!segs) return null;
    return { text, bytes: onlyBytes ? Uint8Array.from(all) : null };
  }

  // ---------- one attempt from a chosen finder triple ----------
  function attempt(img, W, H, t, dimOverride) {
    const { tl, tr, bl, ms } = t;
    const est = (Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(bl.x - tl.x, bl.y - tl.y)) / 2 / ms + 7;
    let dims = [];
    if (dimOverride) dims = [dimOverride];
    else {
      let d = Math.round(est);
      switch (d & 3) { case 0: d++; break; case 2: d--; break; case 3: d += 2; break; }
      dims = [d, d - 4, d + 4].filter((x) => x >= 21 && x <= 177);
    }
    for (const dim of dims) {
      const res = sampleAndRead(img, W, H, tl, tr, bl, dim);
      if (res && res.redo) { const again = sampleAndRead(img, W, H, tl, tr, bl, res.redo * 4 + 17); if (again && !again.redo) return again; continue; }
      if (res) return res;
    }
    return null;
  }
  function sampleAndRead(img, W, H, tl, tr, bl, dim) {
    const span = dim - 7;
    // module axes from the finder centres
    const ux = (tr.x - tl.x) / span, uy = (tr.y - tl.y) / span, vx = (bl.x - tl.x) / span, vy = (bl.y - tl.y) / span;
    let br = [tr.x - tl.x + bl.x, tr.y - tl.y + bl.y], brMod = dim - 3.5;
    if (dim > 21) {
      const k = 1 - 3 / span;
      const est = [tl.x + k * (br[0] - tl.x), tl.y + k * (br[1] - tl.y)];
      let found = null;
      for (const r of [4, 8, 14]) { found = findAlignment(img, W, H, est, ux, uy, vx, vy, r); if (found) break; }
      if (found) { br = found; brMod = dim - 6.5; }
    }
    const m = quadToQuad([3.5, 3.5, dim - 3.5, 3.5, brMod, brMod, 3.5, dim - 3.5], [tl.x, tl.y, tr.x, tr.y, br[0], br[1], bl.x, bl.y]);
    const grid = new Uint8Array(dim * dim);
    for (let y = 0; y < dim; y++) for (let x = 0; x < dim; x++) {
      const [px, py] = apply(m, x + 0.5, y + 0.5);
      const ix = Math.round(px - 0.5), iy = Math.round(py - 0.5);
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) return null;
      grid[y * dim + x] = img[iy * W + ix];
    }
    let res = readGrid(grid, dim, false);
    if (!res || res.redo) { const mres = readGrid(grid, dim, true); if (mres && !mres.redo) { mres.mirrored = true; res = mres; } }
    if (res && !res.redo) res.corners = [[0, 0], [dim, 0], [dim, dim], [0, dim]].map(([x, y]) => { const [a, b] = apply(m, x, y); return { x: a, y: b }; });
    return res;
  }

  function decodeLuma(luma, W, H, inverted) {
    const img = binarize(luma, W, H, !!inverted);
    const centers = findFinders(img, W, H);
    if (centers.length < 3) return null;
    for (const t of chooseTriples(centers)) {
      const r = attempt(img, W, H, t);
      if (r) return r;
    }
    return null;
  }
  function toLuma(data, W, H) {
    const out = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
    return out;
  }
  function scan(image) {
    const W = image.width, H = image.height, luma = toLuma(image.data, W, H);
    return decodeLuma(luma, W, H, false) || decodeLuma(luma, W, H, true);
  }
  root.EyesQRScan = { scan, decodeLuma, toLuma, _rs: correct };
})(typeof window === 'undefined' ? globalThis : window);
