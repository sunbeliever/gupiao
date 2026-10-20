(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TradingCalendar=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // Exchange notices, not the national make-up working-day calendar. Dates outside
 // this reviewed coverage deliberately fail closed until another notice is added.
 const version='sse-sessions-2023-2026-v1';
 const coverage=Object.freeze({from:'2023-01-01',to:'2026-12-31',dailyCompleteHour:16,timeZone:'Asia/Shanghai'});
 const sources=Object.freeze([
  {year:2023,publishedAt:'2022-12-27',url:'https://www.sse.com.cn/disclosure/announcement/general/c/c_20221227_5714458.shtml'},
  {year:2024,publishedAt:'2023-12-26',url:'https://www.sse.com.cn/disclosure/dealinstruc/closed/c/c_20231226_5733941.shtml'},
  {year:2025,publishedAt:'2024-12-23',url:'https://www.sse.com.cn/disclosure/announcement/general/c/c_20241223_10767108.shtml'},
  {year:2026,publishedAt:'2025-12-22',url:'https://www.sse.com.cn/disclosure/announcement/general/c/c_20251222_10802507.shtml'}
 ]);
 const closedRanges={
  2023:[['01-01','01-02'],['01-21','01-27'],['04-05','04-05'],['04-29','05-03'],['06-22','06-24'],['09-29','10-06']],
  2024:[['01-01','01-01'],['02-09','02-17'],['04-04','04-06'],['05-01','05-05'],['06-10','06-10'],['09-15','09-17'],['10-01','10-07']],
  2025:[['01-01','01-01'],['01-28','02-04'],['04-04','04-06'],['05-01','05-05'],['05-31','06-02'],['10-01','10-08']],
  2026:[['01-01','01-03'],['02-15','02-23'],['04-04','04-06'],['05-01','05-05'],['06-19','06-21'],['09-25','09-27'],['10-01','10-07']]
 };
 function error(code,value){const e=new Error(code+': '+value);e.code=code;return e;}
 function assertDate(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw error('calendar_invalid_date',date);if(date<coverage.from||date>coverage.to)throw error('calendar_uncovered',date);return date;}
 function instant(at){if(at==null)at=new Date().getTime();if(typeof at==='string'&&!/[zZ]|[+-]\d{2}:?\d{2}$/.test(at))at=at.replace(' ','T')+(at.length===10?'T00:00:00':'')+'+08:00';const ms=at instanceof Date?at.getTime():typeof at==='number'?at:Date.parse(at);if(!Number.isFinite(ms))throw error('calendar_invalid_time',at);return ms;}
 function sessionOf(at){const date=new Date(instant(at)+8*3600000).toISOString().slice(0,10);return assertDate(date);}
 function isSession(date){assertDate(date);const day=new Date(date+'T00:00:00Z').getUTCDay();if(day===0||day===6)return false;const md=date.slice(5);return !closedRanges[Number(date.slice(0,4))].some(([a,b])=>md>=a&&md<=b);}
 function shiftDate(date,n){return new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);}
 function previousSession(date){assertDate(date);do{date=shiftDate(date,-1);assertDate(date);}while(!isSession(date));return date;}
 function nextSession(date,n=1){assertDate(date);if(!Number.isInteger(n)||n<0)throw error('calendar_invalid_horizon',n);while(n>0){date=shiftDate(date,1);assertDate(date);if(isSession(date))n--;}return date;}
 function maturitySession(entry,horizon=20){if(!isSession(entry))throw error('calendar_not_session',entry);return nextSession(entry,horizon);}
 function minutes(at){const d=new Date(instant(at)+8*3600000);return d.getUTCHours()*60+d.getUTCMinutes()+d.getUTCSeconds()/60;}
 function isTradingTime(at){const date=sessionOf(at);if(!isSession(date))return false;const m=minutes(at);return(m>=570&&m<690)||(m>=780&&m<897);}
 function expectedCompletedSession(at){const date=sessionOf(at);return isSession(date)&&minutes(at)>=16*60?date:previousSession(date);}
 return{version,coverage,sources,sessionOf,isSession,isTradingTime,expectedCompletedSession,previousSession,nextSession,maturitySession};
});
