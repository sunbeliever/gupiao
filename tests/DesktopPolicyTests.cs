using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using TechScope.Desktop;
internal static class DesktopPolicyTests {
 static int count;
 static void Check(bool value,string message){if(!value)throw new Exception(message);count++;}
 static string FileHash(string file){using(var sha=SHA256.Create())using(var stream=File.OpenRead(file))return Convert.ToBase64String(sha.ComputeHash(stream));}
 static void ContinuousReadTests(string parent){
  string folder=Path.Combine(parent,"strict-"+Guid.NewGuid().ToString("N")),key="paper.continuous.current",file=Path.Combine(folder,key+".json");var store=new DesktopStore(folder);
  Check(store.Read(key)==null,"Only a missing continuous account may return null");
  Check(store.Write(key,""),"Empty account fixture write failed");string before=FileHash(file);
  Check(store.Read(key)=="","An existing empty account is corrupt data, not missing");Check(FileHash(file)==before,"Empty account read changed original bytes");
  string malformed="{\"schema\":2,broken";Check(store.Write(key,malformed),"Malformed fixture write failed");before=FileHash(file);
  Check(store.Read(key)==malformed,"Malformed account bytes must reach the caller for explicit corruption reporting");Check(FileHash(file)==before,"Malformed account read changed original bytes");
  bool locked=false;using(var held=new FileStream(file,FileMode.Open,FileAccess.ReadWrite,FileShare.None)){try{store.Read(key);}catch(IOException){locked=true;}}
  Check(locked,"An exclusively locked continuous account must throw instead of masquerading as missing or empty");Check(FileHash(file)==before,"Failed locked read changed original bytes");
  using(var large=new FileStream(file,FileMode.Create,FileAccess.Write,FileShare.None))large.SetLength(16*1024*1024+1);before=FileHash(file);bool oversized=false;
  try{store.Read(key);}catch(InvalidDataException){oversized=true;}
  Check(oversized,"An oversized continuous account must throw instead of masquerading as missing or empty");Check(FileHash(file)==before,"Oversized account read changed original bytes");
  File.WriteAllBytes(file,new byte[]{0xc3,0x28});before=FileHash(file);bool invalidEncoding=false;
  try{store.Read(key);}catch(DecoderFallbackException){invalidEncoding=true;}
  Check(invalidEncoding,"Invalid account encoding must be reported, never replaced or hidden");Check(FileHash(file)==before,"Invalid-encoding account read changed original bytes");
 }
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
  ContinuousReadTests(folder);
  Check(DesktopPolicy.TrustedPage("https://app.techscope.local/index.html#observe"),"Local UI should work");Check(!DesktopPolicy.TrustedPage("https://app.techscope.local.evil.test/"),"Spoofed origin allowed");Check(!DesktopPolicy.ExternalHttps("javascript:alert(1)"),"Unsafe news link allowed");
  using(var first=new DesktopInstance(folder)){Check(first.IsPrimary,"First app should own profile");Check(Task.Run(delegate{using(var second=new DesktopInstance(folder))return !second.IsPrimary;}).Result,"Second app must not share the same cache profile");Check(Task.Run(delegate{using(var other=new DesktopInstance(folder+"-other"))return other.IsPrimary;}).Result,"Independent verification profile should work");}
  using(var next=new DesktopInstance(folder))Check(next.IsPrimary,"Profile must unlock after closing");
  Console.WriteLine("PASS "+count+" desktop security/cache behaviors");return 0;
 }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}}
}
