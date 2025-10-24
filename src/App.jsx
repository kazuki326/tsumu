// src/App.jsx
// - displayName を保持し、ログイン/登録後に「ようこそ◯◯さん」
// - マイページ見出し下に常時「ようこそ◯◯さん」
// - 年末(12/31)までの試算（既定 50,000 枚/日、編集可 & localStorage 保存）
// - 自分の履歴：7日/30日 = “前日比(diff)の総和”
// - 全体ランキング：4指標タブのみ（コイン数はグラフ無し、他は折れ線＋下にスナップショット棒）
// - 直近の記録（修正）は折りたたみ＆過去編集可否フラグ対応
// - Indigo/Violetトーンで統一（App.css と連動）

import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import "./App.css";
import NotificationSettings from "./NotificationSettings";

// 分割済みコンポーネント
import { MyHistory } from "./components/MyHistory";
import { Leaderboard } from "./components/Leaderboard";

/* =========================
   Routing (hash)
   ========================= */
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

/* =========================
   Utils
   ========================= */
const addDays = (ymd, n) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};

/* =========================
   App
   ========================= */
export default function App() {
  // 表示名（ログイン/登録時に保存）
  const [displayName, setDisplayName] = useState(() => localStorage.getItem("displayName") || "");

  // ログインフォーム
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");

  // 今日の入力
  const [coins, setCoins] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState({ type: "", text: "" });

  // サーバ状態
  const [serverReady, setServerReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState("サーバーを起動しています…");

  // 認証
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const loggedIn = useMemo(() => !!token, [token]);

  // ステータス
  const [todayYmd, setTodayYmd] = useState("");
  const [canEdit, setCanEdit] = useState(true);
  const [allowPastEdits, setAllowPastEdits] = useState(false);
  const [pastEditMaxDays, setPastEditMaxDays] = useState(0);

  // 自分の履歴
  const [myHistory, setMyHistory] = useState([]);

  // ランキング
  const [boardTab, setBoardTab] = useState("raw"); // "raw" | "daily" | "7d" | "30d"
  const [board, setBoard] = useState([]);
  const [boardDate, setBoardDate] = useState("");
  const [isProvisional, setIsProvisional] = useState(false);
  const [staleBoard, setStaleBoard] = useState(false);

  // マイページのタブ
  const [meTab, setMeTab] = useState("history"); // "history" | "leaderboard"

  const { route, push } = useHashRoute();

  const modeMap = {
    raw: { mode: "raw" },
    daily: { mode: "daily" },
    "7d": { mode: "period", periodDays: 7 },
    "30d": { mode: "period", periodDays: 30 }
  };

  /* ---- 初期読み込み ---- */
  const loadStatus = async () => {
    try {
      const st = await api.status();
      if (!st || typeof st !== "object") throw new Error("サーバーから無効な応答が返されました");
      if (st?.error) throw new Error(st.error);
      if (!st.today_ymd) throw new Error("サーバーから必要なデータが返されませんでした");

      setCanEdit(!!st.canEditToday);
      setTodayYmd(st.today_ymd || "");
      setBoardDate(st.board_date_ymd || "");
      setAllowPastEdits(!!st.allowPastEdits);
      setPastEditMaxDays(Number(st.pastEditMaxDays || 0));
      setStatusMessage("");
      setServerReady(true);
      return true;
    } catch (err) {
      console.warn("Failed to load status:", err);
      const hint =
        err?.message?.includes("Failed to fetch") || err?.message?.includes("fetch")
          ? "サーバーを起動中です… 自動で再試行します"
          : `サーバーに接続できません (${err?.message || "不明なエラー"})`;
      setStatusMessage(hint);
      setServerReady(false);
      return false;
    }
  };

  const loadMy = async () => {
    if (!loggedIn) {
      setMyHistory([]);
      return;
    }
    try {
      const me = await api.myCoins(120);
      setMyHistory(Array.isArray(me) ? me : []);
    } catch (err) {
      console.warn("Failed to load history:", err);
    }
  };

  const loadBoard = async () => {
    try {
      const opts = { ...modeMap[boardTab] };
      if (todayYmd && canEdit) opts.date = todayYmd; // 日中は今日を暫定集計
      const b = await api.board(opts);
      setBoard(Array.isArray(b?.board) ? b.board : []);
      if (b?.date_ymd) setBoardDate(b.date_ymd);
      setIsProvisional(!!(todayYmd && canEdit && b?.date_ymd === todayYmd));
      setStaleBoard(!!b?._fromCache);
    } catch (err) {
      console.warn("Failed to load board:", err);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let retryId;
    const attempt = async () => {
      const ok = await loadStatus();
      if (cancelled || ok) return;
      retryId = window.setTimeout(attempt, 2000);
    };
    attempt();
    return () => {
      cancelled = true;
      if (retryId) window.clearTimeout(retryId);
    };
  }, []);

  useEffect(() => {
    if (!serverReady) return;
    loadMy();
  }, [loggedIn, serverReady]);

  useEffect(() => {
    if (!serverReady) return;
    loadBoard();
  }, [boardTab, loggedIn, todayYmd, canEdit, serverReady]);

  /* ---- 認証 ---- */
  const doLogin = async () => {
    if (!name.trim() || pin.trim().length < 4) return alert("名前と4桁以上のPINを入力してね");
    setBusy(true);
    try {
      const res = await api.login(name.trim(), pin.trim());
      if (res.token) {
        localStorage.setItem("token", res.token);
        setToken(res.token);
        localStorage.setItem("displayName", name.trim());
        setDisplayName(name.trim());
        setFlash({ type: "success", text: `ようこそ ${name.trim()} さん` });
        setName("");
        setPin("");
        push("/me");
      } else {
        alert(res.error || "ログインに失敗しました");
      }
    } finally {
      setBusy(false);
    }
  };

  const doSignup = async (signupName, signupPin) => {
    setBusy(true);
    try {
      const res = await api.register(signupName.trim(), signupPin.trim());
      if (res.token) {
        localStorage.setItem("token", res.token);
        setToken(res.token);
        localStorage.setItem("displayName", signupName.trim());
        setDisplayName(signupName.trim());
        setFlash({ type: "success", text: `登録完了！ようこそ ${signupName.trim()} さん` });
        setTimeout(() => setFlash({ type: "", text: "" }), 3000);
        push("/me");
      } else {
        alert(res.error || "登録に失敗しました");
      }
    } finally {
      setBusy(false);
    }
  };

  /* ---- 今日の入力 ---- */
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
    } finally {
      setBusy(false);
    }
  };
  const onCoinsKeyDown = (e) => {
    if (e.key === "Enter" && !busy) submitCoins();
  };

  // ルーティング遷移
  useEffect(() => {
    if (!loggedIn && (route === "/me" || route === "/notifications")) push("/");
    if (loggedIn && (route === "/" || route === "/signup")) push("/me");
  }, [loggedIn, route]);

  // 自分の最新コイン（年末試算に使用）
  const latestCoins = useMemo(() => Number(myHistory[0]?.coins ?? 0), [myHistory]);

  /* ---- スプラッシュ ---- */
  if (!serverReady) {
    return (
      <div className="splash" role="status" aria-live="polite">
        <h1 className="splash-logo">TSUMU COINS</h1>
        <div className="splash-spinner" />
        <p className="splash-text">{statusMessage || "サーバーの準備をしています…"}</p>
      </div>
    );
  }

  /* =========================
     Render
     ========================= */
  return (
    <div className="container">
      <h1 onClick={() => push(loggedIn ? "/me" : "/")} style={{ cursor: "pointer" }}>
        TSUMU COINS
      </h1>

      {flash.text && <div className={`toast ${flash.type}`}>{flash.text}</div>}

      {/* ---------- / : ログイン + ランキング ---------- */}
      {route === "/" && (
        <>
          <div className="card">
            <h2>ログイン</h2>
            <div className="field">
              <label>名前</label>
              <input placeholder="名前" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>PIN（4桁以上）</label>
              <input
                placeholder="PIN(4桁以上)"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
            </div>
            <div className="row">
              <button disabled={busy} onClick={doLogin}>
                ログイン
              </button>
              <button className="link" onClick={() => (window.location.hash = "/signup")}>
                新規登録はこちら
              </button>
            </div>
          </div>

          {/* Top ランキング（非ログインでも閲覧） */}
          <div className="cap">
            <div className="head--strong">
              <h3 style={{ margin: 0 }}>全体ランキング</h3>
            </div>
            <div className="panel-body">
              <Leaderboard
                boardTab={boardTab}
                setBoardTab={setBoardTab}
                board={board}
                boardDate={boardDate}
                isProvisional={isProvisional}
                stale={staleBoard}
              />
            </div>
          </div>
        </>
      )}

      {/* ---------- /signup ---------- */}
      {route === "/signup" && (
        <SignupCard busy={busy} onSubmit={doSignup} onBack={() => (window.location.hash = "/")} />
      )}

      {/* ---------- /me ---------- */}
      {route === "/me" && loggedIn && (
        <>
          <div className="cap" style={{ marginBottom: 16 }}>
            <div className="head--strong">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12
                }}
              >
                <div>
                  <h2 style={{ margin: 0 }}>マイページ</h2>
                  <p className="welcome-line" style={{ margin: "4px 0 0" }}>
                    ようこそ <b>{displayName || "ゲスト"}</b> さん
                  </p>
                </div>
                {/* ▼▼ ここを縦積み対応にするため actions-row を追加 ▼▼ */}
                <div className="row actions-row" style={{ flexShrink: 0 }}>
                  <button className="ghost" disabled={busy} onClick={() => push("/notifications")}>
                    通知設定
                  </button>
                  <button
                    className="ghost"
                    disabled={busy}
                    onClick={() => {
                      localStorage.removeItem("token");
                      setToken("");
                      setFlash({ type: "", text: "" });
                      localStorage.removeItem("displayName");
                      setDisplayName("");
                      setCoins("");
                      window.location.hash = "/";
                    }}
                  >
                    ログアウト
                  </button>
                </div>
                {/* ▲▲ ここまで ▲▲ */}
              </div>
            </div>

            {/* 入力 & ユーティリティ */}
            <div className="panel-body">
              {/* 今日の入力 */}
              <div className="subcard" style={{ marginBottom: 24 }}>
                <p style={{ margin: "8px 8px 12px", fontWeight: 700, color: "#1f2937", fontSize: 14 }}>
                  今日は <b>{todayYmd || "(取得中…)"}</b>。{canEdit ? "23:59まで更新できます" : "本日の入力は締切済み（23:59）"}
                </p>

                {/* 入力 → ボタン を縦積み、Enter送信OK */}
                <form
                  className="stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!busy && coins !== "" && canEdit) submitCoins();
                  }}
                >
                  <input
                    className="input-left"
                    placeholder="今日のコイン数を入力"
                    value={coins}
                    onChange={(e) => setCoins(e.target.value.replace(/[^\d]/g, ""))}
                    inputMode="numeric"
                    onKeyDown={onCoinsKeyDown}
                    disabled={!canEdit}
                    aria-label="今日のコイン数"
                  />
                  <button type="submit" className="btn-auto" disabled={busy || coins === "" || !canEdit}>
                    保存
                  </button>
                </form>
              </div>

              <YearEndProjection todayYmd={todayYmd} baseCoins={latestCoins} defaultOpen={true} />

              <RecentEditPanel
                todayYmd={todayYmd}
                canEditToday={canEdit}
                allowPastEdits={allowPastEdits}
                pastEditMaxDays={pastEditMaxDays}
                onUpdated={async () => {
                  await Promise.all([loadMy(), loadBoard()]);
                }}
              />
            </div>
          </div>

          {/* マイページ内：履歴/ランキングタブ */}
          <div className="tabs secondary" style={{ marginBottom: 16 }}>
            <button className={`tab ${meTab === "history" ? "active" : ""}`} onClick={() => setMeTab("history")}>
              自分の履歴
            </button>
            <button className={`tab ${meTab === "leaderboard" ? "active" : ""}`} onClick={() => setMeTab("leaderboard")}>
              全体ランキング
            </button>
          </div>

          {meTab === "history" ? (
            <MyHistory rows={myHistory} endYmd={todayYmd || myHistory[0]?.date_ymd} />
          ) : (
            <div className="cap">
              <div className="head--strong">
                <h3 style={{ margin: 0 }}>全体ランキング</h3>
              </div>
              <div className="panel-body">
                <Leaderboard
                  boardTab={boardTab}
                  setBoardTab={setBoardTab}
                  board={board}
                  boardDate={boardDate}
                  isProvisional={isProvisional}
                  stale={staleBoard}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* ---------- /notifications ---------- */}
      {route === "/notifications" && loggedIn && (
        <>
          <div style={{ marginBottom: 16 }}>
            <button className="ghost" onClick={() => push("/me")}>
              ← マイページに戻る
            </button>
          </div>
          <NotificationSettings />
        </>
      )}

      <footer>API: {import.meta.env.VITE_API_BASE}</footer>
    </div>
  );
}

/* =========================
   Components (local smalls)
   ========================= */
function SignupCard({ busy, onSubmit, onBack }) {
  const [n, setN] = useState("");
  const [p, setP] = useState("");
  return (
    <div className="card">
      <h2>新規登録</h2>
      <div className="field">
        <label>名前</label>
        <input placeholder="名前" value={n} onChange={(e) => setN(e.target.value)} />
      </div>
      <div className="field">
        <label>PIN（4桁以上）</label>
        <input placeholder="PIN(4桁以上)" type="password" inputMode="numeric" value={p} onChange={(e) => setP(e.target.value)} />
      </div>
      <div className="row">
        <button disabled={busy || !n.trim() || p.trim().length < 4} onClick={() => onSubmit(n, p)}>
          登録する
        </button>
        <button className="ghost" disabled={busy} onClick={onBack}>
          戻る
        </button>
      </div>
    </div>
  );
}

/* =========================
   RecentEditPanel（折りたたみ＆過去編集）
   ※軽量のためローカル定義のまま
   ========================= */
function RecentEditPanel({ todayYmd, canEditToday, allowPastEdits = false, pastEditMaxDays = 0, onUpdated, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [recentMap, setRecentMap] = useState(new Map()); // date_ymd -> {coins}
  const [editing, setEditing] = useState(null);          // { date }
  const [newCoins, setNewCoins] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // 今日（基準日）
  const fallbackToday = new Date().toISOString().slice(0, 10);
  const baseToday = /^\d{4}-\d{2}-\d{2}$/.test(todayYmd || "") ? todayYmd : fallbackToday;

  // 直近7日（今日～6日前）
  const last7 = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(baseToday, -i)), [baseToday]);

  // 読み込み
  const load = async () => {
    try {
      const r = await api.myLatest(60);
      const m = new Map();
      (Array.isArray(r) ? r : []).forEach((row) => {
        if (row?.date_ymd) m.set(row.date_ymd, { coins: Number(row.coins) || 0 });
      });
      setRecentMap(m);
    } catch {
      setRecentMap(new Map());
    }
  };
  useEffect(() => { load(); }, []);

  const daysDiff = (a, b) => Math.floor((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000);

  const isEditable = (ymd) => {
    if (ymd === baseToday) return canEditToday;
    if (!allowPastEdits) return false;
    if (!pastEditMaxDays) return true; // 0=無制限
    return Math.abs(daysDiff(ymd, baseToday)) <= pastEditMaxDays;
  };

  const startEdit = (date, coins) => {
    setEditing({ date });
    setNewCoins(coins != null ? String(coins) : "");
    setErr("");
  };
  const cancel = () => { setEditing(null); setNewCoins(""); setErr(""); };

  const save = async () => {
    const n = Number(newCoins);
    if (!Number.isInteger(n) || n < 0) { setErr("0以上の整数で入力してね"); return; }
    setBusy(true);
    try {
      await api.patchCoins(editing.date, n); // upsert想定
      cancel();
      await load();
      onUpdated?.();
    } catch (e) {
      setErr(e.message || "更新に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cap" style={{ marginBottom: 16 }}>
      <div
        className="head--strong"
        style={{ cursor: "pointer", userSelect: "none" }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <span className="chev">▶</span>
            <h3 style={{ margin: 0 }}>直近の記録（修正・追加）</h3>
          </div>
          <div className="muted">
            直近7日（{last7[last7.length - 1]} ～ {last7[0]}）を表示
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="panel-body">
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {last7.map((d) => {
              const rec = recentMap.get(d);
              const editable = isEditable(d);
              const isEditing = editing?.date === d;
              return (
                <li
                  key={d}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 0",
                    borderBottom: "1px solid #e5e7eb",
                    flexWrap: "wrap"
                  }}
                >
                  <span style={{ fontWeight: 700, color: "#334155", minWidth: 100 }}>{d}</span>

                  {isEditing ? (
                    <>
                      <input
                        value={newCoins}
                        onChange={(e) => setNewCoins(e.target.value.replace(/[^\d]/g, ""))}
                        inputMode="numeric"
                        placeholder="0"
                        style={{ width: 140 }}
                      />
                      <button disabled={busy} onClick={save}>保存</button>
                      <button className="ghost" disabled={busy} onClick={cancel}>キャンセル</button>
                      {err && <span style={{ color: "#ef4444", fontSize: 12 }}>{err}</span>}
                    </>
                  ) : (
                    <>
                      {rec ? (
                        <>
                          <b style={{ color: "#111827" }}>{Number(rec.coins).toLocaleString()} 枚</b>
                          <button className="ghost" disabled={!editable} onClick={() => startEdit(d, rec.coins)}>
                            編集
                          </button>
                        </>
                      ) : (
                        <>
                          <span style={{ color: "#9ca3af" }}>未登録</span>
                          <button disabled={!editable} onClick={() => startEdit(d, "")}>追加</button>
                        </>
                      )}
                      {!editable && <span style={{ fontSize: 12, color: "#9ca3af" }}>（この日は変更不可の設定）</span>}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/* =========================
   YearEndProjection（年末までの試算）
   ========================= */
function YearEndProjection({ todayYmd, baseCoins, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // 既定値 50,000。ユーザー変更は保存
  const [avgPerDay, setAvgPerDay] = useState(() => {
    const v = Number(localStorage.getItem("avgPerDay") || 50000);
    return Number.isFinite(v) && v >= 0 ? v : 50000;
  });
  useEffect(() => { localStorage.setItem("avgPerDay", String(avgPerDay)); }, [avgPerDay]);

  const today = todayYmd || new Date().toISOString().slice(0, 10);
  const end = `${today.slice(0, 4)}-12-31`;

  const daysDiff = (a, b) => Math.floor((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000);
  const remainDays = Math.max(0, daysDiff(today, end) + 1);

  const additional = avgPerDay * remainDays;
  const projected = (Number(baseCoins) || 0) + additional;

  const fmt = (n) => Number(n).toLocaleString();

  return (
    <div className="cap" style={{ marginBottom: 16 }}>
      <div
        className="head--strong"
        style={{ cursor: "pointer", userSelect: "none" }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <span className="chev">▶</span>
            <h3 style={{ margin: 0 }}>年末までの試算</h3>
          </div>
          <div className="muted">
            目安: 平均 {fmt(avgPerDay)} 枚/日・残り {fmt(remainDays)} 日
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="panel-body">
          <div className="row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="muted">平均</span>
              <input
                value={avgPerDay}
                onChange={(e) => setAvgPerDay(Number(e.target.value.replace(/[^\d]/g, "") || 0))}
                inputMode="numeric"
                style={{ width: 140, textAlign: "right" }}
              />
              <span className="muted">枚 / 日</span>
            </label>
            <span style={{ color: "#cbd5e1" }}>｜</span>
            <span>
              残り日数（今日含む）：<b>{fmt(remainDays)}</b> 日
            </span>
          </div>

          <div className="kpi-grid">
            <div className="kpi">
              <div className="label">いまのコイン</div>
              <div className="value">{fmt(baseCoins)} 枚</div>
            </div>
            <div className="kpi">
              <div className="label">見込み追加（年末まで）</div>
              <div className="value">{fmt(additional)} 枚</div>
            </div>
            <div className="kpi">
              <div className="label">12/31 見込み合計</div>
              <div className="value" style={{ color: "var(--brand-500)" }}>{fmt(projected)} 枚</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
