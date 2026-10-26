/* Activity editing uses the existing recap rows and its account/class grade draft. */
(()=>{'use strict';const table=document.getElementById('tbodyRekapNilai');if(!table)return;let dialog;
const labels=['Bertanya','Kontribusi aktif','Diskusi individu'],max=[999,999,25];
async function open(){
 if(dialog?.open){dialog.focus();return;}await window.WAFlushGrade?.();const rows=[...table.rows].filter(r=>r.querySelector('.nim-value')?.textContent.trim());
 const s=await WA.get(),params=Object.fromEntries(new URLSearchParams(location.search)),ctx={...s.selection,...params};
 dialog=PresenUI.dialog('Catat keaktifan mahasiswa','<p class="activity-context"></p><p class="p-note">Bertanya: 2 poin per kali. Kontribusi aktif (jawaban/usul/saran): 3 poin per kali. Diskusi individu: 0–25 poin. Total aktivitas maksimal 100 poin.</p><label class="activity-search">Cari mahasiswa<input type="search" placeholder="Nama atau NIM" aria-label="Cari mahasiswa untuk keaktifan"></label><div class="activity-list"></div><p class="activity-empty" hidden>Tidak ada mahasiswa yang sesuai pencarian.</p><p role="status" aria-live="polite"></p>');
 const d=dialog;d.classList.add('activity-dialog','p-screen-only');d.querySelector('.activity-context').textContent=[ctx.matkul||'Mata kuliah belum dipilih',ctx.prodi,'Semester '+(ctx.semester||''),'Kelas '+(ctx.kelas||'')].join(' · ');
 const status=d.querySelector('[role=status]'),list=d.querySelector('.activity-list');
 async function persist(){status.textContent='Menyimpan perubahan…';try{await window.WAFlushGrade?.();const state=await WA.get(),issue=state.outbox.find(o=>o.kind==='grade'&&o.problem);status.textContent=issue?'Perubahan tersimpan di perangkat. Selesaikan konflik pada status sinkronisasi.':state.outbox.some(o=>o.kind==='grade')?'Tersimpan di perangkat; menunggu sinkronisasi.':'Tersimpan dan tersinkron.';}catch(_){status.textContent='Perubahan belum dapat disimpan. Jangan tutup halaman; coba ubah isian kembali.';}}
 for(const row of rows){
  const nim=row.querySelector('.nim-value').textContent.trim(),name=row.querySelector('.name-value')?.textContent||nim,source=[...row.querySelectorAll('.score-input')];if(source.length<5)continue;
  const card=document.createElement('article');card.className='activity-student';card.dataset.nim=nim;card.dataset.search=(name+' '+nim).toLocaleLowerCase('id');
  const heading=document.createElement('div');heading.className='activity-student-heading';const identity=document.createElement('div'),h=document.createElement('h3'),sub=document.createElement('small'),total=document.createElement('output');h.textContent=name;sub.textContent=nim;identity.append(h,sub);total.setAttribute('aria-label','Total poin aktivitas '+name);heading.append(identity,total);card.append(heading);
  const fields=document.createElement('div');fields.className='activity-fields';card.append(fields);
  const inputs=[];
  function refresh(){total.textContent=Math.min(100,(Number(source[0].value)||0)*2+(Number(source[1].value)||0)*3+Math.min(25,Number(source[2].value)||0))+' / 100 poin';inputs.forEach((input,i)=>{input.value=source[i].value||'0';const field=input.closest('.activity-field');field.querySelector('[data-minus]').disabled=Number(input.value)<=0;field.querySelector('[data-plus]').disabled=Number(input.value)>=max[i];});}
  for(let i=0;i<3;i++){
   const field=document.createElement('div');field.className='activity-field';const title=document.createElement('label');title.textContent=labels[i]+(i<2?' (kali)':' (poin)');const controls=document.createElement('div');controls.className='activity-stepper';const minus=document.createElement('button'),plus=document.createElement('button'),input=document.createElement('input');minus.type=plus.type='button';minus.textContent='−';plus.textContent='+';minus.dataset.minus='';plus.dataset.plus='';minus.setAttribute('aria-label','Kurangi '+labels[i]+' '+name);plus.setAttribute('aria-label','Tambah '+labels[i]+' '+name);input.type='number';input.inputMode='numeric';input.min='0';input.max=String(max[i]);input.step='1';input.setAttribute('aria-label',labels[i]+' '+name);title.htmlFor=input.id='activity-'+rows.indexOf(row)+'-'+i;inputs.push(input);
   function change(value){if(!row.isConnected){status.textContent='Daftar rekap berubah. Tutup jendela ini dan buka kembali.';return;}source[i].value=String(Math.max(0,Math.min(max[i],Math.trunc(Number(value)||0))));source[i].dispatchEvent(new Event('input',{bubbles:true}));refresh();void persist();}
   input.oninput=()=>change(input.value);minus.onclick=()=>change(Number(source[i].value)-1);plus.onclick=()=>change(Number(source[i].value)+1);controls.append(minus,input,plus);field.append(title,controls);fields.append(field);
  }
  refresh();list.append(card);
 }
 if(!list.children.length){d.querySelector('.activity-empty').hidden=false;d.querySelector('.activity-empty').textContent='Belum ada mahasiswa pada rekap kelas ini.';}
 d.querySelector('input[type=search]').oninput=e=>{const q=e.target.value.trim().toLocaleLowerCase('id');let count=0;for(const card of list.children){card.hidden=!!q&&!card.dataset.search.includes(q);if(!card.hidden)count++;}d.querySelector('.activity-empty').hidden=count>0;};
 const reset=()=>d.close();window.addEventListener('wa-global-reset',reset);d.addEventListener('close',()=>{window.removeEventListener('wa-global-reset',reset);void persist();if(dialog===d)dialog=null;});
}
const button=document.createElement('button');button.type='button';button.className='btn';button.id='recordStudentActivity';button.textContent='Catat keaktifan';button.onclick=()=>void open();document.querySelector('.rekap-modal-header>div')?.prepend(button);window.PresenGradeActivity={open};
})();
