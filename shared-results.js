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
let baseDate='2026-10-04';
const key=g=>g[0]+'|'+g[1];
const valid=g=>Array.isArray(g)&&g.length===4&&teams.includes(g[0])&&teams.includes(g[1])&&g[0]!==g[1]&&g.slice(2).every(x=>Number.isInteger(x)&&x>=0&&x<=30);
function readConfirmed() {
  const seen=new Set(completed.map(key)), extras=[];
  let available=true, rejected=0, recovered=false;
  try {
    let rows;
    try{rows=JSON.parse(global.localStorage.getItem(storeKey)||'[]');if(!Array.isArray(rows))throw new Error('Invalid saved results');}
    catch{rows=JSON.parse(global.localStorage.getItem(backupKey)||'null');if(!Array.isArray(rows))throw new Error('No valid backup');recovered=true;}
    for(const g of rows) {
      if(!valid(g)){rejected++;continue;}
      if(seen.has(key(g))) continue;
      seen.add(key(g));extras.push(g.slice());
    }
  } catch {available=false;}
  return {games:[...completed.map(g=>g.slice()),...extras],available,rejected,recovered,extras:extras.map(g=>g.slice()),extraCount:extras.length};
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
let feedState={state:'idle',asOfDate:baseDate,count:completed.length},fetching=null,lastFetch=0;
function applyOfficialFeed(feed){
  if(!feed||feed.schemaVersion!==1||feed.season!=='2026/27'||!Array.isArray(feed.matches)||feed.matches.length<completed.length||feed.matches.length>380)throw new Error('Invalid official feed');
  if(typeof feed.asOfDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(feed.asOfDate))throw new Error('Invalid official date');
  const rows=feed.matches.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id).localeCompare(String(b.id))),seen=new Set(),counts=new Map(teams.map(t=>[t,0]));
  for(const r of rows){
    if(!valid(r.game)||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||r.date<'2026-08-08'||r.date>feed.asOfDate||seen.has(key(r.game)))throw new Error('Invalid official match');
    seen.add(key(r.game));for(const t of r.game.slice(0,2)){counts.set(t,counts.get(t)+1);if(counts.get(t)>38)throw new Error('Invalid official club count');}
  }
  if(completed.some(g=>!seen.has(key(g))))throw new Error('Incomplete official feed');
  const games=rows.map(r=>r.game.slice()),changed=JSON.stringify(games)!==JSON.stringify(completed);
  if(changed)completed.splice(0,completed.length,...games);
  baseDate=feed.asOfDate;feedState={state:'ready',asOfDate:baseDate,count:completed.length,updatedAt:feed.updatedAt};
  return changed;
}
async function refreshOfficial(force=false){
  if(fetching)return fetching;
  if(!force&&Date.now()-lastFetch<60000)return false;
  if(typeof global.fetch!=='function')return false;
  lastFetch=Date.now();
  fetching=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const url='https://raw.githubusercontent.com/rockiemydog/j3-elo-simulator/main/official-results.json?t='+Math.floor(Date.now()/60000);
      const response=await global.fetch(url,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error('Feed download failed');
      return applyOfficialFeed(await response.json());
    }catch{feedState={...feedState,state:'unavailable'};return false;}
    finally{clearTimeout(timer);fetching=null;}
  })();
  return fetching;
}
global.J3Results=Object.freeze({storeKey,backupKey,get baseDate(){return baseDate;},get initialGames(){return Object.freeze(completed.map(g=>Object.freeze(g.slice())));},readConfirmed,clubStats,applyOfficialFeed,refreshOfficial,get feedState(){return {...feedState};}});
})(window);
