using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace TechScope.Desktop {
 [ComVisible(true),Guid("E0F28AD5-24D4-48E5-BE47-0D6681721796"),InterfaceType(ComInterfaceType.InterfaceIsIDispatch)]
 public interface IDesktopBridge {
  [DispId(1)]string Read(string key);
  [DispId(2)]bool Write(string key,string value);
  [DispId(3)]void Request(string id,string url);
  [DispId(4)]void OpenUrl(string url);
  [DispId(5)]void SetBackground(bool enabled);
 }
 [ComVisible(true),ClassInterface(ClassInterfaceType.None),ComDefaultInterface(typeof(IDesktopBridge))]
 public sealed class DesktopBridge : IDesktopBridge {
  readonly DesktopForm form;readonly DesktopStore store;readonly DesktopHttp http;
  internal DesktopBridge(DesktopForm form,DesktopStore store,DesktopHttp http){this.form=form;this.store=store;this.http=http;}
  public string Read(string key){return store.Read(key);}
  public bool Write(string key,string value){return store.Write(key,value);}
  public void Request(string id,string url){
   long numeric;if(!long.TryParse(id,out numeric)||id.Length>12||numeric<0)return;
   if(!DesktopPolicy.AllowedDataUrl(url)){form.Deliver(id,"","此数据来源未开放");return;}
   Task.Run(async delegate{try{string text=await http.Get(url).ConfigureAwait(false);form.Deliver(id,text,"");}catch(Exception e){form.Deliver(id,"",e is TaskCanceledException?"数据连接超时":e.Message);}});
  }
  public void OpenUrl(string url){if(!DesktopPolicy.ExternalHttps(url)||Program.VerificationPath!=null)return;try{Process.Start(new ProcessStartInfo(url){UseShellExecute=true});}catch{}}
  public void SetBackground(bool enabled){form.SetWatching(enabled);}
 }

 internal sealed class DesktopForm : Form {
  readonly WebView2 view=new WebView2();readonly DesktopHttp http=new DesktopHttp();
  readonly DesktopStore store=new DesktopStore(Path.Combine(Program.DataRoot,"cache"));
  readonly Timer background=new Timer{Interval=5*60*1000};
  readonly Label loading=new Label{Dock=DockStyle.Fill,Text="正在打开科技观察…",TextAlign=ContentAlignment.MiddleCenter,Font=new Font("Microsoft YaHei",16),ForeColor=Color.FromArgb(20,39,71),BackColor=Color.White};
  bool closing,watching=true,collecting,verified;DesktopBridge bridge;
  internal int ExitStatus;
  internal DesktopForm(){
   Text=Program.WindowTitle+(Program.VerificationPath!=null?"（验证）":"");StartPosition=FormStartPosition.CenterScreen;
   Size area=Screen.PrimaryScreen.WorkingArea.Size;ClientSize=new Size(Math.Min(1220,area.Width-70),Math.Min(860,area.Height-85));MinimumSize=new Size(900,620);
   try{Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);}catch{}
   view.Dock=DockStyle.Fill;view.DefaultBackgroundColor=Color.White;Controls.Add(view);Controls.Add(loading);loading.BringToFront();
   if(Program.VerificationPath!=null){ShowInTaskbar=false;Opacity=0;}
   background.Tick+=async delegate{await CollectBackground();};
   Shown+=async delegate{try{await Initialize();}catch(Exception e){Fail(e);}};
   FormClosed+=delegate{closing=true;background.Stop();background.Dispose();http.Dispose();view.Dispose();};
  }
  async Task Initialize(){
   var environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(Program.DataRoot,"browser"));
   await view.EnsureCoreWebView2Async(environment);var core=view.CoreWebView2;
   core.Settings.AreDevToolsEnabled=Program.VerificationPath!=null;core.Settings.AreDefaultContextMenusEnabled=false;
   core.Settings.IsPasswordAutosaveEnabled=false;core.Settings.IsGeneralAutofillEnabled=false;core.Settings.AreDefaultScriptDialogsEnabled=false;
   core.SetVirtualHostNameToFolderMapping("app.techscope.local",Path.Combine(Program.RuntimeRoot,"assets"),CoreWebView2HostResourceAccessKind.DenyCors);
   core.NavigationStarting+=delegate(object sender,CoreWebView2NavigationStartingEventArgs e){if(!DesktopPolicy.TrustedPage(e.Uri)&&e.Uri!="about:blank"){e.Cancel=true;if(e.IsUserInitiated&&bridge!=null)bridge.OpenUrl(e.Uri);}};
   core.NewWindowRequested+=delegate(object sender,CoreWebView2NewWindowRequestedEventArgs e){e.Handled=true;if(e.IsUserInitiated&&bridge!=null)bridge.OpenUrl(e.Uri);};
   core.PermissionRequested+=delegate(object sender,CoreWebView2PermissionRequestedEventArgs e){e.State=CoreWebView2PermissionState.Deny;};
   core.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All);
   core.WebResourceRequested+=delegate(object sender,CoreWebView2WebResourceRequestedEventArgs e){if(!DesktopPolicy.TrustedPage(e.Request.Uri))e.Response=environment.CreateWebResourceResponse(new MemoryStream(),403,"Blocked","Content-Type: text/plain");};
   bridge=new DesktopBridge(this,store,http);core.AddHostObjectToScript("Desktop",bridge);
   await core.AddScriptToExecuteOnDocumentCreatedAsync("(function(){const h=chrome.webview.hostObjects.sync.Desktop;window.Native={read:k=>h.Read(k),write:(k,v)=>h.Write(k,v),request:(id,url)=>h.Request(id,url),openUrl:u=>h.OpenUrl(u),setBackground:e=>h.SetBackground(!!e)};})();");
   core.NavigationCompleted+=async delegate(object sender,CoreWebView2NavigationCompletedEventArgs e){
    if(!e.IsSuccess){Fail(new IOException("界面打开失败："+e.WebErrorStatus));return;}
    loading.Visible=false;if(Program.VerificationPath!=null&&!verified){verified=true;try{await Verify();}catch(Exception error){Fail(error);}}
   };
   core.Navigate("https://app.techscope.local/index.html");
  }
  internal void Deliver(string id,string payload,string error){
   if(closing||IsDisposed||!IsHandleCreated)return;
   try{BeginInvoke(new Action(async delegate{if(closing||view.CoreWebView2==null)return;try{await view.ExecuteScriptAsync("window.nativeResult&&window.nativeResult("+Program.Json.Serialize(id)+","+Program.Json.Serialize(payload)+","+Program.Json.Serialize(error)+");");}catch{}}));}catch(InvalidOperationException){}
  }
  internal void SetWatching(bool enabled){watching=enabled;if(closing||IsDisposed)return;try{BeginInvoke(new Action(delegate{background.Enabled=watching&&Program.VerificationPath==null;}));}catch(InvalidOperationException){}}
  async Task CollectBackground(){
   if(collecting||!watching||closing)return;collecting=true;
   try{
    string quotes=await http.Get("https://qt.gtimg.cn/q=sz002230,sz300308,sz300502,sh688981,sh603019,sz000977,sz002415,sh688256,sh600406,sz002371,sh600703,sh688111,sh600570,sh588000,sh512760,sh515070,sh512720,sh515880,sz159852");
    if(!watching||closing)return;store.Write("background_quotes",Program.Json.Serialize(new{ text=quotes,fetchedAt=DateTime.UtcNow.ToString("o")}));
    string param="{\"uid\":\"\",\"keyword\":\"科技\",\"type\":[\"cmsArticleWebOld\"],\"client\":\"web\",\"clientType\":\"web\",\"clientVersion\":\"curr\",\"param\":{\"cmsArticleWebOld\":{\"searchScope\":\"default\",\"sort\":\"default\",\"pageIndex\":1,\"pageSize\":10,\"preTag\":\"\",\"postTag\":\"\"}}}";
    string news=await http.Get("https://search-api-web.eastmoney.com/search/jsonp?cb=cb&param="+Uri.EscapeDataString(param));
    if(watching&&!closing)store.Write("background_news",Program.Json.Serialize(new{text=news,fetchedAt=DateTime.UtcNow.ToString("o")}));
   }catch(Exception e){store.Write("background_status",Program.Json.Serialize(new{error=e.Message,at=DateTime.UtcNow.ToString("o")}));}finally{collecting=false;}
  }
  async Task<string> Eval(string script){return await view.ExecuteScriptAsync(script);}
  async Task Wait(string expression,int milliseconds){DateTime end=DateTime.UtcNow.AddMilliseconds(milliseconds);while(DateTime.UtcNow<end){if(await Eval("!!("+expression+")")=="true")return;await Task.Delay(120);}throw new TimeoutException("界面检查超时："+expression);}
  async Task Check(string expression,string name,List<string> checks){if(await Eval("!!("+expression+")")!="true")throw new Exception("检查未通过："+name);checks.Add(name);}
  async Task Verify(){
   var checks=new List<string>();await Wait("document.querySelector('#page-observe').textContent.length>100",20000);
   await Check("location.origin==='https://app.techscope.local'","trusted desktop window",checks);
   await Eval("document.querySelector('[data-tab=model]').click();var t=document.querySelector('#auto-sync-toggle');t.checked=false;t.dispatchEvent(new Event('change',{bubbles:true}));");
   await Check("Market.write('verify.desktop',{name:'中文缓存',n:23})&&Market.read('verify.desktop').name==='中文缓存'","actual native bridge Unicode persistence",checks);
   await Check("document.documentElement.scrollWidth<=innerWidth+1","desktop layout fits",checks);
   await Check("ResearchUI.summary()&&ResearchUI.summary().total>0&&Array.isArray(Market.read('forecast.index'))","first publications persisted through native cache",checks);
   await Check("document.querySelector('#research-journal')&&document.querySelector('#research-journal').textContent.includes('没有发布在先')||document.querySelector('#research-journal')&&ResearchUI.summary().scored>=0","prospective journal shown",checks);
   foreach(string tab in new[]{"observe","detail","news","backtest","model"}){
    await Eval("document.querySelector('[data-tab="+tab+"]').click()");
    await Check("!document.querySelector('#page-"+tab+"').hidden&&document.querySelector('#page-"+tab+"').textContent.length>100",tab+" page",checks);
    await Check("document.documentElement.scrollWidth<=innerWidth+1",tab+" layout fits",checks);
   }
   await Eval("document.querySelector('[data-tab=observe]').click();document.querySelector('[data-type=etf]').click();");
   await Check("document.querySelectorAll('#page-observe [data-symbol]').length===6","ETF filter",checks);
   await Check("document.querySelector('#research-readiness').textContent.includes('暂不发出实盘买入推荐')","readiness retained after filtering",checks);
   await Eval("document.querySelector('[data-tab=detail]').click();var s=document.querySelector('#detail-select');s.value='sh688981';s.dispatchEvent(new Event('change',{bubbles:true}));");
   await Check("Market.read('ui.selected')==='sh688981'&&document.querySelector('#page-detail').textContent.includes('市盈率')||Market.read('ui.selected')==='sh688981'&&document.querySelector('#page-detail').textContent.includes('PE / TTM')","stock selection and parameters",checks);
   await Eval("document.querySelector('[data-tab=backtest]').click();document.querySelector('[data-year=\"2025\"]').click();document.querySelector('#run-backtest').click();");
   await Wait("!document.querySelector('#run-backtest').disabled",20000);
   await Check("Market.read('report.2025')&&Math.abs(Market.read('report.2025').mae-TECH_SEED.reports['2025'].mae)<1e-12","frozen 2025 rerun consistency",checks);
   await Eval("document.querySelector('[data-year=\"2026\"]').click();document.querySelector('#run-backtest').click();");
   await Wait("!document.querySelector('#run-backtest').disabled",20000);
   await Check("Market.read('report.2026')&&Number.isFinite(Market.read('report.2026').mae)","2026 backtest",checks);
   await Check("Market.read('report.2026').baselines&&document.querySelectorAll('#research-baselines tbody tr').length===4","same-fold baseline comparison",checks);
   await Eval("TechScopeUI.switchTab('model');");
   await Check("document.querySelector('#start-paper')&&RESEARCH_RESULTS.historical.rounds.length===8&&document.querySelector('#research-paper').textContent.includes('8轮')","paper controls and frozen historical results",checks);
   await Check("document.querySelector('#small-budget').value==='10000'&&document.querySelector('#small-position').value==='10000'&&document.querySelector('#small-position').disabled&&document.querySelector('.beginner-guide').textContent.includes('胜率')","full-capital settings and beginner explanations",checks);
   await Check("document.querySelectorAll('#ranking-research-table tbody tr').length===8&&document.querySelector('#research-methods').textContent.includes('未部署')&&RESEARCH_RESULTS.methodReview.monthlyBudgetYuan===100&&RESEARCH_RESULTS.methodReview.paidServicesEnabled===false","researched methods, undeployed ranking comparison and100-yuan budget",checks);
   await Eval("var __fixture={universe:[{symbol:'sz002230',name:'测试',type:'stock'},{symbol:'sh588000',name:'ETF',type:'etf'}],quotes:{sz002230:{price:50,sourceTime:'2026-10-19 11:10:00'},sh588000:{price:1,sourceTime:'2026-10-19 11:10:00'}},predictions:{sz002230:{eligible:true,expectedReturn:.03}},now:'2026-10-19T03:10:00Z',budget:100000};window.__paperFixture=Paper.start(__fixture);window.__paperMarked=Paper.mark(__paperFixture,{sz002230:{price:51,sourceTime:'2026-10-19 11:11:00'}},'2026-10-19T03:11:00Z');");
   await Check("__paperMarked.account.equity>__paperFixture.account.equity&&__paperMarked.horizonAccuracy===null&&Market.write('verify.paper',__paperMarked)&&Market.read('verify.paper').account.holdings[0].shares>0","paper engine and native persistence in desktop runtime",checks);
   await Eval("window.__autoFixture=Paper.startAuto({universe:[{symbol:'sh588000',name:'ETF',type:'etf'}],quotes:{sh588000:{price:1,open:1,sourceTime:'2026-10-20 09:30:00'}},predictions:{sh588000:{eligible:true,expectedReturn:.06,asOf:'2026-10-19'}},model:{version:'runtime-fixture'},now:'2026-10-20T01:30:00Z'});window.__autoMarked=Paper.stepAuto(__autoFixture,{sh588000:{price:1.08,open:1,sourceTime:'2026-10-20 09:31:00'}},'2026-10-20T01:31:00Z');");
   await Check("document.querySelector('#start-auto-paper')&&__autoMarked.account.holdings.length===1&&__autoMarked.automation.events.some(e=>e.action==='exit_blocked'&&e.reason==='t_plus_one')&&__autoMarked.realizedPnl===0&&Market.write('verify.automatic',__autoMarked)&&Market.read('verify.automatic').automation.durationMs===1800000","automatic button, frozen decision engine, T+1 blocking and persistence (synthetic runtime fixture)",checks);
   await Check("RESEARCH_RESULTS.automaticHistory&&RESEARCH_RESULTS.automaticHistory.summary.completeWindows===24&&RESEARCH_RESULTS.automaticHistory.summary.profitableExposedWindows===2&&RESEARCH_RESULTS.automaticHistory.positiveEstimatedLiquidationWindows===0&&document.querySelectorAll('#automatic-history-results tbody tr').length===24","all24 historical windows including losses and exit-cost audit render",checks);
   await Eval("window.__fullInput={universe:[{symbol:'sh588000',name:'ETF',type:'etf'}],quotes:{sh588000:{price:1,open:1,sourceTime:'2026-10-20 09:30:00'}},predictions:{sh588000:{eligible:true,expectedReturn:.03,asOf:'2026-10-19'}},budget:10000,allocationMode:'full',now:'2026-10-20T01:30:00Z',profile:'beginner'};window.__fullPaper=Paper.start(__fullInput);window.__splitPaper=Paper.mark({startedAt:'2026-07-02T01:30:00Z',account:{cash:900,holdings:[{symbol:'sh515880',shares:100,entryPrice:1,entrySourceTime:'2026-07-02 09:30:00',lastPrice:1,lastSourceTime:'2026-07-03 15:00:00'}]},benchmark:{cash:1000,holdings:[]},curve:[]},{sh515880:{price:.5,sourceTime:'2026-07-06 09:31:00'}},'2026-07-06T01:31:00Z');");
   await Check("__fullPaper.account.cash<120&&__fullPaper.account.holdings[0].shares===9900&&__splitPaper.account.equity===1000&&__splitPaper.account.holdings[0].shares===200&&__splitPaper.account.holdings[0].originalEntryPrice===1","full10000 allocation and corporate-action accounting (synthetic runtime fixtures)",checks);
   await Eval("window.__residualInput={universe:[{symbol:'sh600000',name:'STOCK',type:'stock'},{symbol:'sh588000',name:'ETF',type:'etf'},{symbol:'sh512760',name:'ETF2',type:'etf'}],quotes:{sh600000:{price:60,open:60,sourceTime:'2026-10-20 09:30:00'},sh588000:{price:1,open:1,sourceTime:'2026-10-20 09:30:00'},sh512760:{price:1,open:1,sourceTime:'2026-10-20 09:30:00'}},predictions:{sh600000:{eligible:true,expectedReturn:.03,asOf:'2026-10-19'},sh588000:{eligible:true,expectedReturn:.001,asOf:'2026-10-19'},sh512760:{eligible:true,expectedReturn:.001,asOf:'2026-10-19'}},budget:10000,allocationMode:'full',now:'2026-10-20T01:30:00Z'};window.__residualStart=Paper.startAuto(__residualInput);window.__residualEnd=Paper.stepAuto(__residualStart,{sh600000:{price:60,open:60,sourceTime:'2026-10-20 09:31:00'},sh588000:{price:.95,open:1,sourceTime:'2026-10-20 09:31:00'},sh512760:{price:.95,open:1,sourceTime:'2026-10-20 09:31:00'}},'2026-10-20T01:31:00Z');");
   await Check("__residualStart.account.holdings.length===1&&__residualEnd.account.holdings.length===3&&__residualEnd.account.cash>=0&&__residualEnd.account.cash<200&&__residualEnd.automation.lastPlan.budget===__residualStart.account.cash","later full-capital entries use remaining cash and slots (synthetic runtime fixture)",checks);
   await Check("RESEARCH_RESULTS.fullCapitalOptimization.targets.profitProbability===.7&&RESEARCH_RESULTS.fullCapitalOptimization.targets.achieved===false&&document.querySelectorAll('#full-capital-table tbody tr').length===6&&document.querySelectorAll('#profit-probability-table tbody tr').length===6","full-capital research and failed probability calibration displayed without70%claim",checks);
   if(await Eval("Paper.trading(Date.now())")=="true"){
    await Eval("window.__previousPaper=Market.read('paper.current')&&Market.read('paper.current').startedAt;document.querySelector('#start-paper').click();");
    await Wait("Market.read('paper.current')&&Market.read('paper.current').startedAt!==window.__previousPaper&&!document.querySelector('#start-paper').disabled",55000);
    await Check("Market.read('paper.current').budget===10000&&Market.read('paper.current').selection==='beginner_model_experiment'&&JSON.stringify(Market.read('paper.current').account.holdings.map(h=>h.symbol))===JSON.stringify(Market.read('paper.current').selectionPlan.selected.map(r=>r.symbol))&&Market.read('paper.current').account.cash>=8500&&document.querySelector('#research-paper').textContent.includes('模拟总资产')","actual paper button freezes software-selected small-budget holdings or cash",checks);
   }
   await Eval("window.__desktopNetwork={done:false};(async function(){try{const q=await Market.quotes();const h=await Market.history('sh688981');const raw=await Market.rawHistory('sh688981');const pool=await Market.syncHistories();const dates=Market.UNIVERSE.map(u=>pool[u.symbol]?.at(-1)?.date||'');const news=await Market.news();const ann=await Market.announcements('sh688981',true);window.__desktopNetwork={done:true,quotes:Object.keys(q).length,liveQuotes:Object.values(q).some(x=>!x.cached),news:news.length,liveNews:news.some(x=>!x.cached),announcements:ann.items.length,liveAnnouncements:!ann.cached,announcementFirstSeen:ann.items[0]&&ann.items[0].firstSeenAt,sourceTime:Object.values(q)[0].sourceTime,historyAsOf:h[h.length-1].date,rawAsOf:raw[raw.length-1].date,poolHistoryCount:dates.length,poolHistoryDates:[...new Set(dates)],allHistoriesCurrent:dates.every(d=>d===new Date(Date.now()+8*3600000).toISOString().slice(0,10))};}catch(e){window.__desktopNetwork={done:true,error:e.message};}})();");
   await Wait("window.__desktopNetwork.done",60000);
   await Check("!window.__desktopNetwork.error&&window.__desktopNetwork.liveQuotes&&window.__desktopNetwork.liveNews&&window.__desktopNetwork.liveAnnouncements&&window.__desktopNetwork.announcements>0","live quotes, news and company announcements",checks);
   object network=Program.Json.DeserializeObject(await Eval("window.__desktopNetwork"));
   await Check("__desktopNetwork.poolHistoryCount===19&&__desktopNetwork.poolHistoryDates.every(d=>/^\\d{4}-\\d{2}-\\d{2}$/.test(d))","all19 pool dates audited; see allHistoriesCurrent for actual source completeness",checks);
   await Eval("TechScopeUI.selectInstrument('sh688981');");
   await Wait("document.querySelector('#research-detail [data-ann]')",25000);
   await Check("document.querySelector('#research-code').value==='688981'&&document.querySelector('#research-detail [data-ann]').textContent.length>5","selected company source links and broker code",checks);
   string dir=Path.GetDirectoryName(Program.VerificationPath);Directory.CreateDirectory(dir);
   using(var stream=File.Create(Path.Combine(dir,"detail-window.png")))await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);
   await Eval("TechScopeUI.switchTab('model')");await Task.Delay(150);
   using(var stream=File.Create(Path.Combine(dir,"paper-window.png")))await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);
   await Eval("document.querySelector('[data-tab=observe]').click();document.querySelector('[data-type=all]').click();");await Task.Delay(300);
   using(var stream=File.Create(Path.Combine(dir,"desktop-window.png")))await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);
   object embeddedResearch=Program.Json.DeserializeObject(await Eval("Object.fromEntries(['live','candidateLive','smallBudgetLive','smallBudgetV2Live'].map(k=>{const r=RESEARCH_RESULTS[k];return[k,r?{done:!!r.done,startedAt:r.startedAt||null,observedAt:r.observedAt||null,elapsedMs:r.elapsedMs||0}:null]}))"));
   object automaticReplay=Program.Json.DeserializeObject(await Eval("({decisionsSha256:RESEARCH_RESULTS.automaticHistory.decisionsSha256,scoredAt:RESEARCH_RESULTS.automaticHistory.scoredAt,summary:RESEARCH_RESULTS.automaticHistory.summary,positiveEstimatedLiquidationWindows:RESEARCH_RESULTS.automaticHistory.positiveEstimatedLiquidationWindows})"));
   object fullCapitalResearch=Program.Json.DeserializeObject(await Eval("({selectionSha256:RESEARCH_RESULTS.fullCapitalOptimization.selectionSha256,targets:RESEARCH_RESULTS.fullCapitalOptimization.targets,rows:RESEARCH_RESULTS.fullCapitalOptimization.rows.length,probabilityRows:RESEARCH_RESULTS.fullCapitalOptimization.probability.length,deployed:false})"));
   var report=new Dictionary<string,object>{{"ok",true},{"verifiedAt",DateTime.UtcNow.ToString("o")},{"checks",checks},{"network",network},{"embeddedResearch",embeddedResearch},{"webviewVersion",view.CoreWebView2.Environment.BrowserVersionString},{"singleFile",true},{"origin",view.CoreWebView2.Source}};
   report.Add("automaticReplay",automaticReplay);report.Add("fullCapitalResearch",fullCapitalResearch);File.WriteAllText(Program.VerificationPath,Program.Json.Serialize(report),Encoding.UTF8);Close();
  }
  void Fail(Exception e){ExitStatus=1;if(Program.VerificationPath!=null){Directory.CreateDirectory(Path.GetDirectoryName(Program.VerificationPath));File.WriteAllText(Program.VerificationPath,Program.Json.Serialize(new{ok=false,error=e.ToString()}),Encoding.UTF8);Close();}else{loading.Text="打开失败："+e.Message+"\n请检查网络或 WebView2 运行组件。";loading.Visible=true;loading.BringToFront();}}
 }
}
