'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Facts=require('../assets/news-facts.js');

test('negative expectation and negated growth phrases are not labeled positive',()=>{
 assert.equal(Facts.sentiment('业绩增长不及预期'),'偏谨慎');
 assert.equal(Facts.sentiment('未实现盈利，公司不存在增持计划'),'偏谨慎');
 assert.equal(Facts.sentiment('业绩增长20%'),'偏积极');
 assert.equal(Facts.sentiment('公司发布公告'),'中性');
});

test('literal title facts preserve source times original evidence and uncovered modules',()=>{
 const item={title:'科大讯飞业绩增长不及预期，收入增长12.5%，股东减持计划',url:'https://example.com/a',source:'公告',publishedAt:'2026-10-19 18:00:00',firstSeenAt:'2026-10-20T01:31:00.000Z',companies:[{name:'科大讯飞',symbol:'sz002230'},{name:'未提及公司',symbol:'sz000001'}]};
 const result=Facts.analyze(item);
 assert.equal(result.engine,'literal-rules-v1');assert.equal(result.coverage,'title_only');assert.equal(result.originalText,item.title);assert.equal(result.firstSeenAt,item.firstSeenAt);assert.equal(result.publishedAt,item.publishedAt);assert.equal(result.url,item.url);assert.equal(result.sentiment,'偏谨慎');assert.equal(result.llmConnected,false);assert.equal(result.usedInPrediction,false);
 assert.deepEqual(result.companies.map(x=>x.value),['科大讯飞']);assert.ok(result.numbers.some(x=>x.value==='12.5%'));assert.ok(result.risks.some(x=>x.value==='不及预期'));assert.ok(result.events.some(x=>x.value==='减持'));
 for(const row of [...result.companies,...result.numbers,...result.events,...result.risks]){assert.equal(result.originalText.slice(row.start,row.end),row.value);assert.ok(row.excerpt.includes(row.value));}
 assert.ok(result.uncovered.includes('全文未覆盖'));assert.equal(item.firstSeenAt,'2026-10-20T01:31:00.000Z');
});

test('body evidence stays literal and absent first observation is not manufactured',()=>{
 const result=Facts.analyze({title:'公告',content:'示例科技股份有限公司公告：2026年净利润亏损3亿元，存在诉讼风险。',publishedAt:'2026-10-19'});
 assert.equal(result.coverage,'body_available');assert.equal(result.firstSeenAt,null);assert.equal(result.forwardUsable,false);
 assert.ok(result.companies.some(x=>x.value==='示例科技股份有限公司'));assert.ok(result.risks.some(x=>x.value==='诉讼'));
 assert.equal(Facts.analyze({title:'公告',firstSeenAt:'not a timestamp'}).forwardUsable,false);
 assert.equal(Facts.analyze({title:'仅标题',content:' '}).coverage,'title_only');
});
