const {test}=require('node:test');
const assert=require('node:assert/strict');
let Calendar;try{Calendar=require('../assets/trading-calendar.js');}catch(e){}

test('exchange calendar excludes official National Day closures and make-up weekends',()=>{
 assert.equal(typeof Calendar?.isSession,'function');
 assert.equal(Calendar.isSession('2026-10-01'),false);
 assert.equal(Calendar.isSession('2026-10-10'),false);
 assert.equal(Calendar.isSession('2026-10-08'),true);
 assert.equal(Calendar.previousSession('2026-10-08'),'2026-09-30');
 assert.equal(Calendar.previousSession('2026-10-19'),'2026-10-16');
});
test('calendar separates lunch, closing auction and the conservative daily completion cutoff',()=>{
 assert.equal(Calendar.isTradingTime('2026-10-20T09:29:59+08:00'),false);
 assert.equal(Calendar.isTradingTime('2026-10-20T09:30:00+08:00'),true);
 assert.equal(Calendar.isTradingTime('2026-10-20T11:30:00+08:00'),false);
 assert.equal(Calendar.isTradingTime('2026-10-20T12:00:00+08:00'),false);
 assert.equal(Calendar.isTradingTime('2026-10-20T13:00:00+08:00'),true);
 assert.equal(Calendar.isTradingTime('2026-10-20T14:57:00+08:00'),false);
 assert.equal(Calendar.expectedCompletedSession('2026-10-08T15:59:59+08:00'),'2026-09-30');
 assert.equal(Calendar.expectedCompletedSession('2026-10-08T16:00:00+08:00'),'2026-10-08');
 assert.equal(Calendar.expectedCompletedSession('2026-10-19T09:00:00+08:00'),'2026-10-16');
 assert.equal(Calendar.expectedCompletedSession('2026-10-04T18:00:00+08:00'),'2026-09-30');
});
test('T+1 and maturity advance actual sessions through holidays',()=>{
 assert.equal(Calendar.nextSession('2026-02-13'),'2026-02-24');
 assert.equal(Calendar.isSession('2026-02-23'),false);
 assert.equal(Calendar.maturitySession('2026-09-30',1),'2026-10-08');
 assert.equal(Calendar.maturitySession('2026-09-30',20),'2026-11-04');
 assert.equal(Calendar.sessionOf(Date.parse('2026-10-19T16:30:00Z')),'2026-10-20');
});
test('unknown calendar coverage fails closed rather than guessing weekdays',()=>{
 assert.throws(()=>Calendar.isSession('2027-01-04'),/calendar_uncovered/);
 assert.throws(()=>Calendar.expectedCompletedSession('2027-01-04T10:00:00+08:00'),/calendar_uncovered/);
 assert.throws(()=>Calendar.nextSession('2026-12-31'),/calendar_uncovered/);
 assert.equal(Calendar.coverage.from,'2023-01-01');
 assert.equal(Calendar.coverage.to,'2026-12-31');
 assert.equal(Calendar.sources.length,4);
});
test('published prior-year closure notices cover all four research years',()=>{
 for(const day of ['2023-01-02','2023-05-03','2023-09-29','2024-02-09','2024-09-17','2025-01-28','2025-06-02','2025-10-08'])assert.equal(Calendar.isSession(day),false,day);
 for(const day of ['2023-01-03','2024-02-19','2025-02-05','2026-02-24'])assert.equal(Calendar.isSession(day),true,day);
});
