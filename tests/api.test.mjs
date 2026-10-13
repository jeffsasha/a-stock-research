import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleApi} from '../lib/api.mjs';
test('shared API routes reject invalid input and preserve static documentation',async()=>{
  const call=path=>handleApi(new Request('http://localhost'+path));
  assert.equal(await call('/'),null);
  assert.equal(await call('/api/docs'),null);
  assert.equal((await call('/api/search')).status,400);
  assert.equal((await call('/api/research/123')).status,400);
  assert.equal((await call('/api/research/600519/bad')).status,404);
  assert.equal((await call('/api/trending?period=bad')).status,400);
  const health=await call('/api/health');
  assert.equal(health.headers.get('cache-control'),'private, no-store');
  assert.equal((await health.json()).status,'ok');
  assert.equal((await handleApi(new Request('http://localhost/api/search',{method:'POST'}))).status,405);
});
