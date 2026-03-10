// src/components/dashboard/KPICard.jsx
// KPI カード: 4つの主要指標を2x2グリッドで表示
// 色は数値の意味（+/-）だけに使い、背景はニュートラル

import { TrendingUp, TrendingDown, Coins, Calendar } from "lucide-react";

function KPITile({ label, value, format = "number", icon }) {
  const isDiff = format === "diff";
  const isPositive = value >= 0;

  // 値のテキスト色だけ変える（背景は全て統一）
  const valueClass = isDiff
    ? isPositive
      ? "text-success"
      : "text-danger"
    : "text-foreground";

  const iconClass = isDiff
    ? isPositive
      ? "text-success"
      : "text-danger"
    : "text-muted-foreground";

  const displayValue = isDiff
    ? `${isPositive ? "+" : ""}${value.toLocaleString()}`
    : value.toLocaleString();

  return (
    <div className="bg-card rounded-xl p-4 border border-border min-h-[88px] flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        {icon && <span className={iconClass}>{icon}</span>}
      </div>
      <div className={`text-2xl font-black tabular-nums ${valueClass}`}>
        {displayValue}
      </div>
    </div>
  );
}

export function KPICard({ currentCoins = 0, dailyDiff = 0, sum7 = 0, sum30 = 0 }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <KPITile
        label="現在のコイン"
        value={currentCoins}
        format="number"
        icon={<Coins className="w-4 h-4" />}
      />
      <KPITile
        label="前日比"
        value={dailyDiff}
        format="diff"
        icon={dailyDiff >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
      />
      <KPITile
        label="7日間"
        value={sum7}
        format="diff"
        icon={<Calendar className="w-4 h-4" />}
      />
      <KPITile
        label="30日間"
        value={sum30}
        format="diff"
        icon={<Calendar className="w-4 h-4" />}
      />
    </div>
  );
}

export default KPICard;
