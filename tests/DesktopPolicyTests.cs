using System;
using System.IO;
using System.Threading.Tasks;
using TechScope.Desktop;
internal static class DesktopPolicyTests {
 static int count;
 static void Check(bool value,string message){if(!value)throw new Exception(message);count++;}
 static int Main(string[] args){try{
  Check(DesktopPolicy.AllowedDataUrl("https://qt.gtimg.cn/q=sz002230,sh588000"),"Tencent quote should work");
  Check(DesktopPolicy.AllowedDataUrl("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh588000,day,2025-01-01,2025-12-31,320,hfq"),"Tencent history should work");
  Check(DesktopPolicy.AllowedDataUrl("https://search-api-web.eastmoney.com/search/jsonp?cb=cb"),"News should work");
  Check(DesktopPolicy.AllowedDataUrl("https://np-anotice-stock.eastmoney.com/api/security/ann?stock_list=300308"),"Company announcements should work");
  Check(!DesktopPolicy.AllowedDataUrl("https://np-anotice-stock.eastmoney.com/private"),"Announcements host cannot access unrelated paths");
  foreach(string u in new[]{"http://qt.gtimg.cn/q=sz002230","https://qt.gtimg.cn.evil.test/q=x","https://qt.gtimg.cn@evil.test/q=x","https://qt.gtimg.cn:8443/q=x","file:///C:/Windows/win.ini","https://127.0.0.1/","https://qt.gtimg.cn/private","https://qt.gtimg.cn/q=x#fragment"})Check(!DesktopPolicy.AllowedDataUrl(u),"Unsafe URL was allowed: "+u);
  Check(DesktopPolicy.AllowedKey("model.current"),"Namespaced model should persist");Check(!DesktopPolicy.AllowedKey("../private"),"Cache traversal");Check(!DesktopPolicy.AllowedKey("a/b"),"Cache slash");
  string folder=Path.Combine(args[0],"cache-tests");var store=new DesktopStore(folder);
  Check(store.Read("missing")=="","Missing cache must be empty");Check(store.Write("model.current","{\"name\":\"中文模型\"}"),"First write failed");Check(store.Read("model.current")=="{\"name\":\"中文模型\"}","Unicode read mismatch");
  Check(store.Write("model.current","{\"version\":2}"),"Replacement failed");Check(store.Read("model.current")=="{\"version\":2}","Replacement read mismatch");Check(!store.Write("../escape","secret"),"Traversal write allowed");Check(store.Read("../escape")=="","Traversal read allowed");
  Check(DesktopPolicy.TrustedPage("https://app.techscope.local/index.html#observe"),"Local UI should work");Check(!DesktopPolicy.TrustedPage("https://app.techscope.local.evil.test/"),"Spoofed origin allowed");Check(!DesktopPolicy.ExternalHttps("javascript:alert(1)"),"Unsafe news link allowed");
  using(var first=new DesktopInstance(folder)){Check(first.IsPrimary,"First app should own profile");Check(Task.Run(delegate{using(var second=new DesktopInstance(folder))return !second.IsPrimary;}).Result,"Second app must not share the same cache profile");Check(Task.Run(delegate{using(var other=new DesktopInstance(folder+"-other"))return other.IsPrimary;}).Result,"Independent verification profile should work");}
  using(var next=new DesktopInstance(folder))Check(next.IsPrimary,"Profile must unlock after closing");
  Console.WriteLine("PASS "+count+" desktop security/cache behaviors");return 0;
 }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}}
}
