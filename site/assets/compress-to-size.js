/* Compress an image to a target file size in KB. Runs entirely in the browser. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var dropzone = $('sizeDropzone');
  if (!dropzone) return;

  var fileInput = $('sizeFileInput');
  var targetInput = $('targetKb');
  var maxWidthSelect = $('sizeMaxWidth');
  var formatSelect = $('sizeFormat');
  var errorMsg = $('sizeError');
  var results = $('sizeResults');
  var beforeImg = $('sizeBefore');
  var afterImg = $('sizeAfter');
  var beforeMeta = $('sizeBeforeMeta');
  var afterMeta = $('sizeAfterMeta');
  var origSizeEl = $('sizeOrig');
  var outSizeEl = $('sizeOut');
  var savedEl = $('sizeSaved');
  var dimsEl = $('sizeDims');
  var qualityEl = $('sizeQuality');
  var statusEl = $('sizeStatus');
  var downloadBtn = $('sizeDownload');
  var quickTargets = Array.prototype.slice.call(document.querySelectorAll('.quick-target'));

  var currentImg = null;
  var originalFile = null;
  var outBlob = null;
  var beforeUrl = null;
  var afterUrl = null;
  var runToken = 0;

  var WEBP_OK = (function () {
    try {
      var c = document.createElement('canvas');
      c.width = 1;
      c.height = 1;
      return c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (e) {
      return false;
    }
  })();

  function formatBytes(bytes) {
    if (!isFinite(bytes) || bytes < 0) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function extFor(type) {
    if (type === 'image/webp') return 'webp';
    return 'jpg';
  }

  function setStatus(msg) {
    if (msg) { statusEl.textContent = msg; statusEl.hidden = false; }
    else { statusEl.hidden = true; }
  }

  function showError(msg) { errorMsg.textContent = msg; errorMsg.hidden = false; }
  function hideError() { errorMsg.hidden = true; }

  function currentMime() {
    if (formatSelect.value === 'jpeg') return 'image/jpeg';
    return WEBP_OK ? 'image/webp' : 'image/jpeg';
  }

  function encode(img, w, h, mime, q) {
    return new Promise(function (resolve) {
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (mime === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(function (blob) { resolve(blob); }, mime, q);
    });
  }

  /* Try one set of dimensions: keep the highest quality that still lands inside the target. */
  async function tryScale(img, w, h, targetBytes, mime) {
    var hi = await encode(img, w, h, mime, 0.95);
    if (hi && hi.size <= targetBytes) return { blob: hi, w: w, h: h, q: 0.95 };
    var lo = await encode(img, w, h, mime, 0.05);
    if (!lo || lo.size > targetBytes) return null;
    var best = { blob: lo, w: w, h: h, q: 0.05 };
    var low = 0.05;
    var high = 0.95;
    for (var i = 0; i < 6; i++) {
      var mid = (low + high) / 2;
      var midBlob = await encode(img, w, h, mime, mid);
      if (midBlob && midBlob.size <= targetBytes) {
        best = { blob: midBlob, w: w, h: h, q: mid };
        low = mid;
      } else {
        high = mid;
      }
    }
    return best;
  }

  async function fitToTarget(img, baseW, baseH, targetBytes, mime, token) {
    var scale = 1;
    for (var step = 0; step < 12 && scale >= 0.12; step++) {
      if (token !== runToken) return null;
      var w = Math.max(1, Math.round(baseW * scale));
      var h = Math.max(1, Math.round(baseH * scale));
      var hit = await tryScale(img, w, h, targetBytes, mime);
      if (token !== runToken) return null;
      if (hit) return hit;
      scale *= 0.85;
      if (step < 11) setStatus('Too large at full quality - scaling down to hit ' + Math.round(targetBytes / 1024) + ' KB...');
    }
    return null;
  }

  async function run() {
    if (!currentImg) return;
    var targetKb = parseFloat(targetInput.value);
    if (!isFinite(targetKb) || targetKb <= 0) {
      showError('Enter a target size in KB, for example 200.');
      return;
    }
    hideError();
    var token = ++runToken;
    var targetBytes = Math.round(targetKb * 1024);
    var mime = currentMime();
    var maxW = parseInt(maxWidthSelect.value, 10) || 0;
    var baseW = currentImg.naturalWidth;
    var baseH = currentImg.naturalHeight;
    if (maxW && baseW > maxW) {
      var k = maxW / baseW;
      baseW = Math.round(baseW * k);
      baseH = Math.round(baseH * k);
    }
    downloadBtn.disabled = true;
    setStatus('Searching for the highest quality that fits ' + targetKb + ' KB...');
    var res = await fitToTarget(currentImg, baseW, baseH, targetBytes, mime, token);
    if (token !== runToken) return;
    if (!res) {
      setStatus('Could not reach ' + targetKb + ' KB even at the lowest quality. Pick a smaller maximum width and try again.');
      return;
    }
    outBlob = res.blob;
    if (afterUrl) URL.revokeObjectURL(afterUrl);
    afterUrl = URL.createObjectURL(res.blob);
    afterImg.src = afterUrl;
    afterImg.hidden = false;
    outSizeEl.textContent = formatBytes(res.blob.size);
    dimsEl.textContent = res.w + ' x ' + res.h + ' px';
    qualityEl.textContent = Math.round(res.q * 100) + '%';
    var saved = originalFile.size > 0 ? Math.round((1 - res.blob.size / originalFile.size) * 100) : 0;
    if (saved > 0) {
      savedEl.textContent = 'Saved ' + saved + '%';
      savedEl.className = 'stat-value badge is-good';
    } else {
      savedEl.textContent = 'Already this small';
      savedEl.className = 'stat-value badge is-bad';
    }
    afterMeta.textContent = formatBytes(res.blob.size) + ' - ' + res.w + ' x ' + res.h + ' px';
    downloadBtn.disabled = false;
    setStatus(res.blob.size <= targetBytes
      ? 'Done - output is ' + formatBytes(res.blob.size) + ', inside your ' + targetKb + ' KB target.'
      : 'Done.');
  }

  function loadFile(file) {
    if (!file) return;
    if (!file.type || file.type.indexOf('image/') !== 0) {
      showError('Please choose an image file (JPG, PNG or WebP).');
      return;
    }
    hideError();
    if (beforeUrl) URL.revokeObjectURL(beforeUrl);
    beforeUrl = URL.createObjectURL(file);
    originalFile = file;
    var probe = new Image();
    probe.onload = function () {
      currentImg = probe;
      results.hidden = false;
      beforeImg.src = beforeUrl;
      beforeImg.hidden = false;
      beforeMeta.textContent = file.name + ' - ' + formatBytes(file.size);
      origSizeEl.textContent = formatBytes(file.size);
      run();
    };
    probe.onerror = function () { showError('That file could not be read as an image.'); };
    probe.src = beforeUrl;
  }

  dropzone.addEventListener('click', function () { fileInput.click(); });
  dropzone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files.length) loadFile(fileInput.files[0]);
    fileInput.value = '';
  });
  ['dragenter', 'dragover'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.add('drag'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.remove('drag'); });
  });
  dropzone.addEventListener('drop', function (e) {
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) loadFile(files[0]);
  });

  quickTargets.forEach(function (btn) {
    btn.addEventListener('click', function () {
      quickTargets.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      targetInput.value = btn.getAttribute('data-kb');
      run();
    });
  });

  targetInput.addEventListener('input', function () {
    quickTargets.forEach(function (b) { b.classList.remove('active'); });
    run();
  });
  maxWidthSelect.addEventListener('change', run);
  formatSelect.addEventListener('change', run);

  downloadBtn.addEventListener('click', function () {
    if (!outBlob) return;
    var name = (originalFile && originalFile.name ? originalFile.name.replace(/\.[^.]+$/, '') : 'image');
    var a = document.createElement('a');
    a.href = afterUrl;
    a.download = name + '-' + Math.round(parseFloat(targetInput.value) || 0) + 'kb.' + extFor(outBlob.type);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
})();
