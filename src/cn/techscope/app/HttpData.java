package cn.techscope.app;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
public final class HttpData {
 private HttpData(){}
 public static String get(String url) throws Exception {
  if(!SecurityGate.allowedDataUrl(url))throw new IllegalArgumentException("此数据来源未开放");
  HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();
  c.setConnectTimeout(10000);c.setReadTimeout(15000);c.setInstanceFollowRedirects(false);
  c.setRequestProperty("User-Agent","Mozilla/5.0 TechScope/1.0 Android");c.setRequestProperty("Referer",url.contains("gtimg.cn")?"https://gu.qq.com/":"https://www.eastmoney.com/");c.setRequestProperty("Accept-Encoding","identity");
  try {int status=c.getResponseCode();if(status!=200)throw new java.io.IOException("数据源返回 "+status);
   InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream();try {byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1){if(out.size()+n>12*1024*1024)throw new java.io.IOException("数据超出大小限制");out.write(buf,0,n);}}finally{in.close();}
   return new String(out.toByteArray(),url.contains("qt.gtimg.cn")?"GB18030":"UTF-8");
  }finally{c.disconnect();}
 }
}
