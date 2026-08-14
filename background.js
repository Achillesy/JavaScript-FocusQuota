// FocusQuota — Service Worker（阶段 1：配置与存储层）
// 启动时确保默认配置写入 chrome.storage.local，供后续阶段读取。
// 本阶段不做计时/豁免等业务逻辑。
import { getConfig } from './js/storage.js';

console.log('[FocusQuota] Service Worker 已启动（阶段 1）');

getConfig()
  .then((config) => {
    console.log('[FocusQuota] 配置已就绪：', config);
  })
  .catch((err) => {
    console.error('[FocusQuota] 初始化配置失败：', err);
  });
