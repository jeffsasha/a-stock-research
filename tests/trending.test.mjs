import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as market from '../lib/market.mjs';
import {readFileSync} from 'node:fs';

test('trending preserves provider ranks and percent units; rejects non-equities',()=>{
  const items=market.parseTrending({data:{stock_list:[
    {code:'600693',name:'东百集团',order:2,rate:'531396',rise_and_fall:10.0179,tag:{concept_tag:['免税店']}},
    {code:'000001',name:'平安银行',order:1,rate:'--',rise_and_fall:null},
    {code:'SH000300',name:'指数',order:3},
    {code:'600693',name:'重复',order:4},
  ]}});
  assert.deepEqual(items.map(x=>x.code),['000001','600693']);
  assert.equal(items[1].changePct,10.0179);
  assert.equal(items[0].heat,null);
  assert.equal(items[0].changePct,null);
  assert.deepEqual(items[1].tags,['免税店']);
});
test('trending distinguishes provider failure from a valid empty list',()=>{
  assert.throws(()=>market.parseTrending({data:{}}),/结构/);
  assert.deepEqual(market.parseTrending({data:{stock_list:[]}}),[]);
});

test('failed primary uses real ranked backup with explicit period warning and deduplicates fetches',async()=>{
  const original=globalThis.fetch, calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url:String(url),options});
    if(String(url).includes('10jqka'))return new Response('unavailable',{status:503});
    if(String(url).includes('eastmoney'))return Response.json({data:[{sc:'SH688700',rk:1}]});
    return new Response(readFileSync(new URL('./fixtures/quote.txt',import.meta.url)));
  };
  try{
    const [a,b]=await Promise.all([market.trending('hour'),market.trending('hour')]);
    assert.deepEqual(a,b);assert.equal(calls.length,3);
    assert.equal(calls[1].options.method,'POST');
    assert.equal(JSON.parse(calls[1].options.body).pageSize,12);
    assert.equal(a.items[0].rank,1);assert.equal(a.items[0].name,'东威科技');
    assert.equal(a.items[0].heat,null);assert.equal(a.as_of,null);
    assert.match(a.warnings.join('；'),/不区分小时与日榜/);
    assert.equal((await market.trending('hour')).cache,'memory');assert.equal(calls.length,3);
  }finally{globalThis.fetch=original;}
});
