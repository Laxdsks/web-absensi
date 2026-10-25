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
function tableItems(table){return [...table.querySelectorAll('th,td')].filter(cell=>!cell.closest('.page-preview-only')&&!cell.classList.contains('empty-note')&&!cell.classList.contains('date-entry')).flatMap(cell=>cell.querySelector('input')?[...cell.querySelectorAll('input')]:[cell]);}
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
 attendanceWidths(base);examWidths(base);window.WAFitAttendanceDates?.();
 paper.querySelectorAll('input.attendance-cell').forEach(input=>{
  const present=input.value.trim()==='.',cell=input.closest('td');input.classList.toggle('wa-presence-dot',present);
  let ink=cell.querySelector('.wa-presence-ink');
  if(present&&!ink){ink=document.createElementNS('http://www.w3.org/2000/svg','svg');ink.classList.add('wa-presence-ink');ink.setAttribute('viewBox','0 0 10 10');ink.setAttribute('aria-hidden','true');const circle=document.createElementNS(ink.namespaceURI,'circle');circle.setAttribute('cx','5');circle.setAttribute('cy','5');circle.setAttribute('r','5');circle.setAttribute('fill','currentColor');ink.append(circle);cell.append(ink);}
  if(ink){ink.style.display=present?'block':'none';ink.style.color=getComputedStyle(input).color;const diameter=Math.max(1,Math.min(5,base*.38,input.clientWidth-4,input.clientHeight-4));ink.style.width=ink.style.height=diameter+'px';}
 });
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
   if(cell.matches('.date-entry')||cell.closest('.doc-header,.export-header,.doc-signatures,.export-signatures'))return;
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

/* Meeting date editor: large touch controls, compact printable date cells. */
(()=>{
'use strict';if(!document.getElementById('tabelAbsen'))return;
let active=null,activeInput=null;document.addEventListener('focusin',e=>{if(e.target.matches('#subHeaderPertemuan .date-entry')){active=e.target;activeInput=null;}else if(e.target.matches('#paperSheet input:not([type=file])')){activeInput=e.target;active=null;}});
const months={jan:'01',januari:'01',feb:'02',februari:'02',mar:'03',maret:'03',apr:'04',april:'04',mei:'05',jun:'06',juni:'06',jul:'07',juli:'07',agu:'08',ags:'08',aug:'08',agustus:'08',sep:'09',september:'09',okt:'10',oktober:'10',nov:'11',november:'11',des:'12',desember:'12'};
const compactDate=value=>{const clean=String(value||'').trim().replace(/\s+/g,' '),m=clean.match(/^(\d{1,2})[\s/.-]+([a-z]+|\d{1,2})[\s/.-]+(\d{2}|\d{4})$/i);return m?m[1].padStart(2,'0')+'/'+(months[m[2].toLowerCase()]||m[2].padStart(2,'0'))+'/'+m[3].slice(-2):clean;};
function dateFromText(text,reference){const match=compactDate(text).match(/^(\d{2})\/(\d{2})\/(\d{2})$/),full=String(text).trim().match(/(?:^|[\s/.-])(\d{4})$/);if(!match)return '';const year=full?Number(full[1]):Math.floor(Number((reference||WA.day()).slice(0,4))/100)*100+Number(match[3]),month=Number(match[2]),day=Number(match[1]),date=new Date(Date.UTC(year,month-1,day));return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?String(year)+'-'+match[2]+'-'+match[1]:'';}
function sheetDatePoint(){return Math.max(2,Math.min(72,Math.round((Number(document.getElementById('fontSizeSelect')?.value)||9)*1.2)/2));}
const dateFormatKeys=['color','fontWeight','fontStyle','textDecoration'];
function dateFormat(cell){return Object.fromEntries(dateFormatKeys.map(key=>[key,cell.style[key]||({color:'#111',fontWeight:'normal',fontStyle:'normal',textDecoration:'none'}[key])]));}
function commonDateFormat(){try{const value=JSON.parse(document.getElementById('headerPertemuan')?.dataset.dateDefaultFormat||'null');return value&&typeof value==='object'?value:null;}catch(_){return null;}}
function setDateFormat(patch){
 const header=document.getElementById('headerPertemuan'),format={...(commonDateFormat()||dateFormat(active||document.querySelector('.date-entry'))),...patch};
 if(header)header.dataset.dateDefaultFormat=JSON.stringify(format);
 for(const target of document.querySelectorAll('#subHeaderPertemuan .date-entry'))for(const key of dateFormatKeys)if(typeof format[key]==='string')target.style[key]=format[key];
}
window.WAFitAttendanceDates=()=>{const defaults=document.getElementById('headerPertemuan')?.dataset||{};document.querySelectorAll('#subHeaderPertemuan .date-entry').forEach((cell,index)=>{
 if(!cell.dataset.dateSize&&defaults.dateDefaultSize){cell.dataset.dateSize=defaults.dateDefaultSize;cell.dataset.dateSizeMode=defaults.dateDefaultMode||'manual';}
 const format=commonDateFormat();if(format)for(const key of dateFormatKeys)if(typeof format[key]==='string')cell.style[key]=format[key];
 const value=compactDate(cell.textContent);let label=cell.querySelector('.wa-date-label');if(!label||cell.childNodes.length!==1){label=document.createElement('span');label.className='wa-date-label';cell.replaceChildren(label);}if(label.textContent!==value)label.textContent=value;
 cell.style.setProperty('--wa-date-color',cell.style.color||'#111');cell.contentEditable='false';cell.tabIndex=0;cell.setAttribute('role','button');cell.setAttribute('aria-label','Tanggal pertemuan '+(index+1)+(cell.dataset.attendanceDate?': '+cell.dataset.attendanceDate:value?': '+value:''));cell.title=(cell.dataset.attendanceDate||value||'Belum ada tanggal')+' · Ketuk untuk mengedit tanggal';
 const size=Math.max(12,cell.offsetWidth);cell.style.setProperty('--wa-date-cell',size+'px');
 const point=cell.dataset.dateSizeMode==='manual'?(Number(cell.dataset.dateSize)||6):sheetDatePoint(),preferred=Math.max(2,Math.min(72,point))*4/3;cell.style.setProperty('--wa-date-font',preferred+'px');label.style.setProperty('font-size',preferred+'px','important');
});};
function changed(cell){window.WAFitAttendanceDates();if(cell.matches('input'))document.dispatchEvent(new Event('sheet-position-changed'));else cell.dispatchEvent(new Event('input',{bubbles:true}));window.perbaruiPenandaHalaman?.();}
window.WASetMeetingDate=(session,persist=true)=>{const cell=document.querySelectorAll('#subHeaderPertemuan .date-entry')[Number(session.slot)-1];if(!cell||!/^\d{4}-\d{2}-\d{2}$/.test(session.day||''))return;const [year,month,day]=session.day.split('-');delete cell.dataset.dateManual;cell.dataset.attendanceDate=session.day;cell.dataset.dateSize=cell.dataset.dateSize||document.getElementById('headerPertemuan')?.dataset.dateDefaultSize||'6';cell.dataset.dateSizeMode=cell.dataset.dateSizeMode||document.getElementById('headerPertemuan')?.dataset.dateDefaultMode||'sync';cell.textContent=day+'/'+month+'/'+year.slice(-2);if(persist)changed(cell);else window.WAFitAttendanceDates();};

let dateRefresh=0;
async function restoreSessionDates(){const generation=++dateRefresh;try{const state=await WA.get();if(state.profile?.role!=='teacher')return;const query=Object.fromEntries(new URLSearchParams(location.search)),context={...state.selection,...query},scope=await WA.scope(context,query.matkul??state.selection?.matkul??'');if(generation!==dateRefresh)return;for(const session of state.snapshot.sessions.filter(x=>x.scope===scope)){const cell=document.querySelectorAll('#subHeaderPertemuan .date-entry')[Number(session.slot)-1];if(cell&&!cell.textContent.trim()&&!cell.dataset.dateManual)window.WASetMeetingDate(session,false);}}catch(_){} }
WA.on(()=>void restoreSessionDates());window.addEventListener('pageshow',()=>void restoreSessionDates());void restoreSessionDates();
function edit(cell){active=cell;const index=[...cell.parentElement.children].indexOf(cell)+1;
 const d=window.PresenUI?.dialog('Tanggal pertemuan '+index,'<form id="meetingDateForm"><p>Pilih tanggal atau edit teksnya langsung, misalnya 25/10/26. Isi tanggal berlaku untuk pertemuan yang dipilih. Ukuran, warna, tebal, miring dan garis bawah diseragamkan ke seluruh pertemuan.</p><label>Pertemuan<select name="slot"></select></label><label>Pilih tanggal<input name="date" type="date"></label><label>Teks di kotak tanggal<input name="dateText" type="text" maxlength="90" placeholder="25/10/26"></label><label class="date-size-sync"><input name="syncSize" type="checkbox"> Ikuti ukuran huruf lembar</label><label>Ukuran huruf tanggal (pt)<input name="size" type="number" min="2" max="72" step="0.5" required></label><label>Warna teks<input name="color" type="color"></label><div class="date-formats"><label><input name="bold" type="checkbox"> Tebal</label><label><input name="italic" type="checkbox"> Miring</label><label><input name="underline" type="checkbox"> Garis bawah</label></div><p class="small">Format tanggal berlaku untuk semua pertemuan, termasuk kolom baru. Ukuran tabel dan kolom tetap. Tombol B, I, U dan warna di bilah alat juga mengubah format seluruh tanggal saat tanggal dipilih.</p><div class="p-actions"><button class="p-primary" type="submit">Simpan tanggal</button><button type="button" data-clear-date>Kosongkan</button></div></form>');if(!d)return;d.classList.add('sheet-date-dialog','p-screen-only');const form=d.querySelector('form');form.elements.date.value=cell.dataset.attendanceDate||'';form.elements.size.value=cell.dataset.dateSize||6;
 form.elements.date.oninput=()=>{const value=form.elements.date.value;if(/^\d{4}-\d{2}-\d{2}$/.test(value))form.elements.dateText.value=compactDate(value.split('-').reverse().join('/'));};
 form.elements.syncSize.onchange=()=>{if(form.elements.syncSize.checked)form.elements.size.value=String(sheetDatePoint());};form.elements.size.oninput=()=>{form.elements.syncSize.checked=false;};
 function load(){form.elements.syncSize.checked=cell.dataset.dateSizeMode!=='manual';const style=getComputedStyle(cell),rgb=style.color.match(/\d+/g);form.elements.date.value=cell.dataset.attendanceDate||'';form.elements.dateText.value=cell.textContent.trim();form.elements.size.value=form.elements.syncSize.checked?String(sheetDatePoint()):(cell.dataset.dateSize||6);form.elements.color.value=rgb?'#'+rgb.slice(0,3).map(v=>Number(v).toString(16).padStart(2,'0')).join(''):'#000000';form.elements.bold.checked=Number(style.fontWeight)>=600;form.elements.italic.checked=style.fontStyle==='italic';form.elements.underline.checked=style.textDecorationLine.includes('underline');}load();const cells=[...document.querySelectorAll('#subHeaderPertemuan .date-entry')];cells.forEach((_,i)=>form.elements.slot.add(new Option('Pertemuan '+(i+1),String(i))));form.elements.slot.value=String(index-1);form.elements.slot.onchange=()=>{const pending=Object.fromEntries(['size','syncSize','color','bold','italic','underline'].map(name=>[name,form.elements[name].type==='checkbox'?form.elements[name].checked:form.elements[name].value]));cell=cells[Number(form.elements.slot.value)];active=cell;load();for(const[name,value]of Object.entries(pending))form.elements[name][form.elements[name].type==='checkbox'?'checked':'value']=value;};
 form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity())return;const value=dateFromText(form.elements.dateText.value,form.elements.date.value);window.simpanStateUndo?.();if(/^\d{4}-\d{2}-\d{2}$/.test(value))cell.dataset.attendanceDate=value;else delete cell.dataset.attendanceDate;cell.dataset.dateManual='1';const defaults=document.getElementById('headerPertemuan');defaults.dataset.dateDefaultSize=form.elements.size.value;defaults.dataset.dateDefaultMode=form.elements.syncSize.checked?'sync':'manual';for(const target of cells){target.dataset.dateSizeMode=defaults.dataset.dateDefaultMode;target.dataset.dateSize=form.elements.size.value;}cell.textContent=compactDate(form.elements.dateText.value);setDateFormat({color:form.elements.color.value,fontWeight:form.elements.bold.checked?'bold':'normal',fontStyle:form.elements.italic.checked?'italic':'normal',textDecoration:form.elements.underline.checked?'underline':'none'});d.close();changed(cell);cell.focus({preventScroll:true});};
 d.querySelector('[data-clear-date]').onclick=()=>{window.simpanStateUndo?.();delete cell.dataset.attendanceDate;cell.dataset.dateManual='1';cell.textContent='';d.close();changed(cell);cell.focus({preventScroll:true});};
}
document.addEventListener('click',e=>{const cell=e.target.closest('#subHeaderPertemuan .date-entry');if(cell){activeInput=null;e.preventDefault();e.stopPropagation();edit(cell);}else if(e.target.closest('#paperSheet')){active=null;if(!e.target.matches('input'))activeInput=null;}},true);
document.addEventListener('keydown',e=>{if(e.target.matches('#subHeaderPertemuan .date-entry')&&['Enter',' '].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();edit(e.target);}},true);
const oldFormat=window.formatTeksWord,oldColor=window.formatWarnaTeks;
window.formatTeksWord=command=>{const property={bold:'fontWeight',italic:'fontStyle',underline:'textDecoration'}[command];if(active?.isConnected&&property){window.simpanStateUndo?.();const enabled={bold:'bold',italic:'italic',underline:'underline'}[command],disabled=command==='underline'?'none':'normal';setDateFormat({[property]:active.style[property]===enabled?disabled:enabled});changed(active);return;}if(activeInput?.isConnected&&property){window.simpanStateUndo?.();const enabled={bold:'bold',italic:'italic',underline:'underline'}[command];activeInput.style[property]=activeInput.style[property]===enabled?(command==='underline'?'none':'normal'):enabled;changed(activeInput);return;}return oldFormat?.(command);};
window.formatWarnaTeks=color=>{if(active?.isConnected){window.simpanStateUndo?.();setDateFormat({color});changed(active);return;}if(activeInput?.isConnected){window.simpanStateUndo?.();activeInput.style.color=color;changed(activeInput);return;}return oldColor?.(color);};
const button=document.createElement('button');button.type='button';button.id='sheetDateSettings';button.className='btn btn-dark';button.textContent='Tanggal pertemuan';button.onclick=()=>edit(active?.isConnected?active:document.querySelector('#subHeaderPertemuan .date-entry'));document.querySelector('#fontSizeSelect')?.closest('label').after(button);
window.WAFitAttendanceDates();
})();
