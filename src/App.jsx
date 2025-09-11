// src/App.jsx — ランキングをタブ切替（素直なコイン/前日比/7日/30日）＋棒グラフ

import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import "./App.css";

// 軽量ハッシュルーター
const useHashRoute = () => {
  const get = () => window.location.hash.replace("#", "") || "/";
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const onHash = () => setRoute(get());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const push = (path) => { window.location.hash = path; };
  return { route, push };
};

export default function App() {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [coins, setCoins] = useState("");
  const [history, setHistory] = useState([]);
  const [board, setBoard] = useState([]);
  const [boardDate, setBoardDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [canEdit, setCanEdit] = useState(true);
  const [todayYmd, setTodayYmd] = useState("");
  const [flash, setFlash] = useState({ type: "", text: "" });

  // ランキングタブ
  const [tab, setTab] = useState("daily"); // "raw" | "daily" | "7d" | "30d"
  const modeMap = { raw: { mode: "raw" }, daily: { mode: "daily" }, "7d": { mode: "period", periodDays: 7 }, "30d": { mode: "period", periodDays: 30 } };

  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const loggedIn = useMemo(() => !!token, [token]);

  const { route, push } = useHashRoute();

  const load = async () => {
    const st = await api.status();
    if (!st?.error) {
      setCanEdit(!!st.canEditToday);
      setBoardDate(st.board_date_ymd || "");
      setTodayYmd(st.today_ymd || "");
    }
    if (loggedIn) {
      const me = await api.myCoins(14);
      setHistory(Array.isArray(me) ? me : []);
    } else {
      setHistory([]);
    }
    const b = await api.board({ ...modeMap[tab] });
    setBoard(Array.isArray(b?.board) ? b.board : []);
    if (b?.date_ymd) setBoardDate(b.date_ymd);
  };

  useEffect(() => { load(); }, [loggedIn, tab]);

  // ログイン
  const doLogin = async () => {
    if (!name.trim() || pin.trim().length < 4) return alert("名前と4桁以上のPINを入力してね");
    setBusy(true);
    try {
      const res = await api.login(name.trim(), pin.trim());
      if (res.token) {
        localStorage.setItem("token", res.token);
        setToken(res.token);
        setName(""); setPin("");
        push("/me");
        await load();
      } else {
        alert(res.error || "ログインに失敗しました");
      }
    } finally { setBusy(false); }
  };

  // 新規登録
  const doSignup = async (signupName, signupPin) => {
    setBusy(true);
    try {
      const res = await api.register(signupName.trim(), signupPin.trim());
      if (res.token) {
        localStorage.setItem("token", res.token);
        setToken(res.token);
        setFlash({ type: "success", text: `登録完了！ようこそ ${signupName} さん` });
        setTimeout(() => setFlash({ type: "", text: "" }), 3000);
        push("/me");
        await load();
      } else {
        alert(res.error || "登録に失敗しました");
      }
    } finally { setBusy(false); }
  };

  // コイン保存
  const submitCoins = async () => {
    const n = Number(coins);
    if (!Number.isInteger(n) || n < 0) return alert("0以上の整数で入力してね");
    setBusy(true);
    try {
      const res = await api.postCoins(n);
      if (res.error) return alert(res.error);
      setCoins("");
      setFlash({ type: "success", text: "保存しました" });
      setTimeout(() => setFlash({ type: "", text: "" }), 2000);
      await load();
    } finally { setBusy(false); }
  };
  const onCoinsKeyDown = (e) => { if (e.key === "Enter" && !busy) submitCoins(); };

  // ルーティング整合
  useEffect(() => {
    if (!loggedIn && route === "/me") push("/");
    if (loggedIn && (route === "/" || route === "/signup")) push("/me");
  }, [loggedIn, route]);

  return (
    <div className="container">
      <h1>TSUMU COINS</h1>
      {flash.text && <div className={`toast ${flash.type}`}>{flash.text}</div>}

      {/* ログイン */}
      {route === "/" && (
        <div className="card">
          <h2>ログイン</h2>
          <input placeholder="名前" value={name} onChange={(e)=>setName(e.target.value)} />
          <input placeholder="PIN(4桁以上)" type="password" inputMode="numeric"
              autoComplete="current-password" value={pin} onChange={(e)=>setPin(e.target.value)} />
          <div className="row">
            <button disabled={busy} onClick={doLogin}>ログイン</button>
          </div>
          <div className="subrow">
            <button className="link" onClick={()=>push("/signup")}>新規登録はこちら</button>
          </div>
        </div>
      )}

      {/* 新規登録 */}
      {route === "/signup" && (
        <SignupCard busy={busy} onSubmit={doSignup} onBack={()=>push("/")} />
      )}

      {/* マイページ */}
      {route === "/me" && loggedIn && (
        <div className="card">
          <h2>マイページ</h2>
          <p style={{ margin:"6px 0 12px", opacity:.8 }}>
            今日は <b>{todayYmd || "(取得中…)"}</b>。{canEdit ? "23:59まで更新できます" : "本日の入力は締切済み（23:59）"}
          </p>
          <input placeholder="今日のコイン数"
            value={coins}
            onChange={(e)=>setCoins(e.target.value.replace(/[^\d]/g,""))}
            inputMode="numeric"
            onKeyDown={onCoinsKeyDown}
            disabled={!canEdit}
          />
          <div className="row">
            <button disabled={busy || coins === "" || !canEdit} onClick={submitCoins}>保存</button>
            <button className="ghost" disabled={busy} onClick={()=>{
              localStorage.removeItem("token"); setToken(""); setFlash({ type:"", text:"" }); setCoins(""); window.location.hash="/";
            }}>ログアウト</button>
          </div>
        </div>
      )}

      {/* ランキングカード（タブ＋数値＋棒グラフ） */}
      <div className="card">
        <h3>ランキング</h3>
        <Tabs value={tab} onChange={setTab} />
        <RankListAndBars data={board} unit={labelForTab(tab)} />
        <p className="muted">基準日: {boardDate || "取得中…"}（締切済み日の集計）</p>
      </div>

      {/* 履歴 */}
      <div className="grid">
        <div className="card">
          <h3>自分の履歴（直近14日）</h3>
          <table>
            <thead><tr><th>日付</th><th>コイン</th><th>前日比</th></tr></thead>
            <tbody>
              {history.map(r=>(
                <tr key={r.date_ymd}>
                  <td>{r.date_ymd}</td>
                  <td>{Number(r.coins).toLocaleString()}</td>
                  <td className={r.diff >= 0 ? "pos" : "neg"}>{r.diff >= 0 ? `+${r.diff}` : r.diff}</td>
                </tr>
              ))}
              {history.length===0 && <tr><td colSpan={3} style={{opacity:.6}}>データがありません</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <footer>API: {import.meta.env.VITE_API_BASE}</footer>
    </div>
  );
}

// --------------- パーツ ---------------

function SignupCard({ busy, onSubmit, onBack }) {
  const [n, setN] = useState("");
  const [p, setP] = useState("");
  return (
    <div className="card">
      <h2>新規登録</h2>
      <input placeholder="名前" value={n} onChange={(e)=>setN(e.target.value)} />
      <input placeholder="PIN(4桁以上)" type="password" inputMode="numeric" value={p} onChange={(e)=>setP(e.target.value)} />
      <div className="row">
        <button disabled={busy || !n.trim() || p.trim().length<4} onClick={()=>onSubmit(n, p)}>登録する</button>
        <button className="ghost" disabled={busy} onClick={onBack}>戻る</button>
      </div>
    </div>
  );
}

function Tabs({ value, onChange }) {
  return (
    <div className="tabs">
      <button className={`tab ${value==="raw"?"active":""}`}   onClick={()=>onChange("raw")}>素直なコイン数</button>
      <button className={`tab ${value==="daily"?"active":""}`} onClick={()=>onChange("daily")}>前日比</button>
      <button className={`tab ${value==="7d"?"active":""}`}    onClick={()=>onChange("7d")}>7日間増加</button>
      <button className={`tab ${value==="30d"?"active":""}`}   onClick={()=>onChange("30d")}>30日間増加</button>
    </div>
  );
}

function labelForTab(tab) {
  if (tab==="raw") return "枚";
  if (tab==="daily") return "枚（前日比）";
  if (tab==="7d") return "枚/7日";
  if (tab==="30d") return "枚/30日";
  return "枚";
}

function RankListAndBars({ data, unit }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="rank-wrap">
      <ol className="rank-list">
        {data.map((b, i) => (
          <li key={`${b.name}-${i}`}>
            <span className="rank-name">{i+1}. {b.name}</span>
            <b className="rank-value">{Number(b.value).toLocaleString()} {unit}</b>
            <div className="bar"><div className="bar-fill" style={{ width: `${(b.value/max)*100}%` }} /></div>
          </li>
        ))}
        {data.length===0 && <li style={{opacity:.6}}>まだデータがありません</li>}
      </ol>
    </div>
  );
}
