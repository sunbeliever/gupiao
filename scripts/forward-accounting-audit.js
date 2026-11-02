'use strict';
// Pure arithmetic audit of recorded forward orders; never calls Paper or changes a clock.
const A=require('../assets/audit-identity.js'),C=require('../assets/trading-calendar.js'),Fee=require('../assets/fee-profile.js');
const protocol=require('../evidence/2026-10-30-forward-pair/protocol.json');
const PROTOCOL_HASH='f264ee8a14164a6d9ad3e768e9fd90535d398cf1b6875e5a38bb783657b0917d';
const SYMBOLS=Object.freeze(['sh588000','sh512760','sh515070','sh512720','sh515880','sz159852']);
const clone=x=>JSON.parse(JSON.stringify(x));
function equal(actual,expected,label){if(typeof actual!=='number'||!Number.isFinite(actual)||Math.abs(actual-expected)>1e-7*Math.max(1,Math.abs(expected)/50000))throw Error('Accounting mismatch: '+label);}
function costs(actual,total,label){for(const [k,v]of Object.entries({commission:total,tax:0,transferFee:0,total}))equal(actual?.[k],v,label+' '+k);}
function validHash(value,label){const v=clone(value),h=v.integrityHash;delete v.integrityHash;if(A.hash(v)!==h)throw Error(label+' integrity mismatch');}
function auditSession(value,latestQuotes){
 const s=clone(value),quotes=clone(latestQuotes);validHash(s,'session');
 const candidate=protocol.candidates.find(c=>s.accountId===protocol.id+'-'+c.key),a=s.account;
 const policy={version:'registered-forward-decisions-v1',protocolId:'forward-decision-contract-20261030-a',protocolHash:'feca650591f514e2e9db9c9ba187fd19c954cb5fadb722baf06ef584490034a5',researchOnly:true};
 if(!candidate||s.schema!==2||s.accountType!=='continuous_paper'||s.budget!==50000||s.automation?.mode!=='live'||s.model?.kind!=='registered-decision-forward-v1'||s.model.candidateId!==candidate.id||s.model.decisionPolicyHash!==A.hash({protocolHash:PROTOCOL_HASH,candidate})||s.model.researchExitMode!==undefined||A.hash(s.rules?.researchForwardPolicy)!==A.hash(policy)||s.rules.stopLossRate!==.04||s.rules.targetExitEnabled!==false||A.hash(s.feeProfile)!==A.hash(Fee.resolve()))throw Error('Unsupported forward session identity or policy');
 if(s.riskLimits?.investableLimit!==12500||s.riskLimits.maxExposure!==.25||s.riskLimits.maxPositions!==3||s.riskLimits.maxThemeWeight!==1)throw Error('Unsupported risk limits');
 if(!Array.isArray(s.universe)||s.universe.length!==6||new Set(s.universe.map(u=>u.symbol)).size!==6||s.universe.some(u=>!SYMBOLS.includes(u.symbol)||u.type!=='etf')||!Array.isArray(s.corporateEvents)||s.corporateEvents.length||!Array.isArray(a?.receivables)||a.receivables.length||a.paidDividends!==0)throw Error('Unsupported universe or entitlements');
 if(!Array.isArray(s.orders)||!Array.isArray(s.closedPositions)||!Array.isArray(a.holdings))throw Error('Missing accounting arrays');
 const end=Date.parse(s.observedAt),start=Date.parse(s.startedAt);if(!Number.isFinite(end)||!Number.isFinite(start)||end<start||!protocol.knownSessions.includes(C.sessionOf(start))||!protocol.knownSessions.includes(C.sessionOf(end))||C.sessionOf(start)<protocol.startDate||C.sessionOf(end)>protocol.endDate)throw Error('Invalid registered accounting interval');
 let cash=50000,fees=0,realized=0,fills=0,previous=start;const lots=[],closedUsed=new Set(),ids=new Set();
 for(const o of s.orders){
  if(!o||typeof o.id!=='string'||ids.has(o.id))throw Error('Duplicate or missing order identity');ids.add(o.id);
  if(o.account!=='model')continue;
  if(!['hypothetical_fill','rejected'].includes(o.status))throw Error('Unsupported order status');
  if(o.status==='rejected'){if(!o.rejectionReason)throw Error('Rejected order lacks reason');continue;}
  const at=Date.parse(o.fillAt),date=C.sessionOf(at);
  if(!Number.isFinite(at)||at<previous||at<start||at>end||!C.isTradingTime(at)||o.fillAt!==o.orderAt||o.fillAt!==o.decisionAt||!SYMBOLS.includes(o.symbol)||!['buy','sell'].includes(o.side)||!Number.isSafeInteger(o.shares)||o.shares<=0||o.shares%100||!Number.isFinite(o.price)||o.price<=0)throw Error('Invalid recorded fill');previous=at;
  const notional=o.shares*o.price,commission=Math.max(s.feeProfile.minFee,notional*s.feeProfile.commissionRate);equal(o.notional,notional,'notional');
  for(const [k,v]of Object.entries({commission,tax:0,transferFee:0,total:commission}))equal(o.fees?.[k],v,'fee '+k);
  fees+=commission;fills++;
  if(o.side==='buy'){
   if(notional+commission>cash+1e-8)throw Error('Buy used unavailable cash');cash-=notional+commission;
   lots.push({id:o.id,symbol:o.symbol,shares:o.shares,price:o.price,entryFee:commission,entrySession:date,sellableSession:C.nextSession(date)});
  }else{
   if(!['research_target_reduce','research_logic_invalid','risk_stop','maturity'].includes(o.reason))throw Error('Unsupported sell reason');
   const fragments=s.closedPositions.map((h,index)=>({h,index})).filter(({h})=>h.account==='model'&&h.exitOrderId===o.id);
   if(!fragments.length)throw Error('Sell lacks closed lots');let quantity=0,pnl=0;
   for(const {h,index}of fragments){
    if(closedUsed.has(index))throw Error('Closed lot reused');closedUsed.add(index);
    const lot=lots.find(l=>l.id===h.researchLotId&&l.shares>0);
    if(!lot||h.symbol!==o.symbol||lot.symbol!==o.symbol||!Number.isSafeInteger(h.shares)||h.shares<=0||h.shares%100||h.shares>lot.shares)throw Error('Closed lot ownership mismatch');
    if(date<lot.sellableSession)throw Error('T+1 sale before sellable session');
    if(o.reason==='research_target_reduce'||o.reason==='research_logic_invalid'){
     const first=lots.find(l=>l.symbol===o.symbol&&l.shares>0&&date>=l.sellableSession);if(first!==lot)throw Error('Eligible FIFO violated');
    }else if(h.shares!==lot.shares)throw Error('Risk or maturity exit must close its whole identified lot');
    const entryFee=lot.entryFee*h.shares/lot.shares,exitFee=commission*h.shares/o.shares,part=h.shares*(o.price-lot.price)-entryFee-exitFee;
    equal(h.entryPrice,lot.price,'closed entry price');equal(h.entryFee,entryFee,'allocated entry fee');costs(h.entryCosts,entryFee,'closed entry costs');equal(h.exitPrice,o.price,'exit price');equal(h.realizedPnl,part,'closed realized');if(h.allocatedExitFee!==undefined)equal(h.allocatedExitFee,exitFee,'exit fee allocation');
    if(h.entrySession!==lot.entrySession||h.sellableSession!==lot.sellableSession||h.exitAt!==o.fillAt)throw Error('Closed lot dates mismatch');
    lot.shares-=h.shares;lot.entryFee-=entryFee;quantity+=h.shares;pnl+=part;
   }
   equal(quantity,o.shares,'sold shares');equal(o.realizedPnl,pnl,'sell realized');realized+=pnl;cash+=notional-commission;
  }
 }
 const modelClosed=s.closedPositions.filter(h=>h.account==='model');if(closedUsed.size!==modelClosed.length)throw Error('Orphan closed lot');
 const open=lots.filter(l=>l.shares>0);if(open.length!==a.holdings.length)throw Error('Open lot count mismatch');let marketValue=0;
 for(const lot of open){const matches=a.holdings.filter(h=>h.researchLotId===lot.id);if(matches.length!==1)throw Error('Open lot identity mismatch');const h=matches[0],q=quotes?.[lot.symbol];
  if(!q||!Number.isFinite(q.price)||q.price<=0||typeof q.sourceTime!=='string'||!Number.isFinite(Date.parse(q.sourceTime.replace(' ','T')+'+08:00')))throw Error('Missing complete terminal valuation');
  equal(h.shares,lot.shares,'open shares');equal(h.entryPrice,lot.price,'open entry price');equal(h.entryFee,lot.entryFee,'open entry fee');costs(h.entryCosts,lot.entryFee,'open entry costs');equal(h.lastPrice,q.price,'terminal quote');
  if(h.symbol!==lot.symbol||h.entrySession!==lot.entrySession||h.sellableSession!==lot.sellableSession||h.lastSourceTime!==q.sourceTime)throw Error('Open lot dates or source mismatch');marketValue+=lot.shares*q.price;
 }
 equal(a.cash,cash,'cash');equal(a.availableCash,cash,'available cash');equal(a.frozenFunds,0,'frozen funds');equal(a.receivableValue,0,'receivables');equal(a.feesPaid,fees,'fees paid');equal(a.closedPnl,realized,'closed pnl');equal(a.realizedPnl,realized,'realized pnl');equal(a.marketValue,marketValue,'market value');equal(a.equity,cash+marketValue,'equity');equal(a.unrealizedPnl,cash+marketValue-50000-realized,'unrealized pnl');
 return {schema:1,accountId:s.accountId,observedAt:s.observedAt,sessionHash:s.integrityHash,fills,closedLots:closedUsed.size,openLots:open.length,cash,feesPaid:fees,realizedPnl:realized,marketValue,equity:cash+marketValue,accountingReplay:true,paperReplay:false,accountWrites:false,investmentReady:false,sourceAuthenticityVerified:false,scope:'Recorded model-order arithmetic, lot allocation, eligible FIFO, T+1 and terminal quote valuation only; not strategy/risk-decision or full Paper replay'};
}
function auditPair(state,quotes){validHash(state,'pair');if(state.id!==protocol.id||state.protocolHash!==PROTOCOL_HASH||Object.keys(state.candidates||{}).sort().join(',')!=='monitor,trend')throw Error('Unsupported paired state');if(protocol.candidates.some(c=>state.candidates[c.key]?.session?.observedAt!==state.observedAt))throw Error('Paired observation mismatch');const candidates=Object.fromEntries(protocol.candidates.map(c=>[c.key,auditSession(state.candidates[c.key].session,quotes)]));return {schema:1,pairHash:state.integrityHash,candidates,accountingReplay:true,paperReplay:false,accountWrites:false,investmentReady:false};}
module.exports={auditSession,auditPair};
