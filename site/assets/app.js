(function () {
  'use strict';

  var STORAGE_COOKIE = 'imgcomp_cookie';
  var $ = function (id) { return document.getElementById(id); };

  /* ============ Cookie banner (all pages) ============ */
  var cookieBanner = $('cookieBanner');
  var cookieAccept = $('cookieAccept');
  var cookieReject = $('cookieReject');
  if (cookieBanner && cookieAccept && cookieReject) {
    if (!localStorage.getItem(STORAGE_COOKIE)) cookieBanner.hidden = false;
    cookieAccept.addEventListener('click', function () {
      localStorage.setItem(STORAGE_COOKIE, '1');
      cookieBanner.hidden = true;
    });
    cookieReject.addEventListener('click', function () {
      localStorage.setItem(STORAGE_COOKIE, '0');
      cookieBanner.hidden = true;
    });
  }

  /* ============ Tool (only on pages that contain the tool) ============ */
  var dropzone = $('dropzone');
  if (!dropzone) return;

  var fileInput = $('fileInput');
  var errorMsg = $('errorMsg');
  var results = $('results');
  var fileName = $('fileName');
  var origSize = $('origSize');
  var beforeImg = $('beforeImg');
  var beforeEmpty = $('beforeEmpty');
  var afterImg = $('afterImg');
  var afterEmpty = $('afterEmpty');
  var beforeSize = $('beforeSize');
  var afterSize = $('afterSize');
  var compressedSize = $('compressedSize');
  var savedVal = $('savedVal');
  var statusEl = $('status');
  var downloadBtn = $('downloadBtn');
  var batchResults = $('batchResults');
  var batchList = $('batchList');
  var batchProgressText = $('batchProgressText');
  var batchProgressFill = $('batchProgressFill');
  var downloadZipBtn = $('downloadZipBtn');
  var formatSelect = $('formatSelect');
  var pngHint = $('pngHint');
  var singleLevelBtns = Array.prototype.slice.call(document.querySelectorAll('#results .level-btn'));
  var batchLevelBtns = Array.prototype.slice.call(document.querySelectorAll('#batchResults .level-btn'));

  /* ============ State ============ */
  var currentImg = null;
  var originalFile = null;
  var originalSize = 0;
  var currentBlob = null;
  var beforeUrl = null;
  var afterUrl = null;
  var statusKey = null;
  var batchItems = [];
  var batchDone = 0;
  var batchRunToken = 0;
  var recompressToken = 0;
  var qualityLevel = 75;
  var batchQualityLevel = 75;

  var webpSupported = (function () {
    var c = document.createElement('canvas');
    c.width = c.height = 1;
    return c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  })();

  var outputFormat = document.body.getAttribute('data-default-format') || 'webp'; // 'webp' | 'jpeg' | 'png' | 'auto'
  var FORMAT_MIME = { webp: 'image/webp', jpeg: 'image/jpeg', png: 'image/png' };

  function currentMime() {
    var m = outputFormat === 'auto'
      ? (originalFile ? originalFile.type : 'image/jpeg')
      : FORMAT_MIME[outputFormat];
    if (m === 'image/webp' && !webpSupported) m = 'image/png';
    return m;
  }

  /* ============ Helpers ============ */
  function formatBytes(bytes) {
    if (!isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function extForType(type) {
    if (type === 'image/webp') return 'webp';
    if (type === 'image/png') return 'png';
    return 'jpg';
  }

  function setStatus(msg) {
    statusKey = msg;
    if (msg) { statusEl.textContent = msg; statusEl.hidden = false; }
    else { statusEl.hidden = true; }
  }

  function showError(msg) { errorMsg.textContent = msg; errorMsg.hidden = false; }
  function hideError() { errorMsg.hidden = true; }

  function compressImage(img, q, type) {
    var MAX_DIM = 8192;
    var w = img.naturalWidth, h = img.naturalHeight;
    var scale = Math.min(1, MAX_DIM / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d');
    type = type || currentMime();
    if (type === 'image/webp' && !webpSupported) type = 'image/png';
    if (type === 'image/jpeg') {
      // JPEG has no alpha channel — fill white to avoid a black background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(blob); }, type, q / 100);
    });
  }

  function updateResult(blob) {
    if (!blob) return;
    currentBlob = blob;
    if (afterUrl) URL.revokeObjectURL(afterUrl);
    afterUrl = URL.createObjectURL(blob);
    afterImg.src = afterUrl;
    afterImg.hidden = false;
    afterEmpty.hidden = true;
    afterSize.textContent = formatBytes(blob.size);
    beforeSize.textContent = formatBytes(originalSize);
    compressedSize.textContent = formatBytes(blob.size);

    var saved = Math.round((1 - blob.size / originalSize) * 100);
    if (saved > 0) {
      savedVal.textContent = 'Saved ' + saved + '%';
      savedVal.className = 'stat-value badge is-good';
    } else if (saved < 0) {
      savedVal.textContent = 'Larger by ' + Math.abs(saved) + '%';
      savedVal.className = 'stat-value badge is-bad';
    } else {
      savedVal.textContent = 'No change';
      savedVal.className = 'stat-value badge is-none';
    }
    savedVal.classList.remove('pop');
    void savedVal.offsetWidth;
    savedVal.classList.add('pop');

    downloadBtn.disabled = false;
  }

  async function recompress() {
    if (!currentImg) return;
    var token = ++recompressToken;
    setStatus('Compressing…');
    try {
      var q = qualityLevel;
      var blob = await compressImage(currentImg, q);
      if (token !== recompressToken) return;
      updateResult(blob);
      setStatus(null);
    } catch (err) {
      if (token !== recompressToken) return;
      setStatus('Compression failed, please retry');
    }
  }

  /* ============ ZIP utilities ============ */
  var CRC_TABLE = null;
  function crcTable() {
    if (CRC_TABLE) return CRC_TABLE;
    CRC_TABLE = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c >>> 0;
    }
    return CRC_TABLE;
  }
  function crc32(bytes) {
    var table = crcTable();
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = (c >>> 8) ^ table[(c ^ bytes[i]) & 0xFF];
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8Bytes(str) { return new TextEncoder().encode(str); }
  function concatBytes(chunks) {
    var total = 0;
    for (var i = 0; i < chunks.length; i++) total += chunks[i].length;
    var out = new Uint8Array(total);
    var o = 0;
    for (var i = 0; i < chunks.length; i++) { out.set(chunks[i], o); o += chunks[i].length; }
    return out;
  }
  function deflateRaw(bytes) {
    var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
  }
  function localHeader(nameBytes, crc, compSize, uncompSize, method) {
    var b = new DataView(new ArrayBuffer(30));
    b.setUint32(0, 0x04034b50, true);
    b.setUint16(4, 20, true);
    b.setUint16(6, 0x0800, true);
    b.setUint16(8, method, true);
    b.setUint16(10, 0, true);
    b.setUint16(12, 0, true);
    b.setUint32(14, crc, true);
    b.setUint32(18, compSize, true);
    b.setUint32(22, uncompSize, true);
    b.setUint16(26, nameBytes.length, true);
    b.setUint16(28, 0, true);
    return concatBytes([new Uint8Array(b.buffer), nameBytes]);
  }
  function centralHeader(nameBytes, crc, compSize, uncompSize, localOffset, method) {
    var b = new DataView(new ArrayBuffer(46));
    b.setUint32(0, 0x02014b50, true);
    b.setUint16(4, 20, true);
    b.setUint16(6, 20, true);
    b.setUint16(8, 0x0800, true);
    b.setUint16(10, method, true);
    b.setUint16(12, 0, true);
    b.setUint16(14, 0, true);
    b.setUint32(16, crc, true);
    b.setUint32(20, compSize, true);
    b.setUint32(24, uncompSize, true);
    b.setUint16(28, nameBytes.length, true);
    b.setUint16(30, 0, true);
    b.setUint16(32, 0, true);
    b.setUint16(34, 0, true);
    b.setUint16(36, 0, true);
    b.setUint32(38, 0, true);
    b.setUint32(42, localOffset, true);
    return concatBytes([new Uint8Array(b.buffer), nameBytes]);
  }
  function endOfCentralDirectory(entryCount, cdSize, cdOffset) {
    var b = new DataView(new ArrayBuffer(22));
    b.setUint32(0, 0x06054b50, true);
    b.setUint16(4, 0, true);
    b.setUint16(6, 0, true);
    b.setUint16(8, entryCount, true);
    b.setUint16(10, entryCount, true);
    b.setUint32(12, cdSize, true);
    b.setUint32(16, cdOffset, true);
    b.setUint16(20, 0, true);
    return new Uint8Array(b.buffer);
  }
  var HAS_COMPRESSION = typeof CompressionStream !== 'undefined';
  async function buildZip(entries) {
    var localParts = [];
    var centralParts = [];
    var offset = 0;
    for (var i = 0; i < entries.length; i++) {
      var raw = new Uint8Array(await entries[i].blob.arrayBuffer());
      var nameBytes = utf8Bytes(entries[i].name);
      var crc = crc32(raw);
      var method, data;
      if (HAS_COMPRESSION) {
        data = await deflateRaw(raw);
        method = 8;
      } else {
        data = raw;
        method = 0;
      }
      var local = localHeader(nameBytes, crc, data.length, raw.length, method);
      localParts.push(local, data);
      centralParts.push(centralHeader(nameBytes, crc, data.length, raw.length, offset, method));
      offset += local.length + data.length;
    }
    var centralDir = concatBytes(centralParts);
    var eocd = endOfCentralDirectory(entries.length, centralDir.length, offset);
    return new Blob([concatBytes(localParts), centralDir, eocd], { type: 'application/zip' });
  }
  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('image-load')); };
      img.src = url;
    });
  }

  /* ============ Upload ============ */
  async function handleFile(file) {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) {
      showError('Unsupported format — please upload a JPG / PNG / WebP image');
      return;
    }
    hideError();
    batchResults.hidden = true;
    originalFile = file;
    originalSize = file.size;
    applyFormatUI();
    if (beforeUrl) URL.revokeObjectURL(beforeUrl);
    beforeUrl = URL.createObjectURL(file);

    var img = new Image();
    img.onload = async function () {
      currentImg = img;
      beforeImg.src = beforeUrl;
      beforeImg.hidden = false;
      beforeEmpty.hidden = true;
      fileName.textContent = file.name;
      origSize.textContent = formatBytes(file.size);
      results.hidden = false;
      await recompress();
    };
    img.onerror = function () { showError('Could not load this image, please try another'); };
    img.src = beforeUrl;
  }

  function handleFiles(fileList) {
    var valid = [];
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      if (f && /^image\/(jpeg|png|webp)$/.test(f.type)) valid.push(f);
    }
    if (!valid.length) { showError('Unsupported format — please upload a JPG / PNG / WebP image'); return; }
    hideError();
    batchRunToken++;
    if (valid.length === 1) {
      handleFile(valid[0]);
    } else {
      startBatch(valid);
    }
  }

  dropzone.addEventListener('click', function () { fileInput.click(); });
  dropzone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files.length) handleFiles(fileInput.files);
    fileInput.value = '';
  });
  ['dragenter', 'dragover'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.add('drag'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.remove('drag'); });
  });
  dropzone.addEventListener('drop', function (e) {
    var files = e.dataTransfer.files;
    if (files && files.length) handleFiles(files);
  });

  /* ============ Compression level ============ */
  function applySingleLevelUI() {
    singleLevelBtns.forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-level') === String(qualityLevel));
    });
  }
  singleLevelBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var v = parseInt(btn.getAttribute('data-level'), 10);
      if (v === qualityLevel) return;
      qualityLevel = v;
      applySingleLevelUI();
      if (currentImg) recompress();
    });
  });

  /* ============ Output format ============ */
  function applyFormatUI() {
    formatSelect.value = outputFormat;
    pngHint.hidden = currentMime() !== 'image/png';
  }
  formatSelect.addEventListener('change', function () {
    outputFormat = formatSelect.value;
    applyFormatUI();
    if (currentImg) recompress();
  });

  /* ============ Download ============ */
  downloadBtn.addEventListener('click', function () {
    if (!currentBlob) return;
    var url = URL.createObjectURL(currentBlob);
    var a = document.createElement('a');
    var stem = (originalFile.name.replace(/\.[^.]+$/, '') || 'image');
    a.href = url;
    a.download = stem + '-compressed.' + extForType(currentBlob.type);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  /* ============ Batch ============ */
  function startBatch(files) {
    results.hidden = true;
    batchResults.hidden = false;
    batchItems = files.map(function (f) {
      return { file: f, name: f.name, size: f.size, state: 'processing', blob: null, el: null };
    });
    renderBatchList();
    downloadZipBtn.disabled = true;
    runBatch();
  }

  function renderBatchList() {
    batchList.innerHTML = '';
    batchItems.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'batch-item';
      li.innerHTML =
        '<span class="bi-name"></span>' +
        '<span class="bi-sizes"><span class="bi-orig"></span> → <span class="bi-comp">—</span></span>' +
        '<span class="bi-status"></span>';
      li.querySelector('.bi-name').textContent = item.name;
      li.querySelector('.bi-orig').textContent = formatBytes(item.size);
      li.querySelector('.bi-status').textContent = 'Compressing…';
      batchList.appendChild(li);
      item.el = li;
    });
    updateBatchProgress();
  }

  async function runBatch() {
    var token = ++batchRunToken;
    var q = batchQualityLevel;
    batchDone = 0;
    batchItems.forEach(function (item) { item.state = 'processing'; item.blob = null; });
    refreshBatchTexts();
    for (var i = 0; i < batchItems.length; i++) {
      var item = batchItems[i];
      try {
        var img = await loadImage(item.file);
        if (token !== batchRunToken) return;
        var blob = await compressImage(img, q, 'image/webp');
        if (token !== batchRunToken) return;
        item.blob = blob;
        item.state = 'done';
      } catch (err) {
        if (token !== batchRunToken) return;
        item.state = 'error';
      }
      batchDone++;
      refreshBatchItem(item);
      updateBatchProgress();
    }
    if (token === batchRunToken) downloadZipBtn.disabled = false;
  }

  function refreshBatchItem(item) {
    if (!item.el) return;
    var comp = item.el.querySelector('.bi-comp');
    var status = item.el.querySelector('.bi-status');
    if (item.state === 'done' && item.blob) {
      comp.textContent = formatBytes(item.blob.size);
      status.textContent = 'Done';
      status.className = 'bi-status done';
    } else if (item.state === 'error') {
      comp.textContent = '—';
      status.textContent = 'Compression failed';
      status.className = 'bi-status error';
    } else {
      status.textContent = 'Compressing…';
      status.className = 'bi-status';
    }
  }

  function refreshBatchTexts() {
    if (batchResults.hidden) return;
    batchItems.forEach(refreshBatchItem);
    updateBatchProgress();
  }

  function updateBatchProgress() {
    var total = batchItems.length;
    batchProgressText.textContent = batchDone + '/' + total + ' Done';
    batchProgressFill.style.width = (total ? (batchDone / total * 100) : 0) + '%';
  }

  function applyBatchLevelUI() {
    batchLevelBtns.forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-level') === String(batchQualityLevel));
    });
  }
  batchLevelBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var v = parseInt(btn.getAttribute('data-level'), 10);
      if (v === batchQualityLevel) return;
      batchQualityLevel = v;
      applyBatchLevelUI();
      if (batchItems.length) runBatch();
    });
  });

  downloadZipBtn.addEventListener('click', async function () {
    var entries = batchItems.filter(function (it) { return it.blob; }).map(function (it) {
      var stem = it.name.replace(/\.[^.]+$/, '') || 'image';
      return { name: stem + '-compressed.' + extForType(it.blob.type), blob: it.blob };
    });
    if (!entries.length) return;
    downloadZipBtn.disabled = true;
    var zipBlob = await buildZip(entries);
    triggerDownload(zipBlob, 'compressed-images.zip');
    downloadZipBtn.disabled = false;
  });

  /* ============ Init ============ */
  applySingleLevelUI();
  applyFormatUI();
  applyBatchLevelUI();
})();
