/*
 * HEIC Converter - all conversion happens locally in the browser.
 *
 * Security note: filenames and library error strings are attacker-controlled
 * (a file can be named `"><img src=x onerror=...>.heic`). Every such value is
 * written through textContent or a DOM property, never interpolated into an
 * HTML string. Keep it that way.
 */
(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // State. `format` is snapshotted onto each item at conversion time, so a
  // later toggle can't mislabel an already-converted file.
  let queue = [];
  let selectedFormat = 'image/jpeg';
  let quality = 1.0;
  let processing = false;

  const $ = (id) => document.getElementById(id);

  const dropzone = $('dropzone');
  const fileInput = $('fileInput');
  const btnJpg = $('btnJpg');
  const btnPng = $('btnPng');
  const qualityContainer = $('qualityContainer');
  const qualitySlider = $('qualitySlider');
  const qualityVal = $('qualityVal');
  const queueSection = $('queueSection');
  const fileList = $('fileList');
  const fileCount = $('fileCount');
  const btnClear = $('btnClear');
  const btnDownloadAll = $('btnDownloadAll');
  const toast = $('toast');
  const toastMessage = $('toastMessage');
  const toastIcon = $('toastIcon');
  const toastClose = $('toastClose');

  /* ---------- Icon helpers (build SVG nodes, no innerHTML) ---------- */

  const PATHS = {
    download: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
    trash:
      'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
    alert: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  };

  const iconPath = (name) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('d', PATHS[name]);
    return path;
  };

  const icon = (name, cls) => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', cls);
    svg.appendChild(iconPath(name));
    return svg;
  };

  const spinner = () => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'i-sm spin');
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '10');
    circle.setAttribute('stroke', 'currentColor');
    circle.setAttribute('stroke-width', '4');
    circle.setAttribute('opacity', '0.25');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('opacity', '0.75');
    path.setAttribute(
      'd',
      'M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
    );
    svg.append(circle, path);
    return svg;
  };

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  /* ---------- Format and quality ---------- */

  const setFormat = (fmt) => {
    selectedFormat = fmt;
    const isJpeg = fmt === 'image/jpeg';
    btnJpg.setAttribute('aria-pressed', String(isJpeg));
    btnPng.setAttribute('aria-pressed', String(!isJpeg));
    qualityContainer.dataset.disabled = String(!isJpeg);
    qualitySlider.disabled = !isJpeg;
  };

  btnJpg.addEventListener('click', () => setFormat('image/jpeg'));
  btnPng.addEventListener('click', () => setFormat('image/png'));

  qualitySlider.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    qualityVal.textContent = val + '%';
    quality = val / 100;
  });

  /* ---------- Drag and drop ---------- */

  ['dragenter', 'dragover'].forEach((name) => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('is-over');
    });
  });

  ['dragleave', 'drop'].forEach((name) => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('is-over');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    handleFiles(Array.from((e.dataTransfer && e.dataTransfer.files) || []));
  });

  fileInput.addEventListener('change', (e) => {
    handleFiles(Array.from(e.target.files || []));
    fileInput.value = '';
  });

  /* ---------- Queue intake ---------- */

  const extensionOf = (name) => {
    const dot = name.lastIndexOf('.');
    return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
  };

  const looksLikeHeic = (f) => {
    const ext = extensionOf(f.name);
    const type = (f.type || '').toLowerCase();
    return (
      ext === 'heic' ||
      ext === 'heif' ||
      type.includes('heic') ||
      type.includes('heif')
    );
  };

  const newId = () =>
    crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()) + Math.random().toString(36).slice(2);

  const handleFiles = (files) => {
    const heicFiles = files.filter(looksLikeHeic);

    if (heicFiles.length === 0) {
      showToast('Please select valid HEIC or HEIF image files.', 'error');
      return;
    }

    hideToast();

    heicFiles.forEach((file) => {
      queue.push({
        id: newId(),
        file: file,
        status: 'pending',
        format: null,
        resultBlob: null,
        resultUrl: null,
        error: null,
      });
    });

    renderQueue();
    processQueue();
  };

  /* ---------- Conversion ---------- */

  // Single sequential loop. heic2any keeps one global worker, so overlapping
  // runs would interleave on shared state.
  const processQueue = async () => {
    if (processing) return;
    processing = true;

    try {
      for (;;) {
        const item = queue.find((i) => i.status === 'pending');
        if (!item) break;

        // Snapshot the settings this file is actually converted with.
        const format = selectedFormat;
        const q = quality;

        item.status = 'converting';
        renderQueue();

        try {
          const result = await heic2any({
            blob: item.file,
            toType: format,
            quality: format === 'image/jpeg' ? q : undefined,
          });

          // heic2any returns an array when the HEIC holds multiple frames.
          const blob = Array.isArray(result) ? result[0] : result;
          if (!blob) throw new Error('Conversion produced no image data.');

          // The item may have been removed while we awaited.
          if (!queue.includes(item)) continue;

          item.status = 'done';
          item.format = format;
          item.resultBlob = blob;
          item.resultUrl = URL.createObjectURL(blob);
        } catch (err) {
          if (!queue.includes(item)) continue;
          console.error('HEIC conversion failed:', err);
          item.status = 'error';
          item.error = (err && err.message) || 'Failed to parse HEIC image.';
        }

        renderQueue();
      }
    } finally {
      processing = false;
      updateDownloadAllButton();
    }
  };

  /* ---------- Output naming ---------- */

  const extFor = (format) => (format === 'image/png' ? 'png' : 'jpg');

  // Strip path separators and control characters that a crafted filename
  // could otherwise carry into the download attribute.
  const outputName = (item) => {
    const cleaned = item.file.name.replace(/[\\/\x00-\x1f\x7f]/g, '_');
    const base = cleaned.replace(/\.(heic|heif)$/i, '').trim() || 'image';
    return base + '.' + extFor(item.format || selectedFormat);
  };

  /* ---------- Rendering ---------- */

  const buildStatus = (item) => {
    if (item.status === 'pending') {
      const span = el('span', 'status');
      span.append(el('span', 'dot'), document.createTextNode('Queued'));
      return span;
    }

    if (item.status === 'converting') {
      const span = el('span', 'status converting');
      span.append(spinner(), document.createTextNode('Converting...'));
      return span;
    }

    if (item.status === 'error') {
      const span = el('span', 'status error', 'Error converting');
      span.title = item.error || ''; // property assignment, never interpolated
      return span;
    }

    // done
    const group = el('div', 'done-group');

    const size = el('div', 'size-out');
    size.append(
      el('div', 'val', formatBytes(item.resultBlob.size)),
      el('div', 'cap', 'Converted')
    );

    const link = el('a', 'btn btn-save');
    link.href = item.resultUrl;
    link.download = outputName(item);
    link.append(icon('download', 'i-sm'), document.createTextNode('Save'));

    group.append(size, link);
    return group;
  };

  const buildItem = (item) => {
    const row = el('div', 'file-item');

    const id = el('div', 'file-id');
    id.append(el('div', 'thumb', 'HEIC'));

    const meta = el('div', 'file-meta');
    const name = el('p', 'file-name', item.file.name); // textContent
    name.title = item.file.name;
    meta.append(name, el('p', 'file-size', formatBytes(item.file.size)));
    id.append(meta);

    const actions = el('div', 'file-actions');

    const remove = el('button', 'icon-btn');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Remove file');
    remove.append(icon('trash', 'i-md'));
    remove.addEventListener('click', () => removeItem(item.id));

    actions.append(buildStatus(item), remove);
    row.append(id, actions);
    return row;
  };

  const renderQueue = () => {
    if (queue.length === 0) {
      queueSection.hidden = true;
      fileList.replaceChildren();
      updateDownloadAllButton();
      return;
    }

    queueSection.hidden = false;
    fileCount.textContent = String(queue.length);
    fileList.replaceChildren.apply(fileList, queue.map(buildItem));
    updateDownloadAllButton();
  };

  /* ---------- Queue mutation ---------- */

  const releaseItem = (item) => {
    if (item.resultUrl) {
      URL.revokeObjectURL(item.resultUrl);
      item.resultUrl = null;
    }
  };

  const removeItem = (id) => {
    const idx = queue.findIndex((i) => i.id === id);
    if (idx === -1) return;
    releaseItem(queue[idx]);
    queue.splice(idx, 1);
    renderQueue();
  };

  btnClear.addEventListener('click', () => {
    queue.forEach(releaseItem);
    queue = [];
    renderQueue();
  });

  const updateDownloadAllButton = () => {
    const done = queue.filter((i) => i.status === 'done');
    btnDownloadAll.hidden = done.length <= 1;
  };

  btnDownloadAll.addEventListener('click', () => {
    queue
      .filter((i) => i.status === 'done')
      .forEach((item, index) => {
        // Stagger slightly; browsers throttle rapid successive downloads.
        setTimeout(() => {
          if (!item.resultUrl) return;
          const a = document.createElement('a');
          a.href = item.resultUrl;
          a.download = outputName(item);
          a.click();
        }, index * 200);
      });
  });

  // Release any outstanding object URLs when the page goes away.
  window.addEventListener('pagehide', () => queue.forEach(releaseItem));

  /* ---------- Toast ---------- */

  const showToast = (msg, type) => {
    toastMessage.textContent = msg;
    const isError = type === 'error';
    toast.classList.toggle('error', isError);
    toastIcon.replaceChildren(iconPath(isError ? 'alert' : 'info'));
    toast.hidden = false;
  };

  const hideToast = () => {
    toast.hidden = true;
  };

  toastClose.addEventListener('click', hideToast);

  /* ---------- Helpers ---------- */

  function formatBytes(bytes, decimals) {
    if (!bytes) return '0 B';
    const dm = decimals === undefined ? 1 : Math.max(decimals, 0);
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(
      Math.floor(Math.log(bytes) / Math.log(k)),
      sizes.length - 1
    );
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /* ---------- Init ---------- */

  setFormat('image/jpeg');
  qualitySlider.value = '100';
  qualityVal.textContent = '100%';
  quality = 1.0;
})();
