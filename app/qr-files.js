/* Share sharp QR images with an opaque quiet zone; decode files without screenshots. */
(() => {
  'use strict';
  async function png(code) {
    const qr = qrcode(0, 'M'); qr.addData(code); qr.make();
    const count = qr.getModuleCount(), cell = 8, margin = 8;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = (count + margin * 2) * cell;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    for (let row = 0; row < count; row++) for (let col = 0; col < count; col++)
      if (qr.isDark(row, col)) ctx.fillRect((col + margin) * cell, (row + margin) * cell, cell, cell);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('Gambar QR belum dapat dibuat.')), 'image/png'));
  }
  async function read(file) {
    if (!file || file.size > 12000000) throw Error('Pilih file QR PNG/JPG/SVG di bawah 12 MB.');
    let source = file;
    if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
      const doc = new DOMParser().parseFromString(await file.text(), 'image/svg+xml'), svg = doc.documentElement;
      if (svg.localName !== 'svg') throw Error('File SVG QR tidak valid.');
      const box = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
      if (box.length === 4 && box[2] > 0 && box[3] > 0) { svg.setAttribute('width', box[2]); svg.setAttribute('height', box[3]); }
      source = new Blob([new XMLSerializer().serializeToString(svg)], {type:'image/svg+xml'});
    }
    const src = URL.createObjectURL(source), img = new Image();
    try {
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(Error('Format gambar belum didukung. Pilih file PNG/JPG/SVG yang dibagikan dosen.')); img.src = src; });
      const width = img.naturalWidth, height = img.naturalHeight;
      if (!width || !height || width * height > 60000000) throw Error('Ukuran gambar QR terlalu besar.');
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', {willReadFrequently:true});
      for (const limit of [1600, 1000, 700, 2400]) {
        const scale = Math.min(1, limit / Math.max(width, height));
        const w = Math.round(width * scale), h = Math.round(height * scale), pad = 32;
        canvas.width = w + pad * 2; canvas.height = h + pad * 2;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, pad, pad, w, h);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(pixels.data, pixels.width, pixels.height, {inversionAttempts:'attemptBoth'});
        if (result) return result.data;
      }
      throw Error('QR belum terbaca. Pilih file asli yang dibagikan dosen, atau tempel kode QR.');
    } finally { URL.revokeObjectURL(src); }
  }
  window.WAQRFiles = {png, read};
})();
