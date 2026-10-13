// Validate the actual GET handlers independently of the Windows workerd host.
import {writeFileSync,mkdirSync} from 'node:fs';
import {handleApi} from '../lib/api.mjs';
import assert from 'node:assert/strict';
const stock=handleApi,search=handleApi;
const context=(code,section)=>({params:Promise.resolve({code,section})});
const result={tested_at:new Date().toISOString(),checks:[]};
async function check(name,fn){await fn();result.checks.push({name,status:'PASS'});console.log('PASS',name);}
await check('非法股票返回400',async()=>assert.equal((await stock(new Request('http://localhost/api/research/123'),context('123'))).status,400));
await check('未知项目返回404',async()=>assert.equal((await stock(new Request('http://localhost/api/research/688700/bad'),context('688700',['bad']))).status,404));
await check('空搜索返回400',async()=>assert.equal((await search(new Request('http://localhost/api/search'))).status,400));
await check('真实行情JSON与禁止公共缓存',async()=>{
  const r=await stock(new Request('http://localhost/api/research/688700/quote'),context('688700',['quote']));
  assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');
  const body=await r.json();assert.equal(body.status,'ok');assert.equal(body.code,'688700');assert.ok(body.data.price>0);
});
await check('真实中文名称搜索JSON',async()=>{
  const r=await search(new Request('http://localhost/api/search?q='+encodeURIComponent('东威科技')));
  assert.equal(r.status,200);assert.ok((await r.json()).results.some(x=>x.code==='688700'));
});
mkdirSync('verification',{recursive:true});writeFileSync('verification/api-test.json',JSON.stringify(result,null,2));
