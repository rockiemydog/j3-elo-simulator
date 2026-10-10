/* Shared confirmed results. Hypothetical results are deliberately excluded. */
(function (global) {
'use strict';
const teams=['岐阜','愛媛','鹿児島','相模原','鳥取','FC大阪','長野','滋賀','熊本','栃木SC','琉球','讃岐','山口','奈良','高知','北九州','松本','金沢','群馬','福島'];
const completed=[['岐阜','栃木SC',4,1],['岐阜','高知',7,0],['鹿児島','岐阜',0,0],['滋賀','岐阜',0,3],['愛媛','鳥取',4,0],['愛媛','奈良',4,1],['松本','愛媛',2,2],['金沢','愛媛',0,1],['鹿児島','群馬',1,0],['讃岐','鹿児島',3,4],['奈良','鹿児島',1,3],['相模原','熊本',0,0],['相模原','金沢',2,1],['琉球','相模原',2,1],['群馬','相模原',1,4],['鳥取','FC大阪',1,1],['鳥取','福島',2,1],['滋賀','鳥取',0,1],['FC大阪','長野',4,2],['FC大阪','琉球',2,2],['山口','FC大阪',0,0],['長野','山口',1,0],['長野','群馬',1,2],['熊本','長野',0,1],['松本','滋賀',2,3],['群馬','滋賀',2,3],['熊本','栃木SC',0,0],['高知','熊本',0,2],['栃木SC','北九州',2,2],['栃木SC','金沢',3,2],['山口','琉球',1,0],['高知','讃岐',2,1],['北九州','讃岐',0,0],['福島','讃岐',1,2],['奈良','山口',3,1],['福島','奈良',2,2],['高知','松本',0,0],['北九州','松本',1,1],['金沢','福島',4,3]];
completed.push(...[['相模原','長野',1,1],['松本','FC大阪',0,0],['熊本','奈良',2,2],['岐阜','金沢',0,1],['讃岐','滋賀',0,3],['栃木SC','高知',2,0],['群馬','福島',1,3],['鳥取','山口',0,3],['愛媛','北九州',4,2],['鹿児島','琉球',2,1],['琉球','北九州',3,0],['福島','熊本',1,2],['奈良','岐阜',2,1],['松本','相模原',1,3],['琉球','讃岐',1,0],['FC大阪','愛媛',2,1],['北九州','鳥取',2,4],['山口','群馬',2,0],['滋賀','鹿児島',1,2],['長野','栃木SC',1,1],['高知','金沢',1,1]]);
const groupedCompleted=completed.slice();
const chronologicalIndexes=[0,4,8,11,18,24,31,34,38,1,5,9,12,16,19,21,25,26,37,2,6,13,17,20,22,27,29,32,35,3,7,10,14,15,23,28,30,33,36,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59];
completed.splice(0,completed.length,...chronologicalIndexes.map(i=>groupedCompleted[i]),['FC大阪','福島',4,1],['熊本','松本',0,0],['愛媛','讃岐',2,1],['群馬','高知',1,0],['鳥取','奈良',2,3],['鹿児島','栃木SC',3,1],['金沢','山口',1,2],['相模原','北九州',1,2],['長野','岐阜',1,0],['滋賀','琉球',3,0]);

completed.push(...[["山口", "相模原", 2, 2], ["金沢", "鳥取", 4, 1], ["奈良", "滋賀", 4, 1], ["福島", "長野", 4, 3], ["栃木SC", "松本", 1, 2], ["群馬", "熊本", 0, 1], ["讃岐", "岐阜", 3, 4], ["高知", "FC大阪", 0, 4], ["琉球", "愛媛", 1, 1], ["北九州", "鹿児島", 1, 1], ["滋賀", "熊本", 0, 0], ["松本", "鳥取", 0, 1], ["長野", "奈良", 0, 1], ["岐阜", "山口", 0, 2], ["琉球", "金沢", 0, 2], ["愛媛", "群馬", 3, 1], ["讃岐", "栃木SC", 0, 0], ["鹿児島", "福島", 3, 2], ["相模原", "FC大阪", 1, 0], ["北九州", "高知", 2, 0]]);

const storeKey='j3-elo-simulator-confirmed-v1';
const backupKey=storeKey+'-last-good';
const feedKey='j3-official-feed-v1';
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
let baseDate='2026-10-04';
const key=g=>g[0]+'|'+g[1];
const valid=g=>Array.isArray(g)&&g.length===4&&teams.includes(g[0])&&teams.includes(g[1])&&g[0]!==g[1]&&g.slice(2).every(x=>Number.isInteger(x)&&x>=0&&x<=30);
function readConfirmed() {
  // Legacy manual data stays on disk for recovery, but never enters official totals.
  return {games:completed.map(g=>g.slice()),available:true,rejected:0,recovered:false,extras:[],extraCount:0};
}
function clubStats(club='北九州') {
  const data=readConfirmed(), s={asofDate:baseDate,played:0,points:0,wins:0,draws:0,losses:0,gf:0,ga:0};
  for(const [h,a,hg,ag] of data.games) {
    if(h!==club&&a!==club) continue;
    const gf=h===club?hg:ag, ga=h===club?ag:hg;
    s.played++;s.gf+=gf;s.ga+=ga;
    if(gf>ga)s.wins++;else if(gf===ga)s.draws++;else s.losses++;
  }
  s.points=3*s.wins+s.draws;
  return {...data,stats:s};
}
// Compact result identifier for comparing email and each device (not a security hash).
function resultId(games=completed){
  const text=games.map(g=>g.join('|')).sort().join('\n');let hash=2166136261;
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619)>>>0;
  return hash.toString(16).padStart(8,'0');
}
function verification(displayed,eligible=true){
  const official={played:0,points:0,wins:0,draws:0,losses:0,gf:0,ga:0};
  for(const [h,a,hg,ag] of completed){if(h!=='北九州'&&a!=='北九州')continue;const gf=h==='北九州'?hg:ag,ga=h==='北九州'?ag:hg;official.played++;official.gf+=gf;official.ga+=ga;if(gf>ga)official.wins++;else if(gf===ga)official.draws++;else official.losses++;}
  official.points=3*official.wins+official.draws;
  const matches=eligible&&displayed&&Object.keys(official).every(k=>displayed[k]===official[k]);
  const ready=feedState.state==='ready',ok=ready&&matches;
  const label=ok?'保存済み公式データと画面集計の一致を確認':!ready?'保存済み公式データの取得未確認': '公式データとの一致は未確認（試し入力・手入力・旧保存値を確認）';
  const checked=feedState.checkedAt?new Date(feedState.checkedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'未取得';
  const updated=feedState.updatedAt?new Date(feedState.updatedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'未確認';
  const sourceChecked=feedState.officialCheckedAt?new Date(feedState.officialCheckedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'未確認';
  return {ok,id:resultId(),text:`${label}\n結果ID：${resultId()} ／ 対象日：${baseDate} ／ リーグ確定${completed.length}試合\n公式集計：北九州 ${official.played}試合・勝点${official.points}（${official.wins}勝${official.draws}分${official.losses}敗）\n結果データ更新：${updated} 日本時間\n公式サイト確認：${sourceChecked} 日本時間\n画面取得：${checked} 日本時間（公式サイトの確認時刻ではありません）\nメールと両画面の結果IDが一致するか確認してください。`};
}
const apiBase=typeof global.J3OfficialApi?.baseUrl==='string'&&/^https:\/\/[a-z0-9.-]+\.chatgpt\.site$/.test(global.J3OfficialApi.baseUrl)?global.J3OfficialApi.baseUrl:null;
let feedState={state:'idle',asOfDate:baseDate,count:completed.length},fetching=null,lastFetch=0;
function statusText(verified=false){
 const s=feedState;
 if(s.state==='refreshing')return apiBase?'公式サイトの終了試合を取得・検証しています…':'保存済み結果を読み込んでいます…';
 if(s.state==='unavailable')return '公式結果を更新できませんでした。直前の正常な結果を保持しています。時間をおいて再確認してください。';
 if(s.state==='cached')return `この端末の保存済み結果：${s.asOfDate}まで・確定${s.count}試合。今回の通信確認はまだ完了していません。`;
 if(s.state!=='ready')return '公式結果を確認中です。';
 const base=`${s.asOfDate}まで・確定${s.count}試合。`;
 if(s.refreshStatus==='busy')return `別の更新が進行中です。${s.retryAfter}秒後に再確認してください。保存済み結果：${base}`;
 if(s.refreshStatus==='cooldown')return `直前に取得を実行済みです。${s.retryAfter}秒後に再確認できます。保存済み結果：${base}`;
 if(s.refreshStatus==='fallback')return `公式更新サービスに接続できません。保存済み公式結果を表示：${base}`;
 if(apiBase&&['updated','unchanged'].includes(s.refreshStatus))return `${verified?'反映確認完了':'取得・保存完了（画面集計の一致は未確認）'}：${base}追加${s.added}試合・訂正${s.corrected}試合。${s.refreshStatus==='unchanged'?'公式サイトを確認しましたが、結果の変更はありません。':''}`;
 return `保存済み公式結果：${base}画面は表示中、約5分ごとに確認します。${apiBase?'公式データが古い場合は再取得します。':'公式データの収集が遅れると、新しい結果の反映も遅れます。'}`;
}
function applyOfficialFeed(feed,persist=true){
  if(!feed||feed.verified!==true||feed.schemaVersion!==1||feed.season!=='2026/27'||!Array.isArray(feed.matches)||feed.matches.length<completed.length||feed.matches.length>380)throw new Error('Invalid official feed');
  if(!validDate(feed.asOfDate)||feed.asOfDate<'2026-08-08'||feed.asOfDate>'2027-07-31'||!Number.isFinite(Date.parse(feed.updatedAt)))throw new Error('Invalid official date');
  if(feedState.updatedAt&&Date.parse(feed.updatedAt)<Date.parse(feedState.updatedAt))throw new Error('Stale official feed');
  const rows=feed.matches.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id).localeCompare(String(b.id))),seen=new Set(),ids=new Set(),counts=new Map(teams.map(t=>[t,0]));
  for(const r of rows){
    if(!valid(r.game)||!validDate(r.date)||r.date<'2026-08-08'||r.date>feed.asOfDate||!/^\d{10}$/.test(r.id)||r.id.slice(0,8)!==r.date.replaceAll('-','')||ids.has(r.id)||seen.has(key(r.game)))throw new Error('Invalid official match');
    seen.add(key(r.game));ids.add(r.id);for(const t of r.game.slice(0,2)){counts.set(t,counts.get(t)+1);if(counts.get(t)>38)throw new Error('Invalid official club count');}
  }
  if(rows.at(-1).date!==feed.asOfDate)throw new Error('Feed date does not match fixtures');
  if(completed.some(g=>!seen.has(key(g))))throw new Error('Incomplete official feed');
  const games=rows.map(r=>r.game.slice()),changed=JSON.stringify(games)!==JSON.stringify(completed);
  if(changed)completed.splice(0,completed.length,...games);
  baseDate=feed.asOfDate;feedState={state:'ready',asOfDate:baseDate,count:completed.length,updatedAt:feed.updatedAt,officialCheckedAt:feed.officialCheckedAt,checkedAt:new Date().toISOString()};
  if(persist)try{global.localStorage?.setItem(feedKey,JSON.stringify(feed));}catch{}
  return changed;
}
function restoreCachedFeed(){
 try{const raw=global.localStorage?.getItem(feedKey);if(!raw||raw.length>300000)return false;const feed=JSON.parse(raw);if(feedState.updatedAt&&Date.parse(feed.updatedAt)<=Date.parse(feedState.updatedAt))return false;const changed=applyOfficialFeed(feed,false);feedState={...feedState,state:'cached',checkedAt:null};return changed;}catch{return false;}
}
restoreCachedFeed();
async function refreshOfficial(force=false){
  if(fetching)return fetching;
  if(!force&&Date.now()-lastFetch<60000)return false;
  if(typeof global.fetch!=='function')return false;
  lastFetch=Date.now();
  feedState={...feedState,state:'refreshing'};
  fetching=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),apiBase?65000:12000);
    try{
      const url=apiBase?apiBase+(force?'/api/refresh':'/api/results'):'https://raw.githubusercontent.com/rockiemydog/j3-elo-simulator/main/official-results.json?t='+Date.now();
      const options={cache:'no-store',signal:controller.signal,credentials:'omit'};
      if(apiBase&&force){options.method='POST';options.headers={'Content-Type':'application/json'};options.body='{}';}
      const response=await global.fetch(url,options),body=await response.json();
      if(!apiBase){if(!response.ok)throw new Error('Feed download failed');return applyOfficialFeed(body);}
      if(!response.ok&&![409,429].includes(response.status))throw new Error('Official update failed');
      if(!['ready','updated','unchanged','busy','cooldown'].includes(body.status)||!body.feed?.verified||body.resultId!==resultId(body.feed.matches.map(r=>r.game)))throw new Error('Invalid update response');
      if(['updated','unchanged','ready'].includes(body.status)&&!Number.isFinite(Date.parse(body.feed.officialCheckedAt)))throw new Error('Missing official confirmation');
      const changed=applyOfficialFeed(body.feed);
      feedState={...feedState,refreshStatus:body.status,added:Number.isInteger(body.added)?body.added:0,corrected:Number.isInteger(body.corrected)?body.corrected:0,retryAfter:Number.isInteger(body.retryAfter)?body.retryAfter:60};
      return changed;
    }catch{
      if(apiBase&&!force){const backupController=new AbortController(),backupTimer=setTimeout(()=>backupController.abort(),12000);try{const r=await global.fetch('https://raw.githubusercontent.com/rockiemydog/j3-elo-simulator/main/official-results.json?t='+Date.now(),{cache:'no-store',signal:backupController.signal,credentials:'omit'});if(!r.ok)throw Error('offline');const changed=applyOfficialFeed(await r.json());feedState={...feedState,officialCheckedAt:null,refreshStatus:'fallback'};return changed;}catch{}finally{clearTimeout(backupTimer);}}
      feedState={...feedState,state:'unavailable'};return false;
    }
    finally{clearTimeout(timer);fetching=null;}
  })();
  return fetching;
}
global.J3Results=Object.freeze({storeKey,backupKey,feedKey,restoreCachedFeed,canRefreshOfficial:!!apiBase,statusText,get baseDate(){return baseDate;},get initialGames(){return Object.freeze(completed.map(g=>Object.freeze(g.slice())));},readConfirmed,clubStats,resultId,verification,applyOfficialFeed,refreshOfficial,get feedState(){return {...feedState};}});
})(window);

