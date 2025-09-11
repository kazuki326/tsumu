// src/App.jsx — マイページ内に「履歴 / 全体ランキング」タブ。ランキング枠で囲む＋タブ名「コイン数」

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
  // 共通UI状態
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [coins, setCoins] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState({ type: "", text: "" });

  // 認証
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const loggedIn = useMemo(() => !!token, [token]);

  // マイページ表示用
  const [todayYmd, setTodayYmd] = useState("");
  const [canEdit, setCanEdit] = useState(true);
  const [myHistory, setMyHistory] = useState([]);

  // ランキング
  const [boardDate, setBoardDate] = useState("");
  const [board, setBoard] = useState([]);
  const [boardTab, setBoardTab] = useState("daily"); // "raw" | "daily" | "7d" | "30d"
  const modeMap = {
    raw: { mode: "raw" },
    daily: { mode: "daily" },
    "7d": { mode: "period", periodDays: 7 },
    "30d": { mode: "period", periodDays: 30 },
  };

  // マイページ内タブ（履歴 or ランキング）
  const [meTab, setMeTab] = useState("history"); // "history" | "leaderboard"

  const { route, push } = useHashRoute();

  // データロード
  const loadStatus = async () => {
    const st = await api.status();
    if (!st?.error) {
      setCanEdit(!!st.canEditToday);
      setTodayYmd(st.today_ymd || "");
      setBoardDate(st.board_date_ymd || "");
    }
  };
  const loadMy = async () => {
    if (!loggedIn) { setMyHistory([]); return; }
    const me = await api.myCoins(14);
    setMyHistory(Array.isArray(me) ? me : []);
  };
  const loadBoard = async () => {
    const b = await api.board({ ...modeMap[boardTab] });
    setBoard(Array.isArray(b?.board) ? b.board : []);
    if (b?.date_ymd) setBoardDate(b.date_ymd);
  };

  useEffect(() => { loadStatus(); }, []);
  useEffect(() => { loadMy(); }, [loggedIn]);
  useEffect(() => { loadBoard(); }, [boardTab, loggedIn]);

  // 認証処理
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
      } else {
        alert(res.error || "ログインに失敗しました");
      }
    } finally { setBusy(false); }
  };
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
      } else {
        alert(res.error || "登録に失敗しました");
      }
    } finally { setBusy(false); }
  };

  // 入力
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
      await Promise.all([loadMy(), loadBoard()]);
    } finally { setBusy(false); }
  };
  const onCoinsKeyDown = (e) => { if (e.key === "Enter" && !busy) submitCoins(); };

  // ルート整合
  useEffect(() => {
    if (!loggedIn && route === "/me") push("/");
    if (loggedIn && (route === "/" || route === "/signup")) push("/me");
  }, [loggedIn, route]);

  return (
    <div className="container">
      <h1>TSUMU COINS</h1>
      {flash.text && <div className={`toast ${flash.type}`}>{flash.text}</div>}

      {/* ログイン画面 */}
      {route === "/" && (
        <>
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

          {/* 公開トップでも全体ランキングを表示 */}
          <LeaderboardCard
            boardTab={boardTab}
            setBoardTab={setBoardTab}
            board={board}
            boardDate={boardDate}
          />
        </>
      )}

      {/* 新規登録 */}
      {route === "/signup" && (
        <SignupCard busy={busy} onSubmit={doSignup} onBack={()=>push("/")} />
      )}

      {/* マイページ */}
      {route === "/me" && loggedIn && (
        <>
          <div className="card">
            <h2>マイページ</h2>
            <p className="muted">
              今日は <b>{todayYmd || "(取得中…)"}</b>。{canEdit ? "23:59まで更新できます" : "本日の入力は締切済み（23:59）"}
            </p>
            <input
              placeholder="今日のコイン数"
              value={coins}
              onChange={(e)=>setCoins(e.target.value.replace(/[^\d]/g,""))}
              inputMode="numeric"
              onKeyDown={onCoinsKeyDown}
              disabled={!canEdit}
            />
            <div className="row">
              <button disabled={busy || coins === "" || !canEdit} onClick={submitCoins}>保存</button>
              <button className="ghost" disabled={busy} onClick={()=>{
                localStorage.removeItem("token"); setToken(""); setFlash({ type:"", text:"" });
                setCoins(""); window.location.hash="/";
              }}>ログアウト</button>
            </div>
          </div>

          {/* マイページ内タブ：自分の履歴 / 全体ランキング */}
          <div className="card">
            <div className="tabs secondary">
              <button className={`tab ${meTab==="history"?"active":""}`} onClick={()=>setMeTab("history")}>自分の履歴</button>
              <button className={`tab ${meTab==="leaderboard"?"active":""}`} onClick={()=>setMeTab("leaderboard")}>全体ランキング</button>
            </div>

            {meTab === "history" && (
              <MyHistoryTable rows={myHistory} />
            )}

            {meTab === "leaderboard" && (
              <LeaderboardCard
                boardTab={boardTab}
                setBoardTab={setBoardTab}
                board={board}
                boardDate={boardDate}
              />
            )}
          </div>
        </>
      )}

      <footer>API: {import.meta.env.VITE_API_BASE}</footer>
    </div>
  );
}

/* ─────────── パーツ ─────────── */

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

function MyHistoryTable({ rows }) {
  return (
    <>
      <h3>自分の履歴（直近14日）</h3>
      <table>
        <thead><tr><th>日付</th><th>コイン</th><th>前日比</th></tr></thead>
        <tbody>
          {rows.map(r=>(
            <tr key={r.date_ymd}>
              <td>{r.date_ymd}</td>
              <td>{Number(r.coins).toLocaleString()}</td>
              <td className={r.diff >= 0 ? "pos" : "neg"}>
                {r.diff >= 0 ? `+${r.diff}` : r.diff}
              </td>
            </tr>
          ))}
          {rows.length===0 && <tr><td colSpan={3} style={{opacity:.6}}>データがありません</td></tr>}
        </tbody>
      </table>
    </>
  );
}

function LeaderboardCard({ boardTab, setBoardTab, board, boardDate }) {
  return (
    <>
      <h3>ランキング</h3>
      <div className="tabs">
        <button className={`tab ${boardTab==="raw"?"active":""}`}   onClick={()=>setBoardTab("raw")}>コイン数</button>
        <button className={`tab ${boardTab==="daily"?"active":""}`} onClick={()=>setBoardTab("daily")}>前日比</button>
        <button className={`tab ${boardTab==="7d"?"active":""}`}    onClick={()=>setBoardTab("7d")}>7日間増加</button>
        <button className={`tab ${boardTab==="30d"?"active":""}`}   onClick={()=>setBoardTab("30d")}>30日間増加</button>
      </div>
      {/* ★ ランキングを枠で囲む */}
      <div className="rank-box">
        <RankListAndBars data={board} unit={labelForTab(boardTab)} />
        <p className="muted">基準日: {boardDate || "取得中…"}（締切済み日の集計）</p>
      </div>
    </>
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
