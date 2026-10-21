const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const api=require('../forecast-insights.js'),{capture,engine}=require('../scripts/capture-predictions.cjs');
const root=path.resolve(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
// Stable test clock and completed subset: unattended tests must still pass
// when the real season's feeds advance beyond this example fixture.
const feed={...read('official-results.json'),updatedAt:'2026-10-22T00:00:00Z',matches:read('official-results.json').matches.filter(r=>r.date<'2026-10-01')},calendar=read('league-schedule.json');
feed.asOfDate=feed.matches.at(-1).date;
const now=new Date('2026-10-22T01:00:00Z');
const teams=['岐阜','愛媛','鹿児島','相模原','鳥取','FC大阪','長野','滋賀','熊本','栃木SC','琉球','讃岐','山口','奈良','高知','北九州','松本','金沢','群馬','福島'];
const empty=()=>({schemaVersion:1,season:'2026/27',snapshots:[],predictions:[]});
const fake=games=>({teams,signature:'test-v1',forecast:()=>teams.map(club=>({club,top6:30})),probabilities:()=>[.5,.3,.2]});
const fixture={id:'2026102401',date:'2026-10-24',time:'15:00',home:'北九州',away:'岐阜',status:'scheduled'};
const mockCalendar=()=>({...calendar,checkedAt:now.toISOString(),matches:[fixture]});
test('compass formula has the correct denominator and keeps points earned',()=>{const c=api.compass(10,10,60);assert.equal(c.remaining,28);assert.equal(c.needed,50);assert.equal(c.pace,50/28);assert.equal(c.maximum,94);});
test('unreachable target is explicit, never clamped to a realistic-looking pace',()=>{const c=api.compass(10,37,60);assert.equal(c.possible,false);assert.equal(c.pace,50);});
test('finished season never divides by zero or promises sixth place',()=>{assert.equal(api.compass(60,38,60).pace,null);assert.equal(api.compass(59,38,60).possible,false);assert.equal(api.compass(61,38,60).needed,0);});
test('invalid custom targets and impossible actual standings are rejected',()=>{for(const args of [[1,0,60],[10,39,60],[10,10,114.1],[10,10,-1],[10,10,NaN]])assert.throws(()=>api.compass(...args));});
test('capture starts now and never invents retrospective match forecasts',()=>{const c=mockCalendar();c.matches.push({...fixture,id:'2026080101',date:'2026-08-01'});const a=capture(empty(),feed,c,now,fake);assert.equal(a.snapshots.length,1);assert.equal(a.snapshots[0].recordedAt,now.toISOString());assert.equal(a.predictions.length,1);assert.equal(a.predictions[0].home,'北九州');assert.equal(a.predictions[0].away,'岐阜');assert.equal(a.predictions[0].kickoff,'2026-10-24T06:00:00.000Z');});
test('same results are idempotent; original pre-match record is immutable',()=>{const a=capture(empty(),feed,mockCalendar(),now,fake),before=JSON.stringify(a);const b=capture(a,feed,mockCalendar(),new Date(+now+1000),fake);assert.equal(JSON.stringify(a),before);assert.deepEqual(b,a);});
test('result revision appends snapshots and predictions, leaving old records intact',()=>{const a=capture(empty(),feed,mockCalendar(),now,fake),changed=structuredClone(feed);changed.matches[0].game[2]++;const b=capture(a,changed,mockCalendar(),new Date(+now+1000),fake);assert.equal(b.snapshots.length,2);assert.equal(b.predictions.length,2);assert.deepEqual(b.snapshots[0],a.snapshots[0]);assert.deepEqual(b.predictions[0],a.predictions[0]);});
test('a score correction subsequently reverted is preserved as a third event',()=>{const a=capture(empty(),feed,mockCalendar(),now,fake),changed=structuredClone(feed);changed.matches[0].game[2]++;const b=capture(a,changed,mockCalendar(),new Date(+now+1000),fake),c=capture(b,feed,mockCalendar(),new Date(+now+2000),fake);assert.equal(c.snapshots.length,3);assert.equal(c.predictions.length,3);assert.equal(c.snapshots[0].sourceId,c.snapshots[2].sourceId);assert.notEqual(c.snapshots[0].id,c.snapshots[2].id);assert.deepEqual(c.snapshots.slice(0,2),b.snapshots);});
test('model revision creates a new series without rewriting history',()=>{const a=capture(empty(),feed,mockCalendar(),now,fake);const b=capture(a,feed,mockCalendar(),new Date(+now+1000),g=>({...fake(g),signature:'test-v2'}));assert.equal(b.snapshots.length,2);assert.notEqual(b.snapshots[0].model,b.snapshots[1].model);});
test('postponed, cancelled, unconfirmed, finished and unknown-time games are not archived',()=>{for(const status of ['postponed','cancelled','unconfirmed','finished']){const c=mockCalendar();c.matches[0]={...fixture,status};assert.equal(capture(empty(),feed,c,now,fake).predictions.length,0);}const c=mockCalendar();c.matches[0]={...fixture,time:null};assert.equal(capture(empty(),feed,c,now,fake).predictions.length,0);});
test('kickoff boundary is strict; future games beyond seven days are excluded',()=>{for(const clock of [new Date('2026-10-24T06:00:00Z'),new Date('2026-10-24T06:01:00Z'),new Date('2026-10-16T00:00:00Z')]){const f={...feed,updatedAt:clock.toISOString(),matches:[]},c={...mockCalendar(),checkedAt:clock.toISOString()};assert.equal(capture(empty(),f,c,clock,fake).predictions.length,0);}});
test('a kickoff reached during computation cannot receive a backdated prediction',()=>{assert.equal(capture(empty(),feed,mockCalendar(),now,fake,()=>new Date('2026-10-24T06:00:00Z')).predictions.length,0);});
test('invalid scores, duplicate cards, unverified and stale sources fail closed',()=>{for(const mutate of [f=>f.verified=false,f=>f.matches.push(f.matches[0]),f=>f.matches[0].game[2]=-1,f=>f.matches[0].date='bad']){const f=structuredClone(feed);mutate(f);assert.throws(()=>capture(empty(),f,mockCalendar(),now,fake));}const c=mockCalendar();c.checkedAt=new Date(+now-49*3600000).toISOString();assert.throws(()=>capture(empty(),feed,c,now,fake));});
test('probability sums and strict pre-kickoff archive timestamps are validated',()=>{const a=capture(empty(),feed,mockCalendar(),now,fake);for(const mutate of [p=>p.probabilities=[.5,.5,.5],p=>p.recordedAt=p.kickoff,p=>p.probabilities=[NaN,.5,.5],p=>p.snapshotId='missing']){const b=structuredClone(a);mutate(b.predictions[0]);assert.throws(()=>api.validArchive(b));}});
function finished(a){const f={verified:true,matches:[{id:fixture.id,game:['北九州','岐阜',2,1]}]},c=mockCalendar();c.matches[0]={...fixture,status:'finished'};return {f,c};}
test('only official finished, matching H/A records settle',()=>{const a=capture(empty(),feed,mockCalendar(),now,fake),{f,c}=finished(a);const rows=api.settledPredictions(a,f,c);assert.equal(rows.length,1);assert.equal(rows[0].outcome,0);for(const status of ['scheduled','postponed','cancelled','unconfirmed']){c.matches[0].status=status;assert.equal(api.settledPredictions(a,f,c).length,0);}c.matches[0].status='finished';f.matches[0].game=['岐阜','北九州',2,1];assert.equal(api.settledPredictions(a,f,c).length,0);});
test('rescheduled kickoff is not scored using an obsolete prediction',()=>{const a=capture(empty(),feed,mockCalendar(),now,fake),{f,c}=finished(a);c.matches[0].time='16:00';assert.equal(api.settledPredictions(a,f,c).length,0);});
test('last strictly pre-match revision is scored once per model',()=>{const a=capture(empty(),feed,mockCalendar(),now,fake),changed=structuredClone(feed);changed.matches[0].game[2]++;const b=capture(a,changed,mockCalendar(),new Date(+now+1000),fake),{f,c}=finished(b);const rows=api.settledPredictions(b,f,c);assert.equal(rows.length,1);assert.equal(rows[0].snapshotId,b.snapshots[1].id);});
test('calibration independently checks accuracy, log loss, Brier and all three outcomes',()=>{const s=api.calibration([{probabilities:[.5,.3,.2],outcome:0},{probabilities:[.1,.2,.7],outcome:1}]);assert.equal(s.n,2);assert.equal(s.accuracy,.5);assert.equal(s.logLoss,(-Math.log(.5)-Math.log(.2))/2);assert.ok(Math.abs(s.brier-(.38+1.14)/2)<1e-12);assert.equal(s.bins.reduce((n,b)=>n+b.n,0),6);assert.equal(s.bins.reduce((n,b)=>n+b.hits,0),2);});
test('no evidence means no fabricated zero accuracy; 100% falls in final bin',()=>{assert.equal(api.calibration([]).accuracy,null);assert.equal(api.calibration([{probabilities:[1,0,0],outcome:0}]).bins[9].actual,1);});
test('shared engine reads actual page constants and H/A Elo formula',()=>{const e=engine([]),p=Array.from(e.probabilities('北九州','岐阜')),ratio=10**(60/400),nu=.27/.73,den=ratio+1+2*nu*Math.sqrt(ratio);assert.ok(Math.abs(p[0]-ratio/den)<1e-12);assert.ok(p[0]>p[2]);assert.ok(Math.abs(p.reduce((a,b)=>a+b,0)-1)<1e-12);});
test('real archive preserves Monte Carlo probability conservation for all twenty clubs',()=>{const e=engine(feed.matches.map(m=>m.game)),rows=e.forecast();assert.equal(rows.length,20);assert.ok(Math.abs(rows.reduce((s,r)=>s+r.top6,0)-600)<1e-9);assert.ok(Math.abs(rows.reduce((s,r)=>s+r.distribution[0],0)-100)<1e-9);assert.ok(rows.every(r=>Math.abs(r.distribution.reduce((a,b)=>a+b,0)-100)<1e-9));});
test('archive publisher runs only after both source collectors succeed',()=>{const workflow=fs.readFileSync(path.join(root,'.github/workflows/official-results.yml'),'utf8');assert.ok(workflow.indexOf('node scripts/capture-predictions.cjs')>workflow.indexOf('id: schedule'));assert.ok(workflow.includes("PUBLISH_JOURNAL: 'true'"));assert.ok(!workflow.includes('send-mail'));});
test('frontend uses actual-only baseline, handles invalid target and records no trial forecasts',()=>{
  const els=new Map(),timers=[];const el=id=>{if(!els.has(id))els.set(id,{value:id==='runs'?'30':'0',innerHTML:'',textContent:'',style:{},dataset:{},classList:{toggle(){},add(){},remove(){}},addEventListener(){},querySelectorAll:()=>[],click(){this.onclick?.()}});return els.get(id);};
  const context={document:{getElementById:el,querySelectorAll:()=>[],addEventListener(){}},window:{addEventListener(){},localStorage:{getItem:()=>null,setItem(){}}},setTimeout:f=>timers.push(f),setInterval(){},J3ForecastInsights:api};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'shared-results.js'),'utf8'),context);context.J3Results=context.window.J3Results;
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],context);timers.shift()();
  el('compassTarget').value='median';vm.runInContext('renderCompass()',context);const actual=el('compassSummary').innerHTML;assert.ok(actual.includes('中央80%'));
  vm.runInContext("scenarios.push(['北九州','岐阜',9,0]);renderCompass()",context);assert.equal(el('compassSummary').innerHTML,actual);
  el('compassTarget').value='custom';el('compassCustom').value='';vm.runInContext('renderCompass()',context);assert.ok(el('compassSummary').textContent.includes('整数'));
  assert.ok(html.includes('xG・被xG'));assert.ok(html.includes('現在の順位予測には使っていません'));assert.ok(!html.includes('localStorage.setItem(\'prediction'));
});
async function journalHarness(fetcher,clock=()=>+now){
  const els=new Map(),el=id=>{if(!els.has(id))els.set(id,{value:'',innerHTML:'',textContent:'',disabled:false,classList:{add(){},remove(){}}});return els.get(id);};
  class TestDate extends Date{constructor(...args){super(...(args.length?args:[clock()]));}static now(){return clock();}}
  const context={document:{getElementById:el,hidden:false},window:{J3ForecastInsights:api,addEventListener(){}},fetch:fetcher,AbortController,setTimeout,clearTimeout,setInterval(){},Date:TestDate};
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'prediction-journal/journal.js'),'utf8'),context);
  for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));return {el};
}
const journalFixture=capture(empty(),feed,mockCalendar(),now,fake);
function payload(file){return structuredClone(file==='prediction-journal.json'?journalFixture:file==='official-results.json'?feed:mockCalendar());}
const response=value=>({ok:true,json:async()=>structuredClone(value)});
test('journal renders twenty selectable clubs and does not fabricate calibration before results',async()=>{
  const h=await journalHarness(async url=>response(payload(url.split('/').at(-1).split('?')[0])));
  assert.equal((h.el('journalClub').innerHTML.match(/<option>/g)||[]).length,20);assert.ok(h.el('trendSummary').textContent.includes('初回記録'));
  assert.ok(h.el('scoreSummary').innerHTML.includes('—'));assert.ok(h.el('sampleNote').textContent.includes('まだ採点できる'));
  assert.ok(h.el('journalTrend').innerHTML.includes('北九州'));assert.ok(!/NaN|undefined/.test(h.el('journalTrend').innerHTML));assert.ok(h.el('matchArchive').innerHTML.includes('結果待ち'));
});
test('initial raw-feed failure uses bundled data with an explicit freshness warning',async()=>{
  const h=await journalHarness(async url=>{if(url.startsWith('https:'))throw Error('offline');return response(payload(url.split('/').at(-1).split('?')[0]));});
  assert.ok(h.el('journalStatus').textContent.includes('再取得は未確認'));assert.ok(h.el('journalTrend').innerHTML.includes('<svg'));
});
test('refresh failure retains prior chart and never silently falls back to older data',async()=>{
  let offline=false,fallbacks=0;
  const h=await journalHarness(async url=>{if(!url.startsWith('https:'))fallbacks++;if(offline)throw Error('offline');return response(payload(url.split('/').at(-1).split('?')[0]));});
  const chart=h.el('journalTrend').innerHTML;offline=true;await h.el('refreshJournal').onclick();assert.equal(h.el('journalTrend').innerHTML,chart);assert.equal(fallbacks,0);assert.ok(h.el('journalStatus').textContent.includes('前回の表示を保持'));
});
test('journal rejects archive rewrites without replacing the last good chart',async()=>{
  let altered=false;
  const h=await journalHarness(async url=>{const file=url.split('/').at(-1).split('?')[0],data=payload(file);if(altered&&file==='prediction-journal.json')data.snapshots[0].recordedAt=new Date(Date.parse(data.snapshots[0].recordedAt)+1000).toISOString();return response(data);});
  const chart=h.el('journalTrend').innerHTML;altered=true;await h.el('refreshJournal').onclick();assert.equal(h.el('journalTrend').innerHTML,chart);assert.ok(h.el('journalStatus').textContent.includes('検証に失敗'));
});
test('empty first archive has a truthful no-history state, not a zero probability',async()=>{
  const h=await journalHarness(async url=>response(url.includes('prediction-journal.json')?empty():payload(url.split('/').at(-1).split('?')[0])));
  assert.ok(h.el('trendSummary').textContent.includes('記録開始待ち'));assert.equal(h.el('journalTrend').innerHTML,'');assert.ok(!h.el('scoreSummary').innerHTML.includes('0.0%'));
});
test('switching clubs after a failed refresh preserves the failure notice',async()=>{
  let offline=false;const h=await journalHarness(async url=>{if(offline)throw Error('offline');return response(payload(url.split('/').at(-1).split('?')[0]));});
  offline=true;await h.el('refreshJournal').onclick();const warning=h.el('journalStatus').textContent;
  h.el('journalClub').value='鹿児島';h.el('journalClub').onchange();assert.equal(h.el('journalStatus').textContent,warning);assert.ok(h.el('trendSummary').textContent.includes('鹿児島'));
});
test('changing a displayed club never manufactures a new retrieval time',async()=>{
  let clock=+now;const h=await journalHarness(async url=>response(payload(url.split('/').at(-1).split('?')[0])),()=>clock);
  const stamp=h.el('journalStatus').textContent;clock+=3600000;h.el('journalClub').value='鹿児島';h.el('journalClub').onchange();assert.equal(h.el('journalStatus').textContent,stamp);
});
test('older results or calendar cannot replace known newer data in the journal',async()=>{
  for(const older of ['official-results.json','league-schedule.json']){let replay=false;const h=await journalHarness(async url=>{const file=url.split('/').at(-1).split('?')[0],data=payload(file);if(replay&&file===older){const field=file==='official-results.json'?'updatedAt':'checkedAt';data[field]=new Date(Date.parse(data[field])-60000).toISOString();}return response(data);});
    replay=true;const chart=h.el('journalTrend').innerHTML;await h.el('refreshJournal').onclick();assert.ok(h.el('journalStatus').textContent.includes('検証に失敗'),older);assert.equal(h.el('journalTrend').innerHTML,chart);
  }
});
test('malformed source dates and future source timestamps cannot be used for scoring',async()=>{
  for(const mutate of [(f,c)=>f.updatedAt='bad',(f,c)=>c.checkedAt='bad',(f,c)=>c.checkedAt=new Date(+now+3600000).toISOString(),(f,c)=>c.matches[0].date='2026-02-30',(f,c)=>f.matches[0].date='2027-12-01']){
    const f=payload('official-results.json'),c=payload('league-schedule.json');mutate(f,c);const h=await journalHarness(async url=>response(url.includes('prediction-journal.json')?payload('prediction-journal.json'):url.includes('official-results.json')?f:c));assert.ok(h.el('journalStatus').textContent.includes('検証に失敗'));
  }
});
test('returning to a previous model starts a new chart segment and comparison',async()=>{
  const first=capture(empty(),feed,mockCalendar(),now,fake),second=capture(first,feed,mockCalendar(),new Date(+now+1000),g=>({...fake(g),signature:'test-v2'})),third=capture(second,feed,mockCalendar(),new Date(+now+2000),fake);
  const h=await journalHarness(async url=>response(url.includes('prediction-journal.json')?third:payload(url.split('/').at(-1).split('?')[0])));
  assert.equal((h.el('journalTrend').innerHTML.match(/<polyline /g)||[]).length,2);assert.ok(h.el('trendSummary').textContent.includes('モデル切替'));
});
test('finished results and newer score corrections update the actual UI; replay does not undo them',async()=>{
  const f=payload('official-results.json'),c=payload('league-schedule.json');f.matches.push({id:fixture.id,date:fixture.date,game:[fixture.home,fixture.away,2,1]});f.asOfDate=fixture.date;f.updatedAt='2026-10-24T08:00:00Z';c.checkedAt=f.updatedAt;c.matches[0].status='finished';
  let revision=0;const h=await journalHarness(async url=>{const data=url.includes('prediction-journal.json')?payload('prediction-journal.json'):url.includes('official-results.json')?structuredClone(f):structuredClone(c);if(revision===1&&url.includes('official-results.json')){data.updatedAt='2026-10-24T08:01:00Z';data.matches.at(-1).game=[fixture.home,fixture.away,1,2];}return response(data);},()=>Date.parse('2026-10-24T10:00:00Z'));
  assert.ok(h.el('matchArchive').innerHTML.includes('2–1'));assert.ok(h.el('scoreSummary').innerHTML.includes('100.0%'));assert.ok(h.el('scoreSummary').innerHTML.includes('0.693'));assert.ok(h.el('scoreSummary').innerHTML.includes('0.380'));
  revision=1;await h.el('refreshJournal').onclick();assert.ok(h.el('matchArchive').innerHTML.includes('1–2'));assert.ok(h.el('scoreSummary').innerHTML.includes('1.609'));assert.ok(h.el('scoreSummary').innerHTML.includes('0.980'));
  revision=2;await h.el('refreshJournal').onclick();assert.ok(h.el('journalStatus').textContent.includes('検証に失敗'));assert.ok(h.el('matchArchive').innerHTML.includes('1–2'));
});
test('missing known results or scheduled cards retain the previous complete display',async()=>{
  for(const missing of ['official-results.json','league-schedule.json']){let dropped=false;const h=await journalHarness(async url=>{const file=url.split('/').at(-1).split('?')[0],data=payload(file);if(dropped&&file===missing)data.matches.shift();return response(data);});const chart=h.el('journalTrend').innerHTML;dropped=true;await h.el('refreshJournal').onclick();assert.ok(h.el('journalStatus').textContent.includes('検証に失敗'));assert.equal(h.el('journalTrend').innerHTML,chart);}
});
test('journal HTML loads the current client instead of a cached previous version',()=>{const source=fs.readFileSync(path.join(root,'prediction-journal/journal.js')),hash=require('node:crypto').createHash('sha256').update(source).digest('hex').slice(0,12),html=fs.readFileSync(path.join(root,'prediction-journal/index.html'),'utf8');assert.ok(html.includes('journal.js?v='+hash+'"'));});
