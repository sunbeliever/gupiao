package cn.techscope.app;
import android.content.Context;
import java.io.*;
public final class LocalStore {
 private LocalStore(){}
 public static synchronized String read(Context c,String key){
  if(!SecurityGate.allowedKey(key))return "";File f=new File(c.getFilesDir(),key+".json");if(!f.exists()||f.length()>16*1024*1024)return "";
  try {FileInputStream in=new FileInputStream(f);ByteArrayOutputStream out=new ByteArrayOutputStream();try{byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}finally{in.close();}return new String(out.toByteArray(),"UTF-8");}catch(Exception e){return "";}
 }
 public static synchronized boolean write(Context c,String key,String text){
  if(!SecurityGate.allowedKey(key)||text==null||text.length()>8*1024*1024)return false;
  File f=new File(c.getFilesDir(),key+".json"),tmp=new File(c.getFilesDir(),key+".pending");
  try {FileOutputStream out=new FileOutputStream(tmp);try{out.write(text.getBytes("UTF-8"));out.getFD().sync();}finally{out.close();}return tmp.renameTo(f);}catch(Exception e){tmp.delete();return false;}
 }
}
