package id.webabsensi.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.webkit.*;
import android.widget.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.function.Function;

/** A coherent signed UI on the original HTTPS origin, independent of HTTP/SW caches. */
final class StudentShell {
 private final Activity activity;
 private final WebView web;
 private final String host,entry;
 private final Function<Uri,WebResourceResponse> assets;
 private final Handler handler=new Handler(Looper.getMainLooper());
 private final LinearLayout recovery;
 private final TextView title,detail;
 private final Button retry,update;
 private WebView handshake;
 private boolean destroyed,ready;
 private long openedAt;
 StudentShell(Activity activity,WebView web,String host,Function<Uri,WebResourceResponse> assets){
  this.activity=activity;this.web=web;this.host=host;this.assets=assets;entry="https://"+host+"/app/?role=student";
  // A service worker has its own request client; WebViewClient alone does not cover it.
  ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient(){
   @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request){
    return "GET".equals(request.getMethod())&&host.equals(request.getUrl().getHost())?assets.apply(request.getUrl()):null;
   }
  });
  recovery=new LinearLayout(activity);recovery.setOrientation(LinearLayout.VERTICAL);recovery.setGravity(Gravity.CENTER);recovery.setPadding(32,32,32,32);recovery.setBackgroundColor(0xffedf2f8);
  title=new TextView(activity);title.setTextSize(22);title.setTextColor(0xff15304a);title.setGravity(Gravity.CENTER);recovery.addView(title);
  detail=new TextView(activity);detail.setTextSize(15);detail.setTextColor(0xff486276);detail.setGravity(Gravity.CENTER);detail.setPadding(0,20,0,20);recovery.addView(detail);
  retry=new Button(activity);retry.setText("Muat ulang tampilan");retry.setOnClickListener(v->open());recovery.addView(retry);
  update=new Button(activity);update.setText("Perbarui komponen tampilan Android");update.setOnClickListener(v->{String pkg=WebView.getCurrentWebViewPackage()==null?"com.google.android.webview":WebView.getCurrentWebViewPackage().packageName;try{activity.startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://play.google.com/store/apps/details?id="+pkg)));}catch(Exception ignored){Toast.makeText(activity,"Buka Play Store, lalu perbarui Android System WebView dan Chrome.",Toast.LENGTH_LONG).show();}});recovery.addView(update);
  activity.addContentView(recovery,new android.view.ViewGroup.LayoutParams(-1,-1));
 }
 void open(){
  if(destroyed)return;handler.removeCallbacksAndMessages(null);ready=false;openedAt=android.os.SystemClock.elapsedRealtime();
  title.setText("Membuka Presen Go");detail.setText("Memulihkan tampilan akun…\nVersi "+BuildConfig.VERSION_NAME);retry.setVisibility(View.GONE);update.setVisibility(View.GONE);recovery.setVisibility(View.VISIBLE);
  // Do not clear WebStorage, IndexedDB, cookies, photos or the pending attendance outbox.
  // loadDataWithBaseURL bypasses old navigation responses but retains the same storage origin.
  try(InputStream in=activity.getAssets().open("app/index.html");ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
   byte[] block=new byte[8192];int count;while((count=in.read(block))!=-1)bytes.write(block,0,count);
   web.loadDataWithBaseURL(entry,new String(bytes.toByteArray(),StandardCharsets.UTF_8),"text/html","UTF-8",entry);
  }catch(IOException error){showRecovery();return;}
  check();primeServer();
 }
 void check(){if(!destroyed&&!ready)handler.postDelayed(probe,350);}
 private final Runnable probe=this::probe;
 private void probe(){
  if(destroyed||ready)return;
  web.evaluateJavascript("Boolean(document.querySelector('#main') && Array.from(document.querySelector('#main').children).some(function(el){return el.id!=='studentStartup' && el.getBoundingClientRect().height>0 && el.innerText.trim().length>0;}))",value->{
   if(destroyed)return;
   if("true".equals(value)){ready=true;recovery.setVisibility(View.GONE);handler.removeCallbacks(probe);}
   else if(android.os.SystemClock.elapsedRealtime()-openedAt>12000)showRecovery();
   else handler.postDelayed(probe,400);
  });
 }
 private void showRecovery(){
  if(destroyed)return;String version=WebView.getCurrentWebViewPackage()==null?"tidak diketahui":WebView.getCurrentWebViewPackage().versionName;
  title.setText("Tampilan belum dapat dibuka");detail.setText("Data akun dan riwayat tetap tersimpan. Coba muat ulang. Jika masih gagal, perbarui komponen tampilan Android.\n\nPresen Go "+BuildConfig.VERSION_NAME+" · WebView "+version);retry.setVisibility(View.VISIBLE);update.setVisibility(View.VISIBLE);recovery.setVisibility(View.VISIBLE);
 }
 private void primeServer(){
  // The hosting provider uses a browser-cookie challenge before allowing API requests.
  // Prime only its API URL in a separate, bridge-free WebView; never execute another app UI.
  if(handshake!=null)return;
  handshake=new WebView(activity);handshake.getSettings().setJavaScriptEnabled(true);handshake.getSettings().setAllowFileAccess(false);handshake.getSettings().setAllowContentAccess(false);handshake.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  handshake.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest request){return !"https".equals(request.getUrl().getScheme())||!host.equals(request.getUrl().getHost());}
   @Override public void onPageFinished(WebView v,String url){if(!destroyed)web.evaluateJavascript("window.dispatchEvent(new Event('online'))",null);}
  });
  handshake.loadUrl("https://"+host+"/app_api.php?native_handshake=1");handler.postDelayed(()->{if(handshake!=null){handshake.stopLoading();handshake.destroy();handshake=null;}},20000);
 }
 void destroy(){destroyed=true;handler.removeCallbacksAndMessages(null);if(handshake!=null){handshake.stopLoading();handshake.destroy();handshake=null;}}
}
