// src/App.jsx — ランキング：リスト ↔ 折れ線グラフ 切り替え
// raw=最新記録の推移、daily=前日比の推移、period=7/30日のローリング増減推移

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

  const [meTab, setMeTab] = useState("history");
  const { route, push } = useHashRoute();

  const modeMap = {
    raw: { mode: "raw" },
    daily: { mode: "daily" },
    "7d": { mode: "period", periodDays: 7 },
    "30d": { mode: "period", periodDays: 30 },
  };

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
  const [view, setView] = useState("list"); // "list" | "chart"
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(false);

  const toSeriesParams = () => {
    if (boardTab === "raw") return { mode: "raw", days: 14, top: 5, date: boardDate };
    if (boardTab === "daily") return { mode: "daily", days: 14, top: 5, date: boardDate };
    if (boardTab === "7d") return { mode: "period", periodDays: 7, days: 28, top: 5, date: boardDate };
    return { mode: "period", periodDays: 30, days: 60, top: 5, date: boardDate }; // "30d"
  };

  useEffect(() => {
    // タブが変わったらリストに戻す＆古い系列を破棄
    setView("list");
    setSeries([]);
  }, [boardTab]);

  useEffect(() => {
    // グラフ表示に切り替えたら取得
    if (view !== "chart") return;
    (async () => {
      setLoading(true);
      try {
        const s = await api.boardSeries(toSeriesParams());
        setSeries(Array.isArray(s?.series) ? s.series : []);
      } finally { setLoading(false); }
    })();
  }, [view, boardTab, boardDate]);

  return (
    <div className="rank-box">
      <div className="rank-header">
        <h3>
          ランキング{stale && <small style={{ marginLeft: 8, color: "#6b7280" }}>（キャッシュ表示）</small>}
        </h3>
        <div className="view-toggle">
          <button className={`chip ${view==="list"?"active":""}`} onClick={()=>setView("list")}>数字</button>
          <button className={`chip ${view==="chart"?"active":""}`} onClick={()=>setView("chart")}>グラフ</button>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${boardTab==="raw"?"active":""}`}   onClick={()=>setBoardTab("raw")}>コイン数（最新記録）</button>
        <button className={`tab ${boardTab==="daily"?"active":""}`} onClick={()=>setBoardTab("daily")}>前日比</button>
        <button className={`tab ${boardTab==="7d"?"active":""}`}    onClick={()=>setBoardTab("7d")}>7日間増減</button>
        <button className={`tab ${boardTab==="30d"?"active":""}`}   onClick={()=>setBoardTab("30d")}>30日間増減</button>
      </div>

      {view === "list" ? (
        <RankListAndBars data={board} unit={labelForTab(boardTab)} />
      ) : (
        <div className="chart-box">
          {loading ? <p className="muted">グラフを読み込み中…</p> :
           series.length===0 ? <p className="muted">グラフ用のデータがありません</p> :
           <LineChart series={series} unit={labelForTab(boardTab)} />}
        </div>
      )}

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

// リスト+棒（負値は赤）
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
                <div className="bar-fill" style={{ width: `${width}%`, background: isPos ? undefined : "var(--ng)" }} />
              </div>
            </li>
          );
        })}
        {data.length===0 && <li style={{opacity:.6}}>まだデータがありません</li>}
      </ol>
    </div>
  );
}

/* ─────────── SVG 折れ線グラフ ─────────── */

function LineChart({ series, unit }) {
  // series: [{name, points:[{date_ymd, value}, ...]}]
  const dates = (series[0]?.points || []).map(p => p.date_ymd);
  const allVals = series.flatMap(s => s.points.map(p => p.value));
  const minV = Math.min(0, ...allVals);
  const maxV = Math.max(0, ...allVals, 1);
  const pad = 24, W = 640, H = 280, chartW = W - pad*2, chartH = H - pad*2;

  const x = (i) => (i/(Math.max(1, dates.length-1))) * chartW + pad;
  const y = (v) => {
    const t = (v - minV) / (maxV - minV || 1);
    return H - pad - t * chartH;
  };

  const axisY0 = y(0);
  const colors = (i) => `hsl(${(i*67)%360} 70% 45%)`; // 適当な色相ズラし

  return (
    <div className="chart-area">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="line chart">
        {/* axes */}
        <line x1={pad} y1={y(minV)} x2={pad} y2={y(maxV)} className="axis" />
        <line x1={pad} y1={H-pad} x2={W-pad} y2={H-pad} className="axis" />
        {/* zero line */}
        {minV < 0 && maxV > 0 && <line x1={pad} y1={axisY0} x2={W-pad} y2={axisY0} className="zeroline" />}

        {/* y ticks */}
        {[0, 0.5, 1].map(t=>{
          const v = minV + t*(maxV-minV);
          const py = y(v);
          return (
            <g key={t}>
              <line x1={pad} y1={py} x2={W-pad} y2={py} className="grid" />
              <text x={pad-6} y={py+4} textAnchor="end" className="tick">{Math.round(v).toLocaleString()}</text>
            </g>
          );
        })}

        {/* x ticks */}
        {dates.map((d,i)=>(
          <g key={d}>
            {i%Math.ceil(dates.length/6)===0 && (
              <>
                <line x1={x(i)} y1={H-pad} x2={x(i)} y2={H-pad+4} className="tickline" />
                <text x={x(i)} y={H-pad+18} textAnchor="middle" className="tick">{d.slice(5)}</text>
              </>
            )}
          </g>
        ))}

        {/* lines */}
        {series.map((s,idx)=>{
          const d = s.points.map((p,i)=>`${i===0?"M":"L"}${x(i)},${y(p.value)}`).join(" ");
          return <path key={s.name} d={d} fill="none" stroke={colors(idx)} strokeWidth="2" className="line"/>;
        })}

        {/* legend */}
        {series.map((s,idx)=>(
          <g key={`lg-${s.name}`} transform={`translate(${pad+8},${pad+16+idx*18})`}>
            <rect width="12" height="2" y="7" fill={colors(idx)} />
            <text x="18" y="10" className="legend">{s.name}</text>
          </g>
        ))}
      </svg>
      <div className="chart-caption">単位: {unit}</div>
    </div>
  );
}
