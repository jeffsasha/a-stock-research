import {CHANNELS,getPart,normalizeTicker,research,searchStocks,trending} from './market.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});

// Shared by the deployed Worker and the local Next.js/Node server.
export async function handleApi(request){
  const url=new URL(request.url), path=url.pathname;
  if(!path.startsWith('/api/')||path==='/api/docs'||path==='/api/docs/')return null;
  if(request.method!=='GET')return new Response(null,{status:405,headers:{Allow:'GET'}});
  if(path==='/api/health')return json({status:'ok',app:'a-stock-research',version:'2.0.0',time:new Date().toISOString(),note:'健康状态不代表上游接口均可用。'});
  if(path==='/api/trending'){
    const period=url.searchParams.get('period')||'hour';
    if(!['hour','day'].includes(period))return json({error:'热榜周期必须为 hour 或 day'},400);
    try{return json(await trending(period));}
    catch(e){return json({status:'error',items:[],error:e.message,fetched_at:new Date().toISOString()},502);}
  }
  if(path==='/api/search'){
    const query=url.searchParams.get('q')||'';
    if(query.trim().length<2||query.length>30)return json({error:'请输入2—30个字符的名称或完整代码'},400);
    try{return json({query,results:await searchStocks(query),fetched_at:new Date().toISOString()});}
    catch(e){return json({error:e.message,results:[]},422);}
  }
  const match=/^\/api\/research\/([^/]+)(?:\/(.*))?$/.exec(path);
  if(match){
    try{
      const code=decodeURIComponent(match[1]);normalizeTicker(code);
      const channel=match[2];
      if(channel&&!CHANNELS.includes(channel))return json({error:'数据类型不存在'},404);
      return json(channel?await getPart(code,channel):await research(code));
    }catch(e){return json({error:e.message},400);}
  }
  return json({error:'接口不存在'},404);
}
