/* Gambar tanda tangan per lembar/kelas, tanpa mengubah isi identitas dosen. */
(() => {
    'use strict';
    const validImage = value => typeof value === 'string' && /^data:image\/(png|jpeg|webp);base64,/i.test(value);
    const layout = value => {const v=typeof value==='string'?{src:value}:value||{};return {src:validImage(v.src)?v.src:'',x:Math.max(-100,Math.min(100,Number(v.x)||0)),y:Math.max(-20,Math.min(80,Number(v.y)||0)),scale:Math.max(25,Math.min(200,Number(v.scale)||100))};};
    const read = slot => layout({src:slot.querySelector('.sheet-signature-image')?.getAttribute('src'),x:slot.dataset.signatureX,y:slot.dataset.signatureY,scale:slot.dataset.signatureScale});
    const restore = (slot,value) => {const v=layout(value),img=slot.querySelector('.sheet-signature-image');if(!img)return;img.hidden=!v.src;if(v.src)img.src=v.src;else img.removeAttribute('src');slot.classList.toggle('has-signature',!!v.src);slot.dataset.signatureX=v.x;slot.dataset.signatureY=v.y;slot.dataset.signatureScale=v.scale;img.style.transform=`translate(${v.x}px,${v.y}px) scale(${v.scale/100})`;for(const action of slot.querySelectorAll('[data-signature-remove],[data-signature-position]'))action.hidden=!v.src;const upload=slot.querySelector('[data-signature-upload]');if(upload)upload.textContent=v.src?'Ganti gambar':'+ Tanda tangan / foto';};
    function exportBox(box){
        const img=box.querySelector('.sheet-signature-image:not([hidden])');if(!img?.complete||!img.naturalWidth)return null;
        const rect=box.getBoundingClientRect(),scale=rect.width/box.offsetWidth||1,w=box.offsetWidth,h=box.offsetHeight,canvas=document.createElement('canvas');canvas.width=Math.ceil(w*2);canvas.height=Math.ceil(h*2);const c=canvas.getContext('2d');c.scale(2,2);c.textBaseline='top';
        const walker=document.createTreeWalker(box,NodeFilter.SHOW_TEXT);let node;
        while((node=walker.nextNode())){const parent=node.parentElement;if(!parent||parent.closest('.signature-space,.sheet-signature-controls,.p-screen-only')||!node.textContent.trim())continue;const style=getComputedStyle(parent);c.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;c.fillStyle=style.color;const lines=new Map();for(let i=0;i<node.length;i++){const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);const r=range.getBoundingClientRect();if(!r.width||!r.height)continue;const y=Math.round((r.top-rect.top)/scale*10)/10,k=String(y);if(!lines.has(k))lines.set(k,{x:(r.left-rect.left)/scale,y,text:''});lines.get(k).text+=node.textContent[i];}for(const line of lines.values())c.fillText(style.textTransform==='uppercase'?line.text.toUpperCase():line.text,line.x,line.y);}
        box.querySelectorAll('.signature-name').forEach(el=>{const style=getComputedStyle(el),r=el.getBoundingClientRect();if(parseFloat(style.borderBottomWidth)>0){c.strokeStyle=style.borderBottomColor;c.lineWidth=parseFloat(style.borderBottomWidth);c.beginPath();c.moveTo((r.left-rect.left)/scale,(r.bottom-rect.top)/scale-1);c.lineTo((r.right-rect.left)/scale,(r.bottom-rect.top)/scale-1);c.stroke();}});
        const r=img.getBoundingClientRect(),iw=r.width/scale,ih=r.height/scale,fit=Math.min(iw/img.naturalWidth,ih/img.naturalHeight),dw=img.naturalWidth*fit,dh=img.naturalHeight*fit;c.drawImage(img,(r.left-rect.left)/scale,(r.top-rect.top)/scale+(ih-dh)/2,dw,dh);
        return {src:canvas.toDataURL('image/png'),width:w,height:h};
    }
    window.SheetSignatures = {read,restore,exportBox,
        install(options){this.ready=this.installForAccount(options);return this.ready;},
        async installForAccount({root, storageKey, onChange = () => {}}) {
            if (!root) return;
            const state=await window.WA?.get();storageKey='sheet-signatures-'+(state?.profile?.account?.id||'local')+'-'+storageKey;
            let saved = {};
            try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch (_) {}
            const notify = message => {
                document.querySelector('.sheet-signature-status')?.remove();
                const status = document.createElement('div');
                status.className = 'sheet-signature-status'; status.setAttribute('role', 'status'); status.textContent = message;
                document.body.appendChild(status); setTimeout(() => status.remove(), 5000);
            };
            const render = (slot, source) => {restore(slot,source);onChange();};
            root.querySelectorAll('[data-signature-slot]').forEach(slot => {
                const label = slot.dataset.signatureLabel || 'Tanda tangan';
                const img = document.createElement('img'); img.className = 'sheet-signature-image'; img.alt = label; img.hidden = true;
                img.addEventListener('load', onChange);
                const controls = document.createElement('div'); controls.className = 'sheet-signature-controls';
                const upload = document.createElement('button'); upload.type = 'button'; upload.className = 'sheet-signature-action'; upload.dataset.signatureUpload = ''; upload.setAttribute('aria-label', 'Unggah foto atau ' + label.toLowerCase());
                upload.title = 'Pilih gambar, atau tempel gambar dari clipboard pada blok tanda tangan yang dipilih.';
                const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'sheet-signature-action'; remove.dataset.signatureRemove = ''; remove.textContent = 'Hapus'; remove.setAttribute('aria-label', 'Hapus gambar ' + label.toLowerCase());
                const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp'; input.hidden = true; input.dataset.signatureFile = ''; input.setAttribute('aria-label', 'Berkas gambar ' + label.toLowerCase());
                const position=document.createElement('button');position.type='button';position.className='sheet-signature-action';position.dataset.signaturePosition='';position.textContent='Atur posisi';controls.append(upload,position,remove,input); slot.replaceChildren(img, controls);
                render(slot,saved[slot.dataset.signatureSlot]);
            });
            const persist = (slot, source) => {
                const next = {...saved};
                const value=layout(source);if (value.src) next[slot.dataset.signatureSlot] = value; else delete next[slot.dataset.signatureSlot];
                try { localStorage.setItem(storageKey, JSON.stringify(next)); }
                catch (_) { notify('Gambar belum tersimpan. Penyimpanan browser penuh atau tidak tersedia; pilih gambar lebih kecil.'); return false; }
                saved = next; render(slot, source); document.dispatchEvent(new Event('sheet-signature-changed')); return true;
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
                    if (persist(slot,{src:source,x:0,y:24,scale:100})) notify('PNG transparan dapat menimpa nama. Seret gambar atau pilih Atur posisi.');
                } catch (_) { notify('Gambar tidak dapat dibaca. Pilih berkas gambar lain.'); }
                finally { URL.revokeObjectURL(url); }
            };
            function positionDialog(slot){
                const d=window.PresenUI?.dialog('Posisi tanda tangan','<p>Gambar melayang di atas nama; teks dan tabel tidak digeser. PNG transparan mempertahankan latarnya.</p><label>Geser kiri / kanan<input data-sign-x type="range" min="-100" max="100"></label><label>Geser atas / bawah<input data-sign-y type="range" min="-20" max="80"></label><label>Ukuran (%)<input data-sign-scale type="range" min="25" max="200"></label><div class="p-actions"><button type="button" data-sign-overlay>Timpa area nama</button><button type="button" data-sign-reset>Posisi semula</button></div>');if(!d)return;d.classList.add('p-screen-only');let timer;const refresh=()=>{const v=read(slot);for(const k of ['x','y','scale'])d.querySelector('[data-sign-'+k+']').value=v[k];};refresh();d.oninput=()=>{const v=read(slot);for(const k of ['x','y','scale'])v[k]=Number(d.querySelector('[data-sign-'+k+']').value);restore(slot,v);clearTimeout(timer);timer=setTimeout(()=>persist(slot,read(slot)),150);};d.querySelector('[data-sign-overlay]').onclick=()=>{persist(slot,{...read(slot),x:0,y:24,scale:100});refresh();};d.querySelector('[data-sign-reset]').onclick=()=>{persist(slot,{...read(slot),x:0,y:0,scale:100});refresh();};d.addEventListener('close',()=>{clearTimeout(timer);persist(slot,read(slot));});
            }
            let dragging;
            root.addEventListener('pointerdown',event=>{const img=event.target.closest('.sheet-signature-image');if(!img||img.hidden||event.button!==0)return;event.preventDefault();event.stopPropagation();const slot=img.closest('[data-signature-slot]'),zoom=root.getBoundingClientRect().width/root.offsetWidth||1;dragging={slot,value:read(slot),x:event.clientX,y:event.clientY,zoom};img.setPointerCapture(event.pointerId);});
            root.addEventListener('pointermove',event=>{if(!dragging)return;restore(dragging.slot,{...dragging.value,x:dragging.value.x+(event.clientX-dragging.x)/dragging.zoom,y:dragging.value.y+(event.clientY-dragging.y)/dragging.zoom});});
            const endDrag=()=>{if(!dragging)return;persist(dragging.slot,read(dragging.slot));dragging=null;};root.addEventListener('pointerup',endDrag);root.addEventListener('pointercancel',endDrag);
            // Delegasi tetap bekerja setelah Undo/Redo mengganti isi kertas.
            root.addEventListener('click', event => {
                const action = event.target.closest('[data-signature-upload], [data-signature-remove], [data-signature-position]');
                if (!action) return;
                const slot = action.closest('[data-signature-slot]');
                event.preventDefault(); event.stopPropagation();
                if (action.hasAttribute('data-signature-upload')) slot.querySelector('[data-signature-file]').click();
                else if(action.hasAttribute('data-signature-position'))positionDialog(slot);else persist(slot, '');
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
