/* Fit text without changing data, column order, or the original sheet layout. */
(()=>{
'use strict';const paper=document.querySelector('#paperSheet,#paper');if(!paper)return;const tables='#tabelAbsen,#examTableBlock table,#examScaleBlock table,#tabelRekapNilai';const single='.meta-label,.meta-val,.meta-value,.institution .line,.institution .contact,.header-text>*';const ctx=document.createElement('canvas').getContext('2d'),sizes=new WeakMap();let scheduled=false,running=false;
function text(el){return (el.matches('input')?el.value:el.textContent||'').replace(/\s+/g,' ').trim();}
function available(el){const s=getComputedStyle(el);return el.clientWidth-parseFloat(s.paddingLeft||0)-parseFloat(s.paddingRight||0);}
function measure(el,value,size){const s=getComputedStyle(el);ctx.font=`${s.fontStyle} ${s.fontWeight} ${size||parseFloat(s.fontSize)}px ${s.fontFamily}`;return ctx.measureText(s.textTransform==='uppercase'?value.toUpperCase():value).width;}
function fit(el){if(!el.getClientRects().length)return;const value=text(el);if(!value)return;const previous=sizes.get(el)||(el.hasAttribute('data-wa-fit-font')?{value:el.dataset.waFitFont,priority:el.dataset.waFitPriority||''}:null);if(previous)el.style.setProperty('font-size',previous.value,previous.priority);const style=getComputedStyle(el),base=parseFloat(style.fontSize),width=available(el);if(width<4)return;const needed=measure(el,value,base);if(needed>width-2){if(!previous){const original={value:el.style.getPropertyValue('font-size'),priority:el.style.getPropertyPriority('font-size')};sizes.set(el,original);el.dataset.waFitFont=original.value;el.dataset.waFitPriority=original.priority;}const size=Math.max(4,Math.floor(base*(width-2)/needed*100)/100);el.style.setProperty('font-size',size+'px','important');el.title=value;}else if(previous){sizes.delete(el);delete el.dataset.waFitFont;delete el.dataset.waFitPriority;}}
function prepareTable(table){table.querySelectorAll('th br').forEach(br=>br.replaceWith(document.createTextNode(' ')));if(table.id==='tabelRekapNilai'){
 const header=table.tHead,rows=Array.from(table.tBodies[0]?.rows||[]),cols=Array.from(table.querySelectorAll('colgroup col'));
 const leaf=[];let index=0;for(const cell of header.rows[0].cells){if(cell.rowSpan>1)leaf[index]=cell;index+=cell.colSpan;}
 index=0;for(const cell of header.rows[1].cells){while(leaf[index])index++;leaf[index++]=cell;}
 const font=Math.max(11,parseFloat(getComputedStyle(table).fontSize)),widths=leaf.map((cell,i)=>Math.ceil(Math.max(i===1?210:i===2?145:60,measure(cell,text(cell),font)+20,...rows.map(row=>{const item=row.cells[i];return item?.querySelector('input')?70:measure(item,text(item),font)+20;}))));
 const printing=matchMedia('print').matches&&document.body.classList.contains('cetak-rekap'),total=widths.reduce((a,b)=>a+b,0);
 cols.forEach((col,i)=>{col.style.width=printing?widths[i]/total*100+'%':widths[i]+'px';});table.style.width=printing?'100%':total+'px';table.style.minWidth=printing?'0':total+'px';

 }
}
function restoreSize(el){const previous=sizes.get(el)||(el.hasAttribute('data-wa-fit-font')?{value:el.dataset.waFitFont,priority:el.dataset.waFitPriority||''}:null);if(previous)el.style.setProperty('font-size',previous.value,previous.priority);sizes.delete(el);delete el.dataset.waFitFont;delete el.dataset.waFitPriority;}
function bodySize(){const field=document.getElementById('fontSizeSelect')||document.getElementById('examFontSize');return Math.max(1,Math.min(100,Number(field?.value)||8.5))*4/3;}
function tableItems(table){return [...table.querySelectorAll('th,td')].filter(cell=>!cell.closest('.page-preview-only')&&!cell.classList.contains('empty-note')).flatMap(cell=>cell.querySelector('input')?[...cell.querySelectorAll('input')]:[cell]);}
function commonFont(items,base){return Math.max(Math.min(4,base),Math.min(base,...items.filter(el=>el.getClientRects().length&&text(el)&&available(el)>3).map(el=>Math.floor(base*(available(el)-2)/Math.max(1,measure(el,text(el),base))*100)/100)));}
function attendanceWidths(base){
 const table=document.getElementById('tabelAbsen'),head=table?.tHead?.rows[0];if(!head||head.cells.length!==6)return;
 const width=table.parentElement.clientWidth,count=Number(document.getElementById('headerPertemuan')?.colSpan)||16;
 const widest=(selector,minimum)=>Math.max(minimum,...[...table.querySelectorAll(selector)].map(el=>measure(el,text(el),base)+20));
 const no=Math.max(28,measure(head.cells[0],text(head.cells[0]),base)+18),sex=Math.max(28,measure(head.cells[3],text(head.cells[3]),base)+18),ket=Math.max(30,measure(head.cells[5],text(head.cells[5]),base)+18);
 const nim=Math.min(width*.28,widest('.nim-input',96)),nameSpace=width-no-sex-ket-nim;
 const name=Math.min(Math.max(100,nameSpace-count*12),Math.max(150,widest('.name-input',150))),values=[no,nim,name,sex,Math.max(count*12,nameSpace-name),ket];
 table.style.tableLayout='fixed';[...head.cells].forEach((cell,i)=>{cell.style.width=values[i]/width*100+'%';cell.style.minWidth='0';});
}
function examWidths(base){
 const table=paper.querySelector('#examTableBlock table');if(table){
  const width=table.parentElement.clientWidth,rows=[...table.querySelectorAll('tbody tr:not(.page-preview-only)')];
  const needed=(i,min)=>Math.max(min,...rows.map(row=>row.cells[i]?measure(row.cells[i],text(row.cells[i]),base)+20:min));
  const nim=needed(1,100),name=needed(2,175),fixed=[56,nim,name,50,55,55,40],total=fixed.reduce((a,b)=>a+b,0);
  const extra=Math.max(0,width-total);fixed[2]+=extra*.7;fixed[6]+=extra*.3;
  table.querySelectorAll('colgroup col').forEach((col,i)=>col.style.width=fixed[i]/Math.max(width,total)*100+'%');
 }
 const scale=paper.querySelector('.grading-scale');if(scale){
  const table=scale.querySelector('table'),widths=[];for(let i=0;i<4;i++)widths.push(Math.max(60,...[...scale.querySelectorAll('tr')].map(row=>row.cells[i]?measure(row.cells[i],text(row.cells[i]),base)+18:0)));
  const total=widths.reduce((a,b)=>a+b,0);scale.style.width=Math.max(320,total)+'px';
  let group=table.querySelector('colgroup');if(!group){group=document.createElement('colgroup');for(let i=0;i<4;i++)group.append(document.createElement('col'));table.prepend(group);}group.querySelectorAll('col').forEach((col,i)=>col.style.width=widths[i]/total*100+'%');
 }

}
function update(){scheduled=false;if(running)return;running=true;try{
 const primary=[...paper.querySelectorAll('#tabelAbsen,#examTableBlock table,#examScaleBlock table')],base=bodySize(),meta=[...paper.querySelectorAll('.meta-label,.meta-val,.meta-value')];
 const items=primary.flatMap(tableItems);[...items,...meta].forEach(restoreSize);paper.style.setProperty('--wa-sheet-body-font',base+'px');items.forEach(el=>el.style.setProperty('font-size',base+'px','important'));
 attendanceWidths(base);examWidths(base);
 // A narrow label must never reduce the body font of the entire document.
 // The selected point size is authoritative; only long metadata values fit locally.
 meta.filter(el=>!el.matches('.meta-label')).forEach(fit);
 for(const el of items)if(text(el))el.title=text(el);
 paper.querySelectorAll('.institution .line,.institution .contact,.header-text>*').forEach(fit);
 const recap=document.querySelector('#tabelRekapNilai');if(recap&&recap.getClientRects().length){prepareTable(recap);const cells=tableItems(recap);cells.forEach(restoreSize);const size=commonFont(cells,12);for(const el of cells)el.style.setProperty('font-size',size+'px','important');}
 window.pastikanJarakTandaTangan?.();
 }finally{running=false;}}
// Measure generated Office markup at its actual paper width before saving it.
window.WAFitExportHTML=(html,width)=>{
 const frame=document.createElement('iframe');frame.setAttribute('aria-hidden','true');frame.setAttribute('sandbox','allow-same-origin');frame.style.cssText=`position:fixed;left:-100000px;top:0;width:${width}px;height:100px;visibility:hidden;pointer-events:none`;document.body.appendChild(frame);
 try{const doc=frame.contentDocument;doc.open();doc.write(html);doc.close();doc.body.style.width=width+'px';
  const fitExport=(el,limit)=>{const value=text(el);if(!value)return;const style=frame.contentWindow.getComputedStyle(el),base=parseFloat(style.fontSize);ctx.font=`${style.fontStyle} ${style.fontWeight} ${base}px ${style.fontFamily}`;const needed=ctx.measureText(style.textTransform==='uppercase'?value.toUpperCase():value).width;
   if(needed>limit-2){for(const node of [el,...el.querySelectorAll('span,p,small')]){node.style.whiteSpace='normal';node.style.overflowWrap='anywhere';node.style.wordBreak='break-word';node.style.lineHeight='1.3';node.style.setProperty('mso-line-height-rule','at-least');}}else el.style.whiteSpace='nowrap';};
  doc.querySelectorAll('th,td').forEach(cell=>{const style=frame.contentWindow.getComputedStyle(cell),space=cell.clientWidth-parseFloat(style.paddingLeft||0)-parseFloat(style.paddingRight||0);
   if(cell.closest('.doc-header,.export-header,.doc-signatures,.export-signatures'))return;
   if(cell.closest('.doc-meta')){cell.querySelectorAll('p>span').forEach(row=>{const value=row.lastElementChild;if(value){const label=row.firstElementChild.getBoundingClientRect().width,colon=row.children[1]?.getBoundingClientRect().width||0;fitExport(value,space-label-colon-12);}});return;}fitExport(cell,space);
  });
  return '<!doctype html>'+doc.documentElement.outerHTML;
 }finally{frame.remove();}
};
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(update);}window.WAFitSheetText=update;
const observer=new MutationObserver(records=>{if(records.some(r=>r.type==='characterData'||r.type==='childList'))schedule();});observer.observe(paper,{subtree:true,childList:true,characterData:true});const recap=document.querySelector('#tabelRekapNilai');if(recap)observer.observe(recap,{subtree:true,childList:true,characterData:true});
document.addEventListener('input',e=>{if(e.target.closest('#paperSheet,#paper,#tabelRekapNilai'))schedule();});document.addEventListener('change',schedule);window.addEventListener('resize',schedule);window.addEventListener('beforeprint',update);matchMedia('print').addEventListener('change',schedule);document.fonts?.ready.then(schedule);new ResizeObserver(schedule).observe(paper);window.WA?.on(schedule);
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('[contenteditable="true"]')&&e.target.closest('#paperSheet,#paper')){e.preventDefault();document.execCommand('insertText',false,' ');schedule();}});
document.addEventListener('paste',e=>{if(e.target.matches('[contenteditable="true"]')&&e.target.closest('#paperSheet,#paper')){const value=e.clipboardData?.getData('text/plain');if(value!=null){e.preventDefault();document.execCommand('insertText',false,value.replace(/\s+/g,' '));schedule();}}});
async function sizeControls(){
 const field=document.getElementById('fontSizeSelect')||document.getElementById('examFontSize');if(!field)return;
 let state;try{state=await window.WA?.get();}catch(_){}
 const query=Object.fromEntries(new URLSearchParams(location.search)),selection={...state?.selection,...query},owner=state?.profile?.account?.id||'local';
 const key='presen-sheet-size-'+encodeURIComponent(JSON.stringify([owner,selection.prodi,selection.semester,selection.kelas,selection.year,selection.period,selection.matkul||'']));
 const normalize=value=>({waLayoutVersion:2,pt:Math.max(1,Math.min(100,Number(value?.pt)||9)),rowPadding:Math.max(0,Math.min(8,Number(value?.rowPadding??2))),signatureGap:Math.max(12,Math.min(100,Number(value?.signatureGap)||24)),scaleImages:!!value?.scaleImages,updatedAt:Number(value?.updatedAt)||0});
 let settings=normalize(),signatureHeight=parseFloat(getComputedStyle(paper.querySelector('.signature-space')||paper).height)||72;
 let saved;try{saved=JSON.parse(localStorage.getItem(key)||'null');}catch(_){}
 if(saved){settings=normalize(saved);if(saved.compact&&!saved.waLayoutVersion)settings.pt=Math.max(9,settings.pt);}
 const scope=state?.profile?await WA.scope(selection,selection.matkul||''):null;
 function printPaper(){
  const formats={a4:[210,297],folio:[215.9,330],letter:[215.9,279.4]},choice=document.getElementById('paperSize')?.value||'a4';
  let [w,h]=formats[choice]||formats.a4;if(document.getElementById('paperOrientation')?.value==='landscape')[w,h]=[h,w];
  paper.style.setProperty('--wa-print-width',w+'mm');paper.dataset.pageHeightMm=String(h);
  let style=document.getElementById('sheetPrintPage');if(!style){style=document.createElement('style');style.id='sheetPrintPage';style.media='print';document.head.append(style);}style.textContent='@page{size:'+w+'mm '+h+'mm;margin:0}';
 }
 printPaper();document.addEventListener('change',e=>{if(e.target.matches('#paperSize,#paperOrientation'))printPaper();});window.addEventListener('beforeprint',printPaper);

 function apply(value){
  settings=normalize(value);field.value=String(settings.pt);paper.classList.remove('wa-fit-35');
  paper.style.setProperty('--global-font-size',settings.pt*4/3+'px');paper.style.setProperty('--exam-font-scale',String(settings.pt/9));
  paper.style.setProperty('--wa-row-padding',settings.rowPadding+'px');paper.style.setProperty('--wa-signature-gap',settings.signatureGap+'px');
  paper.style.setProperty('--wa-image-scale',settings.scaleImages?settings.pt/9:1);paper.classList.toggle('wa-scale-images',settings.scaleImages);
  paper.style.setProperty('--wa-base-signature-height',signatureHeight+'px');update();
  requestAnimationFrame(()=>{window.perbaruiPenandaHalaman?.();window.perbaruiPenandaHalamanUjian?.();});
 }
 apply(settings);
 async function restore(){const snapshot=(await WA.get())?.snapshot,remote=snapshot?.documents.find(d=>d.scope===scope&&d.kind==='attendance-layout')?.content;if(remote?.waLayoutVersion===2&&remote.updatedAt>settings.updatedAt){apply(remote);localStorage.setItem(key,JSON.stringify(settings));}}
 if(scope){await restore();WA.on(()=>{void restore();});}
 function save(){settings.pt=Number(field.value)||9;settings.updatedAt=Date.now();apply(settings);localStorage.setItem(key,JSON.stringify(settings));if(scope)void WA.saveDocument(selection,selection.matkul||'','attendance-layout',settings);}
 field.addEventListener('input',save);field.addEventListener('change',save);
 const button=document.createElement('button');button.type='button';button.id='sheetLayoutSettings';button.className='btn btn-dark';button.textContent='Tata letak';button.title='Atur jarak baris, ruang tanda tangan, dan skala gambar';field.closest('label').after(button);
 button.onclick=()=>{
  const d=window.PresenUI?.dialog('Tata letak lembar','<p>Ukuran pada bilah alat mengatur teks tabel, identitas, dan tanda tangan. Kop mengikuti ukuran itu secara proporsional. Jumlah mahasiswa tidak mengecilkan font otomatis.</p><label>Jarak baris tabel <span data-row-value></span><input id="sheetRowPadding" type="range" min="0" max="8" step="0.5"></label><label>Jarak sebelum tanda tangan <span data-gap-value></span><input id="sheetSignatureGap" type="range" min="12" max="100" step="2"></label><label class="sheet-layout-check"><input id="sheetScaleImages" type="checkbox"> Sesuaikan ukuran logo dan ruang gambar tanda tangan dengan font</label><p class="small">Tanda tangan PNG tetap dapat diatur posisinya. Jika isi melebihi kertas, cetak dilanjutkan ke halaman berikutnya tanpa mengecilkan teks.</p><button type="button" id="sheetLayoutReset">Pulihkan ukuran standar</button>');if(!d)return;d.classList.add('p-screen-only','sheet-layout-dialog');
  const refresh=()=>{d.querySelector('#sheetRowPadding').value=settings.rowPadding;d.querySelector('#sheetSignatureGap').value=settings.signatureGap;d.querySelector('#sheetScaleImages').checked=settings.scaleImages;d.querySelector('[data-row-value]').textContent=settings.rowPadding+' px';d.querySelector('[data-gap-value]').textContent=settings.signatureGap+' px';};refresh();
  d.addEventListener('input',()=>{settings.rowPadding=Number(d.querySelector('#sheetRowPadding').value);settings.signatureGap=Number(d.querySelector('#sheetSignatureGap').value);settings.scaleImages=d.querySelector('#sheetScaleImages').checked;save();refresh();});
  d.querySelector('#sheetLayoutReset').onclick=()=>{settings=normalize({updatedAt:Date.now()});field.value='9';save();refresh();};
 };
}
void sizeControls();schedule();
})();
