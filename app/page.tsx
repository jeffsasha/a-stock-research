"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Search, BookOpen, ChartNoAxesCombined, FileText, Radio, RefreshCw, Wallet, Building2, Download } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { summarize } from "@/lib/market.mjs";
import seed from "@/lib/seed.json";
import type { Article, Channel, Daily, Financial, Fund, Part, Parts, Quote, Stock, Summary } from "@/lib/contracts";

const channels:Channel[]=["quote","daily","financials","fund-flow","news","reports","forecast"];
const labels:Record<Channel,string>={quote:"行情",daily:"日线",financials:"财务","fund-flow":"资金流",news:"资讯",reports:"研报",forecast:"机构预测"};
const fmt=(v:number|null|undefined,d=2)=>v==null||!Number.isFinite(v)?"—":v.toLocaleString("zh-CN",{minimumFractionDigits:d,maximumFractionDigits:d});
const amount=(v:number|null|undefined)=>v==null?"—":`${fmt(v/1e8)} 亿元`;
const sign=(v:number|null|undefined)=>v==null?"—":`${v>0?"+":""}${fmt(v)}`;
const validUrl=(v:string)=>/^https?:\/\//i.test(v);
const initial=seed.parts as unknown as Parts;

async function getJson<T>(url:string,signal?:AbortSignal):Promise<T>{
  const r=await fetch(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(65000)]):AbortSignal.timeout(65000)});
  if(!r.headers.get("content-type")?.includes("application/json"))throw new Error("服务暂时不可用，请稍后重试。");
  const data=await r.json() as T & {error?:string};if(!r.ok)throw new Error(data.error||`请求失败 (${r.status})`);return data;
}
function SourceNote({part}:{part?:Part}){
  if(!part)return null;
  return <div className="source-note"><span>{part.cache==="snapshot"?"历史快照 · ":part.cache==="stale"?"上次成功数据 · ":part.cache==="memory"?"缓存 · ":"本次查询 · "}{part.as_of?`数据截至 ${part.as_of}`:"数据日期未提供"}</span><span> · </span>{part.sources.map((x,i)=><span key={x.url}>{i>0?" / ":""}<a href={x.url} target="_blank" rel="noopener noreferrer">{x.name}</a></span>)}{part.warnings.length>0&&<details><summary>数据说明（{part.warnings.length}）</summary>{part.warnings.map((x,i)=><p key={i}>{x}</p>)}</details>}</div>;
}
function Availability({part,pending}:{part?:Part;pending:boolean}){
  if(pending&&!part)return <div className="empty-panel" role="status"><Skeleton className="h-5 w-36 mb-5"/><Skeleton className="h-4 w-full mb-3"/><Skeleton className="h-4 w-4/5"/><p>正在查询这个数据源…</p></div>;
  if(part?.status==="error")return <div className="error-banner" role="status">{part.error} 其他可用数据仍可查看。</div>;
  if(part?.status==="empty")return <div className="empty-panel">该来源本次未返回记录。不能据此认定没有相关新闻或机构覆盖。</div>;
  if(!part)return <div className="empty-panel">尚未取得这项数据。</div>;
  return null;
}
function Articles({items,research,name}:{items:Article[];research?:boolean;name?:string}){
  return <div className="article-list">{items.map((x,i)=><article className="article" key={`${x.url}-${i}`}><div className="article-meta"><span>{x.org||x.source}</span><time>{x.date?.slice(0,16)}</time>{research&&x.rating&&<span className="tag">{x.rating}</span>}{!research&&<span className="tag">{name&&x.title.includes(name)?"公司动态":"相关资讯"}</span>}</div><a href={validUrl(x.url)?x.url:undefined} target="_blank" rel="noopener noreferrer"><h4>{x.title}</h4></a>{x.content&&<p>{x.content}</p>}{research&&<p>{x.author}{x.eps?.filter(e=>e.value!=null).map(e=>` · ${e.year}年EPS ${fmt(e.value)}元`).join("")}</p>}{research&&x.pdfUrl&&validUrl(x.pdfUrl)&&<a className="pdf-link" href={x.pdfUrl} target="_blank" rel="noopener noreferrer">研报 PDF</a>}</article>)}</div>;
}

export default function Home(){
  const [query,setQuery]=useState("");const [code,setCode]=useState("688700");const [tab,setTab]=useState("news");
  const [parts,setParts]=useState<Parts>(initial);const [busy,setBusy]=useState(false);const [pending,setPending]=useState<Channel[]>([]);
  const [searching,setSearching]=useState(false);const [results,setResults]=useState<Stock[]>([]);const [searchError,setSearchError]=useState("");
  const requestId=useRef(0);const controller=useRef<AbortController|null>(null);const searchController=useRef<AbortController|null>(null);
  const loadStock=useCallback(async(nextCode:string,retain=false)=>{
    if(!/^\d{6}$/.test(nextCode))throw new Error("请选择完整的6位股票代码。");
    controller.current?.abort();const abort=new AbortController();controller.current=abort;
    const id=++requestId.current;setCode(nextCode);setBusy(true);setPending(channels);setResults([]);setSearchError("");
    if(!retain)setParts({});
    window.history.replaceState(null,"",`/?stock=${nextCode}`);
    const collected:Parts={};
    await Promise.all(channels.map(async(channel)=>{
      let part:Part;
      try{part=await getJson<Part>(`/api/research/${nextCode}/${channel}`,abort.signal);}
      catch(e){if(abort.signal.aborted)return;part={code:nextCode,channel,status:"error",data:null,as_of:null,fetched_at:new Date().toISOString(),cache:"fresh",sources:[],warnings:[],error:e instanceof Error?e.message:"查询失败"};}
      if(id!==requestId.current)return;collected[channel]=part;
      setParts(prev=>({...prev,[channel]:part}));setPending(prev=>prev.filter(x=>x!==channel));
    }));
    if(id===requestId.current){setBusy(false);return {code:nextCode,parts:collected,summary:summarize(collected)};}
  },[]);
  const performSearch=useCallback(async(value:string)=>{
    if(value.trim().length<2||value.trim().length>30)throw new Error("请输入2—30个字符的股票名称或代码。");
    searchController.current?.abort();const abort=new AbortController();searchController.current=abort;
    setQuery(value);setSearching(true);setSearchError("");setResults([]);
    try{const response=await getJson<{results:Stock[]}>(`/api/search?q=${encodeURIComponent(value.trim())}`,abort.signal);const stocks:Stock[]=response.results||[];
      if(abort.signal.aborted)return [];
      if(stocks.length===1)await loadStock(stocks[0].code);else{setResults(stocks);if(!stocks.length)setSearchError("未找到匹配的现行A股，请尝试完整6位代码。");}
      return stocks;
    }catch(e){if(!abort.signal.aborted){setSearchError(e instanceof Error?e.message:"搜索失败");throw e;}return [];}
    finally{if(!abort.signal.aborted)setSearching(false);}
  },[loadStock]);
  useEffect(()=>{
    const stock=new URLSearchParams(window.location.search).get("stock");
    if(stock&&stock!=="688700"){void performSearch(stock).catch(()=>{});}else{void loadStock("688700",true);}
    return ()=>{controller.current?.abort();searchController.current?.abort();};
  },[loadStock,performSearch]);
  useEffect(()=>{
    const model=(document as Document&{modelContext?:{registerTool:(tool:unknown,options?:unknown)=>void|Promise<void>}}).modelContext;
    if(!model?.registerTool)return;const life=new AbortController();
    const register=(tool:unknown)=>{try{void Promise.resolve(model.registerTool(tool,{signal:life.signal})).catch(()=>{});}catch{/* Optional browser capability. */}};
    register({name:"search_a_stock",title:"查找A股",description:"按名称或代码查询，并更新网站搜索结果；唯一匹配会打开该股票。",inputSchema:{type:"object",properties:{query:{type:"string",minLength:2,maxLength:30}},required:["query"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:async(input:unknown)=>{const q=(input as {query?:unknown})?.query;if(typeof q!=="string")throw new Error("query必须是字符串");const stocks=await performSearch(q);await new Promise(resolve=>requestAnimationFrame(()=>resolve(null)));return {results:stocks};}});
    register({name:"open_a_stock",title:"打开股票研究",description:"打开指定6位A股代码，等待各数据源完成，并更新网站展示。",inputSchema:{type:"object",properties:{code:{type:"string",pattern:"^[0-9]{6}$"}},required:["code"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:async(input:unknown)=>{const value=(input as {code?:unknown})?.code;if(typeof value!=="string"||!/^\d{6}$/.test(value))throw new Error("code必须是6位数字");const result=await loadStock(value);await new Promise(resolve=>requestAnimationFrame(()=>resolve(null)));return {code:value,coverage:Object.fromEntries(Object.entries(result?.parts||{}).map(([k,p])=>[k,p.status]))};}});
    return ()=>life.abort();
  },[loadStock,performSearch]);
  const quote=parts.quote?.status==="ok"?parts.quote.data as Quote:null;
  const daily=parts.daily?.status==="ok"?parts.daily.data as Daily:null;
  const financial=parts.financials?.status==="ok"?parts.financials.data as Financial:null;
  const fund=parts["fund-flow"]?.status==="ok"?parts["fund-flow"].data as Fund:null;
  const news=parts.news?.status==="ok"?parts.news.data as Article[]:[];
  const reports=parts.reports?.status==="ok"?parts.reports.data as Article[]:[];
  const summary=summarize(parts) as Summary;
  const bars=daily?.bars.slice(-60)||[];const min=bars.length?Math.min(...bars.map(x=>x.low)):0;const max=bars.length?Math.max(...bars.map(x=>x.high)):1;
  const points=bars.map((b,i)=>`${bars.length>1?i*700/(bars.length-1):350},${150-(b.close-min)/Math.max(max-min,.01)*130}`).join(" ");
  const archived=parts.quote?.cache==="snapshot";const latest=financial?.metrics;
  const available=Object.values(parts).filter(p=>p.status==="ok").length;
  const submit=(value=query)=>{void performSearch(value).catch(()=>{});};
  const download=()=>{const blob=new Blob([JSON.stringify({code,parts,summary},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${code}-research.json`;a.click();URL.revokeObjectURL(url);};
  return <div className="research-app"><header className="topbar"><a href="/" className="brand"><span className="brand-mark"><ChartNoAxesCombined size={21}/></span>A股研究台<span className="brand-en">RESEARCH DESK</span></a><a href="/api/docs" className="api-link">API 文档 </a></header><main className="desk">
    <section className="search-section"><div><div className="eyebrow">股票研究</div><h1>查询A股资讯与研报</h1></div><form className="search-form" onSubmit={e=>{e.preventDefault();submit();}}><Search size={21}/><input aria-label="股票代码或名称" placeholder="股票代码或名称，如 688700、东威科技" value={query} onChange={e=>setQuery(e.target.value)} maxLength={30}/><button type="submit" disabled={searching}>{searching?"查询中":"查找"}</button></form><div className="quick-search">试试 <button onClick={()=>submit("688700")}>688700 东威科技</button><button onClick={()=>submit("600519")}>600519 贵州茅台</button><button onClick={()=>submit("300750")}>300750 宁德时代</button></div></section>
    {searchError&&<div className="error-banner" role="alert">{searchError}</div>}{results.length>0&&<div className="result-list" aria-label="匹配股票">{results.map(x=><button key={x.code} onClick={()=>void loadStock(x.code)}><span>{x.name}</span><span>{x.market.toUpperCase()} · {x.code} </span></button>)}</div>}
    <section className="stock-header"><div><div className="ticker">{quote?.market.toUpperCase()||"A股"} · {code} {quote?.market&&<span>{quote.market==="bj"?"北交所":code.startsWith("68")?"科创板":code.startsWith("30")?"创业板":"主板"}</span>}</div><h2>{quote?.name||(busy?"正在取得股票信息":"股票信息未取得")}</h2></div><div className="quote-price"><strong>{fmt(quote?.price)}</strong><span className={(quote?.changePct||0)>=0?"up":"down"}>{sign(quote?.change)} / {sign(quote?.changePct)}%</span></div><div className="snapshot-note"><span className="status-dot"/>{archived?"历史实测快照":busy?`更新中 · ${available}/7项`:`已取得 ${available}/7 项`}<button className="refresh-button" disabled={busy} onClick={()=>void loadStock(code,true)}><RefreshCw size={12}/>更新</button><br/><small>{quote?`行情截至 ${quote.tradeDate} ${quote.tradeTime} · 北京时间`:"查询不会把缺失数据记为0"}</small></div></section>
    {parts.quote?.status==="error"&&<Availability part={parts.quote} pending={false}/>}
    <div className="metrics-strip">{[["总市值",fmt(quote?.marketCapYi),"亿元"],["市盈率 TTM",fmt(quote?.peTtm),"倍"],["市净率 · 行情口径",fmt(quote?.pb),"倍"],["成交额",fmt(quote?.amountYuan==null?null:quote.amountYuan/1e8),"亿元"],["换手率",fmt(quote?.turnoverPct),"%"]].map(([label,value,unit])=><div key={label}><span>{label}</span><strong>{value}<small>{unit}</small></strong></div>)}</div>
    <div className="desk-grid"><section className="primary-panel"><Tabs value={tab} onValueChange={setTab}><TabsList className="research-tabs" variant="line"><TabsTrigger value="news"><Radio size={16}/>资讯</TabsTrigger><TabsTrigger value="reports"><BookOpen size={16}/>研报</TabsTrigger><TabsTrigger value="overview"><FileText size={16}/>摘要</TabsTrigger><TabsTrigger value="daily"><ChartNoAxesCombined size={16}/>日线</TabsTrigger><TabsTrigger value="financials"><Building2 size={16}/>财务</TabsTrigger><TabsTrigger value="fund-flow"><Wallet size={16}/>资金</TabsTrigger></TabsList>
      <TabsContent value="news"><div className="panel-heading"><h3>公司与市场动态</h3><span>{news.length} 条 · 按日期排序</span></div><SourceNote part={parts.news}/><Availability part={parts.news} pending={pending.includes("news")}/><Articles items={news} name={quote?.name}/></TabsContent>
      <TabsContent value="reports"><div className="panel-heading"><h3>机构研究</h3><span>{reports.length} 份 · 合并多个来源</span></div><SourceNote part={parts.reports}/><Availability part={parts.reports} pending={pending.includes("reports")}/><Articles items={reports} research/></TabsContent>
      <TabsContent value="overview"><div className="panel-heading"><h3>从事实到判断</h3><button className="refresh-button" onClick={download}><Download size={14}/>下载数据</button></div><div className="summary-section"><h4>{summary.title}</h4>{busy&&<p className="source-note">数据仍在更新，摘要会随着各项结果补全。</p>}{summary.observations.map(x=><div key={x.title}><h5>{x.title}</h5><p>{x.text}</p></div>)}<h5>需要验证的风险</h5><ul>{summary.risks.map((x,i)=><li key={i}>{x}</li>)}</ul><p className="method-note">{summary.methodNote}</p></div><SourceNote part={parts.forecast}/><Availability part={parts.forecast} pending={pending.includes("forecast")}/></TabsContent>
      <TabsContent value="daily"><div className="panel-heading"><h3>{daily?.adjust==="qfq"?"前复权":"不复权"}日线</h3><span>{daily?.bars.length||0} 根 · 图示最近60交易日</span></div><SourceNote part={parts.daily}/><Availability part={parts.daily} pending={pending.includes("daily")}/>{bars.length>0&&<><div className="chart-stat">MA5 {fmt(daily?.ma[5])} <span>MA20 {fmt(daily?.ma[20])}</span> MA60 {fmt(daily?.ma[60])}</div><svg className="price-chart" viewBox="0 0 700 180" role="img" aria-label="最近60交易日收盘价格走势"><path d="M0 50H700M0 100H700M0 150H700" stroke="var(--border)" fill="none"/><polyline points={points} fill="none" stroke="var(--primary)" strokeWidth="2.5"/><text x="5" y="177" fill="#81917e" fontSize="13">{bars[0].date}</text><text x="610" y="177" fill="#81917e" fontSize="13">{bars.at(-1)?.date}</text></svg><Table><TableHeader><TableRow>{["日期","开盘","最高","最低","收盘"].map(x=><TableHead key={x}>{x}</TableHead>)}</TableRow></TableHeader><TableBody>{bars.slice(-15).reverse().map(x=><TableRow key={x.date}><TableCell>{x.date}</TableCell>{[x.open,x.high,x.low,x.close].map((v,i)=><TableCell key={i}>{fmt(v)}</TableCell>)}</TableRow>)}</TableBody></Table></>}</TabsContent>
      <TabsContent value="financials"><div className="panel-heading"><h3>最新财务与历史对照</h3><span>人民币 · 累计报告口径</span></div><SourceNote part={parts.financials}/><Availability part={parts.financials} pending={pending.includes("financials")}/>{latest&&<><div className="finance-grid">{[["营业收入",amount(latest.revenue),`${sign(latest.revenueYoy)}% 同比`],["归母净利润",amount(latest.netProfit),`${sign(latest.netProfitYoy)}% 同比`],["经营现金流",amount(latest.cfo),`${sign(latest.cfoYoy)}% 同比`],["毛利率",`${fmt(latest.grossMargin)}%`,"营业收入减营业成本"],["存货",amount(latest.inventory),`较年末 ${sign(latest.inventoryVsYearend)}%`],["合同负债",amount(latest.contractLiability),`较年末 ${sign(latest.contractVsYearend)}%`]].map(([label,value,note])=><div key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</div><Table><TableHeader><TableRow><TableHead>报告期</TableHead><TableHead>营收（亿元）</TableHead><TableHead>归母净利润（亿元）</TableHead><TableHead>EPS（元）</TableHead></TableRow></TableHeader><TableBody>{financial?.tables.lrb?.rows.map(x=><TableRow key={String(x.period)}><TableCell>{x.period}</TableCell>{[x["营业收入"],x["归属于母公司所有者的净利润"]].map((v,i)=><TableCell key={i}>{typeof v==="number"?fmt(v/1e8):"—"}</TableCell>)}<TableCell>{typeof x["基本每股收益"]==="number"?fmt(x["基本每股收益"]):"—"}</TableCell></TableRow>)}</TableBody></Table><p className="source-note">季度、半年及年报均为各自累计期间，不能直接横向比较金额。估值重算采用年报加本期减上年同期。</p></>}</TabsContent>
      <TabsContent value="fund-flow"><div className="panel-heading"><h3>成交资金分类</h3><span>分类净额，不代表账户身份</span></div><SourceNote part={parts["fund-flow"]}/><Availability part={parts["fund-flow"]} pending={pending.includes("fund-flow")}/>{fund&&<><p className="source-note">{fund.definition}</p>{fund.sums&&<div className="flow-grid">{[1,5,20,60].map(n=><div key={n}><span>近 {n} 交易日</span><strong className={(fund.sums?.[n]||0)>=0?"up":"down"}>{amount(fund.sums?.[n])}</strong></div>)}</div>}<Table><TableHeader><TableRow><TableHead>日期</TableHead><TableHead>{fund.sums?"大单＋超大单净额":"新浪净额"}（万元）</TableHead></TableRow></TableHeader><TableBody>{fund.rows.slice(-20).reverse().map(x=><TableRow key={x.date}><TableCell>{x.date}</TableCell><TableCell>{fmt((fund.sums?x.mainNet:x.netAmount)==null?null:(fund.sums?x.mainNet!:x.netAmount!)/1e4)}</TableCell></TableRow>)}</TableBody></Table></>}</TabsContent>
    </Tabs></section><aside className="research-sidebar"><div className="sidebar-heading"><span className="eyebrow">研究手记</span><FileText size={18}/></div><h3>{summary.title}</h3><p>{latest?.period?`最新财务期 ${latest.period}。观察盈利、现金流与价格是否相互印证。`:"先核对每项数据的日期和来源，缺失项不会被补成预测。"}</p>{latest?.netProfitYoy!=null&&<div className="side-stat"><span>归母净利润同比</span><strong>{sign(latest.netProfitYoy)}<small>%</small></strong><span>{latest.period} · 累计报告</span></div>}<div className="watch-list"><h4>交叉核对</h4><p><span>01</span>研报观点与财报披露</p><p><span>02</span>盈利增长与经营回款</p><p><span>03</span>估值预期与兑现节奏</p></div><div className="side-footer">{channels.map(channel=><div className="health-row" key={channel}><span>{labels[channel]}</span><span>{pending.includes(channel)?"查询中":parts[channel]?.status==="ok"?(parts[channel]?.cache==="snapshot"?"历史快照":"已取得"):parts[channel]?.status==="empty"?"暂无记录":"未取得"}</span></div>)}<p>新闻、研报与摘要各自保留来源。行情日期可能早于查询日期。</p></div></aside></div>
    <footer className="footer"><span>基于 a-stock-data · 腾讯 / 新浪 / 东方财富 / 同花顺</span><span>研究参考，不构成收益承诺</span></footer>
  </main></div>;
}
