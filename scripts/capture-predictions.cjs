/* Read the page's pure calculation functions so the journal uses the same Elo
   and simulation as the site. Functions close on their opening line or with
   an unindented brace. The regression suite exercises this adapter. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const insights=require('../forecast-insights.js');
const ROOT=path.resolve(__dirname,'..');
function engine(games){
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const pageLines=html.split('\n');
  const teamLine=pageLines.find(l=>l.startsWith('const teams='));
  const names=['applyGame','stateFromGames','stateWithScenario','key','mulberry32','eloProb','eloRatings','representativeScore','h2h','sortOrder','simulate'];
  const lines=names.map(name=>{
    const start=pageLines.findIndex(line=>line.startsWith('function '+name+'('));
    if(start<0)throw Error('Forecast adapter requires review: '+name);
    if(pageLines[start].endsWith('}'))return pageLines[start];
    const end=pageLines.indexOf('}',start+1);
    if(end<0)throw Error('Forecast adapter requires review: '+name);
    return pageLines.slice(start,end+1).join('\n');
  });
  const constants=pageLines.find(l=>l.startsWith('const ELO_START='));
  const rankStart=pageLines.indexOf('const POINTS_LINE_RANKS=[');
  const rankEnd=pageLines.indexOf('];',rankStart+1);
  if(!teamLine||!constants||rankStart<0||rankEnd<0)throw Error('Forecast model metadata missing');
  const ranks=pageLines.slice(rankStart,rankEnd+1).join('\n');
  const source=[teamLine,constants,ranks,'const ix=Object.fromEntries(teams.map((t,i)=>[t,i]));const scenarios=[];const confirmed=()=>games;',...lines].join('\n');
  const ctx=vm.createContext({games});vm.runInContext(source,ctx);
  return {teams:vm.runInContext('teams.slice()',ctx),signature:crypto.createHash('sha256').update(source).digest('hex').slice(0,16),forecast(){return vm.runInContext('simulate(10000,[])',ctx,{timeout:90000});},probabilities(home,away){ctx.home=home;ctx.away=away;return vm.runInContext('(()=>{const m=eloRatings();return eloProb(m.R,ix[home],ix[away],m.nu)})()',ctx);}};
}
function capture(archive,feed,calendar,now=new Date(),makeEngine=engine,clock=()=>now){
  insights.validArchive(archive);
  const stamp=now.toISOString(),nowMs=now.getTime(),clubs=new Set(),cards=new Set();
  if(feed.verified!==true||calendar.verified!==true||feed.season!=='2026/27'||calendar.season!=='2026/27'||!Array.isArray(feed.matches)||!Array.isArray(calendar.matches)||!Number.isFinite(Date.parse(feed.updatedAt))||Date.parse(feed.updatedAt)>nowMs+300000||!Number.isFinite(Date.parse(calendar.checkedAt))||nowMs-Date.parse(calendar.checkedAt)>48*3600000||Date.parse(calendar.checkedAt)>nowMs+300000)throw Error('Unverified or stale source');
  const games=feed.matches.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id).localeCompare(String(b.id))).map(r=>{const g=r.game;if(!Array.isArray(g)||g.length!==4||!/^\d{10}$/.test(r.id)||r.id.slice(0,8)!==r.date?.replaceAll('-','')||!Number.isFinite(Date.parse(r.date+'T00:00:00+09:00'))||g[0]===g[1]||!g.slice(2).every(v=>Number.isInteger(v)&&v>=0&&v<=30)||cards.has(g[0]+'|'+g[1])||Date.parse(r.date+'T00:00:00+09:00')>nowMs)throw Error('Invalid result');cards.add(g[0]+'|'+g[1]);clubs.add(g[0]);clubs.add(g[1]);return g.slice();});
  const model=makeEngine(games),known=new Set(model.teams);
  if(known.size!==20||[...clubs].some(c=>!known.has(c)))throw Error('Invalid clubs');
  const signature=insights.MODEL+'-'+model.signature;
  const sourceId=crypto.createHash('sha256').update(JSON.stringify([signature,games])).digest('hex').slice(0,24);
  const next=structuredClone(archive);let snapshot=next.snapshots.at(-1);
  // A correction later reverted to its original score is still a NEW event.
  // Compare with the last snapshot, not any historical copy of these inputs.
  if((snapshot?.sourceId||snapshot?.id)!==sourceId){const id=snapshot?crypto.createHash('sha256').update(sourceId+'|'+snapshot.id).digest('hex').slice(0,24):sourceId;snapshot={id,sourceId,model:signature,recordedAt:stamp,sourceUpdatedAt:feed.updatedAt,confirmed:games.length,runs:10000,clubs:model.forecast().map(r=>({club:r.club,top6:r.top6}))};next.snapshots.push(snapshot);}
  const id=snapshot.id;
  // Append only. An existing pre-match forecast is never rewritten. Each
  // result/model revision can add one new record for a known future kickoff.
  for(const f of calendar.matches){
    if(f.status!=='scheduled'||!f.time||!known.has(f.home)||!known.has(f.away)||f.home===f.away||cards.has(f.home+'|'+f.away))continue;
    const kickoff=new Date(f.date+'T'+f.time+':00+09:00');
    const recordedAt=clock();
    if(!Number.isFinite(kickoff.getTime())||kickoff<=recordedAt||kickoff-recordedAt>7*86400000)continue;
    if(next.predictions.some(p=>p.snapshotId===id&&p.fixtureId===f.id&&p.kickoff===kickoff.toISOString()))continue;
    const probabilities=Array.from(model.probabilities(f.home,f.away)),savedAt=clock();
    if(savedAt>=kickoff)continue;
    next.predictions.push({snapshotId:id,model:signature,fixtureId:f.id,home:f.home,away:f.away,kickoff:kickoff.toISOString(),recordedAt:savedAt.toISOString(),probabilities});
  }
  return insights.validArchive(next);
}
if(require.main===module){
  const read=f=>JSON.parse(fs.readFileSync(path.join(ROOT,f),'utf8'));
  const archive=read('prediction-journal.json'),next=capture(archive,read('official-results.json'),read('league-schedule.json'),new Date(),engine,()=>new Date());
  if(JSON.stringify(archive)!==JSON.stringify(next))fs.writeFileSync(path.join(ROOT,'prediction-journal.json'),JSON.stringify(next,null,2)+'\n');
  console.log(`Journal: ${next.snapshots.length} snapshots, ${next.predictions.length} immutable pre-match forecasts; no mail sent.`);
}
module.exports={engine,capture};
