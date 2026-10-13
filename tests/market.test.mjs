import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeTicker,number,parseQuote,parseDaily,parseFinancial,parseForecast,parseSinaReports,parseNews,safeUrl,financialMetrics,summarize,getPart} from '../lib/market.mjs';
const read=(n,e='utf8')=>readFileSync(new URL('./fixtures/'+n,import.meta.url),e);
const t=normalizeTicker('688700');
test('reject contradictory markets, indices, funds, truncated and retired codes',()=>{
  for(const input of ['6005190','foo600519','sh000001','000001.SH','SZ600519','SH000001.SZ','510300','835185'])assert.throws(()=>normalizeTicker(input));
  assert.equal(normalizeTicker('000001').symbol,'sz000001');
  assert.equal(normalizeTicker('600519.XSHG').symbol,'sh600519');
  assert.equal(normalizeTicker('BJ920982').symbol,'bj920982');
});
test('unknown numbers remain missing instead of becoming zero',()=>{
  for(const v of ['',null,'-','--','not a number'])assert.equal(number(v),null);
  assert.equal(number('0'),0);assert.equal(number('-123.4'),-123.4);
});
test('actual quote timestamp, units, shares and vendor valuation',()=>{
  const q=parseQuote(new TextDecoder('gbk').decode(read('quote.txt',null)),t);
  assert.equal(q.tradeDate,'2026-09-30');assert.equal(q.price,60.36);assert.equal(q.shares,298401360);
  assert.equal(q.amountYuan,480077970);assert.equal(q.peTtm,101.44);
  assert.throws(()=>parseQuote(read('quote.txt'),normalizeTicker('600519')));
});
test('actual daily payload validates and computes forward-adjusted trend',()=>{
  const payload=JSON.parse(read('daily.json'));const d=parseDaily(payload,t);
  assert.equal(d.bars.length,250);assert.equal(d.bars.at(-1).close,60.36);
  assert.ok(Math.abs(d.ma[20]-62.5115)<0.0001);assert.ok(Math.abs(d.returns[5]+6.70788)<0.0001);
  assert.equal(d.volumeUnit,'股');
  payload.data[t.symbol].qfqday.push(payload.data[t.symbol].qfqday[0]);assert.throws(()=>parseDaily(payload,t));
});
test('TTM profit uses annual plus interim minus prior comparable interim',()=>{
  const m=financialMetrics(JSON.parse(read('financial.json')));
  assert.equal(m.period,'2026-06-30');assert.ok(Math.abs(m.ttmProfit-177555506.21)<0.001);
  assert.ok(Math.abs(m.grossMargin-37.5587585)<0.0001);
  assert.ok(Math.abs(m.contractVsYearend-60.6050091)<0.0001);
  assert.equal(financialMetrics({lrb:{rows:[]}}).revenue,null);
  assert.throws(()=>parseFinancial('{"result":{"data":{"report_list":null}}}'));
});
test('EPS parser selects earnings table, keeps explicit forecast years',()=>{
  const f=parseForecast(read('forecast.html'));
  assert.equal(f.rows[0].year,2026);assert.equal(f.rows[0].mean,1.05);assert.equal(f.rows[0].institutions,10);
  assert.equal(f.asOf,'2026-09-30');assert.throws(()=>parseForecast('<table><td>净利润</td></table>'));
});
test('Sina six-column real HTML parses all report rows and direct URLs',()=>{
  const rows=parseSinaReports(read('sina-reports.html'));
  assert.equal(rows.length,36);assert.equal(rows[0].date,'2026-09-02');assert.ok(rows[0].org.includes('广发'));
  assert.ok(rows[0].url.startsWith('https://'));assert.throws(()=>parseSinaReports('<h1>Access denied</h1>'));
});
test('external text and link safety; valid empty results differ from failures',()=>{
  const rows=parseNews('cb({"result":{"cmsArticleWebOld":[{"title":"<b>新闻</b>","url":"javascript:alert(1)"}]}})');
  assert.deepEqual(rows,[]);assert.equal(safeUrl('javascript:alert(1)'),null);
  assert.throws(()=>parseNews('<h1>HTTP403</h1>'));
});
test('summary will not fabricate forecasts or compute valuation from inactive quote',()=>{
  const s=summarize({quote:{status:'ok',data:{inactive:true,price:60,tradeDate:'2026-09-30'}}});
  assert.equal(s.metrics.forwardPe,undefined);assert.ok(s.risks.some(x=>x.includes('停牌')));
  assert.ok(s.risks.some(x=>x.includes('未取得')));
});
test('plain JSON news keeps parentheses in article text',()=>{
  const rows=parseNews(JSON.stringify({result:{cmsArticleWebOld:[{title:'公司（更新）与产品 (新品)',content:'正文',url:'https://finance.example.com/article'}]}}));
  assert.equal(rows.length,1);
  assert.equal(rows[0].title,'公司（更新）与产品 (新品)');
});
test('provider connection failures identify the failing host',async context=>{
  context.mock.method(globalThis,'fetch',async()=>{throw new TypeError('fetch failed',{cause:{code:'ECONNRESET'}});});
  const result=await getPart('600000','forecast');
  assert.equal(result.status,'error');
  assert.match(result.error,/basic\.10jqka\.com\.cn/);
  assert.match(result.error,/ECONNRESET/);
});
test('forecast fallback counts each institution once using its latest report',async context=>{
  const date=new Date().toISOString().slice(0,10);
  const rows=[
    {stockCode:'600001',infoCode:'AP100',title:'最新A',orgSName:'机构A',publishDate:date,predictThisYearEps:1.2},
    {stockCode:'600001',infoCode:'AP101',title:'最新B',orgSName:'机构B',publishDate:date,predictThisYearEps:0.8},
    {stockCode:'600001',infoCode:'AP102',title:'旧A',orgSName:'机构A',publishDate:date.slice(0,4)+'-01-01',predictThisYearEps:9},
  ];
  context.mock.method(globalThis,'fetch',async input=>{
    const host=new URL(input).hostname;
    if(host==='basic.10jqka.com.cn')throw new TypeError('fetch failed',{cause:{code:'ECONNRESET'}});
    if(host==='reportapi.eastmoney.com')return Response.json({data:rows});
    if(host==='stock.finance.sina.com.cn')return new Response(read('sina-reports.html'));
    throw new Error('Unexpected provider '+host);
  });
  const result=await getPart('600001','forecast');
  assert.equal(result.status,'ok');
  const year=result.data.rows.find(row=>row.year===Number(date.slice(0,4)));
  assert.deepEqual(year,{year:Number(date.slice(0,4)),institutions:2,min:0.8,mean:1,max:1.2});
  assert.equal(result.as_of,date);
  assert.ok(result.warnings.some(text=>text.includes('研报样本')));
  assert.ok(result.warnings.some(text=>text.includes('basic.10jqka.com.cn')));
});
