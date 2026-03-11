// src/components/dashboard/RankingPreview.jsx
// 7日間ランキング - タブ切り替え（稼いだ額/増減/コイン数）

import { useState } from "react";
import { Trophy, ChevronRight, Coins, Crown, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

const MEDAL = ["🥇", "🥈", "🥉"];

// 日付をMM/DD形式にフォーマット
const formatDate = (ymd) => {
  if (!ymd) return "";
  const [, m, d] = ymd.split("-");
  return `${Number(m)}/${Number(d)}`;
};

const TAB_CONFIG = {
  earned: { label: "稼いだ額", icon: Wallet, unit: "枚", showPlus: true },
  period: { label: "増減", icon: TrendingUp, unit: "枚", showPlus: true },
  raw: { label: "コイン数", icon: Coins, unit: "枚", showPlus: false }
};

export function RankingPreview({ myName, boards = {}, periodDays = 7, periodEnd, onViewFull }) {
  const [activeTab, setActiveTab] = useState("earned");

  const board = boards[activeTab] || [];
  const config = TAB_CONFIG[activeTab];

  // 期間の開始日を計算
  const calcPeriodStart = (endYmd, days) => {
    if (!endYmd) return "";
    const [y, m, d] = endYmd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - (days - 1));
    return dt.toISOString().slice(0, 10);
  };

  const periodStart = calcPeriodStart(periodEnd, periodDays);
  const periodLabel = periodStart && periodEnd
    ? `${formatDate(periodStart)}〜${formatDate(periodEnd)}`
    : "";
  const myIndex = board.findIndex(
    (b) => b.name.toLowerCase() === myName?.toLowerCase()
  );
  const myRank = myIndex >= 0 ? myIndex + 1 : null;
  const totalPlayers = board.length;
  const myData = myIndex >= 0 ? board[myIndex] : null;

  const top1 = board[0] || null;
  const top3 = board.slice(0, 3);
  const fmt = (n) => Number(n).toLocaleString();

  // 自分がトップ3に入っているか
  const isMyRankInTop3 = myRank !== null && myRank <= 3;

  // 値のフォーマット（+記号付きかどうか）
  const formatValue = (val) => {
    const v = Number(val);
    if (config.showPlus && v > 0) return `+${fmt(v)}`;
    if (config.showPlus && v < 0) return fmt(v);
    return fmt(v);
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Trophy className="w-4 h-4 text-muted-foreground" />
          <span>
            {activeTab === "raw" ? "ランキング" : `${periodDays}日間ランキング`}
            {activeTab !== "raw" && periodLabel && (
              <span className="text-muted-foreground font-normal ml-1">（{periodLabel}）</span>
            )}
          </span>
        </h3>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onViewFull}>
          詳細
          <ChevronRight className="w-3 h-3" />
        </Button>
      </div>

      {/* タブ */}
      <div className="flex border-b border-border">
        {Object.entries(TAB_CONFIG).map(([key, { label, icon: Icon }]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors
              ${activeTab === key
                ? "text-foreground border-b-2 border-primary bg-secondary/50"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
              }`}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4">
        {/* 1位を強調表示 */}
        {top1 && (
          <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Crown className="w-5 h-5 text-amber-500" />
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                {activeTab === "raw" ? "コイン数" : `${periodDays}日間`}の1位
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🥇</span>
                <span className={`text-lg font-bold ${top1.name.toLowerCase() === myName?.toLowerCase() ? "text-amber-600 dark:text-amber-400" : ""}`}>
                  {top1.name}
                  {top1.name.toLowerCase() === myName?.toLowerCase() && (
                    <span className="ml-2 text-xs bg-amber-200 dark:bg-amber-800 px-2 py-0.5 rounded-full">あなた</span>
                  )}
                </span>
              </div>
              <div className="text-right">
                <div className="text-xl font-black tabular-nums text-amber-600 dark:text-amber-400">
                  {formatValue(top1.value)}
                </div>
                <div className="text-xs text-muted-foreground">{config.unit}</div>
              </div>
            </div>
          </div>
        )}

        {/* トップ3（2位・3位） */}
        {top3.length > 1 && (
          <div className="space-y-1.5">
            {top3.slice(1).map((entry, i) => {
              const rank = i + 2; // 2位から
              const isMe = entry.name.toLowerCase() === myName?.toLowerCase();
              const val = Number(entry.value);
              return (
                <div
                  key={entry.name}
                  className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                    isMe ? "bg-secondary" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base w-6 text-center">{MEDAL[rank - 1]}</span>
                    <span className={`text-sm ${isMe ? "font-bold" : ""}`}>
                      {entry.name}
                      {isMe && <span className="ml-1 text-xs text-muted-foreground">(あなた)</span>}
                    </span>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${
                    config.showPlus
                      ? (val >= 0 ? "text-success" : "text-danger")
                      : "text-foreground"
                  }`}>
                    {formatValue(val)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* 自分の順位（トップ3外の場合） */}
        {myRank !== null && myData && !isMyRankInTop3 && (
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between py-2 px-3 bg-secondary rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold w-6 text-center">#{myRank}</span>
                <div>
                  <span className="text-sm font-bold">{myName}</span>
                  <span className="ml-1 text-xs text-muted-foreground">(あなた)</span>
                  <div className="text-xs text-muted-foreground">{totalPlayers}人中</div>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-sm font-bold tabular-nums ${
                  config.showPlus
                    ? (Number(myData.value) >= 0 ? "text-success" : "text-danger")
                    : "text-foreground"
                }`}>
                  {formatValue(myData.value)}
                </span>
                <div className="text-xs text-muted-foreground">{config.unit}</div>
              </div>
            </div>
          </div>
        )}

        {totalPlayers === 0 && (
          <p className="text-muted-foreground text-sm text-center py-2">
            ランキングデータがありません
          </p>
        )}
      </div>
    </div>
  );
}

export default RankingPreview;
