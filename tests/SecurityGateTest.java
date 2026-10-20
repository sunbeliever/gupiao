package cn.techscope.app;
public final class SecurityGateTest {
 static void accepted(String u){if(!SecurityGate.allowedDataUrl(u))throw new AssertionError("Expected allowed data URL");}
 static void denied(String u){if(SecurityGate.allowedDataUrl(u))throw new AssertionError("Expected denied data URL: "+u);}
 public static void main(String[] args){
 accepted("https://qt.gtimg.cn/q=sz300308");accepted("https://search-api-web.eastmoney.com/search/jsonp?cb=cb");
 denied("http://qt.gtimg.cn/q=x");denied("https://qt.gtimg.cn.evil.test/q=x");denied("https://qt.gtimg.cn@evil.test/");denied("file:///data/user/0/x");denied("https://127.0.0.1/");denied("https://qt.gtimg.cn:8443/q=x");denied("https://qt.gtimg.cn/../private");
 if(!SecurityGate.allowedKey("hist_sh588000")||SecurityGate.allowedKey("../model")||SecurityGate.allowedKey("a/b"))throw new AssertionError("Cache traversal validation failed");
 if(!SecurityGate.allowedKey("ui.selected")||!SecurityGate.allowedKey("model.current"))throw new AssertionError("Namespaced app settings must persist");
 System.out.println("Native security behaviors passed");
 }
}
