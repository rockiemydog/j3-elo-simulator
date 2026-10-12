import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';

const valid = {status:'updated', resultId:'bf7150fe', feed:{verified:true, officialCheckedAt:'2026-10-12T05:31:47Z', matches:Array(100).fill({})}};
async function withFetch(fn, run) { const old=globalThis.fetch; globalThis.fetch=fn; try { await run(); } finally { globalThis.fetch=old; } }
test('public HTTP visits never trigger updates and do not claim cron/email is enabled', async()=> {
  await withFetch(()=>{throw Error('must not fetch');},async()=>{
    const r=await worker.fetch(new Request('https://example.invalid/'));
    assert.equal(r.status,200);const body=await r.json();assert.match(body.email,/HTTP visits never send mail/);assert.match(body.message,/Check Cron/);
    assert.equal((await worker.fetch(new Request('https://example.invalid/',{method:'POST'}))).status,405);
  });
});
test('scheduled invocation awaits validated results', async()=> {
  await withFetch(async(url,options)=>{assert.match(url,/\/api\/results$/);assert.equal(options.redirect,'manual');assert.equal(options.signal.aborted,false);return Response.json(valid);},()=>worker.scheduled());
});
test('busy and cooldown are deferred without declaring success',async()=>{
  for(const status of ['busy','cooldown'])await withFetch(async()=>Response.json({status}),()=>worker.scheduled());
});
test('HTTP, source, JSON and unverified failures remain failed scheduled events',async()=>{
  for(const r of [new Response('error',{status:502}),Response.json({status:'failed'}),new Response('<html>login</html>'),Response.json({...valid,feed:{...valid.feed,verified:false}}),Response.json({...valid,feed:{...valid.feed,officialCheckedAt:'invalid'}})]) {
    await withFetch(async()=>r,()=>assert.rejects(()=>worker.scheduled()));
  }
});
test('network failure propagates rather than reporting successful update',async()=>{
  await withFetch(async()=>{throw Error('offline');},()=>assert.rejects(()=>worker.scheduled(),/offline/));
});
test('redirect responses are rejected without accepting redirected data',async()=>{
  for(const status of [301,302,303,307,308]) {
    await withFetch(async()=>new Response(null,{status,headers:{Location:'https://example.invalid/'}}),()=>assert.rejects(()=>worker.scheduled(),/Update service unavailable/));
  }
});
