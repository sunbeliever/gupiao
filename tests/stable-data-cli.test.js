'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {probe}=require('./fixtures/stable-data-cli-probe.cjs');
test('actual dataset CLI admits stable prior cutoff on late login and deferred execution',()=>{for(const when of ['2026-10-29T08:21:00Z','2026-10-30T02:00:00Z']){const r=probe(when);assert.equal(r.accountBoundary,1);assert.match(r.errors[0],/OFFLINE_ACCOUNT_BOUNDARY/);assert.equal(r.childCalls,0);}});
test('actual dataset CLI rejects forged binding and early execution before account access',()=>{for(const r of [probe('2026-10-29T02:00:00Z',p=>p.sourceBinding.protocolSha256='0'.repeat(64)),probe('2026-10-29T00:59:59Z')]){assert.equal(r.accountBoundary,0);assert.match(r.errors[0],/stable/i);assert.equal(r.childCalls,0);}});
test('ordinary dataset CLI still rejects stale cutoff with no stable protocol exception',()=>{const r=probe('2026-10-29T08:21:00Z',p=>{delete p.sourceBinding;});assert.equal(r.accountBoundary,0);assert.match(r.errors[0],/stale|completed-session/);});
