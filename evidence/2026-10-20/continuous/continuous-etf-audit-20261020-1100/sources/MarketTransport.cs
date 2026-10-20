using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace TechScope.Desktop {
 internal static class MarketTransport {
  const string TransportVersion="dotnet-desktop-http-v1";
  static int Main(string[] args){
   Console.OutputEncoding=new UTF8Encoding(false);
   if(args.Length!=1||!DesktopPolicy.AllowedDataUrl(args[0])){
    Console.Error.WriteLine("{\"error\":\"transport_url_rejected\"}");return 2;
   }
   try{
    string body;using(var http=new DesktopHttp())body=http.Get(args[0]).GetAwaiter().GetResult();
    var result=new{url=args[0],body,receivedAt=DateTime.UtcNow.ToString("o"),transport=TransportVersion};
    Console.WriteLine(new JavaScriptSerializer{MaxJsonLength=16*1024*1024}.Serialize(result));return 0;
   }catch(Exception error){
    var types=new List<string>();for(Exception current=error;current!=null;current=current.InnerException)types.Add(current.GetType().Name);
    Console.Error.WriteLine(new JavaScriptSerializer().Serialize(new{error=error is TaskCanceledException?"transport_timeout":"transport_request_failed",types}));return 1;
   }
  }
 }
}
