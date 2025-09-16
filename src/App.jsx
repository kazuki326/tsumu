// src/App.jsx
// ・自分の履歴：7日/30日 = “前日比(diff)の総和”
// ・ランキング：数字/グラフ切替（右上トグル）・白背景折れ線
// ・「直近の記録（修正）」は折りたたみ（details/summary）＋ 過去編集フラグ対応
//   - /api/status から allowPastEdits / pastEditMaxDays を受け取り編集可否を制御

import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import "./App.css";

/* ========== ルーティング（ハッシュ） ========== */
const useHashRoute = () => {
  const cur = () => window.location.hash.replace("#", "") || "/";
  const [route, setRoute] = useState(cur);
  useEffect(() => {
    const onHash = () => setRoute(cur());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const push = (path) => (window.location.hash = path);
  return { route, push };
};

/* ========== 日付ユーティリティ ========== */
const toDate = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const addDays = (ymd, n) => {
  const dt = toDate(ymd);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};

/* ========== メイン ========== */
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
  const [allowPastEdits, setAllowPastEdits] = useState(false);
  const [pastEditMaxDays, setPastEditMaxDays] = useState(0);

  const [myHistory, setMyHistory] = useState([]);

  const [boardTab, setBoardTab] = useState("daily"); // "raw" | "daily" | "7d" | "30d"
  const [board, setBoard] = useState([]);
  const [boardDate, setBoardDate] = useState("");
  const [isProvisional, setIsProvisional] = useState(false);
  const [staleBoard, setStaleBoard] = useState(false);

  const [meTab, setMeTab] = useState("history"); // "history" | "leaderboard"
  const { route, push } = useHashRoute();

  // 数字orグラフ（ランキングの表示切替）
  const [boardView, setBoardView] = useState("list"); // "list" | "chart"

  const modeMap = {
    raw: { mode: "raw" },
    daily: { mode: "daily" },
    "7d": { mode: "period", periodDays: 7 },
    "30d": { mode: "period", periodDays: 30 }
  };

  /* ---- 初期読み込み ---- */
  const loadStatus = async () => {
    const st = await api.status();
    if (!st?.error) {
      setCanEdit(!!st.canEditToday);
      setTodayYmd(st.today_ymd || "");
      setBoardDate(st.board_date_ymd || "");
      // ★ 過去編集フラグを反映
      setAllowPastEdits(!!st.allowPastEdits);
      setPastEditMaxDays(Number(st.pastEditMaxDays || 0));
    }
  };

  const loadMy = async () => {
    if (!loggedIn) { setMyHistory([]); return; }
    // 充分な件数を確保（テーブルは14行、合計は7/30日で使う）
    const me = await api.myCoins(120);
    setMyHistory(Array.isArray(me) ? me : []);
  };

  const loadBoard = async () => {
    const opts = { ...modeMap[boardTab] };
    if (todayYmd && canEdit) opts.date = todayYmd; // 日中は今日（暫定）
    const b = await api.board(opts);
    setBoard(Array.isArray(b?.board) ? b.board : []);
    if (b?.date_ymd) setBoardDate(b.date_ymd);
    setIsProvisional(!!(todayYmd && canEdit && b?.date_ymd === todayYmd));
    setStaleBoard(!!b?._fromCache);
  };

  useEffect(() => { loadStatus(); }, []);
  useEffect(() => { loadMy(); }, [loggedIn]);
  useEffect(() => { loadBoard(); }, [boardTab, loggedIn, todayYmd, canEdit]);

  /* ---- 認証 ---- */
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

  // ルーティング遷移
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
              <button className="link" onClick={()=>window.location.hash="/signup"}>新規登録はこちら</button>
            </div>
          </div>

          <LeaderboardCard
            boardTab={boardTab}
            setBoardTab={setBoardTab}
            board={board}
            boardDate={boardDate}
            isProvisional={isProvisional}
            stale={staleBoard}
            view={boardView}
            setView={setBoardView}
          />
        </>
      )}

      {route === "/signup" && (
        <SignupCard busy={busy} onSubmit={doSignup} onBack={()=>window.location.hash="/"} />
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

            {/* 折りたたみ：直近の記録（修正） */}
            <RecentEditPanel
              canEditToday={canEdit}
              allowPastEdits={allowPastEdits}
              pastEditMaxDays={pastEditMaxDays}
              onUpdated={async ()=>{ await Promise.all([loadMy(), loadBoard()]); }}
            />
          </div>

          {/* マイページ内：履歴/ランキングタブ */}
          <div className="card">
            <div className="tabs secondary">
              <button className={`tab ${meTab==="history"?"active":""}`} onClick={()=>setMeTab("history")}>自分の履歴</button>
              <button className={`tab ${meTab==="leaderboard"?"active":""}`} onClick={()=>setMeTab("leaderboard")}>全体ランキング</button>
            </div>

            {meTab === "history" && (
              <MyHistoryTable
                rows={myHistory}
                endYmd={todayYmd || myHistory[0]?.date_ymd}
              />
            )}

            {meTab === "leaderboard" && (
              <LeaderboardCard
                boardTab={boardTab}
                setBoardTab={setBoardTab}
                board={board}
                boardDate={boardDate}
                isProvisional={isProvisional}
                stale={staleBoard}
                view={boardView}
                setView={setBoardView}
              />
            )}
          </div>
        </>
      )}

      <footer>API: {import.meta.env.VITE_API_BASE}</footer>
    </div>
  );
}

/* ========== パーツ ========== */

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

/* ====== 自分の履歴（7日/30日 = “前日比の総和”） ====== */
function MyHistoryTable({ rows, endYmd }) {
  // rows: 最新→過去。各要素 { date_ymd, coins, diff }（diff は前の“記録”との比較）
  // endYmd: 集計終端日（通常は今日）
  const end = endYmd || rows[0]?.date_ymd || "";

  // 直近 N「日」の範囲に入る行の diff を合計（＝表示中の前日比の総和）
  const sumDiffsWindow = (N) => {
    if (!end) return 0;
    const start = addDays(end, -(N - 1));
    return rows
      .filter(r => r.date_ymd >= start && r.date_ymd <= end)
      .reduce((acc, r) => acc + Number(r.diff || 0), 0);
  };

  const latestCoins = Number(rows[0]?.coins ?? 0);
  const sum7  = sumDiffsWindow(7);
  const sum30 = sumDiffsWindow(30);

  const Diff = ({ value }) => {
    const v = Number(value) || 0;
    const cls = v >= 0 ? "pos" : "neg";
    return <b className={cls}>{v >= 0 ? `+${v}` : v}</b>;
  };

  return (
    <>
      {/* サマリー */}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>自分の履歴（直近14日）</h3>
        <div className="row" style={{ gap: 12 }}>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>最新コイン</div>
            <div style={{ fontWeight: 700 }}>{latestCoins.toLocaleString()}</div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>7日間増減</div>
            <div style={{ fontWeight: 700 }}><Diff value={sum7} /></div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>30日間増減</div>
            <div style={{ fontWeight: 700 }}><Diff value={sum30} /></div>
          </div>
        </div>
      </div>

      {/* テーブル：最新→過去、14行表示 */}
      <table>
        <thead><tr><th>日付</th><th>コイン</th><th>前日比</th></tr></thead>
        <tbody>
          {rows.slice(0, 14).map(r => (
            <tr key={r.date_ymd}>
              <td>{r.date_ymd}</td>
              <td>{Number(r.coins).toLocaleString()}</td>
              <td className={r.diff >= 0 ? "pos" : "neg"}>
                {r.diff >= 0 ? `+${r.diff}` : r.diff}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={3} style={{ opacity: .6 }}>データがありません</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}

/* ====== ランキング（数字/グラフ） ====== */
function LeaderboardCard({ boardTab, setBoardTab, board, boardDate, isProvisional, stale, view, setView }) {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(false);

  const toSeriesParams = () => {
    if (boardTab === "raw")   return { mode: "raw",   days: 14, top: 5, date: boardDate };
    if (boardTab === "daily") return { mode: "daily", days: 14, top: 5, date: boardDate };
    if (boardTab === "7d")    return { mode: "period", periodDays: 7,  days: 28, top: 5, date: boardDate };
    return { mode: "period", periodDays: 30, days: 60, top: 5, date: boardDate };
  };

  useEffect(() => {
    if (view !== "chart") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const s = await api.boardSeries(toSeriesParams());
        if (!cancelled) setSeries(Array.isArray(s?.series) ? s.series : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [view, boardTab, boardDate]);

  return (
    <div className="rank-box">
      {/* 見出し + 右上トグル */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>
          ランキング{stale && <small style={{ marginLeft: 8, color: "#6b7280" }}></small>}
        </h3>
        <div className="tabs" style={{ margin: 0, flexWrap: "nowrap" }}>
          <button className={`tab ${view === "list" ? "active" : ""}`}  onClick={()=>setView("list")}>数字</button>
          <button className={`tab ${view === "chart" ? "active" : ""}`} onClick={()=>setView("chart")}>グラフ</button>
        </div>
      </div>

      {/* 指標タブ */}
      <div className="tabs">
        <button className={`tab ${boardTab==="raw"?"active":""}`}   onClick={()=>setBoardTab("raw")}>コイン数（最新記録）</button>
        <button className={`tab ${boardTab==="daily"?"active":""}`} onClick={()=>setBoardTab("daily")}>前日比</button>
        <button className={`tab ${boardTab==="7d"?"active":""}`}    onClick={()=>setBoardTab("7d")}>7日間増減</button>
        <button className={`tab ${boardTab==="30d"?"active":""}`}   onClick={()=>setBoardTab("30d")}>30日間増減</button>
      </div>

      {view === "list" ? (
        <RankListAndBars data={board} unit={labelForTab(boardTab)} />
      ) : (
        <div style={{ marginTop: 8 }}>
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

/* リスト＋バー表示 */
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
                <div className="bar-fill" style={{ width: `${width}%`, background: isPos ? undefined : "#ef4444" }} />
              </div>
            </li>
          );
        })}
        {data.length===0 && <li style={{opacity:.6}}>まだデータがありません</li>}
      </ol>
    </div>
  );
}

/* ====== 折れ線グラフ（白背景） ====== */
function LineChart({ series, unit }) {
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

  const axisColor = "#cbd5e1";
  const gridColor = "rgba(0,0,0,.06)";
  const tickColor = "#475569";
  const zeroColor = "#ef4444";

  const axisY0 = y(0);
  const color = (i) => `hsl(${(i*67)%360} 70% 45%)`;

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10 }}
      >
        {/* axes */}
        <line x1={pad} y1={y(minV)} x2={pad} y2={y(maxV)} stroke={axisColor} strokeWidth="1" />
        <line x1={pad} y1={H-pad} x2={W-pad} y2={H-pad} stroke={axisColor} strokeWidth="1" />
        {/* zero line */}
        {minV < 0 && maxV > 0 && (
          <line x1={pad} y1={axisY0} x2={W-pad} y2={axisY0} stroke={zeroColor} strokeDasharray="4 4" strokeWidth="1" />
        )}

        {/* y ticks */}
        {[0, 0.5, 1].map(t=>{
          const v = minV + t*(maxV-minV);
          const py = y(v);
          return (
            <g key={t}>
              <line x1={pad} y1={py} x2={W-pad} y2={py} stroke={gridColor} strokeWidth="1" />
              <text x={pad-6} y={py+4} textAnchor="end" fill={tickColor} fontSize="11">
                {Math.round(v).toLocaleString()}
              </text>
            </g>
          );
        })}

        {/* x ticks */}
        {dates.map((d,i)=>(
          <g key={d}>
            {i%Math.ceil(dates.length/6||1)===0 && (
              <>
                <line x1={x(i)} y1={H-pad} x2={x(i)} y2={H-pad+4} stroke={axisColor} strokeWidth="1" />
                <text x={x(i)} y={H-pad+18} textAnchor="middle" fill={tickColor} fontSize="11">
                  {d.slice(5)}
                </text>
              </>
            )}
          </g>
        ))}

        {/* lines */}
        {series.map((s,idx)=>{
          const d = s.points.map((p,i)=>`${i===0?"M":"L"}${x(i)},${y(p.value)}`).join(" ");
          return <path key={s.name} d={d} fill="none" stroke={color(idx)} strokeWidth="2" />;
        })}

        {/* legend */}
        {series.map((s,idx)=>(
          <g key={`lg-${s.name}`} transform={`translate(${pad+8},${pad+16+idx*18})`}>
            <rect width="12" height="2" y="7" fill={color(idx)} />
            <text x="18" y="10" fill="#334155" fontSize="12">{s.name}</text>
          </g>
        ))}
      </svg>
      <div className="muted" style={{ marginTop: 6 }}>単位: {unit}</div>
    </div>
  );
}

/* ====== 直近の記録を修正するパネル（折りたたみ＆過去編集対応） ====== */
function RecentEditPanel({ canEditToday, allowPastEdits=false, pastEditMaxDays=0, onUpdated, defaultOpen=false }) {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null); // { date, coins }
  const [newCoins, setNewCoins] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const r = await api.myLatest(30); // 過去日も見られるよう少し広めに
      setRows(Array.isArray(r) ? r : []);
    } catch {
      setRows([]);
    }
  };
  useEffect(() => { load(); }, []);

  const startEdit = (date, coins) => {
    setEditing({ date, coins });
    setNewCoins(String(coins));
    setErr("");
  };
  const cancel = () => { setEditing(null); setNewCoins(""); setErr(""); };

  const save = async () => {
    const n = Number(newCoins);
    if (!Number.isInteger(n) || n < 0) { setErr("0以上の整数で入力してね"); return; }
    setBusy(true);
    try {
      await api.patchCoins(editing.date, n);
      cancel();
      await load();
      onUpdated?.(); // 履歴/ランキング再読み込み
    } catch (e) {
      setErr(e.message || "更新に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const daysDiff = (a, b) =>
    Math.floor((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z"))/86400000);

  // その日が編集可能か？
  const isEditable = (ymd) => {
    if (ymd === today) return canEditToday;
    if (!allowPastEdits) return false;
    if (!pastEditMaxDays) return true;              // 0=無制限
    return Math.abs(daysDiff(ymd, today)) <= pastEditMaxDays;
  };

  return (
    <details className="collapse" open={defaultOpen}>
      <summary className="collapse-summary">
        <div className="summary-left">
          <span className="chev">▶</span>
          <span>直近の記録（修正）</span>
        </div>
        <span className="muted small">
          {canEditToday
            ? allowPastEdits
              ? (pastEditMaxDays ? `※過去${pastEditMaxDays}日まで修正可（今日23:59まで今日も可）` : "※過去分も修正可（今日23:59まで今日も可）")
              : "※今日の分のみ修正可（23:59まで）"
            : allowPastEdits
              ? (pastEditMaxDays ? `※過去${pastEditMaxDays}日まで修正可（本日は確定済み）` : "※過去分は修正可（本日は確定済み）")
              : "※本日は確定済み"}
        </span>
      </summary>

      <div className="collapse-body">
        <ul className="edit-list">
          {rows.map(r => (
            <li key={r.date_ymd} className="edit-row">
              <span className="date">{r.date_ymd}</span>
              {editing?.date === r.date_ymd ? (
                <>
                  <input
                    className="edit-input"
                    value={newCoins}
                    onChange={e=>setNewCoins(e.target.value.replace(/[^\d]/g,""))}
                    inputMode="numeric"
                  />
                  <button disabled={busy} onClick={save}>保存</button>
                  <button className="ghost" disabled={busy} onClick={cancel}>キャンセル</button>
                  {err && <span className="error" style={{marginLeft:8}}>{err}</span>}
                </>
              ) : (
                <>
                  <b>{Number(r.coins).toLocaleString()} 枚</b>
                  <button
                    className="ghost"
                    disabled={!isEditable(r.date_ymd)}
                    onClick={()=>startEdit(r.date_ymd, r.coins)}
                  >
                    編集
                  </button>
                </>
              )}
            </li>
          ))}
          {rows.length === 0 && <li className="muted">まだ記録がありません</li>}
        </ul>
      </div>
    </details>
  );
}
