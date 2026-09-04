/* 实时随机背景照片（经 picsum.photos 实时获取 Unsplash 摄影壁纸）
 *
 * 说明：
 * - unsplash.com 网页受反爬保护，纯静态站无法直接抓取该专题页。
 * - 改用 picsum.photos：官方基于 Unsplash 摄影师照片的免费随机图服务，
 *   每次请求实时返回一张新图（1920x1080），无需密钥、无跨域限制。
 * - 页面加载时自动实时拉取一张；每次点击右下角「🎨 随机背景」也会实时换一张新图。
 * - 若实时接口不可达，自动回退到 FALLBACK 中的 Unsplash 高清直链池。
 * - 想固定使用某组图片，改 FALLBACK 数组即可。
 */
(function () {
  'use strict';

  // 回退池：images.unsplash.com 高清直链（CDN 可达，离线/接口失败时使用）
  var FALLBACK = [
    'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1920&q=80',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1920&q=80',
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1920&q=80',
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1920&q=80',
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&q=80',
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1920&q=80',
    'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1920&q=80',
    'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1920&q=80',
    'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?auto=format&fit=crop&w=1920&q=80',
    'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?auto=format&fit=crop&w=1920&q=80',
    'https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?auto=format&fit=crop&w=1920&q=80',
    'https://images.unsplash.com/photo-1497436072909-60f360e1d4b1?auto=format&fit=crop&w=1920&q=80'
  ];

  var layer = document.querySelector('.bg-layer');
  var btn = document.getElementById('bg-random-btn');
  var root = document.documentElement;
  var busy = false;

  // 切换背景（带淡入过渡）
  function setBackground(url) {
    root.style.setProperty('--bg-image', 'url("' + url + '")');
    if (layer) {
      layer.style.opacity = '0';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          layer.style.opacity = '1';
        });
      });
    }
  }

  // 实时获取一张随机照片：picsum 每次请求都会 302 到一张新图。
  // 为稳定显示，先把图预加载并转成 dataURL 再设为背景（避免 CSS 二次请求
  // 再次随机到另一张图导致白屏/延迟）；CORS 受限时退回直接用 picsum URL。
  function fetchRandom() {
    var url = 'https://picsum.photos/1920/1080?t=' + Date.now();
    return new Promise(function (resolve) {
      var probe = new Image();
      probe.crossOrigin = 'anonymous';
      probe.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = probe.naturalWidth || 1920;
          c.height = probe.naturalHeight || 1080;
          c.getContext('2d').drawImage(probe, 0, 0);
          resolve(c.toDataURL('image/jpeg', 0.85));
        } catch (e) {
          // canvas 被污染（无 CORS）等情况：退回直接使用 picsum URL
          resolve(url);
        }
      };
      probe.onerror = function () { resolve(null); };
      probe.src = url;
    });
  }

  function pickFallback() {
    return FALLBACK[Math.floor(Math.random() * FALLBACK.length)];
  }

  function refresh() {
    if (busy) return;
    busy = true;
    fetchRandom().then(function (url) {
      setBackground(url || pickFallback());
      busy = false;
    });
  }

  // 进入页面即实时拉取一张（失败则保留 CSS 默认图）
  refresh();

  if (btn) {
    btn.addEventListener('click', refresh);
  }
})();
