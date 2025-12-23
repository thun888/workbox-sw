import { registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { clientsClaim, skipWaiting } from 'workbox-core';

// CDN 资源缓存策略
registerRoute(
  ({ url }) => 
    url.origin === 'https://static.hzchu.top' || 
    url.origin === 'https://raw.hzchu.top' ||
    url.origin === 'https://emoticons.hzchu.top' ||
    url.origin === 'https://api.iconify.design',
  new CacheFirst({
    cacheName: 'cdn-resources',
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: 90 * 24 * 60 * 60, // 90 天
      }),
    ],
  })
);

// JS/CSS 资源缓存策略
registerRoute(
  ({ url, request }) => {
    const isJsOrCss = request.destination === 'script' || request.destination === 'style';
    const isTargetOrigin = url.origin === self.location.origin;
    return isJsOrCss && isTargetOrigin;
  },
  new StaleWhileRevalidate({
    cacheName: 'js-css-resources-local',
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 天
      }),
    ],
  })
);

// JS/CSS 资源缓存策略
registerRoute(
  ({ url, request }) => {
    const isJsOrCss = request.destination === 'script' || request.destination === 'style';
    const isTargetOrigin = 
      url.origin === 'https://artalk.hzchu.top' || 
      url.origin === 'https://sdk.jinrishici.com';
    return isJsOrCss && isTargetOrigin;
  },
  new CacheFirst({
    cacheName: 'js-css-resources-external',
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: 90 * 24 * 60 * 60, // 90 天
      }),
    ],
  })
);

// 立即激活
skipWaiting();
clientsClaim();

// 请求计数器
let totalRequests = 0;

self.addEventListener('fetch', (event) => {
  totalRequests++;
});

// API: 获取缓存统计信息
self.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'GET_CACHE_STATS') {
    const stats = await getCacheStats();
    event.ports[0].postMessage(stats);
  } else if (event.data && event.data.type === 'GET_REQUEST_COUNT') {
    event.ports[0].postMessage({ totalRequests });
  } else if (event.data && event.data.type === 'CLEAR_CACHE') {
    const result = await clearAllCaches();
    event.ports[0].postMessage(result);
  }
});

async function getCacheStats() {
  const cacheNames = await caches.keys();
  let totalSize = 0;
  let totalFiles = 0;
  const cacheDetails = [];

  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    let cacheSize = 0;

    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const blob = await response.blob();
        cacheSize += blob.size;
      }
    }

    totalSize += cacheSize;
    totalFiles += keys.length;

    cacheDetails.push({
      name: cacheName,
      files: keys.length,
      size: cacheSize,
    });
  }

  return {
    totalCaches: cacheNames.length,
    totalFiles,
    totalSize,
    cacheDetails,
    timestamp: new Date().toISOString()
  };
}

async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map(name => caches.delete(name)));
  totalRequests = 0;
  return { success: true, message: '所有缓存已清除' };
}
