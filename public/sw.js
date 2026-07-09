/* ─────────────────────────────────────────────────────────────
 * ManageMate Service Worker — Web Push 受信担当
 *
 * 役割:
 *   1. push イベント … サーバー（Edge Function / テストAPI）が送った
 *      ペイロードを受け取り、OS の通知として表示する。
 *      → デスクトップ通知・スマホのプッシュ通知はどちらもここを通る。
 *   2. notificationclick … 通知タップでアプリを前面化し、該当項目へ遷移。
 *
 * ペイロード形式（サーバーと一致させる）:
 *   { title, body, tag, url, itemId, badge, icon }
 * ───────────────────────────────────────────────────────────── */

self.addEventListener("install", (event) => {
  // 新しい SW を即座に有効化（更新を早く反映）
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { title: "ManageMate", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "ManageMate";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/badge-96.png",
    // tag が同じ通知は上書き（同一予定の重複表示を防ぐ）
    tag: data.tag || undefined,
    // 予定/期日の通知は残しておきたいので自動で消さない
    requireInteraction: data.requireInteraction === true,
    data: {
      url: data.url || "/",
      itemId: data.itemId || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // 既に開いているタブがあれば前面化
      for (const client of allClients) {
        if ("focus" in client) {
          client.postMessage({ type: "notification-click", url: targetUrl });
          return client.focus();
        }
      }
      // なければ新規に開く
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })()
  );
});
