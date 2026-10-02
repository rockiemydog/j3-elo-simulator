const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const shared=fs.readFileSync('shared-results.js','utf8');
const html={elo:fs.readFileSync('index.html','utf8'),progress:fs.readFileSync('progress-tracker/index.html','utf8')};
const scripts=name=>[...html[name].matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
for(const name of Object.keys(html))new vm.Script(scripts(name));
const values=new Map(),tabs=[];
function tab(name){
  const listeners={},nodes=new Map();
  function node(id){if(nodes.has(id))return nodes.get(id);const n={id,value:'',textContent:'',className:'',disabled:false,style:{},dataset:{},classList:{toggle(){},add(){},remove(){}},addEventListener(t,f){this[t]=f},querySelectorAll(){return[]},showModal(){this.open=true},close(){this.open=false},click(){(this.onclick||this.clickHandler)?.()},_html:''};Object.defineProperty(n,'innerHTML',{get(){return this._html},set(s){this._html=s;for(const m of s.matchAll(/<input[^>]*id="([^"]+)"[^>]*value="([^"]*)"/g))node(m[1]).value=m[2];}});nodes.set(id,n);return n;}
  const localStorage={getItem:k=>values.get(k)||null,setItem(k,v){values.set(k,String(v));for(const t of tabs)if(t!==ctx)t.fire('storage',{key:k});},removeItem(k){values.delete(k)}};
  const document={getElementById:node,querySelectorAll:()=>[],hidden:false,addEventListener(t,f){listeners['document:'+t]=f}};
  const ctx=vm.createContext({localStorage,document,confirm:()=>true,setTimeout:()=>0,console,Blob,URL,addEventListener(t,f){listeners[t]=f}});ctx.window=ctx;ctx.fire=(t,e={})=>listeners[t]?.(e);ctx.node=node;vm.runInContext(shared,ctx);vm.runInContext(scripts(name),ctx);tabs.push(ctx);return ctx;
}
const tracker=tab('progress');
assert.match(tracker.node('sync-status').textContent,/手入力の8試合.*試合結果側は7試合/);
const elo=tab('elo');
assert.equal(vm.runInContext('auditInitialData().ok',elo),true,'shared baseline remains identical to original audit');
assert.equal(vm.runInContext('J3Results.initialGames.length',elo),70);
function submit(h,a,hg,ag,mode='confirmed'){
  elo.node('home').value=h;elo.node('away').value=a;elo.node('hg').value=String(hg);elo.node('ag').value=String(ag);
  vm.runInContext(`setEntryMode('${mode}')`,elo);elo.node('submitGame').onclick();
}
submit('北九州','鹿児島',1,1);
assert.match(tracker.node('sync-status').textContent,/連動中：北九州 8試合・7点（1勝4分3敗）/);
assert.equal(vm.runInContext('activeStats.gf-activeStats.ga',tracker),-6);
assert.match(tracker.node('cards').innerHTML,/追加結果の日付は未登録/);
submit('北九州','高知',4,0,'scenario');
assert.equal(vm.runInContext('activeStats.played',tracker),8,'hypothetical result excluded');
submit('北九州','高知',4,0);
assert.equal(vm.runInContext('activeStats.played',tracker),9);
assert.equal(vm.runInContext('activeStats.points',tracker),10);
assert.equal(vm.runInContext('activeStats.gf-activeStats.ga',tracker),-2);
vm.runInContext('confirmedExtra.splice(1,1);save()',elo);
assert.equal(vm.runInContext('activeStats.played',tracker),8,'deletion updates tracker');
vm.runInContext("commitRows(parseRows('北九州,4,0,高知',10))",elo);
assert.equal(vm.runInContext('activeStats.points',tracker),10,'CSV/batch import updates tracker');
const reopened=tab('progress');assert.equal(vm.runInContext('activeStats.points',reopened),10,'reload uses saved results');
// A manual aggregate is preserved independently while switching modes.
tracker.node('confirm-main').clickHandler=tracker.node('confirm-main').click;
tracker.node('confirm-main').click(); // mock event handlers live on .click
tracker.node('save-confirm').click();
assert.equal(values.get('giravanz-j3-progress-source-v1'),'manual');
assert.equal(vm.runInContext('mainStats.played',tracker),8);
tracker.node('enable-sync').click();
assert.equal(vm.runInContext('activeStats.played',tracker),9);
assert.equal(JSON.parse(values.get('giravanz-j3-progress-confirmed-v1')).played,8,'manual backup retained');
elo.node('resetCurrent').onclick();
assert.equal(vm.runInContext('activeStats.played',tracker),7,'explicit reset updates linked stats');
assert.equal(vm.runInContext('activeStats.points',tracker),6);
// Malformed, duplicate, and old baseline rows must never inflate totals.
values.set('j3-elo-simulator-confirmed-v1',JSON.stringify([['北九州','鹿児島',1,1],['北九州','鹿児島',1,1],['相模原','北九州',1,2]]));
tracker.fire('storage',{key:'j3-elo-simulator-confirmed-v1'});
assert.equal(vm.runInContext('activeStats.played',tracker),8);
values.set('j3-elo-simulator-confirmed-v1','broken');tracker.fire('storage',{key:'j3-elo-simulator-confirmed-v1'});
assert.match(tracker.node('sync-status').textContent,/読み取れません/);
assert.equal(vm.runInContext('activeStats.played',tracker),8,'falls back to preserved manual data');
console.log('PASS: baseline, migration, registration, hypotheses, deletion, CSV, reload, manual backup, reset, duplicate/corrupt data, cross-tab updates');
