// src/components/dashboard/MiniChart.jsx
// 14日間のコイン推移チャート（タップで詳細表示）

import { useState, useRef, useEffect } from "react";
import { ChevronRight, TrendingUp, TrendingDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MiniChart({ data = [], onExpand }) {
  const chartData = data.slice(0, 14).reverse();
  const [activeIndex, setActiveIndex] = useState(null);
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

  if (chartData.length < 2) {
    return (
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          コイン推移
        </h3>
        <p className="text-muted-foreground text-sm text-center py-4">
          データが2日以上必要です
        </p>
      </div>
    );
  }

  const values = chartData.map((r) => Number(r.coins));
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;
  const padding = range * 0.15;

  const W = containerWidth, H = 160, padX = 4, padY = 10;
  const chartW = W - padX * 2, chartH = H - padY * 2;

  const x = (i) => (i / Math.max(1, values.length - 1)) * chartW + padX;
  const y = (v) => {
    const t = (v - (minV - padding)) / (range + padding * 2);
    return H - padY - t * chartH;
  };

  // 滑らかな曲線パス（カーブ）
  const curvedPath = values.map((v, i) => {
    if (i === 0) return `M ${x(i)},${y(v)}`;
    const prevX = x(i - 1), prevY = y(values[i - 1]);
    const currX = x(i), currY = y(v);
    const cpX = (prevX + currX) / 2;
    return `C ${cpX},${prevY} ${cpX},${currY} ${currX},${currY}`;
  }).join(" ");

  const areaPath = `M ${x(0)},${H - padY} L ${x(0)},${y(values[0])} ${values.slice(1).map((v, i) => {
    const prevX = x(i), prevY = y(values[i]);
    const currX = x(i + 1), currY = y(v);
    const cpX = (prevX + currX) / 2;
    return `C ${cpX},${prevY} ${cpX},${currY} ${currX},${currY}`;
  }).join(" ")} L ${x(values.length - 1)},${H - padY} Z`;

  const firstDate = chartData[0]?.date_ymd?.slice(5) || "";
  const lastDate = chartData[chartData.length - 1]?.date_ymd?.slice(5) || "";
  const trend = values[values.length - 1] - values[0];
  const trendPercent = values[0] > 0 ? ((trend / values[0]) * 100).toFixed(1) : 0;
  const isUp = trend >= 0;

  // アクティブなデータポイントの情報
  const activeData = activeIndex !== null ? chartData[activeIndex] : null;
  const activeValue = activeIndex !== null ? values[activeIndex] : null;
  const activeDiff = activeIndex !== null && activeIndex > 0
    ? values[activeIndex] - values[activeIndex - 1]
    : null;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          {isUp ? (
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          ) : (
            <TrendingDown className="w-4 h-4 text-rose-500" />
          )}
          コイン推移
        </h3>
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
              <p className="text-lg font-bold tabular-nums">{activeValue?.toLocaleString()} 枚</p>
            </div>
            <div className="text-right">
              {activeDiff !== null && (
                <p className={`text-sm font-semibold ${activeDiff >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {activeDiff >= 0 ? "+" : ""}{activeDiff.toLocaleString()}
                </p>
              )}
              {activeData.gacha > 0 && (
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
              <p className="text-xs text-muted-foreground">14日間の推移</p>
              <p className="text-lg font-bold tabular-nums">{values[values.length - 1]?.toLocaleString()} 枚</p>
            </div>
            <div className={`text-right ${isUp ? "text-emerald-500" : "text-rose-500"}`}>
              <p className="text-sm font-bold">
                {isUp ? "+" : ""}{trend.toLocaleString()}
              </p>
              <p className="text-xs">
                ({isUp ? "+" : ""}{trendPercent}%)
              </p>
            </div>
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
              <stop offset="0%" stopColor={isUp ? "#10b981" : "#f43f5e"} stopOpacity="0.25" />
              <stop offset="100%" stopColor={isUp ? "#10b981" : "#f43f5e"} stopOpacity="0.02" />
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
              {/* タッチ/クリック領域（透明な大きい円） */}
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
              {/* 表示用の小さい円 */}
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

          {/* アクティブポイントの垂直線 */}
          {activeIndex !== null && (
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
