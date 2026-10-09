const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const shared=fs.readFileSync('shared-results.js','utf8'),main=fs.readFileSync('index.html','utf8'),progress=fs.readFileSync('progress-tracker/index.html','utf8');
const values=new Map(),tabs=[],queue=[];
function tab(html){
 const events={},nodes=new Map(),renderTimers=[];
 function node(id){if(!nodes.has(id))nodes.set(id,{value:id==='runs'?'20':'0',textContent:'',innerHTML:'',style:{},dataset:{},classList:{toggle(){},add(){},remove(){}},addEventListener(t,f){events[id+':'+t]=f},querySelectorAll(){return[]},close(){},showModal(){},click(){this.onclick?.()}});return nodes.get(id);}
 const ctx={document:{hidden:false,getElementById:node,querySelectorAll:()=>[],addEventListener(){}},localStorage:{getItem:k=>values.get(k)||null,setItem(k,v){values.set(k,String(v));for(const t of tabs)if(t!==ctx)queue.push(()=>t.fire('storage',{key:k}));}},confirm:()=>true,setTimeout:(f,ms)=>{if(ms===20)renderTimers.push(f);return 0},setInterval:()=>0,clearTimeout(){},console,AbortController,Event:class{constructor(type){this.type=type}}};
 ctx.window=ctx;ctx.addEventListener=(t,f)=>events[t]=f;ctx.dispatchEvent=e=>events[e.type]?.(e);ctx.fire=(t,e)=>events[t]?.(e);ctx.node=node;
 ctx.flushRender=()=>{while(renderTimers.length)renderTimers.shift()();};
 vm.createContext(ctx);vm.runInContext(shared,ctx);vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],ctx);ctx.eval=s=>vm.runInContext(s,ctx);tabs.push(ctx);return ctx;
}
function flush(){while(queue.length)queue.shift()();}
let passed=0;function check(name,fn){fn();passed++;console.log('PASS '+name);}
(async()=>{
const tracker=tab(progress),elo=tab(main);flush();
check('selectors and probabilities outside collapsed details',()=>{
 const stack=[];let count=0;for(const m of main.matchAll(/<\/?details\b[^>]*>|<(?:select|div)\b[^>]*\bid="(home|away|prematch)"[^>]*>/g)){
 if(m[0].startsWith('</details'))stack.pop();else if(m[0].startsWith('<details'))stack.push(m[0]);else {count++;assert.equal(stack.length,0,m[1]+' hidden');}
 }assert.equal(count,3);assert(main.includes('対戦カードの勝敗確率'));
});
check('380 probability sets finite and sum to 100',()=>{
 assert(elo.eval('teams.every(h=>teams.every(a=>{if(h===a)return prematchForecast(h,a)===null;const p=prematchForecast(h,a),v=[p.home,p.draw,p.away];return v.every(x=>Number.isFinite(x)&&x>=0&&x<=100)&&Math.abs(v.reduce((s,x)=>s+x,0)-100)<1e-10}))'));
});
check('selection updates probability without registration',()=>{
 const saved=values.get('j3-elo-simulator-confirmed-v1');elo.node('away').value='愛媛';elo.node('away').onchange();
 assert(elo.node('prematch').innerHTML.includes('北九州 vs 愛媛'));assert.equal(elo.eval('confirmed().length'),90);assert.equal(values.get('j3-elo-simulator-confirmed-v1'),saved);
 elo.node('away').value='北九州';elo.node('away').onchange();assert(elo.node('prematch').innerHTML.includes('異なるクラブ'));assert(elo.node('submitGame').disabled);
});
check('trial changes simulator only, supports edits and reset',()=>{
 const saved=values.get('j3-elo-simulator-confirmed-v1');
 elo.node('home').value='北九州';elo.node('away').value='奈良';elo.node('hg').value='2';elo.node('ag').value='1';elo.node('submitGame').onclick();flush();
 assert.equal(elo.eval('scenarios.length'),1);assert.equal(elo.eval('stateWithScenario().pts[ix["北九州"]]'),13);
 assert.equal(tracker.eval('activeStats.played'),9);assert.equal(tracker.eval('activeStats.points'),10);assert.equal(values.get('j3-elo-simulator-confirmed-v1'),saved);
 elo.node('hg').value='0';elo.node('ag').value='0';elo.node('submitGame').onclick();
 assert.equal(elo.eval('scenarios.length'),1);assert.equal(elo.eval('stateWithScenario().pts[ix["北九州"]]'),11);
 elo.node('resetScenario').onclick();assert.equal(elo.eval('scenarios.length'),0);assert.equal(elo.eval('stateWithScenario().pts[ix["北九州"]]'),10);
});
check('manual controls removed and trial input always visible',()=>{
 for(const id of ['modeConfirmed','modeScenario','confirm','batch','batchAdd','resetCurrent','importCsv'])assert(!main.includes('id="'+id+'"'));
 const trial=main.indexOf('id="trialInput"');assert(trial>0);assert(!main.slice(0,trial).match(/<details[^>]*>(?:(?!<\/details>)[\s\S])*$/));
 elo.node('home').value='北九州';elo.node('away').value='高知';elo.node('away').onchange();assert(elo.node('submitGame').disabled);assert(elo.node('hg').disabled);
 const count=elo.eval('scenarios.length');elo.node('submitGame').onclick();assert.equal(elo.eval('scenarios.length'),count);
 elo.node('away').value='奈良';elo.node('away').onchange();assert(!elo.node('submitGame').disabled);assert(!elo.node('hg').disabled);
});
const feed=JSON.parse(fs.readFileSync('official-results.json','utf8'));
feed.matches=feed.matches.filter(r=>r.date<='2026-10-04');
feed.matches.push({id:'2026101101',date:'2026-10-11',game:['北九州','奈良',2,1]});feed.asOfDate='2026-10-11';
elo.eval("scenarios=[['北九州','奈良',3,0],['北九州','愛媛',1,0]]");
elo.fetch=async()=>({ok:true,json:async()=>feed});
await elo.eval('syncAutomaticResults(true)');
check('automatic actual result replaces matching hypothesis once',()=>{
 assert.equal(elo.eval('confirmed().length'),91);assert.equal(elo.eval('scenarios.length'),1);
 assert.equal(elo.eval('scenarios[0][1]'),'愛媛');assert.equal(elo.eval('stateWithScenario().p[ix["北九州"]]'),11);assert.equal(elo.eval('J3Results.clubStats().stats.played'),10);
});
elo.fetch=async()=>{throw Error('offline')};await elo.eval('syncAutomaticResults(true)');
check('network failure retains last good results',()=>{
 assert.equal(elo.eval('confirmed().length'),91);assert(elo.node('autoStatus').textContent.includes('保持'));assert.equal(elo.node('verification').dataset.verified,'false');
});
tracker.fetch=async()=>({ok:true,json:async()=>feed});await tracker.eval('syncAutomaticResults(true)');
check('tracker fetch independently verifies new actual result and trial invalidates completion',()=>{
 assert.equal(tracker.eval('activeStats.points'),13);assert.equal(tracker.node('verification').dataset.verified,'true');
 assert.equal(tracker.eval('J3Results.resultId()'),elo.eval('J3Results.resultId()'));
 tracker.eval("showResults({...activeStats,points:16,wins:4,played:11},'test')");assert.equal(tracker.node('verification').dataset.verified,'false');
 tracker.fetch=async()=>{throw Error('offline')};
});
await tracker.eval('syncAutomaticResults(true)');
check('tracker failure never reports verified even when previous result is retained',()=>{assert.equal(tracker.node('verification').dataset.verified,'false');assert.equal(tracker.eval('J3Results.clubStats().stats.points'),13);});
const published=JSON.parse(fs.readFileSync('official-results.json','utf8'));
values.clear(); // A fresh session without the previous checks' saved trial inputs.
const currentMain=tab(main),currentTracker=tab(progress);
for(const t of [currentMain,currentTracker])t.fetch=async()=>({ok:true,json:async()=>published});
await currentMain.eval('syncAutomaticResults(true)');await currentTracker.eval('syncAutomaticResults(true)');
currentMain.flushRender();
check('latest feed reaches both pages with identical result IDs and no duplicate matches',()=>{
 assert.equal(currentMain.eval('confirmed().length'),published.matches.length);
 assert.equal(currentMain.eval('J3Results.resultId()'),currentTracker.eval('J3Results.resultId()'));
 assert.equal(currentMain.node('verification').dataset.verified,'true');
 assert.equal(currentTracker.node('verification').dataset.verified,'true');
});
check('all club standings equal an independent tally of the latest feed',()=>{
 const expected=new Map();
 for(const {game:[h,a,hg,ag]} of published.matches){
  for(const [team,gf,ga] of [[h,hg,ag],[a,ag,hg]]){
   if(!expected.has(team))expected.set(team,{played:0,points:0,wins:0,draws:0,losses:0,gf:0,ga:0});
   const s=expected.get(team);s.played++;s.gf+=gf;s.ga+=ga;
   if(gf>ga){s.wins++;s.points+=3;}else if(gf===ga){s.draws++;s.points++;}else s.losses++;
  }
 }
 for(const [team,s] of expected){
  const actual=currentMain.eval('J3Results.clubStats('+JSON.stringify(team)+').stats');
  for(const k of Object.keys(s))assert.equal(actual[k],s[k],team+' '+k);
  assert.equal(currentMain.eval('stateWithScenario().pts[ix['+JSON.stringify(team)+']]'),s.points);
 }
 for(const k of Object.keys(expected.get('北九州')))assert.equal(currentTracker.eval('activeStats.'+k),expected.get('北九州')[k]);
});
check('verification distinguishes result update time from page retrieval time',()=>{
 for(const t of [currentMain,currentTracker]){
  const text=t.node('verification').textContent;
  assert(text.includes('保存済み公式データ'));assert(text.includes('結果データ更新：'));assert(text.includes('画面取得：'));assert(text.includes('公式サイトの確認時刻ではありません'));
 }
 assert(!currentMain.node('autoStatus').textContent.includes('約30分'));
});
for(const t of [currentMain,currentTracker]){t.fetch=async()=>{throw Error('offline')};await t.eval('syncAutomaticResults(true)');}
check('latest results survive failure and recover without inflating standings',()=>{
 for(const t of [currentMain,currentTracker])assert.equal(t.eval('J3Results.initialGames.length'),published.matches.length);
});
for(const t of [currentMain,currentTracker]){t.fetch=async()=>({ok:true,json:async()=>published});await t.eval('syncAutomaticResults(true)');}
check('retry restores verified state for both pages with unchanged results',()=>{
 for(const t of [currentMain,currentTracker])assert.equal(t.node('verification').dataset.verified,'true');
 assert.equal(currentMain.eval('confirmed().length'),published.matches.length);
 assert.equal(currentMain.eval('J3Results.resultId()'),currentTracker.eval('J3Results.resultId()'));
});
console.log(passed+' interface and integration checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
