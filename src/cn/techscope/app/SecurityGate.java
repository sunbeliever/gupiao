package cn.techscope.app;
import java.net.URI;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
public final class SecurityGate {
 private static final Set<String> HOSTS=new HashSet<String>(Arrays.asList("qt.gtimg.cn","web.ifzq.gtimg.cn","push2.eastmoney.com","push2his.eastmoney.com","search-api-web.eastmoney.com"));
 private SecurityGate(){}
 public static boolean allowedDataUrl(String text){
  if(text==null||text.length()>16000)return false;
  try {URI u=new URI(text);String p=u.getPath();return "https".equals(u.getScheme())&&HOSTS.contains(u.getHost())&&u.getUserInfo()==null&&u.getFragment()==null&&(u.getPort()==-1||u.getPort()==443)&&p!=null&&!p.contains("..");}catch(Exception e){return false;}
 }
 public static boolean allowedKey(String key){return key!=null&&key.matches("[A-Za-z0-9][A-Za-z0-9_.-]{0,79}")&&!key.contains("..");}
 public static boolean externalHttps(String text){try{URI u=new URI(text);return "https".equals(u.getScheme())&&u.getHost()!=null&&u.getUserInfo()==null;}catch(Exception e){return false;}}
}
