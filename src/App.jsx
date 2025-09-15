// src/App.jsx — 期間は“増減(±)合計”、rawは“最後の記録”、棒グラフはマイナス対応

import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import "./App.css";

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
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState({ type: "", text: "" });

  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const loggedIn = useMemo(() => !!token, [token]);

  const [todayYmd, setTodayYmd] = useState("");
  const [canEdit, setCanEdit] = useState(true);

  const [myHistory, setMyHistory] = useState([]);

  const [boardTab, setBoardTab] = useState("daily"); // "raw" | "daily" | "7d" | "30d"
  const [board, setBoard] = useState([]);
  const [boardDate, setBoardDate] = useState("");
  const [isProvisional, setIsProvisional] = useState(false);
  const [staleBoard, setStaleBoard] = useState(false);

  const modeMap = {
    raw: { mode: "raw" },
    daily: { mode: "daily" },
    "7d": { mode: "period", periodDays: 7 },
    "30d": { mode: "period", periodDays: 30 },
  };

  const [meTab, setMeTab] = useState("history");
  const { route, push } = useHashRoute();

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
    const opts = { ...modeMap[boardTab] };
    if (todayYmd && canEdit) opts.date = todayYmd; // 日中は“今日(暫定)”
    const b = await api.board(opts);
    setBoard(Array.isArray(b?.board) ? b.board : []);
    if (b?.date_ymd) setBoardDate(b.date_ymd);
    setIsProvisional(!!(todayYmd && canEdit && b?.date_ymd === todayYmd));
    setStaleBoard(!!b?._fromCache);
  };

  useEffect(() => { loadStatus(); }, []);
  useEffect(() => { loadMy(); }, [loggedIn]);
  useEffect(() => { loadBoard(); }, [boardTab, loggedIn, todayYmd, canEdit]);

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

  useEffect(() => {
    if (!loggedIn && route === "/me") push("/");
    if (loggedIn && (route === "/" || route === "/signup")) push("/me");
  }, [loggedIn, route]);

  return (
    <div className="container">
      <h1>TSUMU COINS</h1>
      {flash.text && <div className={`toast ${flash.type}`}>{flash.text}</div>}

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

          <LeaderboardCard
            boardTab={boardTab}
            setBoardTab={setBoardTab}
            board={board}
            boardDate={boardDate}
            isProvisional={isProvisional}
            stale={staleBoard}
          />
        </>
      )}

      {route === "/signup" && (
        <SignupCard busy={busy} onSubmit={doSignup} onBack={()=>push("/")} />
      )}

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

          <div className="card">
            <div className="tabs secondary">
              <button className={`tab ${meTab==="history"?"active":""}`} onClick={()=>setMeTab("history")}>自分の履歴</button>
              <button className={`tab ${meTab==="leaderboard"?"active":""}`} onClick={()=>setMeTab("leaderboard")}>全体ランキング</button>
            </div>

            {meTab === "history" && <MyHistoryTable rows={myHistory} />}

            {meTab === "leaderboard" && (
              <LeaderboardCard
                boardTab={boardTab}
                setBoardTab={setBoardTab}
                board={board}
                boardDate={boardDate}
                isProvisional={isProvisional}
                stale={staleBoard}
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

function LeaderboardCard({ boardTab, setBoardTab, board, boardDate, isProvisional, stale }) {
  return (
    <div className="rank-box">
      <h3>
        ランキング{stale && <small style={{ marginLeft: 8, color: "#6b7280" }}>（キャッシュ表示）</small>}
      </h3>
      <div className="tabs">
        <button className={`tab ${boardTab==="raw"?"active":""}`}   onClick={()=>setBoardTab("raw")}>コイン数（最新記録）</button>
        <button className={`tab ${boardTab==="daily"?"active":""}`} onClick={()=>setBoardTab("daily")}>前日比</button>
        <button className={`tab ${boardTab==="7d"?"active":""}`}    onClick={()=>setBoardTab("7d")}>7日間増減</button>
        <button className={`tab ${boardTab==="30d"?"active":""}`}   onClick={()=>setBoardTab("30d")}>30日間増減</button>
      </div>

      <RankListAndBars data={board} unit={labelForTab(boardTab)} />
      <p className="muted">
        基準日: {boardDate || "取得中…"}
        {isProvisional ? "（今日・暫定）" : "（締切済み日の集計）"}
      </p>
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

// ★ マイナス対応の棒グラフ（幅=絶対値、色で±を区別）
function RankListAndBars({ data, unit }) {
  const maxAbs = Math.max(1, ...data.map(d => Math.abs(Number(d.value) || 0)));
  return (
    <div className="rank-wrap">
      <ol className="rank-list">
        {data.map((b, i) => {
          const val = Number(b.value) || 0;
          const width = (Math.abs(val) / maxAbs) * 100;
          const isPos = val >= 0;
          return (
            <li key={`${b.name}-${i}`}>
              <span className="rank-name">{i+1}. {b.name}</span>
              <b className={`rank-value ${isPos ? "pos" : "neg"}`}>
                {val.toLocaleString()} {unit}
              </b>
              <div className="bar">
                <div
                  className="bar-fill"
                  style={{
                    width: `${width}%`,
                    background: isPos ? undefined : "var(--ng)"
                  }}
                />
              </div>
            </li>
          );
        })}
        {data.length===0 && <li style={{opacity:.6}}>まだデータがありません</li>}
      </ol>
    </div>
  );
}
