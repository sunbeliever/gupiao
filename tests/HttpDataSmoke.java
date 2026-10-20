package cn.techscope.app;
import org.json.JSONObject;
public final class HttpDataSmoke {
 public static void main(String[] args) throws Exception {
  String q=HttpData.get("https://qt.gtimg.cn/q=sz002230,sh688981,sh588000");
  if(!q.contains("科大讯飞")||!q.contains("中芯国际"))throw new AssertionError("GB18030 Chinese quote decoding failed");
  String h=HttpData.get("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh588000,day,2025-01-01,2025-12-31,320,hfq");
  JSONObject j=new JSONObject(h);int count=j.getJSONObject("data").getJSONObject("sh588000").getJSONArray("hfqday").length();
  if(count<200)throw new AssertionError("2025 native history missing");
  String encoded=JSONObject.quote(q);if(!encoded.startsWith("\"")||!encoded.endsWith("\""))throw new AssertionError("Bridge JSON serialization failed");
  System.out.println("Native HTTPS and Chinese quotes passed; 2025 ETF bars="+count+"; bridge quote serialization passed");
 }
}
