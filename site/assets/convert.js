/* Shared engine for the image conversion tools. Runs entirely in the browser. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var dropzone = $('convertDropzone');
  if (!dropzone) return;

  var fileInput = $('convertFileInput');
  var errorMsg = $('convertError');
  var results = $('convertResults');
  var singleWrap = $('convertSingle');
  var multiWrap = $('convertMulti');
  var multiList = $('convertList');
  var formatSelect = $('convertFormat');
  var bgInput = $('convertBg');
  var maxWidthSelect = $('convertMaxWidth');
  var beforeImg = $('convertBefore');
  var afterImg = $('convertAfter');
  var beforeMeta = $('convertBeforeMeta');
  var afterMeta = $('convertAfterMeta');
  var origSizeEl = $('convertOrigSize');
  var outSizeEl = $('convertOutSize');
  var savedEl = $('convertSaved');
  var dimsEl = $('convertDims');
  var statusEl = $('convertStatus');
  var downloadBtn = $('convertDownload');
  var resetBtn = $('convertReset');
  var qualityBtns = Array.prototype.slice.call(document.querySelectorAll('#convertQuality .level-btn'));

  var MULTI = document.body.getAttribute('data-multi') === '1';
  var outputFormat = document.body.getAttribute('data-default-format') || 'jpeg';
  var quality = 0.85;
  var currentImg = null;
  var currentFile = null;
  var beforeUrl = null;
  var afterUrl = null;
  var outBlob = null;
  var sourceHasAlpha = false;
  var token = 0;

  var MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

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

  if (formatSelect) formatSelect.value = outputFormat;

  function formatBytes(bytes) {
    if (!isFinite(bytes) || bytes < 0) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function extFor(type) {
    if (type === 'image/png') return 'png';
    if (type === 'image/webp') return 'webp';
    return 'jpg';
  }

  function setStatus(msg) {
    if (!statusEl) return;
    if (msg) { statusEl.textContent = msg; statusEl.hidden = false; }
    else { statusEl.hidden = true; }
  }

  function showError(msg) { errorMsg.textContent = msg; errorMsg.hidden = false; }
  function hideError() { errorMsg.hidden = true; }

  function targetMime() {
    if (outputFormat === 'auto') return (currentFile && currentFile.type) || 'image/jpeg';
    var m = MIME[outputFormat] || 'image/jpeg';
    if (m === 'image/webp' && !WEBP_OK) m = 'image/jpeg';
    return m;
  }

  function bgColour() {
    if (!bgInput || !bgInput.value) return '#ffffff';
    return bgInput.value;
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
      img.src = url;
    });
  }

  function convert(img, mime) {
    var w = img.naturalWidth;
    var h = img.naturalHeight;
    var maxW = maxWidthSelect ? (parseInt(maxWidthSelect.value, 10) || 0) : 0;
    if (maxW && w > maxW) {
      var k = maxW / w;
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    if (mime === 'image/jpeg') {
      ctx.fillStyle = bgColour();
      ctx.fillRect(0, 0, w, h);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return new Promise(function (resolve) {
      var done = function (blob) { resolve({ blob: blob, w: w, h: h }); };
      if (mime === 'image/png') canvas.toBlob(done, 'image/png');
      else canvas.toBlob(done, mime, quality);
    });
  }

  function download(blob, url, name) {
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function baseName(file) {
    return (file && file.name ? file.name.replace(/\.[^.]+$/, '') : 'image');
  }

  function showSingle(file) {
    if (beforeUrl) URL.revokeObjectURL(beforeUrl);
    beforeUrl = URL.createObjectURL(file);
    currentFile = file;
    loadImage(file).then(function (res) {
      currentImg = res.img;
      results.hidden = false;
      if (singleWrap) singleWrap.hidden = false;
      if (multiWrap) multiWrap.hidden = true;
      if (beforeImg) { beforeImg.src = beforeUrl; beforeImg.hidden = false; }
      if (beforeMeta) beforeMeta.textContent = file.name + ' - ' + formatBytes(file.size) + ' - ' + res.img.naturalWidth + ' x ' + res.img.naturalHeight + ' px';
      origSizeEl.textContent = formatBytes(file.size);
      hasTransparency(res.img).then(function (hasAlpha) {
        sourceHasAlpha = hasAlpha;
        run();
      });
    }).catch(function () { showError('That file could not be read as an image.'); });
  }

  /* Cheap transparency probe: draw a small copy and look for pixels that are not fully opaque. */
  function hasTransparency(img) {
    return new Promise(function (resolve) {
      try {
        var w = Math.max(1, Math.min(64, img.naturalWidth));
        var h = Math.max(1, Math.min(64, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        var ctx = c.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        var data = ctx.getImageData(0, 0, w, h).data;
        for (var i = 3; i < data.length; i += 4) {
          if (data[i] < 250) { resolve(true); return; }
        }
        resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  function run() {
    if (!currentImg || MULTI) return;
    var mine = ++token;
    var mime = targetMime();
    downloadBtn.disabled = true;
    setStatus('Converting...');
    convert(currentImg, mime).then(function (out) {
      if (mine !== token) return;
      if (!out.blob) {
        setStatus('This browser could not produce that format. Try a different output format.');
        return;
      }
      outBlob = out.blob;
      if (afterUrl) URL.revokeObjectURL(afterUrl);
      afterUrl = URL.createObjectURL(out.blob);
      if (afterImg) { afterImg.src = afterUrl; afterImg.hidden = false; }
      outSizeEl.textContent = formatBytes(out.blob.size);
      dimsEl.textContent = out.w + ' x ' + out.h + ' px';
      var saved = currentFile.size > 0 ? Math.round((1 - out.blob.size / currentFile.size) * 100) : 0;
      if (saved > 0) {
        savedEl.textContent = saved + '% smaller';
        savedEl.className = 'stat-value badge is-good';
      } else if (saved < 0) {
        savedEl.textContent = Math.abs(saved) + '% larger';
        savedEl.className = 'stat-value badge is-bad';
      } else {
        savedEl.textContent = 'Same size';
        savedEl.className = 'stat-value badge is-none';
      }
      if (afterMeta) afterMeta.textContent = out.blob.size ? (formatBytes(out.blob.size) + ' - ' + out.w + ' x ' + out.h + ' px') : '';
      downloadBtn.disabled = false;
      var note = '';
      if (mime === 'image/jpeg' && sourceHasAlpha) note = ' This image had transparent areas - they were filled with ' + bgColour() + ', because JPEG cannot store transparency.';
      setStatus('Done - ' + out.w + ' x ' + out.h + ' px, ' + formatBytes(out.blob.size) + '.' + note);
    });
  }

  function runMulti(files) {
    var list = Array.prototype.slice.call(files);
    results.hidden = false;
    if (singleWrap) singleWrap.hidden = true;
    if (multiWrap) multiWrap.hidden = false;
    multiList.innerHTML = '';
    setStatus('Converting ' + list.length + ' file' + (list.length === 1 ? '' : 's') + '...');
    var mime = MIME[outputFormat] || 'image/jpeg';
    if (mime === 'image/webp' && !WEBP_OK) mime = 'image/jpeg';
    var done = 0;
    var seq = list.slice();
    var step = function () {
      if (!seq.length) {
        setStatus('Done - ' + done + ' file' + (done === 1 ? '' : 's') + ' converted to ' + extFor(mime).toUpperCase() + '.');
        return;
      }
      var file = seq.shift();
      loadImage(file).then(function (res) {
        currentFile = file;
        return convert(res.img, mime).then(function (out) {
          URL.revokeObjectURL(res.url);
          var row = document.createElement('div');
          row.className = 'convert-row';
          var url = URL.createObjectURL(out.blob);
          var name = baseName(file) + '.' + extFor(mime);
          row.innerHTML = '<span class="convert-name"></span><span class="convert-meta"></span>';
          row.querySelector('.convert-name').textContent = file.name;
          row.querySelector('.convert-meta').textContent = formatBytes(file.size) + ' -> ' + formatBytes(out.blob.size) + ' (' + out.w + ' x ' + out.h + ')';
          var a = document.createElement('a');
          a.className = 'btn btn-ghost convert-dl';
          a.href = url;
          a.download = name;
          a.textContent = 'Download';
          row.appendChild(a);
          multiList.appendChild(row);
          done++;
          setStatus('Converting... ' + done + ' done');
          step();
        });
      }).catch(function () {
        var row = document.createElement('div');
        row.className = 'convert-row is-error';
        row.innerHTML = '<span class="convert-name"></span><span class="convert-meta">Could not be read</span>';
        row.querySelector('.convert-name').textContent = file.name;
        multiList.appendChild(row);
        step();
      });
    };
    step();
  }

  function handleFiles(files) {
    if (!files || !files.length) return;
    var list = Array.prototype.slice.call(files).filter(function (f) {
      return f.type && f.type.indexOf('image/') === 0;
    });
    if (!list.length) { showError('Please choose an image file (JPG, PNG or WebP).'); return; }
    hideError();
    if (MULTI) runMulti(list);
    else showSingle(list[0]);
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
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) handleFiles(files);
  });

  if (formatSelect) {
    formatSelect.addEventListener('change', function () {
      outputFormat = formatSelect.value;
      if (MULTI) return;
      run();
    });
  }
  qualityBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      qualityBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      quality = (parseInt(btn.getAttribute('data-level'), 10) || 85) / 100;
      run();
    });
  });
  if (bgInput) bgInput.addEventListener('input', run);
  if (maxWidthSelect) maxWidthSelect.addEventListener('change', run);

  if (downloadBtn) {
    downloadBtn.addEventListener('click', function () {
      if (!outBlob) return;
      download(outBlob, afterUrl, baseName(currentFile) + '.' + extFor(outBlob.type));
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      currentImg = null;
      currentFile = null;
      outBlob = null;
      results.hidden = true;
      if (beforeUrl) { URL.revokeObjectURL(beforeUrl); beforeUrl = null; }
      if (afterUrl) { URL.revokeObjectURL(afterUrl); afterUrl = null; }
      if (beforeImg) { beforeImg.removeAttribute('src'); beforeImg.hidden = true; }
      if (afterImg) { afterImg.removeAttribute('src'); afterImg.hidden = true; }
      hideError();
    });
  }
})();
