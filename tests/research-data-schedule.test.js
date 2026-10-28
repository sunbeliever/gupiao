'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=()=>require('../scripts/research-data-schedule.js');
test('prospective schedule never retries todays failed version or starts before 09:00 Beijing',()=>{assert.equal(P().plan('D:/root',Date.parse('2026-10-28T08:30:00Z')),null);assert.equal(P().plan('D:/root',Date.parse('2026-10-29T00:59:59Z')),null);});
test('next session captures only previous completed session with explicit capture identity',()=>{const p=P().plan('D:/root',Date.parse('2026-10-29T01:00:00Z'));assert.equal(p.id,'stable-daily-data-2026-10-29');assert.equal(p.expectedAsOf,'2026-10-28');assert.deepEqual(p.years,[2026]);assert.equal(p.sourceBinding.captureSession,'2026-10-29');assert.match(p.sourceBinding.protocolSha256,/^[a-f0-9]{64}$/);assert.equal(p.minBars,60);});
test('late login keeps predetermined prior-session cutoff and does not chase current close',()=>{assert.deepEqual(P().plan('D:/root',Date.parse('2026-10-29T01:00:00Z')),P().plan('D:/root',Date.parse('2026-10-29T12:00:00Z')));});
test('weekend and unknown future calendar do not manufacture a data policy',()=>{assert.equal(P().plan('D:/root',Date.parse('2026-10-31T02:00:00Z')),null);assert.equal(P().plan('D:/root',Date.parse('2027-01-05T02:00:00Z')),null);const p=P().plan('D:/root',Date.parse('2026-11-02T01:00:00Z'));assert.equal(p.expectedAsOf,'2026-10-30');});
