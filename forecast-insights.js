/* Pure, shared rules for prospective archives and conditional points targets. */
(function(root){
  'use strict';
  const MODEL='elo-davidson-k20-home60-fixed-v1';
  function compass(points,played,target){
    if(!Number.isInteger(points)||!Number.isInteger(played)||played<0||played>38||points<0||points>played*3||!Number.isInteger(target)||target<0||target>114)throw Error('Invalid points target');
    const remaining=38-played,needed=Math.max(0,target-points);
    return {remaining,needed,pace:remaining?needed/remaining:null,maximum:points+remaining*3,possible:needed<=remaining*3,reached:needed===0};
  }
  function validArchive(data){
    if(data?.schemaVersion!==1||data.season!=='2026/27'||!Array.isArray(data.snapshots)||!Array.isArray(data.predictions))throw Error('予測記録の形式が不正です');
    const ids=new Set();
    for(const s of data.snapshots){
      if(!s.id||ids.has(s.id)||!Number.isFinite(Date.parse(s.recordedAt))||!s.model||!Number.isInteger(s.runs)||s.runs<1||!Array.isArray(s.clubs)||s.clubs.length!==20||new Set(s.clubs.map(r=>r.club)).size!==20||s.clubs.some(r=>!Number.isFinite(r.top6)||r.top6<0||r.top6>100)||Math.abs(s.clubs.reduce((n,r)=>n+r.top6,0)-600)>.001)throw Error('予測履歴が不正です');
      ids.add(s.id);
    }
    const keys=new Set();
    for(const p of data.predictions){
      const key=[p.snapshotId,p.fixtureId,p.kickoff].join('|');
      if(!ids.has(p.snapshotId)||keys.has(key)||!p.home||!p.away||p.home===p.away||!/^\d{10}$/.test(p.fixtureId)||!Number.isFinite(Date.parse(p.recordedAt))||!Number.isFinite(Date.parse(p.kickoff))||Date.parse(p.recordedAt)>=Date.parse(p.kickoff)||!Array.isArray(p.probabilities)||p.probabilities.length!==3||p.probabilities.some(v=>!Number.isFinite(v)||v<0||v>1)||Math.abs(p.probabilities.reduce((a,b)=>a+b,0)-1)>1e-9)throw Error('試合前予測が不正です');
      keys.add(key);
    }
    return data;
  }
  function settledPredictions(archive,feed,calendar){
    validArchive(archive);
    const finished=new Map(feed.matches.map(m=>[m.id,m])),fixtures=new Map(calendar.matches.map(m=>[m.id,m])),latest=new Map();
    for(const p of archive.predictions){
      const result=finished.get(p.fixtureId),f=fixtures.get(p.fixtureId),snapshot=archive.snapshots.find(s=>s.id===p.snapshotId);
      if(!result||!f||!f.time||f.status!=='finished'||result.game[0]!==p.home||result.game[1]!==p.away||f.home!==p.home||f.away!==p.away||p.model!==snapshot.model)continue;
      const kickoff=Date.parse(f.date+'T'+f.time+':00+09:00');
      // Re-timed / postponed fixtures require a new, matching kickoff record.
      if(Date.parse(p.kickoff)!==kickoff||Date.parse(p.recordedAt)>=kickoff)continue;
      const key=p.model+'|'+p.fixtureId,old=latest.get(key);
      if(!old||Date.parse(p.recordedAt)>Date.parse(old.recordedAt))latest.set(key,{...p,game:result.game.slice(),outcome:result.game[2]>result.game[3]?0:result.game[2]===result.game[3]?1:2});
    }
    return [...latest.values()];
  }
  function calibration(rows){
    const bins=Array.from({length:10},(_,i)=>({low:i*10,high:(i+1)*10,n:0,sum:0,hits:0}));
    let logLoss=0,brier=0,hits=0;
    for(const row of rows){
      const p=row.probabilities,o=row.outcome,best=p.indexOf(Math.max(...p));
      logLoss-=Math.log(Math.max(1e-15,p[o]));brier+=p.reduce((s,v,i)=>s+(v-(i===o?1:0))**2,0);hits+=best===o;
      // All H/D/A probabilities, not only the most likely outcome, are scored.
      p.forEach((v,i)=>{const b=bins[Math.min(9,Math.floor(v*10))];b.n++;b.sum+=v;b.hits+=i===o;});
    }
    return {n:rows.length,accuracy:rows.length?hits/rows.length:null,logLoss:rows.length?logLoss/rows.length:null,brier:rows.length?brier/rows.length:null,bins:bins.map(b=>({...b,forecast:b.n?b.sum/b.n:null,actual:b.n?b.hits/b.n:null}))};
  }
  const api={MODEL,compass,validArchive,settledPredictions,calibration};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.J3ForecastInsights=api;
})(typeof window==='object'?window:globalThis);
