package cn.techscope.app;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;
public final class MainActivity extends Activity {
 private WebView web;
 private final ExecutorService network=Executors.newFixedThreadPool(3);
 @Override public void onCreate(Bundle state){
  super.onCreate(state);getWindow().setStatusBarColor(Color.rgb(13,38,70));getWindow().setNavigationBarColor(Color.WHITE);
  FrameLayout frame=new FrameLayout(this);frame.setBackgroundColor(Color.WHITE);
  frame.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener(){public WindowInsets onApplyWindowInsets(View v,WindowInsets i){v.setPadding(i.getSystemWindowInsetLeft(),i.getSystemWindowInsetTop(),i.getSystemWindowInsetRight(),i.getSystemWindowInsetBottom());return i.consumeSystemWindowInsets();}});
  web=new WebView(this);frame.addView(web,new FrameLayout.LayoutParams(-1,-1));setContentView(frame);
  WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setDatabaseEnabled(false);s.setAllowFileAccess(true);s.setAllowContentAccess(false);s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setMediaPlaybackRequiresUserGesture(true);
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,String url){if(url.equals("file:///android_asset/index.html"))return false;openExternal(url);return true;}
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){String u=request.getUrl().toString();if(u.startsWith("file:///android_asset/"))return null;return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));}
   @Override public void onReceivedSslError(WebView view,android.webkit.SslErrorHandler handler,android.net.http.SslError error){handler.cancel();}
  });
  web.addJavascriptInterface(new Bridge(),"Native");web.loadUrl("file:///android_asset/index.html");
  if(getPreferences(0).getBoolean("background",true))MarketJob.schedule(this);
 }
 private void openExternal(final String url){if(!SecurityGate.externalHttps(url))return;runOnUiThread(new Runnable(){public void run(){try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(Exception e){Toast.makeText(MainActivity.this,"未找到浏览器",Toast.LENGTH_SHORT).show();}}});}
 public final class Bridge {
  @JavascriptInterface public String read(String key){return LocalStore.read(MainActivity.this,key);}
  @JavascriptInterface public boolean write(String key,String value){return LocalStore.write(MainActivity.this,key,value);}
  @JavascriptInterface public void openUrl(String url){openExternal(url);}
  @JavascriptInterface public void setBackground(boolean enabled){getPreferences(0).edit().putBoolean("background",enabled).apply();if(enabled)MarketJob.schedule(MainActivity.this);else MarketJob.cancel(MainActivity.this);}
  @JavascriptInterface public void request(final String id,final String url){
   if(id==null||!id.matches("[0-9]{1,12}"))return;
   if(!SecurityGate.allowedDataUrl(url)){deliver(id,"","此数据来源未开放");return;}
   network.submit(new Runnable(){public void run(){try{deliver(id,HttpData.get(url),"");}catch(Exception e){deliver(id,"",e.getMessage()==null?"数据连接失败":e.getMessage());}}});
  }
 }
 private void deliver(final String id,final String value,final String error){runOnUiThread(new Runnable(){public void run(){if(web!=null&&!isFinishing())web.evaluateJavascript("window.nativeResult&&window.nativeResult("+JSONObject.quote(id)+","+JSONObject.quote(value)+","+JSONObject.quote(error)+");",null);}});}
 @Override public void onBackPressed(){if(web!=null){web.evaluateJavascript("!!(window.TechScopeBack&&window.TechScopeBack());",new ValueCallback<String>(){public void onReceiveValue(String handled){if(!"true".equals(handled))finish();}});}else super.onBackPressed();}
 @Override protected void onDestroy(){network.shutdownNow();if(web!=null){web.removeJavascriptInterface("Native");web.destroy();web=null;}super.onDestroy();}
}
