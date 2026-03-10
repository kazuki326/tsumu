// src/NotificationSettings.jsx
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "./api";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function NotificationSettings() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState("default");
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(false);

  const [settings, setSettings] = useState({
    daily_reminder: false,
    reminder_time: "20:00",
  });

  // 通知サポート確認
  useEffect(() => {
    const isSupported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(isSupported);
    if (isSupported) {
      setPermission(Notification.permission);
    }
  }, []);

  // Service Worker登録
  useEffect(() => {
    if (!supported) return;
    (async () => {
      try {
        const swPath = import.meta.env.BASE_URL + "sw.js";
        const registration = await navigator.serviceWorker.register(swPath);
        console.log("[SW] registered", registration);

        // 既存の購読を確認
        const sub = await registration.pushManager.getSubscription();
        setSubscription(sub);
      } catch (e) {
        console.error("[SW] registration failed", e);
      }
    })();
  }, [supported]);

  // 設定読み込み
  useEffect(() => {
    (async () => {
      const s = await api.getNotificationSettings();
      if (!s?.error) {
        setSettings({
          daily_reminder: s.daily_reminder || false,
          reminder_time: s.reminder_time || "20:00",
        });
      }
    })();
  }, []);

  // プッシュ通知購読
  const handleSubscribe = async () => {
    setLoading(true);
    try {
      // 通知許可をリクエスト
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        toast.error("通知の許可が必要です");
        return;
      }

      // VAPID公開鍵取得
      const vapidRes = await api.getVapidPublicKey();
      if (vapidRes.error) {
        toast.error("VAPIDキーの取得に失敗しました");
        return;
      }

      // Service Worker取得
      const registration = await navigator.serviceWorker.ready;

      // プッシュ購読
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidRes.publicKey),
      });

      // サーバーに送信
      const res = await api.subscribeNotifications({
        endpoint: sub.endpoint,
        keys: {
          p256dh: arrayBufferToBase64(sub.getKey("p256dh")),
          auth: arrayBufferToBase64(sub.getKey("auth")),
        },
      });

      if (res.error) {
        toast.error(`購読に失敗しました: ${res.error}`);
        return;
      }

      setSubscription(sub);
      toast.success("プッシュ通知を有効にしました");
    } catch (e) {
      console.error("[subscribe error]", e);
      toast.error(`エラーが発生しました: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // プッシュ通知購読解除
  const handleUnsubscribe = async () => {
    if (!subscription) return;
    setLoading(true);
    try {
      await api.unsubscribeNotifications(subscription.endpoint);
      await subscription.unsubscribe();
      setSubscription(null);
      toast.success("プッシュ通知を無効にしました");
    } catch (e) {
      console.error("[unsubscribe error]", e);
      toast.error(`エラーが発生しました: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 設定更新
  const handleUpdateSettings = async () => {
    setLoading(true);
    try {
      const res = await api.updateNotificationSettings(settings);
      if (res.error) {
        toast.error(`設定の保存に失敗しました: ${res.error}`);
        return;
      }
      toast.success("設定を保存しました");
    } catch (e) {
      console.error("[update settings error]", e);
      toast.error(`エラーが発生しました: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // テスト通知送信
  const handleTestNotification = async () => {
    setLoading(true);
    try {
      const res = await api.testNotification();
      if (res.error) {
        toast.error(`テスト通知の送信に失敗しました: ${res.error}`);
        return;
      }
      toast.success(`テスト通知を送信しました (成功: ${res.sent}, 失敗: ${res.failed})`);
    } catch (e) {
      console.error("[test notification error]", e);
      toast.error(`エラーが発生しました: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!supported) {
    // iOSのSafariかどうかを判定
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;

    return (
      <Card className="p-4">
        <h2 className="text-lg font-bold mb-4">通知設定</h2>
        <p className="text-muted-foreground text-sm">
          お使いのブラウザはプッシュ通知に対応していません。
        </p>
        {isIOS && !isInStandaloneMode && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950 rounded-xl text-sm">
            <strong className="block mb-2">iPhoneでプッシュ通知を使うには：</strong>
            <ol className="list-decimal ml-5 space-y-1">
              <li>Safari の共有ボタン（↑）をタップ</li>
              <li>「ホーム画面に追加」を選択</li>
              <li>追加したアプリアイコンから起動</li>
              <li>この画面で通知を有効にする</li>
            </ol>
            <p className="text-muted-foreground text-xs mt-2">
              ※ iOS 16.4 以降が必要です
            </p>
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h2 className="text-lg font-bold mb-4">通知設定</h2>

      {/* プッシュ通知セクション */}
      <div className="mb-6">
        <h3 className="text-base font-bold mb-3">プッシュ通知</h3>
        <div className="flex flex-wrap gap-4 text-sm mb-3">
          <span>ステータス: <strong>{subscription ? "有効" : "無効"}</strong></span>
          <span>権限: <strong>
            {permission === "granted" ? "許可済み" : permission === "denied" ? "拒否" : "未設定"}
          </strong></span>
        </div>

        {!subscription ? (
          <Button disabled={loading} onClick={handleSubscribe}>
            プッシュ通知を有効にする
          </Button>
        ) : (
          <div className="flex flex-col md:flex-row gap-2">
            <Button disabled={loading} onClick={handleTestNotification}>
              テスト通知を送信
            </Button>
            <Button
              variant="ghost"
              disabled={loading}
              onClick={handleUnsubscribe}
            >
              プッシュ通知を無効にする
            </Button>
          </div>
        )}
      </div>

      {/* 通知タイミングセクション */}
      <div className="mb-6">
        <h3 className="text-base font-bold mb-3">通知タイミング</h3>

        <div className="flex items-center justify-between gap-3 mb-3">
          <Label className="flex-1 font-semibold">日次リマインダーを受け取る</Label>
          <Switch
            checked={settings.daily_reminder}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, daily_reminder: checked })
            }
          />
        </div>

        {settings.daily_reminder && (
          <div className="bg-secondary/50 rounded-xl p-3 mb-3">
            <Label className="block text-sm text-muted-foreground mb-2">通知時刻</Label>
            <select
              value={settings.reminder_time}
              onChange={(e) =>
                setSettings({ ...settings, reminder_time: e.target.value })
              }
              className="w-full max-w-[200px] px-3 py-2 text-base rounded-xl border border-input bg-background"
            >
              <option value="18:00">18:00 (午後6時)</option>
              <option value="19:00">19:00 (午後7時)</option>
              <option value="20:00">20:00 (午後8時)</option>
              <option value="21:00">21:00 (午後9時)</option>
              <option value="22:00">22:00 (午後10時)</option>
              <option value="23:00">23:00 (午後11時)</option>
              <option value="00:00">24:00 (深夜0時)</option>
            </select>
          </div>
        )}

        <Button
          disabled={loading}
          onClick={handleUpdateSettings}
          className="w-full"
        >
          設定を保存
        </Button>
      </div>

      <p className="text-muted-foreground text-xs mt-4">
        日次リマインダーで「今日のコインを記録しましょう」と通知されます。
        <br />
        iOSの場合: ホーム画面に追加（PWA）してから通知を有効にしてください（iOS 16.4+）
      </p>
    </Card>
  );
}

// ユーティリティ関数
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
