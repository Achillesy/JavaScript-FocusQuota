// FocusQuota - Copyright (C) 2026 Achilles Newman
// SPDX-License-Identifier: GPL-3.0-or-later
// 本文件是 FocusQuota 的一部分，依据 GNU GPL v3.0 或更高版本授权；详见项目根目录 LICENSE。

// FocusQuota — Service Worker（阶段 5：额度提醒 + 空闲检测）
// 事件驱动计时 + chrome.alarms 周期结算兜底（防止 SW 被回收时丢失未结算时长）。
import { getConfig, rolloverIfNeeded } from './js/storage.js';
import { refresh, setIdleMark, IDLE_DETECT_SECONDS } from './js/timer.js';
import { checkAndNotify, notifyOnNavigation } from './js/notify.js';

const SETTLE_ALARM = 'focusquota-settle';

console.log('[FocusQuota] Service Worker 已启动（阶段 5）');

// 启动初始化：确保默认配置落盘、检查每日重置、注册周期结算 alarm、刷新计时状态、初始化 badge
(async function init() {
  try {
    await getConfig();
    await rolloverIfNeeded(); // SW 启动时检查跨日（DESIGN.md 第 7 节）
    // 幂等创建周期结算 alarm：SW 每次唤醒都会执行 init，避免重复 create 重置周期
    const existingAlarm = await chrome.alarms.get(SETTLE_ALARM);
    if (!existingAlarm) {
      await chrome.alarms.create(SETTLE_ALARM, { periodInMinutes: 1 });
    }
    // 初始化空闲检测：设置检测间隔，并按当前系统状态设置空闲标记
    await chrome.idle.setDetectionInterval(IDLE_DETECT_SECONDS);
    const idleState = await chrome.idle.queryState(IDLE_DETECT_SECONDS);
    setIdleMark(idleState === 'idle' || idleState === 'locked');
    await refresh('init');
    await checkAndNotify(); // 初始化 badge（剩余分钟 / 满）
  } catch (err) {
    console.error('[FocusQuota] 初始化失败：', err);
  }
})();

// 空闲检测：人离开（约 1 分钟无输入）后停止计时；回来恢复
chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'active') {
    setIdleMark(false);
    refresh('idle-active');
  } else {
    // idle / locked：直接标记空闲，由 timer.js 判定停止（有声页面除外）
    setIdleMark(true);
    refresh('idle');
  }
});

// 配置变更（如用户调整额度）后立即刷新 badge/通知判定
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.config) checkAndNotify();
});

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
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    // 先等 refresh 完成结算/每日重置，再读取导航提醒判定，避免读到跨日边界的脏数据；
    // 且只对用户正在查看的激活标签页提醒——后台标签页自动刷新/跳转不应打扰用户。
    refresh('tab-navigated').then(() => {
      if (tab.active) notifyOnNavigation();
    });
  } else if (changeInfo.title) {
    refresh('tab-title');
  }
});
