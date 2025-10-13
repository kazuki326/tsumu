// src/NotificationSettings.jsx
import { useEffect, useState } from "react";
import { api } from "./api";

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
        alert("通知の許可が必要です");
        return;
      }

      // VAPID公開鍵取得
      const vapidRes = await api.getVapidPublicKey();
      if (vapidRes.error) {
        alert("VAPIDキーの取得に失敗しました");
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
        alert(`購読に失敗しました: ${res.error}`);
        return;
      }

      setSubscription(sub);
      alert("プッシュ通知を有効にしました");
    } catch (e) {
      console.error("[subscribe error]", e);
      alert(`エラーが発生しました: ${e.message}`);
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
      alert("プッシュ通知を無効にしました");
    } catch (e) {
      console.error("[unsubscribe error]", e);
      alert(`エラーが発生しました: ${e.message}`);
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
        alert(`設定の保存に失敗しました: ${res.error}`);
        return;
      }
      alert("設定を保存しました");
    } catch (e) {
      console.error("[update settings error]", e);
      alert(`エラーが発生しました: ${e.message}`);
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
        alert(`テスト通知の送信に失敗しました: ${res.error}`);
        return;
      }
      alert(`テスト通知を送信しました (成功: ${res.sent}, 失敗: ${res.failed})`);
    } catch (e) {
      console.error("[test notification error]", e);
      alert(`エラーが発生しました: ${e.message}`);
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
      <div className="card">
        <h2>通知設定</h2>
        <p className="muted">
          お使いのブラウザはプッシュ通知に対応していません。
        </p>
        {isIOS && !isInStandaloneMode && (
          <div style={{
            marginTop: 16,
            padding: 12,
            background: '#fef3c7',
            borderRadius: 8,
            fontSize: 14
          }}>
            <strong>📱 iPhoneでプッシュ通知を使うには：</strong>
            <ol style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20 }}>
              <li>Safari の共有ボタン（↑）をタップ</li>
              <li>「ホーム画面に追加」を選択</li>
              <li>追加したアプリアイコンから起動</li>
              <li>この画面で通知を有効にする</li>
            </ol>
            <p className="muted" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
              ※ iOS 16.4 以降が必要です
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <h2>通知設定</h2>

      <div style={{ marginBottom: 16 }}>
        <h3>プッシュ通知</h3>
        <p className="muted" style={{ fontSize: 14, marginBottom: 8 }}>
          ステータス: {subscription ? "有効" : "無効"} | 権限:{" "}
          {permission === "granted"
            ? "許可済み"
            : permission === "denied"
            ? "拒否"
            : "未設定"}
        </p>

        {!subscription ? (
          <button disabled={loading} onClick={handleSubscribe}>
            プッシュ通知を有効にする
          </button>
        ) : (
          <div className="row">
            <button disabled={loading} onClick={handleTestNotification}>
              テスト通知を送信
            </button>
            <button
              className="ghost"
              disabled={loading}
              onClick={handleUnsubscribe}
            >
              プッシュ通知を無効にする
            </button>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <h3>通知タイミング</h3>

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={settings.daily_reminder}
            onChange={(e) =>
              setSettings({ ...settings, daily_reminder: e.target.checked })
            }
          />
          <span>日次リマインダーを受け取る</span>
        </label>

        {settings.daily_reminder && (
          <div style={{ marginLeft: 24 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              通知時刻 (HH:mm形式)
            </label>
            <input
              type="time"
              value={settings.reminder_time}
              onChange={(e) =>
                setSettings({ ...settings, reminder_time: e.target.value })
              }
              style={{ maxWidth: 150 }}
            />
          </div>
        )}

        <button
          disabled={loading}
          onClick={handleUpdateSettings}
          style={{ marginTop: 8 }}
        >
          設定を保存
        </button>
      </div>

      <p className="muted" style={{ fontSize: 12 }}>
        通知: 日次リマインダーで「今日のコインを記録しましょう」と通知されます。
        <br />
        iOSの場合: ホーム画面に追加（PWA）してから通知を有効にしてください（iOS
        16.4+）
      </p>
    </div>
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
