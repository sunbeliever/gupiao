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
  List<string> verificationChecks;object verificationNetwork,verificationPersistence;
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
   var checks=new List<string>();verificationChecks=checks;await Wait("document.querySelector('#page-observe').textContent.length>100",20000);
   await Check("location.origin==='https://app.techscope.local'","trusted desktop window",checks);
   await Eval("window.__legacyPaperBefore=JSON.stringify(Market.read('paper.current'));window.__previousVerify=Market.read('verify.continuous.saved');window.__previousVerifyNonce=Market.read('verify.continuous.nonce');window.__priorResume=null;window.__previousSnapshotValid=!__previousVerifyNonce;if(__previousVerify){try{__priorResume=Paper.resume(__previousVerify.snapshot);__previousSnapshotValid=__previousVerify.nonce===__previousVerifyNonce;}catch(e){__previousSnapshotValid=false;}}window.__persistenceEvidence={mode:'synthetic_restart_persistence',prevSnapshotSeen:!!__previousVerify,previousNonce:__previousVerifyNonce||null,previousAccountId:__priorResume?__priorResume.accountId:null,previousEquity:__priorResume?__priorResume.account.equity:null,previousCash:__priorResume?__priorResume.account.cash:null,previousIntegrityHash:__priorResume?__priorResume.integrityHash:null};");
   await Check("__previousSnapshotValid&&(!__previousVerify||__priorResume.accountType==='continuous_paper'&&__priorResume.integrityHash===__previousVerify.snapshot.integrityHash)","previous native snapshot and nonce read before overwrite and resumed with integrity validation",checks);
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
   await Check("document.querySelector('#small-budget').value==='10000'&&document.querySelector('#small-position').disabled&&document.querySelector('#paper-preset').options.length===2&&document.querySelector('#research-paper').textContent.includes('同一账户跨日持有与退出')&&document.querySelector('#research-paper').textContent.includes('当前仍未证明投资优势')","named full-capital and learning presets with continuous account and unverified status",checks);
   await Check("document.querySelectorAll('#ranking-research-table tbody tr').length===8&&document.querySelector('#research-methods').textContent.includes('未部署')&&RESEARCH_RESULTS.methodReview.monthlyBudgetYuan===100&&RESEARCH_RESULTS.methodReview.paidServicesEnabled===false","researched methods, undeployed ranking comparison and100-yuan budget",checks);
   await Eval("var __fixture={universe:[{symbol:'sz002230',name:'测试',type:'stock'},{symbol:'sh588000',name:'ETF',type:'etf'}],quotes:{sz002230:{price:50,sourceTime:'2026-10-19 11:10:00'},sh588000:{price:1,sourceTime:'2026-10-19 11:10:00'}},predictions:{sz002230:{eligible:true,expectedReturn:.03}},now:'2026-10-19T03:10:00Z',budget:100000};window.__paperFixture=Paper.start(__fixture);window.__paperMarked=Paper.mark(__paperFixture,{sz002230:{price:51,sourceTime:'2026-10-19 11:11:00'}},'2026-10-19T03:11:00Z');");
   await Check("__paperMarked.account.equity>__paperFixture.account.equity&&__paperMarked.horizonAccuracy===null&&Market.write('verify.paper',__paperMarked)&&Market.read('verify.paper').account.holdings[0].shares>0","paper engine and native persistence in desktop runtime",checks);
   await Eval("window.__autoFixture=Paper.startAuto({universe:[{symbol:'sh588000',name:'ETF',type:'etf'}],quotes:{sh588000:{price:1,open:1,sourceTime:'2026-10-20 09:30:00'}},predictions:{sh588000:{eligible:true,expectedReturn:.06,asOf:'2026-10-19'}},model:{version:'runtime-fixture'},now:'2026-10-20T01:30:00Z'});window.__autoMarked=Paper.stepAuto(__autoFixture,{sh588000:{price:1.08,open:1,sourceTime:'2026-10-20 09:31:00'}},'2026-10-20T01:31:00Z');");
   await Check("document.querySelector('#start-auto-paper')&&__autoMarked.account.holdings.length===1&&__autoMarked.automation.events.some(e=>e.action==='exit_blocked'&&e.reason==='t_plus_one')&&__autoMarked.realizedPnl===0&&Market.write('verify.automatic',__autoMarked)&&Market.read('verify.automatic').automation.durationMs===1800000","automatic button, frozen decision engine, T+1 blocking and persistence (synthetic runtime fixture)",checks);
   await Eval("window.__autoResume=Paper.resume(JSON.parse(JSON.stringify(__autoMarked)));window.__tamperRejected=false;var __altered=JSON.parse(JSON.stringify(__autoMarked));__altered.account.cash+=1;try{Paper.resume(__altered);}catch(e){__tamperRejected=true;}");
   await Check("__autoResume.schema===2&&__autoResume.accountType==='continuous_paper'&&__autoResume.accountId===__autoMarked.accountId&&__autoResume.integrityHash===__autoMarked.integrityHash&&__tamperRejected&&__autoResume.fingerprint.model_hash&&__autoResume.fingerprint.rules_hash&&__autoResume.fingerprint.data_hash","continuous schema2 resume, fingerprints and tamper rejection (synthetic runtime fixture)",checks);
   await Eval("window.__partialInput={universe:[{symbol:'sh588000',name:'ETF',type:'etf'},{symbol:'sh512760',name:'ETF2',type:'etf'}],quotes:{sh588000:{price:1,open:1,sourceTime:'2026-10-20 09:30:00'},sh512760:{price:1,open:1,sourceTime:'2026-10-20 09:30:00'}},predictions:{sh588000:{eligible:true,expectedReturn:.5,asOf:'2026-10-19'},sh512760:{eligible:true,expectedReturn:.5,asOf:'2026-10-19'}},allocationMode:'full',now:'2026-10-20T01:30:00Z'};window.__partialStart=Paper.startAuto(__partialInput);window.__partialMarked=Paper.stepAuto(__partialStart,{sh588000:{price:.98,open:1,sourceTime:'2026-10-20 09:31:00'}},'2026-10-20T01:31:00Z');");
   await Check("__partialMarked.account.holdings.find(h=>h.symbol==='sh588000').lastPrice===.98&&__partialMarked.account.holdings.find(h=>h.symbol==='sh512760').lastPrice===1&&__partialMarked.account.holdings.find(h=>h.symbol==='sh512760').stale&&__partialMarked.entryHealth.ok===false&&__partialMarked.automation.dataFailureTicks===1&&__partialMarked.account.equity<__partialMarked.budget&&Math.abs(__partialMarked.account.cash+__partialMarked.account.marketValue+__partialMarked.account.receivableValue-__partialMarked.account.equity)<1e-8","pool outage blocks entry while valid holdings mark and stale holdings retain last price; equity identity (synthetic runtime fixture)",checks);
   await Eval("window.__observationEnd=__autoFixture;for(var __t=30;__t<=1800;__t+=30){var __time=new Date(Date.parse('2026-10-20T01:30:00Z')+__t*1000).toISOString(),__source=new Date(Date.parse(__time)+8*3600000).toISOString().slice(0,19).replace('T',' ');__observationEnd=Paper.stepAuto(__observationEnd,{sh588000:{price:1,open:1,sourceTime:__source,receivedAt:__time}},__time);}window.__crossDay=Paper.stepAuto(__observationEnd,{sh588000:{price:1.02,open:1,sourceTime:'2026-10-21 09:30:00',receivedAt:'2026-10-21T01:30:00Z'}},'2026-10-21T01:30:00Z');window.__permittedExit=Paper.stepAuto(__crossDay,{sh588000:{price:1.08,open:1,sourceTime:'2026-10-21 09:31:00',receivedAt:'2026-10-21T01:31:00Z'}},'2026-10-21T01:31:00Z');");
   await Check("__observationEnd.automation.done&&__observationEnd.automation.elapsedMs===1800000&&__crossDay.account.holdings[0].lastPrice===1.02&&__crossDay.account.equity>__observationEnd.account.equity&&__crossDay.account.cash===__observationEnd.account.cash&&__crossDay.accountId===__autoFixture.accountId&&__crossDay.budget===10000&&__permittedExit.account.holdings.length===0&&__permittedExit.closedPositions.filter(p=>p.account==='model').length===1&&__permittedExit.realizedPnl>0","observation ends without resetting holdings or capital; real next-session tick permits one exit (synthetic runtime fixture, no performance evidence)",checks);
   await Check("!TradingCalendar.isSession('2026-10-01')&&!Paper.trading(Date.parse('2026-10-01T01:30:00Z'))&&TradingCalendar.expectedCompletedSession('2026-10-08T10:00:00+08:00')==='2026-09-30'&&__autoFixture.account.holdings[0].sellableSession==='2026-10-21'&&__autoFixture.account.holdings[0].referenceOpen===1&&__autoFixture.account.holdings[0].horizon===20&&__autoFixture.account.holdings[0].maturitySession===TradingCalendar.maturitySession('2026-10-20',20)","exchange holidays, T+1 and immutable signal open/horizon/maturity contract",checks);
   await Eval("window.__verificationNonce=Date.now()+':'+Math.random().toString(16).slice(2);window.__persistCandidate=__priorResume||__partialMarked;window.__persistenceWritten=Market.write('verify.continuous.saved',{nonce:__verificationNonce,snapshot:__persistCandidate})&&Market.write('verify.continuous.nonce',__verificationNonce);Object.assign(__persistenceEvidence,{nonce:__verificationNonce,accountId:__persistCandidate.accountId,equity:__persistCandidate.account.equity,cash:__persistCandidate.account.cash,integrityHash:__persistCandidate.integrityHash});");
   await Check("__persistenceWritten&&Paper.resume(Market.read('verify.continuous.saved').snapshot).integrityHash===__persistCandidate.integrityHash&&Market.read('verify.continuous.nonce')===__verificationNonce","saved native continuous snapshot retains account, losses, cash and integrity for process restart",checks);
   verificationPersistence=Program.Json.DeserializeObject(await Eval("__persistenceEvidence"));
   await Check("RESEARCH_RESULTS.automaticHistory&&RESEARCH_RESULTS.automaticHistory.summary.completeWindows===24&&RESEARCH_RESULTS.automaticHistory.summary.profitableExposedWindows===2&&RESEARCH_RESULTS.automaticHistory.positiveEstimatedLiquidationWindows===0&&document.querySelectorAll('#automatic-history-results tbody tr').length===24","all24 historical windows including losses and exit-cost audit render",checks);
   await Eval("window.__fullInput={universe:[{symbol:'sh588000',name:'ETF',type:'etf'}],quotes:{sh588000:{price:1,open:1,sourceTime:'2026-10-20 09:30:00'}},predictions:{sh588000:{eligible:true,expectedReturn:.03,asOf:'2026-10-19'}},budget:10000,allocationMode:'full',now:'2026-10-20T01:30:00Z',profile:'beginner'};window.__fullPaper=Paper.start(__fullInput);window.__splitPaper=Paper.mark({startedAt:'2026-07-02T01:30:00Z',account:{cash:900,holdings:[{symbol:'sh515880',shares:100,entryPrice:1,entrySourceTime:'2026-07-02 09:30:00',lastPrice:1,lastSourceTime:'2026-07-03 15:00:00'}]},benchmark:{cash:1000,holdings:[]},curve:[]},{sh515880:{price:.5,sourceTime:'2026-07-06 09:31:00'}},'2026-07-06T01:31:00Z');");
   await Check("__fullPaper.account.cash<120&&__fullPaper.account.holdings[0].shares===9900&&__splitPaper.account.equity===1000&&__splitPaper.account.holdings[0].shares===200&&__splitPaper.account.holdings[0].originalEntryPrice===1","full10000 allocation and corporate-action accounting (synthetic runtime fixtures)",checks);
   await Eval("window.__residualInput={universe:[{symbol:'sh515880',name:'synthetic60ETF',type:'etf'},{symbol:'sh588000',name:'ETF',type:'etf'},{symbol:'sh512760',name:'ETF2',type:'etf'}],quotes:{sh515880:{price:60,open:60,sourceTime:'2026-10-20 09:30:00'},sh588000:{price:1,open:1,sourceTime:'2026-10-20 09:30:00'},sh512760:{price:1,open:1,sourceTime:'2026-10-20 09:30:00'}},predictions:{sh515880:{eligible:true,expectedReturn:.03,asOf:'2026-10-19'},sh588000:{eligible:true,expectedReturn:.001,asOf:'2026-10-19'},sh512760:{eligible:true,expectedReturn:.001,asOf:'2026-10-19'}},budget:10000,allocationMode:'full',now:'2026-10-20T01:30:00Z'};window.__residualStart=Paper.startAuto(__residualInput);window.__residualEnd=Paper.stepAuto(__residualStart,{sh515880:{price:60,open:60,sourceTime:'2026-10-20 09:31:00'},sh588000:{price:.95,open:1,sourceTime:'2026-10-20 09:31:00'},sh512760:{price:.95,open:1,sourceTime:'2026-10-20 09:31:00'}},'2026-10-20T01:31:00Z');");
   await Check("__residualStart.account.holdings.length===1&&__residualEnd.account.holdings.length===3&&__residualEnd.account.holdings.every(h=>h.type==='etf')&&__residualEnd.account.cash>=0&&__residualEnd.account.cash<200&&Math.abs(__residualEnd.automation.lastPlan.budget-__residualStart.account.cash)<1e-8","later full-capital entries use remaining cash and slots (synthetic ETF runtime fixture)",checks);
   await Eval("window.__badSignal=Paper.plan({...__fullInput,predictions:{sh588000:{eligible:true,expectedReturn:.03,asOf:'2026-10-16'}}});window.__badReference=Paper.plan({...__fullInput,predictions:{sh588000:{eligible:true,expectedReturn:.03,asOf:'2026-10-19',referenceOpen:2}}});window.__feeInput={...__fullInput,allocationMode:'capped',positionLimit:2000,universe:[{symbol:'sh588000',name:'ETF',type:'etf'},{symbol:'sh600703',name:'STOCK',type:'stock'}],quotes:{...__fullInput.quotes,sh600703:{price:9,open:9,sourceTime:'2026-10-20 09:30:00'}},predictions:{...__fullInput.predictions,sh600703:{eligible:true,expectedReturn:.06,asOf:'2026-10-19'}}};window.__feePlan=Paper.plan(__feeInput);window.__feeResearch=Paper.start(__feeInput);window.__feeAuto=Paper.startAuto(__feeInput);window.__feeStock=__feeResearch.account.holdings.find(h=>h.symbol==='sh600703');");
   await Check("__badSignal.selected.length===0&&__badSignal.rows[0].reasonCode==='signal_session'&&__badReference.selected.length===0&&__badReference.rows[0].reasonCode==='signal_reference'&&JSON.stringify(__feePlan.feeProfile)===JSON.stringify(__feeResearch.feeProfile)&&JSON.stringify(__feePlan.feeProfile)===JSON.stringify(__feeAuto.feeProfile)&&__feeStock.entryFee===FeeProfile.costs({type:'stock'},__feeStock.shares*__feeStock.entryPrice,'buy',__feeResearch.feeProfile).total&&__feeStock.entryFee>5&&__feeAuto.account.holdings.every(h=>h.type==='etf')","old signal/reference mismatch rejected and stock research shares one fee version with ETF-only execution (synthetic runtime fixture)",checks);
   await Check("RESEARCH_RESULTS.fullCapitalOptimization.targets.profitProbability===.7&&RESEARCH_RESULTS.fullCapitalOptimization.targets.achieved===false&&document.querySelectorAll('#full-capital-table tbody tr').length===6&&document.querySelectorAll('#profit-probability-table tbody tr').length===6","full-capital research and failed probability calibration displayed without70%claim",checks);
   await Eval("window.__desktopNetwork={done:false};(async function(){try{const q=await Market.quotes();const h=await Market.history('sh688981');const raw=await Market.rawHistory('sh688981');const pool=await Market.syncHistories();const at=Date.now(),validation=Market.validateHistoryPool(pool,{at}),dates=Market.UNIVERSE.map(u=>pool[u.symbol]?.at(-1)?.date||'');const news=await Market.news();const ann=await Market.announcements('sh688981',true);window.__desktopNetwork={done:true,quotes:Object.keys(q).length,liveQuotes:Object.values(q).some(x=>!x.cached),news:news.length,liveNews:news.some(x=>!x.cached),announcements:ann.items.length,liveAnnouncements:!ann.cached,announcementFirstSeen:ann.items[0]&&ann.items[0].firstSeenAt,sourceTime:Object.values(q)[0].sourceTime,receivedAt:Object.values(q)[0].receivedAt,historyAsOf:h[h.length-1].date,rawAsOf:raw[raw.length-1].date,expectedCompletedSession:TradingCalendar.expectedCompletedSession(at),poolHistoryCount:dates.length,poolHistoryDates:[...new Set(dates)],allHistoriesExpected:validation.ok,historyValidation:validation,historyStatuses:Market.UNIVERSE.map(u=>Market.historyStatus(u.symbol,{at}))};}catch(e){window.__desktopNetwork={done:true,error:e.message};}})();");
   await Wait("window.__desktopNetwork.done",60000);
   object network=Program.Json.DeserializeObject(await Eval("window.__desktopNetwork"));verificationNetwork=network;
   await Check("!window.__desktopNetwork.error&&window.__desktopNetwork.liveQuotes&&window.__desktopNetwork.liveNews&&window.__desktopNetwork.liveAnnouncements&&window.__desktopNetwork.announcements>0","live quotes, news and company announcements",checks);
   await Check("__desktopNetwork.poolHistoryCount===19&&__desktopNetwork.allHistoriesExpected&&__desktopNetwork.poolHistoryDates.every(d=>d===__desktopNetwork.expectedCompletedSession)&&__desktopNetwork.historyAsOf===__desktopNetwork.expectedCompletedSession&&__desktopNetwork.rawAsOf===__desktopNetwork.expectedCompletedSession","strict all19 daily histories and raw detail reach the exchange expected completed session",checks);
   await Eval("window.__desktopUiVerification={executionMode:'desktop_ui_verification',notProspectiveStrategyTrial:true,attempted:false};");
   if(await Eval("Paper.trading(Date.now())")=="true"){
    await Eval("window.__previousUiAccount=Market.read('paper.continuous.current');__desktopUiVerification.attempted=true;__desktopUiVerification.beforeAccountId=__previousUiAccount?__previousUiAccount.accountId:null;__desktopUiVerification.beforeStartedAt=__previousUiAccount?__previousUiAccount.startedAt:null;__desktopUiVerification.beforeObservedAt=__previousUiAccount?__previousUiAccount.observedAt:null;document.querySelector('#start-paper').click();");
    await Wait("Market.read('paper.continuous.current')&&Market.read('paper.continuous.current').observedAt!==__desktopUiVerification.beforeObservedAt&&!document.querySelector('#start-paper').disabled",55000);
    await Check("Paper.resume(Market.read('paper.continuous.current')).accountType==='continuous_paper'&&Market.read('paper.continuous.current').budget===10000&&(!__previousUiAccount||Market.read('paper.continuous.current').accountId===__previousUiAccount.accountId&&Market.read('paper.continuous.current').startedAt===__previousUiAccount.startedAt)&&document.querySelector('#continuous-account-status')&&JSON.stringify(Market.read('paper.current'))===__legacyPaperBefore","actual UI creates or continues one persisted schema2 account without rewriting legacy paper.current (desktop UI verification only)",checks);
    await Eval("Object.assign(__desktopUiVerification,{accountId:Market.read('paper.continuous.current').accountId,startedAt:Market.read('paper.continuous.current').startedAt,observedAt:Market.read('paper.continuous.current').observedAt,legacyKeyUnchanged:JSON.stringify(Market.read('paper.current'))===__legacyPaperBefore});");
   }
   await Check("JSON.stringify(Market.read('paper.current'))===__legacyPaperBefore","original paper.current remains byte-equivalent JSON and is never migrated into new profit",checks);
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
   report.Add("automaticReplay",automaticReplay);report.Add("fullCapitalResearch",fullCapitalResearch);report.Add("continuousPersistence",verificationPersistence);report.Add("desktopUiVerification",Program.Json.DeserializeObject(await Eval("window.__desktopUiVerification")));File.WriteAllText(Program.VerificationPath,Program.Json.Serialize(report),Encoding.UTF8);Close();
  }
  void Fail(Exception e){ExitStatus=1;if(Program.VerificationPath!=null){Directory.CreateDirectory(Path.GetDirectoryName(Program.VerificationPath));File.WriteAllText(Program.VerificationPath,Program.Json.Serialize(new{ok=false,error=e.ToString(),verifiedAt=DateTime.UtcNow.ToString("o"),checks=verificationChecks,network=verificationNetwork,continuousPersistence=verificationPersistence}),Encoding.UTF8);Close();}else{loading.Text="打开失败："+e.Message+"\n请检查网络或 WebView2 运行组件。";loading.Visible=true;loading.BringToFront();}}
 }
}
