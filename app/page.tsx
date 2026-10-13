"use client";
import {useEffect,useRef,useState,type ComponentType} from "react";
import dynamic from "next/dynamic";
import {useTheme} from "next-themes";
import {ArrowUpRight,ArrowRight,Search,Sun,Moon,Activity,RefreshCw} from "lucide-react";
import RubberSegmentSource from "@/components/interaction/RubberSegment";
import {SignalHeadline} from "@/components/signal-headline";
import type {Stock} from "@/lib/contracts";

const GradientWaves=dynamic(()=>import("@/components/interaction/GradientWaves"),{ssr:false});
const StockResearch=dynamic(()=>import("@/components/stock-research"),{loading:()=> <p className="empty-panel">正在打开研究台…</p>});
// The supplied React Bits components are JSX. Keep a typed application boundary.
type SegmentProps={items:{value:string;label:string}[];value:string;onChange:(value:string)=>void;"aria-label":string;trackColor:string;thumbColor:string;textColor:string;activeTextColor:string;size?:string};
const RubberSegment=RubberSegmentSource as ComponentType<SegmentProps>;
type Trend={code:string;market:string;name:string;rank:number;heat:number|null;changePct:number|null;tags:string[]};
type HotList={status:string;items:Trend[];fetched_at:string;sources:{name:string;url:string}[];warnings:string[];error?:string};
const segmentColors={trackColor:"var(--secondary)",thumbColor:"var(--control-active)",textColor:"var(--muted-foreground)",activeTextColor:"var(--control-ink)"};

async function json<T>(url:string,signal?:AbortSignal):Promise<T>{
  let r:Response;
  try{r=await fetch(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)});}
  catch(e){if(e instanceof Error&&e.name==="TimeoutError")throw Error("请求超时，请重试。数据源可能暂时不可用。");throw e;}
  if(!r.headers.get("content-type")?.includes("application/json"))throw Error("服务暂时不可用，请稍后重试。");
  const data=await r.json() as T & {error?:string};if(!r.ok)throw Error(data.error||"查询失败");return data;
}

export default function Home(){
  const [selected,setSelected]=useState<string|null>(null);
  const [query,setQuery]=useState("");const [results,setResults]=useState<Stock[]>([]);
  const [searching,setSearching]=useState(false);const [searchError,setSearchError]=useState("");
  const [period,setPeriod]=useState("hour");const [hot,setHot]=useState<HotList|null>(null);
  const [hotError,setHotError]=useState("");const [hotBusy,setHotBusy]=useState(true);const [retry,setRetry]=useState(0);
  const [mounted,setMounted]=useState(false);const {resolvedTheme,setTheme}=useTheme();
  const searchAbort=useRef<AbortController|null>(null);const input=useRef<HTMLInputElement>(null);
  function open(code:string){setSelected(code);setResults([]);window.history.pushState(null,"",`/?stock=${code}`);window.scrollTo({top:0,behavior:"instant"});}
  function back(){setSelected(null);window.history.pushState(null,"","/");window.scrollTo({top:0,behavior:"instant"});}
  useEffect(()=>{
    setMounted(true);
    const sync=()=>{const code=new URLSearchParams(window.location.search).get("stock");setSelected(code&&/^\d{6}$/.test(code)?code:null);};
    sync();window.addEventListener("popstate",sync);return ()=>{window.removeEventListener("popstate",sync);searchAbort.current?.abort();};
  },[]);
  useEffect(()=>{
    if(selected)return;
    const abort=new AbortController();setHotBusy(true);setHot(null);setHotError("");
    json<HotList>(`/api/trending?period=${period}`,abort.signal).then(data=>{if(!abort.signal.aborted)setHot(data);}).catch(e=>{if(!abort.signal.aborted)setHotError(e.message);}).finally(()=>{if(!abort.signal.aborted)setHotBusy(false);});
    return ()=>abort.abort();
  },[period,retry,selected]);
  async function search(){
    if(query.trim().length<2||query.trim().length>30){setSearchError("请输入2—30个字符的公司名称或股票代码。");return;}
    searchAbort.current?.abort();const abort=new AbortController();searchAbort.current=abort;
    setSearching(true);setSearchError("");setResults([]);
    try{
      const data=await json<{results:Stock[]}>(`/api/search?q=${encodeURIComponent(query.trim())}`,abort.signal);
      if(abort.signal.aborted)return;
      if(data.results.length===1)open(data.results[0].code);
      else{setResults(data.results);if(!data.results.length)setSearchError("未找到匹配的现行A股，请尝试完整6位代码。");}
    }catch(e){if(!abort.signal.aborted)setSearchError(e instanceof Error?e.message:"搜索失败");}
    finally{if(!abort.signal.aborted)setSearching(false);}
  }
  const theme=mounted?(resolvedTheme||"dark"):"dark";
  return <div className="signal-site">
    <header className="site-header"><a className="signal-brand" href="/" aria-label="A股研究台首页"><span className="signal-logo"><Activity size={21}/></span><span>Signal<span className="brand-dot">.</span></span></a><nav className="header-nav" aria-label="主导航"><a href="/#trending">市场趋势</a><a href="/api/docs">API <ArrowUpRight size={13}/></a></nav><div className="theme-switch"><span aria-hidden="true">{theme==="dark"?<Moon size={14}/>:<Sun size={14}/>}</span>{mounted?<RubberSegment items={[{value:"light",label:"浅色"},{value:"dark",label:"深色"}]} value={theme} onChange={setTheme} aria-label="外观主题" size="sm" {...segmentColors}/>:<span className="theme-placeholder"/>}</div></header>
    {!selected&&<div className="waves-layer" aria-hidden="true"><GradientWaves horizonColor={theme==="dark"?"#100b20":"#ddd5ef"} waveColor={theme==="dark"?"#35204f":"#b8a2dd"} crestColor={theme==="dark"?"#9c79c9":"#f3edff"} speed={0.18} amplitude={2.5} detail="low" brightness={theme==="dark"?0.85:0.95} opacity={theme==="dark"?0.75:0.65} fogDepth={45} mouseInteraction parallaxStrength={0.7} grainIntensity={0.025}/></div>}
    {selected?<StockResearch key={selected} initialCode={selected} onBack={back}/>:<>
      <main className="landing-main">
        <section className="hero" id="explore" onPointerMove={e=>{
          if(e.pointerType!=="mouse"||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
          const r=e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty("--hero-x",`${((e.clientX-r.left)/r.width-.5)*12}px`);
          e.currentTarget.style.setProperty("--hero-y",`${((e.clientY-r.top)/r.height-.5)*10}px`);
        }} onPointerLeave={e=>{e.currentTarget.style.setProperty("--hero-x","0px");e.currentTarget.style.setProperty("--hero-y","0px");}}><SignalHeadline/>
          <div className="hero-search-wrap"><form className="hero-search" onSubmit={e=>{e.preventDefault();void search();}}><Search size={23} aria-hidden="true"/><input ref={input} aria-label="搜索A股公司名称或股票代码" placeholder="搜索公司名称或 6 位股票代码" value={query} maxLength={30} onChange={e=>setQuery(e.target.value)} autoComplete="off"/><button type="submit" disabled={searching}>{searching?"查询中…":"开始研究"}<ArrowRight size={17}/></button></form>
          {searchError&&<p className="landing-error" role="alert">{searchError}</p>}{results.length>0&&<div className="search-results" aria-label="匹配股票">{results.map(x=><button key={x.code} onClick={()=>open(x.code)}><span>{x.name}<small>{x.market.toUpperCase()} · {x.code}</small></span><ArrowUpRight size={18}/></button>)}</div>}</div>
          <a href="#trending" className="scroll-cue" aria-label="查看市场热榜">↓</a>
        </section>
        <section id="trending" className="trending-section"><div className="section-heading"><div><h2>市场正在关注<span className="accent-dot">.</span></h2></div><RubberSegment items={[{value:"hour",label:"小时榜"},{value:"day",label:"日榜"}]} value={period} onChange={setPeriod} aria-label="热榜周期" {...segmentColors}/></div>
          <div className="trend-table" aria-busy={hotBusy}><div className="trend-table-head"><span>人气排名 / 公司</span><span>概念线索</span><span>涨跌幅</span><span/></div>
          {hotBusy&&<div className="trend-loading" role="status">正在读取市场人气榜<span className="loading-dots">…</span></div>}
          {hotError&&<div className="trend-loading"><p role="alert">{hotError}</p><button className="text-button" onClick={()=>setRetry(x=>x+1)}><RefreshCw size={14}/>重新加载</button></div>}
          {hot?.items.map((x,i)=><button className="trend-row" key={x.code} onClick={()=>open(x.code)} aria-label={`研究 ${x.name} ${x.code}`}><span className="trend-stock"><span className={`trend-rank ${i<3?"rank-top":""}`}>{String(x.rank).padStart(2,"0")}</span><span><strong>{x.name}</strong><small>{x.market.toUpperCase()} · {x.code}</small></span></span><span className="trend-tags">{x.tags.length?x.tags.map(tag=><span key={tag}>{tag}</span>):<span>—</span>}</span><span className={`trend-change ${x.changePct==null?"":x.changePct>0?"up":x.changePct<0?"down":""}`}>{x.changePct==null?"—":`${x.changePct>0?"+":""}${x.changePct.toFixed(2)}%`}</span><ArrowUpRight className="trend-arrow" size={17}/></button>)}
          {hot?.status==="empty"&&<div className="trend-loading">数据源本次未返回排名，请稍后重试。</div>}</div>
          <div className="trend-source"><span>{hot?.sources?.map(s=><a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a>)}{hot?.fetched_at&&<> · 抓取于 {new Date(hot.fetched_at).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false})}（北京时间）</>}</span><button className="text-button" disabled={hotBusy} onClick={()=>setRetry(x=>x+1)} aria-label="重新读取热榜"><RefreshCw size={13}/></button></div><p className="trend-disclaimer">人气排名不代表涨幅排名或投资建议。来源未提供榜单生成时间，涨跌幅以来源返回为准。</p>{hot?.warnings?.map(w=><p className="trend-disclaimer" key={w}>{w}</p>)}
        </section>
        <footer className="landing-footer"><span>Signal.</span><a href="https://github.com/jeffsasha/a-stock-research" target="_blank" rel="noopener noreferrer">GitHub <ArrowUpRight size={12}/></a></footer>
      </main>
    </>}
  </div>;
}
