const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const api=require('../team-stats/team-stats.js'),published=JSON.parse(fs.readFileSync('team-stats.json','utf8'));
const expanded=api.comparisonData(published);
const sample=()=>JSON.parse(JSON.stringify(published));
test('all sixteen metrics match twenty clubs and independently recomputed ranks',()=>{const d=api.validate(sample());assert.equal(d.metrics.length,16);for(const metric of d.metrics){const rows=d.league[metric.key],own=rows.find(r=>r.club==='北九州');assert.equal(rows.length,20);assert.equal(metric.rank,1+rows.filter(r=>api.LOWER.includes(metric.key)?r.value<own.value:r.value>own.value).length);assert.equal(metric.value,own.value);}});
test('zero official values are valid; missing, partial and impossible stats rejected',()=>{for(const value of [null,-1,'0',NaN,Infinity]){const d=sample();d.metrics[0].value=value;assert.throws(()=>api.validate(d));}const partial=sample();partial.league.scorePg.pop();assert.throws(()=>api.validate(partial));const wrong=sample();wrong.metrics[0].rank=99;assert.throws(()=>api.validate(wrong));const z=sample();z.league.scorePg.forEach(r=>{r.value=0;r.rank=1;r.tied=true;});Object.assign(z.metrics.find(m=>m.key==='scorePg'),{value:0,rank:1,tied:true});assert.doesNotThrow(()=>api.validate(z));assert(!/NaN|Infinity/.test(api.clubSVG(z,'scorePg')));});
test('duplicate clubs and wrong season or future timestamps never validate',()=>{const d=sample();d.league.scorePg[0].club=d.league.scorePg[1].club;assert.throws(()=>api.validate(d));const s=sample();s.season='2026特別';assert.throws(()=>api.validate(s));const f=sample();f.checkedAt='2099-01-01T00:00:00Z';assert.throws(()=>api.validate(f));});
test('rank graphs cover every category and explicitly label lower-is-better',()=>{const svg=api.rankSVG(published);assert.equal((svg.match(/<circle/g)||[]).length,16);assert.match(svg,/1位/);assert.match(svg,/20位/);assert.match(svg,/同率/);assert.match(svg,/平均失点 ↓/);for(const g of Object.values(api.GROUPS)){assert.equal((api.rankSVG(expanded,g.keys).match(/<circle/g)||[]).length,g.keys.length);}});
test('all club graphs show twenty bars with Kitakyushu highlighted and numeric values',()=>{for(const key of Object.keys(api.META)){const svg=api.clubSVG(expanded,key);assert.equal((svg.match(/<rect/g)||[]).length,20);assert.equal((svg.match(/fill="#e5ac00"/g)||[]).length,1);assert(!/NaN|undefined|Infinity/.test(svg));assert.match(svg,/北九州/);}});
test('new tab navigation and attribution do not connect trial or forecast data',()=>{const html=fs.readFileSync('team-stats/index.html','utf8'),main=fs.readFileSync('index.html','utf8');assert.match(main,/id="openTeamStats"[^>]*target="_blank"[^>]*rel="noopener"/);assert.match(html,/同じ公表値は同順位/);assert.match(html,/確認日時は公式スタッツ自体の更新日時とは異なります/);assert(!html.includes('shared-results.js'));});
test('new rates independently reconcile to official match logs for all twenty clubs',()=>{for(const club of api.CLUBS){const games=published.matchLogs[club],n=games.length,sum=k=>games.reduce((a,g)=>a+g[k],0);const opponentShots=games.reduce((a,g)=>a+published.matchLogs[g.opponent].find(o=>o.id===g.id).shots,0);const expected={shotsAgainstTotal:opponentShots,shotsPg:sum('shots')/n,shotConversion:sum('gf')/sum('shots')*100,concededPg:sum('ga')/n,shotsAgainstPg:opponentShots/n,ckPg:sum('ck')/n,cleanSheetRate:games.filter(g=>g.ga===0).length/n*100};for(const [key,value]of Object.entries(expected))assert(Math.abs(published.league[key].find(r=>r.club===club).value-value)<1e-9);}});
test('broken denominators, counterpart records and derived values never validate',()=>{for(const mutate of [d=>d.matchLogs['北九州'].pop(),d=>d.samples['北九州'].played++,d=>d.league.shotsPg[0].value++,d=>d.matchLogs['北九州'][0].gf++,d=>delete d.samples]){const d=sample();mutate(d);assert.throws(()=>api.validate(d));}});
test('stats HTML invalidates browser cache whenever the client script changes',()=>{const html=fs.readFileSync('team-stats/index.html','utf8'),hash=require('node:crypto').createHash('sha256').update(fs.readFileSync('team-stats/team-stats.js')).digest('hex').slice(0,12);assert(html.includes('src="team-stats.js?v='+hash+'"'));});
test('xG, xGA and chance creation equal the complete official detail snapshots',()=>{for(const key of ['expectedGoals','expectedGoalsAgainst','chancesCreated']){const source=published.detailSources[key];assert.equal(source.season,'2026/27');assert.equal(source.values.length,20);for(const row of published.league[key])assert.equal(row.value,source.values.find(r=>r.club===row.club).value);}assert(api.LOWER.includes('expectedGoalsAgainst'));assert(api.LOWER.includes('shotsAgainstTotal'));assert(!api.LOWER.includes('expectedGoals'));});
test('partial, wrong-season, mismatched or future detailed sources never validate',()=>{for(const mutate of [d=>d.detailSources.expectedGoals.values.pop(),d=>d.detailSources.expectedGoals.season='2025',d=>d.detailSources.expectedGoals.source='https://example.com',d=>d.detailSources.expectedGoals.values[0].value++,d=>d.detailSources.expectedGoals.updatedAt='2099-01-01',d=>d.detailSources.expectedGoals.values[0].club=d.detailSources.expectedGoals.values[1].club]){const d=sample();mutate(d);assert.throws(()=>api.validate(d));}});

test('24 comparison metrics independently reconcile for every club without changing source payload',()=>{
 assert.equal(published.metrics.length,16);assert.equal(expanded.metrics.length,24);
 for(const club of api.CLUBS){const games=published.matchLogs[club],n=games.length,count=fn=>games.filter(fn).length,sum=k=>games.reduce((a,g)=>a+g[k],0),opponentSum=k=>games.reduce((a,g)=>a+published.matchLogs[g.opponent].find(o=>o.id===g.id)[k],0);
 const expected={scoringRate:count(g=>g.gf>0)/n*100,multiGoalRate:count(g=>g.gf>=2)/n*100,shotsShare:sum('shots')/(sum('shots')+opponentSum('shots'))*100,concededConversion:sum('ga')/opponentSum('shots')*100,ckAgainstPg:opponentSum('ck')/n,pointsPg:(count(g=>g.gf>g.ga)*3+count(g=>g.gf===g.ga))/n,winRate:count(g=>g.gf>g.ga)/n*100,lossRate:count(g=>g.gf<g.ga)/n*100};
 for(const [key,value]of Object.entries(expected)){const rows=expanded.league[key],r=rows.find(r=>r.club===club);assert(Math.abs(r.value-value)<1e-9);assert.equal(r.rank,1+rows.filter(o=>api.LOWER.includes(key)?o.value<r.value:o.value>r.value).length);}
 }
});
test('all comparison options remain available regardless of summary category',()=>{
 const options=api.metricOptions();assert.equal((options.match(/<option /g)||[]).length,24);
 const keys=Object.values(api.GROUPS).flatMap(g=>g.keys);assert.equal(new Set(keys).size,24);
 for(const key of keys)assert(options.includes('value="'+key+'"'));
});
test('opponent comparison shares all definitions and full validation, with versioned scripts',()=>{
 const html=fs.readFileSync('team-stats/index.html','utf8'),js=fs.readFileSync('team-stats/next-opponent.js','utf8');
 assert(js.includes('root.J3TeamStats.comparisonData(data)'));assert(js.includes('{META,GROUPS,LOWER}=root.J3TeamStats'));
 const hash=require('node:crypto').createHash('sha256').update(js).digest('hex').slice(0,12);assert(html.includes('next-opponent.js?v='+hash));
});
test('category switching preserves all 24 comparison choices and cached data survives offline refresh',async()=>{
 const vm=require('node:vm'),nodes=new Map(),buttons=Object.keys(api.GROUPS).map(group=>({dataset:{group},setAttribute(){}}));
 function node(id){if(!nodes.has(id)){let html='';const n={value:'',textContent:'',disabled:false,href:''};Object.defineProperty(n,'innerHTML',{get:()=>html,set:v=>{html=v;if(id==='metric')n.value=v.match(/value="([^"]+)"/)?.[1]||'';}});nodes.set(id,n);}return nodes.get(id);}
 const ctx={document:{getElementById:node,querySelectorAll:()=>buttons,addEventListener(){},hidden:false},localStorage:{getItem:()=>JSON.stringify(published)},fetch:async()=>{throw Error('offline');},AbortController,setTimeout:()=>0,clearTimeout(){},setInterval(){}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('team-stats/team-stats.js','utf8'),ctx);
 assert.match(node('status').textContent,/24項目/);assert.equal((node('cards').innerHTML.match(/class="card"/g)||[]).length,9);
 node('metric').value='winRate';node('metric').onchange();assert.match(node('metricHelp').textContent,/勝利数 ÷ 消化試合数/);assert.equal((node('clubChart').innerHTML.match(/<rect/g)||[]).length,20);
 for(const b of buttons){b.onclick();assert.equal(node('metric').value,'winRate');assert.equal((node('metric').innerHTML.match(/<option /g)||[]).length,24);}
 await new Promise(resolve=>setImmediate(resolve));assert.match(node('failure').textContent,/前回のデータを保持/);assert.match(node('clubChart').innerHTML,/北九州/);
});
test('next opponent renders all 24 metrics with units, league means and failure recovery',async()=>{
 const vm=require('node:vm'),nodes=new Map(),calendar=JSON.parse(fs.readFileSync('official-schedule.json','utf8'));let offline=false;
 const element=()=>({children:[],style:{},textContent:'',className:'',append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},addEventListener(name,fn){this[name]=fn;}});
 const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 const ctx={J3TeamStats:api,document:{getElementById:node,createElement:element,addEventListener(){},hidden:false},AbortController,setTimeout:()=>0,clearTimeout(){},setInterval(){},fetch:async url=>{if(offline)throw Error('offline');return {ok:true,json:async()=>url.includes('official-schedule')?calendar:published};}};ctx.window=ctx;
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('team-stats/next-opponent.js','utf8'),ctx);await new Promise(resolve=>setImmediate(resolve));
 const cards=node('officialCompare').children.filter(n=>n.className==='official-compare-card');assert.equal(cards.length,24);assert.equal(node('officialCompareError').textContent,'');
 for(const card of cards){assert.equal(card.children.filter(n=>n.className==='official-compare-row').length,3);assert.match(card.children[0].textContent,/（.+）/);}
 offline=true;await node('officialCompareRefresh').click();assert.match(node('officialCompareError').textContent,/前回の比較を保持/);
 assert.equal(node('officialCompare').children.filter(n=>n.className==='official-compare-card').length,24);
});
function opponentHarness(respond){
 const vm=require('node:vm'),nodes=new Map(),requests=[];
 const element=()=>({children:[],style:{},textContent:'',className:'',append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},addEventListener(name,fn){this[name]=fn;}});
 const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 const ctx={J3TeamStats:api,document:{getElementById:node,createElement:element,addEventListener(){},hidden:false},AbortController,setTimeout:()=>0,clearTimeout(){},setInterval(){},fetch:async url=>{requests.push(url);const data=await respond(url);return {ok:true,json:async()=>structuredClone(data)};}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('team-stats/next-opponent.js','utf8'),ctx);
 return {node,requests,ready:()=>new Promise(resolve=>setImmediate(resolve)),refresh:()=>node('officialCompareRefresh').click()};
}
const fixtureSample=()=>JSON.parse(fs.readFileSync('official-schedule.json','utf8'));
test('comparison prioritizes latest published source and validates fallback before displaying',async()=>{
 const a=opponentHarness(url=>url.includes('official-schedule')?fixtureSample():url.startsWith('https:')?{...sample(),season:'2025'}:sample());await a.ready();
 assert(a.requests[0].startsWith('https://raw.githubusercontent.com/'));assert(a.requests.some(u=>u.startsWith('../team-stats.json')));
 assert.equal(a.node('officialCompareError').textContent,'');assert.equal(a.node('officialCompare').children.filter(n=>n.className==='official-compare-card').length,24);
});
test('invalid dates, same-club fixtures and calendar regression retain the last complete comparison',async()=>{
 let calendar=fixtureSample();const a=opponentHarness(url=>url.includes('official-schedule')?calendar:sample());await a.ready();const original=a.node('officialCompareStatus').textContent;
 for(const mutation of ['date','sameClub','older']){calendar=fixtureSample();if(mutation==='date'){calendar.matches[0].date='2026-09-31';calendar.matches[0].id='2026093199';}if(mutation==='sameClub')calendar.matches[0].away=calendar.matches[0].home;if(mutation==='older')calendar.checkedAt=new Date(Date.parse(calendar.checkedAt)-1000).toISOString();await a.refresh();assert.match(a.node('officialCompareError').textContent,/前回の比較を保持/);assert.equal(a.node('officialCompareStatus').textContent,original);}
});
test('failed stats refresh cannot partially commit a newer calendar',async()=>{
 let fail=false,calendar=fixtureSample();const originalCalendar=structuredClone(calendar);
 const a=opponentHarness(url=>{if(url.includes('official-schedule'))return calendar;if(fail)throw Error('offline stats');return sample();});await a.ready();
 calendar.checkedAt=new Date(Date.parse(calendar.checkedAt)+1000).toISOString();fail=true;await a.refresh();assert.match(a.node('officialCompareError').textContent,/前回の比較を保持/);
 calendar=originalCalendar;fail=false;await a.refresh();assert.equal(a.node('officialCompareError').textContent,'');
});
test('newer retrieval timestamp cannot roll back known match coverage or official detail freshness',()=>{
 for(const mutate of [d=>d.matchLogs['北九州'].pop(),d=>d.detailSources.expectedGoals.updatedAt='2026-08-08T00:00:00+09:00']){const d=sample();d.checkedAt=new Date(Date.parse(d.checkedAt)+1000).toISOString();mutate(d);assert.throws(()=>api.checkProgress(expanded,d));}
 assert.doesNotThrow(()=>api.checkProgress(expanded,sample()));
});
