// FocusQuota — Service Worker（阶段 2：核心计时引擎）
// 事件驱动计时 + chrome.alarms 周期结算兜底（防止 SW 被回收时丢失未结算时长）。
import { getConfig } from './js/storage.js';
import { refresh } from './js/timer.js';

const SETTLE_ALARM = 'focusquota-settle';

console.log('[FocusQuota] Service Worker 已启动（阶段 2）');

// 启动初始化：确保默认配置落盘、注册周期结算 alarm、立即刷新一次计时状态
(async function init() {
  try {
    await getConfig();
    await chrome.alarms.create(SETTLE_ALARM, { periodInMinutes: 1 });
    await refresh('init');
  } catch (err) {
    console.error('[FocusQuota] 初始化失败：', err);
  }
})();

// 周期结算（每 1 分钟）：SW 被回收前兜底结算，未结算时长最多丢失 1 分钟
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SETTLE_ALARM) refresh('alarm');
});

// 标签页切换
chrome.tabs.onActivated.addListener(() => refresh('tab-activated'));

// 窗口焦点变化（含最小化/失焦/聚焦）
chrome.windows.onFocusChanged.addListener(() => refresh('window-focus'));

// 标签页关闭
chrome.tabs.onRemoved.addListener(() => refresh('tab-removed'));

// 页面导航（URL 变化，含 SPA 路径跳转）与 title 变化（SPA 标题更新）。
// 两者都会改变豁免判定结果，需触发重新评估；不注入网页脚本（DESIGN.md 第 5 节）。
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url) refresh('tab-navigated');
  else if (changeInfo.title) refresh('tab-title');
});
