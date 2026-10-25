/* A teacher-only worker keeps automatic offline preparation small. Student APK assets stay intact. */
const fs=require('node:fs'),path=require('node:path'),root=path.join(__dirname,'..');
function replace(source,from,to){if(!source.includes(from))throw Error('Teacher worker adapter no longer matches: '+from.slice(0,70));return source.replace(from,to);}
module.exports=build=>{
 let source=fs.readFileSync(path.join(root,'app-sw.js'),'utf8').replace(/const BUILD='[^']+'/,"const BUILD='"+build+"'");
 source=replace(source,"const staticFiles=[","const staticFiles=['app/teacher-appearance.js','app/teacher-guide.js','app/teacher-guide.css','app/teacher-mobile.css','app/teacher-shell.css',");
 const bundled=require('./build-teacher-bundle.cjs').modules.map(file=>file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|').replaceAll('/', '\\/');
 const pageAdapter=`function currentPage(response){return response.text().then(html=>{if(!/<script\\b[^>]*\\bdata-teacher-bundle(?:[=\\s>])/.test(html)){html=html.replace(/<script\\b[^>]*src=["'](?:${bundled}|app\\/runtime-teacher-[^"']+|app\\/core-[^"']+)\\.?(?:\\?[^"']*)?["'][^>]*><\\/script>/g,'');html=html.replace('</head>','<link rel="stylesheet" href="app/teacher-shell.css"><script data-teacher-bundle src="app/runtime-teacher-1.2.10.js" defer></script></head>');}return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});});}\n`;
 source=source.replace(/function currentPage\(response\)\{[\s\S]*?(?=async function state\(\))/,pageAdapter);
 source=replace(source,"if(saved&&!/\\.(?:js|mjs|css|html)$/.test(rel))return saved;", "if(saved&&rel.startsWith('app/runtime-teacher-')&&saved.headers.get('X-WA-Teacher-Build')===BUILD)return saved;if(saved&&!/\\.(?:js|mjs|css|html)$/.test(rel))return saved;");
 source=replace(source,"if(r.ok){await c.put(e.request,r.clone());return r;}","if(r.ok){if(rel.startsWith('app/runtime-teacher-')){const text=await r.text(),headers=new Headers(r.headers);if(!text.includes('PresenTeacherBundleExecuted')||!text.includes('PresenTeacherStartup?.core();'))return new Response(text,{status:r.status,headers});headers.set('X-WA-Teacher-Build',BUILD);const ready=new Response(text,{status:r.status,headers});await c.put(url(rel),ready.clone());await c.put(e.request,ready.clone());return ready;}await c.put(e.request,r.clone());return r;}");
 source=replace(source,'let preparing;','let preparing,preparingFull=false;');
 source=replace(source,"async function prepare(role='teacher',bundled=false)","async function prepare(role='teacher',bundled=false,full=false)");
 source=replace(source,'if(preparing)return preparing;return preparing=','if(preparing){const wasFull=preparingFull;await preparing;if(full&&!wasFull)return prepare(role,bundled,true);return;}preparingFull=full;return preparing=');
 source=replace(source,"manifest=role==='student'||bundled?[]:","manifest=role==='student'||bundled||!full?[]:");
 source=replace(source,'{length:6}',"{length:role==='teacher'?(full?2:1):6}");
 source=replace(source,"fetch(request,{cache:'no-cache'})","fetch(request,{cache:'no-cache',priority:role==='teacher'?'low':'auto'})");
 source=replace(source,"tell({type:'offline-ready',role})","tell({type:'offline-ready',role,full})");
 source=replace(source,'prepare(e.data.role,e.data.bundled)','prepare(e.data.role,e.data.bundled,e.data.full===true)');
 // Reuse completed assets during worker upgrades rather than downloading them again.
 source=source.replace(/await c\.addAll\((\[[^;]+?\])\);/,"await Promise.all($1.map(async path=>{if(!await c.match(url(path)))await c.add(path);}));");
 fs.writeFileSync(path.join(root,'teacher-sw.js'),'/* Teacher web '+build+'; generated from the shared offline protocol. */\n'+source);
};
