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
function uniform(elements){const items=[...elements].filter(x=>x.getClientRects().length&&text(x));if(!items.length)return;const font=Math.min(...items.map(x=>{const base=parseFloat(getComputedStyle(x).fontSize),needed=measure(x,text(x),base);return Math.min(base,Math.floor(base*(available(x)-3)/Math.max(needed,1)*100)/100);}));for(const el of items){if(!sizes.has(el)){const original={value:el.style.getPropertyValue('font-size'),priority:el.style.getPropertyPriority('font-size')};sizes.set(el,original);el.dataset.waFitFont=original.value;el.dataset.waFitPriority=original.priority;}el.style.setProperty('font-size',font+'px','important');}}
function restoreSize(el){const previous=sizes.get(el)||(el.hasAttribute('data-wa-fit-font')?{value:el.dataset.waFitFont,priority:el.dataset.waFitPriority||''}:null);if(previous)el.style.setProperty('font-size',previous.value,previous.priority);sizes.delete(el);delete el.dataset.waFitFont;delete el.dataset.waFitPriority;}
function bodySize(){const field=document.getElementById('fontSizeSelect')||document.getElementById('examFontSize');return Math.max(1,Math.min(100,Number(field?.value)||8.5))*4/3;}
function tableItems(table){return [...table.querySelectorAll('th,td')].filter(cell=>!cell.closest('.page-preview-only')&&!cell.classList.contains('empty-note')).flatMap(cell=>cell.querySelector('input')?[...cell.querySelectorAll('input')]:[cell]);}
function commonFont(items,base){return Math.max(Math.min(4,base),Math.min(base,...items.filter(el=>el.getClientRects().length&&text(el)&&available(el)>3).map(el=>Math.floor(base*(available(el)-2)/Math.max(1,measure(el,text(el),base))*100)/100)));}
function attendanceWidths(base){const table=document.getElementById('tabelAbsen'),head=table?.tHead?.rows[0];if(!head||head.cells.length!==6)return;const width=table.parentElement.clientWidth,count=Number(document.getElementById('headerPertemuan')?.colSpan)||16,nims=[...table.querySelectorAll('.nim-input')],no=Math.max(28,measure(head.cells[0],text(head.cells[0]),base)+15),sex=Math.max(28,measure(head.cells[3],text(head.cells[3]),base)+15),ket=Math.max(30,measure(head.cells[5],text(head.cells[5]),base)+15);const nim=Math.min(128,Math.max(86,...nims.map(el=>measure(el,text(el),base)+18))),name=Math.max(110,width-no-sex-ket-nim-count*18),values=[no,nim,name,sex,width-no-nim-name-sex-ket,ket];table.style.tableLayout='fixed';[...head.cells].forEach((cell,i)=>{cell.style.width=values[i]/width*100+'%';cell.style.minWidth='0';});}
function update(){scheduled=false;if(running)return;running=true;try{
 const primary=[...paper.querySelectorAll('#tabelAbsen,#examTableBlock table,#examScaleBlock table')],base=bodySize(),meta=[...paper.querySelectorAll('.meta-label,.meta-val,.meta-value')];
 const items=primary.flatMap(tableItems);[...items,...meta].forEach(restoreSize);paper.style.setProperty('--wa-sheet-body-font',base+'px');items.forEach(el=>el.style.setProperty('font-size',base+'px','important'));
 attendanceWidths(base);const font=commonFont([...items,...meta],base);paper.style.setProperty('--wa-sheet-body-font',font+'px');
 for(const el of items){el.style.setProperty('font-size',font+'px','important');if(text(el))el.title=text(el);}
 paper.querySelectorAll('.institution .line,.institution .contact,.header-text>*').forEach(fit);
 const recap=document.querySelector('#tabelRekapNilai');if(recap&&recap.getClientRects().length){prepareTable(recap);const cells=tableItems(recap);cells.forEach(restoreSize);const size=commonFont(cells,12);for(const el of cells)el.style.setProperty('font-size',size+'px','important');}
 window.pastikanJarakTandaTangan?.();
 }finally{running=false;}}
// Measure generated Office markup at its actual paper width before saving it.
window.WAFitExportHTML=(html,width)=>{
 const frame=document.createElement('iframe');frame.setAttribute('aria-hidden','true');frame.setAttribute('sandbox','allow-same-origin');frame.style.cssText=`position:fixed;left:-100000px;top:0;width:${width}px;height:100px;visibility:hidden;pointer-events:none`;document.body.appendChild(frame);
 try{const doc=frame.contentDocument;doc.open();doc.write(html);doc.close();doc.body.style.width=width+'px';
  const fitExport=(el,limit)=>{const value=text(el);if(!value)return;const style=frame.contentWindow.getComputedStyle(el),base=parseFloat(style.fontSize);ctx.font=`${style.fontStyle} ${style.fontWeight} ${base}px ${style.fontFamily}`;const needed=ctx.measureText(style.textTransform==='uppercase'?value.toUpperCase():value).width;
   if(needed>limit-2){const size=Math.max(3,Math.floor(base*(limit-2)/needed*100)/100);el.style.setProperty('font-size',size+'px','important');el.querySelectorAll('span,p,small').forEach(child=>{if(parseFloat(frame.contentWindow.getComputedStyle(child).fontSize)>size)child.style.setProperty('font-size',size+'px','important');});}el.style.whiteSpace='nowrap';};
  doc.querySelectorAll('th,td').forEach(cell=>{const style=frame.contentWindow.getComputedStyle(cell),space=cell.clientWidth-parseFloat(style.paddingLeft||0)-parseFloat(style.paddingRight||0);
   if(cell.closest('.doc-header,.export-header,.doc-signatures,.export-signatures'))return;
   if(cell.closest('.doc-meta')){cell.querySelectorAll('p>span').forEach(row=>{const value=row.lastElementChild;if(value){const label=row.firstElementChild.getBoundingClientRect().width,colon=row.children[1]?.getBoundingClientRect().width||0;fitExport(value,space-label-colon-12);}});return;}fitExport(cell,space);
  });
  doc.querySelectorAll('table').forEach(table=>{if(table.matches('.doc-header,.export-header,.doc-meta,.export-meta,.doc-signatures,.export-signatures'))return;const cells=[...table.querySelectorAll('th,td')].filter(el=>el.closest('table')===table);if(!cells.length)return;const size=Math.min(...cells.map(el=>parseFloat(frame.contentWindow.getComputedStyle(el).fontSize)));for(const cell of cells){cell.style.setProperty('font-size',size+'px','important');cell.querySelectorAll('span,p,small').forEach(el=>el.style.setProperty('font-size',size+'px','important'));}});
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
 const applySize=(pt,compact)=>{field.value=String(pt);paper.style.setProperty('--global-font-size',pt*4/3+'px');paper.style.setProperty('--exam-font-scale',String(pt/9));paper.classList.toggle('wa-fit-35',!!compact);update();requestAnimationFrame(()=>{window.perbaruiPenandaHalaman?.();window.perbaruiPenandaHalamanUjian?.();});};
 try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved)applySize(Math.max(1,Math.min(100,Number(saved.pt)||8)),saved.compact);}catch(_){}
 const save=()=>{const pt=Math.max(1,Math.min(100,Number(field.value)||8.5));applySize(pt,paper.classList.contains('wa-fit-35'));localStorage.setItem(key,JSON.stringify({pt,compact:paper.classList.contains('wa-fit-35')}));};
 field.addEventListener('change',save);
 const button=document.createElement('button');button.type='button';button.id='fit35Students';button.className='btn btn-dark';button.textContent='Muat 35 mahasiswa';button.title='Ukuran seragam 8 pt dan baris ringkas; sesuaikan lagi melalui Ukuran';field.closest('label').after(button);
 button.onclick=()=>{paper.classList.add('wa-fit-35');field.value='8';save();};
}
void sizeControls();schedule();
})();
