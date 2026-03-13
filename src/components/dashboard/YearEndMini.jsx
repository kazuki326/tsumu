// src/components/dashboard/YearEndMini.jsx
// 年末予測のコンパクト表示（1日の稼ぎ・目標値を編集可能）

import { useMemo, useState } from "react";
import { Target, Pencil, Check, Flag } from "lucide-react";
import { Input } from "@/components/ui/input";

export function YearEndMini({ todayYmd, baseCoins, avgPerDay = 50000, onChangeAvg }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  // 目標値（localStorageで永続化）
  const [goalCoins, setGoalCoins] = useState(() => {
    const v = Number(localStorage.getItem("goalCoins") || 0);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  });
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");

  const { remainDays, projected } = useMemo(() => {
    const today = todayYmd || new Date().toISOString().slice(0, 10);
    const endDate = `${today.slice(0, 4)}-12-31`;
    const diff = Math.floor(
      (new Date(endDate + "T00:00:00Z") - new Date(today + "T00:00:00Z")) / 86400000
    );
    const remainDays = Math.max(0, diff + 1);
    const projected = (Number(baseCoins) || 0) + avgPerDay * remainDays;
    return { remainDays, projected };
  }, [todayYmd, baseCoins, avgPerDay]);

  // 目標に対する進捗と必要な1日あたりの稼ぎ
  const goalInfo = useMemo(() => {
    if (!goalCoins || goalCoins <= 0) return null;
    const current = Number(baseCoins) || 0;
    const progress = Math.min(100, Math.round((current / goalCoins) * 100));
    const remaining = Math.max(0, goalCoins - current);
    const requiredPerDay = remainDays > 0 ? Math.ceil(remaining / remainDays) : 0;
    const onTrack = projected >= goalCoins;
    return { progress, remaining, requiredPerDay, onTrack };
  }, [goalCoins, baseCoins, remainDays, projected]);

  const fmt = (n) => Number(n).toLocaleString();

  const startEdit = () => { setDraft(String(avgPerDay)); setEditing(true); };
  const commitEdit = () => {
    const v = Number(draft);
    if (Number.isFinite(v) && v >= 0) onChangeAvg?.(v);
    setEditing(false);
  };

  const startGoalEdit = () => { setGoalDraft(String(goalCoins || "")); setEditingGoal(true); };
  const commitGoalEdit = () => {
    const v = Number(goalDraft);
    if (Number.isFinite(v) && v >= 0) {
      setGoalCoins(v);
      localStorage.setItem("goalCoins", String(v));
    }
    setEditingGoal(false);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">年末予測</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          残り {fmt(remainDays)} 日
        </span>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs text-muted-foreground mb-1">12/31 見込み</div>
          <div className="text-2xl font-black tabular-nums">
            {fmt(projected)}
            <span className="text-base font-medium text-muted-foreground ml-1">枚</span>
          </div>
        </div>

        {/* 1日の稼ぎ（タップで編集） */}
        {editing ? (
          <div className="flex items-center gap-1.5">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); }}
              inputMode="numeric"
              autoFocus
              className="w-24 h-8 text-right text-sm"
            />
            <span className="text-xs text-muted-foreground">/日</span>
            <button
              onClick={commitEdit}
              className="p-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
          >
            <span>+{fmt(avgPerDay)}/日</span>
            <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
      </div>

      {/* 目標セクション */}
      <div className="mt-4 pt-3 border-t border-border">
        <div className="flex items-center gap-2 mb-2">
          <Flag className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">年末目標</span>
        </div>

        {editingGoal ? (
          <div className="flex items-center gap-1.5">
            <Input
              value={goalDraft}
              onChange={(e) => setGoalDraft(e.target.value.replace(/[^\d]/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") commitGoalEdit(); }}
              inputMode="numeric"
              autoFocus
              placeholder="目標枚数"
              className="flex-1 h-8 text-right text-sm"
            />
            <span className="text-xs text-muted-foreground">枚</span>
            <button
              onClick={commitGoalEdit}
              className="p-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : goalInfo ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <button
                onClick={startGoalEdit}
                className="text-sm font-semibold tabular-nums hover:text-primary transition-colors group flex items-center gap-1"
              >
                {fmt(goalCoins)}枚
                <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              <span className={`text-xs font-medium ${goalInfo.onTrack ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
                {goalInfo.onTrack ? "達成見込み" : "ペース不足"}
              </span>
            </div>
            <div className="h-1.5 bg-border/50 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${goalInfo.onTrack ? "bg-green-500" : "bg-amber-500"}`}
                style={{ width: `${goalInfo.progress}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>進捗 {goalInfo.progress}%</span>
              <span>必要: {fmt(goalInfo.requiredPerDay)}/日</span>
            </div>
          </div>
        ) : (
          <button
            onClick={startGoalEdit}
            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-lg hover:border-primary/50 transition-colors"
          >
            目標を設定する
          </button>
        )}
      </div>
    </div>
  );
}

export default YearEndMini;
