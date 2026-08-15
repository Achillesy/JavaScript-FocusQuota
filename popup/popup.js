// FocusQuota — Popup（阶段 6）：展示今日使用/额度/剩余
// 与 Service Worker 共用 js/storage.js，storage 为单一数据源。
import { getConfig, getUsage } from '../js/storage.js';

async function render() {
  const config = await getConfig();
  const usage = await getUsage();
  const limitSeconds = config.dailyLimitMinutes * 60;

  const usedMin = Math.floor(usage.usageSeconds / 60);
  const remainingMin = Math.max(0, Math.ceil((limitSeconds - usage.usageSeconds) / 60));
  const over = usage.usageSeconds >= limitSeconds;

  document.getElementById('used-min').textContent = String(usedMin);
  document.getElementById('limit-min').textContent = String(config.dailyLimitMinutes);
  document.getElementById('remaining-min').textContent = String(remainingMin);

  const remainingEl = document.getElementById('remaining');
  remainingEl.textContent = over ? '今日额度已用完' : `剩余 ${remainingMin} 分钟`;
  remainingEl.classList.toggle('over', over);

  document.getElementById('version').textContent = chrome.runtime.getManifest().version;
}

document.getElementById('open-options').addEventListener('click', () => {
  // 直接打开设置页 URL（tabs 权限已有），不依赖 options_ui 注册状态，更可靠
  chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
});

// 打开时渲染；计时/配置变化时实时刷新（Popup 保持打开时数字同步）
chrome.storage.onChanged.addListener(() => render());

render();
