import {handleApi} from '../lib/api.mjs';
export default {async fetch(request,env){
  return await handleApi(request) || env.ASSETS.fetch(request);
}};
