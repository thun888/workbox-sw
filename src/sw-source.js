import { registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { clientsClaim, skipWaiting } from 'workbox-core';
import { getConfig } from './db-utils.js';

// 默认配置
let configCache = {
  bestFormat: 'avif',
  fastestNode: 'https://onep.hzchu.top'
};

// 预热：SW 启动时先读一次数据库
async function initConfig() {
  const image_opt_best_format = await getConfig('image_opt_best_format');
  if (image_opt_best_format) {
    configCache.bestFormat = image_opt_best_format;
  }

  const image_opt_fastest_node_raw = await getConfig('image_opt_fastest_node');
  if (image_opt_fastest_node_raw) {
    try {
      const image_opt_fastest_node = typeof image_opt_fastest_node_raw === 'string' 
        ? JSON.parse(image_opt_fastest_node_raw) 
        : image_opt_fastest_node_raw;
      if (image_opt_fastest_node && image_opt_fastest_node.link) {
        configCache.fastestNode = image_opt_fastest_node.link;
        // console.log('Loaded fastest node from DB:', configCache.fastestNode);
      }
    } catch (e) {
      console.error('Failed to parse fastest node config:', e);
    }
  }
}
const initPromise = initConfig();


registerRoute(
  ({ url, request }) => {
    return request.destination === 'image' && 
           (url.origin === 'https://onep.hzchu.top' || url.search.includes('fmt='));
  },
  async ({ url, request, event }) => {
    try {
      await initPromise; // 确保配置已加载
      let targetUrl = new URL(url.href);

      // 1. 域名替换
      if (targetUrl.origin === 'https://onep.hzchu.top') {
        try {
          const newBase = new URL(configCache.fastestNode);
          targetUrl.host = newBase.host;
          targetUrl.protocol = newBase.protocol;
        } catch (e) {
          console.warn('Invalid fastestNode URL:', configCache.fastestNode, e);
          // 使用默认值继续
        }
      }

      // 2. 格式改写
      const fmt = targetUrl.searchParams.get('fmt');
      if (fmt && fmt !== configCache.bestFormat) {
        targetUrl.searchParams.set('fmt', configCache.bestFormat);
      }

      const strategy = new CacheFirst({
        cacheName: 'optimized-images-v2',
        plugins: [
          new ExpirationPlugin({ maxAgeSeconds: 12 * 60 * 60 }),
          {
            // 允许缓存不透明响应
            cacheWillUpdate: async ({response}) => {
              if (response.status === 0 || response.ok) return response;
              return null;
            }
          }
        ]
      });

      return strategy.handle({ event, request: new Request(targetUrl.href, { mode: 'no-cors' }) });
    } catch (error) {
      console.error('Route handler error:', error);
      // 返回原始请求
      return fetch(request);
    }
  }
);




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
      new ExpirationPlugin({ maxAgeSeconds: 90 * 24 * 60 * 60 }),
      {
        // 允许缓存不透明响应
        cacheWillUpdate: async ({response}) => {
          if (response.status === 0 || response.ok) return response;
          return null;
        }
      }
    ]
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
      new ExpirationPlugin({ maxAgeSeconds: 7 * 24 * 60 * 60 }),
      {
        // 允许缓存不透明响应
        cacheWillUpdate: async ({response}) => {
          if (response.status === 0 || response.ok) return response;
          return null;
        }
      }
    ]
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
      new ExpirationPlugin({ maxAgeSeconds: 90 * 24 * 60 * 60 }),
      {
        // 允许缓存不透明响应
        cacheWillUpdate: async ({response}) => {
          if (response.status === 0 || response.ok) return response;
          return null;
        }
      }
    ]
  })
);

// hdslb.com 请求处理（无referrer）
registerRoute(
  ({ url }) => {
    // 匹配 hdslb.com 及其子域名
    return url.host === 'hdslb.com' || url.host.endsWith('.hdslb.com');
  },
  async ({ request, event }) => {
    try {
      // 创建新的请求对象，设置 referrer policy 为 no-referrer
      const newRequest = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        mode: request.mode,
        credentials: request.credentials,
        cache: request.cache,
        redirect: request.redirect,
        referrerPolicy: 'no-referrer'
      });
      return fetch(newRequest);
    } catch (error) {
      console.error('hdslb.com request error:', error);
      return fetch(request);
    }
  }
);

// 本地处理B站API请求，去掉referrer
registerRoute(
  ({ url }) => {
    // 匹配 biliinfo.api.hzchu.top
    return url.host === 'biliinfo.api.hzchu.top';
  },
  async ({ request, event }) => {
    try {
      // 创建新的请求对象，代理到 https://blog.hzchu.top/_eoapi/get_bilibili_video_info?bvid=

      // 提取查询参数
      const originalUrl = new URL(request.url);
      const bvid = originalUrl.searchParams.get('bvid');
      const targetUrl = `https://blog.hzchu.top/_eoapi/get_bilibili_video_info?bvid=${bvid}`;

      const newRequest = new Request(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        mode: request.mode,
        credentials: request.credentials,
        cache: request.cache,
        redirect: request.redirect,
        // referrerPolicy: 'no-referrer'
      });

      const response = await fetch(newRequest);
      if (response.ok) {
        return response;
      } else {
        if (response.status === 404) {
          console.warn('当前请求非EO环境，正在回退到普通接口');
        } else {
            console.error('biliinfo request failed with status:', response.status);
        }
        return fetch(request);
      }

    } catch (error) {
      console.error('biliinfo request error:', error);
      return fetch(request);
    }
  }
);

// 在EO可用时，使用EO进行请求，否则回退到fetch
registerRoute(
  ({ url }) => {
    // 匹配 https://generate-cloud-image.hzchu.top/v1/image?format=json
    return url.href.startsWith('https://generate-cloud-image.hzchu.top/v1/image?format=json');
  },
  async ({ request, event }) => {
    try {
      // 创建新的请求对象，代理到 https://blog.hzchu.top/_eoapi/get_weather_info
      const targetUrl = `https://blog.hzchu.top/_eoapi/get_weather_info`;

      const newRequest = new Request(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        mode: request.mode,
        credentials: request.credentials,
        cache: request.cache,
        redirect: request.redirect,
        // referrerPolicy: 'no-referrer'
      });

      const response = await fetch(newRequest);
      if (response.ok) {
        return response;
      } else {
        if (response.status === 404) {
          console.warn('当前请求非EO环境，正在回退到普通接口');
        } else {
            console.error('get_weather_info request failed with status:', response.status);
        }
        return fetch(request);
      }
    } catch (error) {
      console.error('get_weather_info request error:', error);
      return fetch(request);
    }
  }
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
