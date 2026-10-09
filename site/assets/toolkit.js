/* Shared engine for the text, data and developer tools. Everything runs in the browser. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var TOOL = document.body.getAttribute('data-tool');
  if (!TOOL) return;

  var input = $('toolInput');
  var output = $('toolOutput');
  var statusEl = $('toolStatus');
  var errorEl = $('toolError');

  function setStatus(msg) {
    if (!statusEl) return;
    if (msg) { statusEl.textContent = msg; statusEl.hidden = false; }
    else { statusEl.hidden = true; }
  }
  function showError(msg) {
    if (!errorEl) { setStatus(msg); return; }
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }
  function hideError() { if (errorEl) errorEl.hidden = true; }
  function val(id, fallback) {
    var el = $(id);
    return el ? el.value : fallback;
  }
  function checked(id) {
    var el = $(id);
    return !!(el && el.checked);
  }
  function out(text) { if (output) output.value = text; }
  function src() { return input ? input.value : ''; }

  function bytesToHex(buf) {
    var b = new Uint8Array(buf);
    var s = '';
    for (var i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
    return s;
  }

  function randomInts(count) {
    var arr = new Uint32Array(count);
    crypto.getRandomValues(arr);
    return arr;
  }

  function textToBytes(str) { return new TextEncoder().encode(str); }

  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function copyText(text) {
    if (!text) { setStatus('Nothing to copy yet.'); return; }
    var done = function () { setStatus('Copied to the clipboard.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { setStatus('Copy failed - select the text manually.'); }
    document.body.removeChild(ta);
  }

  /* ---------- JSON ---------- */
  function jsonErrorPosition(message) {
    var m = message.match(/position (\d+)/i);
    if (!m) return null;
    return parseInt(m[1], 10);
  }
  function runJson(minify) {
    hideError();
    var text = src().trim();
    if (!text) { out(''); setStatus('Paste some JSON to get started.'); return; }
    try {
      var data = JSON.parse(text);
      var indentOpt = val('jsonIndent', '2');
      var indent = indentOpt === 'tab' ? '\t' : parseInt(indentOpt, 10);
      out(minify ? JSON.stringify(data) : JSON.stringify(data, null, indent));
      var keys = data && typeof data === 'object' ? Object.keys(data).length : 0;
      setStatus('Valid JSON' + (Array.isArray(data) ? ' - array with ' + data.length + ' items.' : (typeof data === 'object' && data ? ' - object with ' + keys + ' top-level keys.' : ' - ' + typeof data + '.')));
    } catch (err) {
      var pos = jsonErrorPosition(err.message);
      var detail = '';
      if (pos !== null) {
        var before = text.slice(0, pos);
        var line = before.split('\n').length;
        var col = pos - before.lastIndexOf('\n');
        detail = ' (line ' + line + ', column ' + col + ')';
      }
      showError('Invalid JSON' + detail + ': ' + err.message.replace(/^JSON\.parse: /, ''));
      out('');
    }
  }

  /* ---------- Base64 ---------- */
  function encodeBase64(text, urlSafe) {
    var bytes = textToBytes(text);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    var b64 = btoa(bin);
    if (urlSafe) b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return b64;
  }
  function decodeBase64(text, urlSafe) {
    var s = text.replace(/\s+/g, '');
    if (urlSafe || /[-_]/.test(s)) {
      s = s.replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
    }
    var bin = atob(s);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }

  /* ---------- URL ---------- */
  function runUrl(mode) {
    hideError();
    var text = src();
    if (!text) { out(''); return; }
    try {
      var whole = checked('urlWhole');
      if (mode === 'decode') out(decodeURIComponent(text));
      else out(whole ? encodeURI(text) : encodeURIComponent(text));
      setStatus(mode === 'decode' ? 'Decoded.' : 'Encoded.');
    } catch (e) {
      showError('That text is not valid for this direction. Check for a stray % sign.');
      out('');
    }
  }

  /* ---------- Hash ---------- */
  function runHash() {
    hideError();
    var text = src();
    if (!text) { out(''); return; }
    var algos = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
    setStatus('Hashing...');
    Promise.all(algos.map(function (a) {
      return crypto.subtle.digest(a, textToBytes(text)).then(function (buf) { return a + ': ' + bytesToHex(buf); });
    })).then(function (lines) {
      out(lines.join('\n'));
      setStatus(text.length + ' characters hashed with ' + algos.length + ' algorithms.');
    }).catch(function () {
      showError('This browser does not support the Web Crypto API on this page.');
    });
  }

  /* ---------- UUID ---------- */
  function runUuid() {
    var count = Math.min(100, Math.max(1, parseInt(val('uuidCount', '5'), 10) || 5));
    var lines = [];
    for (var i = 0; i < count; i++) {
      var id = (crypto.randomUUID ? crypto.randomUUID() : manualUuid());
      if (checked('uuidUpper')) id = id.toUpperCase();
      if (checked('uuidBraces')) id = '{' + id + '}';
      if (checked('uuidPlain')) id = id.replace(/-/g, '');
      lines.push(id);
    }
    out(lines.join('\n'));
    setStatus(count + ' version 4 UUID' + (count === 1 ? '' : 's') + ' generated.');
  }
  function manualUuid() {
    var r = randomInts(4);
    var hex = '';
    for (var i = 0; i < 4; i++) hex += r[i].toString(16).padStart(8, '0');
    return (hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-4' + hex.slice(13, 16) + '-a' + hex.slice(17, 20) + '-' + hex.slice(20, 32));
  }

  /* ---------- Password ---------- */
  function runPassword() {
    var len = Math.min(64, Math.max(6, parseInt(val('pwLength', '16'), 10) || 16));
    var sets = [];
    if (checked('pwLower')) sets.push('abcdefghijklmnopqrstuvwxyz');
    if (checked('pwUpper')) sets.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    if (checked('pwDigits')) sets.push('0123456789');
    if (checked('pwSymbols')) sets.push('!@#$%^&*()-_=+[]{};:,.?/');
    if (!sets.length) { out(''); showError('Select at least one character set.'); return; }
    hideError();
    var alphabet = sets.join('');
    if (checked('pwNoAmbiguous')) alphabet = alphabet.replace(/[Il1O0o]/g, '');
    if (!alphabet.length) { showError('That combination leaves no characters to use.'); return; }
    var count = Math.min(20, Math.max(1, parseInt(val('pwCount', '5'), 10) || 5));
    var noAmbiguous = checked('pwNoAmbiguous');
    var usable = sets.map(function (s) { return noAmbiguous ? s.replace(/[Il1O0o]/g, '') : s; })
                      .filter(function (s) { return s.length; });
    var lines = [];
    for (var n = 0; n < count; n++) {
      var rand = randomInts(len * 4);
      var ri = 0;
      var nextRand = function () { if (ri >= rand.length) { rand = randomInts(len * 4); ri = 0; } return rand[ri++]; };
      var chars = [];
      var s;
      for (s = 0; s < usable.length && chars.length < len; s++) chars.push(usable[s][nextRand() % usable[s].length]);
      while (chars.length < len) chars.push(alphabet[nextRand() % alphabet.length]);
      for (var k = chars.length - 1; k > 0; k--) {
        var j = nextRand() % (k + 1);
        var tmp = chars[k]; chars[k] = chars[j]; chars[j] = tmp;
      }
      lines.push(chars.join(''));
    }
    out(lines.join('\n'));
    var bits = Math.round(len * Math.log2(alphabet.length));
    setStatus(count + ' password' + (count === 1 ? '' : 's') + ' - about ' + bits + ' bits of entropy each, and every one includes at least one character from each set you ticked.');
  }

  /* ---------- Timestamp ---------- */
  function runTimestamp() {
    hideError();
    var raw = src().trim();
    var date = null;
    if (!raw) { setStatus('Paste a timestamp or a date, or press Now.'); return; }
    if (/^\d+$/.test(raw)) {
      var n = parseInt(raw, 10);
      date = new Date(raw.length > 10 ? n : n * 1000);
    } else {
      var parsed = new Date(raw);
      if (!isNaN(parsed.getTime())) date = parsed;
    }
    if (!date || isNaN(date.getTime())) { showError('That does not look like a Unix timestamp or a date.'); out(''); return; }
    var secs = Math.floor(date.getTime() / 1000);
    var diff = Date.now() - date.getTime();
    var ago = Math.round(Math.abs(diff) / 1000);
    var unit = ago < 60 ? ago + ' seconds' : (ago < 3600 ? Math.round(ago / 60) + ' minutes' : (ago < 86400 ? Math.round(ago / 3600) + ' hours' : Math.round(ago / 86400) + ' days'));
    out([
      'Unix seconds: ' + secs,
      'Unix milliseconds: ' + date.getTime(),
      'ISO 8601 (UTC): ' + date.toISOString(),
      'UTC: ' + date.toUTCString(),
      'Local: ' + date.toString(),
      'Relative: ' + unit + (diff >= 0 ? ' ago' : ' from now')
    ].join('\n'));
    setStatus('Converted.');
  }

  /* ---------- Case ---------- */
  var SMALL = ['a','an','and','as','at','but','by','for','from','in','into','nor','of','on','onto','or','over','so','the','to','up','with','yet'];
  function words(str) {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-]+/g, ' ').split(/\s+/).filter(Boolean);
  }
  function applyCase(mode, text) {
    switch (mode) {
      case 'upper': return text.toUpperCase();
      case 'lower': return text.toLowerCase();
      case 'title': return text.toLowerCase().replace(/\b([a-z])([a-z'']*)/g, function (m, a, rest) { return a.toUpperCase() + rest; });
      case 'sentence': return text.toLowerCase().replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, function (m) { return m.toUpperCase(); });
      case 'camel': return words(text).map(function (w, i) { var s = w.toLowerCase(); return i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1); }).join('');
      case 'pascal': return words(text).map(function (w) { var s = w.toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }).join('');
      case 'snake': return words(text).map(function (w) { return w.toLowerCase(); }).join('_');
      case 'kebab': return words(text).map(function (w) { return w.toLowerCase(); }).join('-');
      case 'constant': return words(text).map(function (w) { return w.toUpperCase(); }).join('_');
      case 'slug': return words(text).map(function (w) { return w.toLowerCase(); }).join('-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
      default: return text;
    }
  }
  function runCase(mode) {
    var text = src();
    if (!text) { out(''); return; }
    out(applyCase(mode || val('caseMode', 'title'), text));
    setStatus('Converted.');
  }

  /* ---------- Word count ---------- */
  function runCount() {
    var text = src();
    var host = $('toolStats');
    if (!host) return;
    var trimmed = text.trim();
    var wordList = trimmed ? trimmed.split(/\s+/) : [];
    var sentences = trimmed ? (trimmed.match(/[^.!?]+[.!?]*/g) || []).filter(function (s) { return s.trim().length; }).length : 0;
    var paragraphs = trimmed ? trimmed.split(/\n\s*\n/).filter(function (p) { return p.trim().length; }).length : 0;
    var lines = text ? text.split('\n').length : 0;
    var freq = {};
    var longest = '';
    wordList.forEach(function (w) {
      var k = w.toLowerCase().replace(/[^a-z0-9'-]/g, '');
      if (k.length > 2) freq[k] = (freq[k] || 0) + 1;
      if (w.length > longest.length) longest = w;
    });
    var top = Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; }).slice(0, 5);
    var stats = [
      ['Words', wordList.length],
      ['Characters', text.length],
      ['Characters without spaces', text.replace(/\s/g, '').length],
      ['Sentences', sentences],
      ['Paragraphs', paragraphs],
      ['Lines', lines],
      ['Reading time', wordList.length ? Math.max(1, Math.round(wordList.length / 200)) + ' min' : '0 min'],
      ['Speaking time', wordList.length ? Math.max(1, Math.round(wordList.length / 130)) + ' min' : '0 min']
    ];
    host.innerHTML = stats.map(function (s) {
      return '<div class="stat"><span class="stat-label">' + s[0] + '</span><span class="stat-value">' + s[1] + '</span></div>';
    }).join('') + (top.length ? '<div class="stat stat-wide"><span class="stat-label">Most frequent words</span><span class="stat-value">' + top.map(function (w) { return w + ' (' + freq[w] + ')'; }).join(', ') + '</span></div>' : '');
    if (longest) setStatus('Longest word: ' + longest);
  }

  /* ---------- Colour ---------- */
  function hexToRgb(hex) {
    var h = hex.replace('#', '').trim();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
    function hue(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    if (s === 0) { var v = Math.round(l * 255); return { r: v, g: v, b: v }; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    return { r: Math.round(hue(p, q, h + 1 / 3) * 255), g: Math.round(hue(p, q, h) * 255), b: Math.round(hue(p, q, h - 1 / 3) * 255) };
  }
  function toHex(c) {
    return '#' + [c.r, c.g, c.b].map(function (v) { return Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'); }).join('');
  }
  function runColor(hexOverride) {
    hideError();
    var raw = (hexOverride || src()).trim();
    if (!raw) { return; }
    var rgb = null;
    if (raw.charAt(0) === '#' || /^[0-9a-f]{3,6}$/i.test(raw)) {
      rgb = hexToRgb(raw.charAt(0) === '#' ? raw : '#' + raw);
    } else {
      var nums = raw.match(/\d+(\.\d+)?/g);
      if (nums && nums.length >= 3) {
        if (/hsl/i.test(raw)) {
          rgb = hslToRgb(parseFloat(nums[0]), parseFloat(nums[1]), parseFloat(nums[2]));
        } else if (/^rgb/i.test(raw) || nums.length === 3) {
          rgb = { r: parseInt(nums[0], 10), g: parseInt(nums[1], 10), b: parseInt(nums[2], 10) };
        }
      }
    }
    if (!rgb) { showError('Enter a color as #2563eb, rgb(37, 99, 235) or hsl(221, 83%, 53%).'); return; }
    var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    var hex = toHex(rgb);
    var picker = $('colorPicker');
    if (picker && picker.value.toLowerCase() !== hex) picker.value = hex;
    var swatch = $('colorSwatch');
    if (swatch) swatch.style.background = hex;
    var grid = $('toolStats');
    if (grid) {
      var shades = [95, 85, 70, 50, 30, 15].map(function (l) {
        var s = hslToRgb(hsl.h, hsl.s, l);
        return { hex: toHex(s), l: l };
      });
      var comp = hslToRgb((hsl.h + 180) % 360, hsl.s, hsl.l);
      grid.innerHTML =
        '<div class="stat"><span class="stat-label">HEX</span><span class="stat-value mono">' + hex + '</span></div>' +
        '<div class="stat"><span class="stat-label">RGB</span><span class="stat-value mono">rgb(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ')</span></div>' +
        '<div class="stat"><span class="stat-label">HSL</span><span class="stat-value mono">hsl(' + hsl.h + ', ' + hsl.s + '%, ' + hsl.l + '%)</span></div>' +
        '<div class="stat"><span class="stat-label">Complementary</span><span class="stat-value mono">' + toHex(comp) + '</span></div>' +
        '<div class="stat stat-wide"><span class="stat-label">Shades and tints</span><span class="swatch-row">' +
          shades.map(function (s) { return '<span class="swatch" title="' + s.hex + '"><i style="background:' + s.hex + '"></i>' + s.hex + '</span>'; }).join('') +
        '</span></div>';
    }
    out('HEX: ' + hex + '\nRGB: rgb(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ')\nHSL: hsl(' + hsl.h + ', ' + hsl.s + '%, ' + hsl.l + '%)');
    setStatus('Converted.');
  }

  /* ---------- Lorem ipsum ---------- */
  var LOREM_WORDS = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum').split(' ');
  var LOREM_OPENER = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
  function runLorem() {
    var unit = val('loremUnit', 'paragraphs');
    var count = Math.min(50, Math.max(1, parseInt(val('loremCount', '3'), 10) || 3));
    var pool = randomInts(256);
    var pi = 0;
    function next() { if (pi >= pool.length) { pool = randomInts(256); pi = 0; } return pool[pi++]; }
    function word() { return LOREM_WORDS[next() % LOREM_WORDS.length]; }
    function sentence() {
      var n = 8 + (next() % 12);
      var parts = [];
      for (var i = 0; i < n; i++) parts.push(word());
      var s = parts.join(' ');
      if (parts[0] === 'lorem') s = 'lorem ipsum' + s.slice(5);
      return s.charAt(0).toUpperCase() + s.slice(1) + '.';
    }
    function paragraph() {
      var n = 3 + (next() % 3);
      var parts = [];
      for (var i = 0; i < n; i++) parts.push(sentence());
      return parts.join(' ');
    }
    var chunks = [];
    var i;
    if (unit === 'words') {
      var picked = [];
      for (i = 0; i < count; i++) picked.push(word());
      chunks = [picked.join(' ')];
    } else if (unit === 'sentences') {
      for (i = 0; i < count; i++) chunks.push(sentence());
    } else {
      for (i = 0; i < count; i++) chunks.push(paragraph());
    }
    if (checked('loremClassic') && unit !== 'words') {
      if (unit === 'paragraphs') chunks[0] = LOREM_OPENER + ' ' + chunks[0].replace(/^[^.]*\.\s*/, '');
      else chunks.unshift(LOREM_OPENER);
    }
    var asHtml = checked('loremHtml') && unit === 'paragraphs';
    var text = asHtml
      ? chunks.map(function (p) { return '<p>' + p + '</p>'; }).join('\n')
      : chunks.join(unit === 'paragraphs' ? '\n\n' : ' ');
    out(text);
    var wordCount = text.replace(/<\/?p>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
    setStatus('Generated about ' + wordCount + ' words of placeholder text.');
  }

  /* ---------- Text lines ---------- */
  function runLines(act) {
    hideError();
    var text = src();
    if (!text) { out(''); setStatus('Paste some lines to get started.'); return; }
    var rows = text.split('\n');
    var label = '';
    var byText = function (a, b) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }); };
    if (act === 'sort-asc') { rows = rows.slice().sort(byText); label = 'Sorted A to Z'; }
    else if (act === 'sort-desc') { rows = rows.slice().sort(byText).reverse(); label = 'Sorted Z to A'; }
    else if (act === 'reverse') { rows = rows.slice().reverse(); label = 'Order reversed'; }
    else if (act === 'dedupe') {
      var seen = Object.create(null); var kept = [];
      rows.forEach(function (l) { if (!seen[l]) { seen[l] = 1; kept.push(l); } });
      label = 'Removed ' + (rows.length - kept.length) + ' duplicate line' + (rows.length - kept.length === 1 ? '' : 's');
      rows = kept;
    }
    else if (act === 'trim') { rows = rows.map(function (l) { return l.trim(); }); label = 'Whitespace trimmed'; }
    else if (act === 'remove-empty') {
      var before = rows.length;
      rows = rows.filter(function (l) { return l.trim().length; });
      label = 'Removed ' + (before - rows.length) + ' empty line' + (before - rows.length === 1 ? '' : 's');
    }
    else if (act === 'number') { rows = rows.map(function (l, n) { return (n + 1) + '. ' + l; }); label = 'Lines numbered'; }
    else if (act === 'lower') { rows = rows.map(function (l) { return l.toLowerCase(); }); label = 'Lower case'; }
    else if (act === 'upper') { rows = rows.map(function (l) { return l.toUpperCase(); }); label = 'Upper case'; }
    else if (act === 'shuffle') {
      for (var i = rows.length - 1; i > 0; i--) {
        var j = randomInts(1)[0] % (i + 1);
        var tmp = rows[i]; rows[i] = rows[j]; rows[j] = tmp;
      }
      label = 'Shuffled';
    }
    else { label = 'Cleaned up'; }
    out(rows.join('\n'));
    setStatus(label + ' - ' + rows.length + ' line' + (rows.length === 1 ? '' : 's') + '.');
  }

  /* ---------- Wiring ---------- */
  var TOOLS = {
    json: {
      run: function (act) { runJson(act === 'minify' || checked('jsonMinify')); },
      live: false
    },
    base64: {
      run: function (act) { hideError(); var t = src(); if (!t) { out(''); return; }
        try { out(act === 'decode' ? decodeBase64(t, checked('b64UrlSafe')) : encodeBase64(t, checked('b64UrlSafe')));
              setStatus(act === 'decode' ? 'Decoded.' : t.length + ' characters encoded.'); }
        catch (e) { showError('That is not valid Base64, or the decoded bytes are not UTF-8 text.'); out(''); } }
    },
    url: { run: function (act) { runUrl(act === 'decode' ? 'decode' : 'encode'); } },
    hash: { run: function () { runHash(); } },
    uuid: { run: function () { runUuid(); }, autoRun: true },
    password: { run: function () { runPassword(); }, autoRun: true },
    timestamp: { run: function () { runTimestamp(); } },
    case: { run: function () { runCase(); }, live: true },
    count: { run: function () { runCount(); }, live: true, autoRun: true },
    color: { run: function () { runColor(); }, live: true, autoRun: true },
    lorem: { run: function () { runLorem(); }, autoRun: true },
    lines: { run: function (act) { runLines(act); } }
  };

  var tool = TOOLS[TOOL];
  if (!tool) return;

  var run = tool.run;
  var timer = null;
  function schedule() {
    if (!tool.live) return;
    clearTimeout(timer);
    timer = setTimeout(function () { run(); }, 250);
  }

  Array.prototype.slice.call(document.querySelectorAll('[data-act]')).forEach(function (btn) {
    btn.addEventListener('click', function () {
      var act = btn.getAttribute('data-act');
      if (act === 'copy') { copyText(output ? output.value : ''); return; }
      if (act === 'clear') {
        if (input) input.value = '';
        out('');
        hideError();
        if ($('toolStats')) $('toolStats').innerHTML = '';
        setStatus(null);
        return;
      }
      if (act === 'download') { download(btn.getAttribute('data-name') || 'result.txt', output ? output.value : ''); return; }
      if (act === 'now') {
        if (input) input.value = String(Math.floor(Date.now() / 1000));
        runTimestamp();
        return;
      }
      if (act === 'random-color') {
        var r = randomInts(1)[0] % 16777216;
        var hex = '#' + r.toString(16).padStart(6, '0');
        if (input) input.value = hex;
        runColor(hex);
        return;
      }
      run(act);
    });
  });

  if (input) input.addEventListener('input', schedule);
  ['jsonIndent', 'jsonMinify', 'b64UrlSafe', 'urlWhole', 'uuidCount', 'uuidUpper', 'uuidBraces', 'uuidPlain',
   'pwLength', 'pwLower', 'pwUpper', 'pwDigits', 'pwSymbols', 'pwNoAmbiguous', 'pwCount', 'caseMode',
   'loremUnit', 'loremHtml', 'loremClassic', 'loremCount'].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('change', function () {
      if (TOOL === 'case' && id === 'caseMode') { runCase(el.value); return; }
      run();
    });
    if (el.type === 'range' || el.type === 'number') el.addEventListener('input', function () { run(); });
  });

  var picker = $('colorPicker');
  if (picker) {
    picker.addEventListener('input', function () {
      if (input) input.value = picker.value;
      runColor(picker.value);
    });
  }

  Array.prototype.slice.call(document.querySelectorAll('[data-case]')).forEach(function (btn) {
    btn.addEventListener('click', function () {
      var mode = btn.getAttribute('data-case');
      var sel = $('caseMode');
      if (sel) sel.value = mode;
      runCase(mode);
    });
  });

  if (tool.autoRun) run();
})();
