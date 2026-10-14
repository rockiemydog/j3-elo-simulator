const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const main=fs.readFileSync('index.html','utf8'),shared=fs.readFileSync('shared-results.js','utf8'),calendar={verified:true,season:'2026/27',checkedAt:'2026-10-14T11:00:00Z',matches:[
 {id:'2026101728',date:'2026-10-17',time:'14:00',home:'北九州',away:'FC大阪',status:'scheduled'},
 {id:'2026102127',date:'2026-10-21',time:'13:00',home:'福島',away:'北九州',status:'scheduled'}]};
function app(){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='runs'?'10':'0',textContent:'',innerHTML:'',style:{},dataset:{},classList:{toggle(){},add(){},remove(){}},querySelectorAll:()=>[],click(){this.onclick?.()}});return nodes.get(id);};
 const ctx={document:{getElementById:node,querySelectorAll:()=>[],addEventListener(){},hidden:false},localStorage:{getItem(){return null;}},setTimeout(){return 0;},setInterval(){},clearTimeout(){},AbortController,console};ctx.window=ctx;ctx.addEventListener=()=>{};ctx.dispatchEvent=()=>{};
 vm.createContext(ctx);vm.runInContext(shared,ctx);vm.runInContext(main.match(/<script>\s*([\s\S]*?)<\/script>/)[1],ctx);
 ctx.calendar=structuredClone(calendar);vm.runInContext('fixtureCalendar=validateCalendar(calendar);updateNextFixture()',ctx);
 return {ctx,node,eval:s=>vm.runInContext(s,ctx)};
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
