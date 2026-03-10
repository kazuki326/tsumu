// src/components/dashboard/YearEndMini.jsx
// 年末予測のコンパクト表示（1日の稼ぎを編集可能）

import { useMemo, useState } from "react";
import { Target, Pencil, Check } from "lucide-react";
import { Input } from "@/components/ui/input";

export function YearEndMini({ todayYmd, baseCoins, avgPerDay = 50000, onChangeAvg }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

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

  const yearProgress = useMemo(() => {
    const today = todayYmd || new Date().toISOString().slice(0, 10);
    const year = today.slice(0, 4);
    const start = new Date(`${year}-01-01T00:00:00Z`);
    const end = new Date(`${year}-12-31T00:00:00Z`);
    const now = new Date(today + "T00:00:00Z");
    const total = (end - start) / 86400000 + 1;
    const elapsed = (now - start) / 86400000 + 1;
    return Math.round((elapsed / total) * 100);
  }, [todayYmd]);

  const fmt = (n) => Number(n).toLocaleString();

  const startEdit = () => { setDraft(String(avgPerDay)); setEditing(true); };
  const commitEdit = () => {
    const v = Number(draft);
    if (Number.isFinite(v) && v >= 0) onChangeAvg?.(v);
    setEditing(false);
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

      {/* プログレスバー */}
      <div className="mt-3">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>年間進捗</span>
          <span>{yearProgress}%</span>
        </div>
        <div className="h-1.5 bg-border/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${yearProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default YearEndMini;
