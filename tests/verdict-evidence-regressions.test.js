'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../scripts/research-verdict-k.js');
const base = () => ({budget:50000,period:['2025-01-03','2025-12-31'],path:'decision_thesis',parityVerified:true,
 netPnl:737,maximumOpenCloseObservedDrawdown:1017,meanExposure:.022,feesPaid:260,
 dataQuality:{priceDiscontinuityGatePassed:true,events:[],corporateActionCoverageVerified:false,firstAvailabilityVerified:false}});
test('comparison requires independently valid baseline evidence', () => {
 for (const change of [b=>b.parityVerified=false,b=>b.dataQuality.priceDiscontinuityGatePassed=false,
  b=>b.dataQuality.events.push({date:'2026-03-27'}),b=>b.netPnl=NaN]) {
  const candidate=base(), baseline=base();candidate.netPnl=900;candidate.maximumOpenCloseObservedDrawdown=900;change(baseline);
  const result=V.assess(candidate,baseline);assert.equal(result.status,'blocked_evidence');
  assert.notEqual(result.returnOptimized,true);
 }
});
test('unlevered research evidence rejects impossible metrics in either side', () => {
 for (const change of [b=>b.maximumOpenCloseObservedDrawdown=-1,b=>b.feesPaid=-1,
  b=>b.meanExposure=2,b=>b.meanExposure=-.1,b=>b.budget=0,b=>b.period=['bad','2025-12-31'],
  b=>b.dataQuality.events='unverified']) {
  for (const side of ['candidate','baseline']) {
   const candidate=base(),baseline=base();change(side==='candidate'?candidate:baseline);
   assert.equal(V.assess(candidate,baseline).status,'blocked_evidence');
  }
 }
});
test('risk warning threshold must be a finite positive amount', () => {
 for(const warningAmount of [-1,0,Infinity,NaN,'500'])assert.equal(V.assess(base(),base(),{warningAmount}).status,'blocked_evidence');
});
