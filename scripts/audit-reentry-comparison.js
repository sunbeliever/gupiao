'use strict';
// Independent arithmetic over recorded hypothetical orders and equity observations. No strategy calls.
const fs=require('node:fs'),crypto=require('node:crypto'),os=require('node:os');
const S='D:/techno/validation/strategy-research/historical-reentry-ablation-20261102-a',T=S+'/technical-recovery-20261106-a',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function equal(a,b,label){if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a-b)>1e-6)throw Error(label+' mismatch: '+a+' / '+b);}
function audit(result,id,resultSha256){
 const s=result.session,account=s.account;if(result.parityVerified!==true)throw Error('Recorded Paper parity missing');
 const days=result.daily?.map(d=>d.date),daySet=new Set(days),quality=result.summary.dataQuality;
 if(!days||days.length!==242||daySet.size!==242||days[0]!=='2025-01-03'||days.at(-1)!=='2025-12-31'||days.some((d,i)=>i&&d<=days[i-1])||s.curve.length!==726||quality?.dataHash!=='97d93864a4b29cbbe5e8ad2a32786b7367cd494459475bcccf2da647bdbfb451'||quality.sessions!==242||result.summary.path!=='monitor_only'||result.summary.cooldownSessions!==Number(id.split('-')[1]))throw Error('Fixed study interval or identity incomplete');
 const X=require(S+'/runtime-v1/common.cjs'),cost=id.endsWith('-double')?'double':'normal',dir=S+'/results/'+id+(id==='cooldown-1-normal'||id==='cooldown-5-normal'?'/technical-recovery-20261106-a':''),claim=JSON.parse(fs.readFileSync(dir+'/claim.json','utf8')),policyHash=X.A.hash(JSON.parse(fs.readFileSync(S+'/runtime-v1/policy-'+cost+'.json','utf8')));
 if(claim.protocolSha256!==X.PH||claim.sourceSha256!==X.SH||claim.dataHash!==X.DH||claim.policyHash!==policyHash||X.A.hash(claim.policy)!==policyHash||result.summary.policyHash!==result.initialSession.model.decisionPolicyHash||s.model.decisionPolicyHash!==result.summary.policyHash||result.initialSession.account.cash!==50000)throw Error('Fixed source/data/policy identity changed');
 if(account.paidDividends!==0||account.receivables.length)throw Error('Rights-bearing paths need a separate entitlement audit; no zero assumption');
 let cash=50000,fees=0,realized=0,last=-Infinity,buyCount=0,sellCount=0;const lots=new Map(),cashByDay=new Map(),day=t=>new Date(t).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
 const orders=s.orders.filter(o=>o.account==='model'&&o.status==='hypothetical_fill');
 for(const o of orders){
  if(!Number.isInteger(o.shares)||o.shares<=0||!Number.isFinite(o.price)||o.price<=0||!Number.isFinite(o.fees.total)||o.fees.total<0)throw Error('Invalid recorded fill');
  equal(o.notional,o.shares*o.price,'notional');const at=Date.parse(o.fillAt);if(!Number.isFinite(at)||at<last)throw Error('Fill order is not chronological');last=at;
  const book=lots.get(o.symbol)||[];lots.set(o.symbol,book);fees+=o.fees.total;
  if(o.side==='buy'){buyCount++;cash-=o.notional+o.fees.total;book.push({shares:o.shares,price:o.price,fee:o.fees.total,at});}
  else if(o.side==='sell'){
   sellCount++;cash+=o.notional-o.fees.total;let remaining=o.shares,cost=0;
   while(remaining){const lot=book[0];if(!lot)throw Error('Sell exceeds recorded position');if(day(lot.at)>=day(at))throw Error('T+1 violated');const take=Math.min(remaining,lot.shares),entryFee=lot.fee*take/lot.shares;cost+=take*lot.price+entryFee;lot.fee-=entryFee;lot.shares-=take;remaining-=take;if(lot.shares===0)book.shift();}
   realized+=o.notional-o.fees.total-cost;
  }else throw Error('Unknown fill side');
  if(cash<-.000001)throw Error('Negative reconstructed cash');
  if(!daySet.has(day(at)))throw Error('Fill outside fixed evaluation dates');cashByDay.set(day(at),cash);
 }
 const actual=new Map();let marketValue=0;for(const h of account.holdings){actual.set(h.symbol,(actual.get(h.symbol)||0)+h.shares);marketValue+=h.shares*h.lastPrice;}
 for(const symbol of new Set([...lots.keys(),...actual.keys()]))equal((lots.get(symbol)||[]).reduce((n,l)=>n+l.shares,0),actual.get(symbol)||0,'terminal shares '+symbol);
 equal(cash,account.cash,'cash');equal(fees,account.feesPaid,'fees');equal(fees,result.summary.feesPaid,'summary fees');equal(realized,account.closedPnl,'closed FIFO PnL');equal(cash+marketValue,account.equity,'terminal recorded-price equity');equal(account.equity-50000,result.summary.netPnl,'net PnL');
 equal(buyCount,result.summary.buyCount,'buy count');equal(sellCount,result.summary.sellCount,'sell count');
 let peak=50000,drawdown=0,rate=0,curveTime=-Infinity;const observations=new Map();for(const p of s.curve){const at=Date.parse(p.observedAt),d=day(at);if(!Number.isFinite(p.equity)||!Number.isFinite(at)||at<curveTime||!daySet.has(d))throw Error('Invalid recorded curve point');curveTime=at;observations.set(d,(observations.get(d)||0)+1);peak=Math.max(peak,p.equity);drawdown=Math.max(drawdown,peak-p.equity);rate=Math.max(rate,(peak-p.equity)/peak);}
 if(days.some(d=>observations.get(d)!==3))throw Error('Fixed three-observation daily curve incomplete');
 equal(drawdown,result.summary.maximumOpenCloseObservedDrawdown,'observed drawdown amount');equal(rate,result.summary.maximumOpenCloseObservedDrawdownProportion,'observed drawdown rate');
 let dailyCash=50000,meanExposure=0;for(const d of result.daily){if(cashByDay.has(d.date))dailyCash=cashByDay.get(d.date);equal(dailyCash,d.cash,'daily cash '+d.date);equal(d.cash+d.marketValue,d.equity,'daily marked equity');meanExposure+=d.marketValue/d.equity;}meanExposure/=242;equal(meanExposure,result.summary.meanExposure,'mean recorded-price exposure');
 return {id,resultSha256,passed:true,netPnl:account.equity-50000,fees,buyCount,sellCount,recordedCurvePoints:s.curve.length,observedDrawdown:drawdown,observedDrawdownRate:rate,reconstructedCash:cash,reconstructedClosedPnl:realized,recordedPriceTerminalEquity:cash+marketValue,meanExposure,fixedSessions:242};
}
function main(){
 if(fs.existsSync(T+'/recovery.lock'))throw Error('Wait until the recovery writer has released its lease');
 const c=JSON.parse(fs.readFileSync(T+'/comparison.json','utf8')),ids=['cooldown-0-normal','cooldown-1-normal','cooldown-5-normal','cooldown-0-double','cooldown-1-double','cooldown-5-double'];if(c.completed!==6||c.status!=='complete'||c.rows.length!==6||new Set(c.rows.map(r=>r.id)).size!==6||ids.some(id=>!c.rows.some(r=>r.id===id)))throw Error('Six distinct complete paths required; partial status must remain explicit');
 const rows=[];for(const row of c.rows){if(os.freemem()<1024*1048576)throw Error('Read-only audit free-memory floor reached');const expected=S+'/results/'+row.id+(row.id==='cooldown-1-normal'||row.id==='cooldown-5-normal'?'/technical-recovery-20261106-a':'');if(row.resultDirectory!==expected)throw Error('Unexpected result directory');const bytes=fs.readFileSync(expected+'/result.json');rows.push(audit(JSON.parse(bytes),row.id,hash(bytes)));}
 const proof={at:new Date().toISOString(),passed:true,rows,scope:'Independent recorded-order cash, fees, FIFO/T+1, terminal quantities and recorded-price equity, and observed curve arithmetic; not independent strategy, fill-intent or rights-completeness replay',originalAccountWrites:false};
 fs.writeFileSync(T+'/independent-arithmetic.json',JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,rows:rows.map(r=>({id:r.id,netPnl:r.netPnl,fees:r.fees,drawdown:r.observedDrawdown}))}));
}
module.exports={audit};if(require.main===module){try{main();}catch(e){console.error(e.stack);process.exitCode=1;}}
