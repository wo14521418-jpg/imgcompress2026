/* Combine images into a single PDF. Runs entirely in the browser - no upload, no library. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var dropzone = $('pdfDropzone');
  if (!dropzone) return;

  var fileInput = $('pdfFileInput');
  var errorMsg = $('pdfError');
  var editor = $('pdfEditor');
  var listEl = $('pdfList');
  var pageSizeSelect = $('pdfPageSize');
  var orientationSelect = $('pdfOrientation');
  var marginSelect = $('pdfMargin');
  var buildBtn = $('pdfBuild');
  var clearBtn = $('pdfClear');
  var statusEl = $('pdfStatus');
  var resultEl = $('pdfResult');
  var resultMeta = $('pdfResultMeta');
  var downloadBtn = $('pdfDownload');
  var openLink = $('pdfOpen');
  var qualityBtns = Array.prototype.slice.call(document.querySelectorAll('#pdfQuality .level-btn'));

  var PT_PER_PX = 0.75;            /* 96 dpi -> points */
  var MAX_EDGE = 2400;             /* cap the embedded pixel size */
  var SIZES = { a4: [595.28, 841.89], letter: [612, 792] };

  var items = [];
  var quality = 0.9;
  var outBlob = null;
  var outUrl = null;
  var busy = false;

  function formatBytes(bytes) {
    if (!isFinite(bytes) || bytes < 0) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function setStatus(msg) {
    if (msg) { statusEl.textContent = msg; statusEl.hidden = false; }
    else { statusEl.hidden = true; }
  }

  function showError(msg) { errorMsg.textContent = msg; errorMsg.hidden = false; }
  function hideError() { errorMsg.hidden = true; }

  function lbl(n) {
    var r = Math.round(n * 100) / 100;
    return String(r);
  }

  function latin1(str) {
    var out = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
    return out;
  }

  function pad10(n) {
    var s = String(n);
    while (s.length < 10) s = '0' + s;
    return s;
  }

  /* Minimal PDF writer: one page per image, each image embedded as a JPEG XObject. */
  function buildPdf(pages) {
    var chunks = [];
    var len = 0;
    var offsets = [];

    function push(data) {
      var bytes = typeof data === 'string' ? latin1(data) : data;
      chunks.push(bytes);
      len += bytes.length;
      return bytes.length;
    }
    function startObj(n) { offsets[n] = len; push(n + ' 0 obj\n'); }

    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    startObj(1);
    push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    var kids = [];
    for (var i = 0; i < pages.length; i++) kids.push((5 + i * 3) + ' 0 R');
    startObj(2);
    push('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pages.length + ' >>\nendobj\n');

    for (var p = 0; p < pages.length; p++) {
      var page = pages[p];
      var imgNum = 3 + p * 3;
      var contentNum = 4 + p * 3;
      var pageNum = 5 + p * 3;

      startObj(imgNum);
      push('<< /Type /XObject /Subtype /Image /Width ' + page.pxW + ' /Height ' + page.pxH +
           ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + page.jpeg.length + ' >>\nstream\n');
      push(page.jpeg);
      push('\nendstream\nendobj\n');

      var content = 'q\n' + lbl(page.drawW) + ' 0 0 ' + lbl(page.drawH) + ' ' +
                    lbl(page.x) + ' ' + lbl(page.y) + ' cm\n/Im0 Do\nQ\n';
      var contentBytes = latin1(content);
      startObj(contentNum);
      push('<< /Length ' + contentBytes.length + ' >>\nstream\n');
      push(contentBytes);
      push('endstream\nendobj\n');

      startObj(pageNum);
      push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + lbl(page.pageW) + ' ' + lbl(page.pageH) + '] ' +
           '/Resources << /XObject << /Im0 ' + imgNum + ' 0 R >> >> /Contents ' + contentNum + ' 0 R >>\nendobj\n');
    }

    var xrefStart = len;
    var count = 2 + pages.length * 3;
    var xref = 'xref\n0 ' + (count + 1) + '\n0000000000 65535 f \n';
    for (var n = 1; n <= count; n++) xref += pad10(offsets[n] || 0) + ' 00000 n \n';
    push(xref);
    push('trailer\n<< /Size ' + (count + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF\n');

    return new Blob(chunks, { type: 'application/pdf' });
  }

  function jpegFromImage(img) {
    var w = img.naturalWidth;
    var h = img.naturalHeight;
    var scale = 1;
    var longEdge = Math.max(w, h);
    if (longEdge > MAX_EDGE) scale = MAX_EDGE / longEdge;
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        if (!blob) { resolve(null); return; }
        blob.arrayBuffer().then(function (buf) {
          resolve({ jpeg: new Uint8Array(buf), pxW: w, pxH: h });
        });
      }, 'image/jpeg', quality);
    });
  }

  function layout(item, jpegInfo) {
    var m = parseInt(marginSelect.value, 10) || 0;
    var size = pageSizeSelect.value;
    var imgWpt = jpegInfo.pxW * PT_PER_PX;
    var imgHpt = jpegInfo.pxH * PT_PER_PX;
    var pageW, pageH, drawW, drawH, x, y;

    if (size === 'fit') {
      pageW = imgWpt + m * 2;
      pageH = imgHpt + m * 2;
      drawW = imgWpt;
      drawH = imgHpt;
      x = m;
      y = m;
    } else {
      var base = SIZES[size] || SIZES.a4;
      pageW = base[0];
      pageH = base[1];
      var orient = orientationSelect.value;
      var landscape = orient === 'landscape' || (orient === 'auto' && jpegInfo.pxW > jpegInfo.pxH);
      if (landscape && pageH > pageW) { var t = pageW; pageW = pageH; pageH = t; }
      var availW = Math.max(1, pageW - m * 2);
      var availH = Math.max(1, pageH - m * 2);
      var k = Math.min(availW / imgWpt, availH / imgHpt);
      drawW = imgWpt * k;
      drawH = imgHpt * k;
      x = (pageW - drawW) / 2;
      y = (pageH - drawH) / 2;
    }
    return { jpeg: jpegInfo.jpeg, pxW: jpegInfo.pxW, pxH: jpegInfo.pxH, pageW: pageW, pageH: pageH, drawW: drawW, drawH: drawH, x: x, y: y };
  }

  function renderList() {
    listEl.innerHTML = '';
    items.forEach(function (item, i) {
      var row = document.createElement('div');
      row.className = 'pdf-row';
      row.innerHTML =
        '<span class="pdf-index"></span>' +
        '<span class="pdf-name"></span>' +
        '<span class="pdf-meta"></span>' +
        '<span class="pdf-actions">' +
          '<button type="button" class="icon-btn" data-act="up" title="Move up" aria-label="Move up">&#8593;</button>' +
          '<button type="button" class="icon-btn" data-act="down" title="Move down" aria-label="Move down">&#8595;</button>' +
          '<button type="button" class="icon-btn" data-act="remove" title="Remove" aria-label="Remove">&#10005;</button>' +
        '</span>';
      row.querySelector('.pdf-index').textContent = (i + 1) + '.';
      row.querySelector('.pdf-name').textContent = item.file.name;
      row.querySelector('.pdf-meta').textContent = item.img.naturalWidth + ' x ' + item.img.naturalHeight + ' px - ' + formatBytes(item.file.size);
      row.querySelector('.pdf-actions').addEventListener('click', function (e) {
        var act = e.target.getAttribute && e.target.getAttribute('data-act');
        if (!act) return;
        if (act === 'remove') {
          URL.revokeObjectURL(items[i].url);
          items.splice(i, 1);
        } else if (act === 'up' && i > 0) {
          var a = items[i - 1];
          items[i - 1] = items[i];
          items[i] = a;
        } else if (act === 'down' && i < items.length - 1) {
          var b = items[i + 1];
          items[i + 1] = items[i];
          items[i] = b;
        }
        renderList();
      });
      listEl.appendChild(row);
    });
    editor.hidden = items.length === 0;
    buildBtn.disabled = items.length === 0 || busy;
    if (items.length) setStatus(items.length + ' image' + (items.length === 1 ? '' : 's') + ' ready. Press Create PDF.');
    else setStatus(null);
  }

  function addFiles(files) {
    var list = Array.prototype.slice.call(files).filter(function (f) {
      return f.type && f.type.indexOf('image/') === 0;
    });
    if (!list.length) { showError('Please choose image files (JPG, PNG or WebP).'); return; }
    hideError();
    var pending = list.length;
    list.forEach(function (file) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        items.push({ file: file, url: url, img: img });
        pending--;
        if (pending === 0) renderList();
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        pending--;
        showError('One file could not be read and was skipped.');
        if (pending === 0) renderList();
      };
      img.src = url;
    });
  }

  function createPdf() {
    if (busy || !items.length) return;
    busy = true;
    buildBtn.disabled = true;
    setStatus('Preparing ' + items.length + ' image' + (items.length === 1 ? '' : 's') + '...');
    var pages = [];
    var queue = items.slice();
    var step = function () {
      if (!queue.length) {
        setStatus('Writing the PDF...');
        try {
          outBlob = buildPdf(pages);
        } catch (err) {
          busy = false;
          buildBtn.disabled = false;
          showError('Sorry, the PDF could not be created in this browser.');
          return;
        }
        if (outUrl) URL.revokeObjectURL(outUrl);
        outUrl = URL.createObjectURL(outBlob);
        resultEl.hidden = false;
        resultMeta.textContent = items.length + ' page' + (items.length === 1 ? '' : 's') + ' - ' + formatBytes(outBlob.size);
        downloadBtn.disabled = false;
        openLink.href = outUrl;
        setStatus('Done - ' + items.length + ' page' + (items.length === 1 ? '' : 's') + ', ' + formatBytes(outBlob.size) + '.');
        busy = false;
        buildBtn.disabled = false;
        return;
      }
      var item = queue.shift();
      jpegFromImage(item.img).then(function (info) {
        if (!info) {
          busy = false;
          buildBtn.disabled = false;
          showError('One image could not be encoded and the PDF was not created.');
          return;
        }
        pages.push(layout(item, info));
        setStatus('Preparing image ' + pages.length + ' of ' + items.length + '...');
        step();
      });
    };
    step();
  }

  dropzone.addEventListener('click', function () { fileInput.click(); });
  dropzone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files.length) addFiles(fileInput.files);
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
    if (files && files.length) addFiles(files);
  });

  qualityBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      qualityBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      quality = (parseInt(btn.getAttribute('data-level'), 10) || 90) / 100;
    });
  });

  buildBtn.addEventListener('click', createPdf);
  clearBtn.addEventListener('click', function () {
    items.forEach(function (i) { URL.revokeObjectURL(i.url); });
    items = [];
    outBlob = null;
    if (outUrl) { URL.revokeObjectURL(outUrl); outUrl = null; }
    resultEl.hidden = true;
    downloadBtn.disabled = true;
    renderList();
  });
  downloadBtn.addEventListener('click', function () {
    if (!outBlob) return;
    var base = items.length && items[0].file.name ? items[0].file.name.replace(/\.[^.]+$/, '') : 'images';
    var a = document.createElement('a');
    a.href = outUrl;
    a.download = base + (items.length > 1 ? '-and-more' : '') + '.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
})();
