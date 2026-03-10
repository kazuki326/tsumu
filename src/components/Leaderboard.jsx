// src/components/Leaderboard.jsx
// 全体ランキング：タブ5種（7日稼ぎ/コイン数/前日比/7日増減/30日増減）

import { useEffect, useMemo, useState } from "react";
import { Trophy, TrendingUp, Coins, Calendar, BarChart3 } from "lucide-react";
import { api } from "../api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

/* ========= public component ========= */
export function Leaderboard({
  boardTab,
  setBoardTab,
  board,
  boardDate,
  isProvisional,
  stale
}) {
  // 折れ線グラフ用 series
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(false);

  // コイン数タブかどうか
  const isRaw = boardTab === "raw";

  // boardSeries のパラメータ
  const seriesParams = useMemo(() => {
    if (boardTab === "earned7d") return { mode: "earned", periodDays: 7, days: 28, top: 5, date: boardDate };
    if (boardTab === "daily") return { mode: "daily", days: 14, top: 5, date: boardDate };
    if (boardTab === "7d")    return { mode: "period", periodDays: 7,  days: 28, top: 5, date: boardDate };
    if (boardTab === "30d")   return { mode: "period", periodDays: 30, days: 60, top: 5, date: boardDate };
    return null; // raw は取得しない
  }, [boardTab, boardDate]);

  // グラフデータ取得（raw以外）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!seriesParams) { setSeries([]); return; }
      setLoading(true);
      try {
        const s = await api.boardSeries(seriesParams);
        if (!cancelled) setSeries(Array.isArray(s?.series) ? s.series : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [seriesParams]);

  return (
    <div className="space-y-4">
      {/* ステータス */}
      {stale && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground border border-border rounded-lg px-3 py-2">
          <div className="animate-spin w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full" />
          更新中...
        </div>
      )}

      {/* 指標タブ（5つ） */}
      <Tabs value={boardTab} onValueChange={setBoardTab}>
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="w-full justify-start gap-1 h-auto p-1 border border-border bg-card">
            <TabsTrigger value="earned7d" className="text-xs px-3 py-2 data-[state=active]:bg-card">
              <Trophy className="w-3 h-3 mr-1" />
              7日間稼ぎ
            </TabsTrigger>
            <TabsTrigger value="raw" className="text-xs px-3 py-2 data-[state=active]:bg-card">
              <Coins className="w-3 h-3 mr-1" />
              コイン数
            </TabsTrigger>
            <TabsTrigger value="daily" className="text-xs px-3 py-2 data-[state=active]:bg-card">
              <TrendingUp className="w-3 h-3 mr-1" />
              前日比
            </TabsTrigger>
            <TabsTrigger value="7d" className="text-xs px-3 py-2 data-[state=active]:bg-card">
              <Calendar className="w-3 h-3 mr-1" />
              7日間
            </TabsTrigger>
            <TabsTrigger value="30d" className="text-xs px-3 py-2 data-[state=active]:bg-card">
              <Calendar className="w-3 h-3 mr-1" />
              30日間
            </TabsTrigger>
          </TabsList>
        </div>

        {/* コイン数タブ：スナップショットの棒バーのみ */}
        <TabsContent value="raw" className="mt-4">
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-border">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Coins className="w-4 h-4 text-muted-foreground" />
                コイン数ランキング
              </h4>
            </div>
            <div className="p-4">
              <RankListAndBars data={board} unit={labelForTab("raw")} />
            </div>
          </div>
        </TabsContent>

        {/* その他タブ：グラフ + スナップショット */}
        {["earned7d", "daily", "7d", "30d"].map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4 space-y-4">
            {/* グラフ */}
            <div className="bg-gradient-to-br from-indigo-50/50 to-violet-50/50 dark:from-indigo-950/30 dark:to-violet-950/30 rounded-xl p-4 border border-indigo-100 dark:border-indigo-900">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-indigo-500" />
                <h4 className="text-sm font-semibold">トレンドグラフ</h4>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                  <div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full mr-2" />
                  読み込み中…
                </div>
              ) : series.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">グラフ用のデータがありません</p>
              ) : (
                <LineChartWithDismiss series={series} unit={labelForTab(tab)} />
              )}
            </div>

            {/* スナップショット棒バー */}
            <div className="border border-border rounded-xl overflow-hidden bg-card">
              <div className="px-4 py-2 border-b border-border">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-muted-foreground" />
                  ランキング（現時点）
                </h4>
              </div>
              <div className="p-4">
                <RankListAndBars data={board} unit={labelForTab(tab)} />
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* 基準日 */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground border border-border rounded-lg px-3 py-2">
        <Calendar className="w-3 h-3" />
        基準日: {boardDate || "取得中…"}
        <span className={isProvisional ? "text-amber-600 dark:text-amber-400" : "text-success"}>
          {isProvisional ? "（今日・暫定）" : "（締切済み）"}
        </span>
      </div>
    </div>
  );
}

/* ========= sub components ========= */

function labelForTab(tab) {
  if (tab === "earned7d") return "枚（7日稼ぎ）";
  if (tab === "raw") return "枚";
  if (tab === "daily") return "枚（前日比）";
  if (tab === "7d") return "枚/7日";
  if (tab === "30d") return "枚/30日";
  return "枚";
}

const MEDALS = ["🥇", "🥈", "🥉"];

function RankListAndBars({ data, unit }) {
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(Number(d.value) || 0)));

  if (data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm text-center py-4">
        まだデータがありません
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((b, i) => {
        const val = Number(b.value) || 0;
        const width = (Math.abs(val) / maxAbs) * 100;
        const isPos = val >= 0;
        const isTop3 = i < 3;

        return (
          <div key={`${b.name}-${i}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {isTop3 ? (
                  <span className="text-base">{MEDALS[i]}</span>
                ) : (
                  <span className="text-sm font-semibold text-muted-foreground w-5">{i + 1}.</span>
                )}
                <span className="font-medium text-sm">{b.name}</span>
              </div>
              <span className={`font-bold tabular-nums text-sm ${isPos ? "text-success" : "text-danger"}`}>
                {isPos && val > 0 ? "+" : ""}{val.toLocaleString()} {unit}
              </span>
            </div>
            {/* バー */}
            <div className="h-2 bg-border/30 rounded-full overflow-hidden ml-7">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${width}%`,
                  background: isPos ? "var(--brand-600)" : "#ef4444"
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ========= chart (with click-away to dismiss tooltip) ========= */

function LineChartWithDismiss({ series, unit }) {
  const [tooltip, setTooltip] = useState(null);
  return (
    <div
      className="rounded-xl overflow-x-auto"
      onClick={() => setTooltip(null)}
    >
      <LineChart series={series} unit={unit} tooltip={tooltip} setTooltip={setTooltip} />
      <div className="flex items-center justify-between text-muted-foreground text-xs mt-3 px-1">
        <span>単位: {unit}</span>
        {tooltip ? (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setTooltip(null)}>
            ツールチップを閉じる
          </Button>
        ) : (
          <span>ポイントをタップで詳細</span>
        )}
      </div>
    </div>
  );
}

function LineChart({ series, unit, tooltip, setTooltip }) {
  const dates = (series[0]?.points || []).map((p) => p.date_ymd);
  const allVals = series.flatMap((s) => s.points.map((p) => p.value));
  const minV = Math.min(0, ...allVals);
  const maxV = Math.max(0, ...allVals, 1);
  const pad = 24,
    W = 640,
    H = 280,
    chartW = W - pad * 2,
    chartH = H - pad * 2;

  const x = (i) => (i / Math.max(1, dates.length - 1)) * chartW + pad;
  const y = (v) => {
    const t = (v - minV) / (maxV - minV || 1);
    return H - pad - t * chartH;
  };

  const axisColor = "#cbd5e1";
  const gridColor = "rgba(0,0,0,.06)";
  const tickColor = "#475569";
  const zeroColor = "#d33";
  const axisY0 = y(0);
  const color = (i) => `hsl(${(i * 67) % 360} 70% 45%)`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto rounded-lg"
      style={{ background: "hsl(var(--card))" }}
      onClick={(e) => {
        const tag = e.target.tagName.toLowerCase();
        if (tag === "svg" || tag === "line" || tag === "path" || tag === "rect") {
          setTooltip?.(null);
        }
      }}
    >
      {/* axes */}
      <line x1={pad} y1={y(minV)} x2={pad} y2={y(maxV)} stroke={axisColor} strokeWidth="1" />
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke={axisColor} strokeWidth="1" />
      {/* zero line */}
      {minV < 0 && maxV > 0 && (
        <line x1={pad} y1={axisY0} x2={W - pad} y2={axisY0} stroke={zeroColor} strokeDasharray="4 4" strokeWidth="1" />
      )}

      {/* y ticks */}
      {[0, 0.5, 1].map((t) => {
        const v = minV + t * (maxV - minV);
        const py = y(v);
        return (
          <g key={t}>
            <line x1={pad} y1={py} x2={W - pad} y2={py} stroke={gridColor} strokeWidth="1" />
            <text x={pad - 6} y={py + 4} textAnchor="end" fill={tickColor} fontSize="11">
              {Math.round(v).toLocaleString()}
            </text>
          </g>
        );
      })}

      {/* x ticks */}
      {dates.map((d, i) => (
        <g key={d}>
          {i % Math.ceil(dates.length / 6 || 1) === 0 && (
            <>
              <line x1={x(i)} y1={H - pad} x2={x(i)} y2={H - pad + 4} stroke={axisColor} strokeWidth="1" />
              <text x={x(i)} y={H - pad + 18} textAnchor="middle" fill={tickColor} fontSize="11">
                {d.slice(5)}
              </text>
            </>
          )}
        </g>
      ))}

      {/* lines */}
      {series.map((s, idx) => {
        const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
        return <path key={s.name} d={d} fill="none" stroke={color(idx)} strokeWidth="2" />;
      })}

      {/* data points (clickable) */}
      {series.map((s, idx) =>
        s.points.map((p, i) => (
          <circle
            key={`${s.name}-${i}`}
            cx={x(i)}
            cy={y(p.value)}
            r="5"
            fill={color(idx)}
            stroke="#fff"
            strokeWidth="2"
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              setTooltip?.({ x: x(i), y: y(p.value), date: p.date_ymd, name: s.name, value: p.value });
            }}
          />
        ))
      )}

      {/* tooltip */}
      {tooltip && (
        <g>
          <rect x={tooltip.x - 60} y={tooltip.y - 60} width="120" height="50" fill="#334155" rx="6" opacity="0.95" />
          <text x={tooltip.x} y={tooltip.y - 40} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="600">
            {tooltip.name}
          </text>
          <text x={tooltip.x} y={tooltip.y - 26} textAnchor="middle" fill="#e2e8f0" fontSize="10">
            {tooltip.date}
          </text>
          <text x={tooltip.x} y={tooltip.y - 12} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="700">
            {Number(tooltip.value).toLocaleString()} {unit}
          </text>
        </g>
      )}
    </svg>
  );
}

/* 互換性のため default もエクスポート */
export default Leaderboard;
