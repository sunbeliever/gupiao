'use strict';
const fs=require('node:fs'),path=require('node:path');
const {summarize}=require('./paper-observation-summary.js');
const root=path.resolve(__dirname,'..');
const historical=JSON.parse(fs.readFileSync(path.join(root,'validation/historical-paper/report.json'),'utf8'));
const results={historical:{summary:historical.summary,rounds:historical.rounds.map(r=>({signalDate:r.signalDate,entryDate:r.entryDate,exitDate:r.exitDate,chosen:r.chosen.map(p=>({name:p.name,symbol:p.symbol})),modelReturn:r.modelReturn,poolReturn:r.poolReturn,etfReturn:r.etfReturn})),decisionsSha256:historical.decisionsSha256}};
const fullPath=path.join(root,'validation/historical-paper/full-years.json');
if(fs.existsSync(fullPath))results.historical.fullYears=JSON.parse(fs.readFileSync(fullPath,'utf8')).map(r=>({year:r.year,directionAccuracy:r.directionAccuracy,baselines:r.baselines,strategyReturn:r.strategyReturn,benchmarkReturn:r.benchmarkReturn,maxDrawdown:r.maxDrawdown}));
const mlPath=path.join(root,'validation/ml-research/report.json');
if(fs.existsSync(mlPath)){const ml=JSON.parse(fs.readFileSync(mlPath,'utf8'));results.mlResearch={deployed:false,kind:ml.manifest.kind,rows:ml.reports.map(r=>r.summary)};}
const livePath=path.join(root,'validation/live-paper/status.json');
if(fs.existsSync(livePath)){const live=JSON.parse(fs.readFileSync(livePath,'utf8'));if(live.done){const ticks=fs.readFileSync(path.join(root,'validation/live-paper/ticks.jsonl'),'utf8').trim().split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x));results.live=summarize(live,ticks);}}
const candidatePath=path.join(root,'validation/candidate-live/status.json');
if(fs.existsSync(candidatePath)){const candidate=JSON.parse(fs.readFileSync(candidatePath,'utf8'));results.candidateLive=candidate;}
const smallPath=path.join(root,'validation/small-budget-live/status.json');
if(fs.existsSync(smallPath))results.smallBudgetLive=JSON.parse(fs.readFileSync(smallPath,'utf8'));
const correctedPath=path.join(root,'validation/small-budget-v2-live/status.json');
if(fs.existsSync(correctedPath))results.smallBudgetV2Live=JSON.parse(fs.readFileSync(correctedPath,'utf8'));
const reviewPath=path.join(root,'docs/ai-investing-research.json'),rankPath=path.join(root,'validation/ranking-research/report.json');
if(fs.existsSync(reviewPath))results.methodReview=JSON.parse(fs.readFileSync(reviewPath,'utf8'));
if(fs.existsSync(rankPath)){const r=JSON.parse(fs.readFileSync(rankPath,'utf8'));results.rankingResearch={deployed:false,sourceAsOf:r.manifest.sourceAsOf,featureCount:r.manifest.featureNames.length,rows:r.reports.map(x=>({year:x.year,model:x.model,mae:x.excessMae,zeroMae:x.zeroExcessMae,rankIC:x.meanRankIC,coverage:x.observedLabelCoverage})),limitations:r.manifest.limitations};}
const autoPath=path.join(root,'validation/auto-history-30m/report.json');
const costPath=path.join(root,'validation/cost-aware-v2/report.json');
const fullPathResearch=path.join(root,'validation/full-capital-optimization/report.json');
if(fs.existsSync(fullPathResearch)){const f=JSON.parse(fs.readFileSync(fullPathResearch,'utf8'));results.fullCapitalOptimization={selected:f.selected,deployed:false,selectionSha256:f.selectionSha256,sourceAsOf:f.sourceAsOf,targets:{profitProbability:.7,annualReturn:[.1,.2],holdingSessions:20,achieved:false},rows:f.reports.map(r=>({year:r.year,model:r.rule.model,netReturn:r.netReturn,netPnl:r.closedPnl,maxDrawdown:r.maxDrawdown,averageExposure:r.averageExposure,closedPositions:r.closedPositions,winRate:r.winRate})),probability:[2024,2025,2026].flatMap(y=>{const p=path.join(root,'validation/net-profit-probability-full/report-'+y+'.json');return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')).reports.map(x=>({year:y,model:x.model,brier:x.brier,priorBrier:x.priorBrier,thresholdLabels:x.thresholdLabels,actualWinFraction:x.thresholdActualWinFraction,nonoverlapCases:x.nonoverlappingPerSymbolCases,nonoverlapWinFraction:x.nonoverlappingActualWinFraction})):[];})};}
if(fs.existsSync(costPath)){const c=JSON.parse(fs.readFileSync(costPath,'utf8'));results.costOptimization={deployed:false,selected:c.selected,sourceAsOf:c.sourceAsOf,corporateActionsApplied:true,baselineDescription:c.baselineDescription,selectionSha256:c.selectionSha256,rows:c.reports.map(r=>({year:r.year,model:r.rule.model,netReturn:r.netReturn,netPnl:r.closedPnl,maxDrawdown:r.maxDrawdown,averageExposure:r.averageExposure,closedPositions:r.closedPositions,winRate:r.winRate,warnings:r.corporateActionWarnings.length})),validation:c.validation.validation.map(r=>({model:r.rule.model,margin:r.rule.netMargin,trend:r.rule.trendFilter,netReturn:r.netReturn,closedPositions:r.closedPositions,winRate:r.winRate})),modelFeatureCount:25,modelKinds:['Huber稳健回归','直方图梯度提升树'],note:c.note};}
if(fs.existsSync(autoPath)){const a=JSON.parse(fs.readFileSync(autoPath,'utf8')),costPath=path.join(root,'validation/auto-history-30m/execution-cost-analysis.json'),cost=fs.existsSync(costPath)?JSON.parse(fs.readFileSync(costPath,'utf8')):null;results.automaticHistory={scoredAt:a.scoredAt,summary:a.summary,positiveEstimatedLiquidationWindows:cost?.positiveEstimatedLiquidationWindows??null,decisionsSha256:a.decisionsSha256,limitations:a.policy.limitations,rounds:a.rounds.map(r=>({day:r.day,startAt:r.startAt,complete:r.complete,reason:r.reason,netPnl:r.netPnl,netReturn:r.netReturn,buys:r.buys,sells:r.sells,blockedExits:r.blockedExits,benchmarkReturn:r.benchmarkReturn,symbols:r.session?.automation.events.filter(e=>e.action==='buy').map(e=>e.symbol)||[]}))};}
fs.writeFileSync(path.join(root,'assets/research-results.js'),'window.RESEARCH_RESULTS='+JSON.stringify(results)+';\n');
console.log(JSON.stringify({historicalRounds:results.historical.rounds.length,oneHourCompleted:!!results.live}));
