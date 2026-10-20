package cn.techscope.app;
import android.app.job.*;
import android.content.ComponentName;
import android.content.Context;
import java.net.URLEncoder;
import org.json.JSONObject;
public final class MarketJob extends JobService {
 private static final int ID=20261008;private volatile boolean stopped;
 private static final String SYMBOLS="sz002230,sz300308,sz300502,sh688981,sh603019,sz000977,sz002415,sh688256,sh600406,sz002371,sh600703,sh688111,sh600570,sh588000,sh512760,sh515070,sh512720,sh515880,sz159852";
 public static void schedule(Context c){JobScheduler j=(JobScheduler)c.getSystemService(Context.JOB_SCHEDULER_SERVICE);if(j!=null){JobInfo info=new JobInfo.Builder(ID,new ComponentName(c,MarketJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(30*60*1000L).setPersisted(true).setBackoffCriteria(60*1000L,JobInfo.BACKOFF_POLICY_EXPONENTIAL).build();j.schedule(info);}}
 public static void cancel(Context c){JobScheduler j=(JobScheduler)c.getSystemService(Context.JOB_SCHEDULER_SERVICE);if(j!=null)j.cancel(ID);}
 @Override public boolean onStartJob(final JobParameters params){stopped=false;new Thread(new Runnable(){public void run(){boolean retry=false;try{String q=HttpData.get("https://qt.gtimg.cn/q="+SYMBOLS);JSONObject cache=new JSONObject();cache.put("text",q);cache.put("fetchedAt",System.currentTimeMillis());if(!stopped)LocalStore.write(MarketJob.this,"background_quotes",cache.toString());
   String p="{\"uid\":\"\",\"keyword\":\"科技\",\"type\":[\"cmsArticleWebOld\"],\"client\":\"web\",\"clientType\":\"web\",\"clientVersion\":\"curr\",\"param\":{\"cmsArticleWebOld\":{\"searchScope\":\"default\",\"sort\":\"default\",\"pageIndex\":1,\"pageSize\":10,\"preTag\":\"\",\"postTag\":\"\"}}}";
   if(!stopped){String news=HttpData.get("https://search-api-web.eastmoney.com/search/jsonp?cb=cb&param="+URLEncoder.encode(p,"UTF-8"));JSONObject n=new JSONObject();n.put("text",news);n.put("fetchedAt",System.currentTimeMillis());LocalStore.write(MarketJob.this,"background_news",n.toString());}
  }catch(Exception e){retry=true;}if(!stopped)jobFinished(params,retry);}},"TechScope-watch").start();return true;}
 @Override public boolean onStopJob(JobParameters params){stopped=true;return true;}
}
