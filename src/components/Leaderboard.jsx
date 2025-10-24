// src/components/Leaderboard.jsx
// 全体ランキング：タブ4種のみ（コイン数/前日比/7日/30日）
// ・コイン数タブは「グラフ無し」＝スナップショットの棒バーのみ
// ・その他タブは「上：折れ線グラフ／下：スナップショットの棒バー」
// ・グラフ内の点をクリックでツールチップ表示、背景クリックで閉じる

import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

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
    <div>
      {/* ステータス行（右側ステータスのみ） */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          {stale && <span>更新中...</span>}
        </div>
      </div>

      {/* 指標タブ（4つのみ） */}
      <div className="tabs" role="tablist" aria-label="ランキング指標の切り替え">
        <button className={`tab ${boardTab === "raw" ? "active" : ""}`}   role="tab" aria-selected={boardTab==="raw"}   onClick={() => setBoardTab("raw")}>コイン数</button>
        <button className={`tab ${boardTab === "daily" ? "active" : ""}`} role="tab" aria-selected={boardTab==="daily"} onClick={() => setBoardTab("daily")}>前日比</button>
        <button className={`tab ${boardTab === "7d" ? "active" : ""}`}    role="tab" aria-selected={boardTab==="7d"}    onClick={() => setBoardTab("7d")}>7日間増減</button>
        <button className={`tab ${boardTab === "30d" ? "active" : ""}`}   role="tab" aria-selected={boardTab==="30d"}   onClick={() => setBoardTab("30d")}>30日間増減</button>
      </div>

      {/* 本体 */}
      {isRaw ? (
        // コイン数タブ：スナップショットの棒バーのみ
        <RankListAndBars data={board} unit={labelForTab(boardTab)} />
      ) : (
        <>
          <div style={{ marginTop: 4 }}>
            {loading ? (
              <p className="muted">グラフを読み込み中…</p>
            ) : series.length === 0 ? (
              <p className="muted">グラフ用のデータがありません</p>
            ) : (
              <LineChartWithDismiss series={series} unit={labelForTab(boardTab)} />
            )}
          </div>

          {/* スナップショット棒バー（下） */}
          <div className="subcard" style={{ marginTop: 16 }}>
            <h4 style={{ margin: "0 0 8px 0", fontSize: 14, color: "var(--muted)" }}>
              ランキング（現時点スナップショット）
            </h4>
            <RankListAndBars data={board} unit={labelForTab(boardTab)} />
          </div>
        </>
      )}

      <p className="muted" style={{ marginTop: 16 }}>
        基準日: {boardDate || "取得中…"}
        {isProvisional ? "（今日・暫定）" : "（締切済み日の集計）"}
      </p>
    </div>
  );
}

/* ========= sub components ========= */

function labelForTab(tab) {
  if (tab === "raw") return "枚";
  if (tab === "daily") return "枚（前日比）";
  if (tab === "7d") return "枚/7日";
  if (tab === "30d") return "枚/30日";
  return "枚";
}

function RankListAndBars({ data, unit }) {
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(Number(d.value) || 0)));
  return (
    <div className="rank-wrap">
      <ol className="rank-list">
        {data.map((b, i) => {
          const val = Number(b.value) || 0;
          const width = (Math.abs(val) / maxAbs) * 100;
          const isPos = val >= 0;
          return (
            <li key={`${b.name}-${i}`}>
              <span className="rank-name">
                {i + 1}. {b.name}
              </span>
              <b className={`rank-value ${isPos ? "pos" : "neg"}`}>
                {val.toLocaleString()} {unit}
              </b>
              <div className="bar">
                <div
                  className="bar-fill"
                  style={{ width: `${width}%`, background: isPos ? undefined : "var(--ng)" }}
                />
              </div>
            </li>
          );
        })}
        {data.length === 0 && <li style={{ opacity: 0.6 }}>まだデータがありません</li>}
      </ol>
    </div>
  );
}

/* ========= chart (with click-away to dismiss tooltip) ========= */

function LineChartWithDismiss({ series, unit }) {
  // 背景クリックでツールチップを閉じるため、ここで保持
  const [tooltip, setTooltip] = useState(null);
  return (
    <div
      className="chart-card"
      style={{ width: "100%", overflowX: "auto", position: "relative" }}
      onClick={() => setTooltip(null)} // ラッパークリックで閉じる
    >
      <LineChart series={series} unit={unit} tooltip={tooltip} setTooltip={setTooltip} />
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
      style={{ width: "100%", height: "auto", background: "#fff", borderRadius: 10 }}
      onClick={(e) => {
        // SVG・軸・線など背景っぽい所をクリック → ツールチップ閉じる
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
              e.stopPropagation(); // 背景クリック扱いにしない
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
