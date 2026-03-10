// src/components/dashboard/QuickInput.jsx
// 今日のコイン入力CTA（コイン数、使った額、ガチャ回数）

import { useState } from "react";
import { PlusCircle, Check, ChevronDown, Sparkles, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const GACHA_COST = 30000; // 1回あたり3万コイン

/**
 * QuickInput - 今日のコイン入力フォーム
 * @param {string} todayYmd - 今日の日付（YYYY-MM-DD）
 * @param {boolean} canEdit - 編集可能か
 * @param {boolean} busy - 処理中か
 * @param {number} latestCoins - 最新のコイン数（ガチャのみ入力時に使用）
 * @param {function} onSubmit - 送信時のコールバック (coins: number, spent: number, gacha: number) => void
 */
export function QuickInput({ todayYmd, canEdit, busy, latestCoins = 0, onSubmit }) {
  const [coins, setCoins] = useState("");
  const [spent, setSpent] = useState("");
  const [gacha, setGacha] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [showSpent, setShowSpent] = useState(false);
  const [showGacha, setShowGacha] = useState(false);

  // コイン数が空でもガチャ回数があれば保存可能
  const canSubmit = coins !== "" || gacha > 0;

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!canEdit || busy || !canSubmit) return;
    // コイン数が空の場合は最新のコイン数を使用
    const n = coins === "" ? latestCoins : Number(coins);
    const s = Number(spent || 0);
    const g = Number(gacha || 0);
    if (Number.isInteger(n) && n >= 0 && Number.isInteger(s) && s >= 0 && Number.isInteger(g) && g >= 0) {
      onSubmit?.(n, s, g);
      setCoins("");
      setSpent("");
      setGacha(0);
      setExpanded(false);
      setShowSpent(false);
      setShowGacha(false);
    }
  };

  const adjustGacha = (delta) => {
    setGacha((prev) => Math.max(0, prev + delta));
  };

  if (!canEdit) {
    return (
      <div className="bg-muted/30 border border-border rounded-xl p-4 text-center">
        <p className="text-muted-foreground text-sm">
          本日（{todayYmd}）の入力は締切済みです（23:59）
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      {!expanded ? (
        <Button
          onClick={() => setExpanded(true)}
          className="w-full h-12 text-base font-semibold gap-2"
          size="lg"
        >
          <PlusCircle className="w-5 h-5" />
          今日のコインを記録
        </Button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="text-sm font-medium text-muted-foreground">
            今日: {todayYmd}（23:59まで更新可能）
          </div>

          {/* コイン数 */}
          <div className="space-y-1">
            <Label htmlFor="quick-coins" className="text-sm">
              今のコイン数
            </Label>
            <Input
              id="quick-coins"
              placeholder="例: 12345"
              value={coins}
              onChange={(e) => setCoins(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              autoFocus
              className="h-12 text-xl font-bold"
            />
          </div>

          {/* 使った額は隠しておく */}
          {!showSpent ? (
            <button
              type="button"
              onClick={() => setShowSpent(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className="w-3 h-3" />
              使った額も入力する
            </button>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="quick-spent" className="text-sm">
                使った額
              </Label>
              <Input
                id="quick-spent"
                placeholder="0"
                value={spent}
                onChange={(e) => setSpent(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                className="h-11 text-lg"
              />
            </div>
          )}

          {/* ガチャ回数は隠しておく */}
          {!showGacha ? (
            <button
              type="button"
              onClick={() => setShowGacha(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className="w-3 h-3" />
              <Sparkles className="w-3 h-3" />
              ガチャ回数も入力する
            </button>
          ) : (
            <div className="space-y-2">
              <Label className="text-sm flex items-center gap-1">
                <Sparkles className="w-4 h-4" />
                ガチャ回数（1回 = {(GACHA_COST).toLocaleString()}コイン）
              </Label>

              {/* ボタンで調整 */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => adjustGacha(-1)}
                  disabled={gacha <= 0}
                  className="h-9 w-9 p-0"
                >
                  <Minus className="w-4 h-4" />
                </Button>

                <Input
                  value={gacha}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^\d]/g, "");
                    setGacha(val === "" ? 0 : Number(val));
                  }}
                  inputMode="numeric"
                  className="h-9 w-16 text-center text-lg font-bold"
                />

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => adjustGacha(1)}
                  className="h-9 w-9 p-0"
                >
                  <Plus className="w-4 h-4" />
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => adjustGacha(10)}
                  className="h-9 px-3 text-sm bg-sky-100 hover:bg-sky-200 text-sky-700 dark:bg-sky-900 dark:hover:bg-sky-800 dark:text-sky-200"
                >
                  +10連
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setGacha(0)}
                  disabled={gacha <= 0}
                  className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
                  title="リセット"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>

              {gacha > 0 && (
                <p className="text-xs text-muted-foreground">
                  消費コイン: <span className="font-semibold text-foreground">{(gacha * GACHA_COST).toLocaleString()}</span> 枚
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={busy || !canSubmit}
              className="flex-1 h-11 gap-2"
            >
              <Check className="w-4 h-4" />
              保存
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setExpanded(false);
                setCoins("");
                setSpent("");
                setGacha(0);
                setShowSpent(false);
                setShowGacha(false);
              }}
              disabled={busy}
              className="h-11"
            >
              キャンセル
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export default QuickInput;
