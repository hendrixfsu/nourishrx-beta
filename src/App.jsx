/** @jsxRuntime classic */
/** @jsx React.createElement */
import React, { useState, useEffect, useRef } from "react";

// ─── Storage ────────────────────────────────────────────────────────────────
const LS = {
  get: (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ─── Helpers ────────────────────────────────────────────────────────────────
const todayKey = () => new Date().toDateString();
const GRAD = [null,"#c0392b","#e74c3c","#e67e22","#f39c12","#f1c40f","#d4ac0d","#a9c934","#7dbb2a","#27ae60","#16a34a"];
const sc = s => GRAD[Math.max(1, Math.min(10, Math.round(s)))];
const SCORE_BANDS = [
  { min: 9, label: "Excellent choice", cue: "Nutrient-dense and easy to repeat" },
  { min: 7, label: "Solid choice", cue: "Good default for most days" },
  { min: 5, label: "Middle ground", cue: "Okay sometimes, worth improving" },
  { min: 3, label: "Think twice", cue: "Likely to work against your goals" },
  { min: 0, label: "Rarely worth it", cue: "Best kept occasional" },
];

const scoreBand = score => SCORE_BANDS.find(b => score >= b.min) || SCORE_BANDS[SCORE_BANDS.length - 1];

function gradColor(pct) {
  if (pct <= 0) return "#e5e7eb";
  if (pct >= 100) return "#16a34a";
  if (pct < 25) return "#c0392b";
  if (pct < 50) return "#e67e22";
  if (pct < 75) return "#f1c40f";
  return "#7dbb2a";
}

function progressGradient(pct, overshootMode = "neutral") {
  if (pct <= 0) return "linear-gradient(90deg, #e5e7eb 0%, #e5e7eb 100%)";
  if (pct > 100 && overshootMode === "warn") return "linear-gradient(90deg, #f97316 0%, #dc2626 100%)";
  if (pct > 100) return "linear-gradient(90deg, #38bdf8 0%, #2563eb 100%)";
  if (pct < 35) return "linear-gradient(90deg, #fb7185 0%, #ef4444 100%)";
  if (pct < 70) return "linear-gradient(90deg, #f59e0b 0%, #facc15 100%)";
  return "linear-gradient(90deg, #84cc16 0%, #22c55e 100%)";
}

function calcTDEE(weight, activityLevel) {
  // Mifflin-St Jeor approximation using weight in lbs, assuming average height/age
  // We'll use a simplified multiplier approach
  const mult = /Very/i.test(activityLevel) ? 17 : /Active/i.test(activityLevel) ? 16 : /Moderate/i.test(activityLevel) ? 15 : /Light/i.test(activityLevel) ? 14 : 13;
  return Math.round(weight * mult);
}

function calcTargets(profile) {
  const bw = parseFloat(profile.weight) || 0;
  const isMuscle = profile.goals.some(g => /muscle|athletic|performance/i.test(g));
  const isLoss = profile.goals.some(g => /fat|weight loss|lose/i.test(g));
  const isKeto = profile.dietStyle?.toLowerCase().includes("keto");
  const lbm = bw * 0.90;
  const pLo = isMuscle ? Math.round(lbm * 1.0) : Math.round(bw * 0.7);
  const pHi = isMuscle ? Math.round(lbm * 1.6) : Math.round(bw * 1.0);
  const tdee = calcTDEE(bw, profile.activityLevel);
  const calTarget = isLoss ? Math.round(tdee * 0.85) : isMuscle ? Math.round(tdee * 1.1) : tdee;
  const fatTarget = Math.round((calTarget * 0.30) / 9);
  const carbTarget = isKeto ? 50 : Math.round((calTarget - pHi * 4 - fatTarget * 9) / 4);
  return { pLo, pHi, calTarget, fatTarget, carbTarget, tdee, isLoss, isMuscle, isKeto };
}

// ─── Constants ──────────────────────────────────────────────────────────────
const USER_MODES = ["Simple guidance","Health focus","Performance tracking"];
const COACH_STYLES = ["Gentle nudges only","Balanced guidance","Keep me accountable"];
const CARES = ["Simple food score","Blood sugar impact","Protein progress","Macro tracking","Micronutrients","Symptom notes","Smarter swaps","Movement reminders"];
const GOALS = ["Make better food choices","Lower blood sugar / HbA1c","Build lean muscle","Lose body fat","Energy & mental clarity","Improve gut health","Reduce inflammation","Heart health","Better sleep","Athletic performance","Longevity & healthspan"];
const ACT = ["Sedentary — sitting most of the day","Light — occasional walks, some movement","Moderate — intentional exercise 2-3x/week","Active — 4-5x/week structured training","Very active — daily training or physical job"];
const DIET = ["No restrictions / standard American","Mostly whole foods","Paleo / ancestral","Mediterranean","Low-carb / keto","Plant-based","Carnivore"];
const CHAL = ["Sugar cravings","Processed food habits","Skipping meals","Not enough protein","Overeating","Undereating / loss of appetite","No time to cook","Eating out most meals","None really"];
const SLOTS = ["Breakfast","Lunch","Dinner","Snack"];
const TRACKING_LEVELS = ["Basic — just protein & fiber","Moderate — add calories","Full — calories, carbs & fat"];
const APP_VERSION = "Beta build 0.1.4";

const BADGE_DEFS = [
  { id:"streak3", icon:"🔥", name:"3-Day Streak", desc:"Logged 3 days in a row" },
  { id:"streak7", icon:"⚡", name:"7-Day Warrior", desc:"7 consecutive days logged" },
  { id:"streak30", icon:"🏆", name:"30-Day Legend", desc:"30 consecutive days logged" },
  { id:"protein_pro", icon:"💪", name:"Protein Pro", desc:"Hit protein target 5 days" },
  { id:"fiber_king", icon:"🌿", name:"Fiber King", desc:"Hit fiber target 5 days" },
  { id:"clean_week", icon:"✨", name:"Clean Week", desc:"Average score ≥ 8 for a week" },
  { id:"score9", icon:"🌟", name:"Score 9 Club", desc:"Logged a 9+ rated food" },
  { id:"zero_flags", icon:"🛡️", name:"Zero Red Flags", desc:"Logged a meal with no concerns" },
  { id:"organ_trophy", icon:"🫀", name:"Organ Trophy", desc:"Logged an organ meat" },
  { id:"keto_clutch", icon:"🥑", name:"Keto Clutch", desc:"Stayed under carb target all day" },
];

const SYS = `You are NourishRx, a functional-medicine-informed nutrition AI. Framework: Dr. Mark Hyman, Max Lugavere, Dr. Peter Attia, Dr. Rhonda Patrick, Dr. Andrew Huberman, Dr. Mike Israetel, Dr. Chris Masterjohn. Do NOT follow USDA/AHA guidelines uncritically.
LANGUAGE: Plain English. Warm, non-judgmental. Premium sourcing is Tier 3 aspirational only.
Respond ONLY in valid JSON, no markdown fences, no preamble.
SCORE 1-10:
9-10 = whole or minimally processed, protein/fiber rich, high satiety, blood-sugar friendly.
7-8 = solid everyday choice with minor tradeoffs.
5-6 = mixed bag; acceptable sometimes but not ideal.
3-4 = highly processed or likely to destabilize appetite/energy/glucose.
1-2 = ultraprocessed, low satiety, strongly misaligned with most goals.
HARD DEDUCTIONS: Added sugar/HFCS/aliases(maltodextrin,dextrose,barley malt,rice syrup,cane juice,agave,corn syrup solids):-1.5to-3. Seed oils(canola,soybean,sunflower,corn,cottonseed,grapeseed):-1.5to-2. Refined grains:-1to-2. Artificial dyes:-1each. Artificial sweeteners(aspartame,sucralose,ace-K):-1to-1.5. Preservatives(BHA,BHT,TBHQ):-1to-1.5. Trans fats:-3. Gums:-0.2each.
POSITIVES: grass-fed/wild-caught+0.5, polyphenols+0.25, fermented+0.25, organ meat+0.5.
If portion note provided adjust macros accordingly.
For food/meal: {"name":"string","score":number,"category":"whole food"|"minimally processed"|"processed"|"ultraprocessed","macros":{"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"fiber_g":number},"flags":[{"ingredient":"string","plain_english":"string","severity":"low"|"medium"|"high","deduction":number}],"positives":["string"],"blood_sugar_note":"string or null","swaps":{"tier1":{"name":"string","why":"smallest realistic upgrade","score":number},"tier2":{"name":"string","why":"better whole-food step","score":number},"tier3":{"name":"string","why":"aspirational best-fit option","score":number}},"tip":"string","has_organ_meat":false,"badge_earned":null}
Supplement timing (Masterjohn first). Zinc alone. PS at bedtime. Mag glycinate bedtime. Fat-soluble with fat. B vitamins morning.
{"type":"supplement_timing","schedule":[{"time":"string","items":["string"],"notes":"string"}]}
Supplement Q&A: {"type":"supp_qa","answer":"string","sources":["string"]}
General (if today/meals/how did I do — use daily_log_context): {"type":"advice","answer":"string","tips":["string"]}`;

// ─── Components ─────────────────────────────────────────────────────────────
function Ring({ score, size = 72 }) {
  const r = size/2-7, c = 2*Math.PI*r, col = sc(score);
  return (
    <svg width={size} height={size} style={{ display:"block", flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth="6"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth="6"
        strokeDasharray={`${c*score/10} ${c}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}/>
      <text x={size/2} y={size/2+5} textAnchor="middle" fontSize={size>60?"17":"12"} fontWeight="500" fill={col}>{score.toFixed(1)}</text>
    </svg>
  );
}

function ProgressBar({ label, value, low, high, unit = "g", overshootMode = "neutral", compact = false }) {
  const target = high || low;
  const pct = target > 0 ? Math.min(120, Math.round((value / target) * 100)) : 0;
  const met = low && value >= low && (!high || value <= high);
  const over = target > 0 && value > target;
  let barColor = gradColor(pct > 100 ? 100 : pct);
  let barFill = progressGradient(pct, overshootMode);
  let overIcon = null;
  if (over) {
    if (overshootMode === "good") { barColor = "#3b82f6"; barFill = progressGradient(101, "good"); overIcon = "⭐"; }
    else if (overshootMode === "warn") { barColor = "#ef4444"; barFill = progressGradient(101, "warn"); overIcon = "⚠️"; }
    else { barColor = "#3b82f6"; barFill = progressGradient(101, "good"); }
  }
  const h = compact ? 5 : 9;
  return (
    <div style={{ marginBottom: compact ? 5 : 14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3, alignItems:"center" }}>
        <span style={{ fontSize: compact ? 11 : 13, fontWeight:500, color:"var(--color-text-primary)" }}>{label}</span>
        <span style={{ fontSize: compact ? 11 : 13, color:"var(--color-text-secondary)", display:"flex", alignItems:"center", gap:4 }}>
          {overIcon && <span style={{ fontSize:12 }}>{overIcon}</span>}
          {value}{unit}{low && <span style={{ marginLeft:4, color: met ? "#16a34a" : "var(--color-text-tertiary)" }}>/ {low}{high&&high!==low?`–${high}`:""}{unit}</span>}
        </span>
      </div>
      <div style={{ height:h, background:"var(--color-background-secondary)", borderRadius:5, overflow:"hidden" }}>
        <div style={{ height:h, background:barFill, boxShadow:`0 0 18px ${barColor}33`, borderRadius:5, width:`${Math.min(100, pct)}%`, transition:"width 0.5s" }}/>
      </div>
    </div>
  );
}

function MacroTile({ label, value, unit, color }) {
  return (
    <div style={{ padding:"10px", background:"var(--color-background-secondary)", borderRadius:10, border:"0.5px solid var(--color-border-tertiary)", textAlign:"center" }}>
      <p style={{ margin:"0 0 2px", fontSize:10, color:"var(--color-text-secondary)" }}>{label}</p>
      <p style={{ margin:0, fontSize:18, fontWeight:500, color: color || "var(--color-text-primary)" }}>{value}{unit}</p>
    </div>
  );
}

function ResultPanel({ data, onClose, onStar, isFav }) {
  if (!data) return null;
  const col = sc(data.score);
  const band = scoreBand(data.score);
  const TIER_COLORS = [["#fef9c3","#854d0e"],["#dcfce7","#166534"],["#dbeafe","#1e40af"]];
  const TIER_LABELS = ["Better","Great","Optimal"];
  return (
    <div style={{ background:"var(--color-background-primary)", borderRadius:14, border:`1.5px solid ${col}44`, padding:"1.25rem", marginBottom:"1rem", position:"relative" }}>
      <div style={{ position:"absolute", top:10, right:38, display:"flex", gap:8 }}>
        {onStar && <button onClick={onStar} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, lineHeight:1 }}>{isFav ? "⭐" : "☆"}</button>}
        <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:"var(--color-text-tertiary)", lineHeight:1 }}>×</button>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:12 }}>
        <Ring score={data.score} size={76}/>
        <div>
          <h3 style={{ margin:"0 0 4px", fontSize:16, fontWeight:500 }}>{data.name}</h3>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:col }}/>
            <span style={{ fontSize:12, fontWeight:500, color:col }}>{band.label}</span>
          </div>
          <span style={{ fontSize:11, padding:"2px 9px", borderRadius:20, background:"var(--color-background-secondary)", color:"var(--color-text-secondary)", display:"inline-block", marginTop:4 }}>{data.category}</span>
          <p style={{ margin:"5px 0 0", fontSize:11, color:"var(--color-text-secondary)" }}>{band.cue}</p>
        </div>
      </div>
      {data.macros && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:5, marginBottom:12 }}>
          {[["Cal",data.macros.calories,""],["Pro",data.macros.protein_g,"g"],["Carb",data.macros.carbs_g,"g"],["Fat",data.macros.fat_g,"g"],["Fiber",(data.macros.fiber_g||0),"g"]].map(([l,v,u]) => (
            <div key={l} style={{ textAlign:"center", padding:"6px 2px", background:"var(--color-background-secondary)", borderRadius:7 }}>
              <p style={{ margin:0, fontSize:10, color:"var(--color-text-secondary)" }}>{l}</p>
              <p style={{ margin:0, fontSize:13, fontWeight:500 }}>{v}{u}</p>
            </div>
          ))}
        </div>
      )}
      {data.blood_sugar_note && data.blood_sugar_note !== "null" && (
        <div style={{ background:"#fefce8", borderRadius:10, padding:"0.75rem", border:"0.5px solid #fde68a", marginBottom:10 }}>
          <p style={{ margin:0, fontSize:12, color:"#854d0e", lineHeight:1.5 }}>🩸 {data.blood_sugar_note}</p>
        </div>
      )}
      {data.flags?.length > 0 && (
        <div style={{ marginBottom:10 }}>
          <p style={{ margin:"0 0 7px", fontWeight:500, fontSize:13 }}>Ingredient concerns</p>
          {data.flags.map((f,i) => (
            <div key={i} style={{ display:"flex", gap:8, marginBottom:i<data.flags.length-1?8:0, paddingBottom:i<data.flags.length-1?8:0, borderBottom:i<data.flags.length-1?"0.5px solid var(--color-border-tertiary)":"none" }}>
              <div style={{ width:4, minWidth:4, borderRadius:2, background:f.severity==="high"?"#ef4444":f.severity==="medium"?"#f97316":"#facc15", alignSelf:"stretch", marginTop:2 }}/>
              <div>
                <p style={{ margin:"0 0 1px", fontWeight:500, fontSize:12 }}>{f.ingredient}<span style={{ fontSize:10, marginLeft:5, color:"var(--color-text-tertiary)" }}>−{f.deduction}pts</span></p>
                <p style={{ margin:0, fontSize:11, color:"var(--color-text-secondary)", lineHeight:1.4 }}>{f.plain_english}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {data.positives?.length > 0 && (
        <div style={{ background:"#f0fdf4", borderRadius:10, padding:"0.75rem", border:"0.5px solid #86efac", marginBottom:10 }}>
          {data.positives.map((p,i) => <p key={i} style={{ margin:"2px 0", fontSize:12, color:"#15803d" }}>✓ {p}</p>)}
        </div>
      )}
      {data.swaps && (
        <div style={{ marginBottom:10 }}>
          <p style={{ margin:"0 0 8px", fontWeight:500, fontSize:13 }}>Smarter swaps</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
            {[data.swaps.tier1, data.swaps.tier2, data.swaps.tier3].filter(Boolean).map((tier,i) => (
              <div key={i} style={{ padding:"8px", background:"var(--color-background-secondary)", borderRadius:10, border:`0.5px solid ${TIER_COLORS[i][0]}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                  <span style={{ fontSize:10, fontWeight:500, padding:"2px 7px", borderRadius:20, color:TIER_COLORS[i][1], background:TIER_COLORS[i][0] }}>{TIER_LABELS[i]}</span>
                  <Ring score={tier.score} size={28}/>
                </div>
                <p style={{ margin:"0 0 2px", fontWeight:500, fontSize:11 }}>{tier.name}</p>
                <p style={{ margin:0, fontSize:10, color:"var(--color-text-secondary)", lineHeight:1.3 }}>{tier.why}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.tip && (
        <div style={{ background:"#eff6ff", borderRadius:10, padding:"0.75rem", border:"0.5px solid #bfdbfe" }}>
          <p style={{ margin:0, fontSize:12, color:"#1e40af", lineHeight:1.5 }}>💡 {data.tip}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  // Persisted state
  const [profile, setProfileRaw] = useState(() => LS.get("nrx_profile", { name:"", age:"", sex:"", weight:"", feet:"", inches:"", userMode:"", goals:[], activityLevel:"", dietStyle:"", challenges:[], careAbout:[], coachStyle:"Gentle nudges only", medications:"", trackingLevel:"Basic — just protein & fiber", fiberTarget:35, customTargets:{} }));
  const [history, setHistoryRaw] = useState(() => LS.get("nrx_history", []));
  const [favorites, setFavoritesRaw] = useState(() => LS.get("nrx_favorites", []));
  const [badges, setBadgesRaw] = useState(() => LS.get("nrx_badges", []));
  const [streakData, setStreakDataRaw] = useState(() => LS.get("nrx_streak", { current:0, longest:0, lastDate:"" }));
  const [weightLog, setWeightLogRaw] = useState(() => LS.get("nrx_weights", []));
  const [daily, setDailyRaw] = useState(() => {
    const saved = LS.get("nrx_daily", null);
    if (saved && saved.date === todayKey()) return saved;
    return { date: todayKey(), meals: [] };
  });

  // Setters with persistence
  const setProfile = v => { const next = typeof v === "function" ? v(profile) : v; setProfileRaw(next); LS.set("nrx_profile", next); };
  const setHistory = v => { const next = typeof v === "function" ? v(history) : v; setHistoryRaw(next); LS.set("nrx_history", next); };
  const setFavorites = v => { const next = typeof v === "function" ? v(favorites) : v; setFavoritesRaw(next); LS.set("nrx_favorites", next); };
  const setBadges = v => { const next = typeof v === "function" ? v(badges) : v; setBadgesRaw(next); LS.set("nrx_badges", next); };
  const setStreakData = v => { const next = typeof v === "function" ? v(streakData) : v; setStreakDataRaw(next); LS.set("nrx_streak", next); };
  const setWeightLog = v => { const next = typeof v === "function" ? v(weightLog) : v; setWeightLogRaw(next); LS.set("nrx_weights", next); };
  const setDaily = v => { const next = typeof v === "function" ? v(daily) : v; setDailyRaw(next); LS.set("nrx_daily", next); };

  // Session state
  const [screen, setScreen] = useState(profile.name ? "home" : "onboard");
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [analyzeSuccess, setAnalyzeSuccess] = useState(null);
  const [query, setQuery] = useState("");
  const [activeMeal, setActiveMeal] = useState("Breakfast");
  const [portionNote, setPortionNote] = useState("");
  const [showPortionNote, setShowPortionNote] = useState(false);
  const [imgData, setImgData] = useState(null);
  const [imgPrev, setImgPrev] = useState(null);
  const [expandedResult, setExpandedResult] = useState(null);
  const [fiberPopup, setFiberPopup] = useState(false);
  const [editingFav, setEditingFav] = useState(null);
  const [favNameInput, setFavNameInput] = useState("");
  const [weightInput, setWeightInput] = useState("");
  const [repeatPrompt, setRepeatPrompt] = useState(null);
  const [captureMode, setCaptureMode] = useState("photo");
  const [isListening, setIsListening] = useState(false);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const fRef = useRef();
  const uploadRef = useRef();
  const recognitionRef = useRef(null);
  const voiceBaseRef = useRef("");

  // Midnight reset for daily log
  useEffect(() => {
    const ck = () => {
      if (daily.date !== todayKey()) {
        setDaily({ date: todayKey(), meals: [] });
      }
    };
    ck(); const iv = setInterval(ck, 60000); return () => clearInterval(iv);
  }, [daily.date]);

  useEffect(() => () => {
    if (recognitionRef.current) recognitionRef.current.stop();
  }, []);

  // Computed targets
  const targets = calcTargets(profile);
  const { pLo, pHi, calTarget, fatTarget, carbTarget, tdee, isLoss, isMuscle, isKeto } = targets;
  const isAdvanced = profile.trackingLevel !== "Basic — just protein & fiber";
  const isFullTracking = profile.trackingLevel === "Full — calories, carbs & fat";
  const isSimpleMode = profile.userMode === "Simple guidance" || profile.userMode === "Health focus";
  const wantsBloodSugar = profile.goals.some(g => /blood sugar|hba1c/i.test(g)) || profile.careAbout?.includes("Blood sugar impact");
  const wantsSymptoms = profile.careAbout?.includes("Symptom notes");
  const voiceSupported = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const fTgt = parseInt(profile.fiberTarget) || 35;

  // Override with custom targets if set
  const tCal = profile.customTargets?.cal || calTarget;
  const tCarb = profile.customTargets?.carb || carbTarget;
  const tFat = profile.customTargets?.fat || fatTarget;

  // Daily totals
  const tot = daily.meals.reduce((a,m) => ({
    cal: a.cal+(m.macros?.calories||0), pro: a.pro+(m.macros?.protein_g||0),
    carb: a.carb+(m.macros?.carbs_g||0), fat: a.fat+(m.macros?.fat_g||0), fib: a.fib+(m.macros?.fiber_g||0)
  }), { cal:0, pro:0, carb:0, fat:0, fib:0 });

  const heightDisplay = profile.feet ? `${profile.feet}'${profile.inches||0}"` : "";
  const recentFoods = [...new Map(history.slice(0,20).map(h => [h.result.name, h])).values()].slice(0, 6);
  const dailySummary = () => !daily.meals.length ? "No meals logged yet today." : daily.meals.map(m => `${m.slot}: ${m.label} (${Math.round(m.macros?.calories||0)} cal, ${Math.round(m.macros?.protein_g||0)}g protein, ${Math.round(m.macros?.fiber_g||0)}g fiber)`).join("; ");

  // Streak update
  function updateStreak() {
    const today = todayKey();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    setStreakData(sd => {
      if (sd.lastDate === today) return sd;
      const newCurrent = sd.lastDate === yesterday ? sd.current + 1 : 1;
      const next = { current: newCurrent, longest: Math.max(sd.longest, newCurrent), lastDate: today };
      return next;
    });
  }

  // Badge check
  function checkBadges(result, newTot) {
    const toAdd = [];
    if (result.score >= 9) toAdd.push("score9");
    if (!result.flags || result.flags.length === 0) toAdd.push("zero_flags");
    if (result.has_organ_meat) toAdd.push("organ_trophy");
    if (streakData.current >= 2) toAdd.push("streak3");
    if (streakData.current >= 6) toAdd.push("streak7");
    if (streakData.current >= 29) toAdd.push("streak30");
    if (newTot && newTot.pro >= pLo) toAdd.push("protein_pro");
    if (newTot && newTot.fib >= fTgt) toAdd.push("fiber_king");
    if (isKeto && newTot && newTot.carb <= tCarb) toAdd.push("keto_clutch");
    setBadges(b => { const set = new Set(b); toAdd.forEach(x => set.add(x)); return [...set]; });
  }

  // API
  async function apicall(msg, img) {
    const content = img ? [{ type:"image", source:{ type:"base64", media_type:"image/jpeg", data:img }}, { type:"text", text:msg }] : [{ type:"text", text:msg }];
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 28000);
    try {
      const r = await fetch("/.netlify/functions/analyze-meal", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        signal:ctrl.signal,
        body:JSON.stringify({ system:SYS, content })
      });
      clearTimeout(to);
      const d = await r.json();
      if (!r.ok) return { type:"client_error", error:d?.error || "api_error" };
      const t = d?.text || "";
      return JSON.parse(t.replace(/```json|```/g,"").trim());
    } catch { clearTimeout(to); return null; }
  }

  async function onImg(e) {
    const f = e.target.files[0];
    if (!f) return;
    setShowPhotoOptions(false);
    const rd = new FileReader();
    rd.onload = ev => {
      setImgData(ev.target.result.split(",")[1]);
      setImgPrev(ev.target.result);
    };
    rd.readAsDataURL(f);
    e.target.value = "";
  }

  function startVoiceCapture() {
    if (!voiceSupported || loading) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    if (recognitionRef.current) recognitionRef.current.stop();
    const rec = new SpeechRecognition();
    recognitionRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    voiceBaseRef.current = query.trim();
    rec.onstart = () => {
      setCaptureMode("voice");
      setIsListening(true);
      setAnalyzeError(null);
      setShowPhotoOptions(false);
    };
    rec.onresult = event => {
      const transcript = Array.from(event.results)
        .map(result => result[0]?.transcript?.trim() || "")
        .filter(Boolean)
        .join(" ")
        .trim();
      const base = voiceBaseRef.current;
      setQuery(transcript ? `${base}${base ? "\n\n" : ""}${transcript}` : base);
    };
    rec.onerror = () => {
      setAnalyzeError("Voice capture was interrupted. You can try again or type a quick note.");
      setIsListening(false);
    };
    rec.onend = () => setIsListening(false);
    rec.start();
  }

  function stopVoiceCapture() {
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsListening(false);
  }

  async function analyze() {
    if (!query.trim() && !imgData) return;
    setLoading(true); setAnalyzeError(null); setAnalyzeSuccess(null); setExpandedResult(null);
    const ctx = `User: mode=${profile.userMode || "unselected"}, goals=${profile.goals.join(", ")}, care_about=${(profile.careAbout||[]).join(", ")}, coaching=${profile.coachStyle}, weight=${parseFloat(profile.weight)||0}lbs, activity=${profile.activityLevel}.`;
    const pCtx = portionNote.trim() ? ` Portion note: ${portionNote}.` : "";
    const modeLead = captureMode === "voice" ? "Analyze this voice-described meal" : "Analyze this meal photo";
    const prompt = imgData ? `${modeLead} for ${activeMeal}. ${query?"Context: "+query:""} ${ctx}${pCtx}` : `Analyze this ${activeMeal}: "${query}".${pCtx} ${ctx}`;
    const p = await apicall(prompt, imgData);
    if (p?.type === "client_error") {
      setAnalyzeError(`Analysis failed: ${p.error}`);
    } else if (p && !p.type) {
      const entry = { query:query||captureMode[0].toUpperCase()+captureMode.slice(1), result:p, slot:activeMeal, date:new Date().toLocaleDateString(), time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) };
      setHistory(h => [entry, ...h.slice(0,99)]);
      const newMeals = [...daily.meals, { label:p.name, macros:p.macros, time:entry.time, slot:activeMeal, score:p.score }];
      setDaily(dl => ({ ...dl, meals: newMeals }));
      const newTot = newMeals.reduce((a,m) => ({ cal:a.cal+(m.macros?.calories||0), pro:a.pro+(m.macros?.protein_g||0), carb:a.carb+(m.macros?.carbs_g||0), fat:a.fat+(m.macros?.fat_g||0), fib:a.fib+(m.macros?.fiber_g||0) }), { cal:0, pro:0, carb:0, fat:0, fib:0 });
      updateStreak(); checkBadges(p, newTot); setAnalyzeSuccess(p);
      // Repeat meal detection
      const matchCount = history.filter(h => h.result.name === p.name).length;
      if (matchCount >= 1 && !favorites.find(f => f.name === p.name)) setRepeatPrompt(p.name);
    } else { setAnalyzeError("Couldn't get a response — check your connection and try again."); }
    setImgData(null); setImgPrev(null); setQuery(""); setPortionNote(""); setShowPortionNote(false); setLoading(false);
  }

  function quickLog(item) {
    const p = item.result;
    const entry = { query:item.query, result:p, slot:activeMeal, date:new Date().toLocaleDateString(), time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) };
    setHistory(h => [entry, ...h.slice(0,99)]);
    setDaily(dl => ({ ...dl, meals:[...dl.meals, { label:p.name, macros:p.macros, time:entry.time, slot:activeMeal, score:p.score }] }));
    updateStreak(); setAnalyzeSuccess(p);
  }

  function toggleFav(name, result) {
    if (favorites.find(f => f.name === name)) { setFavorites(f => f.filter(x => x.name !== name)); }
    else { setFavorites(f => [...f, { name, displayName: name, result }]); }
  }

  const nav = s => { setScreen(s); setAnalyzeError(null); setAnalyzeSuccess(null); };

  // ─── Onboarding ──────────────────────────────────────────────────────────
  const advancedGoals = profile.userMode === "Performance tracking" || profile.goals.some(g => /muscle|athletic|performance|lose|fat/i.test(g));
  const isConditionMode = profile.userMode === "Health focus";
  const onboardingIntro = profile.userMode === "Performance tracking"
    ? "We’ll turn on the deeper tracking options first, and you can always simplify things later."
    : profile.userMode === "Health focus"
      ? "We’ll focus on better choices and the health signals you actually care about."
      : "We’ll keep this simple, low-pressure, and easy to use in everyday life.";
  const singleOptionDescription = (stepId, opt) => {
    if (stepId === "userMode") {
      if (opt === "Simple guidance") return "Quick food scores, easy swaps, and simple encouragement.";
      if (opt === "Health focus") return "Helpful feedback for things like blood sugar, digestion, energy, and daily habits.";
      if (opt === "Performance tracking") return "Detailed macros, nutrition data, and trend tracking for physique or performance goals.";
    }
    if (stepId === "coachStyle") {
      if (opt === "Gentle nudges only") return "Supportive, calm, and never pushy.";
      if (opt === "Balanced guidance") return "Helpful reminders without feeling nagging.";
      if (opt === "Keep me accountable") return "More direct feedback and stronger goal reminders.";
    }
    if (stepId === "trackingLevel") {
      if (opt === TRACKING_LEVELS[0]) return "Mostly food score, protein, and fiber.";
      if (opt === TRACKING_LEVELS[1]) return `Adds calories with a daily estimate around ~${calcTDEE(parseFloat(profile.weight)||0, profile.activityLevel)}.`;
      if (opt === TRACKING_LEVELS[2]) return "Shows protein, fiber, calories, carbs, and fat in more detail.";
    }
    if (stepId === "dietStyle" && /No restrictions/i.test(opt)) return "Best if you mainly want smarter defaults, not a strict food philosophy.";
    return null;
  };
  const steps = [
    { id:"name", type:"text", q:"What's your name?", ph:"First name" },
    { id:"userMode", type:"single", q:"How do you want NourishRx to help you most?", opts:USER_MODES },
    ...(advancedGoals || isConditionMode ? [{ id:"age_sex", type:"age_sex", q: isConditionMode ? "Optional but helpful: how old are you, and what's your biological sex?" : "How old are you, and what's your biological sex?", optional:isConditionMode }] : []),
    ...(advancedGoals ? [{ id:"wh", type:"wh", q:"What's your current weight and height?" }] : []),
    { id:"goals", type:"multi", q: profile.userMode === "Performance tracking" ? "What outcomes are you chasing most right now?" : "What would you most like help with first?", opts:GOALS },
    { id:"activityLevel", type:"single", q:"Which best describes your typical week?", opts:ACT },
    { id:"coachStyle", type:"single", q:"How should the app coach you?", opts:COACH_STYLES },
    { id:"careAbout", type:"multi", q: profile.userMode === "Performance tracking" ? "Which details do you want surfaced in the app?" : "What would be most useful to see regularly?", opts: profile.userMode === "Performance tracking" ? CARES : CARES.filter(opt => !/Micronutrients|Macro tracking/.test(opt)) },
    ...(advancedGoals ? [{ id:"trackingLevel", type:"single", q:"How closely do you want to track your nutrition?", opts:TRACKING_LEVELS }] : []),
    { id:"dietStyle", type:"single", q:"Which best matches how you eat right now?", opts:DIET },
    { id:"challenges", type:"multi", q:"What tends to get in your way most often?", opts:CHAL },
    { id:"medications", type:"text", q: isConditionMode ? "Any health context you want the app to keep in mind? (optional)" : "Any health context you want the app to keep in mind? (optional)", ph:"e.g. blood sugar goals, appetite changes, digestion, protein focus...", optional:true },
  ];
  const cur = steps[step];
  const ok = () => {
    if (!cur) return false;
    if (cur.optional) return true;
    if (cur.type==="multi") return (profile[cur.id]||[]).length>0;
    if (cur.type==="single") return !!profile[cur.id];
    if (cur.type==="age_sex") return profile.age&&profile.sex;
    if (cur.type==="wh") return !!profile.weight;
    return !!profile[cur.id];
  };
  const adv = () => {
    if (step < steps.length-1) setStep(s=>s+1);
    else {
      if (!advancedGoals) setProfile(p => ({...p, trackingLevel:"Basic — just protein & fiber"}));
      if (!profile.careAbout?.length) {
        setProfile(p => ({ ...p, careAbout: p.userMode === "Performance tracking" ? ["Simple food score","Protein progress","Macro tracking","Micronutrients","Symptom notes"] : p.userMode === "Health focus" ? ["Simple food score","Blood sugar impact","Symptom notes","Smarter swaps"] : ["Simple food score","Blood sugar impact","Smarter swaps"] }));
      }
      setScreen("home");
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (screen === "onboard") return (
    <div style={{ maxWidth:480, margin:"0 auto", padding:"1.5rem 1rem" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:"1.5rem" }}>
        <div style={{ width:28, height:28, borderRadius:7, background:"#16a34a", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2"/><path d="M8 12s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
        </div>
        <span style={{ fontWeight:500, fontSize:16 }}>NourishRx</span>
      </div>
      <div style={{ height:3, background:"var(--color-background-secondary)", borderRadius:3, marginBottom:"1.5rem" }}>
        <div style={{ height:3, background:"#16a34a", borderRadius:3, width:`${((step+1)/steps.length)*100}%`, transition:"width 0.3s" }}/>
      </div>
      <p style={{ fontSize:12, color:"var(--color-text-secondary)", marginBottom:6 }}>{step+1} of {steps.length}</p>
      <h2 style={{ fontSize:19, fontWeight:500, marginBottom:"1.25rem", lineHeight:1.3 }}>{cur?.q}</h2>
      <p style={{ fontSize:13, color:"var(--color-text-secondary)", margin:"-0.75rem 0 1.1rem", lineHeight:1.45 }}>{onboardingIntro}</p>

      {cur?.type==="text" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <input type="text" placeholder={cur.ph} value={profile[cur.id]||""} onChange={e=>setProfile(p=>({...p,[cur.id]:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&ok()&&adv()} style={{ fontSize:16, padding:"11px 14px", borderRadius:10 }}/>
          <button onClick={adv} disabled={!ok()} style={{ padding:"11px", borderRadius:10, background:ok()?"#16a34a":"var(--color-background-secondary)", color:ok()?"#fff":"var(--color-text-secondary)", border:"none", fontSize:15, cursor:ok()?"pointer":"default", fontWeight:500 }}>{step===steps.length-1?(profile[cur.id]?"Finish":"Skip & finish"):"Continue"}</button>
        </div>
      )}
      {cur?.type==="age_sex" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <input type="number" placeholder="Age" value={profile.age||""} onChange={e=>setProfile(p=>({...p,age:e.target.value}))} style={{ fontSize:16, padding:"11px 14px", borderRadius:10 }}/>
          <div style={{ display:"flex", gap:8 }}>
            {["Male","Female","Other"].map(s => <button key={s} onClick={()=>setProfile(p=>({...p,sex:s}))} style={{ flex:1, padding:"11px", borderRadius:10, cursor:"pointer", fontSize:14, border:profile.sex===s?"2px solid #16a34a":"0.5px solid var(--color-border-secondary)", background:profile.sex===s?"#f0fdf4":"var(--color-background-primary)", color:"var(--color-text-primary)" }}>{s}</button>)}
          </div>
          <button onClick={adv} disabled={!ok()} style={{ padding:"11px", borderRadius:10, background:ok()?"#16a34a":"var(--color-background-secondary)", color:ok()?"#fff":"var(--color-text-secondary)", border:"none", fontSize:15, cursor:ok()?"pointer":"default", fontWeight:500 }}>Continue</button>
        </div>
      )}
      {cur?.type==="wh" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <input type="number" placeholder="Weight (lbs)" value={profile.weight||""} onChange={e=>setProfile(p=>({...p,weight:e.target.value}))} style={{ fontSize:16, padding:"11px 14px", borderRadius:10 }}/>
          <div style={{ display:"flex", gap:8 }}>
            <div style={{ flex:1, position:"relative" }}>
              <input type="number" placeholder="Feet" min="4" max="7" value={profile.feet||""} onChange={e=>setProfile(p=>({...p,feet:e.target.value}))} style={{ width:"100%", fontSize:16, padding:"11px 40px 11px 14px", borderRadius:10, boxSizing:"border-box" }}/>
              <span style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", fontSize:14, color:"var(--color-text-tertiary)", pointerEvents:"none" }}>ft</span>
            </div>
            <div style={{ flex:1, position:"relative" }}>
              <input type="number" placeholder="Inches" min="0" max="11" value={profile.inches||""} onChange={e=>setProfile(p=>({...p,inches:e.target.value}))} style={{ width:"100%", fontSize:16, padding:"11px 40px 11px 14px", borderRadius:10, boxSizing:"border-box" }}/>
              <span style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", fontSize:14, color:"var(--color-text-tertiary)", pointerEvents:"none" }}>in</span>
            </div>
          </div>
          <button onClick={adv} disabled={!ok()} style={{ padding:"11px", borderRadius:10, background:ok()?"#16a34a":"var(--color-background-secondary)", color:ok()?"#fff":"var(--color-text-secondary)", border:"none", fontSize:15, cursor:ok()?"pointer":"default", fontWeight:500 }}>Continue</button>
        </div>
      )}
      {cur?.type==="single" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {cur.opts.map(opt => {
            const isTracking = cur.id === "trackingLevel";
            const descHint = singleOptionDescription(cur.id, opt);
            const desc = isTracking && opt === TRACKING_LEVELS[1] ? `~${calcTDEE(parseFloat(profile.weight)||0, profile.activityLevel)} cal/day estimated` : isTracking && opt === TRACKING_LEVELS[2] ? "Protein, fiber, calories, carbs & fat — fully adjustable" : null;
            return (
              <button key={opt} onClick={()=>{ setProfile(p=>({...p,[cur.id]:opt})); setTimeout(adv,130); }} style={{ textAlign:"left", padding:"11px 14px", borderRadius:10, cursor:"pointer", fontSize:13, lineHeight:1.4, border:profile[cur.id]===opt?"2px solid #16a34a":"0.5px solid var(--color-border-secondary)", background:profile[cur.id]===opt?"#f0fdf4":"var(--color-background-primary)", color:"var(--color-text-primary)" }}>
                {opt}{(descHint || desc) && <span style={{ display:"block", fontSize:11, color:"#16a34a", marginTop:2 }}>{descHint || desc}</span>}
              </button>
            );
          })}
        </div>
      )}
      {cur?.type==="multi" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {cur.opts.map(opt => { const sel = (profile[cur.id]||[]).includes(opt); return <button key={opt} onClick={()=>setProfile(p=>({...p,[cur.id]:sel?p[cur.id].filter(x=>x!==opt):[...(p[cur.id]||[]),opt]}))} style={{ padding:"8px 14px", borderRadius:20, cursor:"pointer", fontSize:13, border:sel?"2px solid #16a34a":"0.5px solid var(--color-border-secondary)", background:sel?"#f0fdf4":"var(--color-background-primary)", color:sel?"#166534":"var(--color-text-primary)", fontWeight:sel?500:400 }}>{opt}</button>; })}
          </div>
          <button onClick={adv} disabled={!ok()} style={{ padding:"11px", borderRadius:10, background:ok()?"#16a34a":"var(--color-background-secondary)", color:ok()?"#fff":"var(--color-text-secondary)", border:"none", fontSize:15, cursor:ok()?"pointer":"default", fontWeight:500 }}>Continue</button>
        </div>
      )}
    </div>
  );

  // ─── Main App UI ─────────────────────────────────────────────────────────
  const SCREENS = [["home","Meal Check"]];

  return (
    <div style={{ maxWidth:520, margin:"0 auto", padding:"1rem" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1rem" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:28, height:28, borderRadius:7, background:"#16a34a", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2"/><path d="M8 12s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          </div>
          <span style={{ fontWeight:500, fontSize:16 }}>NourishRx</span>
          {profile.name && <span style={{ fontSize:13, color:"var(--color-text-secondary)" }}>· {profile.name}</span>}
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {false && streakData.current > 0 && <span style={{ fontSize:12, padding:"3px 9px", background:"#fef9c3", color:"#854d0e", borderRadius:20, fontWeight:500 }}>🔥 {streakData.current}</span>}
          {false && badges.length > 0 && <span onClick={()=>nav("rewards")} style={{ fontSize:12, padding:"3px 9px", background:"#f0fdf4", color:"#166534", borderRadius:20, fontWeight:500, cursor:"pointer" }}>🏅 {badges.length}</span>}
          <button onClick={()=>nav("profile")} style={{ background:"none", border:"none", cursor:"pointer", fontSize:17, color:"var(--color-text-secondary)", padding:4 }}>⚙</button>
        </div>
      </div>
      <div style={{ marginTop:"-0.5rem", marginBottom:"0.85rem" }}>
        <span style={{ fontSize:10, color:"var(--color-text-secondary)", padding:"2px 8px", borderRadius:999, background:"var(--color-background-secondary)", border:"1px solid var(--color-border-secondary)", textTransform:"uppercase", letterSpacing:"0.04em" }}>{APP_VERSION}</span>
      </div>

      {/* Nav */}
      <div style={{ display:"flex", gap:6, marginBottom:"1.25rem", overflowX:"auto", paddingBottom:2 }}>
        {SCREENS.map(([s,l]) => <button key={s} onClick={()=>nav(s)} style={{ padding:"7px 14px", borderRadius:20, fontSize:12, fontWeight:screen===s?500:400, border:"0.5px solid var(--color-border-secondary)", background:screen===s?"#16a34a":"var(--color-background-primary)", color:screen===s?"#fff":"var(--color-text-primary)", cursor:"pointer", whiteSpace:"nowrap" }}>{l}</button>)}
      </div>

      {/* ── HOME ── */}
      {screen==="home" && (
        <div>
          <div style={{ background:"linear-gradient(135deg, #f4fbf7 0%, #eef8ff 55%, #fff6e8 100%)", borderRadius:20, padding:"1rem", border:"1px solid #d9efe2", marginBottom:"0.85rem", boxShadow:"0 12px 30px rgba(34, 197, 94, 0.08)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"flex-start", marginBottom:12 }}>
              <div>
                <p style={{ margin:"0 0 4px", fontSize:12, color:"#166534", fontWeight:600, letterSpacing:"0.04em", textTransform:"uppercase" }}>{profile.userMode || "Quick guidance"}</p>
                <h2 style={{ margin:"0 0 6px", fontSize:22, lineHeight:1.15 }}>What are you eating right now?</h2>
                <p style={{ margin:0, fontSize:13, color:"var(--color-text-secondary)", lineHeight:1.45 }}>
                  {isSimpleMode ? "Snap it, say it, or scan it. We'll keep the feedback simple and useful." : "Capture meals fast, then dig into details only when you want them."}
                </p>
              </div>
              <div style={{ minWidth:76 }}>
                <Ring score={daily.meals.length ? Math.max(1, Math.min(10, daily.meals.reduce((a,m)=>a+(m.score||0),0)/daily.meals.length)) : 0} size={72}/>
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:`repeat(${isFullTracking ? 5 : isAdvanced ? 3 : 2},1fr)`, gap:6, marginBottom:10 }}>
              <MacroTile label="protein today" value={Math.round(tot.pro)} unit="g" color={tot.pro>=pLo&&pLo>0?sc(9):null}/>
              <MacroTile label={wantsBloodSugar ? "fiber / buffer" : "fiber today"} value={Math.round(tot.fib)} unit="g" color={tot.fib>=fTgt?sc(9):null}/>
              {isAdvanced && <MacroTile label="calories" value={Math.round(tot.cal)} unit="" color={null}/>}
              {isFullTracking && <MacroTile label="carbs" value={Math.round(tot.carb)} unit="g" color={null}/>}
              {isFullTracking && <MacroTile label="fat" value={Math.round(tot.fat)} unit="g" color={null}/>}
            </div>
          </div>

          <div style={{ marginBottom:"0.85rem" }}>
            <ProgressBar label="Protein" value={Math.round(tot.pro)} low={pLo} high={pHi} unit="g" overshootMode="good" compact/>
            <ProgressBar label="Fiber" value={Math.round(tot.fib)} low={fTgt} unit="g" overshootMode="good" compact/>
            {isAdvanced && <ProgressBar label="Calories" value={Math.round(tot.cal)} low={tCal} unit="" overshootMode={isLoss?"warn":"neutral"} compact/>}
            {isFullTracking && <ProgressBar label="Carbs" value={Math.round(tot.carb)} low={tCarb} unit="g" overshootMode={isKeto?"warn":"neutral"} compact/>}
            {isFullTracking && <ProgressBar label="Fat" value={Math.round(tot.fat)} low={tFat} unit="g" overshootMode="neutral" compact/>}
          </div>

          {/* Repeat meal prompt */}
          {repeatPrompt && (
            <div style={{ background:"#fef9c3", borderRadius:10, padding:"10px 14px", marginBottom:10, display:"flex", alignItems:"center", justifyContent:"space-between", border:"0.5px solid #fde68a" }}>
              <span style={{ fontSize:12, color:"#854d0e" }}>⭐ You've had {repeatPrompt} before — save as favorite?</span>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>{ const h = history.find(x=>x.result.name===repeatPrompt); if(h) toggleFav(repeatPrompt, h.result); setRepeatPrompt(null); }} style={{ fontSize:11, padding:"4px 10px", borderRadius:20, background:"#16a34a", color:"#fff", border:"none", cursor:"pointer" }}>Save</button>
                <button onClick={()=>setRepeatPrompt(null)} style={{ fontSize:11, padding:"4px 10px", borderRadius:20, background:"none", color:"#854d0e", border:"none", cursor:"pointer" }}>Skip</button>
              </div>
            </div>
          )}

          {/* Result panel */}
          {analyzeSuccess && <ResultPanel data={analyzeSuccess} onClose={()=>setAnalyzeSuccess(null)} onStar={()=>toggleFav(analyzeSuccess.name, analyzeSuccess)} isFav={!!favorites.find(f=>f.name===analyzeSuccess.name)}/>}
          {analyzeError && <div style={{ padding:"12px 14px", background:"#fee2e2", borderRadius:10, marginBottom:12 }}><p style={{ margin:0, fontSize:13, color:"#991b1b" }}>{analyzeError}</p></div>}

          {/* Meal slot selector */}
          <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
            {SLOTS.map(slot => { const logged = daily.meals.filter(m=>m.slot===slot); const active = activeMeal===slot; return (
              <button key={slot} onClick={()=>setActiveMeal(slot)} style={{ padding:"6px 12px", borderRadius:20, fontSize:12, cursor:"pointer", border:active?"2px solid #16a34a":"0.5px solid var(--color-border-secondary)", background:active?"#f0fdf4":"var(--color-background-primary)", color:active?"#166534":"var(--color-text-primary)", fontWeight:active?500:400, display:"flex", alignItems:"center", gap:5 }}>
                {slot}{logged.length>0 && <span style={{ fontSize:10, background:"#16a34a", color:"#fff", borderRadius:"50%", width:15, height:15, display:"flex", alignItems:"center", justifyContent:"center" }}>{logged.length}</span>}
              </button>
            ); })}
          </div>

          {/* Analyze card */}
          <div style={{ background:"var(--color-background-primary)", borderRadius:18, border:"1px solid var(--color-border-secondary)", padding:"1rem", marginBottom:"1rem", boxShadow:"0 14px 30px rgba(15, 23, 42, 0.04)" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8, marginBottom:10 }}>
              <button onClick={()=>{ setCaptureMode("photo"); setShowPhotoOptions(s => !s || captureMode !== "photo"); }} style={{ padding:"12px 10px", borderRadius:14, border:captureMode==="photo"?"1.5px solid #22c55e":"1px solid var(--color-border-secondary)", background:captureMode==="photo"?"#f0fdf4":"#f8fafc", cursor:"pointer", textAlign:"left" }}>
                <p style={{ margin:"0 0 3px", fontSize:16 }}>📸</p>
                <p style={{ margin:"0 0 2px", fontSize:13, fontWeight:600 }}>Photo</p>
                <p style={{ margin:0, fontSize:11, color:"var(--color-text-secondary)", lineHeight:1.35 }}>Camera or photo library</p>
              </button>
              <button onClick={isListening ? stopVoiceCapture : startVoiceCapture} disabled={!voiceSupported} style={{ padding:"12px 10px", borderRadius:14, border:captureMode==="voice"?"1.5px solid #0ea5e9":"1px solid var(--color-border-secondary)", background:captureMode==="voice"?"#eff6ff":"#f8fafc", cursor:voiceSupported?"pointer":"default", textAlign:"left", opacity:voiceSupported?1:0.65 }}>
                <p style={{ margin:"0 0 3px", fontSize:16 }}>{isListening ? "🎙️" : "🎤"}</p>
                <p style={{ margin:"0 0 2px", fontSize:13, fontWeight:600 }}>{isListening ? "Stop" : "Voice"}</p>
                <p style={{ margin:0, fontSize:11, color:"var(--color-text-secondary)", lineHeight:1.35 }}>{voiceSupported ? (isListening ? "Tap again when you're done" : "Describe it out loud") : "Browser unsupported"}</p>
              </button>
            </div>

            {imgPrev && (
              <div style={{ position:"relative", marginBottom:10 }}>
                <img src={imgPrev} alt="meal" style={{ width:"100%", maxHeight:180, objectFit:"cover", borderRadius:8 }}/>
                <button onClick={()=>{ setImgData(null); setImgPrev(null); }} style={{ position:"absolute", top:6, right:6, background:"rgba(0,0,0,0.6)", color:"#fff", border:"none", borderRadius:20, padding:"3px 9px", cursor:"pointer", fontSize:12 }}>✕</button>
              </div>
            )}
            <input ref={fRef} type="file" accept="image/*" capture="environment" onChange={onImg} style={{ display:"none" }}/>
            <input ref={uploadRef} type="file" accept="image/*" onChange={onImg} style={{ display:"none" }}/>
            <div style={{ padding:"10px 12px", borderRadius:12, background:"#f8fafc", border:"1px dashed #dbe3ea", marginBottom:8 }}>
              {captureMode==="photo" && showPhotoOptions && (
                <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                  <button onClick={()=>fRef.current?.click()} style={{ padding:"8px 12px", borderRadius:10, border:"1px solid var(--color-border-secondary)", background:"#fff", cursor:"pointer", fontSize:12, fontWeight:500, color:"var(--color-text-primary)" }}>
                    Use camera
                  </button>
                  <button onClick={()=>uploadRef.current?.click()} style={{ padding:"8px 12px", borderRadius:10, border:"1px solid var(--color-border-secondary)", background:"#fff", cursor:"pointer", fontSize:12, fontWeight:500, color:"var(--color-text-primary)" }}>
                    Upload existing
                  </button>
                </div>
              )}
              <p style={{ margin:"0 0 5px", fontSize:12, fontWeight:600, color:"var(--color-text-primary)" }}>Optional context</p>
              <textarea value={query} onChange={e=>setQuery(e.target.value)} rows={3} placeholder={captureMode==="voice" ? "Voice transcript will appear here. You can keep talking until you tap stop." : `Add a detail about your ${activeMeal.toLowerCase()} if helpful...`} style={{ width:"100%", fontSize:14, borderRadius:8, padding:"9px 12px", resize:"none", boxSizing:"border-box", fontFamily:"var(--font-sans)", background:"#fff" }}/>
            </div>
            <div style={{ display:"flex", gap:8, marginBottom: showPortionNote?8:0 }}>
              <button onClick={analyze} disabled={loading||(!query.trim()&&!imgData)} style={{ flex:1, padding:"9px", borderRadius:10, background:loading||(!query.trim()&&!imgData)?"var(--color-background-secondary)":"#16a34a", color:loading||(!query.trim()&&!imgData)?"var(--color-text-secondary)":"#fff", border:"none", fontSize:14, fontWeight:500, cursor:"pointer" }}>
                {loading?"Analyzing...":"Analyze"}
              </button>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, marginBottom:showPortionNote?0:4 }}>
              <p style={{ margin:0, fontSize:11, color:"var(--color-text-secondary)" }}>
                {captureMode==="photo" ? (showPhotoOptions ? "Choose camera or photo library." : "Tap photo to choose camera or your photo library.") : (isListening ? "Recording stays open until you tap stop." : "Tap once to start talking, then tap again when you're done.")}
              </p>
            </div>
            <button onClick={()=>setShowPortionNote(s=>!s)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, color:"var(--color-text-tertiary)", padding:"4px 0", display:"block" }}>
              {showPortionNote?"▲ hide portion note":"▼ add portion note"}
            </button>
            {showPortionNote && <input value={portionNote} onChange={e=>setPortionNote(e.target.value)} placeholder="e.g. double portion, half serving, large plate" style={{ width:"100%", fontSize:12, borderRadius:8, padding:"7px 12px", boxSizing:"border-box", marginTop:6 }}/>}
          </div>

          {/* Ask anything */}
          {false && <div style={{ background:"var(--color-background-primary)", borderRadius:12, border:"0.5px solid var(--color-border-secondary)", padding:"1rem", marginBottom:"1rem" }}>
            <p style={{ margin:"0 0 8px", fontWeight:500, fontSize:14 }}>Ask anything</p>
            <textarea value={genQ} onChange={e=>setGenQ(e.target.value)} rows={2} placeholder="How did I do today? Why do I crash after lunch? Best high-protein snack?" style={{ width:"100%", fontSize:13, borderRadius:8, padding:"9px 12px", resize:"none", boxSizing:"border-box", fontFamily:"var(--font-sans)" }}/>
            <div style={{ display:"flex", gap:8, marginTop:8, alignItems:"center" }}>
              <button onClick={askGen} disabled={loading||!genQ.trim()} style={{ padding:"8px 16px", borderRadius:10, background:"#f0fdf4", color:"#166534", border:"0.5px solid #86efac", fontSize:13, cursor:"pointer" }}>{loading?"Thinking...":"Ask ↗"}</button>
              {genA && <button onClick={()=>setGenA(null)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"var(--color-text-tertiary)", padding:0 }}>clear</button>}
            </div>
            {genA && <div style={{ marginTop:10, padding:"10px 12px", background:"var(--color-background-secondary)", borderRadius:8 }}><p style={{ margin:"0 0 8px", fontSize:13, lineHeight:1.55 }}>{genA.answer}</p>{(genA.tips||[]).map((t,i) => <p key={i} style={{ margin:"3px 0", fontSize:12, color:"var(--color-text-secondary)" }}>• {t}</p>)}</div>}
          </div>}

          {/* Favorites */}
          {favorites.length > 0 && (
            <div style={{ marginBottom:"1rem" }}>
              <p style={{ fontSize:13, fontWeight:500, margin:"0 0 8px" }}>Favorites</p>
              <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:4 }}>
                {favorites.map((fav,i) => (
                  <div key={i} style={{ flexShrink:0, display:"flex", alignItems:"center", gap:6, padding:"7px 12px", borderRadius:20, border:"0.5px solid var(--color-border-secondary)", background:"var(--color-background-primary)" }}>
                    {editingFav === fav.name ? (
                      <input value={favNameInput} onChange={e=>setFavNameInput(e.target.value)} onBlur={()=>{ setFavorites(f=>f.map(x=>x.name===fav.name?{...x,displayName:favNameInput}:x)); setEditingFav(null); }} autoFocus style={{ border:"none", background:"transparent", fontSize:12, width:100, outline:"none" }}/>
                    ) : (
                      <>
                        <div style={{ width:7, height:7, borderRadius:"50%", background:sc(fav.result.score), flexShrink:0 }}/>
                        <span onClick={()=>quickLog({query:fav.displayName,result:fav.result})} style={{ fontSize:12, cursor:"pointer", color:"var(--color-text-primary)" }}>{fav.displayName}</span>
                        <button onClick={()=>{ setEditingFav(fav.name); setFavNameInput(fav.displayName); }} style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, color:"var(--color-text-tertiary)", padding:0 }}>✏</button>
                        <button onClick={()=>toggleFav(fav.name)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"var(--color-text-tertiary)", padding:0 }}>×</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent quick-log */}
          {recentFoods.length > 0 && !analyzeSuccess && (
            <div style={{ marginBottom:"1rem" }}>
              <p style={{ fontSize:13, fontWeight:500, margin:"0 0 8px" }}>Quick log recent</p>
              <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:4 }}>
                {recentFoods.map((item,i) => (
                  <button key={i} onClick={()=>quickLog(item)} style={{ flexShrink:0, padding:"7px 12px", borderRadius:20, fontSize:12, cursor:"pointer", border:"0.5px solid var(--color-border-secondary)", background:"var(--color-background-primary)", color:"var(--color-text-primary)", display:"flex", alignItems:"center", gap:6 }}>
                    <div style={{ width:7, height:7, borderRadius:"50%", background:sc(item.result.score), flexShrink:0 }}/>
                    {item.result.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Today's log */}
          {daily.meals.length > 0 && (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:8 }}>
                <p style={{ fontSize:13, fontWeight:500, margin:0 }}>Today's log</p>
                <button onClick={()=>setDaily({date:todayKey(),meals:[]})} style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, color:"#ef4444", padding:0 }}>Reset day</button>
              </div>
              {SLOTS.map(slot => {
                const meals = daily.meals.filter(m=>m.slot===slot);
                if (!meals.length) return null;
                return (
                  <div key={slot} style={{ marginBottom:10 }}>
                    <p style={{ fontSize:11, fontWeight:500, color:"var(--color-text-secondary)", margin:"0 0 4px", textTransform:"uppercase", letterSpacing:"0.05em" }}>{slot}</p>
                    {meals.map((m,i) => (
                      <div key={i} onClick={()=>{ const h = history.find(x=>x.result.name===m.label); if(h) setExpandedResult(expandedResult?.name===m.label?null:h.result); }}
                        style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", marginBottom:4, background:expandedResult?.name===m.label?"#f0fdf4":"var(--color-background-primary)", borderRadius:10, cursor:"pointer", border:`0.5px solid ${expandedResult?.name===m.label?"#86efac":"var(--color-border-tertiary)"}` }}>
                        <Ring score={m.score||5} size={36}/>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ margin:0, fontWeight:500, fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.label}</p>
                          <p style={{ margin:0, fontSize:11, color:"var(--color-text-secondary)" }}>{m.time} · {Math.round(m.macros?.protein_g||0)}g pro · {Math.round(m.macros?.calories||0)} cal</p>
                        </div>
                        <button onClick={e=>{ e.stopPropagation(); setDaily(dl=>({...dl,meals:dl.meals.filter(x=>x!==m)})); }} style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, color:"var(--color-text-tertiary)", padding:"0 2px" }}>✕</button>
                      </div>
                    ))}
                  </div>
                );
              })}
              {expandedResult && <ResultPanel data={expandedResult} onClose={()=>setExpandedResult(null)} onStar={()=>toggleFav(expandedResult.name, expandedResult)} isFav={!!favorites.find(f=>f.name===expandedResult.name)}/>}
            </div>
          )}
        </div>
      )}

      {/* ── TRACKER ── */}
      {false && screen==="tracker" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <h3 style={{ fontWeight:500, fontSize:17, margin:0 }}>Daily totals</h3>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <span style={{ fontSize:12, color:"var(--color-text-secondary)" }}>{new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</span>
              <button onClick={()=>setDaily({date:todayKey(),meals:[]})} style={{ fontSize:11, color:"#ef4444", background:"none", border:"none", cursor:"pointer", padding:0 }}>Reset</button>
            </div>
          </div>

          {/* Weight log */}
          <div style={{ background:"var(--color-background-primary)", borderRadius:12, border:"0.5px solid var(--color-border-secondary)", padding:"1rem", marginBottom:14 }}>
            <p style={{ margin:"0 0 8px", fontWeight:500, fontSize:14 }}>Log today's weight</p>
            <div style={{ display:"flex", gap:8 }}>
              <input type="number" placeholder="lbs" value={weightInput} onChange={e=>setWeightInput(e.target.value)} style={{ flex:1, fontSize:14, borderRadius:8, padding:"8px 12px", boxSizing:"border-box" }}/>
              <button onClick={()=>{ if(!weightInput) return; const entry={date:new Date().toLocaleDateString(),weight:parseFloat(weightInput),cal:Math.round(tot.cal)}; setWeightLog(w=>[entry,...w.slice(0,89)]); setWeightInput(""); }} style={{ padding:"8px 16px", borderRadius:10, background:"#16a34a", color:"#fff", border:"none", fontSize:13, cursor:"pointer" }}>Log</button>
            </div>
            {weightLog.slice(0,5).length > 0 && (
              <div style={{ marginTop:10 }}>
                {weightLog.slice(0,5).map((w,i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:i<4?"0.5px solid var(--color-border-tertiary)":"none" }}>
                    <span style={{ fontSize:12, color:"var(--color-text-secondary)" }}>{w.date}</span>
                    <span style={{ fontSize:12, fontWeight:500 }}>{w.weight} lbs</span>
                    <span style={{ fontSize:12, color:"var(--color-text-secondary)" }}>{w.cal} cal that day</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ProgressBar label="Protein" value={Math.round(tot.pro)} low={pLo} high={pHi} unit="g" overshootMode="good"/>
          <ProgressBar label="Fiber" value={Math.round(tot.fib)} low={fTgt} unit="g" overshootMode="good"/>
          {isAdvanced && <ProgressBar label="Calories" value={Math.round(tot.cal)} low={tCal} unit="" overshootMode={isLoss?"warn":"neutral"}/>}
          {isFullTracking && <ProgressBar label="Carbs" value={Math.round(tot.carb)} low={tCarb} unit="g" overshootMode={isKeto?"warn":"neutral"}/>}
          {isFullTracking && <ProgressBar label="Fat" value={Math.round(tot.fat)} low={tFat} unit="g" overshootMode="neutral"/>}

          {isAdvanced && (
            <div style={{ background:"var(--color-background-primary)", borderRadius:12, border:"0.5px solid var(--color-border-secondary)", padding:"1rem", marginTop:8, marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <p style={{ margin:0, fontWeight:500, fontSize:13 }}>Adjust targets</p>
              </div>
              {[["Calorie target","cal",tCal],["Carb target (g)","carb",tCarb],["Fat target (g)","fat",tFat]].filter(([,k]) => k==="cal" ? isAdvanced : isFullTracking).map(([label,key,val]) => (
                <div key={key} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                  <span style={{ fontSize:12, color:"var(--color-text-secondary)", width:130, flexShrink:0 }}>{label}</span>
                  <input type="number" defaultValue={val} onBlur={e=>setProfile(p=>({...p,customTargets:{...p.customTargets,[key]:parseInt(e.target.value)||val}}))} style={{ flex:1, fontSize:13, borderRadius:8, padding:"6px 10px", boxSizing:"border-box" }}/>
                  <button onClick={()=>setProfile(p=>({...p,customTargets:{...p.customTargets,[key]:undefined}}))} style={{ fontSize:11, color:"#9ca3af", background:"none", border:"none", cursor:"pointer" }}>reset</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop:8 }}>
            <p style={{ fontSize:13, fontWeight:500, margin:"0 0 10px" }}>Meals by slot</p>
            {SLOTS.map(slot => {
              const meals = daily.meals.filter(m=>m.slot===slot);
              return (
                <div key={slot} style={{ marginBottom:12 }}>
                  <p style={{ fontSize:11, fontWeight:500, color:"var(--color-text-secondary)", margin:"0 0 4px", textTransform:"uppercase", letterSpacing:"0.05em" }}>{slot} {meals.length===0&&<span style={{ color:"var(--color-border-secondary)", fontWeight:400 }}>— not logged</span>}</p>
                  {meals.map((m,i) => <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", marginBottom:4, background:"var(--color-background-primary)", borderRadius:10, border:"0.5px solid var(--color-border-tertiary)" }}><Ring score={m.score||5} size={34}/><div style={{ flex:1 }}><p style={{ margin:0, fontWeight:500, fontSize:12 }}>{m.label}</p><p style={{ margin:0, fontSize:11, color:"var(--color-text-secondary)" }}>{m.time} · {Math.round(m.macros?.protein_g||0)}g pro · {Math.round(m.macros?.fiber_g||0)}g fiber</p></div><button onClick={()=>setDaily(dl=>({...dl,meals:dl.meals.filter(x=>x!==m)}))} style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, color:"var(--color-text-tertiary)", padding:"0 2px" }}>✕</button></div>)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── REWARDS ── */}
      {false && screen==="rewards" && (
        <div>
          <h3 style={{ fontWeight:500, fontSize:17, margin:"0 0 14px" }}>Rewards</h3>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16 }}>
            {[["🔥","Current streak",`${streakData.current} days`],["⚡","Longest streak",`${streakData.longest} days`],["🏅","Badges earned",`${badges.length} / ${BADGE_DEFS.length}`]].map(([icon,label,val]) => (
              <div key={label} style={{ background:"var(--color-background-secondary)", borderRadius:12, padding:"12px 10px", textAlign:"center", border:"0.5px solid var(--color-border-tertiary)" }}>
                <div style={{ fontSize:22, marginBottom:4 }}>{icon}</div>
                <p style={{ margin:"0 0 2px", fontSize:10, color:"var(--color-text-secondary)" }}>{label}</p>
                <p style={{ margin:0, fontSize:16, fontWeight:500 }}>{val}</p>
              </div>
            ))}
          </div>

          {/* Weekly score */}
          {history.length > 0 && (() => {
            const week = history.filter(h => { const d = new Date(h.date); const now = new Date(); return (now-d)/(1000*60*60*24) < 7; });
            const avg = week.length ? (week.reduce((a,h)=>a+h.result.score,0)/week.length).toFixed(1) : null;
            const proHit = week.filter(h => h.result.macros?.protein_g >= pLo/week.length).length;
            return avg ? (
              <div style={{ background:"var(--color-background-primary)", borderRadius:12, border:"0.5px solid var(--color-border-secondary)", padding:"1rem", marginBottom:14 }}>
                <p style={{ margin:"0 0 10px", fontWeight:500, fontSize:14 }}>This week</p>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
                  {[["Avg score",avg+" / 10"],["Meals logged",week.length]].map(([l,v]) => (
                    <div key={l} style={{ background:"var(--color-background-secondary)", borderRadius:8, padding:"10px", textAlign:"center" }}>
                      <p style={{ margin:"0 0 2px", fontSize:11, color:"var(--color-text-secondary)" }}>{l}</p>
                      <p style={{ margin:0, fontSize:17, fontWeight:500 }}>{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null;
          })()}

          {/* Badge gallery */}
          <p style={{ fontSize:13, fontWeight:500, margin:"0 0 10px" }}>Badge collection</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
            {BADGE_DEFS.map(b => {
              const earned = badges.includes(b.id);
              return (
                <div key={b.id} style={{ display:"flex", gap:12, alignItems:"center", padding:"12px", borderRadius:12, background:earned?"var(--color-background-primary)":"var(--color-background-secondary)", border:`0.5px solid ${earned?"#86efac":"var(--color-border-tertiary)"}`, opacity:earned?1:0.5 }}>
                  <span style={{ fontSize:24, flexShrink:0 }}>{b.icon}</span>
                  <div>
                    <p style={{ margin:"0 0 2px", fontWeight:500, fontSize:13 }}>{b.name}</p>
                    <p style={{ margin:0, fontSize:11, color:"var(--color-text-secondary)" }}>{b.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SUPPLEMENTS ── */}
      {false && screen==="supplements" && (
        <div>
          <h3 style={{ fontWeight:500, fontSize:17, margin:"0 0 8px" }}>Supplements & medications</h3>
          {suppList.length===0 ? (
            <div style={{ background:"var(--color-background-primary)", borderRadius:12, border:"0.5px solid var(--color-border-secondary)", padding:"1rem", marginBottom:"1rem" }}>
              <p style={{ fontSize:13, color:"var(--color-text-secondary)", marginBottom:10, lineHeight:1.5 }}>List all supplements and medications — one per line or comma-separated.</p>
              <textarea value={suppInput} onChange={e=>setSuppInput(e.target.value)} rows={7} placeholder={"e.g.\nCreatine 5g\nMagnesium Glycinate 400mg\nVitamin D3/K2\nZinc 30mg\nMetformin 500mg"} style={{ width:"100%", fontSize:13, borderRadius:10, padding:"10px 12px", resize:"none", boxSizing:"border-box", fontFamily:"var(--font-sans)", marginBottom:10 }}/>
              <button onClick={()=>{ const items=suppInput.split(/[\n,;]+/).map(s=>s.trim()).filter(Boolean); if(items.length){ setSuppList(items); setSuppInput(""); } }} disabled={!suppInput.trim()} style={{ padding:"10px 18px", borderRadius:10, background:suppInput.trim()?"#16a34a":"var(--color-background-secondary)", color:suppInput.trim()?"#fff":"var(--color-text-secondary)", border:"none", fontSize:14, cursor:"pointer", fontWeight:500 }}>Save list</button>
            </div>
          ) : (
            <div style={{ marginBottom:"1rem" }}>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:10 }}>
                {suppList.map((s,i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", borderRadius:20, border:`0.5px solid ${suppTaken[s]?"#86efac":"var(--color-border-secondary)"}`, background:suppTaken[s]?"#f0fdf4":"var(--color-background-primary)" }}>
                    <button onClick={()=>{ const next = {...suppTaken,[s]:!suppTaken[s]}; setSuppTaken(next); LS.set("nrx_taken_"+todayKey(), next); }} style={{ width:16, height:16, borderRadius:"50%", border:`2px solid ${suppTaken[s]?"#16a34a":"#d1d5db"}`, background:suppTaken[s]?"#16a34a":"transparent", cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      {suppTaken[s] && <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5"><polyline points="2 6 5 9 10 3"/></svg>}
                    </button>
                    <span style={{ fontSize:12, color:suppTaken[s]?"#166534":"var(--color-text-primary)" }}>{s}</span>
                    <button onClick={()=>setSuppList(l=>l.filter((_,j)=>j!==i))} style={{ background:"none", border:"none", cursor:"pointer", fontSize:14, color:"var(--color-text-tertiary)", padding:0 }}>×</button>
                  </div>
                ))}
                <div style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 10px", borderRadius:20, border:"0.5px dashed var(--color-border-secondary)" }}>
                  <input value={suppInput} onChange={e=>setSuppInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&suppInput.trim()){ setSuppList(l=>[...l,suppInput.trim()]); setSuppInput(""); } }} placeholder="Add..." style={{ border:"none", background:"transparent", fontSize:12, width:100, outline:"none", color:"var(--color-text-primary)" }}/>
                  <button onClick={()=>{ if(suppInput.trim()){ setSuppList(l=>[...l,suppInput.trim()]); setSuppInput(""); } }} style={{ background:"#16a34a", color:"#fff", border:"none", borderRadius:"50%", width:18, height:18, cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>+</button>
                </div>
              </div>
              <p style={{ fontSize:12, color:"var(--color-text-secondary)", marginBottom:10 }}>{Object.values(suppTaken).filter(Boolean).length} of {suppList.length} taken today</p>
              <div style={{ display:"flex", gap:8, marginBottom:"1rem" }}>
                <button onClick={getSched} disabled={loading||!suppList.length} style={{ flex:1, padding:"10px", borderRadius:10, background:loading||!suppList.length?"var(--color-background-secondary)":"#16a34a", color:loading||!suppList.length?"var(--color-text-secondary)":"#fff", border:"none", fontSize:14, cursor:"pointer", fontWeight:500 }}>{loading?"Building schedule...":"Get optimal schedule"}</button>
                <button onClick={()=>{ setSuppList([]); setSuppResult(null); setSuppTaken({}); LS.set("nrx_taken_"+todayKey(),{}); }} style={{ padding:"10px 14px", borderRadius:10, background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-secondary)", fontSize:13, cursor:"pointer", color:"var(--color-text-secondary)" }}>Reset</button>
              </div>
            </div>
          )}
          {suppResult?.schedule && (
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:"1rem" }}>
              {suppResult.schedule.map((slot,i) => (
                <div key={i} style={{ background:"var(--color-background-primary)", borderRadius:12, border:"0.5px solid var(--color-border-secondary)", padding:"1rem" }}>
                  <p style={{ margin:"0 0 8px", fontWeight:500, fontSize:14 }}>{slot.time}</p>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:slot.notes?8:0 }}>
                    {(slot.items||[]).map((item,j) => <span key={j} style={{ fontSize:12, padding:"4px 10px", borderRadius:20, background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-tertiary)" }}>{item}</span>)}
                  </div>
                  {slot.notes && <p style={{ margin:0, fontSize:12, color:"var(--color-text-secondary)", lineHeight:1.4 }}>{slot.notes}</p>}
                </div>
              ))}
            </div>
          )}
          <div style={{ background:"var(--color-background-primary)", borderRadius:12, border:"0.5px solid var(--color-border-secondary)", padding:"1rem" }}>
            <p style={{ margin:"0 0 6px", fontWeight:500, fontSize:14 }}>Ask why</p>
            <p style={{ margin:"0 0 10px", fontSize:12, color:"var(--color-text-secondary)", lineHeight:1.4 }}>Questions about timing, interactions, or scheduling...</p>
            <textarea value={suppQ} onChange={e=>setSuppQ(e.target.value)} rows={2} placeholder="Why is zinc taken alone? Should I move PS to bedtime?" style={{ width:"100%", fontSize:13, borderRadius:8, padding:"9px 12px", resize:"none", boxSizing:"border-box", fontFamily:"var(--font-sans)", marginBottom:8 }}/>
            <button onClick={askSupp} disabled={loading||!suppQ.trim()} style={{ padding:"8px 16px", borderRadius:10, background:"#f0fdf4", color:"#166534", border:"0.5px solid #86efac", fontSize:13, cursor:"pointer" }}>{loading?"Thinking...":"Ask ↗"}</button>
            {suppQA && <div style={{ marginTop:10, padding:"10px 12px", background:"var(--color-background-secondary)", borderRadius:8 }}><p style={{ margin:"0 0 8px", fontSize:13, lineHeight:1.55 }}>{suppQA.answer}</p>{(suppQA.sources||[]).length>0&&<p style={{ margin:0, fontSize:11, color:"var(--color-text-tertiary)" }}>Sources: {suppQA.sources.join(", ")}</p>}</div>}
          </div>
        </div>
      )}

      {/* ── JOURNAL ── */}
      {false && screen==="journal" && (
        <div>
          <h3 style={{ fontWeight:500, fontSize:17, margin:"0 0 8px" }}>How did you feel?</h3>
          <p style={{ fontSize:13, color:"var(--color-text-secondary)", marginBottom:12, lineHeight:1.5 }}>Log symptoms, energy, digestion, or performance notes. Over time this becomes your pattern-detection space.</p>
          <div style={{ background:"var(--color-background-primary)", borderRadius:12, border:"0.5px solid var(--color-border-secondary)", padding:"1rem", marginBottom:"1rem" }}>
            <input placeholder="What did you eat?" value={je.food} onChange={e=>setJe(j=>({...j,food:e.target.value}))} style={{ width:"100%", fontSize:14, marginBottom:8, boxSizing:"border-box", borderRadius:8, padding:"9px 12px" }}/>
            <input placeholder="Any symptom or note? (bloating, tired, underfueled, headache...)" value={je.symptom} onChange={e=>setJe(j=>({...j,symptom:e.target.value}))} style={{ width:"100%", fontSize:14, marginBottom:8, boxSizing:"border-box", borderRadius:8, padding:"9px 12px" }}/>
            <textarea placeholder="Notes (timing, energy, mood, workout, bathroom, stress...)" value={je.notes} onChange={e=>setJe(j=>({...j,notes:e.target.value}))} rows={2} style={{ width:"100%", fontSize:13, resize:"none", boxSizing:"border-box", borderRadius:8, padding:"9px 12px", fontFamily:"var(--font-sans)", marginBottom:10 }}/>
            <button onClick={()=>{ if(!je.food) return; const next = [{...je,date:new Date().toLocaleDateString()},...journal]; setJournal(next); setJe({food:"",symptom:"",notes:""}); }} style={{ padding:"9px 18px", borderRadius:10, background:"#16a34a", color:"#fff", border:"none", fontSize:14, cursor:"pointer" }}>Save entry</button>
          </div>
          {journal.map((e,i) => <div key={i} style={{ padding:"10px 12px", background:"var(--color-background-primary)", borderRadius:10, border:"0.5px solid var(--color-border-tertiary)", marginBottom:8 }}><div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}><p style={{ margin:0, fontWeight:500, fontSize:13 }}>{e.food}</p><p style={{ margin:0, fontSize:11, color:"var(--color-text-secondary)" }}>{e.date}</p></div>{e.symptom&&<p style={{ margin:"0 0 2px", fontSize:12, color:"#dc2626" }}>⚠ {e.symptom}</p>}{e.notes&&<p style={{ margin:0, fontSize:12, color:"var(--color-text-secondary)" }}>{e.notes}</p>}</div>)}
        </div>
      )}

      {/* ── PROFILE ── */}
      {screen==="profile" && (
        <div>
          <button onClick={()=>nav("home")} style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, color:"var(--color-text-secondary)", marginBottom:12, padding:0 }}>← Back</button>
          <h3 style={{ fontWeight:500, fontSize:17, margin:"0 0 14px" }}>Your profile</h3>
          <div style={{ background:"var(--color-background-primary)", borderRadius:12, border:"0.5px solid var(--color-border-secondary)", padding:"1rem", marginBottom:12 }}>
            {[["Name","name","text"],["Age","age","number"],["Weight (lbs)","weight","number"]].map(([l,f,t]) => <div key={f} style={{ marginBottom:10 }}><p style={{ margin:"0 0 3px", fontSize:11, color:"var(--color-text-secondary)" }}>{l}</p><input type={t} value={profile[f]||""} onChange={e=>setProfile(p=>({...p,[f]:e.target.value}))} style={{ width:"100%", fontSize:14, borderRadius:8, padding:"8px 12px", boxSizing:"border-box" }}/></div>)}
            <div style={{ marginBottom:10 }}>
              <p style={{ margin:"0 0 3px", fontSize:11, color:"var(--color-text-secondary)" }}>Height</p>
              <div style={{ display:"flex", gap:8 }}>
                <div style={{ flex:1, position:"relative" }}><input type="number" placeholder="Feet" value={profile.feet||""} onChange={e=>setProfile(p=>({...p,feet:e.target.value}))} style={{ width:"100%", fontSize:14, borderRadius:8, padding:"8px 30px 8px 12px", boxSizing:"border-box" }}/><span style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", fontSize:12, color:"var(--color-text-tertiary)" }}>ft</span></div>
                <div style={{ flex:1, position:"relative" }}><input type="number" placeholder="Inches" value={profile.inches||""} onChange={e=>setProfile(p=>({...p,inches:e.target.value}))} style={{ width:"100%", fontSize:14, borderRadius:8, padding:"8px 30px 8px 12px", boxSizing:"border-box" }}/><span style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", fontSize:12, color:"var(--color-text-tertiary)" }}>in</span></div>
              </div>
              {heightDisplay && <p style={{ margin:"6px 0 0", fontSize:12, color:"var(--color-text-secondary)" }}>{heightDisplay}</p>}
            </div>
            {/* Fiber target with popup */}
            <div style={{ marginBottom:10 }}>
              <p style={{ margin:"0 0 3px", fontSize:11, color:"var(--color-text-secondary)" }}>Daily fiber target (g)</p>
              <input type="number" min="15" max="60" value={profile.fiberTarget||35} onChange={e=>{ const v=parseInt(e.target.value)||35; if(v<35&&!fiberPopup) setFiberPopup(true); setProfile(p=>({...p,fiberTarget:Math.max(15,v)})); }} style={{ width:"100%", fontSize:14, borderRadius:8, padding:"8px 12px", boxSizing:"border-box" }}/>
              {fiberPopup && <div style={{ marginTop:8, padding:"10px 12px", background:"#fefce8", borderRadius:8, border:"0.5px solid #fde68a" }}>
                <p style={{ margin:"0 0 6px", fontSize:12, color:"#854d0e", lineHeight:1.4 }}>Current research (Sonnenburg, Hyman, Attia) recommends 30–40g daily for gut motility, microbiome diversity, and metabolic health. 15g is the absolute minimum; even the low end of evidence suggests 20g+. Adjust only if you have a documented GI condition.</p>
                <button onClick={()=>setFiberPopup(false)} style={{ fontSize:11, padding:"4px 12px", borderRadius:20, background:"#16a34a", color:"#fff", border:"none", cursor:"pointer" }}>Got it</button>
              </div>}
            </div>
            {/* Tracking level */}
            <div style={{ marginBottom:10 }}>
              <p style={{ margin:"0 0 6px", fontSize:11, color:"var(--color-text-secondary)" }}>Tracking level</p>
              {TRACKING_LEVELS.map(opt => <button key={opt} onClick={()=>setProfile(p=>({...p,trackingLevel:opt}))} style={{ display:"block", width:"100%", textAlign:"left", padding:"9px 12px", marginBottom:6, borderRadius:10, cursor:"pointer", fontSize:13, border:profile.trackingLevel===opt?"2px solid #16a34a":"0.5px solid var(--color-border-secondary)", background:profile.trackingLevel===opt?"#f0fdf4":"var(--color-background-primary)", color:"var(--color-text-primary)" }}>{opt}</button>)}
            </div>
            {pHi > 0 && <div style={{ padding:"9px 12px", background:"#f0fdf4", borderRadius:8, border:"0.5px solid #86efac" }}><p style={{ margin:0, fontSize:12, color:"#166534", lineHeight:1.5 }}>Protein: <strong>{pLo}–{pHi}g/day</strong> · TDEE: <strong>~{calcTDEE(parseFloat(profile.weight)||0, profile.activityLevel)} cal</strong><br/><span style={{ fontSize:10 }}>{isMuscle?"1–1.6× lean body mass":"0.7–1.0× body weight"}</span></p></div>}
          </div>
          <div style={{ background:"var(--color-background-primary)", borderRadius:12, border:"0.5px solid var(--color-border-secondary)", padding:"1rem", marginBottom:12 }}>
            <p style={{ margin:"0 0 8px", fontWeight:500, fontSize:14 }}>Beta build</p>
            <p style={{ margin:0, fontSize:12, color:"var(--color-text-secondary)", lineHeight:1.45 }}>This beta is designed to run through a secure server function when deployed, so your testers can just open the link and use it without handling any API setup.</p>
          </div>
          {profile.goals.length>0 && <div style={{ background:"var(--color-background-primary)", borderRadius:12, border:"0.5px solid var(--color-border-secondary)", padding:"1rem", marginBottom:12 }}><p style={{ margin:"0 0 8px", fontWeight:500, fontSize:14 }}>Goals</p><div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>{profile.goals.map(g=><span key={g} style={{ padding:"5px 12px", background:"#f0fdf4", color:"#166534", borderRadius:20, fontSize:12, border:"0.5px solid #86efac" }}>{g}</span>)}</div></div>}
          {/* Data export */}
          <div style={{ background:"var(--color-background-primary)", borderRadius:12, border:"0.5px solid var(--color-border-secondary)", padding:"1rem" }}>
            <p style={{ margin:"0 0 8px", fontWeight:500, fontSize:14 }}>Data</p>
            <p style={{ margin:"0 0 10px", fontSize:12, color:"var(--color-text-secondary)", lineHeight:1.4 }}>Your data is stored locally in this browser. Clearing browser data will erase it. Export a backup anytime.</p>
            <button onClick={()=>{ const data = { profile, history, favorites, badges, streakData, weightLog, daily }; const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"}); const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="nourishrx_backup.json"; a.click(); }} style={{ padding:"9px 16px", borderRadius:10, background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-secondary)", fontSize:13, cursor:"pointer", color:"var(--color-text-primary)" }}>Export data (JSON)</button>
          </div>
        </div>
      )}
    </div>
  );
}
