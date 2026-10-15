const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const main=fs.readFileSync('index.html','utf8'),shared=fs.readFileSync('shared-results.js','utf8'),calendar={verified:true,season:'2026/27',checkedAt:'2026-10-14T11:00:00Z',matches:[
 {id:'2026101728',date:'2026-10-17',time:'14:00',home:'北九州',away:'FC大阪',status:'scheduled'},
 {id:'2026102127',date:'2026-10-21',time:'13:00',home:'福島',away:'北九州',status:'scheduled'}]};
function app(location={search:'',hash:''}){
 const timers=[];
 const events={};
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='runs'?'10':'0',textContent:'',innerHTML:'',style:{},dataset:{},classList:{toggle(){},add(){},remove(){}},querySelectorAll:()=>[],click(){this.onclick?.()}});return nodes.get(id);};
 const ctx={location,document:{getElementById:node,querySelectorAll:()=>[],addEventListener:(n,f)=>events[n]=f,hidden:false},localStorage:{getItem(){return null;}},setTimeout(f,ms){if(ms===20)timers.push(f);return 0;},setInterval(){},clearTimeout(){},AbortController,console};ctx.window=ctx;ctx.addEventListener=(n,f)=>events[n]=f;ctx.dispatchEvent=()=>{};
 vm.createContext(ctx);vm.runInContext(shared,ctx);vm.runInContext(main.match(/<script>\s*([\s\S]*?)<\/script>/)[1],ctx);
 ctx.calendar=structuredClone(calendar);vm.runInContext('fixtureCalendar=validateCalendar(calendar);updateNextFixture()',ctx);
 return {ctx,node,events,flushRender:()=>{while(timers.length)timers.shift()();},eval:s=>vm.runInContext(s,ctx)};
}
test('first display selects official next fixture with correct home/away and kickoff',()=>{
 const a=app();assert.equal(a.node('home').value,'北九州');assert.equal(a.node('away').value,'FC大阪');assert.match(a.node('nextFixtureStatus').textContent,/2026-10-17 14:00/);
});
test('trial does not advance next fixture; actual confirmed result does',()=>{
 const a=app();a.eval("scenarios=[['北九州','FC大阪',2,0]];updateNextFixture()");assert.equal(a.node('away').value,'FC大阪');
 a.eval("completed.push(['北九州','FC大阪',2,0]);updateNextFixture()");assert.equal(a.node('home').value,'福島');assert.equal(a.node('away').value,'北九州');
});
test('manual selection survives result updates and return button resets it',()=>{
 const a=app();a.node('away').value='愛媛';a.node('away').onchange();a.eval("completed.push(['北九州','FC大阪',2,0]);updateNextFixture()");assert.equal(a.node('away').value,'愛媛');
 a.node('showNextFixture').onclick();assert.equal(a.node('home').value,'福島');assert.equal(a.node('away').value,'北九州');
});
test('postponement, cancellation and unknown state hold the card until official completion',()=>{
 for(const status of ['postponed','cancelled','unconfirmed']){const a=app();a.ctx.status=status;a.eval("fixtureCalendar.matches.find(r=>r.away==='FC大阪').status=status;updateNextFixture()");assert.equal(a.node('home').value,'北九州');assert.equal(a.node('away').value,'FC大阪');assert.match(a.node('nextFixtureStatus').textContent,/自動切り替え停止/);}
 const finished=app();finished.eval("fixtureCalendar.matches.find(r=>r.away==='FC大阪').status='finished';updateNextFixture()");assert.equal(finished.node('home').value,'福島');assert.equal(finished.node('away').value,'北九州');
 const a=app();a.eval("fixtureCalendar.matches.find(r=>r.away==='FC大阪').date='2026-10-30';updateNextFixture()");assert.equal(a.node('home').value,'福島');
});
test('no remaining calendar does not invent a card and invalid payload is rejected',()=>{
 const a=app();a.eval('fixtureCalendar.matches=[];updateNextFixture()');assert.match(a.node('nextFixtureStatus').textContent,/次戦を確認できません/);
 for(const change of ["calendar.verified=false","calendar.matches[0].home='unknown'","calendar.matches[0].date='2026-02-30'","calendar.matches.push(calendar.matches[0])"]){const b=app();b.eval(change);assert.throws(()=>b.eval('validateCalendar(calendar)'));}
});
test('automatic card change resets trial score without changing registered trial rows',()=>{
 const a=app();a.node('hg').value='4';a.eval("scenarios=[['北九州','FC大阪',4,0]];completed.push(['北九州','FC大阪',1,0]);updateNextFixture()");assert.equal(a.node('hg').value,'0');assert.equal(a.eval('scenarios.length'),1);
});
test('calendar failure preserves manual card and reports failure',async()=>{
 const a=app();a.node('away').value='愛媛';a.node('away').onchange();a.ctx.fetch=async()=>{throw Error('offline');};await a.eval('refreshFixtureCalendar()');assert.equal(a.node('away').value,'愛媛');assert.match(a.node('nextFixtureStatus').textContent,/再取得失敗/);
});
test('no next fixture clears automatic card but preserves deliberate manual selection',()=>{
 const a=app();a.eval("fixtureCalendar.matches.forEach(r=>r.status='finished');updateNextFixture()");assert.equal(a.node('away').value,'');assert.equal(a.node('submitGame').disabled,true);assert.ok(!a.node('prematch').innerHTML.includes('NaN'));
 const b=app();b.node('away').value='愛媛';b.node('away').onchange();b.eval("fixtureCalendar.matches=[];updateNextFixture()");assert.equal(b.node('away').value,'愛媛');b.node('showNextFixture').onclick();assert.equal(b.node('away').value,'');assert.equal(b.eval('manualFixture'),false);
});
test('failed calendar notice survives result updates and clears only after successful calendar retry',async()=>{
 const a=app();a.ctx.fetch=async()=>{throw Error('offline');};await a.eval('refreshFixtureCalendar()');a.eval('updateNextFixture()');assert.match(a.node('nextFixtureStatus').textContent,/再取得失敗/);
 a.ctx.fetch=async()=>({ok:true,json:async()=>structuredClone(calendar)});await a.eval('refreshFixtureCalendar()');assert.doesNotMatch(a.node('nextFixtureStatus').textContent,/再取得失敗/);
});
test('duplicate cards, outside-season dates and future check timestamps rejected',()=>{
 for(const change of ["calendar.matches.push({...calendar.matches[0],id:'2026101828',date:'2026-10-18'})","calendar.matches[0].date='2030-10-17'","calendar.checkedAt=new Date(Date.now()+3600000).toISOString()"]){const a=app();a.eval(change);assert.throws(()=>a.eval('validateCalendar(calendar)'));}
});
test('older calendar cannot reverse official cancellation and reports unverified freshness',async()=>{
 const a=app();a.eval("fixtureCalendar.matches[0].status='cancelled'");a.ctx.fetch=async()=>({ok:true,json:async()=>({...structuredClone(calendar),checkedAt:'2026-10-13T11:00:00Z'})});await a.eval('refreshFixtureCalendar()');assert.match(a.node('nextFixtureStatus').textContent,/中止：自動切り替え停止/);assert.match(a.node('nextFixtureStatus').textContent,/再取得失敗/);assert.equal(a.node('away').value,'FC大阪');
});
test('mismatched IDs, other-club cards and non-string IDs are rejected',()=>{
 for(const change of ["calendar.matches[0].id='2026101828'","calendar.matches[0].id=2026101728","calendar.matches[0].home='愛媛'"]){const a=app();a.eval(change);assert.throws(()=>a.eval('validateCalendar(calendar)'));}
});
test('iPad visibility and page restoration fetch the current published cancellation',async()=>{
 for(const event of ['visibilitychange','pageshow']){const a=app();let calls=0;a.ctx.fetch=async url=>{if(url.includes('official-schedule.json')){calls++;assert(url.startsWith('https://raw.githubusercontent.com/rockiemydog/j3-elo-simulator/main/'));const latest=structuredClone(calendar);latest.checkedAt=new Date().toISOString();latest.matches[0].status='cancelled';return {ok:true,json:async()=>latest};}throw Error('offline');};a.events[event]();await new Promise(setImmediate);assert.equal(calls,1);assert.match(a.node('nextFixtureStatus').textContent,/中止：自動切り替え停止/);assert.equal(a.node('away').value,'FC大阪');}
});
function monthAudit(now='2026-10-17T14:59:00Z'){
 const a=app(),clock={now:Date.parse(now)},NativeDate=Date;
 a.ctx.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[clock.now]));}static now(){return clock.now;}};
 a.ctx.league=JSON.parse(fs.readFileSync('tests/fixtures/month-schedule.json','utf8'));
 const live=JSON.parse(fs.readFileSync('official-results.json','utf8'));a.ctx.feed={...live,asOfDate:'2026-10-11',matches:live.matches.filter(r=>r.date<='2026-10-11')};
 a.eval('J3Results.applyOfficialFeed(feed);completed=J3Results.initialGames.map(g=>g.slice());DATA_AS_OF=feed.asOfDate;league.checkedAt=new Date().toISOString();leagueCalendar=validateLeagueCalendar(league);renderMonthForecast(10)');
 a.ctx.fetch=async()=>({ok:true,json:async()=>structuredClone(a.ctx.league)});
 return {...a,clock};
}
test('unchanged calendar re-evaluates overdue fixtures after a JST date change',async()=>{
 const a=monthAudit();assert.match(a.node('monthSummary').textContent,/14試合/);
 a.clock.now=Date.parse('2026-10-17T15:01:00Z');await a.eval('refreshLeagueCalendar()');
 assert.match(a.node('monthSummary').textContent,/13試合/);assert.match(a.node('monthStatus').textContent,/除外 6試合/);
});
test('same calendar removes elapsed month and selects next month after JST month rollover',async()=>{
 const a=monthAudit('2026-10-31T14:59:00Z');assert.equal(a.node('monthEnd').value,'2026-10-31');
 a.clock.now=Date.parse('2026-10-31T15:01:00Z');await a.eval('refreshLeagueCalendar()');
 assert.equal(a.node('monthEnd').value,'2026-11-30');assert.doesNotMatch(a.node('monthEnd').innerHTML,/2026年10月末/);assert.match(a.node('monthStatus').textContent,/2026-11-30/);
});
test('unchanged calendar does not repeatedly recompute a manually selected month within the same day',async()=>{
 const a=monthAudit('2026-10-15T22:30:00Z');a.node('monthEnd').value='2026-12-31';a.node('monthEnd').onchange();
 a.eval('let monthCalls=0;const originalMonthRender=renderMonthForecast;renderMonthForecast=(...args)=>{monthCalls++;return originalMonthRender(...args)}');
 await a.eval('refreshLeagueCalendar()');assert.equal(a.eval('monthCalls'),0);assert.equal(a.node('monthEnd').value,'2026-12-31');
});
test('failed monthly refresh reports uncertainty and identical successful retry clears it',async()=>{
 const a=monthAudit('2026-10-15T22:30:00Z'),good=a.ctx.fetch;a.ctx.fetch=async()=>{throw Error('offline')};await a.eval('refreshLeagueCalendar()');assert.match(a.node('monthStatus').textContent,/再取得失敗/);assert.ok(a.node('monthRows').innerHTML);
 a.ctx.fetch=good;await a.eval('refreshLeagueCalendar()');assert.doesNotMatch(a.node('monthStatus').textContent,/再取得失敗/);
});
test('an unchanged but expired monthly calendar clears predictions rather than showing old probabilities',async()=>{
 const a=monthAudit('2026-10-15T22:30:00Z');a.clock.now+=25*3600000;await a.eval('refreshLeagueCalendar()');assert.equal(a.node('monthRows').innerHTML,'');assert.match(a.node('monthStatus').textContent,/24時間/);
});
test('older monthly calendar cannot undo a known cancellation',async()=>{
 const a=monthAudit('2026-10-15T22:30:00Z');a.eval("leagueCalendar.matches.find(r=>r.home==='北九州'&&r.away==='FC大阪').status='cancelled';renderMonthForecast(10)");a.ctx.fetch=async()=>({ok:true,json:async()=>({...structuredClone(a.ctx.league),checkedAt:'2026-10-15T21:30:00Z'})});await a.eval('refreshLeagueCalendar()');assert.equal(a.eval("leagueCalendar.matches.find(r=>r.home==='北九州'&&r.away==='FC大阪').status"),'cancelled');assert.match(a.node('monthSummary').textContent,/13試合/);assert.match(a.node('monthStatus').textContent,/再取得失敗/);
});
test('month forecast opens as a separate view with its own title and no final-season simulation',()=>{
 const a=app({search:'?view=month-end',hash:''});a.flushRender();assert.equal(a.eval('MONTH_VIEW'),true);assert.equal(a.node('monthSection').hidden,false);assert.equal(a.node('pageTitle').textContent,'月末時点の順位予測');assert.equal(a.eval('lastForecast'),null);
 assert.match(main,/id="monthSection"[^>]*hidden/);assert.match(main,/id="openMonthForecast"[^>]*target="_blank"[^>]*rel="noopener"/);assert.match(main,/body\.month-view \.final-only/);
 const b=app();b.flushRender();assert.equal(b.eval('MONTH_VIEW'),false);assert.equal(b.eval('lastForecast.length'),20);
});
test('opening month view carries only valid unconfirmed trial rows without saving official results',()=>{
 const source=app();source.eval("scenarios=[['北九州','FC大阪',2,0]];renderScenarios()");const hash=source.node('openMonthForecast').href.split('#')[1];assert(hash);const target=app({search:'?view=month-end',hash:'#'+hash});assert.equal(target.eval('scenarios.length'),1);assert.equal(target.eval('scenarios[0][2]'),2);assert.equal(target.eval('confirmed().length'),source.eval('confirmed().length'));target.eval('scenarios=[]');assert.equal(source.eval('scenarios.length'),1);
 const invalid='#trial='+encodeURIComponent(JSON.stringify([['北九州','FC大阪',-1,0]])),bad=app({search:'?view=month-end',hash:invalid});assert.equal(bad.eval('scenarios.length'),0);
});
