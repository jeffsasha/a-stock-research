import {research,getPart,searchStocks} from '../lib/market.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const result={tested_at:new Date().toISOString(),checks:[],warnings:[]};
async function check(name,fn,validate){
  const start=Date.now();
  try{const data=await fn();validate(data);result.checks.push({name,status:'PASS',seconds:(Date.now()-start)/1000,detail:data});console.log('PASS',name);}
  catch(e){result.checks.push({name,status:'FAIL',error:e.message,seconds:(Date.now()-start)/1000});console.log('FAIL',name,e.message);}
}
await check('中文名称搜索',()=>searchStocks('东威科技'),x=>{if(!x.some(s=>s.code==='688700'))throw new Error('Missing688700');});
await check('沪深北报价',async()=>{
  const all=[];for(const code of ['688700','600519','000001','920982'])all.push(await getPart(code,'quote'));return all;
},x=>{if(x.some(p=>p.status!=='ok'||!(p.data.price>0)))throw new Error('某市场报价不可用');});
await check('688700七类实时接口与研究摘要',()=>research('688700'),x=>{
  for(const [name,p] of Object.entries(x.parts)){if(p.status==='error')result.warnings.push(name+': '+p.error);}
  if(x.parts.quote.status!=='ok'||x.parts.daily.status!=='ok'||x.parts.financials.status!=='ok'||x.parts.news.status!=='ok'||x.parts.reports.status!=='ok')throw new Error('核心数据类别不可用');
  if(x.parts.daily.data.bars.length<60)throw new Error('历史日线不足60根');
  if(x.parts.daily.as_of!==x.parts.quote.as_of)throw new Error('行情日期不一致');
  if(x.parts.financials.data.metrics.revenue===null)throw new Error('财务指标缺失');
});
await check('600519资讯与研报',async()=>({news:await getPart('600519','news'),reports:await getPart('600519','reports')}),x=>{
  if(x.news.status!=='ok'||x.reports.status!=='ok')throw new Error('第二只股票新闻或研报接口失败');
});
const evidence=p=>({status:p.status,as_of:p.as_of,count:Array.isArray(p.data)?p.data.length:p.data?.bars?.length,warnings:p.warnings});
const compact={...result,checks:result.checks.map(({detail,...check})=>({...check,evidence:Array.isArray(detail)?detail.map(x=>x.code?{code:x.code,...evidence(x),name:x.data?.name,price:x.data?.price}:x):detail?.parts?{code:detail.code,channels:Object.fromEntries(Object.entries(detail.parts).map(([k,p])=>[k,evidence(p)])),summary:detail.summary}:detail?Object.fromEntries(Object.entries(detail).map(([k,p])=>[k,evidence(p)])):null}))};
mkdirSync('verification',{recursive:true});writeFileSync('verification/live-test.json',JSON.stringify(compact,null,2));
console.log(JSON.stringify({checks:result.checks.map(({name,status,error,seconds})=>({name,status,error,seconds})),warnings:result.warnings},null,2));
if(result.checks.some(x=>x.status==='FAIL'))process.exitCode=1;
