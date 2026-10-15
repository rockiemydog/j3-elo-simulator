const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const main=fs.readFileSync('index.html','utf8'),shared=fs.readFileSync('shared-results.js','utf8'),calendar={verified:true,season:'2026/27',checkedAt:'2026-10-14T11:00:00Z',matches:[
 {id:'2026101728',date:'2026-10-17',time:'14:00',home:'北九州',away:'FC大阪',status:'scheduled'},
 {id:'2026102127',date:'2026-10-21',time:'13:00',home:'福島',away:'北九州',status:'scheduled'}]};
function app(storage=new Map(),bootCalendar=true){
 const events={};
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='runs'?'10':'0',textContent:'',innerHTML:'',style:{},dataset:{},classList:{toggle(){},add(){},remove(){}},querySelectorAll:()=>[],click(){this.onclick?.()}});return nodes.get(id);};
 const ctx={document:{getElementById:node,querySelectorAll:()=>[],addEventListener:(n,f)=>events[n]=f,hidden:false},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout(){return 0;},setInterval(){},clearTimeout(){},AbortController,console};ctx.window=ctx;ctx.addEventListener=(n,f)=>events[n]=f;ctx.dispatchEvent=()=>{};
 vm.createContext(ctx);vm.runInContext(shared,ctx);vm.runInContext(main.match(/<script>\s*([\s\S]*?)<\/script>/)[1],ctx);
 ctx.calendar=structuredClone(calendar);if(bootCalendar)vm.runInContext('fixtureCalendar=validateCalendar(calendar);updateNextFixture()',ctx);
 return {ctx,node,events,eval:s=>vm.runInContext(s,ctx)};
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

test('future finished fixtures cannot prematurely advance the automatic card',()=>{
 const a=app();a.ctx.futureDate=new Date(Date.now()+2*86400000).toISOString().slice(0,10);a.eval("calendar.matches[0].date=futureDate;calendar.matches[0].id=futureDate.replaceAll('-','')+'28';calendar.matches[0].status='finished'");assert.throws(()=>a.eval('validateCalendar(calendar)'),/Future/);
});
test('partial calendar retains missing cancelled and scheduled cards',()=>{
 for(const status of ['cancelled','postponed','scheduled']){const a=app();a.ctx.status=status;a.eval("fixtureCalendar.matches[0].status=status;applyFixtureCalendar({...calendar,matches:calendar.matches.slice(1)})");assert.equal(a.node('away').value,'FC大阪');assert.match(a.node('nextFixtureStatus').textContent,/自動切り替え停止/);assert.equal(a.eval('fixtureCalendar.matches.length'),2);}
});
test('cancellation takes priority over a conflicting stale score until schedule resolves',()=>{
 for(const status of ['cancelled','postponed']){const a=app();a.ctx.status=status;a.eval("fixtureCalendar.matches[0].status=status;completed.push(['北九州','FC大阪',1,0]);updateNextFixture()");assert.equal(a.node('away').value,'FC大阪');a.eval("fixtureCalendar.matches[0].status='finished';updateNextFixture()");assert.equal(a.node('home').value,'福島');}
});
test('rescheduling replaces the same home-away card instead of retaining a duplicate',()=>{
 const a=app();a.eval("fixtureCalendar.matches[0].status='postponed';calendar.matches[0].date='2026-11-01';calendar.matches[0].id='2026110128';applyFixtureCalendar(calendar)");assert.equal(a.eval('fixtureCalendar.matches.length'),2);assert.equal(a.node('home').value,'福島');
});
test('calendar cache restores next card without network and rejects corruption',()=>{
 const storage=new Map(),a=app(storage);a.eval("calendar.matches[0].status='cancelled';applyFixtureCalendar(calendar)");const reloaded=app(storage,false);assert.equal(reloaded.node('away').value,'FC大阪');assert.match(reloaded.node('nextFixtureStatus').textContent,/中止/);
 for(const raw of ['{broken','{}','x'.repeat(30001)]){const bad=app(new Map([['j3-official-calendar-v1',raw]]),false);assert.equal(bad.eval('fixtureCalendar'),null);}
});
test('another tab immediately adopts a newer cancellation, and denied storage stays usable',()=>{
 const storage=new Map(),a=app(storage);a.ctx.newer=structuredClone(calendar);a.ctx.newer.checkedAt=new Date().toISOString();a.ctx.newer.matches[0].status='cancelled';storage.set('j3-official-calendar-v1',JSON.stringify(a.ctx.newer));a.events.storage({key:'j3-official-calendar-v1'});assert.match(a.node('nextFixtureStatus').textContent,/中止/);
 const b=app();b.ctx.localStorage.setItem=()=>{throw Error('quota')};assert.doesNotThrow(()=>b.eval('applyFixtureCalendar(calendar)'));assert.equal(b.node('away').value,'FC大阪');
});
test('bundled schedule is usable when the live schedule is unavailable',async()=>{
 const a=app(new Map(),false);a.ctx.fetch=async(url,options)=>{if(url==='official-schedule.json'){assert.equal(options.credentials,'same-origin');return {ok:true,json:async()=>structuredClone(calendar)};}throw Error('offline');};await a.eval('refreshFixtureCalendar()');assert.equal(a.node('away').value,'FC大阪');assert.match(a.node('nextFixtureStatus').textContent,/再取得失敗/);
});
