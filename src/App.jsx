
import React, { useState, useEffect, useRef } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const storage = {
  get: async key => { try { const v=localStorage.getItem(key); return v!==null?{value:v}:null; } catch { return null; } },
  set: async (key,val) => { try { localStorage.setItem(key,val); } catch {} }
};

const RACE_DATE  = new Date("2026-09-26T00:00:00");
const START_DATE = new Date("2026-04-27T00:00:00");
const C   = { swim:"#3B82F6", cycle:"#22C55E", run:"#F97316", brick:"#A855F7" };
const IC  = { swim:"🏊", cycle:"🚴", run:"🏃", brick:"🧱" };
const LB  = { swim:"Zwemmen", cycle:"Fietsen", run:"Hardlopen", brick:"Brick" };
const PHASES = [
  { name:"Basis",  start:1,  end:7,  color:"#3B82F6", desc:"Basis opbouwen" },
  { name:"Opbouw", start:8,  end:15, color:"#22C55E", desc:"Afstanden verhogen" },
  { name:"Piek",   start:16, end:19, color:"#F97316", desc:"Race-ready worden" },
  { name:"Taper",  start:20, end:22, color:"#EF4444", desc:"Rust & herstel" },
];
const DN  = ["Ma","Di","Wo","Do","Vr","Za","Zo"];
const DNF = ["Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];
const DEFAULT_GOALS    = { run:6.5, cycle:28, swim:2.5 };
const DEFAULT_SETTINGS = { overloadEnabled:true, overloadThreshold:10, runRuleEnabled:true, runRuleThreshold:10, weightNotifEnabled:false, weightNotifDay:4, weightNotifTime:"08:00" };
const S = { bg:"#0F172A", card:"#1E293B", border:"#334155", muted:"#64748B", sub:"#94A3B8" };
const MET = { run:9.0, cycle:7.5, swim:7.0, brick:8.0 };

function calcCals(type,distKm,timeMin,weightKg){ const met=MET[type]||8.0; if(!timeMin||timeMin===0) return 0; return Math.round(met*weightKg*(timeMin/60)); }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function ds(d){ const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),dy=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${dy}`; }
function getPhase(w){ return PHASES.find(p=>w>=p.start&&w<=p.end)||PHASES[0]; }
function minsToTime(m){ if(!m&&m!==0) return "-"; const mn=Math.floor(m),sc=Math.round((m-mn)*60); return `${mn}:${sc.toString().padStart(2,"0")}`; }

function buildSched(){
  const s={};
  for(let w=1;w<=22;w++){
    const ws=addDays(START_DATE,(w-1)*7);
    let rk,ck,sm;
    if(w<=7)      { rk=+(2+(w-1)*.43).toFixed(1); ck=Math.round(20+(w-1)*1.4); sm=Math.round(1000+(w-1)*50); }
    else if(w<=15){ const p=w-8; rk=+(5+p*.38).toFixed(1); ck=Math.round(30+p*1.9); sm=Math.round(1300+p*25); }
    else if(w<=19){ const p=w-16; rk=+(8+p*.67).toFixed(1); ck=Math.round(45+p*1.25); sm=Math.round(1500+p*37.5); }
    else          { const p=w-20; rk=+Math.max(10-p*1.5,6).toFixed(1); ck=Math.max(Math.round(48-p*6),30); sm=Math.max(Math.round(1500-p*167),1000); }
    const ow=w>=11, swn=ow?"Binnenbad of open water 🌊":"Binnenbad";
    s[ds(ws)]              ={type:"run",  targetDist:rk,unit:"km",title:"Duurloop",    note:`Doel: ${rk} km`,week:w};
    s[ds(addDays(ws,1))]   ={type:"cycle",targetDist:ck,unit:"km",title:"Fietstocht",  note:`Doel: ${ck} km`,week:w};
    s[ds(addDays(ws,2))]   ={type:"swim", targetDist:sm,unit:"m", title:"Zwemtraining",note:swn,week:w,ow};
    if(w>=8){ const bc=Math.round(ck*.6),br=+(rk*.5).toFixed(1); s[ds(addDays(ws,3))]={type:"brick",targetDist:0,unit:"",title:"Brick sessie",note:`${bc}km fietsen + ${br}km lopen`,week:w}; }
    else    { const er=+(rk*.6).toFixed(1); s[ds(addDays(ws,3))]={type:"run",targetDist:er,unit:"km",title:"Herstelloop",note:`Rustig: ${er} km`,week:w}; }
    if(w>=8) s[ds(addDays(ws,4))]={type:"swim",targetDist:Math.round(sm*.75),unit:"m",title:"Zwemtraining 2",note:swn,week:w,ow};
    if(w>=16){ s[ds(addDays(ws,5))]={type:"brick",targetDist:0,unit:"",title:"Race simulatie",note:`${ck}km fietsen + ${rk}km lopen`,week:w}; }
    else     { const lc=Math.round(ck*1.2); s[ds(addDays(ws,5))]={type:"cycle",targetDist:lc,unit:"km",title:"Lange rit",note:`Doel: ${lc} km`,week:w}; }
  }
  return s;
}
const BASE=buildSched();

function detectPR(entry,existingLogs){
  const prev=Object.values(existingLogs).flat().filter(l=>l.type===entry.type&&l.dist>0&&l.d!==entry.d);
  if(!entry.dist||entry.dist===0) return null;
  if(prev.length===0) return "first";
  const distPR=entry.dist>Math.max(...prev.map(l=>l.dist||0));
  if(!entry.time||entry.time===0) return distPR?"dist":null;
  const pace=entry.type==="cycle"?entry.dist/(entry.time/60):entry.time/entry.dist;
  const pp=prev.filter(l=>l.dist&&l.time).map(l=>l.type==="cycle"?l.dist/(l.time/60):l.time/l.dist);
  const pacePR=pp.length===0||(entry.type==="cycle"?pace>Math.max(...pp):pace<Math.min(...pp));
  if(distPR&&pacePR) return "both"; if(distPR) return "dist"; if(pacePR) return "pace"; return null;
}

function Toggle({value,onChange}){
  return <div onClick={()=>onChange(!value)} style={{width:44,height:24,borderRadius:12,background:value?"#F97316":"#334155",cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0}}><div style={{position:"absolute",top:3,left:value?22:3,width:18,height:18,borderRadius:"50%",background:"white",transition:"left 0.2s"}}/></div>;
}

function SettingsPage({settings,saveSettings,exportData,onClose}){
  const [draft,setDraft]=useState({...settings});
  const set=(k,v)=>setDraft(d=>({...d,[k]:v}));
  const [notifPerm,setNotifPerm]=useState(typeof Notification!=="undefined"?Notification.permission:"denied");
  const requestPerm=async()=>{ if(typeof Notification==="undefined") return; const p=await Notification.requestPermission(); setNotifPerm(p); };
  const handleExport=()=>{
    const payload={exportDate:new Date().toISOString(),appVersion:"Triathlon Tracker — Olympisch 26-09-2026",data:exportData};
    const json=JSON.stringify(payload,null,2);
    const blob=new Blob([json],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download=`triathlon-export-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };
  const row=(label,sub,key,threshKey)=>(
    <div style={{background:S.card,borderRadius:12,padding:16,marginBottom:10,border:`1px solid ${S.border}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:draft[key]&&threshKey?10:0}}>
        <div><div style={{fontSize:13,fontWeight:600}}>{label}</div><div style={{fontSize:11,color:S.muted,marginTop:2}}>{sub}</div></div>
        <Toggle value={draft[key]} onChange={v=>set(key,v)}/>
      </div>
      {draft[key]&&threshKey&&(<div style={{display:"flex",alignItems:"center",gap:10,marginTop:2}}>
        <div style={{fontSize:11,color:S.sub,flex:1}}>Waarschuw bij meer dan</div>
        <input value={draft[threshKey]} onChange={e=>set(threshKey,e.target.value)} type="number" min="1" max="50" step="1" style={{width:60,background:"#0F172A",border:`1px solid ${S.border}`,borderRadius:8,padding:"6px 10px",color:"white",fontSize:15,textAlign:"center",boxSizing:"border-box"}}/>
        <div style={{fontSize:11,color:S.sub}}>% stijging</div>
      </div>)}
    </div>
  );
  return (
    <div style={{position:"fixed",inset:0,background:S.bg,zIndex:300,fontFamily:"system-ui,sans-serif",color:"#F1F5F9",maxWidth:520,margin:"0 auto",overflowY:"auto",paddingTop:"env(safe-area-inset-top)",paddingBottom:"env(safe-area-inset-bottom)"}}>
      <div style={{padding:"18px 16px 10px",borderBottom:`1px solid ${S.border}`,display:"flex",alignItems:"center",gap:12,background:"#0F172A",position:"sticky",top:0}}>
        <button onClick={onClose} style={{background:S.card,border:`1px solid ${S.border}`,color:"white",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:14}}>‹</button>
        <div style={{fontSize:17,fontWeight:700}}>Instellingen</div>
      </div>
      <div style={{padding:16}}>
        <div style={{fontSize:11,color:S.muted,fontWeight:600,letterSpacing:1,marginBottom:10}}>WAARSCHUWINGEN</div>
        {row("Progressieve overload","Melding bij te grote volumestijging (alle disciplines)","overloadEnabled","overloadThreshold")}
        {row("10% regel hardlopen","Extra controle voor hardlopen — blessurerisico bij opbouw","runRuleEnabled","runRuleThreshold")}
        <div style={{fontSize:11,color:S.muted,fontWeight:600,letterSpacing:1,margin:"20px 0 10px"}}>GEWICHT MELDING</div>
        <div style={{background:S.card,borderRadius:12,padding:16,marginBottom:10,border:`1px solid ${S.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:draft.weightNotifEnabled?14:0}}>
            <div><div style={{fontSize:13,fontWeight:600}}>Weegherinnering</div><div style={{fontSize:11,color:S.muted,marginTop:2}}>Herinnering om je gewicht te loggen</div></div>
            <Toggle value={draft.weightNotifEnabled} onChange={v=>set("weightNotifEnabled",v)}/>
          </div>
          {draft.weightNotifEnabled&&(<>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:S.sub,marginBottom:8}}>Dag</div>
              <div style={{display:"flex",gap:4}}>{DN.map((d,i)=><button key={i} onClick={()=>set("weightNotifDay",i)} style={{flex:1,padding:"6px 2px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:draft.weightNotifDay===i?600:400,background:draft.weightNotifDay===i?"#F9731633":"transparent",border:`1px solid ${draft.weightNotifDay===i?"#F97316":S.border}`,color:draft.weightNotifDay===i?"#F97316":S.muted}}>{d}</button>)}</div>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:S.sub,marginBottom:6}}>Tijd</div>
              <input value={draft.weightNotifTime} onChange={e=>set("weightNotifTime",e.target.value)} type="time" style={{background:"#0F172A",border:`1px solid ${S.border}`,borderRadius:8,padding:"8px 12px",color:"white",fontSize:15,boxSizing:"border-box"}}/>
            </div>
            {notifPerm!=="granted"&&<button onClick={requestPerm} style={{width:"100%",padding:"8px",background:"#334155",border:`1px solid ${S.border}`,borderRadius:8,color:"white",cursor:"pointer",fontSize:12}}>🔔 Notificaties toestaan</button>}
            {notifPerm==="granted"&&<div style={{fontSize:11,color:"#22C55E"}}>✓ Notificaties toegestaan</div>}
          </>)}
        </div>
        <button onClick={()=>{const g={...draft,overloadThreshold:+draft.overloadThreshold||10,runRuleThreshold:+draft.runRuleThreshold||10};saveSettings(g);onClose();}} style={{width:"100%",padding:13,background:"#F97316",border:"none",borderRadius:10,color:"white",fontSize:15,fontWeight:700,cursor:"pointer",marginTop:8}}>💾 Opslaan</button>
        <div style={{fontSize:11,color:S.muted,fontWeight:600,letterSpacing:1,margin:"24px 0 10px"}}>DATA</div>
        <div style={{background:S.card,borderRadius:12,padding:16,border:`1px solid ${S.border}`}}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>📦 Exporteer alle data</div>
          <div style={{fontSize:11,color:S.muted,marginBottom:14}}>Download al je trainingen, gewicht, checklijst, doelen en instellingen als JSON-bestand.</div>
          <button onClick={handleExport} style={{width:"100%",padding:12,background:"#1E3A5F",border:"1px solid #3B82F6",borderRadius:10,color:"#60A5FA",fontSize:14,fontWeight:600,cursor:"pointer"}}>⬇️ Download export</button>
        </div>
      </div>
    </div>
  );
}

function WeightModal({last,onSave,onClose}){
  const [kg,setKg]=useState(last?.kg??"");
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-end",zIndex:200}}>
      <div style={{background:S.card,width:"100%",borderRadius:"20px 20px 0 0",padding:22,maxWidth:520,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
          <div style={{fontWeight:600,fontSize:15}}>⚖️ Gewicht loggen</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:S.sub,fontSize:20,cursor:"pointer",lineHeight:1}}>✕</button>
        </div>
        {last&&<div style={{fontSize:12,color:S.muted,marginBottom:12}}>Vorig: {last.kg} kg op {new Date(last.d+"T00:00:00").toLocaleDateString("nl-NL",{day:"numeric",month:"short"})}</div>}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,color:S.sub,marginBottom:6}}>Gewicht (kg)</div>
          <input value={kg} onChange={e=>setKg(e.target.value)} type="number" step="0.1" autoFocus style={{width:"100%",background:"#0F172A",border:`1px solid ${S.border}`,borderRadius:8,padding:"12px",color:"white",fontSize:22,boxSizing:"border-box",textAlign:"center"}} placeholder="bijv. 74.5"/>
        </div>
        <button onClick={()=>{if(parseFloat(kg)>0) onSave(parseFloat(kg));}} style={{width:"100%",padding:13,background:"#3B82F6",border:"none",borderRadius:10,color:"white",fontSize:15,fontWeight:700,cursor:"pointer"}}>💾 Opslaan</button>
      </div>
    </div>
  );
}

function ChecklijstTab({items,saveItems}){
  const [newText,setNewText]=useState("");
  const inputRef=useRef(null);
  const done=items.filter(i=>i.done).length;
  const add=async()=>{ const t=newText.trim(); if(!t) return; await saveItems([...items,{id:Date.now().toString(),text:t,done:false}]); setNewText(""); inputRef.current?.focus(); };
  const toggle=async id=>await saveItems(items.map(i=>i.id===id?{...i,done:!i.done}:i));
  const remove=async id=>await saveItems(items.filter(i=>i.id!==id));
  return (
    <div>
      <div style={{marginBottom:14}}><div style={{fontSize:15,fontWeight:600}}>🏁 Race checklijst</div><div style={{fontSize:11,color:S.sub,marginTop:2}}>{done} / {items.length} afgevinkt</div></div>
      {items.length>0&&<div style={{height:4,background:"#0F172A",borderRadius:4,overflow:"hidden",marginBottom:16}}><div style={{height:"100%",width:`${(done/items.length)*100}%`,background:"#F97316",borderRadius:4,transition:"width 0.3s"}}/></div>}
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <input ref={inputRef} value={newText} onChange={e=>setNewText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="Nieuw item toevoegen…" style={{flex:1,background:S.card,border:`1px solid ${S.border}`,borderRadius:8,padding:"10px 12px",color:"white",fontSize:14,outline:"none"}}/>
        <button onClick={add} style={{background:"#F97316",border:"none",borderRadius:8,padding:"10px 16px",color:"white",fontSize:16,cursor:"pointer",fontWeight:700}}>+</button>
      </div>
      {!items.length&&<div style={{textAlign:"center",color:S.muted,padding:"40px 0"}}><div style={{fontSize:32,marginBottom:10}}>📋</div><div>Voeg je eerste item toe!</div></div>}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {items.map(item=>(
          <div key={item.id} style={{background:S.card,borderRadius:12,padding:"12px 14px",display:"flex",alignItems:"center",gap:12,border:`1px solid ${item.done?"#22C55E33":S.border}`,opacity:item.done?0.7:1}}>
            <div onClick={()=>toggle(item.id)} style={{width:22,height:22,borderRadius:6,border:`2px solid ${item.done?"#22C55E":S.border}`,background:item.done?"#22C55E":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer"}}>{item.done&&<span style={{color:"white",fontSize:13,lineHeight:1}}>✓</span>}</div>
            <span onClick={()=>toggle(item.id)} style={{flex:1,fontSize:13,cursor:"pointer",color:item.done?S.muted:"white",textDecoration:item.done?"line-through":"none"}}>{item.text}</span>
            <button onClick={()=>remove(item.id)} style={{background:"none",border:"none",color:S.muted,cursor:"pointer",fontSize:16,padding:"0 4px",lineHeight:1}}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function GezondheidTab({weights,saveWeights,startWeight,saveStartWeight,logs}){
  const [showModal,setShowModal]=useState(false);
  const today=new Date(); today.setHours(0,0,0,0);
  const todayStr=ds(today);
  const handleSave=async(kg)=>{
    const existing=weights.filter(w=>w.d!==todayStr);
    const nw=[...existing,{d:todayStr,kg}].sort((a,b)=>a.d.localeCompare(b.d));
    await saveWeights(nw);
    if(startWeight===null) await saveStartWeight(kg);
    setShowModal(false);
  };
  const last=weights.length?weights[weights.length-1]:null;
  const diff=last&&startWeight!==null?+(last.kg-startWeight).toFixed(1):null;
  const weightChartData=weights.map(w=>({d:new Date(w.d+"T00:00:00").toLocaleDateString("nl-NL",{day:"numeric",month:"short"}),kg:w.kg}));
  const wMin=weights.length?Math.floor(Math.min(...weights.map(w=>w.kg))-2):60;
  const wMax=weights.length?Math.ceil(Math.max(...weights.map(w=>w.kg))+2):100;
  const curWeight=last?.kg||70;
  const diffDays=Math.floor((today-START_DATE)/86400000);
  const curWeek=Math.max(1,Math.min(22,Math.floor(diffDays/7)+1));
  const ws=addDays(START_DATE,(curWeek-1)*7);
  const calDates=[todayStr];
  const calPeriodLabel=`Vandaag, ${new Date(todayStr+"T00:00:00").toLocaleDateString("nl-NL",{weekday:"long",day:"numeric",month:"long"})}`;
  const calLogs=calDates.flatMap(d=>logs[d]||[]);
  const calsByType={run:0,cycle:0,swim:0,brick:0};
  calLogs.forEach(l=>{if(calsByType[l.type]!==undefined&&l.time>0) calsByType[l.type]+=calcCals(l.type,l.dist||0,l.time,curWeight);});
  const totalCals=calsByType.run+calsByType.cycle+calsByType.swim+calsByType.brick;
  const calWeeklyData=Array.from({length:22},(_,i)=>{
    const wsDt=addDays(START_DATE,i*7);
    const wl=Array.from({length:7},(_,d)=>ds(addDays(wsDt,d))).flatMap(d=>logs[d]||[]);
    const ru=wl.filter(l=>l.type==="run").reduce((s,l)=>s+(l.time>0?calcCals("run",l.dist||0,l.time,curWeight):0),0);
    const cy=wl.filter(l=>l.type==="cycle").reduce((s,l)=>s+(l.time>0?calcCals("cycle",l.dist||0,l.time,curWeight):0),0);
    const sw=wl.filter(l=>l.type==="swim").reduce((s,l)=>s+(l.time>0?calcCals("swim",l.dist||0,l.time,curWeight):0),0);
    const br=wl.filter(l=>l.type==="brick").reduce((s,l)=>s+(l.time>0?calcCals("brick",l.dist||0,l.time,curWeight):0),0);
    return {week:`W${i+1}`,ru,cy,sw,br,tot:ru+cy+sw+br};
  }).filter(w=>w.tot>0);
  const tt={contentStyle:{background:S.card,border:"none",color:"white",fontSize:11}};
  const xa={tick:{fill:"#64748B",fontSize:9}};
  const ya={tick:{fill:"#64748B",fontSize:9},width:40};
  return (
    <div>
      <div style={{fontSize:15,fontWeight:600,marginBottom:14}}>❤️ Gezondheid</div>
      <div style={{background:S.card,borderRadius:12,padding:16,marginBottom:14,border:"1px solid #3B82F633"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div><div style={{fontSize:13,fontWeight:600}}>⚖️ Gewicht</div><div style={{fontSize:11,color:S.sub,marginTop:2}}>Gewicht in kg bijhouden</div></div>
          <button onClick={()=>setShowModal(true)} style={{background:"#3B82F633",border:"1px solid #3B82F6",borderRadius:8,padding:"6px 14px",color:"#3B82F6",cursor:"pointer",fontSize:12,fontWeight:600}}>+ Log gewicht</button>
        </div>
        {last?(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,textAlign:"center"}}>
            <div><div style={{fontSize:10,color:S.muted,marginBottom:2}}>Huidig</div><div style={{fontSize:20,fontWeight:700,color:"#3B82F6"}}>{last.kg}</div><div style={{fontSize:10,color:S.muted}}>kg</div></div>
            <div><div style={{fontSize:10,color:S.muted,marginBottom:2}}>Start</div><div style={{fontSize:20,fontWeight:700,color:S.sub}}>{startWeight!==null?startWeight:"—"}</div><div style={{fontSize:10,color:S.muted}}>kg</div></div>
            <div><div style={{fontSize:10,color:S.muted,marginBottom:2}}>Verschil</div><div style={{fontSize:20,fontWeight:700,color:diff===null?"white":diff<0?"#22C55E":"#EF4444"}}>{diff===null?"—":(diff>0?"+":"")+diff}</div><div style={{fontSize:10,color:S.muted}}>kg</div></div>
          </div>
        ):<div style={{textAlign:"center",color:S.muted,padding:"16px 0",fontSize:13}}>Nog geen gewicht gelogd.</div>}
      </div>
      {weightChartData.length>0&&(
        <div style={{background:S.card,borderRadius:12,padding:14,marginBottom:14}}>
          <div style={{fontSize:12,color:S.sub,marginBottom:8}}>Gewichtsverloop</div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={weightChartData}>
              <XAxis dataKey="d" {...xa}/><YAxis domain={[wMin,wMax]} {...ya} tickFormatter={v=>`${v}kg`}/>
              <Tooltip {...tt} formatter={v=>[`${v} kg`,"Gewicht"]}/>
              <Line type="monotone" dataKey="kg" stroke="#3B82F6" strokeWidth={2} dot={{r:3,fill:"#3B82F6"}} activeDot={{r:5}}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div style={{background:S.card,borderRadius:12,padding:16,marginBottom:14,border:"1px solid #F9731633"}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>🔥 Calorieën verbrand</div>
        <div style={{fontSize:10,color:S.muted,marginBottom:12}}>{calPeriodLabel} • op basis van {curWeight} kg</div>
        <div style={{fontSize:32,fontWeight:800,color:"#F97316",marginBottom:12}}>{totalCals.toLocaleString()} <span style={{fontSize:14,fontWeight:400,color:S.muted}}>kcal</span></div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {[{type:"run",label:"🏃 Hardlopen",cal:calsByType.run,color:C.run},{type:"cycle",label:"🚴 Fietsen",cal:calsByType.cycle,color:C.cycle},{type:"swim",label:"🏊 Zwemmen",cal:calsByType.swim,color:C.swim},{type:"brick",label:"🧱 Brick",cal:calsByType.brick,color:C.brick}].filter(x=>x.cal>0||x.type!=="brick").map(({label,cal,color})=>{
            const pct=totalCals>0?Math.round((cal/totalCals)*100):0;
            return (<div key={label}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12}}>{label}</span><span style={{fontSize:12,fontWeight:600,color}}>{cal} kcal</span></div><div style={{height:4,background:"#0F172A",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:4}}/></div></div>);
          })}
        </div>
        <div style={{fontSize:10,color:S.muted,marginTop:10}}>Berekend via MET-methode. Alleen trainingen mét ingevulde tijd tellen mee.</div>
      </div>
      {calWeeklyData.length>0&&(
        <div style={{background:S.card,borderRadius:12,padding:14}}>
          <div style={{fontSize:12,color:S.sub,marginBottom:8}}>🔥 Calorieën per week (kcal)</div>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={calWeeklyData}>
              <XAxis dataKey="week" {...xa}/><YAxis {...ya}/>
              <Tooltip {...tt} formatter={(v,n)=>[`${v} kcal`,n==="ru"?"Lopen":n==="cy"?"Fietsen":n==="br"?"Brick":"Zwemmen"]}/>
              <Bar dataKey="sw" stackId="a" fill={C.swim}/>
              <Bar dataKey="cy" stackId="a" fill={C.cycle}/>
              <Bar dataKey="br" stackId="a" fill={C.brick}/>
              <Bar dataKey="ru" stackId="a" fill={C.run} radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
          <div style={{display:"flex",gap:12,marginTop:6,justifyContent:"center"}}>
            {[{c:C.run,l:"Lopen"},{c:C.cycle,l:"Fietsen"},{c:C.swim,l:"Zwemmen"},{c:C.brick,l:"Brick"}].map(({c,l})=><div key={l} style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:8,height:8,borderRadius:2,background:c}}/><span style={{fontSize:10,color:S.muted}}>{l}</span></div>)}
          </div>
        </div>
      )}
      {showModal&&<WeightModal last={last} onSave={handleSave} onClose={()=>setShowModal(false)}/>}
    </div>
  );
}

export default function App(){
  const [tab,setTab]=useState("training");
  const [logs,setLogs]=useState({});
  const [moved,setMoved]=useState({});
  const [goals,setGoals]=useState(DEFAULT_GOALS);
  const [settings,setSettings]=useState(DEFAULT_SETTINGS);
  const [checkItems,setCheckItems]=useState([]);
  const [weights,setWeights]=useState([]);
  const [startWeight,setStartWeight]=useState(null);
  const [prNotif,setPrNotif]=useState(null);
  const [showSettings,setShowSettings]=useState(false);
  const [ready,setReady]=useState(false);
  const [logModal,setLogModal]=useState(null);
  const [moveModal,setMoveModal]=useState(null);
  const [schemaWeek,setSchemaWeek]=useState(1);
  const lastNotifRef=useRef(null);
  const today=new Date(); today.setHours(0,0,0,0);
  const todayStr=ds(today);
  const diffDays=Math.floor((today-START_DATE)/86400000);
  const curWeek=Math.max(1,Math.min(22,Math.floor(diffDays/7)+1));

  useEffect(()=>{
    const fb=setTimeout(()=>setReady(true),2000);
    (async()=>{
      try{ const r=await storage.get("tl"); if(r) setLogs(JSON.parse(r.value)); }catch{}
      try{ const r=await storage.get("tm"); if(r) setMoved(JSON.parse(r.value)); }catch{}
      try{ const r=await storage.get("tg"); if(r) setGoals({...DEFAULT_GOALS,...JSON.parse(r.value)}); }catch{}
      try{ const r=await storage.get("ts"); if(r) setSettings({...DEFAULT_SETTINGS,...JSON.parse(r.value)}); }catch{}
      try{ const r=await storage.get("tc"); if(r) setCheckItems(JSON.parse(r.value)); }catch{}
      try{ const r=await storage.get("tw"); if(r) setWeights(JSON.parse(r.value)); }catch{}
      try{ const r=await storage.get("tsw"); if(r) setStartWeight(JSON.parse(r.value)); }catch{}
      setSchemaWeek(curWeek); setReady(true); clearTimeout(fb);
    })();
    return()=>clearTimeout(fb);
  },[]);

  useEffect(()=>{
    if(!settings.weightNotifEnabled) return;
    const check=()=>{
      const n=new Date(),jsDay=n.getDay(),ourDay=jsDay===0?6:jsDay-1;
      const timeNow=`${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`,dateNow=ds(n);
      if(ourDay===settings.weightNotifDay&&timeNow===settings.weightNotifTime&&lastNotifRef.current!==dateNow){
        lastNotifRef.current=dateNow;
        if(typeof Notification!=="undefined"&&Notification.permission==="granted") new Notification("⚖️ Tijd om te wegen!",{body:"Stap op de weegschaal en log je gewicht 💪"});
      }
    };
    const iv=setInterval(check,30000); check(); return()=>clearInterval(iv);
  },[settings.weightNotifEnabled,settings.weightNotifDay,settings.weightNotifTime]);

  const saveLogs       = async l=>{ setLogs(l);       await storage.set("tl",JSON.stringify(l)); };
  const saveMoved      = async m=>{ setMoved(m);      await storage.set("tm",JSON.stringify(m)); };
  const saveGoals      = async g=>{ setGoals(g);      await storage.set("tg",JSON.stringify(g)); };
  const saveSettings   = async s=>{ setSettings(s);   await storage.set("ts",JSON.stringify(s)); };
  const saveCheckItems = async c=>{ setCheckItems(c); await storage.set("tc",JSON.stringify(c)); };
  const saveWeights    = async w=>{ setWeights(w);    await storage.set("tw",JSON.stringify(w)); };
  const saveStartWeight= async w=>{ setStartWeight(w);await storage.set("tsw",JSON.stringify(w)); };

  const sched=(()=>{ const e={...BASE}; Object.entries(moved).forEach(([o,n])=>{ if(e[o]){e[n]={...e[o],movedFrom:o};delete e[o];} }); return e; })();
  const allLogs=Object.values(logs).flat();
  const daysLeft=Math.max(0,Math.ceil((RACE_DATE-today)/86400000));

  const handleSave=async(e)=>{
    const nl={...logs,[logModal.date]:[e]}; await saveLogs(nl);
    const pr=detectPR(e,logs);
    if(pr){ const msgs={first:`Eerste ${LB[e.type].toLowerCase()}sessie! 🎉`,dist:`Nieuw afstandsrecord! ${e.dist} ${e.unit} 🏅`,pace:`Nieuw snelheidsrecord! 🚀`,both:`Afstand én snelheidsrecord! 🏅🚀`}; setPrNotif({type:e.type,msg:msgs[pr]}); }
    setLogModal(null);
  };

  if(!ready) return <div style={{background:S.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontFamily:"system-ui"}}>Laden…</div>;

  const tabs=[{id:"training",l:"🏋️ Training"},{id:"gezondheid",l:"❤️ Gezondheid"},{id:"checklijst",l:"✅ Checklijst"},{id:"stats",l:"📈 Stats"}];

  return (
    <div style={{background:S.bg,minHeight:"100vh",fontFamily:"system-ui,sans-serif",color:"#F1F5F9",maxWidth:520,margin:"0 auto",paddingTop:"env(safe-area-inset-top)",paddingBottom:"env(safe-area-inset-bottom)"}}>
      {showSettings&&<SettingsPage settings={settings} saveSettings={saveSettings} exportData={{logs,moved,goals,settings,checkItems,weights,startWeight}} onClose={()=>setShowSettings(false)}/>}
      <div style={{background:"#0F172A",padding:"18px 16px 10px",borderBottom:`1px solid ${S.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{fontSize:20,fontWeight:700}}>🏅 Triathlon Tracker</div><div style={{fontSize:12,color:S.sub,marginTop:3}}>Olympisch • 26 september 2026</div></div>
        <button onClick={()=>setShowSettings(true)} style={{background:"none",border:`1px solid ${S.border}`,borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:18,color:S.sub,lineHeight:1}}>⚙️</button>
      </div>
      <div style={{display:"flex",background:S.card,borderBottom:`1px solid ${S.border}`}}>
        {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"10px 2px",border:"none",cursor:"pointer",fontSize:10,background:"transparent",color:tab===t.id?"#F97316":S.sub,borderBottom:tab===t.id?"2px solid #F97316":"2px solid transparent",fontWeight:tab===t.id?600:400}}>{t.l}</button>)}
      </div>
      <div style={{padding:"14px 14px 80px"}}>
        {tab==="training"   && <TrainingTab {...{daysLeft,allLogs,sched,logs,todayStr,curWeek,setLogModal,prNotif,setPrNotif,checkItems,settings,schemaWeek,setSchemaWeek,setMoveModal,today}}/>}
        {tab==="gezondheid" && <GezondheidTab {...{weights,saveWeights,startWeight,saveStartWeight,logs}}/>}
        {tab==="checklijst" && <ChecklijstTab items={checkItems} saveItems={saveCheckItems}/>}
        {tab==="stats"      && <Stats {...{logs,allLogs,goals,saveGoals,weights,saveLogs,saveWeights}}/>}
      </div>
      {logModal  && <LogModal  date={logModal.date} training={logModal.training} existing={logs[logModal.date]?.find(l=>l.type===logModal.training.type)} onSave={handleSave} onClose={()=>setLogModal(null)}/>}
      {moveModal && <MoveModal date={moveModal.date} training={moveModal.training} sched={sched} onMove={async nd=>{await saveMoved({...moved,[moveModal.date]:nd});setMoveModal(null);}} onClose={()=>setMoveModal(null)}/>}
    </div>
  );
}

function TrainingTab({daysLeft,allLogs,sched,logs,todayStr,curWeek,setLogModal,prNotif,setPrNotif,checkItems,settings,schemaWeek,setSchemaWeek,setMoveModal,today}){
  const [subTab,setSubTab]=useState("dashboard");
  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {[{id:"dashboard",l:"Dashboard"},{id:"schema",l:"Schema"}].map(t=><button key={t.id} onClick={()=>setSubTab(t.id)} style={{flex:1,padding:"8px",borderRadius:8,border:`1px solid ${subTab===t.id?"#F97316":S.border}`,background:subTab===t.id?"#F9731622":"transparent",color:subTab===t.id?"#F97316":S.muted,cursor:"pointer",fontSize:12,fontWeight:subTab===t.id?600:400}}>{t.l}</button>)}
      </div>
      {subTab==="dashboard"&&<Dashboard {...{daysLeft,allLogs,sched,logs,todayStr,curWeek,setLogModal,prNotif,setPrNotif,checkItems,settings}}/>}
      {subTab==="schema"&&<Schema {...{sched,logs,schemaWeek,setSchemaWeek,setLogModal,setMoveModal,todayStr,today}}/>}
    </div>
  );
}

function Dashboard({daysLeft,allLogs,sched,logs,todayStr,curWeek,setLogModal,prNotif,setPrNotif,checkItems,settings}){
  const phase=getPhase(curWeek);
  const ws=addDays(START_DATE,(curWeek-1)*7);
  const wDays=Array.from({length:7},(_,i)=>{const d=ds(addDays(ws,i));return{d,dn:DN[i],t:sched[d],logged:!!(logs[d]?.find(l=>l.type===sched[d]?.type))};});
  const vol=(dates,type)=>dates.flatMap(d=>logs[d]||[]).filter(l=>l.type===type).reduce((s,l)=>s+(l.type==="swim"?(l.dist||0)/1000:(l.dist||0)),0);
  const twDates=Array.from({length:7},(_,i)=>ds(addDays(ws,i)));
  const lwDates=Array.from({length:7},(_,i)=>ds(addDays(ws,i-7)));
  const overloadWarnings=[];
  ["cycle","swim"].forEach(type=>{if(!settings.overloadEnabled)return;const tw=vol(twDates,type),lw=vol(lwDates,type);if(lw>0&&tw>lw*(1+settings.overloadThreshold/100))overloadWarnings.push({type,label:LB[type],pct:Math.round((tw/lw-1)*100),thr:settings.overloadThreshold});});
  {const tw=vol(twDates,"run"),lw=vol(lwDates,"run"),pct=lw>0?Math.round((tw/lw-1)*100):0;if(lw>0){if(settings.runRuleEnabled&&tw>lw*(1+settings.runRuleThreshold/100))overloadWarnings.push({type:"run",label:"Hardlopen",pct,thr:settings.runRuleThreshold,isRun:true});else if(settings.overloadEnabled&&tw>lw*(1+settings.overloadThreshold/100))overloadWarnings.push({type:"run",label:"Hardlopen",pct,thr:settings.overloadThreshold});}}
  const wPlanned=twDates.filter(d=>sched[d]).length;
  const wLogged=twDates.filter(d=>sched[d]&&logs[d]?.find(l=>l.type===sched[d].type)).length;
  const weekColor=wLogged===wPlanned&&wPlanned>0?"#22C55E":wLogged>0?"#F97316":"#64748B";
  const now=new Date();now.setHours(0,0,0,0);
  const getMonthDates=(y,m)=>{const dim=new Date(y,m+1,0).getDate();return Array.from({length:dim},(_,i)=>ds(new Date(y,m,i+1)));};
  const [period,setPeriod]=useState("week");
  const maandDates=getMonthDates(now.getFullYear(),now.getMonth());
  const periodDates=period==="week"?twDates:period==="maand"?maandDates:Array.from({length:22*7},(_,i)=>ds(addDays(START_DATE,i)));
  const periodLabel=period==="week"?`${addDays(ws,0).toLocaleDateString("nl-NL",{day:"numeric",month:"short"})} – ${addDays(ws,6).toLocaleDateString("nl-NL",{day:"numeric",month:"short"})}`:period==="maand"?new Date(maandDates[0]+"T00:00:00").toLocaleDateString("nl-NL",{month:"long",year:"numeric"}):"27 apr – 26 sep 2026";
  const pPlan={swim:0,cycle:0,run:0},pLog={swim:0,cycle:0,run:0};
  periodDates.forEach(d=>{const t=sched[d];if(t&&pPlan[t.type]!==undefined&&t.targetDist)pPlan[t.type]+=(t.type==="swim"?t.targetDist/1000:t.targetDist);(logs[d]||[]).forEach(l=>{if(pLog[l.type]!==undefined)pLog[l.type]+=(l.type==="swim"?(l.dist||0)/1000:(l.dist||0));});});
  const checkDone=checkItems.filter(i=>i.done).length;
  return (
    <div>
      {prNotif&&<div style={{background:`${C[prNotif.type]}22`,border:`1px solid ${C[prNotif.type]}`,borderRadius:12,padding:"12px 14px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:13,color:C[prNotif.type],fontWeight:600}}>{prNotif.msg}</div><button onClick={()=>setPrNotif(null)} style={{background:"none",border:"none",color:S.muted,cursor:"pointer",fontSize:16,lineHeight:1}}>✕</button></div>}
      {overloadWarnings.map(w=><div key={w.type} style={{background:"#7C2D1222",border:"1px solid #F97316",borderRadius:12,padding:"10px 14px",marginBottom:10,display:"flex",gap:10,alignItems:"center"}}><span style={{fontSize:18}}>⚠️</span><div><div style={{fontSize:12,fontWeight:600,color:"#F97316"}}>{w.isRun?"10% regel: ":"Overload: "}te veel {w.label.toLowerCase()} (+{w.pct}%)</div><div style={{fontSize:11,color:S.sub}}>Meer dan {w.thr}% stijging verhoogt blessurerisico</div></div></div>)}
      <div style={{background:"#1a2744",borderRadius:16,padding:20,marginBottom:14,textAlign:"center",border:"1px solid #2D4A8A"}}>
        <div style={{fontSize:52,fontWeight:800,color:"#60A5FA"}}>{daysLeft}</div>
        <div style={{fontSize:13,color:S.sub}}>dagen tot de race 🏁</div>
        <div style={{fontSize:11,color:S.muted,marginTop:4}}>26 september 2026 • Olympische Triathlon</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <div style={{background:S.card,borderRadius:12,padding:14,border:`1px solid ${phase?.color}33`}}>
          <div style={{fontSize:10,color:S.muted}}>Fase</div>
          <div style={{fontSize:18,fontWeight:700,color:phase?.color,marginTop:2}}>{phase?.name}</div>
          <div style={{fontSize:10,color:S.sub,marginTop:1}}>{phase?.desc}</div>
        </div>
        <div style={{background:S.card,borderRadius:12,padding:14,border:`1px solid ${weekColor}33`}}>
          <div style={{fontSize:10,color:S.muted}}>🏅 Deze week</div>
          <div style={{fontSize:18,fontWeight:700,color:weekColor,marginTop:2}}>{wLogged} / {wPlanned}</div>
          <div style={{fontSize:10,color:S.sub,marginTop:1}}>trainingen uitgevoerd</div>
        </div>
      </div>
      <div style={{background:S.card,borderRadius:12,padding:14,marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>Week {curWeek} — Deze week</div>
        <div style={{display:"flex",gap:6}}>
          {wDays.map(({d,dn,t,logged})=><div key={d} onClick={()=>t&&setLogModal({date:d,training:t})} style={{flex:1,borderRadius:10,padding:"8px 2px",textAlign:"center",cursor:t?"pointer":"default",background:logged&&t?C[t.type]+"22":"#0F172A",border:`1px solid ${logged&&t?C[t.type]:d===todayStr?"#F97316":S.border}`,outline:d===todayStr?"2px solid #F97316":"none",outlineOffset:1}}><div style={{fontSize:10,color:S.muted}}>{dn}</div><div style={{fontSize:15,margin:"3px 0"}}>{t?IC[t.type]:"😴"}</div><div style={{fontSize:9,color:logged?"#22C55E":S.muted}}>{logged?"✓":t?"plan":"rust"}</div></div>)}
        </div>
      </div>
      {checkItems.length>0&&<div style={{background:S.card,borderRadius:12,padding:14,marginBottom:14,border:`1px solid ${S.border}`}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><div style={{fontSize:13,fontWeight:600}}>🏁 Checklijst</div><div style={{fontSize:11,color:S.sub}}>{checkDone} / {checkItems.length}</div></div><div style={{height:4,background:"#0F172A",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${checkItems.length?(checkDone/checkItems.length)*100:0}%`,background:"#F97316",borderRadius:4}}/></div></div>}
      <div style={{background:S.card,borderRadius:12,padding:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <div style={{fontSize:13,fontWeight:600}}>Kilometers afgelegd</div>
          <div style={{display:"flex",gap:4}}>{["week","maand","totaal"].map(p=><button key={p} onClick={()=>setPeriod(p)} style={{fontSize:10,padding:"3px 8px",borderRadius:12,cursor:"pointer",fontWeight:period===p?600:400,background:period===p?"#F9731633":"transparent",border:`1px solid ${period===p?"#F97316":S.border}`,color:period===p?"#F97316":S.muted}}>{p}</button>)}</div>
        </div>
        <div style={{fontSize:10,color:S.muted,marginBottom:12}}>{periodLabel}</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {[{icon:"🏊",label:"Zwemmen",key:"swim",color:C.swim},{icon:"🚴",label:"Fietsen",key:"cycle",color:C.cycle},{icon:"🏃",label:"Hardlopen",key:"run",color:C.run}].map(({icon,label,key,color})=>{
            const logged=+pLog[key].toFixed(2),planned=+pPlan[key].toFixed(2),pct=planned>0?Math.min(100,(logged/planned)*100):0;
            return <div key={key}><div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}><span style={{fontSize:13}}>{icon} {label}</span><span style={{fontSize:15,fontWeight:700,color}}>{logged} <span style={{fontSize:11,color:S.muted,fontWeight:400}}>/ {planned} km</span></span></div><div style={{height:5,background:"#0F172A",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:4}}/></div></div>;
          })}
        </div>
      </div>
    </div>
  );
}

function Schema({sched,logs,schemaWeek,setSchemaWeek,setLogModal,setMoveModal,todayStr,today}){
  const phase=getPhase(schemaWeek);
  const ws=addDays(START_DATE,(schemaWeek-1)*7);
  const days=Array.from({length:7},(_,i)=>{const d=ds(addDays(ws,i));const lg=logs[d]?.find(l=>l.type===(sched[d]?.type));return{d,dn:DNF[i],t:sched[d],logged:!!lg,lg,isToday:d===todayStr,isPast:new Date(d)<today};});
  return (
    <div>
      <div style={{display:"flex",gap:6,marginBottom:12,overflowX:"auto",paddingBottom:2}}>
        {PHASES.map(p=><div key={p.name} onClick={()=>setSchemaWeek(p.start)} style={{padding:"5px 10px",borderRadius:20,cursor:"pointer",whiteSpace:"nowrap",fontSize:11,fontWeight:600,background:schemaWeek>=p.start&&schemaWeek<=p.end?p.color+"33":"transparent",border:`1px solid ${schemaWeek>=p.start&&schemaWeek<=p.end?p.color:S.border}`,color:schemaWeek>=p.start&&schemaWeek<=p.end?p.color:S.muted}}>{p.name} {p.start}–{p.end}</div>)}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <button onClick={()=>setSchemaWeek(w=>Math.max(1,w-1))} style={{background:S.card,border:`1px solid ${S.border}`,color:"white",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:16}}>‹</button>
        <div style={{flex:1,textAlign:"center"}}>
          <div style={{fontWeight:600}}>Week {schemaWeek}</div>
          <div style={{fontSize:12,color:"#F97316",marginTop:1}}>{addDays(START_DATE,(schemaWeek-1)*7).toLocaleDateString("nl-NL",{day:"numeric",month:"short"})} – {addDays(START_DATE,(schemaWeek-1)*7+6).toLocaleDateString("nl-NL",{day:"numeric",month:"short"})}</div>
          <div style={{fontSize:11,color:S.sub,marginTop:1}}>{phase?.name} fase — {phase?.desc}</div>
        </div>
        <button onClick={()=>setSchemaWeek(w=>Math.min(22,w+1))} style={{background:S.card,border:`1px solid ${S.border}`,color:"white",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:16}}>›</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {days.map(({d,dn,t,logged,lg,isToday})=>(
          <div key={d} style={{background:S.card,borderRadius:12,padding:14,border:isToday?`1px solid #F97316`:`1px solid ${t?C[t.type]+"33":S.border}`,opacity:!t&&!isToday?0.55:1}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>{t?IC[t.type]:"😴"}</span><div><div style={{fontSize:13,fontWeight:600,color:isToday?"#F97316":"white"}}>{dn}{isToday?" ← vandaag":""}</div><div style={{fontSize:11,color:S.sub}}>{t?t.title:"Rustdag"}</div></div></div>
              {t&&<div style={{display:"flex",gap:6}}><button onClick={()=>setMoveModal({date:d,training:t})} style={{background:"#334155",border:"none",color:S.sub,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:13}}>↔</button><button onClick={()=>setLogModal({date:d,training:t})} style={{background:logged?"#16653433":C[t.type]+"22",border:`1px solid ${logged?"#22C55E":C[t.type]}`,color:logged?"#22C55E":C[t.type],borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>{logged?"✓ Gelogd":"Log"}</button></div>}
            </div>
            {t&&<div style={{marginTop:6,fontSize:11,color:S.muted}}>{t.note}{t.movedFrom&&<span style={{color:"#F97316",marginLeft:8}}>• verplaatst</span>}</div>}
            {logged&&lg&&<div style={{marginTop:6,fontSize:11,color:"#22C55E",background:"#14532D33",borderRadius:6,padding:"4px 8px"}}>✓ {lg.dist} {lg.unit} in {lg.time} min{lg.type==="swim"?` · ${lg.outdoor?"🌊 Open water":"🏊 Binnenbad"}`:""}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stats({logs,allLogs,goals,saveGoals,weights,saveLogs,saveWeights}){
  const [view,setView]=useState("stats");
  if(view==="goals")   return <GoalsPage goals={goals} saveGoals={saveGoals} onBack={()=>setView("stats")}/>;
  if(view==="logboek") return <Logboek logs={logs} weights={weights} saveLogs={saveLogs} saveWeights={saveWeights} onBack={()=>setView("stats")}/>;
  const tt={contentStyle:{background:S.card,border:"none",color:"white",fontSize:11}};
  const xa={tick:{fill:"#64748B",fontSize:9}};
  const ya={tick:{fill:"#64748B",fontSize:9},width:32};
  const weeklyDist=Array.from({length:22},(_,i)=>{const ws=addDays(START_DATE,i*7);const wl=Array.from({length:7},(_,d)=>ds(addDays(ws,d))).flatMap(d=>logs[d]||[]);return{week:`W${i+1}`,sw:+(wl.filter(l=>l.type==="swim").reduce((s,l)=>s+(l.dist||0),0)/1000).toFixed(2),cy:+wl.filter(l=>l.type==="cycle").reduce((s,l)=>s+(l.dist||0),0).toFixed(1),ru:+wl.filter(l=>l.type==="run").reduce((s,l)=>s+(l.dist||0),0).toFixed(1),swT:wl.filter(l=>l.type==="swim").reduce((s,l)=>s+(l.time||0),0),cyT:wl.filter(l=>l.type==="cycle").reduce((s,l)=>s+(l.time||0),0),ruT:wl.filter(l=>l.type==="run").reduce((s,l)=>s+(l.time||0),0)};}).filter(w=>w.sw||w.cy||w.ru);
  const paceData=weeklyDist.map(w=>({week:w.week,runPace:w.ru&&w.ruT?+(w.ruT/w.ru).toFixed(2):null,cycSpeed:w.cy&&w.cyT?+(w.cy/(w.cyT/60)).toFixed(1):null,swimPace:w.sw&&w.swT?+(w.swT/(w.sw*10)).toFixed(2):null})).filter(w=>w.runPace||w.cycSpeed||w.swimPace);
  const best=(arr,key)=>arr.length?arr.reduce((b,l)=>(l[key]||0)>(b[key]||0)?l:b):null;
  const prs={run:best(allLogs.filter(l=>l.type==="run"&&l.dist),"dist"),cycle:best(allLogs.filter(l=>l.type==="cycle"&&l.dist),"dist"),swim:best(allLogs.filter(l=>l.type==="swim"&&l.dist),"dist")};
  const swimLogs=allLogs.filter(l=>l.type==="swim");
  const swimTotal=+(swimLogs.reduce((s,l)=>s+(l.dist||0),0)/1000).toFixed(2);
  const swimIndoor=+(swimLogs.filter(l=>!l.outdoor).reduce((s,l)=>s+(l.dist||0),0)/1000).toFixed(2);
  const swimOutdoor=+(swimLogs.filter(l=>l.outdoor).reduce((s,l)=>s+(l.dist||0),0)/1000).toFixed(2);
  const goalMeta={run:{label:"🏃 Hardlopen",color:C.run,fmt:v=>`${minsToTime(v)}/km`},cycle:{label:"🚴 Fietsen",color:C.cycle,fmt:v=>`${v} km/h`},swim:{label:"🏊 Zwemmen",color:C.swim,fmt:v=>`${minsToTime(v)}/100m`}};
  const weightChartData=weights.map(w=>({d:new Date(w.d+"T00:00:00").toLocaleDateString("nl-NL",{day:"numeric",month:"short"}),kg:w.kg}));
  const wMin=weights.length?Math.floor(Math.min(...weights.map(w=>w.kg))-1):60;
  const wMax=weights.length?Math.ceil(Math.max(...weights.map(w=>w.kg))+1):100;
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div style={{fontSize:15,fontWeight:600}}>Statistieken</div><button onClick={()=>setView("logboek")} style={{fontSize:11,padding:"4px 10px",borderRadius:20,cursor:"pointer",fontWeight:600,background:"#334155",border:"1px solid #475569",color:"#94A3B8"}}>📖 Logboek</button></div>
      {swimTotal>0&&<div style={{background:S.card,borderRadius:12,padding:14,marginBottom:14,border:`1px solid ${C.swim}33`}}><div style={{fontSize:12,color:S.sub,marginBottom:10}}>🏊 Zwemmen — verdeling</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,textAlign:"center"}}>{[{l:"Totaal",v:swimTotal,c:"white"},{l:"🏊 Binnenbad",v:swimIndoor,c:C.swim},{l:"🌊 Open water",v:swimOutdoor,c:"#34D399"}].map(({l,v,c})=><div key={l}><div style={{fontSize:10,color:S.muted,marginBottom:3}}>{l}</div><div style={{fontSize:16,fontWeight:700,color:c}}>{v}</div><div style={{fontSize:10,color:S.muted}}>km</div></div>)}</div></div>}
      {weightChartData.length>0&&<div style={{background:S.card,borderRadius:12,padding:14,marginBottom:14,border:"1px solid #3B82F633"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><div style={{fontSize:12,color:S.sub}}>⚖️ Gewichtsverloop (kg)</div>{weightChartData.length>1&&<div style={{fontSize:11,color:weightChartData[weightChartData.length-1].kg<weightChartData[0].kg?"#22C55E":"#EF4444"}}>{weightChartData[weightChartData.length-1].kg<weightChartData[0].kg?"↓":"↑"} {Math.abs(weightChartData[weightChartData.length-1].kg-weightChartData[0].kg).toFixed(1)} kg</div>}</div><ResponsiveContainer width="100%" height={120}><LineChart data={weightChartData}><XAxis dataKey="d" {...xa}/><YAxis domain={[wMin,wMax]} {...ya} width={36} tickFormatter={v=>`${v}kg`}/><Tooltip {...tt} formatter={v=>[`${v} kg`,"Gewicht"]}/><Line type="monotone" dataKey="kg" stroke="#3B82F6" strokeWidth={2} dot={{r:3,fill:"#3B82F6"}} activeDot={{r:5}}/></LineChart></ResponsiveContainer></div>}
      <div style={{background:S.card,borderRadius:12,padding:14,marginBottom:18}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontSize:13,fontWeight:600}}>🎯 Doelen</div><button onClick={()=>setView("goals")} style={{fontSize:11,padding:"5px 12px",borderRadius:20,cursor:"pointer",fontWeight:600,background:"#334155",border:"1px solid #475569",color:"#94A3B8"}}>Aanpassen</button></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>{Object.entries(goalMeta).map(([key,m])=><div key={key} style={{textAlign:"center"}}><div style={{fontSize:10,color:S.muted}}>{m.label}</div><div style={{fontSize:14,fontWeight:700,color:m.color,marginTop:2}}>{m.fmt(goals[key])}</div></div>)}</div></div>
      <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>📏 Afstand per week</div>
      {!weeklyDist.length?<div style={{textAlign:"center",color:S.muted,padding:"30px 0",marginBottom:16,background:S.card,borderRadius:12}}><div style={{fontSize:32,marginBottom:8}}>📊</div><div style={{fontSize:13}}>Log je eerste trainingen!</div></div>:(
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>{[{key:"ru",label:"🏃 Hardlopen (km)",c:C.run},{key:"cy",label:"🚴 Fietsen (km)",c:C.cycle},{key:"sw",label:"🏊 Zwemmen (km)",c:C.swim}].map(({key,label,c})=><div key={key} style={{background:S.card,borderRadius:12,padding:14}}><div style={{fontSize:12,color:S.sub,marginBottom:8}}>{label}</div><ResponsiveContainer width="100%" height={100}><BarChart data={weeklyDist}><XAxis dataKey="week" {...xa}/><YAxis {...ya}/><Tooltip {...tt}/><Bar dataKey={key} fill={c} radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div>)}</div>
      )}
      <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>⚡ Snelheid & tempo per week</div>
      {!paceData.length?<div style={{textAlign:"center",color:S.muted,padding:"20px 0",marginBottom:16,background:S.card,borderRadius:12}}><div style={{fontSize:12}}>Vul tijd in bij je trainingen om tempo te zien</div></div>:(
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>{[{key:"runPace",label:"🏃 Looptempo (min/km)",c:C.run,goal:goals.run,inv:true,fmt:minsToTime,gfmt:v=>`Doel ${minsToTime(v)}/km`},{key:"cycSpeed",label:"🚴 Fietssnelheid (km/h)",c:C.cycle,goal:goals.cycle,inv:false,fmt:v=>Math.round(v),gfmt:v=>`Doel ${v} km/h`},{key:"swimPace",label:"🏊 Zwemtempo (min/100m)",c:C.swim,goal:goals.swim,inv:true,fmt:minsToTime,gfmt:v=>`Doel ${minsToTime(v)}/100m`}].map(({key,label,c,goal,inv,fmt,gfmt})=>{const data=paceData.filter(w=>w[key]);if(!data.length)return null;const vals=data.map(w=>w[key]),mn=Math.floor(Math.min(...vals,goal)*.92),mx=Math.ceil(Math.max(...vals,goal)*1.08);return <div key={key} style={{background:S.card,borderRadius:12,padding:14}}><div style={{fontSize:12,color:S.sub,marginBottom:8}}>{label}</div><ResponsiveContainer width="100%" height={110}><LineChart data={data}><XAxis dataKey="week" {...xa}/><YAxis domain={inv?[mx,mn]:[mn,mx]} tickFormatter={fmt} {...ya} width={38}/><Tooltip {...tt} formatter={(v,n)=>n===key?[`${fmt(v)} ${key==="cycSpeed"?"km/h":"/km"}`,"Tempo"]:[v,n]}/><ReferenceLine y={goal} stroke={c} strokeDasharray="4 3" strokeWidth={1.5} label={{value:gfmt(goal),position:"insideTopRight",fill:c,fontSize:9}}/><Line type="monotone" dataKey={key} stroke={c} strokeWidth={2} dot={{r:3,fill:c}} activeDot={{r:5}}/></LineChart></ResponsiveContainer><div style={{fontSize:10,color:S.muted,marginTop:4}}>{inv?"Lager = sneller":"Hoger = sneller"} • stippellijn = jouw doel</div></div>;})}</div>
      )}
      <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>🏆 Persoonlijke records</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>{[{label:"🏃 Langste loop",data:prs.run},{label:"🚴 Langste rit",data:prs.cycle},{label:"🏊 Langste zwem",data:prs.swim}].map(({label,data})=><div key={label} style={{background:S.card,borderRadius:12,padding:14}}><div style={{fontSize:12,color:S.sub}}>{label}</div>{data?<div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span style={{fontWeight:600}}>{data.dist} {data.unit}</span><span style={{color:"#F97316"}}>{data.time} min · {new Date(data.d+"T00:00:00").toLocaleDateString("nl-NL",{day:"numeric",month:"short"})}</span></div>:<div style={{fontSize:12,color:S.muted,marginTop:4}}>Nog geen data</div>}</div>)}</div>
    </div>
  );
}

function GoalsPage({goals,saveGoals,onBack}){
  const [draft,setDraft]=useState({...goals});
  const meta={run:{label:"🏃 Hardlopen",unit:"min/km",desc:"Doel looptempo per kilometer",step:"0.1"},cycle:{label:"🚴 Fietsen",unit:"km/h",desc:"Doel gemiddelde fietssnelheid",step:"0.5"},swim:{label:"🏊 Zwemmen",unit:"min/100m",desc:"Doel zwemtempo per 100 meter",step:"0.1"}};
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}><button onClick={onBack} style={{background:S.card,border:`1px solid ${S.border}`,color:"white",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:14}}>‹</button><div style={{fontSize:15,fontWeight:600}}>Doelen aanpassen</div></div>
      <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:24}}>{Object.entries(meta).map(([key,m])=><div key={key} style={{background:S.card,borderRadius:12,padding:16,border:`1px solid ${S.border}`}}><div style={{fontSize:13,fontWeight:600,marginBottom:2}}>{m.label}</div><div style={{fontSize:11,color:S.muted,marginBottom:10}}>{m.desc}</div><div style={{display:"flex",alignItems:"center",gap:10}}><input value={draft[key]} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))} type="number" step={m.step} style={{flex:1,background:"#0F172A",border:`1px solid ${S.border}`,borderRadius:8,padding:"10px 12px",color:"white",fontSize:16,boxSizing:"border-box"}}/><span style={{fontSize:13,color:S.sub,whiteSpace:"nowrap"}}>{m.unit}</span></div></div>)}</div>
      <button onClick={()=>{const g={};Object.keys(draft).forEach(k=>g[k]=parseFloat(draft[k])||goals[k]);saveGoals(g);onBack();}} style={{width:"100%",padding:13,background:"#F97316",border:"none",borderRadius:10,color:"white",fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:10}}>💾 Opslaan</button>
      <button onClick={onBack} style={{width:"100%",padding:13,background:"transparent",border:`1px solid ${S.border}`,borderRadius:10,color:S.sub,fontSize:14,cursor:"pointer"}}>Annuleren</button>
    </div>
  );
}

function Logboek({logs,weights,saveLogs,saveWeights,onBack}){
  const touchY=useRef(null);
  const onTS=e=>{touchY.current=e.touches[0].clientY;};
  const onTE=e=>{if(touchY.current!==null&&e.changedTouches[0].clientY-touchY.current>60)onBack();touchY.current=null;};

  const deleteTraining=async(d)=>{
    const nl={...logs}; delete nl[d]; await saveLogs(nl);
  };
  const deleteWeight=async(d)=>{
    await saveWeights(weights.filter(w=>w.d!==d));
  };

  const trainEntries=Object.entries(logs).flatMap(([d,arr])=>arr.map(e=>({...e,d,kind:"training"})));
  const weightEntries=weights.map(w=>({...w,kind:"weight"}));
  const all=[...trainEntries,...weightEntries].sort((a,b)=>b.d.localeCompare(a.d)).slice(0,100);
  return (
    <div onTouchStart={onTS} onTouchEnd={onTE}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}><button onClick={onBack} style={{background:S.card,border:`1px solid ${S.border}`,color:"white",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:14}}>‹</button><div style={{fontSize:15,fontWeight:600}}>Logboek</div></div>
      {!all.length&&<div style={{textAlign:"center",color:S.muted,padding:"40px 0"}}><div style={{fontSize:36,marginBottom:10}}>🏁</div><div>Nog geen activiteiten gelogd.</div></div>}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {all.map((e,i)=>{
          if(e.kind==="weight") return (
            <div key={`w${i}`} style={{background:S.card,borderRadius:12,padding:14,border:"1px solid #3B82F633"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:18}}>⚖️</span><div><div style={{fontWeight:600,fontSize:13}}>Gewicht gelogd</div><div style={{fontSize:11,color:S.sub}}>{new Date(e.d+"T00:00:00").toLocaleDateString("nl-NL",{weekday:"long",day:"numeric",month:"short"})}</div></div></div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{color:"#3B82F6",fontWeight:700,fontSize:16}}>{e.kg} kg</div>
                  <button onClick={()=>deleteWeight(e.d)} style={{background:"#EF444422",border:"1px solid #EF4444",borderRadius:6,padding:"4px 8px",color:"#EF4444",cursor:"pointer",fontSize:11}}>✕</button>
                </div>
              </div>
            </div>
          );
          return (
            <div key={`t${i}`} style={{background:S.card,borderRadius:12,padding:14,border:`1px solid ${C[e.type]||"#334155"}33`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:18}}>{IC[e.type]}</span><div><div style={{fontWeight:600,fontSize:13}}>{LB[e.type]}</div><div style={{fontSize:11,color:S.sub}}>{new Date(e.d+"T00:00:00").toLocaleDateString("nl-NL",{weekday:"long",day:"numeric",month:"short"})}</div></div></div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{textAlign:"right"}}><div style={{color:C[e.type]||"white",fontWeight:700}}>{e.dist} {e.unit}</div><div style={{fontSize:11,color:S.sub}}>{e.time} min{e.type==="swim"?` · ${e.outdoor?"🌊":"🏊"}`:""}</div></div>
                  <button onClick={()=>deleteTraining(e.d)} style={{background:"#EF444422",border:"1px solid #EF4444",borderRadius:6,padding:"4px 8px",color:"#EF4444",cursor:"pointer",fontSize:11}}>✕</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LogModal({date,training,existing,onSave,onClose}){
  const [dist,setDist]=useState(existing?.dist??training?.targetDist??"");
  const [time,setTime]=useState(existing?.time??"");
  const [outdoor,setOutdoor]=useState(existing?.outdoor??false);
  const inp={width:"100%",background:"#0F172A",border:`1px solid ${S.border}`,borderRadius:8,padding:"10px 12px",color:"white",fontSize:15,boxSizing:"border-box"};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-end",zIndex:200}}>
      <div style={{background:S.card,width:"100%",borderRadius:"20px 20px 0 0",padding:22,maxWidth:520,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><div style={{fontWeight:600,fontSize:15}}>{IC[training.type]} Training loggen</div><button onClick={onClose} style={{background:"none",border:"none",color:S.sub,fontSize:20,cursor:"pointer",lineHeight:1}}>✕</button></div>
        <div style={{fontSize:12,color:S.muted,marginBottom:18}}>{new Date(date+"T00:00:00").toLocaleDateString("nl-NL",{weekday:"long",day:"numeric",month:"long"})} · {training.title}</div>
        <div style={{marginBottom:14}}><div style={{fontSize:11,color:S.sub,marginBottom:4}}>Afstand ({training.unit||"km"}) — doel: {training.targetDist} {training.unit}</div><input value={dist} onChange={e=>setDist(e.target.value)} type="number" step="0.1" style={inp} placeholder={`${training.targetDist}`}/></div>
        <div style={{marginBottom:training.type==="swim"?16:22}}><div style={{fontSize:11,color:S.sub,marginBottom:4}}>Tijd (minuten)</div><input value={time} onChange={e=>setTime(e.target.value)} type="number" style={inp} placeholder="bijv. 35"/></div>
        {training.type==="swim"&&<div style={{marginBottom:22}}><div style={{fontSize:11,color:S.sub,marginBottom:8}}>Locatie</div><div style={{display:"flex",gap:8}}>{[{v:false,l:"🏊 Binnenbad"},{v:true,l:"🌊 Open water"}].map(({v,l})=><button key={String(v)} onClick={()=>setOutdoor(v)} style={{flex:1,padding:"10px 0",borderRadius:8,cursor:"pointer",fontWeight:outdoor===v?600:400,background:outdoor===v?C.swim+"33":"transparent",border:`1px solid ${outdoor===v?C.swim:S.border}`,color:outdoor===v?C.swim:"white",fontSize:13}}>{l}</button>)}</div></div>}
        <button onClick={()=>onSave({type:training.type,dist:parseFloat(dist)||0,unit:training.unit||"km",time:parseInt(time)||0,outdoor:training.type==="swim"?outdoor:undefined,d:date})} style={{width:"100%",padding:13,background:C[training.type],border:"none",borderRadius:10,color:"white",fontSize:15,fontWeight:700,cursor:"pointer"}}>{existing?"✏️ Wijzig":"💾 Opslaan"}</button>
      </div>
    </div>
  );
}

function MoveModal({date,training,sched,onMove,onClose}){
  const getMonday=str=>{const d=new Date(str+"T00:00:00"),day=d.getDay();return addDays(d,day===0?-6:1-day);};
  const [weekStart,setWeekStart]=useState(()=>getMonday(date));
  const [selected,setSelected]=useState(null);
  const touchX=useRef(null);
  const onTS=e=>{touchX.current=e.touches[0].clientX;};
  const onTE=e=>{if(touchX.current===null)return;const diff=e.changedTouches[0].clientX-touchX.current;if(Math.abs(diff)>40)setWeekStart(w=>addDays(w,diff<0?7:-7));touchX.current=null;};
  const weekDays=Array.from({length:7},(_,i)=>{const d=addDays(weekStart,i),dStr=ds(d);return{dStr,dn:DN[i],dayNum:d.getDate(),mon:d.toLocaleDateString("nl-NL",{month:"short"}),t:sched[dStr],isOrig:dStr===date,isSel:dStr===selected};});
  const wLabel=`${addDays(weekStart,0).toLocaleDateString("nl-NL",{day:"numeric",month:"short"})} – ${addDays(weekStart,6).toLocaleDateString("nl-NL",{day:"numeric",month:"short"})}`;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-end",zIndex:200}}>
      <div style={{background:S.card,width:"100%",borderRadius:"20px 20px 0 0",padding:22,maxWidth:520,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><div style={{fontWeight:600,fontSize:15}}>↔ Training verplaatsen</div><button onClick={onClose} style={{background:"none",border:"none",color:S.sub,fontSize:20,cursor:"pointer",lineHeight:1}}>✕</button></div>
        <div style={{fontSize:12,color:S.muted,marginBottom:16}}>{IC[training.type]} {training.title}</div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><button onClick={()=>setWeekStart(w=>addDays(w,-7))} style={{background:"#334155",border:"none",color:"white",borderRadius:6,padding:"4px 12px",cursor:"pointer",fontSize:16}}>‹</button><div style={{flex:1,textAlign:"center",fontSize:12,color:S.sub}}>{wLabel}</div><button onClick={()=>setWeekStart(w=>addDays(w,7))} style={{background:"#334155",border:"none",color:"white",borderRadius:6,padding:"4px 12px",cursor:"pointer",fontSize:16}}>›</button></div>
        <div onTouchStart={onTS} onTouchEnd={onTE} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5,marginBottom:18}}>
          {weekDays.map(({dStr,dn,dayNum,mon,t,isOrig,isSel})=><div key={dStr} onClick={()=>!isOrig&&setSelected(dStr)} style={{borderRadius:8,padding:"8px 2px",textAlign:"center",cursor:isOrig?"not-allowed":"pointer",background:isSel?"#F9731633":isOrig?"#33415544":"#0F172A",border:`1px solid ${isSel?"#F97316":isOrig?"#64748B":"#334155"}`,opacity:isOrig?.45:1}}><div style={{fontSize:9,color:S.muted,marginBottom:1}}>{dn}</div><div style={{fontSize:14,fontWeight:isSel?600:400,color:isSel?"#F97316":"white"}}>{dayNum}</div><div style={{fontSize:9,color:S.muted,marginBottom:3}}>{mon}</div><div style={{fontSize:15,minHeight:18}}>{t?IC[t.type]:"·"}</div></div>)}
        </div>
        <button onClick={()=>selected&&onMove(selected)} style={{width:"100%",padding:13,background:selected?"#F97316":"#334155",border:"none",borderRadius:10,color:"white",fontSize:15,fontWeight:700,cursor:selected?"pointer":"not-allowed"}}>{selected?`↔ Verplaatsen naar ${new Date(selected+"T00:00:00").toLocaleDateString("nl-NL",{weekday:"short",day:"numeric",month:"short"})}`:"Selecteer een dag"}</button>
      </div>
    </div>
  );
}
