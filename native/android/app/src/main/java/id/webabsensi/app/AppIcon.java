package id.webabsensi.app;

import android.app.*;
import android.content.*;
import android.content.pm.*;
import android.graphics.*;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.util.Base64;
import java.io.*;
import java.util.Collections;
import org.json.JSONObject;

/** User-selected images belong to this installation; attendance storage is untouched. */
final class AppIcon {
 private static final String ID="custom-app-icon";
 private final Activity activity;
 AppIcon(Activity value){activity=value;}
 private File file(){return new File(activity.getFilesDir(),"custom-app-icon.png");}
 private Bitmap current() throws IOException {
  try(InputStream in=file().exists()?new FileInputStream(file()):activity.getAssets().open("app/icon-512.png")){
   Bitmap image=BitmapFactory.decodeStream(in);if(image==null)throw new IOException("Ikon tidak dapat dibaca.");return image;
  }
 }
 private Bitmap decode(String data) throws IOException {
  if(data==null||data.length()>2000000||!data.matches("^data:image/png;base64,[A-Za-z0-9+/]+=*$"))throw new IOException("Gunakan gambar dari pratinjau ikon.");
  byte[] bytes=Base64.decode(data.substring(22),Base64.DEFAULT);
  BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,bounds);
  if(bounds.outWidth!=512||bounds.outHeight!=512||!"image/png".equals(bounds.outMimeType))throw new IOException("Ukuran ikon harus 512 × 512 piksel.");
  Bitmap image=BitmapFactory.decodeByteArray(bytes,0,bytes.length);if(image==null)throw new IOException("Ikon tidak dapat dibaca.");return image;
 }
 private ShortcutInfo shortcut(Bitmap bitmap){
  ShortcutManager manager=activity.getSystemService(ShortcutManager.class);
  int size=Math.min(512,Math.max(48,Math.min(manager.getIconMaxWidth(),manager.getIconMaxHeight())));
  // Keep the complete square preview, including its user-selected spacing.
  return new ShortcutInfo.Builder(activity,ID).setShortLabel(activity.getString(id.webabsensi.app.R.string.app_name)).setLongLabel(activity.getString(id.webabsensi.app.R.string.app_name))
   .setIcon(Icon.createWithBitmap(Bitmap.createScaledBitmap(bitmap,size,size,true)))
   .setIntent(new Intent(activity,MainActivity.class).setAction(Intent.ACTION_VIEW).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP)).build();
 }
 private void refresh(Bitmap image){
  activity.runOnUiThread(()->activity.setTaskDescription(new ActivityManager.TaskDescription(activity.getString(id.webabsensi.app.R.string.app_name),image,Color.rgb(11,41,65))));
  ShortcutManager manager=activity.getSystemService(ShortcutManager.class);
  if(manager.getPinnedShortcuts().stream().anyMatch(s->ID.equals(s.getId())))manager.updateShortcuts(Collections.singletonList(shortcut(image)));
 }
 void restore(){try{refresh(current());}catch(Exception ignored){}}
 String get(){try{ByteArrayOutputStream bytes=new ByteArrayOutputStream();current().compress(Bitmap.CompressFormat.PNG,100,bytes);JSONObject result=new JSONObject();result.put("platform","android");result.put("png","data:image/png;base64,"+Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP));result.put("shortcutSupported",activity.getSystemService(ShortcutManager.class).isRequestPinShortcutSupported());return result.toString();}catch(Exception e){return "{\"error\":\"Ikon belum dapat dibaca.\"}";}}
 String save(String data){try{Bitmap image=decode(data);File pending=new File(activity.getFilesDir(),"custom-app-icon.tmp");try(FileOutputStream out=new FileOutputStream(pending)){if(!image.compress(Bitmap.CompressFormat.PNG,100,out))throw new IOException();out.getFD().sync();}if(!pending.renameTo(file()))throw new IOException();refresh(image);return "saved";}catch(Exception e){return "error";}}
 String reset(){try(InputStream in=activity.getAssets().open("app/icon-512.png")){Bitmap image=BitmapFactory.decodeStream(in);if(image==null||file().exists()&&!file().delete())return "error";refresh(image);return "saved";}catch(Exception e){return "error";}}
 String pin(){try{ShortcutManager manager=activity.getSystemService(ShortcutManager.class);if(!manager.isRequestPinShortcutSupported())return "unsupported";ShortcutInfo info=shortcut(current());if(manager.getPinnedShortcuts().stream().anyMatch(s->ID.equals(s.getId()))){return manager.updateShortcuts(Collections.singletonList(info))?"updated":"error";}
   // The launcher owns the final confirmation; requesting a pin is not installation.
   return manager.requestPinShortcut(info,null)?"requested":"error";
  }catch(Exception e){return "error";}}
}
