// A loopback-only Node host for environments where Windows workerd cannot start.
// Uses the same React page and GET handlers as the Cloudflare application.
import {build} from 'esbuild';
import ts from 'typescript';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {createElement} from 'react';
import {renderToString} from 'react-dom/server';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const out=resolve('.sites-runtime/local');mkdirSync(out,{recursive:true});
await build({entryPoints:['app/page.tsx'],bundle:true,outfile:resolve(out,'page.mjs'),platform:'node',format:'esm',packages:'external',jsx:'automatic'});
await build({stdin:{contents:`import React from 'react';import {hydrateRoot} from 'react-dom/client';import Home from './app/page';hydrateRoot(document.getElementById('root'),React.createElement(Home));`,resolveDir:root,loader:'tsx'},bundle:true,outfile:resolve(out,'client.js'),platform:'browser',format:'esm',minify:true,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const css=await postcss([tailwind({base:root,optimize:true})]).process(readFileSync('app/globals.css','utf8'),{from:resolve('app/globals.css')});
writeFileSync(resolve(out,'client.css'),css.css);
const {default:Home}=await import(pathToFileURL(resolve(out,'page.mjs')).href);
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>A股研究台</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/client.css"></head><body><div id="root">${renderToString(createElement(Home))}</div><script type="module" src="/client.js"></script></body></html>`;
async function handler(file){
  const source=readFileSync(file,'utf8').replaceAll('@/lib/market.mjs',pathToFileURL(resolve('lib/market.mjs')).href);
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  return (await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).GET;
}
const research=await handler('app/api/research/[code]/[[...section]]/route.ts');
const search=await handler('app/api/search/route.ts');const health=await handler('app/api/health/route.ts');
const port=Number(process.env.PORT||4173);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('PORT must be an integer from 1024 to 65535');
const origin=`http://127.0.0.1:${port}`;
const server=createServer(async(req,res)=>{
  try{
    if(req.method!=='GET'){res.writeHead(405,{Allow:'GET'});res.end();return;}
    if((req.url||'').length>4096){res.writeHead(414);res.end();return;}
    const url=new URL(req.url||'/',origin);let response;
    const match=/^\/api\/research\/([^/]+)(?:\/(.*))?$/.exec(url.pathname);
    if(match)response=await research(new Request(url),{params:Promise.resolve({code:decodeURIComponent(match[1]),section:match[2]?match[2].split('/'):undefined})});
    else if(url.pathname==='/api/search')response=await search(new Request(url));
    else if(url.pathname==='/api/health')response=await health(new Request(url));
    else if(url.pathname==='/')response=new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}});
    else if(url.pathname==='/client.js'||url.pathname==='/client.css')response=new Response(readFileSync(resolve(out,url.pathname.slice(1))),{headers:{'Content-Type':url.pathname.endsWith('.css')?'text/css':'text/javascript'}});
    else if(url.pathname==='/favicon.svg')response=new Response(readFileSync('public/favicon.svg'),{headers:{'Content-Type':'image/svg+xml'}});
    else if(url.pathname==='/api/docs')response=new Response('<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>API 文档</title><body><h1>A股研究 API</h1><p>GET /api/search?q=东威科技</p><p>GET /api/research/688700</p><p>GET /api/research/688700/{quote,daily,financials,fund-flow,news,reports,forecast}</p><p>请检查每项status、as_of、sources与warnings。金额为元，marketCapYi为亿元。完整口径与方法见项目README。</p><a href="/">返回研究台</a></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
    else response=Response.json({error:'页面不存在'},{status:404});
    res.writeHead(response.status,{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...Object.fromEntries(response.headers)});res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'本地服务错误，请检查终端日志'}));}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
console.log(`A股研究台已启动：${origin}`);
if(process.argv.includes('--check')){
  try{
    const page=await fetch(origin);if(page.status!==200||!(await page.text()).includes('东威科技'))throw Error('页面失败');
    const quote=await (await fetch(origin+'/api/research/688700/quote')).json();if(quote.status!=='ok'||quote.code!=='688700')throw Error('行情API失败');
    const matches=await (await fetch(origin+'/api/search?q='+encodeURIComponent('东威科技'))).json();if(!matches.results.some(x=>x.code==='688700'))throw Error('搜索API失败');
    if((await fetch(origin+'/api/research/688700/unknown')).status!==404)throw Error('路由校验失败');
    const result={tested_at:new Date().toISOString(),status:'PASS',checks:['React页面HTTP200','真实688700行情HTTP API','中文名称搜索HTTP API','未知项目HTTP404']};
    mkdirSync('verification',{recursive:true});writeFileSync('verification/local-http-test.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
