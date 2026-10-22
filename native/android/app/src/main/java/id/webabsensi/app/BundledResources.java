package id.webabsensi.app;
import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceResponse;

/** Application-owned resources; no Activity is retained by the process-wide worker client. */
final class BundledResources {
 static WebResourceResponse read(AssetManager assets,Uri uri){
  try{
   String path=uri.getPath().replaceFirst("^/","");
   if(path.equals("app")||path.equals("app/"))path="app/index.html";
   if(path.matches("(?:index|absen|ujian|data_siswa|music_player)\\.php"))path="app/templates/"+path.replace(".php",".html");
   if(path.contains("..")||!(path.startsWith("app/")||path.startsWith("assets/")||path.equals("app-sw.js")))return null;
   String ext=path.substring(path.lastIndexOf('.')+1);
   String mime=ext.equals("html")?"text/html":ext.equals("js")||ext.equals("mjs")?"application/javascript":ext.equals("css")?"text/css":ext.equals("json")?"application/json":ext.equals("wasm")?"application/wasm":ext.equals("svg")?"image/svg+xml":"application/octet-stream";
   return new WebResourceResponse(mime,"UTF-8",assets.open(path));
  }catch(Exception error){return null;}
 }
}
