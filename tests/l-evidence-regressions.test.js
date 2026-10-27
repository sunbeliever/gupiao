'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../scripts/evidence-gate-l.js'),M=require('../scripts/manager-brief-l.js');
const input=()=>require('./fixtures/l-t1-input.json');
const options=()=>({decisionAt:input().now,observedAt:input().now,symbols:input().universe.map(u=>u.symbol),trustedHosts:['news.example.org']});
function doc(id,symbols,title='业绩增长超预期') {const at=new Date(Date.parse(input().now)-86400000).toISOString(),text='公告原文：营业收入增长20%，但仍然存在经营风险。';return{id,kind:'news',symbols,title,text,contentSha256:G.hashText(text),url:'https://news.example.org/'+id,publishedAt:at,firstSeenAt:at,timePrecision:'second'};}
test('unbound title cannot alter hashed-body news interpretation',()=>{
 const symbol=input().universe[0].symbol,a=doc('a',[symbol],'业绩增长超预期'),b={...a,title:'业绩亏损风险'};
 const accepted=G.gateDocument(a,options());assert.equal(accepted.title,'');assert.equal(accepted.titleEvidenceVerified,false);assert.equal(accepted.unverifiedTitle,a.title);
 const brief=d=>M.buildBrief(structuredClone(input()),{documents:[d],trustedHosts:options().trustedHosts});
 const first=brief(a),second=brief(b);assert.deepEqual(first.rows.map(r=>r.newsAnalyst),second.rows.map(r=>r.newsAnalyst));assert.equal(first.planHash,second.planHash);
});
test('same article retains all instrument coverage independent of input order without duplicate votes',()=>{
 const [a,b]=input().universe.map(u=>u.symbol),one=doc('a',[a]),two=doc('b',[b]),both=doc('c',[a,b]);
 for(const records of [[one,two,both],[two,one,both]]){const out=G.admitDocuments(records,options());assert.deepEqual(out.accepted.flatMap(d=>d.symbols).sort(),[a,b].sort());assert.equal(out.uniqueContentCount,1);assert.equal(out.acceptedCount,2);assert.equal(out.rejected.at(-1).reason,'duplicate_content');}
});
