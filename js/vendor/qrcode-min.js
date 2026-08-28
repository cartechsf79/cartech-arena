// ============================================================================
// Car'Tech Arena — mini générateur de QR code, 100% local (aucun appel
// réseau, aucune dépendance externe) : cohérent avec le reste de l'appli qui
// ne charge que le SDK Firebase depuis l'extérieur.
//
// Limites volontaires (documentées ici pour la maintenance future) :
//  - Mode "byte" uniquement (texte/URL ASCII ou UTF-8, pas de mode
//    numérique/alphanumérique optimisé — inutile pour nos besoins : on
//    n'encode que des liens).
//  - Niveau de correction d'erreur "L" uniquement (le plus léger, donc la
//    plus grande capacité de texte pour une taille de symbole donnée).
//  - Versions 1 à 5 seulement (jusqu'à ~106 caractères) : au-delà, il
//    faudrait gérer le découpage en plusieurs blocs Reed-Solomon (versions
//    6+), qu'on évite ici pour rester simple — encode() lève une erreur
//    explicite si le texte est trop long plutôt que produire un code
//    invalide.
//  - Masque fixe (motif 0, "(ligne+colonne) pair") plutôt que le choix du
//    "meilleur" masque parmi les 8 possibles (ce choix n'améliore que la
//    marge de fiabilité du scan, pas la validité du code — un masque fixe
//    reste 100% conforme à la norme et lisible par n'importe quel lecteur).
//
// Vérifié par décodage réel (OpenCV QRCodeDetector) sur plusieurs cas,
// courts et proches de la limite de capacité, avant intégration.
// ============================================================================
(function (global) {
  "use strict";

  // ---- GF(256) log/exp tables (primitive polynomial 0x11d) ----
  var EXP = new Array(256);
  var LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    EXP[255] = EXP[0];
  })();
  function gexp(n) {
    while (n < 0) n += 255;
    while (n >= 255) n -= 255;
    return EXP[n];
  }
  function glog(n) {
    return LOG[n];
  }

  // ---- Polynomial over GF(256) ----
  function Poly(num, shift) {
    var offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    this.num = new Array(num.length - offset + shift);
    for (var i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
    for (var j = 0; j < shift; j++) this.num[num.length - offset + j] = 0;
  }
  Poly.prototype.get = function (i) {
    return this.num[i];
  };
  Poly.prototype.len = function () {
    return this.num.length;
  };
  Poly.prototype.multiply = function (e) {
    var num = new Array(this.len() + e.len() - 1);
    for (var i = 0; i < num.length; i++) num[i] = 0;
    for (var i2 = 0; i2 < this.len(); i2++) {
      for (var j = 0; j < e.len(); j++) {
        num[i2 + j] ^= gexp(glog(this.get(i2)) + glog(e.get(j)));
      }
    }
    return new Poly(num, 0);
  };
  Poly.prototype.mod = function (e) {
    if (this.len() - e.len() < 0) return this;
    var ratio = glog(this.get(0)) - glog(e.get(0));
    var num = this.num.slice();
    for (var i = 0; i < e.len(); i++) {
      num[i] ^= gexp(glog(e.get(i)) + ratio);
    }
    return new Poly(num, 0).mod(e);
  };

  function errorCorrectPoly(ecCount) {
    var a = new Poly([1], 0);
    for (var i = 0; i < ecCount; i++) {
      a = a.multiply(new Poly([1, gexp(i)], 0));
    }
    return a;
  }

  function computeECCodewords(dataCodewords, ecCount) {
    var rsPoly = errorCorrectPoly(ecCount);
    var rawPoly = new Poly(dataCodewords, ecCount);
    var modPoly = rawPoly.mod(rsPoly);
    var ec = new Array(ecCount);
    var modLen = modPoly.len();
    for (var i = 0; i < ecCount; i++) {
      var idx = i + modLen - ecCount;
      ec[i] = idx >= 0 ? modPoly.get(idx) : 0;
    }
    return ec;
  }

  // ---- Version table (EC level L only, single RS block, versions 1-5) ----
  var VERSIONS = [
    { v: 1, total: 26, data: 19 },
    { v: 2, total: 44, data: 34 },
    { v: 3, total: 70, data: 55 },
    { v: 4, total: 100, data: 80 },
    { v: 5, total: 134, data: 108 },
  ];
  var ALIGN_POS = { 2: 18, 3: 22, 4: 26, 5: 30 };

  function pickVersion(byteLen) {
    var neededBits = 4 + 8 + 8 * byteLen; // mode + count + data
    for (var i = 0; i < VERSIONS.length; i++) {
      if (VERSIONS[i].data * 8 >= neededBits) return VERSIONS[i];
    }
    return null; // too long
  }

  function toUtf8Bytes(str) {
    if (typeof TextEncoder !== "undefined") return Array.from(new TextEncoder().encode(str));
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code < 0x80) bytes.push(code);
      else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }
    return bytes;
  }

  function buildDataCodewords(bytes, dataCount) {
    var bits = [];
    function push(value, len) {
      for (var i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    }
    push(0x4, 4); // byte mode
    push(bytes.length, 8); // char count (versions 1-9)
    for (var i = 0; i < bytes.length; i++) push(bytes[i], 8);
    var maxBits = dataCount * 8;
    for (var t = 0; t < 4 && bits.length < maxBits; t++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);
    var codewords = [];
    for (var b = 0; b < bits.length; b += 8) {
      var byte = 0;
      for (var j = 0; j < 8; j++) byte = (byte << 1) | bits[b + j];
      codewords.push(byte);
    }
    var pad = [0xec, 0x11];
    var p = 0;
    while (codewords.length < dataCount) {
      codewords.push(pad[p % 2]);
      p++;
    }
    return codewords;
  }

  // ---- BCH(15,5) format info ----
  var G15 = 0x537;
  var G15_MASK = 0x5412;
  function bitLength(n) {
    var d = 0;
    while (n !== 0) {
      d++;
      n >>>= 1;
    }
    return d;
  }
  function formatBits(ecLevelBits, maskPattern) {
    var data = (ecLevelBits << 3) | maskPattern;
    var d = data << 10;
    while (bitLength(d) - bitLength(G15) >= 0) {
      d ^= G15 << (bitLength(d) - bitLength(G15));
    }
    return ((data << 10) | d) ^ G15_MASK;
  }

  function buildMatrix(version, dataCodewords, ecCodewords) {
    var size = 17 + 4 * version;
    var modules = [];
    var reserved = [];
    for (var r = 0; r < size; r++) {
      modules.push(new Array(size).fill(false));
      reserved.push(new Array(size).fill(false));
    }

    function set(r, c, val, isRes) {
      if (r < 0 || r >= size || c < 0 || c >= size) return;
      modules[r][c] = val;
      if (isRes) reserved[r][c] = true;
    }

    function placeFinder(r0, c0) {
      for (var r = -1; r <= 7; r++) {
        for (var c = -1; c <= 7; c++) {
          var rr = r0 + r,
            cc = c0 + c;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
          var dark = false;
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            if (r === 0 || r === 6 || c === 0 || c === 6) dark = true;
            else if (r >= 2 && r <= 4 && c >= 2 && c <= 4) dark = true;
          }
          set(rr, cc, dark, true);
        }
      }
    }
    placeFinder(0, 0);
    placeFinder(0, size - 7);
    placeFinder(size - 7, 0);

    for (var i = 8; i < size - 8; i++) {
      if (!reserved[6][i]) set(6, i, i % 2 === 0, true);
      if (!reserved[i][6]) set(i, 6, i % 2 === 0, true);
    }

    var apos = ALIGN_POS[version];
    if (apos) {
      for (var ar = -2; ar <= 2; ar++) {
        for (var ac = -2; ac <= 2; ac++) {
          var dark2 = Math.max(Math.abs(ar), Math.abs(ac)) !== 1;
          set(apos + ar, apos + ac, dark2, true);
        }
      }
    }

    // reserve format-info cells (both copies) + dark module
    for (var fi = 0; fi <= 5; fi++) set(fi, 8, false, true);
    set(7, 8, false, true);
    set(8, 8, false, true);
    set(8, 7, false, true);
    for (var fj = 9; fj <= 14; fj++) set(8, 14 - fj, false, true);
    for (var fk = 0; fk <= 6; fk++) set(size - 1 - fk, 8, false, true);
    for (var fl = 7; fl <= 14; fl++) set(8, size - 15 + fl, false, true);
    set(size - 8, 8, true, true); // dark module

    // ---- data placement (zigzag, mask pattern 0) ----
    var allCw = dataCodewords.concat(ecCodewords);
    var bits = [];
    for (var cwi = 0; cwi < allCw.length; cwi++) {
      for (var bi = 7; bi >= 0; bi--) bits.push((allCw[cwi] >>> bi) & 1);
    }
    var bitIndex = 0;
    var dir = -1;
    var col = size - 1;
    while (col > 0) {
      if (col === 6) col--;
      for (var count = 0; count < size; count++) {
        var row = dir < 0 ? size - 1 - count : count;
        for (var cOff = 0; cOff < 2; cOff++) {
          var cc2 = col - cOff;
          if (reserved[row][cc2]) continue;
          var bit = bitIndex < bits.length ? bits[bitIndex] : 0;
          bitIndex++;
          var maskOn = (row + cc2) % 2 === 0; // mask pattern 0
          if (maskOn) bit ^= 1;
          modules[row][cc2] = !!bit;
        }
      }
      dir = -dir;
      col -= 2;
    }

    // ---- write format info (EC level L = 0b01, mask pattern 0) ----
    var fbits = formatBits(0x1, 0);
    for (var k = 0; k <= 5; k++) modules[k][8] = ((fbits >> k) & 1) === 1;
    modules[7][8] = ((fbits >> 6) & 1) === 1;
    modules[8][8] = ((fbits >> 7) & 1) === 1;
    modules[8][7] = ((fbits >> 8) & 1) === 1;
    for (var k2 = 9; k2 <= 14; k2++) modules[8][14 - k2] = ((fbits >> k2) & 1) === 1;
    for (var k3 = 0; k3 <= 6; k3++) modules[size - 1 - k3][8] = ((fbits >> k3) & 1) === 1;
    for (var k4 = 7; k4 <= 14; k4++) modules[8][size - 15 + k4] = ((fbits >> k4) & 1) === 1;
    modules[size - 8][8] = true;

    return { size: size, modules: modules };
  }

  function encode(text) {
    var bytes = toUtf8Bytes(text);
    var ver = pickVersion(bytes.length);
    if (!ver) throw new Error("Texte trop long pour ce générateur de QR code (max ~106 caractères).");
    var dataCodewords = buildDataCodewords(bytes, ver.data);
    var ecCount = ver.total - ver.data;
    var ecCodewords = computeECCodewords(dataCodewords, ecCount);
    return buildMatrix(ver.v, dataCodewords, ecCodewords);
  }

  global.MiniQR = { encode: encode };
})(typeof window !== "undefined" ? window : globalThis);
