(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NewsFacts=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const NEGATIVE=/不及预期|低于预期|未达预期|未达到预期|不达预期|未实现盈利|不(?:存在|会|再|予|能)?(?:增持|增长|盈利)|亏损|下跌|风险|减持|下滑|走弱|下降|诉讼|处罚|违约|停牌|退市/;
 function sentiment(title){const text=String(title||'');if(NEGATIVE.test(text))return '偏谨慎';return /增长|突破|增持|上涨|利好|创新|盈利|超预期/.test(text)?'偏积极':'中性';}
 function evidence(text,value,start,extras){return {...extras,value,start,end:start+value.length,excerpt:text.slice(Math.max(0,start-25),Math.min(text.length,start+value.length+25))};}
 function matches(text,pattern){const rows=[];for(const m of text.matchAll(pattern))rows.push(evidence(text,m[0],m.index));return rows;}
 function timestamp(value){if(typeof value!=='string'||!value.trim()||!Number.isFinite(Date.parse(value)))return null;return value;}
 function analyze(item={}){
  const title=String(item.title||''),body=[item.content,item.body,item.text].find(x=>typeof x==='string'&&x.trim()),originalText=body||title,coverage=body?'body_available':'title_only';
  const publishedAt=timestamp(item.publishedAt||item.disclosedAt||item.sourceTime),firstSeenAt=timestamp(item.firstSeenAt),companies=[];
  const names=[...(Array.isArray(item.companies)?item.companies:[]),...(item.companyName?[{name:item.companyName}]:[])];
  for(const c of names){const name=typeof c==='string'?c:c&&c.name;if(typeof name!=='string'||!name)continue;const start=originalText.indexOf(name);if(start>=0&&!companies.some(x=>x.value===name))companies.push(evidence(originalText,name,start,typeof c==='object'&&c.symbol?{symbol:c.symbol}:{}));}
  for(const row of matches(originalText,/[\u4e00-\u9fffA-Za-z0-9]{2,24}(?:股份有限公司|有限责任公司)/g))if(!companies.some(x=>x.value===row.value))companies.push(row);
  const events=matches(originalText,/业绩预告|业绩快报|定期报告|年度报告|季度报告|增持|减持|分红|拆分|并购|回购|诉讼|处罚|停牌|复牌|发行|重大合同/g),risks=matches(originalText,/不及预期|低于预期|未达预期|亏损|风险|减持|下滑|下降|诉讼|处罚|违约|停牌|退市/g),numbers=matches(originalText,/[+-]?\d+(?:\.\d+)?(?:%|％|万亿元|亿元|万元|亿股|万股|元|股|倍|年)?/g);
  return {engine:'literal-rules-v1',title,originalText,coverage,url:typeof item.url==='string'?item.url:null,source:typeof item.source==='string'?item.source:null,publishedAt,firstSeenAt,forwardUsable:!!firstSeenAt,companies,numbers,events,risks,sentiment:sentiment(title),usedInPrediction:false,llmConnected:false,uncovered:[...(body?[]:['全文未覆盖']),'财报核验未覆盖','新闻未进入收益预测','大模型未接入'],note:'仅提取原文字面证据；未核实全文真实性、完整性及价格因果，不代表盈利概率。'};
 }
 return {analyze,sentiment};
});
