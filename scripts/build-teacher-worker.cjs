/* A teacher-only worker keeps automatic offline preparation small. Student APK assets stay intact. */
const fs=require('node:fs'),path=require('node:path'),root=path.join(__dirname,'..');
function replace(source,from,to){if(!source.includes(from))throw Error('Teacher worker adapter no longer matches: '+from.slice(0,70));return source.replace(from,to);}
module.exports=build=>{
 let source=fs.readFileSync(path.join(root,'app-sw.js'),'utf8').replace(/const BUILD='[^']+'/,"const BUILD='"+build+"'");
 source=replace(source,"const staticFiles=[","const staticFiles=['app/teacher-appearance.js','app/teacher-guide.js','app/teacher-guide.css','app/teacher-mobile.css',");
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
