/* Print grid strokes independently of CSS border fills, which PDF thumbnails
   can round away at fractional pixel positions. No cell dimensions change. */
(()=>{
 'use strict';
 const selector='#tabelAbsen,#examTableBlock table,#examScaleBlock table,#tabelRekapNilai';
 const ns='http://www.w3.org/2000/svg';let drawing=false;
 function clear(){document.querySelectorAll('.wa-print-grid').forEach(svg=>svg.remove());document.querySelectorAll('[data-wa-print-grid-host]').forEach(cell=>cell.removeAttribute('data-wa-print-grid-host'));}
 function drawGroup(table,group,cells){
  const origin=group.getBoundingClientRect();if(!origin.width||!origin.height)return;
  const collapsed=getComputedStyle(table).borderCollapse==='collapse',segments=new Map();
  function edge(axis,position,start,end){
   const key=axis+':'+Math.round(position*32),item=segments.get(key)||{axis,position,ranges:[]};
   item.ranges.push([start,end]);segments.set(key,item);
  }
  for(const cell of cells){
   const r=cell.getBoundingClientRect(),style=getComputedStyle(cell),x=r.left-origin.left,y=r.top-origin.top;
   for(const side of ['Top','Right','Bottom','Left']){
    const width=parseFloat(style['border'+side+'Width']);if(!width||style['border'+side+'Style']==='none')continue;
    const inset=collapsed?0:width/2;
    if(side==='Top')edge('h',y+inset,x,x+r.width);
    if(side==='Bottom')edge('h',y+r.height-inset,x,x+r.width);
    if(side==='Left')edge('v',x+inset,y,y+r.height);
    if(side==='Right')edge('v',x+r.width-inset,y,y+r.height);
   }
  }
  let path='';
  for(const {axis,position,ranges} of segments.values()){
   ranges.sort((a,b)=>a[0]-b[0]);const merged=[];
   for(const range of ranges){const last=merged.at(-1);if(last&&range[0]<=last[1]+.1)last[1]=Math.max(last[1],range[1]);else merged.push(range.slice());}
   for(const [a,b]of merged)path+=axis==='h'?`M${a},${position}H${b}`:`M${position},${a}V${b}`;
  }
  const svg=document.createElementNS(ns,'svg'),ink=document.createElementNS(ns,'path');
  svg.classList.add('wa-print-grid');svg.setAttribute('aria-hidden','true');svg.setAttribute('viewBox',`0 0 ${origin.width} ${origin.height}`);svg.setAttribute('preserveAspectRatio','none');
  svg.style.width=svg.style.height='100%';
  ink.setAttribute('d',path);ink.setAttribute('fill','none');ink.setAttribute('stroke','#000');ink.setAttribute('stroke-width',String(4/3));ink.setAttribute('stroke-linecap','square');ink.setAttribute('vector-effect','non-scaling-stroke');
  // An SVG directly inside TR/THEAD creates anonymous table boxes in print.
  // Keep it out of flow inside a real cell, then align it to the whole group.
  const host=cells[0];if(!host)return;host.setAttribute('data-wa-print-grid-host','');
  svg.append(ink);host.append(svg);const painted=svg.getBoundingClientRect();
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
  }}finally{drawing=false;}
 }
 window.WAPrintGrid={draw,clear};window.addEventListener('beforeprint',draw);window.addEventListener('afterprint',clear);
 matchMedia('print').addEventListener('change',e=>{if(e.matches)draw();else clear();});
})();
