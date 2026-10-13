import {handleApi} from '../lib/api.mjs';
export default {async fetch(request,env,ctx){
  const pending=handleApi(request);
  // Navigating away must not orphan shared source queues/in-flight queries.
  // Let the bounded query finish and populate the resolved-data cache.
  ctx.waitUntil(pending.then(()=>{},()=>{}));
  return await pending || env.ASSETS.fetch(request);
}};
