(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FeeProfile=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const DEFAULT=Object.freeze({version:'cn-paper-fees-v1',commissionRate:.0003,minFee:5,slippage:.001,stockSellStampRate:.0005,stockTransferRate:.00001,assumptionLabel:'最低5元为模拟假设，以合同为准'});
 function resolve(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid fee input');
  if(input.feeProfile!==undefined&&(!input.feeProfile||typeof input.feeProfile!=='object'||Array.isArray(input.feeProfile)))throw new Error('Invalid fee profile');
  const p={...DEFAULT,...input.feeProfile};
  if(Object.prototype.hasOwnProperty.call(input,'minFee'))p.minFee=input.minFee;
  for(const key of ['commissionRate','minFee','slippage','stockSellStampRate','stockTransferRate'])if(typeof p[key]!=='number'||!Number.isFinite(p[key])||p[key]<0||(key==='minFee'?p[key]>100000:p[key]>.1))throw new Error('Invalid fee '+key);
  if(typeof p.version!=='string'||!p.version||p.version.length>100||typeof p.assumptionLabel!=='string'||!p.assumptionLabel)throw new Error('Invalid fee metadata');
  return p;
 }
 function checkSide(side){if(side!=='buy'&&side!=='sell')throw new Error('Invalid execution side');}
 function costs(u,notional,side,profile){
  const p=resolve({feeProfile:profile===undefined?DEFAULT:profile});checkSide(side);
  if(!u||!['stock','etf'].includes(u.type))throw new Error('Invalid instrument type for fee profile');
  if(typeof notional!=='number'||!Number.isFinite(notional)||notional<0)throw new Error('Invalid notional');
  const commission=notional>0?Math.max(p.minFee,notional*p.commissionRate):0,tax=u.type==='stock'&&side==='sell'?notional*p.stockSellStampRate:0,transferFee=u.type==='stock'?notional*p.stockTransferRate:0;
  return {commission,tax,transferFee,total:commission+tax+transferFee};
 }
 function executionPrice(mid,side,profile){const p=resolve({feeProfile:profile===undefined?DEFAULT:profile});checkSide(side);if(typeof mid!=='number'||!Number.isFinite(mid)||mid<=0)throw new Error('Invalid execution price');return mid*(side==='buy'?1+p.slippage:1-p.slippage);}
 return {resolve,costs,executionPrice};
});
