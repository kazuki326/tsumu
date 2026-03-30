// src/components/dashboard/MiniChart.jsx
// 14日間のコイン推移・ガチャ回数チャート（タブ切り替え）

import { useState, useRef, useEffect } from "react";
import { ChevronRight, TrendingUp, Sparkles, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MiniChart({ data = [], onExpand }) {
  const chartData = data.slice(0, 14).reverse();
  const [activeIndex, setActiveIndex] = useState(null);
  const [chartMode, setChartMode] = useState("coins"); // "coins" or "gacha"
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(320);

  // コンテナ幅を監視
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);

    return () => observer.disconnect();
  }, []);

  // タブ切り替え時にactiveIndexをリセット
  useEffect(() => {
    setActiveIndex(null);
  }, [chartMode]);

  if (chartData.length < 2) {
    return (
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          推移チャート
        </h3>
        <p className="text-muted-foreground text-sm text-center py-4">
          データが2日以上必要です
        </p>
      </div>
    );
  }

  // コインモード用の値
  const coinValues = chartData.map((r) => Number(r.coins));
  const coinMin = Math.min(...coinValues);
  const coinMax = Math.max(...coinValues);
  const coinRange = coinMax - coinMin || 1;
  const coinTrend = coinValues[coinValues.length - 1] - coinValues[0];
  const coinTrendPercent = coinValues[0] > 0 ? ((coinTrend / coinValues[0]) * 100).toFixed(1) : 0;
  const coinIsUp = coinTrend >= 0;

  // ガチャモード用の値
  const gachaValues = chartData.map((r) => Number(r.gacha) || 0);
  const gachaTotal = gachaValues.reduce((a, b) => a + b, 0);
  const gachaMax = Math.max(...gachaValues, 1);

  // 現在のモードに応じた値
  const isCoinsMode = chartMode === "coins";
  const values = isCoinsMode ? coinValues : gachaValues;
  const minV = isCoinsMode ? coinMin : 0;
  const maxV = isCoinsMode ? coinMax : gachaMax;
  const range = maxV - minV || 1;
  const padding = range * 0.15;
  const isUp = isCoinsMode ? coinIsUp : gachaTotal > 0;

  const W = containerWidth, H = 160, padX = 4, padY = 10;
  const chartW = W - padX * 2, chartH = H - padY * 2;

  const x = (i) => (i / Math.max(1, values.length - 1)) * chartW + padX;
  const y = (v) => {
    const t = (v - (minV - padding)) / (range + padding * 2);
    return H - padY - t * chartH;
  };

  // コインモード: 滑らかな曲線パス、ガチャモード: 棒グラフ
  const curvedPath = isCoinsMode ? values.map((v, i) => {
    if (i === 0) return `M ${x(i)},${y(v)}`;
    const prevX = x(i - 1), prevY = y(values[i - 1]);
    const currX = x(i), currY = y(v);
    const cpX = (prevX + currX) / 2;
    return `C ${cpX},${prevY} ${cpX},${currY} ${currX},${currY}`;
  }).join(" ") : "";

  const areaPath = isCoinsMode ? `M ${x(0)},${H - padY} L ${x(0)},${y(values[0])} ${values.slice(1).map((v, i) => {
    const prevX = x(i), prevY = y(values[i]);
    const currX = x(i + 1), currY = y(v);
    const cpX = (prevX + currX) / 2;
    return `C ${cpX},${prevY} ${cpX},${currY} ${currX},${currY}`;
  }).join(" ")} L ${x(values.length - 1)},${H - padY} Z` : "";

  const firstDate = chartData[0]?.date_ymd?.slice(5) || "";
  const lastDate = chartData[chartData.length - 1]?.date_ymd?.slice(5) || "";

  // アクティブなデータポイントの情報
  const activeData = activeIndex !== null ? chartData[activeIndex] : null;
  const activeValue = activeIndex !== null ? values[activeIndex] : null;
  const activeDiff = isCoinsMode && activeIndex !== null && activeIndex > 0
    ? values[activeIndex] - values[activeIndex - 1]
    : null;

  // ガチャモードの棒グラフ用
  const barWidth = Math.max(4, (chartW / values.length) * 0.6);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* ヘッダー + タブ */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setChartMode("coins")}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              isCoinsMode
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Coins className="w-3 h-3" />
            コイン
          </button>
          <button
            onClick={() => setChartMode("gacha")}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              !isCoinsMode
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="w-3 h-3" />
            ガチャ
          </button>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onExpand}>
          詳細
          <ChevronRight className="w-3 h-3" />
        </Button>
      </div>

      {/* アクティブポイント情報 or サマリー */}
      <div className="px-4 pb-2 min-h-[48px]">
        {activeData ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{activeData.date_ymd}</p>
              <p className="text-lg font-bold tabular-nums">
                {isCoinsMode
                  ? `${activeValue?.toLocaleString()} 枚`
                  : `${activeValue} 回`}
              </p>
            </div>
            <div className="text-right">
              {isCoinsMode && activeDiff !== null && (
                <p className={`text-sm font-semibold ${activeDiff >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {activeDiff >= 0 ? "+" : ""}{activeDiff.toLocaleString()}
                </p>
              )}
              {isCoinsMode && activeData.gacha > 0 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                  <Sparkles className="w-3 h-3" />
                  ガチャ {activeData.gacha}回
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">14日間の{isCoinsMode ? "推移" : "合計"}</p>
              <p className="text-lg font-bold tabular-nums">
                {isCoinsMode
                  ? `${coinValues[coinValues.length - 1]?.toLocaleString()} 枚`
                  : `${gachaTotal} 回`}
              </p>
            </div>
            {isCoinsMode ? (
              <div className={`text-right ${coinIsUp ? "text-emerald-500" : "text-rose-500"}`}>
                <p className="text-sm font-bold">
                  {coinIsUp ? "+" : ""}{coinTrend.toLocaleString()}
                </p>
                <p className="text-xs">
                  ({coinIsUp ? "+" : ""}{coinTrendPercent}%)
                </p>
              </div>
            ) : (
              <div className="text-right text-violet-500">
                <p className="text-sm font-bold flex items-center gap-1 justify-end">
                  <Sparkles className="w-3 h-3" />
                  {gachaTotal > 0 ? `${gachaTotal}回` : "なし"}
                </p>
                <p className="text-xs text-muted-foreground">
                  平均 {(gachaTotal / chartData.length).toFixed(1)}回/日
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* チャート */}
      <div className="pb-1" ref={containerRef}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none"
          style={{ height: "140px" }}
          onMouseLeave={() => setActiveIndex(null)}
          onTouchEnd={() => setActiveIndex(null)}
        >
          <defs>
            <linearGradient id="miniAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={isCoinsMode ? (isUp ? "#10b981" : "#f43f5e") : "#8b5cf6"} stopOpacity="0.25" />
              <stop offset="100%" stopColor={isCoinsMode ? (isUp ? "#10b981" : "#f43f5e") : "#8b5cf6"} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* グリッドライン */}
          {[0, 0.5, 1].map((t) => (
            <line
              key={t}
              x1={padX}
              y1={padY + t * chartH}
              x2={W - padX}
              y2={padY + t * chartH}
              stroke="currentColor"
              strokeOpacity="0.06"
              strokeWidth="1"
            />
          ))}

          {isCoinsMode ? (
            <>
              {/* エリア */}
              <path d={areaPath} fill="url(#miniAreaGrad)" />

              {/* ライン */}
              <path
                d={curvedPath}
                fill="none"
                stroke={isUp ? "#10b981" : "#f43f5e"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* データポイント（インタラクティブ） */}
              {values.map((v, i) => (
                <g key={i}>
                  <circle
                    cx={x(i)}
                    cy={y(v)}
                    r="16"
                    fill="transparent"
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setActiveIndex(i)}
                    onTouchStart={() => setActiveIndex(i)}
                    onClick={() => setActiveIndex(i)}
                  />
                  <circle
                    cx={x(i)}
                    cy={y(v)}
                    r={activeIndex === i ? 6 : i === values.length - 1 ? 4 : 2.5}
                    fill={activeIndex === i ? (isUp ? "#10b981" : "#f43f5e") : "hsl(var(--card))"}
                    stroke={isUp ? "#10b981" : "#f43f5e"}
                    strokeWidth={activeIndex === i ? 3 : 2}
                    style={{ transition: "r 0.15s ease" }}
                  />
                </g>
              ))}
            </>
          ) : (
            <>
              {/* ガチャ棒グラフ */}
              {values.map((v, i) => {
                const barHeight = v > 0 ? Math.max(4, (v / gachaMax) * (chartH - 10)) : 0;
                const barX = x(i) - barWidth / 2;
                const barY = H - padY - barHeight;

                return (
                  <g key={i}>
                    {/* 棒 */}
                    <rect
                      x={barX}
                      y={barY}
                      width={barWidth}
                      height={barHeight}
                      rx="2"
                      fill={activeIndex === i ? "#7c3aed" : "#8b5cf6"}
                      opacity={activeIndex === i ? 1 : 0.7}
                      style={{ cursor: "pointer", transition: "opacity 0.15s" }}
                      onMouseEnter={() => setActiveIndex(i)}
                      onTouchStart={() => setActiveIndex(i)}
                      onClick={() => setActiveIndex(i)}
                    />
                    {/* タッチ領域 */}
                    <rect
                      x={barX - 8}
                      y={padY}
                      width={barWidth + 16}
                      height={chartH}
                      fill="transparent"
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => setActiveIndex(i)}
                      onTouchStart={() => setActiveIndex(i)}
                      onClick={() => setActiveIndex(i)}
                    />
                    {/* 値ラベル（0より大きい場合） */}
                    {v > 0 && activeIndex === i && (
                      <text
                        x={x(i)}
                        y={barY - 4}
                        textAnchor="middle"
                        fill="#7c3aed"
                        fontSize="11"
                        fontWeight="600"
                      >
                        {v}
                      </text>
                    )}
                  </g>
                );
              })}
            </>
          )}

          {/* アクティブポイントの垂直線（コインモードのみ） */}
          {isCoinsMode && activeIndex !== null && (
            <line
              x1={x(activeIndex)}
              y1={padY}
              x2={x(activeIndex)}
              y2={H - padY}
              stroke={isUp ? "#10b981" : "#f43f5e"}
              strokeWidth="1"
              strokeDasharray="4 4"
              strokeOpacity="0.5"
            />
          )}
        </svg>
      </div>

      {/* 日付ラベル */}
      <div className="flex justify-between items-center px-4 pb-3 text-xs text-muted-foreground">
        <span>{firstDate}</span>
        <span className="text-xs">タップで詳細</span>
        <span>{lastDate}</span>
      </div>
    </div>
  );
}

export default MiniChart;
