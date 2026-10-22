package id.webabsensi.app;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.test.InstrumentationTestCase;
import android.view.ViewGroup;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import android.webkit.*;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Exercises real signed APK upgrades with persisted accounts and a hostile stale UI cache. */
public class StudentLifecycleTest extends InstrumentationTestCase {
 private Activity activity;
 private Activity launch(){
  Intent intent=getInstrumentation().getTargetContext().getPackageManager().getLaunchIntentForPackage("id.webabsensi.presengo.mahasiswa");
  intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
  activity=getInstrumentation().startActivitySync(intent);return activity;
 }
 private WebView web(){return (WebView)((ViewGroup)activity.findViewById(android.R.id.content)).getChildAt(0);}
 private String js(String code)throws Exception{
  CountDownLatch done=new CountDownLatch(1);String[] result={"null"};
  getInstrumentation().runOnMainSync(()->web().evaluateJavascript(code,value->{result[0]=value;done.countDown();}));
  assertTrue("WebView JavaScript callback",done.await(15,TimeUnit.SECONDS));return result[0];
 }
 private void until(String expression)throws Exception{
  for(int i=0;i<120;i++){if("true".equals(js("Boolean("+expression+")")))return;Thread.sleep(500);}
  fail("Student UI did not recover: "+expression+"; "+js("document.body.innerText.slice(0,1200)"));
 }
 public void testSeedSavedStudent()throws Exception{
  launch();until("window.WA && window.PresenUI");
  js("window.__seeded=false;(async()=>{localStorage.setItem('wa-student-onboarding-v1','complete');const ctx={jenjang:'S1',prodi:'Pendidikan Teknologi Informasi',semester:'1',kelas:'A'},profile={role:'student',device:'11111111-1111-4111-8111-111111111111',account:{id:'22222222-2222-4222-8222-222222222222',nim:'NIMREOPEN123',nama:'Mahasiswa Uji Buka Ulang',approved:true,approval_status:'approved',ctx}};await WA.change(s=>({...s,token:null,profile,outbox:[],snapshot:{roster:[],documents:[],registrations:[],sessions:[{id:'saved-session',scope:'saved-scope',ctx,matkul:'Mata Kuliah Tersimpan',slot:1,day:WA.day(),starts:Date.now()-300000,deadline:Date.now()-100000,version:1}],marks:[{scope:'saved-scope',session_id:'saved-session',nim:'NIMREOPEN123',slot:1,mark:'.',recorded_at:Date.now(),review_status:'final'}]}}));window.__seeded=true;})()");
  until("window.__seeded");
 }
 public void testSeedStaleWorker()throws Exception{
  launch();until("window.WA && document.querySelector('#scanSession')");
  final String worker="self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.mode==='navigate')e.respondWith(Promise.resolve(new Response('<!doctype html><html><body><header>Presen Go</header><main id=main></main><script>window.__staleShell=true;<\\/script></body></html>',{headers:{'Content-Type':'text/html'}})));});";
  WebViewClient client=new WebViewClient(){@Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest request){
   if(request.getUrl().getPath().endsWith("native-stale-worker.js"))return workerResponse(worker);
   return null;
  }};
  getInstrumentation().runOnMainSync(()->{
   web().setWebViewClient(client);
   ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient(){@Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request){return request.getUrl().getPath().endsWith("native-stale-worker.js")?workerResponse(worker):null;}});
  });
  js("window.__workerReady=false;window.__workerError='';navigator.serviceWorker.register('/app/native-stale-worker.js',{scope:'/app/'}).then(async reg=>{if(reg.active){window.__workerReady=true;return;}const worker=reg.installing||reg.waiting;worker.addEventListener('statechange',()=>{if(worker.state==='activated')window.__workerReady=true;});}).catch(e=>window.__workerError=e.message)");
  until("window.__workerReady || window.__workerError");assertEquals("Stale worker registered", "\"\"",js("window.__workerError"));
  getInstrumentation().runOnMainSync(()->web().loadUrl("https://"+BuildConfig.APP_HOST+"/app/?role=student&stale-test=1"));
  until("window.__staleShell && document.getElementById('main')?.children.length===0");
  assertEquals("Reproduced header-only blank page", "\"Presen Go\"",js("document.body.innerText.trim()"));
 }
 private WebResourceResponse workerResponse(String source){return new WebResourceResponse("application/javascript","UTF-8",new ByteArrayInputStream(source.getBytes(StandardCharsets.UTF_8)));}
 public void testOnlineAfterStaleWorker()throws Exception{
  launch();until("document.querySelector('#scanSession') && document.querySelector('.student-identity')?.innerText.includes('NIMREOPEN123')");
  assertEquals("Coherent current signed UI", "\"1.2.4\"",js("document.querySelector('meta[name=presen-build]')?.content"));
  assertEquals("Network active", "true",js("navigator.onLine"));
  assertEquals("Stale worker cannot replace app document", "false",js("Boolean(window.__staleShell)"));
  js("PresenExperience.view('history')");until("document.querySelector('#history')?.innerText.includes('Mata Kuliah Tersimpan')");
 }
 public void testMissingRuntimeRecovery()throws Exception{
  launch();until("document.querySelector('#scanSession')");
  getInstrumentation().runOnMainSync(()->{
   try{web().getSettings().setJavaScriptEnabled(false);Field field=MainActivity.class.getDeclaredField("studentShell");field.setAccessible(true);Object shell=field.get(activity);Method open=shell.getClass().getDeclaredMethod("open");open.setAccessible(true);open.invoke(shell);}catch(Exception error){throw new RuntimeException(error);}
  });
  Thread.sleep(14500);
  final String[] nativeText={""};getInstrumentation().runOnMainSync(()->nativeText[0]=nativeText(activity.findViewById(android.R.id.content)));
  assertTrue("Native recovery replaces a blank runtime",nativeText[0].contains("Tampilan belum dapat dibuka"));
  assertTrue("Recovery promises no destructive reset",nativeText[0].contains("Data akun dan riwayat tetap tersimpan"));
  getInstrumentation().runOnMainSync(()->{web().getSettings().setJavaScriptEnabled(true);clickRetry(activity.findViewById(android.R.id.content));});
  until("document.querySelector('#scanSession') && document.querySelector('.student-identity')?.innerText.includes('NIMREOPEN123')");
  js("PresenExperience.view('history')");until("document.querySelector('#history')?.innerText.includes('Mata Kuliah Tersimpan')");
 }
 private String nativeText(View view){if(view.getVisibility()!=View.VISIBLE)return "";String text=view instanceof TextView?((TextView)view).getText().toString():"";if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++)text+=" "+nativeText(group.getChildAt(i));}return text;}
 private void clickRetry(View view){if(view instanceof Button&&((Button)view).getText().toString().equals("Muat ulang tampilan")){view.performClick();return;}if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++)clickRetry(group.getChildAt(i));}}
 public void testRelaunchSavedStudent()throws Exception{
  launch();until("document.querySelector('#scanSession') && document.querySelector('.student-identity')?.innerText.includes('NIMREOPEN123')");
  js("localStorage.setItem('wa-student-draft-11111111-1111-4111-8111-111111111111','{broken')");
  Instrumentation.ActivityMonitor monitor=getInstrumentation().addMonitor(MainActivity.class.getName(),null,false);
  getInstrumentation().runOnMainSync(()->activity.recreate());
  activity=monitor.waitForActivityWithTimeout(20000);getInstrumentation().removeMonitor(monitor);assertNotNull("Activity recreated",activity);
  until("document.querySelector('#scanSession') && document.querySelector('.student-identity')?.innerText.includes('NIMREOPEN123')");
  js("PresenExperience.view('history')");until("document.querySelector('#history')?.innerText.includes('Mata Kuliah Tersimpan')");
  assertEquals("Saved account retained","true",js("Boolean(document.querySelector('.student-bottom-nav') && document.querySelector('.student-history-item'))"));
 }
}
