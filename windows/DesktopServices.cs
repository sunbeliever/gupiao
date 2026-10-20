using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace TechScope.Desktop {
 public sealed class DesktopInstance : IDisposable {
  readonly Mutex mutex;
  public bool IsPrimary{get;private set;}
  public DesktopInstance(string profile){string key;using(var sha=SHA256.Create())key=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(Path.GetFullPath(profile).TrimEnd(Path.DirectorySeparatorChar).ToLowerInvariant()))).Replace("-","");mutex=new Mutex(false,"Local\\TechScopeDesktop.Instance."+key);try{IsPrimary=mutex.WaitOne(0);}catch(AbandonedMutexException){IsPrimary=true;}}
  public void Dispose(){if(IsPrimary){mutex.ReleaseMutex();IsPrimary=false;}mutex.Dispose();}
 }
 public static class DesktopPolicy {
  public static bool AllowedDataUrl(string text) {
   Uri u;if(string.IsNullOrEmpty(text)||text.Length>16000||!Uri.TryCreate(text,UriKind.Absolute,out u))return false;
   if(u.Scheme!="https"||u.Port!=443||u.UserInfo.Length!=0||u.Fragment.Length!=0)return false;
   string p=u.AbsolutePath;
   if(u.Host=="qt.gtimg.cn")return p.StartsWith("/q=",StringComparison.Ordinal);
   if(u.Host=="web.ifzq.gtimg.cn")return p=="/appstock/app/fqkline/get";
   if(u.Host=="push2.eastmoney.com")return p=="/api/qt/stock/get";
   if(u.Host=="push2his.eastmoney.com")return p=="/api/qt/stock/kline/get";
   if(u.Host=="search-api-web.eastmoney.com")return p=="/search/jsonp";
   if(u.Host=="np-anotice-stock.eastmoney.com")return p=="/api/security/ann";
   return false;
  }
  public static bool AllowedKey(string key){return key!=null&&Regex.IsMatch(key,"^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$")&&!key.Contains("..");}
  public static bool TrustedPage(string text){Uri u;return Uri.TryCreate(text,UriKind.Absolute,out u)&&u.Scheme=="https"&&u.Host=="app.techscope.local"&&u.Port==443&&u.UserInfo.Length==0;}
  public static bool ExternalHttps(string text){Uri u;return Uri.TryCreate(text,UriKind.Absolute,out u)&&u.Scheme=="https"&&u.UserInfo.Length==0&&u.Host.Length>0;}
 }

 public sealed class DesktopStore {
  private readonly string folder;private readonly object gate=new object();
  public DesktopStore(string folder){this.folder=Path.GetFullPath(folder);Directory.CreateDirectory(this.folder);}
  public string Read(string key){if(!DesktopPolicy.AllowedKey(key))return "";lock(gate){try{string f=Path.Combine(folder,key+".json");if(!File.Exists(f)||new FileInfo(f).Length>16*1024*1024)return "";return File.ReadAllText(f,Encoding.UTF8);}catch{return "";}}}
  public bool Write(string key,string value){if(!DesktopPolicy.AllowedKey(key)||value==null)return false;byte[] bytes=Encoding.UTF8.GetBytes(value);if(bytes.Length>8*1024*1024)return false;lock(gate){string f=Path.Combine(folder,key+".json"),tmp=f+".pending";try{using(var stream=new FileStream(tmp,FileMode.Create,FileAccess.Write,FileShare.None)){stream.Write(bytes,0,bytes.Length);stream.Flush(true);}if(File.Exists(f))File.Replace(tmp,f,null);else File.Move(tmp,f);return true;}catch{try{File.Delete(tmp);}catch{}return false;}}}
 }

 public sealed class DesktopHttp : IDisposable {
  private readonly HttpClient client;
  private readonly SemaphoreSlim slots=new SemaphoreSlim(4,4);
  public DesktopHttp(){ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;ServicePointManager.DefaultConnectionLimit=8;var handler=new HttpClientHandler{AllowAutoRedirect=false,AutomaticDecompression=DecompressionMethods.GZip|DecompressionMethods.Deflate};client=new HttpClient(handler){Timeout=TimeSpan.FromSeconds(20),MaxResponseContentBufferSize=12*1024*1024};}
  public async Task<string> Get(string url){
   if(!DesktopPolicy.AllowedDataUrl(url))throw new InvalidOperationException("此数据来源未开放");
   await slots.WaitAsync().ConfigureAwait(false);
   try{using(var req=new HttpRequestMessage(HttpMethod.Get,url)){
    req.Headers.UserAgent.ParseAdd("Mozilla/5.0 TechScopeDesktop/1.0");req.Headers.Referrer=new Uri(url.Contains("gtimg.cn")?"https://gu.qq.com/":"https://www.eastmoney.com/");
    using(var response=await client.SendAsync(req).ConfigureAwait(false)){
     if(response.StatusCode!=HttpStatusCode.OK)throw new IOException("数据源返回 "+(int)response.StatusCode);
     byte[] bytes=await response.Content.ReadAsByteArrayAsync().ConfigureAwait(false);
     return (new Uri(url).Host=="qt.gtimg.cn"?Encoding.GetEncoding("GB18030"):Encoding.UTF8).GetString(bytes).TrimStart('\uFEFF');
    }
   }}finally{slots.Release();}
  }
  public void Dispose(){client.Dispose();}
 }
}
