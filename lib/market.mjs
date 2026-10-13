// Application adapter derived from a-stock-data v3.10.0 (Apache-2.0).
// Original instructions remain byte-for-byte intact in vendor/a-stock-data/.
// No executable code from provider responses is evaluated.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const memory = new Map();
const inflight = new Map();
let emQueue = Promise.resolve();
let emLast = 0;
let sinaQueue = Promise.resolve();
let sinaLast = 0;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export const CHANNELS = ['quote','daily','financials','fund-flow','news','reports','forecast'];
const TTL = {quote:60, daily:1800, financials:7200, 'fund-flow':900, news:300, reports:1800, forecast:7200};

export function normalizeTicker(input) {
  const match = /^(?:(sh|sz|bj)(\d{6})|(\d{6})(?:\.(sh|sz|bj|xshg|xshe))?)$/i.exec(String(input).trim());
  if (!match) throw new Error('请输入完整的6位A股代码，或 SH600519 / 600519.SH。');
  const code = match[2] || match[3];
  const explicit = ({xshg:'sh',xshe:'sz'})[(match[1] || match[4] || '').toLowerCase()] || (match[1] || match[4] || '').toLowerCase();
  const market = /^(4|8|92)/.test(code) ? 'bj' : /^6/.test(code) ? 'sh' : 'sz';
  if (!/^(600|601|603|605|688|689|000|001|002|003|300|301|920|43|83|87)\d{3}$/.test(code)) throw new Error('当前仅支持A股个股，不支持指数、ETF或B股。');
  if (explicit && explicit !== market) throw new Error('市场标识与代码不一致，或输入指向指数。');
  if (/^(43|83|87)/.test(code)) throw new Error('这是北交所旧代码，可能返回冻结报价。请按公司名称查找现行920代码。');
  return {code,market,symbol:market+code};
}

export function number(value) {
  if (value == null || String(value).trim() === '' || /^(--?|null|None|N\/A)$/i.test(String(value).trim())) return null;
  const n = Number(String(value).replace(/,/g,''));
  return Number.isFinite(n) ? n : null;
}
const positive = v => {const n = number(v);return n != null && n > 0 ? n : null;};
const dateStamp = d => /^\d{8}$/.test(d) ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : String(d).slice(0,10);
export function cleanText(text) {
  return String(text ?? '').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).trim();
}
export function safeUrl(value) {
  try {const u = new URL(value);return ['http:','https:'].includes(u.protocol) ? u.href : null;} catch {return null;}
}
function source(name,url,extra={}) {return {name,url,...extra};}

async function request(url, params={}, options={}) {
  const target = new URL(url);
  for (const [k,v] of Object.entries(params)) target.searchParams.set(k,String(v));
  const attempt = async () => {
    let r;
    try {
      r = await fetch(target,{headers:{'User-Agent':UA,Referer:options.referer || 'https://finance.sina.com.cn/',...options.headers},signal:AbortSignal.timeout(options.timeout || 12000)});
    } catch (error) {
      throw new Error(`${target.hostname}：${error.cause?.code || error.message || '连接失败'}`);
    }
    if (!r.ok) throw new Error(`${target.hostname} HTTP ${r.status}`);
    // Bounded response size: providers are allowlisted by callers, not user URLs.
    if (Number(r.headers.get('content-length')) > 3000000) throw new Error('数据源响应超出大小限制');
    const data = new Uint8Array(await r.arrayBuffer());
    if (data.byteLength > 3000000) throw new Error('数据源响应超出大小限制');
    return {text:new TextDecoder(options.encoding || 'utf-8').decode(data),url:r.url || target.href};
  };
  if (!options.eastmoney) return attempt();
  // Serialize every Eastmoney call in this Worker isolate, including all API routes.
  const job = emQueue.catch(()=>{}).then(async()=>{
    await wait(Math.max(0,1100 + Math.random()*350-(Date.now()-emLast)));
    try {return await attempt();} finally {emLast=Date.now();}
  });
  emQueue=job.then(()=>{},()=>{});
  return job;
}
function parseJson(text) {try{return JSON.parse(text);}catch{throw new Error('数据源返回非JSON响应，可能被限流或页面结构已变化');}}

export function parseQuote(text, ticker) {
  const m = new RegExp(`v_${ticker.symbol}="([^"]*)"`).exec(text);
  if (!m) throw new Error('未取得该代码行情，请检查股票是否存在或代码是否已变更。');
  const f=m[1].split('~');
  if(f.length<53 || !/^\d{14}$/.test(f[30]) || f[2] !== ticker.code || !positive(f[3])) throw new Error('腾讯行情结构或股票代码校验失败');
  const tradeDate=dateStamp(f[30].slice(0,8));
  return {code:ticker.code,market:ticker.market,name:f[1],price:positive(f[3]),previousClose:number(f[4]),open:number(f[5]),high:number(f[33]),low:number(f[34]),change:number(f[31]),changePct:number(f[32]),amountYuan:number(f[35].split('/')[2]),turnoverPct:number(f[38]),peTtm:positive(f[39]),pb:positive(f[46]),marketCapYi:positive(f[45]),floatMarketCapYi:positive(f[44]),shares:positive(f[72]),tradeDate,tradeTime:`${f[30].slice(8,10)}:${f[30].slice(10,12)}:${f[30].slice(12,14)}`,timezone:'Asia/Shanghai',inactive:number(f[37])===0 && number(f[3])===number(f[4])};
}
async function quote(t) {
  const r=await request('https://qt.gtimg.cn/q='+t.symbol,{}, {encoding:'gbk',referer:'https://gu.qq.com/'});
  const data=parseQuote(r.text,t);
  return {data,as_of:data.tradeDate,sources:[source('腾讯财经',r.url)],warnings:data.inactive?['该报价无成交且价格未变化，可能停牌或冻结；估值计算暂停。']:[]};
}

export function parseDaily(payload,t) {
  const node=payload?.data?.[t.symbol];
  const items=node?.qfqday || node?.day;
  if(!Array.isArray(items) || !items.length) throw new Error('腾讯日线为空或结构改变');
  const adjust=node.qfqday ? 'qfq' : 'none';
  const bars=items.map(x=>({date:x[0],open:number(x[1]),close:number(x[2]),high:number(x[3]),low:number(x[4]),volume:number(x[5])})).sort((a,b)=>a.date.localeCompare(b.date));
  const seen=new Set();
  for(const b of bars){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || seen.has(b.date) || [b.open,b.close,b.high,b.low].some(x=>x==null||x<=0) || b.high<Math.max(b.open,b.close,b.low) || b.low>Math.min(b.open,b.close,b.high)) throw new Error('日线日期、重复行或OHLC校验失败');
    seen.add(b.date);
  }
  const ma={};const returns={};
  for(const n of [5,20,60]){
    ma[n]=bars.length>=n ? bars.slice(-n).reduce((s,b)=>s+b.close,0)/n : null;
    returns[n]=bars.length>n ? (bars.at(-1).close/bars.at(-n-1).close-1)*100 : null;
  }
  return {bars,adjust,ma,returns,volumeUnit:/^68/.test(t.code)?'股':'手',priceUnit:'元'};
}
async function daily(t) {
  if(t.market==='bj') throw new Error('腾讯北交所历史日线不完整，当前不提供，避免使用单根冻结数据。新闻、研报和其他可用项目可继续查询。');
  const failures=[];
  for(const host of ['https://web.ifzq.gtimg.cn','https://proxy.finance.qq.com/ifzqgtimg','https://ifzq.gtimg.cn']){
    try{
      const r=await request(host+'/appstock/app/fqkline/get',{param:`${t.symbol},day,,,250,qfq`},{referer:'https://gu.qq.com/',timeout:10000});
      const data=parseDaily(parseJson(r.text),t);
      return {data,as_of:data.bars.at(-1).date,sources:[source('腾讯财经',r.url)],warnings:[...failures,...(data.adjust==='none'?['源未提供前复权，当前为不复权价格，跨分红收益率需谨慎。']:[])]};
    }catch(e){failures.push(`${new URL(host).hostname}：${e.message}`);}
  }
  throw new Error('日线各入口均不可用：'+failures.join('；'));
}

export function parseFinancial(text) {
  const p=parseJson(text);
  const list=p?.result?.data?.report_list;
  if(!list || typeof list !== 'object' || !Object.keys(list).length) throw new Error('财报为空，该市场覆盖可能不足，或接口不可用');
  return Object.keys(list).sort().reverse().slice(0,8).map(period=>{
    const row={period:dateStamp(period)};
    if(!Array.isArray(list[period]?.data)) throw new Error('财报行结构改变');
    for(const item of list[period].data){if(item.item_title){row[item.item_title]=number(item.item_value);if(number(item.item_tongbi)!=null)row[item.item_title+'_yoy']=number(item.item_tongbi)*100;}}
    return row;
  });
}
export function financialMetrics(tables) {
  const income=tables.lrb?.rows || [];
  const latest=income[0] || {};
  const balance=(tables.fzb?.rows || []).find(x=>x.period===latest.period)||{};
  const cash=(tables.llb?.rows || []).find(x=>x.period===latest.period)||{};
  const revenue=latest['营业收入'];const profit=latest['归属于母公司所有者的净利润'];
  const m={period:latest.period||null,revenue:revenue??null,revenueYoy:latest['营业收入_yoy']??null,netProfit:profit??null,netProfitYoy:latest['归属于母公司所有者的净利润_yoy']??null,eps:latest['基本每股收益']??null,grossMargin:revenue>0 && latest['营业成本']!=null ? (1-latest['营业成本']/revenue)*100:null,netMargin:revenue>0 && profit!=null ? profit/revenue*100:null,cfo:cash['经营活动产生的现金流量净额']??null,cfoYoy:cash['经营活动产生的现金流量净额_yoy']??null,inventory:balance['存货']??null,contractLiability:balance['合同负债']??null,bookEquity:balance['归属于母公司股东权益合计']??null,shares:balance['实收资本(或股本)']??null};
  if(latest.period){
    const year=+latest.period.slice(0,4);
    const lastAnnual=income.find(x=>x.period===`${year-1}-12-31`);
    const comparable=income.find(x=>x.period===`${year-1}${latest.period.slice(4)}`);
    m.ttmProfit=latest.period.endsWith('12-31') ? profit : lastAnnual && comparable && profit!=null && lastAnnual['归属于母公司所有者的净利润']!=null && comparable['归属于母公司所有者的净利润']!=null ? lastAnnual['归属于母公司所有者的净利润']+profit-comparable['归属于母公司所有者的净利润']:null;
    const prior=(tables.fzb?.rows||[]).find(x=>x.period===`${year-1}-12-31`);
    m.inventoryVsYearend=prior?.['存货']>0 && m.inventory!=null ? (m.inventory/prior['存货']-1)*100:null;
    m.contractVsYearend=prior?.['合同负债']>0 && m.contractLiability!=null ? (m.contractLiability/prior['合同负债']-1)*100:null;
  }
  return m;
}
async function financials(t) {
  const tables={};const warnings=[];const sources=[];
  // Independent Sina statements may fail separately; never coerce missing to zero.
  for(const type of ['lrb','fzb','llb']){
    try{
      const r=await request('https://quotes.sina.cn/cn/api/openapi.php/CompanyFinanceService.getFinanceReport2022',{paperCode:t.symbol,source:type,type:0,page:1,num:8});
      tables[type]={status:'ok',rows:parseFinancial(r.text)};sources.push(source('新浪财报三表',r.url,{table:type}));
    }catch(e){tables[type]={status:'error',rows:[],error:e.message};warnings.push(`${type}：${e.message}`);}
  }
  if(!Object.values(tables).some(x=>x.rows.length)) throw new Error(warnings.join('；'));
  const metrics=financialMetrics(tables);
  return {data:{metrics,tables,unit:'元'},as_of:metrics.period,sources,warnings};
}

async function fundFlow(t) {
  const failures=[];
  try{
    const r=await request('https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get',{secid:`${t.market==='sh'?1:0}.${t.code}`,fields1:'f1,f2,f3,f7',fields2:'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65',lmt:120},{eastmoney:true,referer:'https://quote.eastmoney.com/'});
    const data=parseJson(r.text);const list=data?.data?.klines;
    if(!Array.isArray(list)||!list.length) throw new Error('资金流为空，未按零流入处理');
    const rows=list.map(x=>{const a=x.split(',');return {date:a[0],mainNet:number(a[1]),smallNet:number(a[2]),midNet:number(a[3]),largeNet:number(a[4]),superNet:number(a[5])};}).sort((a,b)=>a.date.localeCompare(b.date));
    if(rows.some(x=>!/^\d{4}-\d{2}-\d{2}$/.test(x.date)) || new Set(rows.map(x=>x.date)).size!==rows.length) throw new Error('资金流日期或重复行校验失败');
    const sums={};for(const n of [1,5,20,60]){const tail=rows.slice(-n);sums[n]=tail.length===n&&tail.every(x=>x.mainNet!=null)?tail.reduce((s,x)=>s+x.mainNet,0):null;}
    return {data:{rows,sums,unit:'元',definition:'东财大单与超大单分类净额，不等同机构账户买卖'},as_of:rows.at(-1).date,sources:[source('东方财富',r.url)],warnings:[]};
  }catch(e){failures.push('东财：'+e.message);}
  const r=await request('https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/MoneyFlow.ssl_qsfx_zjlrqs',{page:1,num:60,sort:'opendate',asc:0,daima:t.symbol});
  const list=parseJson(r.text);
  if(!Array.isArray(list)||!list.length) throw new Error(failures.join('；')+'；新浪备用源也无数据');
  const rows=list.map(x=>({date:x.opendate,netAmount:number(x.netamount),close:number(x.trade)})).sort((a,b)=>a.date.localeCompare(b.date));
  return {data:{rows,sums:null,unit:'元',definition:'新浪资金净额，口径与东财主力净额不同，未合并累计'},as_of:rows.at(-1).date,sources:[source('新浪资金流备用源',r.url)],warnings:failures};
}

export function parseNews(text) {
  const raw=text.trim();
  const jsonp=/^[\w.$]+\s*\(([\s\S]*)\)\s*;?$/.exec(raw);
  const p=parseJson(jsonp ? jsonp[1] : raw);
  const list=p?.result?.cmsArticleWebOld;
  if(!Array.isArray(list)) throw new Error('新闻接口结构改变或返回错误页');
  return list.map(x=>({title:cleanText(x.title),content:cleanText(x.content).slice(0,300),date:x.date,source:x.mediaName||'东方财富',url:safeUrl(x.url)})).filter(x=>x.title&&x.url);
}
async function news(t) {
  let name=t.code;const warnings=[];
  const q=await getPart(t.code,'quote');
  if(q.data?.name) name=q.data.name;
  else warnings.push('行情名称不可用，新闻以代码检索，可能包含行业汇总文章。');
  const inner={uid:'',keyword:name,type:['cmsArticleWebOld'],client:'web',clientType:'web',clientVersion:'curr',param:{cmsArticleWebOld:{searchScope:'default',sort:'default',pageIndex:1,pageSize:50,preTag:'',postTag:''}}};
  const r=await request('https://search-api-web.eastmoney.com/search/jsonp',{cb:'jQuery_news',param:JSON.stringify(inner)},{eastmoney:true,referer:'https://so.eastmoney.com/'});
  const rows=parseNews(r.text).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const data=[...new Map(rows.map(x=>[x.url,x])).values()];
  return {data,as_of:data[0]?.date?.slice(0,10)||null,sources:[source('东方财富新闻搜索',r.url)],warnings:[...warnings,'搜索结果按日期排序，但不保证新闻库覆盖完整；行业文章不等同公司公告。']};
}

export function parseSinaReports(html) {
  if(!html.includes('tb_01')) throw new Error('新浪研报页面结构改变');
  const rows=[];
  const tr=/<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  for(const m of html.matchAll(tr)){
    const cells=[...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x=>x[1]);
    if(cells.length<6 || !/^\d+$/.test(cleanText(cells[0]))) continue;
    const link=/href=["']([^"']*vReport_Show[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i.exec(cells[1]);
    if(!link) throw new Error('新浪研报行缺少详情链接');
    const url=safeUrl(link[1].startsWith('//')?'https:'+link[1]:link[1]);
    if(!url) throw new Error('新浪研报链接无效');
    rows.push({title:cleanText(link[2]),date:cleanText(cells[3]),org:cleanText(cells[4]),author:cleanText(cells[5]),url,source:'新浪研报',rating:null,eps:null});
  }
  if(!rows.length && !html.includes('没有找到相关内容')) throw new Error('新浪研报列表解析失败，未作为没有研报处理');
  return rows;
}
function reportKey(x) {return `${x.org.replace(/证券股份有限公司|证券有限公司|股份有限公司/g,'').replace(/证券$/,'')}|${x.date.slice(0,10)}|${x.title.replace(/^[^（(]+[（(]\d{6}[）)]/,'').replace(/[()（）\s：:,，]/g,'')}`;}
async function reports(t) {
  const data=[];const sources=[];const warnings=[];
  try{
    const r=await request('https://reportapi.eastmoney.com/report/list',{industryCode:'*',pageSize:100,industry:'*',rating:'*',ratingChange:'*',beginTime:'2000-01-01',endTime:`${new Date().getUTCFullYear()+1}-01-01`,pageNo:1,fields:'',qType:0,orgCode:'',code:t.code,rcode:'',p:1,pageNum:1,pageNumber:1},{eastmoney:true,referer:'https://data.eastmoney.com/',timeout:15000});
    const p=parseJson(r.text);
    if(!Array.isArray(p.data)) throw new Error('东财研报结构改变或无有效响应');
    for(const x of p.data){
      if(x.stockCode && String(x.stockCode)!==t.code) throw new Error('研报股票代码不一致');
      const year=+(x.publishDate||'').slice(0,4);
      const eps=[x.predictThisYearEps,x.predictNextYearEps,x.predictNextTwoYearEps].map((v,i)=>({year:year+i,value:number(v)}));
      const id=/^AP\d+$/.test(x.infoCode||'') ? x.infoCode:null;
      data.push({title:cleanText(x.title),date:(x.publishDate||'').slice(0,10),org:x.orgSName||x.orgName,author:x.researcher||'',rating:x.emRatingName||null,eps,url:id?`https://data.eastmoney.com/report/info/${id}.html`:null,pdfUrl:id?`https://pdf.dfcfw.com/pdf/H3_${id}_1.pdf`:null,source:'东方财富研报'});
    }
    sources.push(source('东方财富研报',r.url));
  }catch(e){warnings.push('东财：'+e.message);}
  try{
    const job=sinaQueue.catch(()=>{}).then(async()=>{
      let response;
      for(let attempt=0;attempt<2;attempt++){
        await wait(Math.max(0,6100-(Date.now()-sinaLast)));
        try{response=await request('https://stock.finance.sina.com.cn/stock/go.php/vReport_List/kind/search/index.phtml',{symbol:t.symbol,t1:'all',p:1},{encoding:'gbk',timeout:15000});}
        finally{sinaLast=Date.now();}
        const parsed=parseSinaReports(response.text);
        if(parsed.length||attempt===1)return {response,parsed};
      }
    });
    sinaQueue=job.then(()=>{},()=>{});
    const {response,parsed}=await job;
    data.push(...parsed);sources.push(source('新浪研报',response.url));
  }catch(e){warnings.push('新浪：'+e.message);}
  if(!sources.length) throw new Error(warnings.join('；'));
  const sorted=data.filter(x=>x.title&&x.url).sort((a,b)=>b.date.localeCompare(a.date));
  const dedup=new Map();for(const x of sorted){const key=reportKey(x);if(!dedup.has(key))dedup.set(key,x);}
  return {data:[...dedup.values()],as_of:sorted[0]?.date||null,sources,warnings:[...warnings,'合并东财与新浪已覆盖研报；发布日期可能与原报告日期相差一天，预测按各报告年份标注。']};
}

export function parseForecast(html) {
  const rows=[];
  const marker=html.indexOf('预测年报每股收益');
  if(marker<0) throw new Error('未找到每股收益预测表，未使用其他表格替代');
  const tableStart=html.lastIndexOf('<table',marker);
  const fragment=html.slice(tableStart,html.indexOf('</table>',tableStart)+8);
  for(const m of fragment.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>cleanText(x[1]));
    if(cells.length>=5 && /^20\d{2}$/.test(cells[0])) rows.push({year:+cells[0],institutions:number(cells[1]),min:number(cells[2]),mean:number(cells[3]),max:number(cells[4])});
  }
  if(!rows.length) throw new Error('机构EPS表为空或结构改变');
  const date=/(?:截至|截止)\s*(\d{4}-\d{2}-\d{2})/.exec(cleanText(html));
  return {rows,asOf:date?.[1]||date?.[2]||null};
}
async function forecast(t) {
  const r=await request(`https://basic.10jqka.com.cn/new/${t.code}/worth.html`,{}, {encoding:'gbk',referer:'https://basic.10jqka.com.cn/'});
  const data=parseForecast(r.text);
  return {data,as_of:data.asOf,sources:[source('同花顺机构EPS汇总',r.url)],warnings:['机构预测不是公司承诺或已实现盈利。']};
}

const loaders={quote,daily,financials,'fund-flow':fundFlow,news,reports,forecast};
export async function getPart(input,channel) {
  const t=normalizeTicker(input);
  if(!CHANNELS.includes(channel)) throw new Error('不支持的数据类型');
  const key=`${t.code}:${channel}`;const old=memory.get(key);const now=Date.now();
  if(old&&old.expires>now) return {...old.value,cache:'memory'};
  if(inflight.has(key)) return inflight.get(key);
  const promise=(async()=>{
    try{
      const value=await loaders[channel](t);
      const result={code:t.code,channel,status:Array.isArray(value.data)&&!value.data.length?'empty':'ok',...value,fetched_at:new Date().toISOString(),cache:'fresh'};
      if(memory.size>=160) memory.delete(memory.keys().next().value);
      memory.set(key,{expires:now+TTL[channel]*1000,value:result});return result;
    }catch(e){
      if(old?.value?.status==='ok' && now-new Date(old.value.fetched_at).getTime()<48*3600000) return {...old.value,cache:'stale',warnings:[...old.value.warnings,'更新失败，显示上次取得的数据：'+e.message]};
      const result={code:t.code,channel,status:'error',data:null,as_of:null,fetched_at:new Date().toISOString(),cache:'fresh',sources:[],warnings:[],error:e.message||'数据接口不可用'};
      memory.set(key,{expires:now+30000,value:result});return result;
    }finally{inflight.delete(key);}
  })();
  inflight.set(key,promise);return promise;
}

export async function searchStocks(query) {
  const q=String(query||'').trim();
  if(q.length<2 || q.length>30) throw new Error('请输入2—30个字符的股票名称或完整代码。');
  if(/\d{6}/.test(q)){
    const t=normalizeTicker(q);const p=await getPart(t.code,'quote');
    if(p.status!=='ok') throw new Error(p.error||'股票行情不可用');
    return [{code:t.code,market:t.market,name:p.data.name}];
  }
  const r=await request('https://smartbox.gtimg.cn/s3/',{q,t:'all'},{encoding:'gbk',referer:'https://gu.qq.com/'});
  const match=/v_hint="([^"\n]*)"/.exec(r.text);
  if(!match) throw new Error('名称搜索接口结构改变，请使用完整6位代码。');
  // Tencent's hint string contains escaped Unicode; JSON parsing only, never eval.
  let hint;try{hint=JSON.parse('"'+match[1]+'"');}catch{throw new Error('名称搜索结果无法解析，请使用完整6位代码。');}
  const items=hint.split('^').map(x=>x.split('~')).filter(x=>['sh','sz','bj'].includes(x[0]) && /^\d{6}$/.test(x[1]));
  const rows=[];
  for(const x of items){try{const t=normalizeTicker(x[0]+x[1]);rows.push({code:t.code,market:t.market,name:x[2]});}catch{/* Exclude indices, ETFs and retired tickers. */}}
  return [...new Map(rows.map(x=>[x.code,x])).values()].slice(0,12);
}

const f=(v,d=2)=>v==null?'缺失':Number(v).toFixed(d);
const yi=v=>v==null?'缺失':`${f(v/1e8)}亿元`;
export function summarize(parts) {
  const q=parts.quote?.status==='ok'?parts.quote.data:null;
  const d=parts.daily?.status==='ok'?parts.daily.data:null;
  const m=parts.financials?.status==='ok'?parts.financials.data.metrics:null;
  const flow=parts['fund-flow']?.status==='ok'?parts['fund-flow'].data:null;
  const estimates=parts.forecast?.status==='ok'?parts.forecast.data:null;
  const out=[];const risks=[];const metrics={};
  if(m?.period && m.revenue!=null) out.push({title:'经营表现',text:`截至${m.period}累计营收${yi(m.revenue)}，同比${f(m.revenueYoy)}%；归母净利润${yi(m.netProfit)}，同比${f(m.netProfitYoy)}%。毛利率${f(m.grossMargin)}%。`,evidence:'financials'});
  if(m?.cfo!=null) out.push({title:'现金与订单线索',text:`经营现金流净额${yi(m.cfo)}。合同负债${yi(m.contractLiability)}，存货${yi(m.inventory)}。预收款和存货不等于已确认收入，关注交付验收与周转。`,evidence:'financials'});
  if(m?.inventoryVsYearend>25) risks.push('存货较上一年末明显增加，需核对发出商品验收、周转和减值风险。');
  if(m?.cfo!=null && m.netProfit>0 && m.cfo/m.netProfit<0.5) risks.push('经营现金流低于同期净利润的一半，关注利润回款。');
  if(q&&!q.inactive){
    metrics.pbLatest=m?.bookEquity>0 && m.shares>0 ? q.price*m.shares/m.bookEquity:null;
    metrics.peTtmCalculated=m?.ttmProfit>0 && m.shares>0 ? q.price*m.shares/m.ttmProfit:null;
    const currentYear=+q.tradeDate.slice(0,4);
    const current=estimates?.rows.find(x=>x.year===currentYear);
    metrics.forecastYear=current?.year||null;metrics.epsMean=current?.mean||null;
    metrics.forwardPe=current?.mean>0 && current?.institutions>=3 ? q.price/current.mean:null;
    out.push({title:'估值与预测',text:`报价PE(TTM)${f(q.peTtm)}倍，PB${f(q.pb)}倍。${metrics.pbLatest!=null?`按${m.period}归母净资产重算PB${f(metrics.pbLatest)}倍，未扣随后分红。`:''}${metrics.forwardPe!=null?`${current.institutions}家机构${current.year}年EPS均值${f(current.mean)}元，对应预期PE${f(metrics.forwardPe)}倍。预测区间${f(current.min)}—${f(current.max)}元。`:'当前年份EPS覆盖不足，未计算一致预期PE。'}`,evidence:'quote,financials,forecast'});
    if(q.peTtm>60 || metrics.forwardPe>40) risks.push('当前估值对未来盈利兑现要求较高；该提示来自固定阈值规则，不是行业公允估值或买卖建议。');
  }else if(q?.inactive)risks.push('无成交或停牌报价，暂停基于该价格的估值判断。');
  if(d&&q){
    const aligned=parts.daily.as_of===q.tradeDate;
    out.push({title:'价格趋势',text:`日线截至${parts.daily.as_of}，MA5/20/60为${f(d.ma[5])}/${f(d.ma[20])}/${f(d.ma[60])}元。近5/20/60交易日涨跌${f(d.returns[5])}%/${f(d.returns[20])}%/${f(d.returns[60])}%。${aligned&&d.ma[5]!=null&&d.ma[20]!=null?(q.price<d.ma[5]&&q.price<d.ma[20]?'价格低于5日、20日均线，短线偏弱。':'价格与均线位置仅反映历史趋势。'):'日线与报价日期不一致，不做即时趋势判断。'}`,evidence:'daily'});
  }
  if(flow?.sums)out.push({title:'成交资金分类',text:`资金流截至${parts['fund-flow'].as_of}，近5日分类净额${yi(flow.sums[5])}，近20日${yi(flow.sums[20])}。口径为大单与超大单估算，不等同机构账户行为。`,evidence:'fund-flow'});
  if(!flow?.sums && flow)out.push({title:'备用资金流',text:'取得新浪备用数据，口径与东财主力净额不同，不合并为主力累计流入。',evidence:'fund-flow'});
  const unavailable=CHANNELS.filter(x=>parts[x]?.status==='error'||!parts[x]);
  if(unavailable.length)risks.push(`部分数据未取得：${unavailable.join('、')}，结论仅基于已显示项目。`);
  const title=m?.netProfitYoy>30 ? '利润增长较快，继续核对订单兑现。' : m?.netProfitYoy<0 ? '盈利承压，关注后续经营修复。' : '先核对事实，再形成投资判断。';
  return {title,observations:out,risks,metrics,method:'rules-v1',methodNote:'公开数据与固定规则生成；不调用大模型，不编造公司业务、催化剂或目标价。新闻和研报观点请核对原文。'};
}

export async function research(input) {
  const {code}=normalizeTicker(input);const parts={};
  // Each result is independent; the Eastmoney transport serializes its own calls.
  await Promise.all(CHANNELS.map(async channel=>{parts[channel]=await getPart(code,channel);}));
  return {code,generated_at:new Date().toISOString(),parts,summary:summarize(parts)};
}
