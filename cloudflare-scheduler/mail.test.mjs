import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { composeMail, notifyResults, sendSMTP } from './worker.mjs';
const feed = JSON.parse(readFileSync(new URL('./fixtures/baseline.json', import.meta.url)));
const data = { resultId: 'bf7150fe', feed: {...feed, officialCheckedAt: new Date().toISOString()} };
function env(mode = 'test') {
 const sql = new DatabaseSync(':memory:');
 return {MAIL_MODE:mode, MAIL_TEST_ID:'migration-1', SMTP_USERNAME:'sender@gmail.com', SMTP_PASSWORD:'dummy', NOTIFICATION_EMAIL:'recipient@me.com', NOTIFY_DB:{prepare(query){
   return {args:[],bind(...args){this.args=args;return this;},async run(){return {meta:{changes:sql.prepare(query).run(...this.args).changes}};},async first(){return sql.prepare(query).get(...this.args);}};
  }}};
}
test('Japanese mail has validated ID, counts and both current screen links',()=>{
 const raw=composeMail(data,env(),true);
 const body=Buffer.from(raw.split('\r\n\r\n')[1].replace(/\s/g,''),'base64').toString();
 assert.match(body,/10試合・勝点10（2勝4分4敗）/); assert.match(body,/得点12・失点18/); assert.match(body,/bf7150fe/);
 assert.match(body,/progress-tracker\//); assert.match(body,/端末画面への反映完了を確認したものではありません/);
 for(const line of raw.split('\r\n'))assert.ok(Buffer.byteLength(line)<998);
 assert.throws(()=>composeMail({...data,resultId:'ffffffff'},env()),/mismatch/);
 assert.throws(()=>composeMail(data,{...env(),NOTIFICATION_EMAIL:'a@b.com\r\nBcc: x@y.com'}),/configuration/);
});
test('parallel test runs send once; known baseline never triggers live mail',async()=>{
 const e=env(); let count=0; const send=async()=>{count++;};
 const results=await Promise.allSettled([notifyResults(data,e,send),notifyResults(data,e,send)]);
 assert.ok(results.some(r=>r.status==='fulfilled')); assert.equal(count,1);
 await notifyResults(data,e,send); assert.equal(count,1);
 e.MAIL_MODE='live'; await notifyResults(data,e,send); assert.equal(count,1);
});
test('test mode does not consume an actual result notification',async()=>{
 const e=env();let count=0; await notifyResults(data,e,async()=>{count++;});
 const row=await e.NOTIFY_DB.prepare('SELECT state FROM notification_ledger WHERE key = ?').bind('result:bf7150fe').first();
 assert.equal(row.state,'baseline'); assert.equal(count,1);
});
test('ambiguous acceptance blocks automatic retry',async()=>{
 const e=env();let count=0;const fail=async()=>{count++;const err=Error();err.ambiguous=true;throw err;};
 await assert.rejects(()=>notifyResults(data,e,fail));
 await assert.rejects(()=>notifyResults(data,e,fail),/uncertain/);assert.equal(count,1);
});
test('definite pre-DATA failure can retry',async()=>{
 const e=env();let count=0;
 await assert.rejects(()=>notifyResults(data,e,async()=>{const err=Error();err.ambiguous=false;throw err;}));
 await notifyResults(data,e,async()=>{count++;});assert.equal(count,1);
});
function socketMock(finalReply='250 queued\r\n', failAuth=false) {
 let stream, commands=[];const encoder=new TextEncoder();
 const responses=['250-smtp.gmail.com\r\n250 AUTH LOGIN\r\n','334 user\r\n','334 password\r\n',failAuth?'535 rejected\r\n':'235 authenticated\r\n','250 sender\r\n','250 recipient\r\n','354 data\r\n', finalReply];
 const socket={ opened:Promise.resolve(),closed:Promise.resolve(),readable:new ReadableStream({start(c){stream=c;c.enqueue(encoder.encode('220 ready\r\n'));}}),
 writable:new WritableStream({write(chunk){commands.push(new TextDecoder().decode(chunk));const value=responses.shift();if(value)stream.enqueue(encoder.encode(value));else stream.close();}}),async close(){try{stream.close();}catch{}}};
 return {commands,connect(address,options){assert.equal(address.port,465);assert.equal(options.secureTransport,'on');return socket;}};
}
test('SMTP TLS and multiline replies require final 250',async()=>{
 const e=env(), mock=socketMock();
 assert.deepEqual(await sendSMTP(composeMail(data,e,true),e,mock.connect),{accepted:true});assert.equal(mock.commands.length,8);
 const rejected=socketMock('550 rejected\r\n');
 await assert.rejects(()=>sendSMTP('body',e,rejected.connect),error=>error.ambiguous===true);
 const auth=socketMock('250 ok\r\n',true);
 await assert.rejects(()=>sendSMTP('body',e,auth.connect),error=>error.ambiguous===false);
});
