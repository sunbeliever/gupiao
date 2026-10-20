'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createFileStore}=require('../scripts/research-file-store.js');
test('a failed replacement cannot truncate the earliest saved forecast month',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'techscope-journal-'));
 try{
  const original='{"records":[{"publishedAt":"2026-10-19T08:20:00Z"}]}',store=createFileStore(dir);
  assert.equal(store.write('forecast.202610',original),true);
  const faulty=createFileStore(dir,{...fs,writeFileSync:(file,text)=>{fs.writeFileSync(file,text.slice(0,4));throw new Error('disk full');}});
  assert.equal(faulty.write('forecast.202610','{"records":["replacement"]}'),false);
  assert.equal(store.read('forecast.202610'),original);
  assert.equal(store.write('forecast.202610','{"records":[]}'),true);assert.equal(store.read('forecast.202610'),'{"records":[]}');
  assert.equal(store.write('../outside','invalid'),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
