(() => {
    'use strict';
    window.pastikanJarakTandaTangan = () => {
        const paper=document.getElementById('paperSheet'),footer=paper?.querySelector('.signature-section');
        if(!footer)return;
        footer.style.marginTop='28px';
        const upper=paper.querySelector('.grading-wrap')||paper.querySelector('#tableWrapper')||paper.querySelector('#tabelAbsen');
        if(!upper)return;
        const scale=paper.offsetWidth?paper.getBoundingClientRect().width/paper.offsetWidth:1;
        const top=Math.min(...Array.from(footer.querySelectorAll('.signature-box')).map(box=>box.getBoundingClientRect().top));
        const needed=(upper.getBoundingClientRect().bottom+20*scale-top)/scale;
        if(Number.isFinite(needed)&&needed>0)footer.style.marginTop=`${Math.ceil(28+needed)}px`;
    };
    document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(window.pastikanJarakTandaTangan));
    window.addEventListener('beforeprint',window.pastikanJarakTandaTangan);
})();
