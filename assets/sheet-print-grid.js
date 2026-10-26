/* One vector edge per table boundary. CSS border space is retained, but its
   ink is hidden while these strokes print, so borders never stack or thicken. */
(()=>{
 'use strict';
 const selector='#tabelAbsen,#examTableBlock table,#examScaleBlock table,#tabelRekapNilai,#rekapModalOverlay .grade-rubric';
 const ns='http://www.w3.org/2000/svg';let drawing=false;
 document.documentElement.classList.add('wa-vector-print-ready');
 function clear(){document.querySelectorAll('.wa-print-grid').forEach(svg=>svg.remove());document.querySelectorAll('[data-wa-print-grid-host]').forEach(cell=>cell.removeAttribute('data-wa-print-grid-host'));document.querySelectorAll('[data-wa-vector-grid]').forEach(table=>table.removeAttribute('data-wa-vector-grid'));}
 function drawGroup(table,group,cells){
  const origin=group.getBoundingClientRect();if(!origin.width||!origin.height)return;
  const collapsed=getComputedStyle(table).borderCollapse==='collapse',tableBox=table.getBoundingClientRect(),segments=new Map();
  function edge(axis,position,start,end,outer=false){
   const key=Number(outer)+axis+':'+Math.round(position*32),item=segments.get(key)||{axis,position,ranges:[],outer};
   item.ranges.push([start,end]);segments.set(key,item);
  }
  for(const cell of cells){
   const r=cell.getBoundingClientRect(),style=getComputedStyle(cell),x=r.left-origin.left,y=r.top-origin.top;
   for(const side of ['Top','Right','Bottom','Left']){
    if(side==='Top'&&Math.abs(r.top-tableBox.top)>1)continue;
    if(side==='Left'&&Math.abs(r.left-tableBox.left)>1)continue;
    const width=parseFloat(style['border'+side+'Width']);if(!width||style['border'+side+'Style']==='none')continue;
    // Keep the whole outer stroke inside the paper/modal clipping box.
    const outer=side==='Top'||side==='Left'||(side==='Right'?Math.abs(r.right-tableBox.right)<1:Math.abs(r.bottom-tableBox.bottom)<1);
    const inset=collapsed?0:outer?1:width/2;
    if(side==='Top')edge('h',y+inset,x,x+r.width,true);
    if(side==='Bottom')edge('h',y+r.height-inset,x,x+r.width,Math.abs(r.bottom-tableBox.bottom)<1);
    if(side==='Left')edge('v',x+inset,y,y+r.height,true);
    if(side==='Right')edge('v',x+r.width-inset,y,y+r.height,Math.abs(r.right-tableBox.right)<1);
   }
  }
  const paths={inner:'',outer:''};
  for(const {axis,position,ranges,outer} of segments.values()){
   ranges.sort((a,b)=>a[0]-b[0]);const merged=[];
   for(const range of ranges){const last=merged.at(-1);if(last&&range[0]<=last[1]+.1)last[1]=Math.max(last[1],range[1]);else merged.push(range.slice());}
   for(const [a,b]of merged)paths[outer?'outer':'inner']+=axis==='h'?`M${a},${position}H${b}`:`M${position},${a}V${b}`;
  }
  const svg=document.createElementNS(ns,'svg');
  svg.classList.add('wa-print-grid');svg.setAttribute('aria-hidden','true');svg.setAttribute('viewBox',`0 0 ${origin.width} ${origin.height}`);svg.setAttribute('preserveAspectRatio','none');
  svg.style.width=svg.style.height='100%';
  for(const [kind,path]of Object.entries(paths)){if(!path)continue;const ink=document.createElementNS(ns,'path');ink.setAttribute('d',path);ink.setAttribute('fill','none');ink.setAttribute('stroke','#000');ink.setAttribute('stroke-width',kind==='outer'?String(4/3):'1');ink.setAttribute('stroke-linecap','square');ink.setAttribute('vector-effect','non-scaling-stroke');svg.append(ink);}
  // An SVG directly inside TR/THEAD creates anonymous table boxes in print.
  // Keep it out of flow inside a real cell, then align it to the whole group.
  const host=cells[0];if(!host)return;host.setAttribute('data-wa-print-grid-host','');
  host.append(svg);const painted=svg.getBoundingClientRect();
  if(!painted.width||!painted.height){svg.remove();host.removeAttribute('data-wa-print-grid-host');return;}
  svg.style.width=(origin.width/painted.width*100)+'%';svg.style.height=(origin.height/painted.height*100)+'%';
  svg.style.left=(origin.left-painted.left)+'px';svg.style.top=(origin.top-painted.top)+'px';
 }
 function draw(){
  if(drawing||!matchMedia('print').matches)return;drawing=true;
  try{clear();window.WAFitSheetText?.();for(const table of document.querySelectorAll(selector)){
   if(!table.getClientRects().length)continue;
   // Repeated headers and individual unbroken rows carry their own strokes
   // when Chromium splits a long table across PDF pages.
   if(table.tHead)drawGroup(table,table.tHead,[...table.tHead.querySelectorAll('th,td')]);
   for(const body of table.tBodies)for(const row of body.rows)if(!row.classList.contains('page-preview-only'))drawGroup(table,row,[...row.cells]);
   if(table.querySelector('.wa-print-grid'))table.setAttribute('data-wa-vector-grid','');
  }}finally{drawing=false;}
 }
 window.WAPrintGrid={draw,clear};window.addEventListener('beforeprint',draw);window.addEventListener('afterprint',clear);
 matchMedia('print').addEventListener('change',e=>{if(e.matches)draw();else clear();});
})();
