/* Stored signature offsets must move flow space as well as visible ink. */
(() => {
 'use strict';
 const positions=new WeakMap();let scheduled=false;
 function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;window.pastikanJarakTandaTangan();window.perbaruiPenandaHalaman?.();window.perbaruiPenandaHalamanUjian?.();});}
 window.pastikanJarakTandaTangan = () => {
  const paper=document.getElementById('paperSheet'),footer=paper?.querySelector('.signature-section');if(!footer)return;
  const boxes=[...footer.querySelectorAll('.signature-box')];if(!boxes.length)return;
  const offsets=boxes.map(box=>{positions.set(box,box.style.transform);try{const m=new DOMMatrix(box.style.transform||'none');return{x:m.m41,y:m.m42};}catch(_){return{x:0,y:0};}});
  const firstY=Math.min(...offsets.map(p=>p.y)),gap=parseFloat(getComputedStyle(paper).getPropertyValue('--wa-signature-gap'))||24;
  footer.classList.add('wa-signature-flow');footer.style.marginTop=gap+'px';footer.style.paddingTop='1px';footer.style.paddingBottom='0px';
  boxes.forEach((box,i)=>{box.style.setProperty('--wa-signature-x',offsets[i].x+'px');box.style.setProperty('--wa-signature-offset',(offsets[i].y-firstY)+'px');});
  const scale=paper.offsetWidth?paper.getBoundingClientRect().width/paper.offsetWidth:1;if(!scale)return;
  const upper=paper.querySelector('.grading-wrap')||paper.querySelector('#tableWrapper')||paper.querySelector('#tabelAbsen');
  const baseline=footer.getBoundingClientRect().top;
  // Preserve the requested upward move, stopping only before it overlaps the table.
  const desired=baseline+firstY*scale,safe=upper?upper.getBoundingClientRect().bottom+(firstY<0?4:gap)*scale:desired;
  footer.style.marginTop=(gap+(Math.max(desired,safe)-baseline)/scale)+'px';
 };
 function install(){const footer=document.querySelector('#paperSheet .signature-section');if(footer)new MutationObserver(records=>{if(records.some(r=>r.target.matches('.signature-box')&&positions.get(r.target)!==r.target.style.transform))schedule();}).observe(footer,{subtree:true,attributes:true,attributeFilter:['style']});schedule();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
 window.addEventListener('beforeprint',window.pastikanJarakTandaTangan);
 window.addEventListener('afterprint',schedule);
 matchMedia('print').addEventListener('change',schedule);
 document.fonts?.ready.then(schedule);
})();
