import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import initSetsData from "./data/words.json";
import collocationsData from "./data/collocations.json";

/* ================================================================
   STORAGE KEYS
   - SYNC_ keys  → window.storage (shared=true, cross-device)
   - LOCAL_ keys → localStorage (per-device)
================================================================ */
const SYNC_CUSTOM   = "fr_custom_v7";      // カスタムセット（全端末共有）
const SYNC_PRIORITY = "fr_priority_v7";    // ★優先度上書き（全端末共有）
const SYNC_RECORDS  = "fr_records_v7";     // 学習履歴（全端末共有）
const SYNC_SRS      = "fr_srs_v7";         // SRS（全端末共有）
const LOCAL_ACCOUNT = "fr_account_v7";
const LOCAL_RECORDS = (a) => `fr_records_v7_${a}`;
const LOCAL_SRS     = (a) => `fr_srs_v7_${a}`;

/* ================================================================
   localStorage helpers
================================================================ */
function lsGet(k, fb) {
  try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; }
}
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore quota/private mode errors */ } }

/* ================================================================
   window.storage sync helpers
   window.storage.get / set / delete / list  (shared=true で全端末共有)
================================================================ */
async function syncGet(key, fallback) {
  try {
    const r = await window.storage.get(key, true);
    if (!r) return fallback;
    return typeof r.value === "string" ? JSON.parse(r.value) : fallback;
  } catch { return fallback; }
}
async function syncSet(key, val) {
  await window.storage.set(key, JSON.stringify(val), true);
}

function syncWrap(data) { return { version: 1, updatedAt: Date.now(), data }; }
function syncUnwrap(raw, fallback) {
  if (raw && typeof raw === "object" && "data" in raw) return raw.data ?? fallback;
  return raw ?? fallback;
}

/* ================================================================
   SRS
================================================================ */
const SRS_DAYS = [0, 1, 3, 7, 14];
function srsNextLevel(prev, ratio) {
  if (ratio >= 1.0) return Math.min(prev + 1, 4);
  if (ratio >= 0.75) return prev;
  return Math.max(prev - 1, 0);
}
function srsDue(level) {
  const d = new Date(); d.setDate(d.getDate() + SRS_DAYS[level]);
  return d.toISOString().slice(0, 10);
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function buildQueue(pool, srs, count) {
  const t = todayStr();
  return pool
    .map(s => {
      const st = srs[s.id] || { level: 0, due: "0000-00-00" };
      return { s, urgency: st.due <= t ? 0 : 1, level: st.level, due: st.due };
    })
    .sort((a, b) => a.urgency - b.urgency || a.level - b.level || a.due.localeCompare(b.due))
    .slice(0, count)
    .map(x => x.s);
}

/* ================================================================
   INITIAL SETS  owner: child | parent | shared
================================================================ */
const DATASET_SOURCES = {
  words: { label: "words", data: initSetsData },
  collocations: { label: "collocations", data: collocationsData },
};

function importanceToPriority(raw) {
  if (typeof raw !== "string") return 1;
  const stars = (raw.match(/★/g) || []).length;
  return Math.max(0, Math.min(3, stars || 1));
}

function normalizeSourceSets(sourceKey, sourceData) {
  if (!Array.isArray(sourceData)) return [];
  if (sourceData.every(row => row && Array.isArray(row.items) && row.id)) {
    return sourceData;
  }
  if (sourceData.every(row => row && typeof row.words === "string")) {
    const grouped = {};
    sourceData.forEach((row) => {
      const category = (row.category || "Collocations").trim();
      const phrase = (row.words || "").trim();
      if (!phrase) return;
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push({ phrase, importance: row.importance });
    });
    return Object.entries(grouped).map(([category, rows], i) => ({
      id: `${sourceKey}_col_${String(i + 1).padStart(2, "0")}`,
      mode: "collocation",
      owner: "child",
      label: category,
      priority: rows.reduce((m, r) => Math.max(m, importanceToPriority(r.importance)), 1),
      items: rows.map(r => r.phrase),
    }));
  }
  return [];
}

const MODE_META = {
  chunk:       { label:"Phonics Chunks",  emoji:"🧩", color:"#7ee8a2" },
  collocation: { label:"Collocations",    emoji:"💬", color:"#f8a5c2" },
  sentence:    { label:"Short Sentences", emoji:"📖", color:"#a29bfe" },
  cvc:         { label:"CVC Warm-up",     emoji:"🔤", color:"#80ff72" },
};
const OWNER_META = {
  child:  { label:"子ども用", emoji:"👦", color:"#7ee8a2" },
  parent: { label:"保護者用", emoji:"🔑", color:"#f8a5c2" },
  shared: { label:"共通",     emoji:"🌐", color:"#a29bfe" },
};
const STAR_LABELS = ["★0","★1","★2","★3"];
const STAR_COLORS = ["#7f8c8d","#aaa","#f8d76b","#ff9f43"];
const FLASH_TIMES = [1, 2, 3, 5];
const SESSION_SIZE = 5;
const MAX_DAYS = 365;

/* ================================================================
   CONFIRM DIALOG
================================================================ */
function ConfirmDialog({ msg, sub, okLabel="OK", okColor="#ff7675", onOk, onCancel }) {
  return (
    <div style={{position:"fixed",inset:0,zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.72)",backdropFilter:"blur(8px)"}}>
      <div style={{background:"#1a1535",border:"1px solid rgba(255,255,255,.18)",borderRadius:22,padding:"28px 24px",maxWidth:360,width:"90%",textAlign:"center",boxShadow:"0 24px 60px rgba(0,0,0,.8)"}}>
        <div style={{fontSize:15,fontWeight:800,color:"#fff",lineHeight:1.55,marginBottom:sub?10:20,whiteSpace:"pre-wrap"}}>{msg}</div>
        {sub && <div style={{fontSize:11,opacity:.6,marginBottom:18,lineHeight:1.7,textAlign:"left",background:"rgba(255,255,255,.06)",borderRadius:10,padding:"8px 12px",maxHeight:150,overflowY:"auto",whiteSpace:"pre-wrap"}}>{sub}</div>}
        <div style={{display:"flex",gap:10}}>
          <button onClick={onCancel} style={{flex:1,background:"rgba(255,255,255,.08)",color:"#fff",border:"1px solid rgba(255,255,255,.15)",borderRadius:12,padding:"11px 0",fontWeight:800,fontSize:13,cursor:"pointer"}}>キャンセル</button>
          <button onClick={onOk}     style={{flex:1,background:okColor,color:"#fff",border:"none",borderRadius:12,padding:"11px 0",fontWeight:800,fontSize:13,cursor:"pointer"}}>{okLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   DUAL LINE CHART
================================================================ */
function DualLineChart({ data }) {
  const [tip, setTip] = useState(null);
  if (!data || !data.length) return <div style={{textAlign:"center",opacity:.3,padding:"24px 0",fontSize:12}}>まだデータがありません</div>;
  const W=460,H=160,PL=42,PR=12,PT=16,PB=34;
  const iW=W-PL-PR, iH=H-PT-PB;
  const maxV = Math.max(...data.map(d=>d.words), 1);
  const px = i => PL + (data.length < 2 ? iW/2 : i/(data.length-1)*iW);
  const py = v => PT + iH - (v/maxV)*iH;
  const pW = data.map((d,i)=>[px(i),py(d.words)]);
  const pC = data.map((d,i)=>[px(i),py(d.correct)]);
  const linePath = pts => pts.map((p,i)=>`${i?"L":"M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const areaPath = pts => { const p=linePath(pts); return `${p} L${pts[pts.length-1][0].toFixed(1)},${(PT+iH).toFixed(1)} L${pts[0][0].toFixed(1)},${(PT+iH).toFixed(1)} Z`; };
  const yT=[0,Math.round(maxV/2),maxV];
  const xI=data.length<=8?data.map((_,i)=>i):[0,1,2,3,4,5,6,7].map(i=>Math.round(i*(data.length-1)/7));
  const CW="#7ee8a2",CC="#f8d76b";
  const onMv = e => {
    const r=e.currentTarget.getBoundingClientRect(), mx=(e.clientX-r.left)*(W/r.width);
    let best=null,bd=9999;
    pW.forEach(([x],i)=>{const d=Math.abs(x-mx);if(d<bd){bd=d;best=i;}});
    setTip(best!==null&&bd<24?{i:best}:null);
  };
  return (
    <div>
      <div style={{display:"flex",gap:14,marginBottom:6,fontSize:11,justifyContent:"flex-end"}}>
        {[[CW,"総語数"],[CC,"正答数"]].map(([c,l])=>(
          <span key={l} style={{display:"flex",alignItems:"center",gap:4,opacity:.75}}>
            <span style={{width:18,height:2,background:c,borderRadius:2,display:"inline-block"}}/>{l}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",maxWidth:W,display:"block"}} onMouseMove={onMv} onMouseLeave={()=>setTip(null)}>
        <defs>
          <linearGradient id="lgW7" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CW} stopOpacity=".15"/><stop offset="100%" stopColor={CW} stopOpacity="0"/></linearGradient>
          <linearGradient id="lgC7" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CC} stopOpacity=".12"/><stop offset="100%" stopColor={CC} stopOpacity="0"/></linearGradient>
        </defs>
        {yT.map((v,i)=>(
          <g key={i}>
            <line x1={PL} y1={py(v)} x2={PL+iW} y2={py(v)} stroke="rgba(255,255,255,.06)" strokeWidth="1"/>
            <text x={PL-5} y={py(v)+4} fill="rgba(255,255,255,.28)" fontSize="9" textAnchor="end">{v}</text>
          </g>
        ))}
        <path d={areaPath(pW)} fill="url(#lgW7)"/><path d={areaPath(pC)} fill="url(#lgC7)"/>
        <path d={linePath(pW)} fill="none" stroke={CW} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d={linePath(pC)} fill="none" stroke={CC} strokeWidth="2"   strokeLinecap="round" strokeLinejoin="round"/>
        {pW.map(([x,y],i)=><circle key={`w${i}`} cx={x} cy={y} r="3.5" fill={CW} stroke="#0d0b1e" strokeWidth="1.5"/>)}
        {pC.map(([x,y],i)=><circle key={`c${i}`} cx={x} cy={y} r="3.5" fill={CC} stroke="#0d0b1e" strokeWidth="1.5"/>)}
        {[...new Set(xI)].map(i=><text key={i} x={pW[i][0]} y={H-4} fill="rgba(255,255,255,.28)" fontSize="8" textAnchor="middle">{data[i].date.slice(5)}</text>)}
        {tip&&(()=>{
          const d=data[tip.i],tx=Math.min(Math.max(pW[tip.i][0]-44,PL),W-92),ty=Math.max(Math.min(pW[tip.i][1],pC[tip.i][1])-32,PT);
          return(
            <g>
              <line x1={pW[tip.i][0]} y1={PT} x2={pW[tip.i][0]} y2={PT+iH} stroke="rgba(255,255,255,.12)" strokeWidth="1" strokeDasharray="3,3"/>
              <rect x={tx} y={ty} width="88" height="34" rx="7" fill="rgba(10,8,32,.95)" stroke="rgba(255,255,255,.2)" strokeWidth="1"/>
              <text x={tx+44} y={ty+12} fill="rgba(255,255,255,.5)" fontSize="8" textAnchor="middle">{d.date.slice(5)}</text>
              <text x={tx+5}  y={ty+26} fill={CW} fontSize="9" fontWeight="bold">総:{d.words}</text>
              <text x={tx+48} y={ty+26} fill={CC} fontSize="9" fontWeight="bold">正:{d.correct}</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

/* ================================================================
   SMALL UI HELPERS
================================================================ */
function Chip({label,active,color,onClick}){
  return <button onClick={onClick} style={{background:active?`${color}22`:"rgba(255,255,255,.05)",color:active?color:"rgba(255,255,255,.4)",border:`1px solid ${active?color+"55":"rgba(255,255,255,.08)"}`,borderRadius:9,padding:"5px 11px",fontSize:11,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>{label}</button>;
}
function StarBtn({star,active,onClick}){
  const C=STAR_COLORS[star];
  return <button onClick={onClick} style={{flex:1,background:active?C:"rgba(255,255,255,.07)",color:active?"#0d0b1e":"rgba(255,255,255,.45)",border:`1px solid ${active?C:"rgba(255,255,255,.1)"}`,borderRadius:10,padding:"8px 4px",fontWeight:800,fontSize:11,cursor:"pointer",boxShadow:active?`0 3px 12px ${C}44`:"none"}}>{`${STAR_LABELS[star]} ${star===0?"導入":star===1?"低":star===2?"中":"高"}`}</button>;
}
function Sec({label,children}){
  return <div style={{marginBottom:11}}><div style={{fontSize:10,opacity:.35,letterSpacing:1.5,marginBottom:6}}>{label}</div>{children}</div>;
}
function Btn({children,color="#7ee8a2",ghost=false,small=false,onClick,style:sx={}}){
  return <button onClick={onClick} style={{background:ghost?"rgba(255,255,255,.07)":`linear-gradient(135deg,${color},${color}cc)`,color:ghost?"#fff":"#0d0b1e",border:ghost?"1px solid rgba(255,255,255,.15)":"none",borderRadius:12,padding:small?"7px 13px":"12px 18px",fontSize:small?11:14,fontWeight:800,cursor:"pointer",width:small?"auto":"100%",marginTop:small?0:8,boxShadow:ghost?"none":`0 4px 18px ${color}44`,...sx}}>{children}</button>;
}
function Dots(){
  const D=Array.from({length:14},(_,i)=>({l:`${(i*43+9)%100}%`,t:`${(i*61+17)%100}%`,s:(i%3)+2,dur:(i%4)+5,del:i%5,op:.03+(i%4)*.015}));
  return(
    <div style={{position:"fixed",inset:0,pointerEvents:"none",overflow:"hidden"}}>
      {D.map((d,i)=><div key={i} style={{position:"absolute",left:d.l,top:d.t,width:d.s,height:d.s,borderRadius:"50%",background:"#fff",opacity:d.op,animation:`fd${i%3} ${d.dur}s ease-in-out ${d.del}s infinite alternate`}}/>)}
      <style>{`
        @keyframes fd0{from{transform:translateY(0)}to{transform:translateY(-16px)}}
        @keyframes fd1{from{transform:translateY(0) scale(1)}to{transform:translateY(-20px) scale(1.3)}}
        @keyframes fd2{from{transform:translateY(0)}to{transform:translateY(-12px)}}
        @keyframes pop{from{opacity:0;transform:scale(.88)}to{opacity:1;transform:scale(1)}}
        @keyframes bop{0%,100%{transform:scale(1)}40%{transform:scale(1.28)}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
    </div>
  );
}

/* 同期ステータスバッジ */
function SyncBadge({status}){
  const cfg={
    syncing: {color:"#f8d76b",text:"同期中…",spin:true},
    ok:      {color:"#7ee8a2",text:"同期済み",spin:false},
    error:   {color:"#ff7675",text:"同期失敗",spin:false},
    idle:    {color:"rgba(255,255,255,.28)",text:"クラウド同期",spin:false},
  }[status]||{color:"rgba(255,255,255,.28)",text:"",spin:false};
  return(
    <span style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:cfg.color,opacity:.85,userSelect:"none"}}>
      <span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:cfg.color,animation:cfg.spin?"spin .8s linear infinite":"none",boxShadow:`0 0 4px ${cfg.color}`}}/>
      {cfg.text}
    </span>
  );
}

function AppAccountBar({ account, screen, syncStatus, onSwitchAccount, onSetScreen, onPull }) {
  return (
    <div style={{position:"fixed",top:0,left:0,right:0,zIndex:200,display:"flex",justifyContent:"center",padding:"6px 16px",background:"rgba(13,11,30,.92)",backdropFilter:"blur(14px)",borderBottom:"1px solid rgba(255,255,255,.07)"}}>
      <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap",justifyContent:"center",width:"100%",maxWidth:600}}>
        {[["child","👦 子ども"],["parent","🔑 保護者"]].map(([key,label])=>(
          <button key={key} onClick={()=>onSwitchAccount(key)} style={{background:account===key?"rgba(255,255,255,.16)":"transparent",color:account===key?"#fff":"rgba(255,255,255,.35)",border:`1px solid ${account===key?"rgba(255,255,255,.26)":"transparent"}`,borderRadius:10,padding:"5px 12px",fontWeight:800,fontSize:12,cursor:"pointer"}}>{label}</button>
        ))}
        <div style={{width:1,height:14,background:"rgba(255,255,255,.18)",margin:"0 2px"}}/>
        {[["home","🏠"],["dashboard","📊"],...(account==="parent"?[["admin","⚙"],["addset","＋"]]:[])]
          .map(([s,icon])=>(
          <button key={s} onClick={()=>onSetScreen(s)} style={{background:screen===s?"rgba(248,165,194,.2)":"transparent",color:screen===s?"#f8a5c2":"rgba(255,255,255,.4)",border:"none",borderRadius:8,padding:"4px 9px",fontWeight:800,fontSize:13,cursor:"pointer"}}>{icon}</button>
        ))}
        <div style={{flex:1}}/>
        <SyncBadge status={syncStatus}/>
        <button onClick={onPull} title="今すぐ同期" style={{background:"none",border:"none",color:"rgba(255,255,255,.3)",cursor:"pointer",fontSize:12,padding:"2px 4px"}}>↻</button>
      </div>
    </div>
  );
}

/* ================================================================
   MAIN APP
================================================================ */
export default function App() {

  /* ── 同期対象データ（cloud shared） ───────────────────────────── */
  const [customSets,     setCustomSetsState]   = useState([]);
  const [builtinPriority,setBuiltinPriority]   = useState({});
  const [syncStatus,     setSyncStatus]        = useState("idle"); // idle|syncing|ok|error
  const [syncReady,      setSyncReady]         = useState(false);  // 初回ロード完了フラグ

  /* ── ローカルデータ ──────────────────────────────────────────── */
  const [account,     setAccountRaw]   = useState(() => lsGet(LOCAL_ACCOUNT, "child"));
  const [records,     setRecordsState] = useState(() => {
    const a = lsGet(LOCAL_ACCOUNT, "child");
    return lsGet(LOCAL_RECORDS(a), []);
  });
  const [srs,         setSrsState]     = useState(() => {
    const a = lsGet(LOCAL_ACCOUNT, "child");
    return lsGet(LOCAL_SRS(a), {});
  });

  /* ── 画面・ゲーム状態 ─────────────────────────────────────────── */
  const [screen,      setScreen]      = useState("home");
  const [datasetKey,  setDatasetKey]  = useState("words");
  const [flashTime,   setFlashTime]   = useState(3);
  const [filterStar,  setFilterStar]  = useState(3);
  const [filterMode,  setFilterMode]  = useState("all");
  const [filterOwner, setFilterOwner] = useState("all");
  const [queue,       setQueue]       = useState([]);
  const [queuePos,    setQueuePos]    = useState(0);
  const [curSet,      setCurSet]      = useState(null);
  const [timeLeft,    setTimeLeft]    = useState(0);
  const [showing,     setShowing]     = useState(false);
  const [score,       setScore]       = useState(null);
  const [history,     setHistory]     = useState([]);
  const timerRef = useRef(null);

  /* ── Dashboard ─────────────────────────────────────────────────── */
  const [dashAcct, setDashAcct] = useState("child");
  const [dashMode, setDashMode] = useState("all");

  /* ── Global confirm dialog ─────────────────────────────────────── */
  const [dlg, setDlg] = useState(null);
  const confirm = useCallback((opts) => new Promise(resolve => {
    setDlg({ ...opts, onOk: ()=>{ setDlg(null); resolve(true);  }, onCancel: ()=>{ setDlg(null); resolve(false); } });
  }), []);

  /* ================================================================
     SYNC ENGINE
     pull: クラウドから読み込み → state更新
     push: state → クラウドに書き込み
  ================================================================ */
  const pull = useCallback(async () => {
    setSyncStatus("syncing");
    try {
      const [csRaw, bpRaw, recRaw, srsRaw] = await Promise.all([
        syncGet(SYNC_CUSTOM,   null),
        syncGet(SYNC_PRIORITY, null),
        syncGet(SYNC_RECORDS,  null),
        syncGet(SYNC_SRS,      null),
      ]);
      const localRecByAcct = {
        child: lsGet(LOCAL_RECORDS("child"), []),
        parent: lsGet(LOCAL_RECORDS("parent"), []),
      };
      const localSrsByAcct = {
        child: lsGet(LOCAL_SRS("child"), {}),
        parent: lsGet(LOCAL_SRS("parent"), {}),
      };
      const cs = syncUnwrap(csRaw, []);
      const bp = syncUnwrap(bpRaw, {});
      const recByAcct = recRaw ? { child: [], parent: [], ...syncUnwrap(recRaw, {}) } : localRecByAcct;
      const srsByAcct = srsRaw ? { child: {}, parent: {}, ...syncUnwrap(srsRaw, {}) } : localSrsByAcct;

      lsSet(LOCAL_RECORDS("child"), recByAcct.child);
      lsSet(LOCAL_RECORDS("parent"), recByAcct.parent);
      lsSet(LOCAL_SRS("child"), srsByAcct.child);
      lsSet(LOCAL_SRS("parent"), srsByAcct.parent);

      setCustomSetsState(cs);
      setBuiltinPriority(bp);
      setRecordsState(recByAcct[account] || []);
      setSrsState(srsByAcct[account] || {});
      setSyncStatus("ok");
      setSyncReady(true);
    } catch {
      setSyncStatus("error");
      setSyncReady(true);
    }
    setTimeout(() => setSyncStatus(s => s === "ok" ? "idle" : s), 2500);
  }, [account]);

  /* 起動時にpull */
  useEffect(() => {
    const id = setTimeout(() => { pull(); }, 0);
    return () => clearTimeout(id);
  }, [pull]);

  /* フォーカス復帰時にpull（タブ切替・スリープ復帰） */
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === "visible") pull(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [pull]);

  /* push helpers：変更後に即クラウド書き込み */
  const pushCustomSets = useCallback(async (nextOrUpdater) => {
    setSyncStatus("syncing");
    try {
      const remoteRaw = await syncGet(SYNC_CUSTOM, syncWrap([]));
      const remote = syncUnwrap(remoteRaw, []);
      const next = typeof nextOrUpdater === "function" ? nextOrUpdater(remote) : nextOrUpdater;
      await syncSet(SYNC_CUSTOM, syncWrap(next));
      setCustomSetsState(next);
      setSyncStatus("ok");
    } catch {
      setSyncStatus("error");
    }
    setTimeout(() => setSyncStatus(s => s === "ok" ? "idle" : s), 2500);
  }, []);

  const pushPriority = useCallback(async (nextOrUpdater) => {
    setSyncStatus("syncing");
    try {
      const remoteRaw = await syncGet(SYNC_PRIORITY, syncWrap({}));
      const remote = syncUnwrap(remoteRaw, {});
      const next = typeof nextOrUpdater === "function" ? nextOrUpdater(remote) : nextOrUpdater;
      await syncSet(SYNC_PRIORITY, syncWrap(next));
      setBuiltinPriority(next);
      setSyncStatus("ok");
    } catch {
      setSyncStatus("error");
    }
    setTimeout(() => setSyncStatus(s => s === "ok" ? "idle" : s), 2500);
  }, []);

  /* ================================================================
     ACCOUNT
  ================================================================ */
  const switchAccount = (a) => {
    setAccountRaw(a);
    lsSet(LOCAL_ACCOUNT, a);
    setRecordsState(lsGet(LOCAL_RECORDS(a), []));
    setSrsState(    lsGet(LOCAL_SRS(a), {}));
    setScreen("home");
  };

  const updateSyncedPerAccount = useCallback(async (key, accountKey, nextValue, fallbackByAcct) => {
    const remoteRaw = await syncGet(key, syncWrap(fallbackByAcct));
    const remote = { ...fallbackByAcct, ...syncUnwrap(remoteRaw, fallbackByAcct), [accountKey]: nextValue };
    await syncSet(key, syncWrap(remote));
  }, []);

  const setRecords = useCallback(v => {
    setRecordsState(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      lsSet(LOCAL_RECORDS(account), next);
      if (syncReady) {
        setSyncStatus("syncing");
        updateSyncedPerAccount(SYNC_RECORDS, account, next, { child: [], parent: [] })
          .then(() => {
            setSyncStatus("ok");
            setTimeout(() => setSyncStatus(s => s === "ok" ? "idle" : s), 2500);
          })
          .catch(() => setSyncStatus("error"));
      }
      return next;
    });
  }, [account, syncReady, updateSyncedPerAccount]);
  const setSrs = useCallback(v => {
    setSrsState(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      lsSet(LOCAL_SRS(account), next);
      if (syncReady) {
        setSyncStatus("syncing");
        updateSyncedPerAccount(SYNC_SRS, account, next, { child: {}, parent: {} })
          .then(() => {
            setSyncStatus("ok");
            setTimeout(() => setSyncStatus(s => s === "ok" ? "idle" : s), 2500);
          })
          .catch(() => setSyncStatus("error"));
      }
      return next;
    });
  }, [account, syncReady, updateSyncedPerAccount]);

  const baseSets = useMemo(
    () => normalizeSourceSets(datasetKey, DATASET_SOURCES[datasetKey]?.data),
    [datasetKey]
  );

  /* ================================================================
     ALL SETS（priority=-1 は削除済み組み込みセット）
  ================================================================ */
  const allSets = syncReady ? [
    ...baseSets
      .map(s => ({ ...s, priority: builtinPriority[s.id] ?? s.priority }))
      .filter(s => s.priority >= 0),
    ...customSets,
  ] : [];

  /* ================================================================
     SET MANAGEMENT
  ================================================================ */
  const updatePriority = async (id, p) => {
    await pushPriority(prev => ({ ...prev, [id]: p }));
  };

  const deleteSet = async (s) => {
    const ok = await confirm({ msg:`「${s.label}」を削除しますか？`, sub:s.items.join("\n"), okLabel:"削除", okColor:"#ff7675" });
    if (!ok) return;
    if (baseSets.find(x => x.id === s.id)) {
      await pushPriority(prev => ({ ...prev, [s.id]: -1 }));
    } else {
      await pushCustomSets(prev => prev.filter(x => x.id !== s.id));
    }
  };

  const addCustomSet = async (s) => {
    await pushCustomSets(prev => [...prev, s]);
  };

  /* ================================================================
     SESSION
  ================================================================ */
  const srsStats = (pool) => {
    const t = todayStr();
    return { due: pool.filter(s=>(srs[s.id]?.due||"0")<=t).length, unseen: pool.filter(s=>!srs[s.id]).length };
  };

  const startSession = () => {
    let pool = allSets.filter(s => s.priority >= filterStar);
    if (filterMode  !== "all") pool = pool.filter(s => s.mode  === filterMode);
    if (filterOwner !== "all") pool = pool.filter(s => s.owner === filterOwner);
    if (!pool.length) return;
    const q = buildQueue(pool, srs, SESSION_SIZE);
    setQueue(q); setQueuePos(0); setHistory([]); setScore(null);
    launchFlash(q[0], flashTime);
  };

  const launchFlash = (s, ft) => { setCurSet(s); setShowing(true); setTimeLeft(ft); setScreen("flash"); };

  useEffect(() => {
    if (!showing) return;
    if (timeLeft <= 0) {
      timerRef.current = setTimeout(() => { setShowing(false); setScreen("recall"); }, 300);
      return () => clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setTimeLeft(t => t-1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [showing, timeLeft]);

  const submitScore = (sc) => {
    const entry = { set: curSet, score: sc, total: curSet.items.length };
    setHistory(h => [...h, entry]);
    setScore(sc);
    const ratio = sc / curSet.items.length;
    const nl = srsNextLevel((srs[curSet.id]||{level:0}).level, ratio);
    setSrs(s => ({ ...s, [curSet.id]: { level:nl, due:srsDue(nl), lastSeen:todayStr() } }));
    setScreen("result");
  };

  const nextRound = (hist) => {
    const next = queuePos + 1;
    if (next >= queue.length) { saveRecord(hist || history); setScreen("summary"); }
    else { setQueuePos(next); setScore(null); launchFlash(queue[next], flashTime); }
  };

  const saveRecord = (hist) => {
    const dateStr=todayStr(), cutoff=addDays(dateStr,-MAX_DAYS), bm={};
    hist.forEach(h => { const m=h.set.mode; if(!bm[m])bm[m]={sets:0,correct:0,words:0}; bm[m].sets++; bm[m].correct+=h.score; bm[m].words+=h.total; });
    const newR = Object.entries(bm).map(([mode,v])=>({date:dateStr,mode,...v}));
    setRecords(r => [...r.filter(x=>x.date>cutoff), ...newR]);
  };

  /* ================================================================
     DASHBOARD HELPERS
  ================================================================ */
  const getDashData = (acct, mode) => {
    const recs=lsGet(LOCAL_RECORDS(acct),[]);
    const f=mode==="all"?recs:recs.filter(r=>r.mode===mode);
    const bd={};
    f.forEach(r=>{ if(!bd[r.date])bd[r.date]={date:r.date,sets:0,correct:0,words:0}; bd[r.date].sets+=r.sets; bd[r.date].correct+=r.correct; bd[r.date].words+=r.words; });
    return Object.values(bd).sort((a,b)=>a.date.localeCompare(b.date));
  };
  const totalStats = (acct, mode) => getDashData(acct,mode).reduce(
    (acc,r)=>({sets:acc.sets+r.sets,correct:acc.correct+r.correct,words:acc.words+r.words}),
    {sets:0,correct:0,words:0}
  );
  const exportCSV = (acct) => {
    const recs=lsGet(LOCAL_RECORDS(acct),[]);
    const csv=["date,mode,sets,correct,words",...recs.map(r=>`${r.date},${r.mode},${r.sets},${r.correct},${r.words}`)].join("\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    Object.assign(document.createElement("a"),{href:url,download:`flash_${acct}.csv`}).click();
    URL.revokeObjectURL(url);
  };

  /* ================================================================
     COMMON STYLES
  ================================================================ */
  const BG = "linear-gradient(160deg,#0d0b1e 0%,#1b1045 55%,#0f1d2e 100%)";
  const rootSt = {minHeight:"100vh",background:BG,display:"flex",alignItems:"flex-start",justifyContent:"center",fontFamily:"'Nunito','Trebuchet MS',sans-serif",padding:16,boxSizing:"border-box",color:"#fff",paddingTop:54};
  const cardSt = {background:"rgba(255,255,255,.06)",backdropFilter:"blur(24px)",borderRadius:28,padding:"24px 20px",width:"100%",maxWidth:540,border:"1px solid rgba(255,255,255,.1)",boxShadow:"0 24px 80px rgba(0,0,0,.55)",boxSizing:"border-box",marginTop:12,marginBottom:12,zIndex:1};

  const accountBar = (
    <AppAccountBar
      account={account}
      screen={screen}
      syncStatus={syncStatus}
      onSwitchAccount={switchAccount}
      onSetScreen={setScreen}
      onPull={pull}
    />
  );

  const sesCorrect = history.reduce((s,h)=>s+h.score,0);
  const sesTotal   = history.reduce((s,h)=>s+h.total,0);

  /* ── Loading ─────────────────────────────────────────────────────── */
  if (!syncReady) return (
    <div style={{...rootSt,alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center",opacity:.6}}>
        <div style={{fontSize:36,marginBottom:12,animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</div>
        <div style={{fontSize:13}}>セットデータを読み込み中…</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* ================================================================
     HOME
  ================================================================ */
  if (screen === "home") {
    let pool = allSets.filter(s => s.priority >= filterStar);
    if (filterMode  !== "all") pool = pool.filter(s => s.mode  === filterMode);
    if (filterOwner !== "all") pool = pool.filter(s => s.owner === filterOwner);
    const {due, unseen} = srsStats(pool);
    return (
      <div style={rootSt}>{accountBar}<Dots/>
        {dlg && <ConfirmDialog {...dlg}/>}
        <div style={{...cardSt,maxWidth:500}}>
          <div style={{textAlign:"center",marginBottom:14}}>
            <div style={{fontSize:36}}>⚡</div>
            <div style={{fontSize:25,fontWeight:900,letterSpacing:-1}}>Flash Reader</div>
            <div style={{fontSize:11,opacity:.4,marginTop:3}}>英語瞬読トレーニング</div>
          </div>
          <Sec label="重要度">
            <div style={{display:"flex",gap:6}}>{[3,2,1,0].map(s=><StarBtn key={s} star={s} active={filterStar===s} onClick={()=>setFilterStar(s)}/>)}</div>
          </Sec>
          <Sec label="セットデータ">
            <select value={datasetKey} onChange={e=>setDatasetKey(e.target.value)} style={{width:"100%",background:"rgba(255,255,255,.08)",color:"#fff",border:"1px solid rgba(255,255,255,.16)",borderRadius:10,padding:"8px 10px",fontSize:12,fontWeight:700}}>
              {Object.entries(DATASET_SOURCES).map(([k,v])=>(
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </Sec>
          <Sec label="対象セット">
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              <Chip label="すべて" active={filterOwner==="all"} color="#fff" onClick={()=>setFilterOwner("all")}/>
              {Object.entries(OWNER_META).map(([k,v])=><Chip key={k} label={`${v.emoji} ${v.label}`} active={filterOwner===k} color={v.color} onClick={()=>setFilterOwner(k)}/>)}
            </div>
          </Sec>
          <Sec label="モード">
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              <Chip label="すべて" active={filterMode==="all"} color="#fff" onClick={()=>setFilterMode("all")}/>
              {Object.entries(MODE_META).map(([k,v])=><Chip key={k} label={`${v.emoji} ${v.label}`} active={filterMode===k} color={v.color} onClick={()=>setFilterMode(k)}/>)}
            </div>
          </Sec>
          <Sec label="フラッシュ時間">
            <div style={{display:"flex",gap:7}}>
              {FLASH_TIMES.map(t=><button key={t} onClick={()=>setFlashTime(t)} style={{flex:1,background:flashTime===t?"#f8a5c2":"rgba(255,255,255,.08)",color:flashTime===t?"#0d0b1e":"#fff",border:"none",borderRadius:10,padding:"9px 0",fontWeight:900,fontSize:15,cursor:"pointer"}}>{t}s</button>)}
            </div>
          </Sec>
          <div style={{background:"rgba(255,255,255,.04)",borderRadius:12,padding:"8px 14px",marginBottom:10,display:"flex",gap:14,justifyContent:"center",fontSize:12}}>
            <span>対象 <b style={{color:"#7ee8a2"}}>{pool.length}</b></span>
            <span>復習 <b style={{color:"#f8a5c2"}}>{due}</b></span>
            <span>未実施 <b style={{color:"#f8d76b"}}>{unseen}</b></span>
          </div>
          <Btn color="#7ee8a2" onClick={startSession} style={{opacity:pool.length===0?.4:1}}>
            {pool.length===0?"対象セットなし":"▶ スタート"}
          </Btn>
        </div>
      </div>
    );
  }

  /* ================================================================
     FLASH
  ================================================================ */
  if (screen === "flash" && curSet) {
    const pct = showing ? (timeLeft/flashTime)*100 : 0;
    const meta = MODE_META[curSet.mode];
    const isSen = curSet.mode === "sentence";
    const isCol = curSet.mode === "collocation";
    return (
      <div style={{...rootSt,alignItems:"center",paddingTop:0}}>
        <div style={cardSt}>
          <div style={{display:"flex",justifyContent:"space-between",opacity:.38,fontSize:11,marginBottom:8}}>
            <span>{meta.emoji} {meta.label}</span><span>{queuePos+1}/{queue.length}</span>
          </div>
          <div style={{width:"100%",height:5,background:"rgba(255,255,255,.1)",borderRadius:99,marginBottom:24,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${meta.color},${meta.color}88)`,borderRadius:99,transition:"width 1s linear"}}/>
          </div>
          {showing ? (
            <div style={{display:"flex",flexDirection:"column",gap:isSen?9:13}}>
              {curSet.items.map((item,i)=>(
                <div key={i} style={{fontSize:isSen?16:isCol?19:25,fontWeight:900,padding:isSen?"8px 14px":"6px 16px",background:`${meta.color}18`,border:`1px solid ${meta.color}44`,borderRadius:12,animation:`pop .18s ease ${i*.04}s both`,letterSpacing:isSen?.1:.7}}>{item}</div>
              ))}
            </div>
          ) : (
            <div style={{fontSize:48,opacity:.13,letterSpacing:14,textAlign:"center"}}>• • •</div>
          )}
        </div>
      </div>
    );
  }

  /* ================================================================
     RECALL
  ================================================================ */
  if (screen === "recall" && curSet) {
    const meta = MODE_META[curSet.mode];
    return (
      <div style={{...rootSt,alignItems:"center",paddingTop:0}}><Dots/>
        <div style={cardSt}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:38,marginBottom:6}}>🧠</div>
            <div style={{fontSize:20,fontWeight:900,marginBottom:4}}>Say them out loud!</div>
            <div style={{fontSize:12,opacity:.45,marginBottom:18}}>言えた数をタップ <span style={{opacity:.5}}>Round {queuePos+1}/{queue.length}</span></div>
            <div style={{display:"flex",flexWrap:"wrap",gap:10,justifyContent:"center",margin:"0 0 16px"}}>
              {Array.from({length:curSet.items.length+1},(_,i)=>{
                const sel=score===i;
                return <button key={i} onClick={()=>setScore(i)} style={{width:54,height:54,background:sel?meta.color:"rgba(255,255,255,.08)",color:sel?"#0d0b1e":"#fff",border:sel?"none":"1px solid rgba(255,255,255,.14)",borderRadius:15,fontSize:21,fontWeight:900,cursor:"pointer",transform:sel?"scale(1.1)":"scale(1)",transition:"all .13s"}}>{i}</button>;
              })}
            </div>
            {score !== null && <Btn color={meta.color} onClick={()=>submitScore(score)}>✓ Submit</Btn>}
          </div>
        </div>
      </div>
    );
  }

  /* ================================================================
     RESULT
  ================================================================ */
  if (screen === "result" && curSet) {
    const total=curSet.items.length, ratio=score/total;
    const stars=[.5,.75,1.0].map(t=>ratio>=t);
    const meta=MODE_META[curSet.mode];
    const emoji=ratio>=1?"🎉":ratio>=.75?"🌟":ratio>=.5?"👏":"💪";
    const isLast=queuePos+1>=queue.length;
    const nl=srsNextLevel((srs[curSet.id]||{level:0}).level,ratio);
    const nd=srsDue(nl);
    const latestHist=[...history];
    return (
      <div style={{...rootSt,alignItems:"center",paddingTop:0}}><Dots/>
        <div style={cardSt}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:11,opacity:.3,marginBottom:4}}>Round {queuePos+1}/{queue.length}</div>
            <div style={{fontSize:42,animation:"bop .45s ease"}}>{emoji}</div>
            <div style={{fontSize:22,fontWeight:900,marginTop:4,marginBottom:8}}>{score} <span style={{opacity:.35,fontSize:16}}>/ {total}</span></div>
            <div style={{display:"flex",gap:5,justifyContent:"center",marginBottom:10}}>{stars.map((f,i)=><span key={i} style={{fontSize:24,filter:f?"none":"grayscale(1) opacity(.2)"}}>⭐</span>)}</div>
            <div style={{fontSize:11,opacity:.38,marginBottom:12}}>習熟Lv {nl}/4 次回: {nd===todayStr()?"今日":nd.slice(5)}</div>
            <div style={{background:"rgba(255,255,255,.05)",borderRadius:12,padding:"10px 14px",textAlign:"left",marginBottom:6}}>
              <div style={{fontSize:9,opacity:.25,letterSpacing:2,marginBottom:6}}>THE ITEMS WERE:</div>
              {curSet.items.map((item,i)=>(
                <div key={i} style={{fontSize:curSet.mode==="sentence"?11:13,fontWeight:700,padding:"3px 0",borderBottom:i<curSet.items.length-1?"1px solid rgba(255,255,255,.06)":"none"}}>
                  <span style={{color:meta.color,marginRight:6}}>›</span>{item}
                </div>
              ))}
            </div>
            <Btn color={meta.color} onClick={()=>nextRound(latestHist)}>
              {isLast?"📊 セッション結果":`▶ Next (${queuePos+2}/${queue.length})`}
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  /* ================================================================
     SUMMARY
  ================================================================ */
  if (screen === "summary") {
    const ratio=sesTotal>0?sesCorrect/sesTotal:0;
    const stars=[.5,.75,1.0].map(t=>ratio>=t);
    return (
      <div style={rootSt}>{accountBar}<Dots/>
        {dlg && <ConfirmDialog {...dlg}/>}
        <div style={{...cardSt,maxWidth:500}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:34,marginBottom:4}}>🎯</div>
            <div style={{fontSize:21,fontWeight:900,marginBottom:6}}>セッション完了！</div>
            <div style={{fontSize:44,fontWeight:900,color:"#7ee8a2",margin:"4px 0"}}>{sesCorrect}<span style={{fontSize:18,opacity:.35}}> / {sesTotal}</span></div>
            <div style={{display:"flex",gap:5,justifyContent:"center",marginBottom:14}}>{stars.map((f,i)=><span key={i} style={{fontSize:24,filter:f?"none":"grayscale(1) opacity(.2)"}}>⭐</span>)}</div>
            <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:14,textAlign:"left"}}>
              {history.map((h,i)=>{
                const m=MODE_META[h.set.mode],r=h.score/h.total,lv=(srs[h.set.id]?.level??0);
                return(
                  <div key={i} style={{background:"rgba(255,255,255,.05)",borderRadius:10,padding:"7px 12px",display:"flex",alignItems:"center",gap:8,borderLeft:`3px solid ${m.color}`}}>
                    <span style={{fontSize:10,opacity:.35,minWidth:16}}>R{i+1}</span>
                    <span style={{flex:1,fontSize:11}}>{h.set.label}</span>
                    <span style={{fontSize:10,color:STAR_COLORS[h.set.priority]}}>{STAR_LABELS[h.set.priority]}</span>
                    <span style={{fontSize:10,opacity:.38}}>Lv{lv}</span>
                    <span style={{fontWeight:900,fontSize:13,color:r>=1?"#7ee8a2":r>=.5?"#f8d76b":"rgba(255,255,255,.4)"}}>{h.score}/{h.total}</span>
                  </div>
                );
              })}
            </div>
            <Btn color="#7ee8a2" onClick={()=>setScreen("home")}>🏠 ホームへ</Btn>
            <Btn ghost onClick={()=>setScreen("dashboard")} style={{marginTop:7}}>📊 記録を見る</Btn>
          </div>
        </div>
      </div>
    );
  }

  /* ================================================================
     DASHBOARD
  ================================================================ */
  if (screen === "dashboard") {
    const modeOpts=[["all","🌐 すべて"],["chunk","🧩 Chunks"],["collocation","💬 Collocations"],["sentence","📖 Sentences"],["cvc","🔤 CVC"]];
    const data=getDashData(dashAcct,dashMode);
    const total=totalStats(dashAcct,dashMode);
    const oAcct=dashAcct==="child"?"parent":"child";
    const oTotal=totalStats(oAcct,dashMode);
    const aC=dashAcct==="child"?"#7ee8a2":"#f8a5c2";
    return (
      <div style={rootSt}>{accountBar}
        {dlg && <ConfirmDialog {...dlg}/>}
        <div style={cardSt}>
          <div style={{fontWeight:900,fontSize:20,marginBottom:10,textAlign:"center"}}>📊 学習記録</div>
          <div style={{display:"flex",gap:5,marginBottom:14,background:"rgba(255,255,255,.04)",borderRadius:13,padding:4}}>
            {[["child","👦 子ども","#7ee8a2"],["parent","🔑 保護者","#f8a5c2"]].map(([a,label,c])=>(
              <button key={a} onClick={()=>setDashAcct(a)} style={{flex:1,background:dashAcct===a?`${c}22`:"transparent",color:dashAcct===a?c:"rgba(255,255,255,.38)",border:`1px solid ${dashAcct===a?c+"55":"transparent"}`,borderRadius:10,padding:"8px 0",fontWeight:800,fontSize:13,cursor:"pointer"}}>{label}</button>
            ))}
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:14}}>
            {modeOpts.map(([key,label])=>{
              const c=key==="all"?"#fff":(MODE_META[key]?.color||"#fff");
              return <button key={key} onClick={()=>setDashMode(key)} style={{background:dashMode===key?`${c}22`:"rgba(255,255,255,.05)",color:dashMode===key?c:"rgba(255,255,255,.35)",border:`1px solid ${dashMode===key?c+"66":"rgba(255,255,255,.09)"}`,borderRadius:10,padding:"6px 10px",fontSize:11,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>{label}</button>;
            })}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
            {[["学習セット数",total.sets],["正答単語数",total.correct,"#7ee8a2"],["総単語数",total.words,"#f8d76b"]].map(([label,val,c])=>(
              <div key={label} style={{background:"rgba(255,255,255,.06)",borderRadius:12,padding:"10px 8px",textAlign:"center"}}>
                <div style={{fontSize:20,fontWeight:900,color:c||aC}}>{val}</div>
                <div style={{fontSize:8,opacity:.38,marginTop:2}}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{background:"rgba(255,255,255,.04)",borderRadius:12,padding:"10px 14px",marginBottom:14}}>
            <div style={{fontSize:10,opacity:.4,marginBottom:7}}>vs {oAcct==="child"?"👦 子ども":"🔑 保護者"}</div>
            {[["学習セット",total.sets,oTotal.sets],["正答語",total.correct,oTotal.correct],["総語",total.words,oTotal.words]].map(([label,a,b])=>{
              const mx=Math.max(a,b,1);
              return(
                <div key={label} style={{marginBottom:7}}>
                  <div style={{display:"flex",justifyContent:"space-between",opacity:.4,fontSize:10,marginBottom:2}}><span>{label}</span><span>{a} vs {b}</span></div>
                  <div style={{display:"flex",gap:3}}>
                    {[[a,aC],[b,oAcct==="child"?"#7ee8a2":"#f8a5c2"]].map(([v,c],ki)=>(
                      <div key={ki} style={{flex:1,height:6,background:"rgba(255,255,255,.07)",borderRadius:99,overflow:"hidden"}}>
                        <div style={{width:`${(v/mx)*100}%`,height:"100%",background:c,borderRadius:99,transition:"width .4s"}}/>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{background:"rgba(255,255,255,.04)",borderRadius:14,padding:"12px 10px",marginBottom:12}}>
            <div style={{fontSize:10,opacity:.38,marginBottom:7}}>📅 日別 総語数 / 正答数</div>
            <DualLineChart data={data}/>
          </div>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,opacity:.35,marginBottom:6}}>🕓 直近の記録</div>
            <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:170,overflowY:"auto"}}>
              {[...(dashAcct===account ? records : lsGet(LOCAL_RECORDS(dashAcct),[]))].reverse().filter(r=>dashMode==="all"||r.mode===dashMode).slice(0,30).map((r,i)=>{
                const m=MODE_META[r.mode]||{color:"#fff",emoji:"•"};
                return(
                  <div key={i} style={{background:"rgba(255,255,255,.04)",borderRadius:8,padding:"5px 10px",display:"flex",gap:7,alignItems:"center",fontSize:10,borderLeft:`2px solid ${m.color}`}}>
                    <span style={{opacity:.35,minWidth:54}}>{r.date}</span>
                    <span>{m.emoji}</span>
                    <span style={{flex:1,opacity:.55}}>{MODE_META[r.mode]?.label}</span>
                    <span style={{opacity:.5}}>{r.sets}set</span>
                    <span style={{fontWeight:800,color:"#f8d76b"}}>{r.correct}/{r.words}</span>
                  </div>
                );
              })}
              {!(dashAcct===account ? records : lsGet(LOCAL_RECORDS(dashAcct),[])).length&&<div style={{opacity:.25,fontSize:11,textAlign:"center",padding:12}}>記録なし</div>}
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn small ghost onClick={()=>exportCSV(dashAcct)} style={{flex:1}}>⬇ CSV</Btn>
            {account==="parent"&&(
              <Btn small ghost onClick={async()=>{
                const ok=await confirm({msg:`${dashAcct==="child"?"👦 子ども":"🔑 保護者"}の記録を全て削除しますか？`,okLabel:"削除",okColor:"#ff7675"});
                if(ok){
                  lsSet(LOCAL_RECORDS(dashAcct),[]);
                  if (dashAcct === account) setRecords([]);
                }
              }} style={{flex:1,color:"#ff7675",borderColor:"rgba(255,118,117,.3)"}}>🗑 リセット</Btn>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ================================================================
     ADMIN
  ================================================================ */
  if (screen === "admin" && account === "parent") {
    const modeKeys=["collocation","chunk","sentence","cvc"];
    return (
      <div style={rootSt}>{accountBar}
        {dlg && <ConfirmDialog {...dlg}/>}
        <div style={{...cardSt,maxWidth:580}}>
          <div style={{fontWeight:900,fontSize:20,marginBottom:4,textAlign:"center"}}>⚙ セット管理</div>
          <div style={{fontSize:11,opacity:.32,marginBottom:14,lineHeight:1.6,textAlign:"center"}}>
            ★変更・削除は全端末に即時反映されます。
          </div>
          {modeKeys.map(mk=>{
            const meta=MODE_META[mk];
            const inMode=allSets.filter(s=>s.mode===mk);
            return(
              <div key={mk} style={{marginBottom:18}}>
                <div style={{fontWeight:800,fontSize:13,color:meta.color,marginBottom:7}}>{meta.emoji} {meta.label}</div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {inMode.map(s=>{
                    const st=srs[s.id],lv=st?.level??"-",due=st?.due;
                    const om=OWNER_META[s.owner||"child"];
                    return(
                      <div key={s.id} style={{display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,.04)",borderRadius:10,padding:"6px 10px",borderLeft:`2px solid ${om.color}44`}}>
                        <span style={{fontSize:10,opacity:.4,minWidth:16}}>{om.emoji}</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:11,opacity:.82}}>{s.label}</div>
                          {due&&<div style={{fontSize:8,opacity:.28}}>次:{due.slice(5)} Lv{lv}</div>}
                        </div>
                        <div style={{display:"flex",gap:3}}>
                          {[0,1,2,3].map(p=>(
                            <button key={p} onClick={()=>updatePriority(s.id,p)} style={{background:s.priority===p?STAR_COLORS[p]:"rgba(255,255,255,.06)",border:"none",borderRadius:7,padding:"3px 8px",fontSize:10,fontWeight:800,cursor:"pointer",color:s.priority===p?"#0d0b1e":"rgba(255,255,255,.38)"}}>{STAR_LABELS[p]}</button>
                          ))}
                        </div>
                        <button onClick={()=>deleteSet(s)} style={{background:"none",border:"none",color:"rgba(255,110,110,.55)",cursor:"pointer",fontSize:13,padding:"0 2px",lineHeight:1}}>✕</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div style={{display:"flex",gap:8,marginTop:6}}>
            <Btn small ghost onClick={async()=>{
              const ok=await confirm({msg:"組み込みセットの★を初期値に戻しますか？\nカスタムセットは維持されます。",okLabel:"初期化",okColor:"#f8d76b"});
              if(ok) await pushPriority({});
            }} style={{flex:1,fontSize:11}}>↺ ★初期化</Btn>
            <Btn small ghost onClick={async()=>{
              const ok=await confirm({msg:"SRS習熟度データをリセットしますか？\n（この端末のみ）",okLabel:"リセット",okColor:"#ff7675"});
              if(ok) setSrs({});
            }} style={{flex:1,fontSize:11,color:"#ff7675",borderColor:"rgba(255,118,117,.25)"}}>↺ SRSリセット</Btn>
          </div>
        </div>
      </div>
    );
  }

  /* ================================================================
     ADD SET
  ================================================================ */
  if (screen === "addset" && account === "parent") {
    return (
        <AddSetScreen
        allSets={allSets} cardSt={cardSt} rootSt={rootSt}
        accountBar={accountBar} dlg={dlg} confirm={confirm}
        onAdd={addCustomSet}
      />
    );
  }

  return <div style={rootSt}>{accountBar}{dlg&&<ConfirmDialog {...dlg}/>}</div>;
}

/* ================================================================
   ADD SET SCREEN（重複チェック付き）
================================================================ */
function AddSetScreen({ allSets, cardSt, rootSt, accountBar, dlg, confirm, onAdd }) {
  const [label,    setLabel]    = useState("");
  const [mode,     setMode]     = useState("collocation");
  const [owner,    setOwner]    = useState("child");
  const [priority, setPriority] = useState(2);
  const [rawItems, setRawItems] = useState("");
  const [status,   setStatus]   = useState(null);
  const [saving,   setSaving]   = useState(false);

  const handleAdd = async () => {
    const items = rawItems.split("\n").map(s=>s.trim()).filter(Boolean);
    if (!label.trim()) { setStatus({type:"error",msg:"セット名を入力してください"}); return; }
    if (items.length < 2) { setStatus({type:"error",msg:"語を2つ以上入力してください（1行1つ）"}); return; }

    /* 重複チェック */
    const norm = s => s.toLowerCase().trim();
    const dupLabel = allSets.find(s => s.label.trim() === label.trim());
    const dupItems = [];
    items.forEach(item => {
      allSets.forEach(s => {
        if (s.items.some(x => norm(x) === norm(item))) dupItems.push({item, inSet:s.label});
      });
    });
    const uniqDups = [...new Map(dupItems.map(d=>[d.item,d])).values()];

    if (dupLabel || uniqDups.length > 0) {
      let msg = "";
      if (dupLabel) msg += `「${label}」という名前のセットが既に存在します。\n`;
      if (uniqDups.length > 0) msg += `${uniqDups.length}個の語が既存セットと重複しています。\n`;
      msg += "\nこのまま追加しますか？";
      const sub = uniqDups.length > 0 ? uniqDups.map(d=>`• "${d.item}" ← ${d.inSet}`).join("\n") : undefined;
      const ok = await confirm({ msg, sub, okLabel:"追加する", okColor:"#7ee8a2" });
      if (!ok) return;
    }

    setSaving(true);
    await onAdd({ id:"custom_"+uid(), mode, owner, priority, label:label.trim(), items });
    setSaving(false);
    setStatus({type:"ok", msg:`「${label.trim()}」を追加しました（全端末に同期）`});
    setLabel(""); setRawItems("");
    setTimeout(() => setStatus(null), 3500);
  };

  const iSt = {width:"100%",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.14)",borderRadius:11,padding:"10px 13px",color:"#fff",fontSize:13,fontFamily:"inherit",boxSizing:"border-box",outline:"none"};

  return (
    <div style={rootSt}>{accountBar}
      {dlg && <ConfirmDialog {...dlg}/>}
      <div style={{...cardSt,maxWidth:520}}>
        <div style={{fontSize:20,fontWeight:900,textAlign:"center",marginBottom:4}}>＋ セット追加</div>
        <div style={{fontSize:10,opacity:.35,textAlign:"center",marginBottom:16}}>☁ 追加後、全端末に自動同期されます</div>

        <div style={{marginBottom:11}}>
          <div style={{fontSize:10,opacity:.38,marginBottom:5}}>セット名</div>
          <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="例: 自作コロケーション①" style={iSt}/>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:11}}>
          <div>
            <div style={{fontSize:10,opacity:.38,marginBottom:5}}>モード</div>
            <select value={mode} onChange={e=>setMode(e.target.value)} style={{...iSt,padding:"9px 11px"}}>
              {Object.entries(MODE_META).map(([k,v])=><option key={k} value={k}>{v.emoji} {v.label}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:10,opacity:.38,marginBottom:5}}>対象</div>
            <select value={owner} onChange={e=>setOwner(e.target.value)} style={{...iSt,padding:"9px 11px"}}>
              {Object.entries(OWNER_META).map(([k,v])=><option key={k} value={k}>{v.emoji} {v.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{marginBottom:11}}>
          <div style={{fontSize:10,opacity:.38,marginBottom:5}}>重要度</div>
          <div style={{display:"flex",gap:6}}>
            {[0,1,2,3].map(p=>(
              <button key={p} onClick={()=>setPriority(p)} style={{flex:1,background:priority===p?STAR_COLORS[p]:"rgba(255,255,255,.07)",color:priority===p?"#0d0b1e":"rgba(255,255,255,.45)",border:"none",borderRadius:10,padding:"9px 0",fontWeight:800,fontSize:12,cursor:"pointer"}}>
                {STAR_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,opacity:.38,marginBottom:5}}>単語・フレーズ（1行1つ、3〜7個推奨）</div>
          <textarea value={rawItems} onChange={e=>setRawItems(e.target.value)} rows={7}
            placeholder={"because of\nas a result\ndue to\nthat is why\none reason is"}
            style={{...iSt,resize:"vertical",lineHeight:1.7}}/>
          <div style={{fontSize:9,opacity:.28,marginTop:3}}>入力数: {rawItems.split("\n").filter(s=>s.trim()).length}語</div>
        </div>

        {status && (
          <div style={{background:status.type==="ok"?"rgba(126,232,162,.12)":"rgba(255,100,100,.12)",border:`1px solid ${status.type==="ok"?"rgba(126,232,162,.3)":"rgba(255,100,100,.3)"}`,borderRadius:10,padding:"8px 13px",fontSize:12,marginBottom:10,color:status.type==="ok"?"#7ee8a2":"#ff7675"}}>
            {status.type==="ok"?"✓ ":""}{status.msg}
          </div>
        )}

        <Btn color="#7ee8a2" onClick={handleAdd} style={{opacity:saving?.6:1}}>
          {saving?"☁ 同期中…":"✓ このセットを追加"}
        </Btn>
        <Btn ghost onClick={()=>{setLabel("");setRawItems("");setStatus(null);}} style={{marginTop:7}}>↺ クリア</Btn>
      </div>
    </div>
  );
}
