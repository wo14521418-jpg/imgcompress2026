/* Crop an image in the browser: drag to select, resize with the corner handles, download. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var dropzone = $('cropDropzone');
  if (!dropzone) return;

  var fileInput = $('cropFileInput');
  var errorMsg = $('cropError');
  var editor = $('cropEditor');
  var stage = $('cropStage');
  var img = $('cropImg');
  var rectEl = $('cropRect');
  var sizeLabel = $('cropSizeLabel');
  var infoEl = $('cropInfo');
  var formatSelect = $('cropFormat');
  var applyBtn = $('cropApply');
  var resetBtn = $('cropReset');
  var resultWrap = $('cropResult');
  var resultImg = $('cropResultImg');
  var resultMeta = $('cropResultMeta');
  var downloadBtn = $('cropDownload');
  var aspectBtns = Array.prototype.slice.call(document.querySelectorAll('.aspect-btn'));
  var qualityBtns = Array.prototype.slice.call(document.querySelectorAll('#cropControls .level-btn'));
  var masks = {
    top: $('cropMaskTop'),
    bottom: $('cropMaskBottom'),
    left: $('cropMaskLeft'),
    right: $('cropMaskRight')
  };

  var currentImg = null;
  var originalFile = null;
  var sel = null;
  var aspect = 0;
  var quality = 0.8;
  var drag = null;
  var outBlob = null;
  var outUrl = null;
  var sourceUrl = null;
  var MIN = 16;

  var FORMATS = { webp: 'image/webp', jpeg: 'image/jpeg', png: 'image/png' };

  function showError(msg) { errorMsg.textContent = msg; errorMsg.hidden = false; }
  function hideError() { errorMsg.hidden = true; }

  function bounds() {
    return { w: img.clientWidth, h: img.clientHeight };
  }

  function scaleFactor() {
    if (!img.clientWidth) return 1;
    return currentImg.naturalWidth / img.clientWidth;
  }

  function clamp() {
    if (!sel) return;
    var b = bounds();
    sel.w = Math.max(MIN, Math.min(sel.w, b.w));
    sel.h = Math.max(MIN, Math.min(sel.h, b.h));
    sel.x = Math.max(0, Math.min(sel.x, b.w - sel.w));
    sel.y = Math.max(0, Math.min(sel.y, b.h - sel.h));
  }

  function render() {
    var b = bounds();
    if (!sel || sel.w < MIN || sel.h < MIN) {
      rectEl.hidden = true;
      Object.keys(masks).forEach(function (k) { masks[k].hidden = true; });
      infoEl.textContent = 'Drag on the image to choose the crop area.';
      applyBtn.disabled = true;
      return;
    }
    rectEl.hidden = false;
    rectEl.style.left = sel.x + 'px';
    rectEl.style.top = sel.y + 'px';
    rectEl.style.width = sel.w + 'px';
    rectEl.style.height = sel.h + 'px';
    masks.top.hidden = false; masks.top.style.left = '0px'; masks.top.style.top = '0px';
    masks.top.style.width = b.w + 'px'; masks.top.style.height = sel.y + 'px';
    masks.bottom.hidden = false; masks.bottom.style.left = '0px'; masks.bottom.style.top = (sel.y + sel.h) + 'px';
    masks.bottom.style.width = b.w + 'px'; masks.bottom.style.height = Math.max(0, b.h - sel.y - sel.h) + 'px';
    masks.left.hidden = false; masks.left.style.left = '0px'; masks.left.style.top = sel.y + 'px';
    masks.left.style.width = sel.x + 'px'; masks.left.style.height = sel.h + 'px';
    masks.right.hidden = false; masks.right.style.left = (sel.x + sel.w) + 'px'; masks.right.style.top = sel.y + 'px';
    masks.right.style.width = Math.max(0, b.w - sel.x - sel.w) + 'px'; masks.right.style.height = sel.h + 'px';

    var k = scaleFactor();
    var w = Math.max(1, Math.round(sel.w * k));
    var h = Math.max(1, Math.round(sel.h * k));
    sizeLabel.textContent = w + ' x ' + h;
    infoEl.textContent = 'Crop area: ' + w + ' x ' + h + ' px (source image ' + currentImg.naturalWidth + ' x ' + currentImg.naturalHeight + ' px)';
    applyBtn.disabled = false;
  }

  function pointerPos(e) {
    var r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function insideRect(p) {
    return !!sel && p.x >= sel.x && p.x <= sel.x + sel.w && p.y >= sel.y && p.y <= sel.y + sel.h;
  }

  function setAspect(a) {
    aspect = a;
    if (!currentImg) return;
    var b = bounds();
    if (!sel || sel.w < MIN) {
      var w = b.w * 0.8;
      var h = aspect > 0 ? w / aspect : b.h * 0.8;
      if (h > b.h * 0.8) { h = b.h * 0.8; w = aspect > 0 ? h * aspect : b.w * 0.8; }
      sel = { x: (b.w - w) / 2, y: (b.h - h) / 2, w: w, h: h };
    } else if (aspect > 0) {
      var cx = sel.x + sel.w / 2;
      var cy = sel.y + sel.h / 2;
      var nw = sel.w;
      var nh = nw / aspect;
      if (nh > sel.h) { nh = sel.h; nw = nh * aspect; }
      sel = { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
    }
    clamp();
    render();
  }

  stage.addEventListener('pointerdown', function (e) {
    if (!currentImg) return;
    if (typeof e.button === 'number' && e.button !== 0) return;
    var target = e.target;
    var p = pointerPos(e);
    if (target.classList && target.classList.contains('crop-handle')) {
      drag = { mode: 'resize', handle: target.getAttribute('data-h'), p: p, orig: { x: sel.x, y: sel.y, w: sel.w, h: sel.h } };
    } else if (insideRect(p) && target !== img) {
      drag = { mode: 'move', p: p, orig: { x: sel.x, y: sel.y, w: sel.w, h: sel.h } };
    } else {
      drag = { mode: 'new', p: p };
      sel = { x: p.x, y: p.y, w: 0, h: 0 };
      render();
    }
    if (stage.setPointerCapture) {
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
    e.preventDefault();
  });

  stage.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var b = bounds();
    var p = pointerPos(e);
    p.x = Math.max(0, Math.min(p.x, b.w));
    p.y = Math.max(0, Math.min(p.y, b.h));

    if (drag.mode === 'new') {
      var x = Math.min(drag.p.x, p.x);
      var y = Math.min(drag.p.y, p.y);
      var w = Math.abs(p.x - drag.p.x);
      var h = Math.abs(p.y - drag.p.y);
      if (aspect > 0) {
        h = w / aspect;
        if (y + h > b.h) { h = b.h - y; w = h * aspect; }
        if (x + w > b.w) { w = b.w - x; h = w / aspect; }
      }
      sel = { x: x, y: y, w: w, h: h };
      clamp();
      render();
      return;
    }

    if (drag.mode === 'move') {
      sel = { x: drag.orig.x + (p.x - drag.p.x), y: drag.orig.y + (p.y - drag.p.y), w: drag.orig.w, h: drag.orig.h };
      clamp();
      render();
      return;
    }

    var o = drag.orig;
    var left = o.x;
    var top = o.y;
    var right = o.x + o.w;
    var bottom = o.y + o.h;
    var movingW = drag.handle.indexOf('w') >= 0;
    var movingN = drag.handle.indexOf('n') >= 0;
    if (movingW) left = p.x; else right = p.x;
    if (movingN) top = p.y; else bottom = p.y;
    var nw = Math.abs(right - left);
    var nh = Math.abs(bottom - top);
    if (aspect > 0) {
      nh = nw / aspect;
      if (movingN) top = bottom - nh; else bottom = top + nh;
    }
    var next = { x: Math.min(left, right), y: Math.min(top, bottom), w: nw, h: nh };
    if (next.w < MIN || next.h < MIN) return;
    sel = next;
    clamp();
    if (aspect > 0) {
      sel.h = sel.w / aspect;
      if (sel.y + sel.h > b.h) { sel.h = b.h - sel.y; sel.w = sel.h * aspect; }
      if (sel.x + sel.w > b.w) { sel.w = b.w - sel.x; sel.h = sel.w / aspect; }
    }
    render();
  });

  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    stage.addEventListener(ev, function () { drag = null; });
  });

  aspectBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      aspectBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      setAspect(parseFloat(btn.getAttribute('data-aspect')) || 0);
    });
  });

  qualityBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      qualityBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      quality = (parseInt(btn.getAttribute('data-level'), 10) || 80) / 100;
      if (outBlob) applyCrop();
    });
  });

  function outputMime() {
    var v = formatSelect.value;
    if (v === 'auto') return (originalFile && originalFile.type) || 'image/png';
    return FORMATS[v] || 'image/png';
  }

  function applyCrop() {
    if (!currentImg || !sel || sel.w < MIN) return;
    var k = scaleFactor();
    var sx = Math.round(sel.x * k);
    var sy = Math.round(sel.y * k);
    var sw = Math.round(sel.w * k);
    var sh = Math.round(sel.h * k);
    sw = Math.max(1, Math.min(sw, currentImg.naturalWidth - sx));
    sh = Math.max(1, Math.min(sh, currentImg.naturalHeight - sy));
    var canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    var ctx = canvas.getContext('2d');
    var mime = outputMime();
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sw, sh);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(currentImg, sx, sy, sw, sh, 0, 0, sw, sh);
    var done = function (blob) {
      if (!blob) { showError('Sorry, this browser could not create the cropped image. Try a different output format.'); return; }
      outBlob = blob;
      if (outUrl) URL.revokeObjectURL(outUrl);
      outUrl = URL.createObjectURL(blob);
      resultImg.src = outUrl;
      resultMeta.textContent = sw + ' x ' + sh + ' px - ' + (blob.size / 1024).toFixed(1) + ' KB';
      resultWrap.hidden = false;
      downloadBtn.disabled = false;
    };
    if (mime === 'image/png') canvas.toBlob(done, 'image/png');
    else canvas.toBlob(done, mime, quality);
  }

  applyBtn.addEventListener('click', applyCrop);

  resetBtn.addEventListener('click', function () {
    if (!currentImg) return;
    sel = null;
    render();
  });

  formatSelect.addEventListener('change', function () {
    if (outBlob) applyCrop();
  });

  downloadBtn.addEventListener('click', function () {
    if (!outBlob) return;
    var mime = outBlob.type;
    var ext = mime === 'image/webp' ? 'webp' : (mime === 'image/jpeg' ? 'jpg' : 'png');
    var base = (originalFile && originalFile.name ? originalFile.name.replace(/\.[^.]+$/, '') : 'image');
    var a = document.createElement('a');
    a.href = outUrl;
    a.download = base + '-cropped.' + ext;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  function loadFile(file) {
    if (!file) return;
    if (!file.type || file.type.indexOf('image/') !== 0) {
      showError('Please choose an image file (JPG, PNG or WebP).');
      return;
    }
    hideError();
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = URL.createObjectURL(file);
    originalFile = file;
    var probe = new Image();
    probe.onload = function () {
      currentImg = probe;
      img.src = sourceUrl;
      editor.hidden = false;
      resultWrap.hidden = true;
      outBlob = null;
      downloadBtn.disabled = true;
      var start = function () {
        sel = null;
        render();
      };
      if (img.complete && img.clientWidth) start();
      else img.addEventListener('load', start, { once: true });
    };
    probe.onerror = function () { showError('That file could not be read as an image.'); };
    probe.src = sourceUrl;
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

  window.addEventListener('resize', function () {
    if (!currentImg) return;
    clamp();
    render();
  });
})();
