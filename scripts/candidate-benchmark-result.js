'use strict';
// Reads externally reported aggregate evidence only. Never imports or executes Python.
const fs=require('node:fs'),crypto=require('node:crypto'),Calendar=require('../assets/trading-calendar.js');
const DATASET='dd029cf7e8cae055b33b105d7651173481169953f9e25b5d08de0dcdbcf7d3da';
const SYMBOLS=['sh512720','sh512760','sh515070','sh515880','sh588000','sz159852'];
const FEATURES=['return_1','momentum_5','momentum_10','momentum_20','momentum_60','volatility_5','volatility_20','volatility_60','close_vs_ma_5','close_vs_ma_20','close_vs_ma_60','rsi14_proxy','volume_vs_ma20'];
const MODELS=['ridge','extra_trees','hist_gradient_boosting','mean'],HORIZONS=[5,20,60];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));
function requireThat(ok,message){if(!ok)throw Error('Candidate benchmark: '+message);}
function readBound(file,expected,max){
 requireThat(typeof file==='string'&&file.length>0&&typeof expected==='string'&&/^[a-f0-9]{64}$/.test(expected),'file/hash required');
 requireThat(fs.statSync(file).size<=max,'input too large');const bytes=fs.readFileSync(file);requireThat(bytes.length<=max&&hash(bytes)===expected,'input fingerprint mismatch');return bytes;
}
function metric(m,n){
 requireThat(m&&Number.isSafeInteger(m.n)&&m.n===n&&n>0,'metric sample count mismatch');
 for(const k of ['mae_pct','rmse_pct'])requireThat(Number.isFinite(m[k])&&m[k]>=0&&m[k]<=1e6,'invalid '+k);
 requireThat(m.rmse_pct+1e-9>=m.mae_pct,'RMSE below MAE');
 requireThat(Number.isFinite(m.direction_accuracy_pct)&&m.direction_accuracy_pct>=0&&m.direction_accuracy_pct<=100,'invalid direction accuracy');
 requireThat(Number.isFinite(m.mean_actual_return_pct)&&m.mean_actual_return_pct>=-100&&m.mean_actual_return_pct<=1e6,'invalid actual return');
}
function load(p){
 requireThat(p&&p.datasetManifestHash===DATASET,'registered dataset identity required');
 const bytes=readBound(p.file,p.sha256,1024*1024);readBound(p.scriptFile,p.scriptSha256,256*1024);const r=JSON.parse(bytes);
 requireThat(r&&r.schema===1&&r.feature_count===13&&equal(r.features,FEATURES)&&equal(r.symbols,SYMBOLS)&&r.date_start==='2023-01-03'&&r.date_end==='2026-10-23','fixed schema/features/symbols/period mismatch');
 requireThat(Array.isArray(r.folds)&&r.folds.length===27&&Array.isArray(r.summary)&&r.summary.length===12,'fixed fold/summary count mismatch');
 const dates=[];for(let d=r.date_start;d<=r.date_end;d=Calendar.nextSession(d))dates.push(d);requireThat(dates.length===920,'calendar coverage mismatch');
 requireThat(r.folds.every(f=>f&&HORIZONS.includes(f.horizon)),'unknown fold horizon');
 const summaries=[];
 for(const h of HORIZONS){
  const folds=r.folds.filter(f=>f.horizon===h),expected=[];
  for(let start=60+252+h+1;start<dates.length-h-1;start+=63)expected.push({train_end:dates[start-1],test_start:dates[start],test_end:dates[Math.min(start+62,dates.length-h-2)],n_train:(start-h-1-60)*6,n_test:Math.min(63,dates.length-h-1-start)*6});
  requireThat(folds.length===expected.length,'horizon fold count mismatch');
  folds.forEach((f,i)=>{
   const e=expected[i];for(const k of Object.keys(e))requireThat(f[k]===e[k],'causal fold boundary/sample mismatch');
   requireThat(f.train_end<f.test_start&&f.test_start<=f.test_end&&f.test_end<=r.date_end,'invalid fold chronology');
   requireThat(f.models&&equal(Object.keys(f.models).sort(),MODELS.slice().sort()),'four fixed models required');
   for(const name of MODELS){metric(f.models[name],f.n_test);requireThat(near(f.models[name].mean_actual_return_pct,f.models.mean.mean_actual_return_pct),'models use different target samples');}
  });
  for(const name of MODELS){
   const n=folds.reduce((a,f)=>a+f.n_test,0),weighted=k=>folds.reduce((a,f)=>a+f.n_test*f.models[name][k],0)/n;
   const row={horizon:h,model:name,n,fold_count:folds.length,mae_pct:weighted('mae_pct'),rmse_pct:Math.sqrt(folds.reduce((a,f)=>a+f.n_test*f.models[name].rmse_pct**2,0)/n),direction_accuracy_pct:weighted('direction_accuracy_pct'),mean_actual_return_pct:weighted('mean_actual_return_pct')};
   const matches=r.summary.filter(s=>s&&s.horizon===h&&s.model===name);requireThat(matches.length===1,'missing/duplicate summary model');const s=matches[0];metric(s,n);requireThat(s.fold_count===row.fold_count,'summary fold count mismatch');for(const k of ['mae_pct','rmse_pct','direction_accuracy_pct','mean_actual_return_pct'])requireThat(near(s[k],row[k]),'weighted summary mismatch: '+k);summaries.push(row);
  }
 }
 const summary=summaries.map(row=>{const mean=summaries.find(x=>x.horizon===row.horizon&&x.model==='mean');return{...row,maeBetterThanMean:row.mae_pct<mean.mae_pct,rmseBetterThanMean:row.rmse_pct<mean.rmse_pct,directionBetterThanMean:row.direction_accuracy_pct>mean.direction_accuracy_pct,relativeMaeImprovement:mean.mae_pct>0?1-row.mae_pct/mean.mae_pct:null};});
 return{kind:'external_candidate_benchmark',reportSha256:p.sha256,scriptSha256:p.scriptSha256,datasetManifestHash:p.datasetManifestHash,period:[r.date_start,r.date_end],featureCount:13,features:FEATURES.slice(),originalFeatureCount:11,comparableToOriginal11FeatureModel:false,foldCount:27,summary,trainingStatus:'reported_training_not_independently_rerun',trainingIndependentlyRerun:false,modelWeightsUnavailable:true,independentOutOfSample:false,profitability:null,netAccountReturn:null,maxAccountDrawdown:null,investmentReady:false,promoted:false,verifiedProfitProbability:null,limitations:['外部报告与其生成脚本字节已绑定，仅重算折级加权汇总；没有重新训练或核对逐样本预测。','数据指纹为导入声明绑定；报告未包含逐样本预测或训练权重，不能独立证明所报告训练使用该数据。','13特征及sklearn Ridge正则约定不同于原11特征模型，不是原模型同配置复验或新冠军。','历史成熟标签重叠，固定六ETF有幸存者选择及历史首次可得未知问题，非新的独立样本外。','MAE/RMSE和方向命中率均不是扣费账户收益或赚钱概率；未执行成本回放，不可部署。']};
}
module.exports={load};
