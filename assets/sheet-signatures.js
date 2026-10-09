/* Gambar tanda tangan per lembar/kelas, tanpa mengubah isi identitas dosen. */
(() => {
    'use strict';
    const validImage = value => typeof value === 'string' && /^data:image\/(png|jpeg|webp);base64,/i.test(value);
    window.SheetSignatures = {
        install({root, storageKey, onChange = () => {}}) {
            if (!root) return;
            let saved = {};
            try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch (_) {}
            const notify = message => {
                document.querySelector('.sheet-signature-status')?.remove();
                const status = document.createElement('div');
                status.className = 'sheet-signature-status'; status.setAttribute('role', 'status'); status.textContent = message;
                document.body.appendChild(status); setTimeout(() => status.remove(), 5000);
            };
            const render = (slot, source) => {
                const img = slot.querySelector('.sheet-signature-image');
                if (source) img.src = source; else img.removeAttribute('src');
                img.hidden = !source;
                slot.classList.toggle('has-signature', !!source);
                slot.querySelector('[data-signature-upload]').textContent = source ? 'Ganti gambar' : '+ Tanda tangan / foto';
                slot.querySelector('[data-signature-remove]').hidden = !source;
                onChange();
            };
            root.querySelectorAll('[data-signature-slot]').forEach(slot => {
                const label = slot.dataset.signatureLabel || 'Tanda tangan';
                const img = document.createElement('img'); img.className = 'sheet-signature-image'; img.alt = label; img.hidden = true;
                img.addEventListener('load', onChange);
                const controls = document.createElement('div'); controls.className = 'sheet-signature-controls';
                const upload = document.createElement('button'); upload.type = 'button'; upload.className = 'sheet-signature-action'; upload.dataset.signatureUpload = ''; upload.setAttribute('aria-label', 'Unggah foto atau ' + label.toLowerCase());
                upload.title = 'Pilih gambar, atau tempel gambar dari clipboard pada blok tanda tangan yang dipilih.';
                const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'sheet-signature-action'; remove.dataset.signatureRemove = ''; remove.textContent = 'Hapus'; remove.setAttribute('aria-label', 'Hapus gambar ' + label.toLowerCase());
                const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp'; input.hidden = true; input.dataset.signatureFile = ''; input.setAttribute('aria-label', 'Berkas gambar ' + label.toLowerCase());
                controls.append(upload, remove, input); slot.replaceChildren(img, controls);
                render(slot, validImage(saved[slot.dataset.signatureSlot]) ? saved[slot.dataset.signatureSlot] : '');
            });
            const persist = (slot, source) => {
                const next = {...saved};
                if (source) next[slot.dataset.signatureSlot] = source; else delete next[slot.dataset.signatureSlot];
                try { localStorage.setItem(storageKey, JSON.stringify(next)); }
                catch (_) { notify('Gambar belum tersimpan. Penyimpanan browser penuh atau tidak tersedia; pilih gambar lebih kecil.'); return false; }
                saved = next; render(slot, source); return true;
            };
            const loadFile = async (slot, file) => {
                if (!file) return;
                if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) { notify('Pilih gambar PNG, JPG, atau WEBP.'); return; }
                if (file.size > 10 * 1024 * 1024) { notify('Ukuran gambar maksimal 10 MB.'); return; }
                const url = URL.createObjectURL(file);
                try {
                    const img = new Image();
                    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
                    const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
                    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
                    const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const source = canvas.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.92);
                    if (persist(slot, source)) notify('Gambar tersimpan untuk lembar dan kelas ini di browser perangkat.');
                } catch (_) { notify('Gambar tidak dapat dibaca. Pilih berkas gambar lain.'); }
                finally { URL.revokeObjectURL(url); }
            };
            // Delegasi tetap bekerja setelah Undo/Redo mengganti isi kertas.
            root.addEventListener('click', event => {
                const action = event.target.closest('[data-signature-upload], [data-signature-remove]');
                if (!action) return;
                const slot = action.closest('[data-signature-slot]');
                event.preventDefault(); event.stopPropagation();
                if (action.hasAttribute('data-signature-upload')) slot.querySelector('[data-signature-file]').click();
                else persist(slot, '');
            }, true);
            root.addEventListener('change', event => {
                if (!event.target.matches('[data-signature-file]')) return;
                const input = event.target;
                void loadFile(input.closest('[data-signature-slot]'), input.files?.[0]); input.value = '';
            });
            root.addEventListener('paste', event => {
                const slot = event.target.closest('[data-signature-slot]') || event.target.closest('.signature-box')?.querySelector('[data-signature-slot]') || root.querySelector('.signature-box.selected [data-signature-slot]');
                const item = Array.from(event.clipboardData?.items || []).find(item => item.kind === 'file' && item.type.startsWith('image/'));
                if (!slot || !item) return;
                event.preventDefault(); void loadFile(slot, item.getAsFile());
            });
        }
    };
})();
