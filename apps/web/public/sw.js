/*
 * Service Worker — Happy Home Thanh Hóa PWA (v1)
 *
 * Chiến lược an toàn cho app động + auth:
 *  - CHỈ xử lý request CÙNG ORIGIN, method GET. Mọi request khác (POST, hoặc
 *    cross-origin như API FastAPI ở AGENT_ENGINE_URL) → bỏ qua hoàn toàn,
 *    để trình duyệt tự xử lý → KHÔNG bao giờ cache nhầm dữ liệu động/bảo mật.
 *  - Điều hướng (navigate) → network-first, fallback cache, cuối cùng /offline.
 *  - Static assets cùng origin (_next/static, /icons, ảnh, css, js, font)
 *    → stale-while-revalidate.
 *  - Tuyệt đối KHÔNG cache đường dẫn /api (phòng trường hợp sau này có proxy).
 *
 * Push notification: CHƯA bật ở v1. Hạ tầng listener để sẵn ở cuối file,
 * khi cần chỉ việc bỏ comment + cấu hình VAPID phía backend.
 */

const VERSION = "hhth-v1";
const APP_SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const OFFLINE_URL = "/offline";

// App shell precache tối thiểu — luôn có sẵn khi offline.
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-maskable.svg",
  "/icons/apple-touch-icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Cho phép trang gọi skipWaiting để cập nhật SW ngay.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/hh-assets/") ||
    /\.(?:css|js|woff2?|ttf|otf|png|jpg|jpeg|gif|webp|svg|ico)$/i.test(
      url.pathname,
    )
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Chỉ xử lý GET cùng origin.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // bỏ qua cross-origin (API)
  if (url.pathname.startsWith("/api")) return; // không đụng API động

  // Điều hướng trang → network-first, fallback cache rồi /offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(RUNTIME_CACHE)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || (await caches.match(OFFLINE_URL));
        }),
    );
    return;
  }

  // Static assets → stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches
              .open(RUNTIME_CACHE)
              .then((cache) => cache.put(request, copy))
              .catch(() => {});
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
  // Mọi GET cùng origin còn lại: để mặc định trình duyệt xử lý.
});

/*
 * ===== PUSH NOTIFICATION (CHƯA BẬT — v1) =====
 * Khi muốn bật ở v2:
 *  1. Backend phát hành VAPID key, FE đăng ký pushManager.subscribe({...}).
 *  2. Bỏ comment 2 listener dưới đây.
 *
 * self.addEventListener("push", (event) => {
 *   const data = event.data ? event.data.json() : {};
 *   event.waitUntil(
 *     self.registration.showNotification(data.title || "Happy Home Thanh Hóa", {
 *       body: data.body || "",
 *       icon: "/icons/icon.svg",
 *       badge: "/icons/icon.svg",
 *       data: data.url || "/",
 *     }),
 *   );
 * });
 *
 * self.addEventListener("notificationclick", (event) => {
 *   event.notification.close();
 *   event.waitUntil(self.clients.openWindow(event.notification.data || "/"));
 * });
 */
