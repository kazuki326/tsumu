// src/components/MyHistory.jsx
// 自分の履歴（直近14日）: 折れ線グラフ + テーブル
// 7日/30日は "前日比(diff)の総和" をヘッダー統計に表示

import { useMemo, useState } from "react";
import { History, ChevronDown, TrendingUp, TrendingDown, Coins, Calendar } from "lucide-react";
import { CardCap, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

/* ---------- utils ---------- */
const toDate = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const addDays = (ymd, n) => {
  const dt = toDate(ymd);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};

/* ---------- public component ---------- */
export function MyHistory({ rows, endYmd, compact = false }) {
  const [tooltip, setTooltip] = useState(null);

  const end = endYmd || rows[0]?.date_ymd || "";

  // useMemo で計算結果をキャッシュ
  const { latestCoins, sum7, sum30 } = useMemo(() => {
    const sumDiffsWindow = (N) => {
      if (!end) return 0;
      const start = addDays(end, -(N - 1));
      return rows
        .filter((r) => r.date_ymd >= start && r.date_ymd <= end)
        .reduce((acc, r) => acc + Number(r.diff || 0), 0);
    };

    return {
      latestCoins: Number(rows[0]?.coins ?? 0),
      sum7: sumDiffsWindow(7),
      sum30: sumDiffsWindow(30)
    };
  }, [rows, end]);

  const { graphData, dates, values, minV, maxV, range, padding } = useMemo(() => {
    const graphData = rows.slice(0, 14).reverse();
    const dates = graphData.map((r) => r.date_ymd);
    const values = graphData.map((r) => Number(r.coins));
    const minV = values.length ? Math.min(...values) : 0;
    const maxV = values.length ? Math.max(...values) : 0;
    const range = maxV - minV;
    const padding = range * 0.15;
    return { graphData, dates, values, minV, maxV, range, padding };
  }, [rows]);

  // コンパクトモード用の高さ
  const chartHeight = compact ? 128 : 200;

  const trend = sum7 >= 0;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" />
          自分の履歴（直近14日）
        </h3>
        {!compact && (
          <div className="text-xs text-muted-foreground">
            {dates[0]?.slice(5)} ～ {dates[dates.length - 1]?.slice(5)}
          </div>
        )}
      </div>

      {/* KPI風サマリー */}
      {!compact && (
        <div className="grid grid-cols-3 gap-2 p-4 border-b border-border">
          <div className="rounded-lg p-3 border border-border">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <Coins className="w-3 h-3" />
              最新コイン
            </div>
            <div className="text-lg font-bold tabular-nums">{latestCoins.toLocaleString()}</div>
          </div>
          <div className="rounded-lg p-3 border border-border">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              {sum7 >= 0 ? <TrendingUp className="w-3 h-3 text-success" /> : <TrendingDown className="w-3 h-3 text-danger" />}
              7日間
            </div>
            <div className={`text-lg font-bold tabular-nums ${sum7 >= 0 ? "text-success" : "text-danger"}`}>
              {sum7 >= 0 ? "+" : ""}{sum7.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg p-3 border border-border">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              {sum30 >= 0 ? <TrendingUp className="w-3 h-3 text-success" /> : <TrendingDown className="w-3 h-3 text-danger" />}
              30日間
            </div>
            <div className={`text-lg font-bold tabular-nums ${sum30 >= 0 ? "text-success" : "text-danger"}`}>
              {sum30 >= 0 ? "+" : ""}{sum30.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* グラフ */}
      {graphData.length > 1 && (
        <div className="p-4" onClick={() => setTooltip(null)}>
          <div className="bg-gradient-to-br from-indigo-50/50 to-violet-50/50 dark:from-indigo-950/30 dark:to-violet-950/30 rounded-xl p-4 border border-indigo-100 dark:border-indigo-900">
            <CoinsLineSVG
              W={600}
              H={chartHeight}
              pad={compact ? 30 : 40}
              dates={dates}
              values={values}
              minV={minV}
              maxV={maxV}
              padding={padding}
              onPointClick={(payload) => setTooltip(payload)}
              onCanvasClick={() => setTooltip(null)}
              tooltip={tooltip}
              graphData={graphData}
              compact={compact}
            />
            <div className="text-xs text-muted-foreground text-center mt-2">
              タップで詳細表示
            </div>
          </div>
        </div>
      )}

      {/* テーブル（compactモードでは非表示） */}
      {!compact && (
        <div className="px-4 pb-4">
          <div className="rounded-xl overflow-hidden border border-border">
            <div className="px-4 py-2 border-b border-border">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                詳細データ
              </h4>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold">日付</TableHead>
                  <TableHead className="font-semibold text-right">コイン</TableHead>
                  <TableHead className="font-semibold text-right">前日比</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 14).map((r, idx) => (
                  <TableRow key={r.date_ymd} className={idx === 0 ? "bg-indigo-50/50 dark:bg-indigo-950/30" : ""}>
                    <TableCell className="font-medium">
                      {r.date_ymd}
                      {idx === 0 && <span className="ml-1 text-xs text-indigo-600 dark:text-indigo-400">(最新)</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{Number(r.coins).toLocaleString()}</TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold ${r.diff >= 0 ? "text-success" : "text-danger"}`}>
                      {r.diff >= 0 ? `+${Number(r.diff).toLocaleString()}` : Number(r.diff).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      データがありません
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="text-center">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`font-bold text-lg ${color || "text-foreground"}`}>{value}</div>
    </div>
  );
}

/* ---------- inline chart (no external import) ---------- */
function CoinsLineSVG({
  W,
  H,
  pad,
  dates,
  values,
  minV,
  maxV,
  padding,
  onPointClick,
  onCanvasClick,
  tooltip,
  graphData,
  compact = false
}) {
  const chartW = W - pad * 2;
  const chartH = H - pad * 2;

  const x = (i) => (i / Math.max(1, dates.length - 1)) * chartW + pad;
  const y = (v) => {
    const adjustedMin = minV - padding;
    const adjustedMax = maxV + padding;
    const t = (v - adjustedMin) / (adjustedMax - adjustedMin || 1);
    return H - pad - t * chartH;
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      onClick={(e) => {
        if (e.target.tagName === "svg" || e.target.tagName === "path" || e.target.tagName === "line") {
          onCanvasClick?.();
        }
      }}
    >
      <defs>
        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
        <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#6366F1" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.06" />
        </linearGradient>
      </defs>

      {/* グリッドライン */}
      {[0, 0.5, 1].map((t) => {
        const v = minV - padding + t * (maxV - minV + padding * 2);
        const py = y(v);
        return (
          <g key={t}>
            <line x1={pad} y1={py} x2={W - pad} y2={py} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3 3" />
            <text x={pad - 6} y={py + 3} textAnchor="end" fill="#9ca3af" fontSize="10" fontWeight="500">
              {Math.round(v).toLocaleString()}
            </text>
          </g>
        );
      })}

      {/* エリア塗りつぶし */}
      <path
        d={`M ${x(0)},${H - pad} ${values.map((v, i) => `L ${x(i)},${y(v)}`).join(" ")} L ${x(values.length - 1)},${
          H - pad
        } Z`}
        fill="url(#areaGradient)"
      />

      {/* メインライン */}
      <path
        d={values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)},${y(v)}`).join(" ")}
        fill="none"
        stroke="url(#lineGradient)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* データポイント */}
      {values.map((v, i) => (
        <g key={i}>
          <circle
            cx={x(i)}
            cy={y(v)}
            r="5"
            fill="#fff"
            stroke="url(#lineGradient)"
            strokeWidth="2.5"
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onPointClick?.({ x: x(i), y: y(v), date: dates[i], value: v, index: i });
            }}
          />
        </g>
      ))}

      {/* X軸ラベル */}
      {dates.map((d, i) => {
        if (i % Math.ceil(dates.length / 6 || 1) !== 0) return null;
        return (
          <text key={d} x={x(i)} y={H - pad + 16} textAnchor="middle" fill="#6b7280" fontSize="10" fontWeight="500">
            {d.slice(5)}
          </text>
        );
      })}

      {/* ツールチップ */}
      {tooltip && (
        <g>
          <rect x={tooltip.x - 60} y={tooltip.y - 60} width="120" height="52" fill="#1f2937" rx="6" opacity="0.95" />
          <text x={tooltip.x} y={tooltip.y - 40} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="600">
            {tooltip.date}
          </text>
          <text x={tooltip.x} y={tooltip.y - 26} textAnchor="middle" fill="#818CF8" fontSize="13" fontWeight="700">
            {Number(tooltip.value).toLocaleString()} 枚
          </text>
          {tooltip.index > 0 && (
            <text
              x={tooltip.x}
              y={tooltip.y - 12}
              textAnchor="middle"
              fill={graphData[tooltip.index].diff >= 0 ? "#15a46b" : "#d33"}
              fontSize="11"
              fontWeight="600"
            >
              {graphData[tooltip.index].diff >= 0 ? "+" : ""}
              {graphData[tooltip.index].diff}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}
