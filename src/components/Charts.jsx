// src/components/Charts.jsx
import { useRef, useEffect, useState } from "react";

/* =========================================================
   CoinsLineSVG
   - 自分の履歴（直近14日）で使う軽量SVG折れ線
   - 点クリックで onPointClick、SVG/パス/線クリックで onCanvasClick
   - インディゴ/バイオレットのグラデ
   ========================================================= */
export function CoinsLineSVG({
  W = 600,
  H = 200,
  pad = 40,
  dates = [],
  values = [],
  minV = 0,
  maxV = 0,
  padding = 0,
  onPointClick,
  onCanvasClick,
  tooltip,
  graphData = [],
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
        const tag = e.target.tagName?.toLowerCase();
        if (tag === "svg" || tag === "path" || tag === "line" || tag === "text") {
          onCanvasClick?.();
        }
      }}
      role="img"
      aria-label="コイン数折れ線グラフ"
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

      {/* ガイド線 + 目盛り */}
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

      {/* 面塗り */}
      {values.length > 0 && (
        <path
          d={`M ${x(0)},${H - pad} ${values.map((v, i) => `L ${x(i)},${y(v)}`).join(" ")} L ${x(values.length - 1)},${H - pad} Z`}
          fill="url(#areaGradient)"
        />
      )}

      {/* 線 */}
      <path
        d={values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)},${y(v)}`).join(" ")}
        fill="none"
        stroke="url(#lineGradient)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 点 */}
      {values.map((v, i) => (
        <circle
          key={i}
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
      ))}

      {/* X軸ラベル */}
      {dates.map((d, i) => {
        if (i % Math.ceil(dates.length / 6) !== 0) return null;
        return (
          <text key={d} x={x(i)} y={H - pad + 16} textAnchor="middle" fill="#6b7280" fontSize="10" fontWeight="500">
            {d.slice(5)}
          </text>
        );
      })}

      {/* ツールチップ（任意） */}
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

/* =========================================================
   LineChart
   - 全体ランキングで使う白背景折れ線
   - データ点クリックでツールチップ表示
   - 「円以外をクリック」「グラフ外をクリック」でツールチップを閉じる
   - 下に「スナップショット棒グラフ」を置く構成は親側で実装済み
   ========================================================= */
export function LineChart({ series = [], unit = "枚" }) {
  const [tooltip, setTooltip] = useState(null); // { x, y, date, name, value }
  const wrapperRef = useRef(null);

  // グラフ外クリックで閉じる
  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target)) setTooltip(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const dates = (series[0]?.points || []).map((p) => p.date_ymd);
  const allVals = series.flatMap((s) => s.points.map((p) => p.value));
  const minV = Math.min(0, ...allVals);
  const maxV = Math.max(0, ...allVals, 1);

  const pad = 24;
  const W = 640;
  const H = 280;
  const chartW = W - pad * 2;
  const chartH = H - pad * 2;

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
    <div
      ref={wrapperRef}
      className="chart-card"
      style={{ width: "100%", overflowX: "auto", position: "relative" }}
      onClick={() => setTooltip(null)} // ラッパーの空白クリックでも閉じる
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", background: "#fff", borderRadius: 10 }}
        onClick={(e) => {
          // SVG内で「円以外」をクリックしたら閉じる
          const tag = e.target.tagName?.toLowerCase();
          if (tag !== "circle") setTooltip(null);
        }}
        role="img"
        aria-label="全体ランキング折れ線グラフ"
      >
        {/* 軸 */}
        <line x1={pad} y1={y(minV)} x2={pad} y2={y(maxV)} stroke={axisColor} strokeWidth="1" />
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke={axisColor} strokeWidth="1" />

        {/* 0ライン */}
        {minV < 0 && maxV > 0 && (
          <line x1={pad} y1={axisY0} x2={W - pad} y2={axisY0} stroke={zeroColor} strokeDasharray="4 4" strokeWidth="1" />
        )}

        {/* y 目盛り・グリッド */}
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

        {/* x 目盛り */}
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

        {/* 折れ線 */}
        {series.map((s, idx) => {
          const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
          return <path key={s.name} d={d} fill="none" stroke={color(idx)} strokeWidth="2" />;
        })}

        {/* データ点（クリックでツールチップ。ここで伝播を止める） */}
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
                e.stopPropagation(); // SVG の onClick に届かないようにする
                setTooltip({ x: x(i), y: y(p.value), date: p.date_ymd, name: s.name, value: p.value });
              }}
            />
          ))
        )}

        {/* ツールチップ */}
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

        {/* 凡例 */}
        {series.map((s, idx) => (
          <g key={`lg-${s.name}`} transform={`translate(${pad + 8},${pad + 16 + idx * 18})`}>
            <rect width="12" height="2" y="7" fill={color(idx)} />
            <text x="18" y="10" fill="#334155" fontSize="12">
              {s.name}
            </text>
          </g>
        ))}
      </svg>

      <div className="muted" style={{ marginTop: 6 }}>
        単位: {unit}
        {tooltip && (
          <span style={{ marginLeft: 12 }}>
            • データポイントをクリックして詳細表示中
            <button className="link" style={{ marginLeft: 6, fontSize: 12 }} onClick={() => setTooltip(null)}>
              閉じる
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
