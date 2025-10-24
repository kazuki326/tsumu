// src/components/MyHistory.jsx
// 自分の履歴（直近14日）: 折れ線グラフ + テーブル
// 7日/30日は “前日比(diff)の総和” をヘッダー統計に表示

import { useMemo, useState } from "react";

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
export function MyHistory({ rows, endYmd }) {
  const [tooltip, setTooltip] = useState(null);

  const end = endYmd || rows[0]?.date_ymd || "";

  const sumDiffsWindow = (N) => {
    if (!end) return 0;
    const start = addDays(end, -(N - 1));
    return rows
      .filter((r) => r.date_ymd >= start && r.date_ymd <= end)
      .reduce((acc, r) => acc + Number(r.diff || 0), 0);
  };

  const latestCoins = Number(rows[0]?.coins ?? 0);
  const sum7 = sumDiffsWindow(7);
  const sum30 = sumDiffsWindow(30);

  const graphData = rows.slice(0, 14).reverse();
  const dates = graphData.map((r) => r.date_ymd);
  const values = graphData.map((r) => Number(r.coins));
  const minV = values.length ? Math.min(...values) : 0;
  const maxV = values.length ? Math.max(...values) : 0;
  const range = maxV - minV;
  const padding = range * 0.15;

  return (
    <div className="cap">
      <div className="head--strong" style={{ padding: "20px 24px", color: "var(--ink)" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h3 style={{ margin: 0, color: "var(--ink)", fontSize: 18, fontWeight: 700 }}>自分の履歴（直近14日）</h3>
          <div className="row" style={{ gap: 20 }}>
            <Stat label="最新コイン" value={latestCoins.toLocaleString()} />
            <Stat label="7日間増減" value={(sum7 >= 0 ? "+" : "") + sum7} color={sum7 >= 0 ? "var(--ok)" : "var(--ng)"} />
            <Stat label="30日間増減" value={(sum30 >= 0 ? "+" : "") + sum30} color={sum30 >= 0 ? "var(--ok)" : "var(--ng)"} />
          </div>
        </div>
      </div>

      <div className="panel-body">
        {graphData.length > 1 && (
          <div
            style={{
              marginBottom: 24,
              padding: 20,
              background: "linear-gradient(135deg, var(--brand-100), var(--violet-300))",
              borderRadius: 12,
              boxShadow: "0 4px 16px rgba(67,56,202,.15)"
            }}
            onClick={() => setTooltip(null)} // グラフ外クリックでツールチップを閉じる
          >
            <div style={{ background: "rgba(255,255,255,.95)", borderRadius: 8, padding: 16, backdropFilter: "blur(10px)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h4 style={{ margin: 0, color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>コイン数の推移</h4>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  {dates[0]?.slice(5)} ～ {dates[dates.length - 1]?.slice(5)}
                </div>
              </div>

              <CoinsLineSVG
                W={600}
                H={200}
                pad={40}
                dates={dates}
                values={values}
                minV={minV}
                maxV={maxV}
                padding={padding}
                onPointClick={(payload) => setTooltip(payload)}
                onCanvasClick={() => setTooltip(null)}
                tooltip={tooltip}
                graphData={graphData}
              />
            </div>
          </div>
        )}

        {/* テーブル */}
        <div>
          <h4 style={{ margin: "0 0 12px 0", color: "var(--ink)", fontSize: 15, fontWeight: 600 }}>詳細データ</h4>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>日付</th>
                  <th>コイン</th>
                  <th>前日比</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 14).map((r) => (
                  <tr key={r.date_ymd}>
                    <td>{r.date_ymd}</td>
                    <td>{Number(r.coins).toLocaleString()}</td>
                    <td className={r.diff >= 0 ? "pos" : "neg"}>{r.diff >= 0 ? `+${r.diff}` : r.diff}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ opacity: 0.6 }}>
                      データがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 18, color: color || "var(--ink)" }}>{value}</div>
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
  graphData
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
        // 背景クリックでツールチップを閉じる
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
          <text x={tooltip.x} y={tooltip.y - 26} textAnchor="middle" fill="var(--brand-500)" fontSize="13" fontWeight="700">
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
