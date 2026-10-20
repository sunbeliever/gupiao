'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'validation','ml-research');fs.mkdirSync(dir,{recursive:true});
const Analysis=require('../assets/analysis.js'),Market=require('../assets/market.js'),c={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/seed.js'),'utf8'),c);
const histories=c.window.TECH_SEED.histories,calendar=[...new Set(Object.values(histories).flatMap(a=>a.map(b=>b.date)))].sort(),maps=Object.fromEntries(Object.entries(histories).map(([s,b])=>[s,Object.fromEntries(b.map(x=>[x.date,x]))])),rows=[];
for(const u of Market.UNIVERSE.filter(u=>u.type==='stock')){
 const b=histories[u.symbol]||[];
 for(let i=60;i<b.length;i++){
  const t=calendar.indexOf(b[i].date),entryDate=calendar[t+1],exitDate=calendar[t+21],entry=maps[u.symbol][entryDate],exit=maps[u.symbol][exitDate];
  if(!entry||!exit)continue;const features=Analysis.features(b.slice(i-60,i+1));if(!features.values)continue;
  const actual=exit.open/entry.open-1,net=(1+actual)*.9985*.9985-1;
  rows.push({symbol:u.symbol,name:u.name,date:b[i].date,entryDate,exitDate,x:features.values,actualReturn:actual,netReturn:net,profitable:net>0?1:0,entryExecutable:entry.volume>0&&entry.high>entry.low,exitExecutable:exit.volume>0&&exit.high>exit.low});
 }
}
const sorted=rows.sort((a,b)=>a.date.localeCompare(b.date)||a.symbol.localeCompare(b.symbol));fs.writeFileSync(path.join(dir,'labels.json'),JSON.stringify({schema:1,featureNames:Analysis.features(Object.values(histories)[0].slice(0,61)).names,rows:sorted}));
console.log(JSON.stringify({rows:rows.length,first:sorted[0].date,last:sorted.at(-1).date,columns:11,sourceAsOf:calendar.at(-1)}));
