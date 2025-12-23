# Workbox Service Worker

这个项目使用 Workbox 和 Webpack 将 Service Worker 打包为单个 JS 文件。

## 安装依赖

```bash
npm install
```

## 构建

### 生产环境构建
```bash
npm run build
```

### 开发环境构建(带监听)
```bash
npm run dev
```

## 输出

打包后的文件位于 `dist/sw.js`

## 使用方法

在你的网站中注册 Service Worker:

```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(registration => {
      console.log('Service Worker 注册成功:', registration);
    })
    .catch(error => {
      console.log('Service Worker 注册失败:', error);
    });
}
```

## API 使用

### 获取缓存统计信息
```javascript
navigator.serviceWorker.controller.postMessage({ type: 'GET_CACHE_STATS' });
```

### 获取请求计数
```javascript
navigator.serviceWorker.controller.postMessage({ type: 'GET_REQUEST_COUNT' });
```

### 清除所有缓存
```javascript
navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
```
