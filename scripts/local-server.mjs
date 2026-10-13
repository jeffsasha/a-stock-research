import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {handleApi} from '../lib/api.mjs';
const dev=process.argv.includes('--dev');
const port=Number(process.env.PORT||4173);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid PORT');
let nextHandler;
if(dev){
  const {default:next}=await import('next');
  const app=next({dev:true,hostname:'127.0.0.1',port});await app.prepare();nextHandler=app.getRequestHandler();
}else{
  try{await stat('out/index.html');}catch{throw Error('请先运行 npm run build，再运行 npm run local。开发模式使用 npm run dev。');}
}
const root=resolve('out');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8','.woff2':'font/woff2'};
const origin=`http://127.0.0.1:${port}`;
const server=createServer(async(req,res)=>{
  try{
    if((req.url||'').length>4096){res.writeHead(414);res.end();return;}
    const url=new URL(req.url||'/',origin);
    const api=await handleApi(new Request(url,{method:req.method}));
    if(api){res.writeHead(api.status,Object.fromEntries(api.headers));res.end(Buffer.from(await api.arrayBuffer()));return;}
    if(nextHandler){await nextHandler(req,res);return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
    let target=resolve(root,'.'+decodeURIComponent(url.pathname));
    if(target!==root&&!target.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    let data;
    for(const candidate of [target,target+'.html',resolve(target,'index.html')]){
      try{if((await stat(candidate)).isFile()){data=await readFile(candidate);target=candidate;break;}}catch{}
    }
    if(!data){res.writeHead(404);res.end('页面不存在');return;}
    res.writeHead(200,{'Content-Type':mime[extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch(e){console.error(e.message);res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'服务暂时不可用'}));}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
console.log(`A股研究台 Next.js ${dev?'开发':'生产'}：${origin}`);
if(process.argv.includes('--check')){
  try{
    const html=await (await fetch(origin)).text();if(!html.includes('看见信号')||html.includes('东威科技'))throw Error('首页未正确显示搜索入口');
    const q=await (await fetch(origin+'/api/research/600519/quote')).json();if(q.status!=='ok')throw Error(q.error);
    const hot=await (await fetch(origin+'/api/trending')).json();if(hot.status!=='ok'||!hot.items.length)throw Error(hot.error||'热榜为空');
    console.log('PASS Next.js 首页、实时行情、真实热榜 HTTP 检查');
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
