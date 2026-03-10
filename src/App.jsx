// src/App.jsx
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Sun, Moon, Monitor, Settings, LogOut, ChevronDown, Calendar, Edit3, Target, TrendingUp, Trophy, History } from "lucide-react";

import { api } from "./api";
import { useTheme } from "@/hooks/use-theme";
import NotificationSettings from "./NotificationSettings";

// shadcn/ui components
import { Button } from "@/components/ui/button";
import { Card, CardCap, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleChevron,
} from "@/components/ui/collapsible";

// Custom components (keep existing)
import { MyHistory } from "./components/MyHistory";
import { Leaderboard } from "./components/Leaderboard";

// Dashboard components
import { KPICard, QuickInput, MiniChart, RankingPreview, YearEndMini } from "./components/dashboard";

// Legacy CSS for splash, rank-box, etc.
import "./App.css";

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
   Theme Toggle Button
   ========================= */
function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  return (
    <Button variant="ghost" size="icon" onClick={cycleTheme} title={`テーマ: ${theme}`}>
      {theme === "dark" ? (
        <Moon className="h-5 w-5" />
      ) : theme === "light" ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Monitor className="h-5 w-5" />
      )}
    </Button>
  );
}

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
  const [spent, setSpent] = useState("");
  const [gacha, setGacha] = useState("");
  const [busy, setBusy] = useState(false);

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
  const [boardTab, setBoardTab] = useState("earned7d");
  const [board, setBoard] = useState([]);
  const [boardDate, setBoardDate] = useState("");
  const [isProvisional, setIsProvisional] = useState(false);
  const [staleBoard, setStaleBoard] = useState(false);

  // RankingPreview専用: 7日間稼ぎランキング
  const [earned7dBoard, setEarned7dBoard] = useState([]);

  // マイページの詳細セクション開閉
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { route, push } = useHashRoute();

  const modeMap = {
    earned7d: { mode: "earned", periodDays: 7 },
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
          : `サーバーに接続中… (${err?.message || "不明なエラー"})`;
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
      if (todayYmd && canEdit) opts.date = todayYmd;
      const b = await api.board(opts);
      setBoard(Array.isArray(b?.board) ? b.board : []);
      if (b?.date_ymd) setBoardDate(b.date_ymd);
      setIsProvisional(!!(todayYmd && canEdit && b?.date_ymd === todayYmd));
      setStaleBoard(!!b?._fromCache);
    } catch (err) {
      console.warn("Failed to load board:", err);
    }
  };

  // RankingPreview専用: 7日間稼ぎランキングを取得
  const loadEarned7dBoard = async () => {
    try {
      const opts = { mode: "earned", periodDays: 7 };
      if (todayYmd && canEdit) opts.date = todayYmd;
      const b = await api.board(opts);
      setEarned7dBoard(Array.isArray(b?.board) ? b.board : []);
    } catch (err) {
      console.warn("Failed to load earned7d board:", err);
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
    loadEarned7dBoard();
  }, [loggedIn, serverReady]);

  useEffect(() => {
    if (!serverReady) return;
    loadBoard();
  }, [boardTab, loggedIn, todayYmd, canEdit, serverReady]);

  // todayYmd/canEditが変わったらearned7dBoardも更新
  useEffect(() => {
    if (!serverReady) return;
    loadEarned7dBoard();
  }, [todayYmd, canEdit, serverReady]);

  /* ---- 認証 ---- */
  const doLogin = async () => {
    if (!name.trim() || pin.trim().length < 4) {
      toast.error("名前と4桁以上のPINを入力してね");
      return;
    }
    setBusy(true);
    try {
      const res = await api.login(name.trim(), pin.trim());
      if (res.token) {
        localStorage.setItem("token", res.token);
        setToken(res.token);
        localStorage.setItem("displayName", name.trim());
        setDisplayName(name.trim());
        toast.success(`ようこそ ${name.trim()} さん`);
        setName("");
        setPin("");
        push("/me");
      } else {
        toast.error(res.error || "ログインに失敗しました");
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
        toast.success(`登録完了！ようこそ ${signupName.trim()} さん`);
        push("/me");
      } else {
        toast.error(res.error || "登録に失敗しました");
      }
    } finally {
      setBusy(false);
    }
  };

  /* ---- 今日の入力 ---- */
  const submitCoins = async () => {
    const n = Number(coins);
    const s = Number(spent || 0);
    const g = Number(gacha || 0);
    if (!Number.isInteger(n) || n < 0) {
      toast.error("コイン数は0以上の整数で入力してね");
      return;
    }
    if (!Number.isInteger(s) || s < 0) {
      toast.error("使った額は0以上の整数で入力してね");
      return;
    }
    if (!Number.isInteger(g) || g < 0) {
      toast.error("ガチャ回数は0以上の整数で入力してね");
      return;
    }
    setBusy(true);
    try {
      const res = await api.postCoins(n, s, g);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setCoins("");
      setSpent("");
      setGacha("");
      toast.success("保存しました");
      await Promise.all([loadMy(), loadBoard(), loadEarned7dBoard()]);
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
      <div className="flex items-center justify-between mb-4">
        <h1
          onClick={() => push(loggedIn ? "/me" : "/")}
          className="text-3xl md:text-4xl font-black tracking-wide cursor-pointer"
        >
          TSUMU COINS
        </h1>
        <ThemeToggle />
      </div>

      {/* ---------- / : ログイン + ランキング ---------- */}
      {route === "/" && (
        <>
          <Card className="p-4 mb-4">
            <h2 className="text-lg font-bold mb-4">ログイン</h2>
            <div className="space-y-1">
              <Label>名前</Label>
              <Input
                placeholder="名前"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>PIN（4桁以上）</Label>
              <Input
                placeholder="PIN(4桁以上)"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
            </div>
            <div className="flex gap-2 flex-wrap mt-4">
              <Button disabled={busy} onClick={doLogin}>
                ログイン
              </Button>
              <Button variant="link" onClick={() => (window.location.hash = "/signup")}>
                新規登録はこちら
              </Button>
            </div>
          </Card>

          {/* Top ランキング（非ログインでも閲覧） */}
          <CardCap>
            <CardHeader>
              <CardTitle>全体ランキング</CardTitle>
            </CardHeader>
            <CardContent>
              <Leaderboard
                boardTab={boardTab}
                setBoardTab={setBoardTab}
                board={board}
                boardDate={boardDate}
                isProvisional={isProvisional}
                stale={staleBoard}
              />
            </CardContent>
          </CardCap>
        </>
      )}

      {/* ---------- /signup ---------- */}
      {route === "/signup" && (
        <SignupCard busy={busy} onSubmit={doSignup} onBack={() => (window.location.hash = "/")} />
      )}

      {/* ---------- /me ---------- */}
      {route === "/me" && loggedIn && (
        <MyPageDashboard
          displayName={displayName}
          busy={busy}
          todayYmd={todayYmd}
          canEdit={canEdit}
          myHistory={myHistory}
          board={board}
          boardTab={boardTab}
          setBoardTab={setBoardTab}
          boardDate={boardDate}
          isProvisional={isProvisional}
          staleBoard={staleBoard}
          allowPastEdits={allowPastEdits}
          pastEditMaxDays={pastEditMaxDays}
          detailsOpen={detailsOpen}
          setDetailsOpen={setDetailsOpen}
          latestCoins={latestCoins}
          onLogout={() => {
            localStorage.removeItem("token");
            setToken("");
            localStorage.removeItem("displayName");
            setDisplayName("");
            setCoins("");
            window.location.hash = "/";
          }}
          onNotifications={() => push("/notifications")}
          onSubmitCoins={async (n, s, g = 0) => {
            setBusy(true);
            try {
              const res = await api.postCoins(n, s, g);
              if (res.error) {
                toast.error(res.error);
                return;
              }
              toast.success("保存しました");
              await Promise.all([loadMy(), loadBoard(), loadEarned7dBoard()]);
            } finally {
              setBusy(false);
            }
          }}
          onDataUpdated={async () => {
            await Promise.all([loadMy(), loadBoard(), loadEarned7dBoard()]);
          }}
        />
      )}

      {/* ---------- /notifications ---------- */}
      {route === "/notifications" && loggedIn && (
        <>
          <div className="mb-4">
            <Button variant="ghost" onClick={() => push("/me")}>
              ← マイページに戻る
            </Button>
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
    <Card className="p-4">
      <h2 className="text-lg font-bold mb-4">新規登録</h2>
      <div className="space-y-1">
        <Label>名前</Label>
        <Input placeholder="名前" value={n} onChange={(e) => setN(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>PIN（4桁以上）</Label>
        <Input
          placeholder="PIN(4桁以上)"
          type="password"
          inputMode="numeric"
          value={p}
          onChange={(e) => setP(e.target.value)}
        />
      </div>
      <div className="flex gap-2 flex-wrap mt-4">
        <Button disabled={busy || !n.trim() || p.trim().length < 4} onClick={() => onSubmit(n, p)}>
          登録する
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onBack}>
          戻る
        </Button>
      </div>
    </Card>
  );
}

/* =========================
   RecentEditPanel（折りたたみ＆過去編集）
   ========================= */
function RecentEditPanel({
  todayYmd,
  canEditToday,
  allowPastEdits = false,
  pastEditMaxDays = 0,
  onUpdated,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [recentMap, setRecentMap] = useState(new Map());
  const [editing, setEditing] = useState(null);
  const [newCoins, setNewCoins] = useState("");
  const [newSpent, setNewSpent] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const fallbackToday = new Date().toISOString().slice(0, 10);
  const baseToday = /^\d{4}-\d{2}-\d{2}$/.test(todayYmd || "") ? todayYmd : fallbackToday;

  const last7 = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(baseToday, -i)),
    [baseToday]
  );

  const load = async () => {
    try {
      const r = await api.myLatest(60);
      const m = new Map();
      (Array.isArray(r) ? r : []).forEach((row) => {
        if (row?.date_ymd)
          m.set(row.date_ymd, {
            coins: Number(row.coins) || 0,
            spent: Number(row.spent) || 0,
          });
      });
      setRecentMap(m);
    } catch {
      setRecentMap(new Map());
    }
  };
  useEffect(() => {
    load();
  }, []);

  const daysDiff = (a, b) =>
    Math.floor((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000);

  const isEditable = (ymd) => {
    if (ymd === baseToday) return canEditToday;
    if (!allowPastEdits) return false;
    if (!pastEditMaxDays) return true;
    return Math.abs(daysDiff(ymd, baseToday)) <= pastEditMaxDays;
  };

  const startEdit = (date, coins, spent) => {
    setEditing({ date });
    setNewCoins(coins != null ? String(coins) : "");
    setNewSpent(spent != null ? String(spent) : "0");
    setErr("");
  };
  const cancel = () => {
    setEditing(null);
    setNewCoins("");
    setNewSpent("");
    setErr("");
  };

  const save = async () => {
    const n = Number(newCoins);
    const s = Number(newSpent || 0);
    if (!Number.isInteger(n) || n < 0) {
      setErr("コイン数は0以上の整数で入力してね");
      return;
    }
    if (!Number.isInteger(s) || s < 0) {
      setErr("使った額は0以上の整数で入力してね");
      return;
    }
    setBusy(true);
    try {
      await api.patchCoins(editing.date, n, s);
      cancel();
      await load();
      onUpdated?.();
    } catch (e) {
      const errMsg = e.message || "";
      if (errMsg.includes("finalized")) {
        setErr("この日はすでに締め切られています");
      } else if (errMsg.includes("locked")) {
        setErr("過去の記録は編集できない設定です");
      } else if (errMsg.includes("only past")) {
        setErr("編集可能な期間を過ぎています");
      } else if (errMsg.includes("invalid date")) {
        setErr("日付の形式が正しくありません");
      } else {
        setErr(errMsg || "更新に失敗しました");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* ヘッダー */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors"
      >
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Edit3 className="w-4 h-4 text-muted-foreground" />
          直近の記録（修正・追加）
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {last7[last7.length - 1]} ～ {last7[0]}
          </span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </button>

      {isOpen && (
        <div className="p-4 space-y-2">
          {last7.map((d) => {
            const rec = recentMap.get(d);
            const editable = isEditable(d);
            const isEditingThis = editing?.date === d;
            const isToday = d === baseToday;

            return (
              <div
                key={d}
                className={`rounded-lg p-3 transition-colors ${
                  isToday
                    ? "bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/30 border border-indigo-200 dark:border-indigo-800"
                    : "border border-border"
                }`}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Calendar className={`w-4 h-4 ${isToday ? "text-indigo-500" : "text-muted-foreground"}`} />
                    <span className={`font-semibold text-sm ${isToday ? "text-indigo-600 dark:text-indigo-400" : ""}`}>
                      {d}
                      {isToday && <span className="ml-1 text-xs">(今日)</span>}
                    </span>
                  </div>

                  {isEditingThis ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex gap-2 items-center flex-wrap">
                        <label className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">コイン</span>
                          <Input
                            value={newCoins}
                            onChange={(e) => setNewCoins(e.target.value.replace(/[^\d]/g, ""))}
                            inputMode="numeric"
                            placeholder="0"
                            className="w-24 h-8 my-0"
                          />
                        </label>
                        <label className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">使用</span>
                          <Input
                            value={newSpent}
                            onChange={(e) => setNewSpent(e.target.value.replace(/[^\d]/g, ""))}
                            inputMode="numeric"
                            placeholder="0"
                            className="w-20 h-8 my-0"
                          />
                        </label>
                      </div>
                      <Button size="sm" className="h-8" disabled={busy} onClick={save}>
                        保存
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8" disabled={busy} onClick={cancel}>
                        取消
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      {rec ? (
                        <>
                          <div className="text-right">
                            <span className="font-bold text-base tabular-nums">
                              {Number(rec.coins).toLocaleString()}
                            </span>
                            <span className="text-xs text-muted-foreground ml-1">枚</span>
                            {rec.spent > 0 && (
                              <div className="text-xs text-muted-foreground">
                                使用: {Number(rec.spent).toLocaleString()}
                              </div>
                            )}
                          </div>
                          {editable && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => startEdit(d, rec.coins, rec.spent)}
                            >
                              <Edit3 className="w-3 h-3 mr-1" />
                              編集
                            </Button>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="text-sm text-muted-foreground">未登録</span>
                          {editable && (
                            <Button size="sm" className="h-8 text-xs" onClick={() => startEdit(d, "", 0)}>
                              追加
                            </Button>
                          )}
                        </>
                      )}
                      {!editable && !rec && (
                        <span className="text-xs text-muted-foreground">(編集不可)</span>
                      )}
                    </div>
                  )}
                </div>
                {isEditingThis && err && (
                  <p className="text-destructive text-xs mt-2">{err}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =========================
   MyPageDashboard（マイページ ダッシュボード）
   ========================= */
function MyPageDashboard({
  displayName,
  busy,
  todayYmd,
  canEdit,
  myHistory,
  board,
  boardTab,
  setBoardTab,
  boardDate,
  isProvisional,
  staleBoard,
  allowPastEdits,
  pastEditMaxDays,
  detailsOpen,
  setDetailsOpen,
  latestCoins,
  onLogout,
  onNotifications,
  onSubmitCoins,
  onDataUpdated,
}) {
  // KPI計算用のヘルパー
  const addDaysLocal = (ymd, n) => {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
  };

  const end = todayYmd || myHistory[0]?.date_ymd || "";

  // KPI計算
  const { dailyDiff, sum7, sum30 } = useMemo(() => {
    const sumDiffsWindow = (N) => {
      if (!end) return 0;
      const start = addDaysLocal(end, -(N - 1));
      return myHistory
        .filter((r) => r.date_ymd >= start && r.date_ymd <= end)
        .reduce((acc, r) => acc + Number(r.diff || 0), 0);
    };

    return {
      dailyDiff: Number(myHistory[0]?.diff ?? 0),
      sum7: sumDiffsWindow(7),
      sum30: sumDiffsWindow(30),
    };
  }, [myHistory, end]);

  // 年末予測用の平均稼ぎ（localStorageと連動）
  const [avgPerDay, setAvgPerDay] = useState(() => {
    const v = Number(localStorage.getItem("avgPerDay") || 50000);
    return Number.isFinite(v) && v >= 0 ? v : 50000;
  });
  const handleChangeAvg = (v) => {
    setAvgPerDay(v);
    localStorage.setItem("avgPerDay", String(v));
  };

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <header className="flex justify-between items-center gap-3 flex-wrap">
        <p className="text-muted-foreground">
          ようこそ <b className="text-foreground">{displayName || "ゲスト"}</b> さん
        </p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            onClick={onNotifications}
            title="通知設定"
          >
            <Settings className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            onClick={onLogout}
            title="ログアウト"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* KPIカード（2x2グリッド） */}
      <KPICard
        currentCoins={latestCoins}
        dailyDiff={dailyDiff}
        sum7={sum7}
        sum30={sum30}
      />

      {/* 年末予測（コンパクト表示） */}
      <YearEndMini
        todayYmd={todayYmd}
        baseCoins={latestCoins}
        avgPerDay={avgPerDay}
        onChangeAvg={handleChangeAvg}
      />

      {/* 今日の入力CTA */}
      <QuickInput
        todayYmd={todayYmd}
        canEdit={canEdit}
        busy={busy}
        latestCoins={latestCoins}
        onSubmit={onSubmitCoins}
      />

      {/* ミニチャート */}
      <MiniChart
        data={myHistory}
        onExpand={() => {
          setDetailsOpen(true);
          setTimeout(() => {
            document.getElementById("history-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 150);
        }}
      />

      {/* ランキングプレビュー */}
      <RankingPreview
        myName={displayName}
        board={board}
        periodDays={7}
        periodEnd={todayYmd}
        onViewFull={() => {
          setDetailsOpen(true);
          setTimeout(() => {
            document.getElementById("ranking-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 150);
        }}
      />

      {/* 詳細セクション（折りたたみ） */}
      <Collapsible id="details-section" open={detailsOpen} onOpenChange={setDetailsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between h-12"
          >
            <span className="flex items-center gap-2">
              <ChevronDown className={`h-4 w-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
              詳細を表示
            </span>
            <span className="text-xs text-muted-foreground">
              予測設定・履歴編集・全ランキング
            </span>
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-4 mt-4">
          {/* 年末予測 */}
          <YearEndProjection todayYmd={todayYmd} baseCoins={latestCoins} />

          {/* 過去の記録編集 */}
          <RecentEditPanel
            todayYmd={todayYmd}
            canEditToday={canEdit}
            allowPastEdits={allowPastEdits}
            pastEditMaxDays={pastEditMaxDays}
            onUpdated={onDataUpdated}
          />

          {/* 自分の履歴 */}
          <div id="history-section">
            <MyHistory rows={myHistory} endYmd={todayYmd || myHistory[0]?.date_ymd} />
          </div>

          {/* 全体ランキング */}
          <div id="ranking-section" className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Trophy className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">全体ランキング</h3>
            </div>
            <div className="p-4">
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
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/* =========================
   YearEndProjection（年末までの試算）
   ========================= */
function YearEndProjection({ todayYmd, baseCoins }) {
  const [isOpen, setIsOpen] = useState(true);

  const [avgPerDay, setAvgPerDay] = useState(() => {
    const v = Number(localStorage.getItem("avgPerDay") || 50000);
    return Number.isFinite(v) && v >= 0 ? v : 50000;
  });
  useEffect(() => {
    localStorage.setItem("avgPerDay", String(avgPerDay));
  }, [avgPerDay]);

  const today = todayYmd || new Date().toISOString().slice(0, 10);
  const end = `${today.slice(0, 4)}-12-31`;

  const daysDiff = (a, b) =>
    Math.floor((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000);
  const remainDays = Math.max(0, daysDiff(today, end) + 1);

  const additional = avgPerDay * remainDays;
  const projected = (Number(baseCoins) || 0) + additional;

  const fmt = (n) => Number(n).toLocaleString();

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* ヘッダー */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors"
      >
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Target className="w-4 h-4 text-muted-foreground" />
          年末予測の設定
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            1日の平均を調整
          </span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </button>

      {isOpen && (
        <div className="p-4 space-y-4">
          {/* 入力エリア */}
          <div className="flex items-center gap-3 flex-wrap border border-border rounded-lg p-3">
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">平均</span>
              <Input
                value={avgPerDay}
                onChange={(e) => setAvgPerDay(Number(e.target.value.replace(/[^\d]/g, "") || 0))}
                inputMode="numeric"
                className="w-28 text-right h-9 my-0 font-bold"
              />
              <span className="text-muted-foreground text-sm">枚/日</span>
            </label>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1 text-sm">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              残り <b className="text-foreground">{fmt(remainDays)}</b> 日
            </div>
          </div>

          {/* KPIカード風の3カラム */}
          <div className="grid grid-cols-3 gap-2">
            <div className="border border-border rounded-xl p-3 min-h-[80px] flex flex-col justify-between">
              <div className="text-muted-foreground text-xs">いまのコイン</div>
              <div className="text-lg font-black tabular-nums">{fmt(baseCoins)}</div>
            </div>
            <div className="border border-border rounded-xl p-3 min-h-[80px] flex flex-col justify-between">
              <div className="text-muted-foreground text-xs">見込み追加</div>
              <div className="text-lg font-black tabular-nums text-success">+{fmt(additional)}</div>
            </div>
            <div className="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/50 dark:to-violet-950/50 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3 min-h-[80px] flex flex-col justify-between">
              <div className="text-indigo-600 dark:text-indigo-400 text-xs font-medium">12/31 予測</div>
              <div className="text-xl font-black tabular-nums text-indigo-600 dark:text-indigo-400">{fmt(projected)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
