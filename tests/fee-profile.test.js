'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Fee=require('../assets/fee-profile.js');

test('one fee profile includes complete stock fees and ETF exemptions',()=>{
 const p=Fee.resolve();
 assert.equal(p.version,'cn-paper-fees-v1');assert.equal(p.minFee,5);
 assert.deepEqual(Fee.costs({type:'stock'},10000,'buy',p),{commission:5,tax:0,transferFee:.1,total:5.1});
 assert.deepEqual(Fee.costs({type:'stock'},10000,'sell',p),{commission:5,tax:5,transferFee:.1,total:10.1});
 assert.deepEqual(Fee.costs({type:'etf'},10000,'sell',p),{commission:5,tax:0,transferFee:0,total:5});
 assert.match(p.assumptionLabel,/最低5元.*合同/);
 assert.equal(Fee.executionPrice(10,'buy',p),10*1.001);assert.equal(Fee.executionPrice(10,'sell',p),10*.999);
});

test('contract profile and explicit legacy minFee resolve consistently without mutating inputs',()=>{
 const input={feeProfile:{commissionRate:.0002,minFee:3,slippage:.0005,stockSellStampRate:.0004,stockTransferRate:.00002},minFee:7,includeStockTaxes:false};
 const p=Fee.resolve(input);assert.equal(p.minFee,7);assert.equal(input.feeProfile.minFee,3);
 assert.equal(Fee.costs({type:'stock'},10000,'sell',p).total,11.2);
 assert.equal(Fee.resolve({feeProfile:{minFee:0}}).minFee,0);
 assert.notEqual(Fee.resolve().minFee,0);
});

test('invalid fee, notional, instrument and side inputs fail explicitly',()=>{
 for(const key of ['commissionRate','minFee','slippage','stockSellStampRate','stockTransferRate'])for(const value of [-1,NaN,Infinity,'5'])assert.throws(()=>Fee.resolve({feeProfile:{[key]:value}}),/Invalid/);
 assert.throws(()=>Fee.resolve({feeProfile:{slippage:1}}),/Invalid/);
 assert.throws(()=>Fee.costs({type:'fund'},100,'buy'),/instrument/);
 assert.throws(()=>Fee.costs({type:'stock'},-100,'buy'),/notional/);
 assert.throws(()=>Fee.costs({type:'stock'},100,'hold'),/side/);
 assert.equal(Fee.costs({type:'stock'},0,'sell').total,0);
});
