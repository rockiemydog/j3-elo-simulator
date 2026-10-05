const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const shared=fs.readFileSync('shared-results.js','utf8'),main=fs.readFileSync('index.html','utf8'),progress=fs.readFileSync('progress-tracker/index.html','utf8');
const values=new Map(),tabs=[],queue=[];
function tab(html){
 const events={},nodes=new Map();
 function node(id){if(!nodes.has(id))nodes.set(id,{value:id==='runs'?'20':'0',textContent:'',innerHTML:'',style:{},dataset:{},classList:{toggle(){},add(){},remove(){}},addEventListener(t,f){events[id+':'+t]=f},querySelectorAll(){return[]},close(){},showModal(){},click(){this.onclick?.()}});return nodes.get(id);}
 const ctx={document:{hidden:false,getElementById:node,querySelectorAll:()=>[],addEventListener(){}},localStorage:{getItem:k=>values.get(k)||null,setItem(k,v){values.set(k,String(v));for(const t of tabs)if(t!==ctx)queue.push(()=>t.fire('storage',{key:k}));}},confirm:()=>true,setTimeout:()=>0,setInterval:()=>0,clearTimeout(){},console,AbortController,Event:class{constructor(type){this.type=type}}};
 ctx.window=ctx;ctx.addEventListener=(t,f)=>events[t]=f;ctx.dispatchEvent=e=>events[e.type]?.(e);ctx.fire=(t,e)=>events[t]?.(e);ctx.node=node;
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
check('registration and deletion reach another open tracker',()=>{
 elo.node('home').value='北九州';elo.node('away').value='奈良';elo.node('hg').value='2';elo.node('ag').value='1';elo.node('confirm').onclick();flush();
 assert.equal(tracker.eval('activeStats.played'),10);assert.equal(tracker.eval('activeStats.points'),13);
 elo.eval('confirmedExtra=[];save()');flush();assert.equal(tracker.eval('activeStats.played'),9);assert.equal(tracker.eval('activeStats.points'),10);
});
const feed=JSON.parse(fs.readFileSync('official-results.json','utf8'));
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
 assert.equal(elo.eval('confirmed().length'),91);assert(elo.node('autoStatus').textContent.includes('保持'));
});
console.log(passed+' interface and integration checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
