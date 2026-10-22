package id.webabsensi.app;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.test.InstrumentationTestCase;
import android.view.ViewGroup;
import android.webkit.WebView;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Exercises persisted WebView account data on the real signed APK, without a server. */
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
