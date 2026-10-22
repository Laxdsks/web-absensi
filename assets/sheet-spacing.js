/* Keep moved signature blocks below the table in screen and print layouts. */
(() => {
 'use strict';
 window.pastikanJarakTandaTangan = () => {
  const paper=document.getElementById('paperSheet'),footer=paper?.querySelector('.signature-section');if(!footer)return;
  const gap=parseFloat(getComputedStyle(paper).getPropertyValue('--wa-signature-gap'))||24;
  footer.style.marginTop=gap+'px';footer.style.paddingTop='0px';footer.style.paddingBottom='0px';
  const upper=paper.querySelector('.grading-wrap')||paper.querySelector('#tableWrapper')||paper.querySelector('#tabelAbsen');if(!upper)return;
  const scale=paper.offsetWidth?paper.getBoundingClientRect().width/paper.offsetWidth:1;
  const boxes=[...footer.querySelectorAll('.signature-box')];if(!boxes.length||!scale)return;
  const top=Math.min(...boxes.map(box=>box.getBoundingClientRect().top));
  const needed=(upper.getBoundingClientRect().bottom+gap*scale-top)/scale;
  if(Number.isFinite(needed)&&needed>0)footer.style.marginTop=(gap+Math.ceil(needed))+'px';
  // Transforms do not reserve flow space. Reserve downward offsets as well so
  // a following page never clips a moved signature or its identity lines.
  const bottom=Math.max(...boxes.map(box=>box.getBoundingClientRect().bottom));
  const extra=(bottom-footer.getBoundingClientRect().bottom)/scale;
  if(Number.isFinite(extra)&&extra>0)footer.style.paddingBottom=Math.ceil(extra)+'px';
 };
 document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(window.pastikanJarakTandaTangan));
 window.addEventListener('beforeprint',window.pastikanJarakTandaTangan);
 matchMedia('print').addEventListener('change',()=>requestAnimationFrame(window.pastikanJarakTandaTangan));
 document.fonts?.ready.then(()=>requestAnimationFrame(window.pastikanJarakTandaTangan));
})();
