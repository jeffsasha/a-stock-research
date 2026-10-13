import {spawnSync} from 'node:child_process';
import {cp,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {build} from 'esbuild';
// Real Next.js App Router export. Market APIs run in the accompanying Worker.
const next=spawnSync(process.execPath,['node_modules/next/dist/bin/next','build','--webpack'],{stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
if(next.error)throw next.error;
if(next.status!==0)process.exit(next.status||1);
const output=resolve('dist');
if(!output.startsWith(process.cwd()+sep)||output===process.cwd())throw Error('Invalid build output path');
await rm(output,{recursive:true,force:true});
await mkdir('dist/server',{recursive:true});
await cp('out','dist/client',{recursive:true});
await build({entryPoints:['worker/index.mjs'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
await writeFile('dist/server/wrangler.json',JSON.stringify({name:'a-stock-research',main:'index.js',compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],no_bundle:true,assets:{directory:'../client',binding:'ASSETS',run_worker_first:['/api/*']}}));
await mkdir('dist/.openai',{recursive:true});
await cp('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Next.js frontend and live market API Worker built.');
