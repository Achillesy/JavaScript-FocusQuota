// FocusQuota - Copyright (C) 2026 Achilles Newman
// SPDX-License-Identifier: GPL-3.0-or-later
// 本文件是 FocusQuota 的一部分，依据 GNU GPL v3.0 或更高版本授权；详见项目根目录 LICENSE。

// FocusQuota — 计时引擎（阶段 2：核心计时）
// 状态机：idle / timing。单一计时区间，「是否应计时」发生真正翻转时才结算旧区间、开新区间，
// 保证同一时刻最多只有一个计时区间（DESIGN.md 第 12 节问题 A）。
// 优化：若这次事件前后「是否应计时」没有变化（如在两个都需计时/都豁免的标签页间切换、
// SPA 标题变化但豁免结果不变），不触发结算和 storage 读写，只有周期 alarm（每分钟）
// 固定强制结算一次兜底（保证 usageSeconds/badge 不会长时间滞后、单区间时长有界）。
// 防睡眠误计（问题 C）：单区间超过 MAX_SESSION_MS 视为睡眠/系统时间异常，整段丢弃。
// 持久化（问题 B）：结算后立即写入 chrome.storage.local（经 storage.js 封装）。
import { getConfig, setUsage, rolloverIfNeeded } from './storage.js';
import { isExempt } from './exempt.js';
import { checkAndNotify } from './notify.js';

// 单区间时长上限：超过视为睡眠/系统时间异常，整段丢弃。
// 30 分钟：容忍 Chrome 对 alarms 的后台节流延迟（正常使用中单区间几乎不可能超 30 分钟）；
// 睡眠时长远超该值，仍会被正确丢弃，防睡眠误计依然有效。
const MAX_SESSION_MS = 30 * 60 * 1000;

// 计时区间持久化键：SW 被回收/重启后，用 storage 中的开始时间戳继续结算，避免丢失
const SESSION_KEY = 'timingSession';

const state = {
  sessionStart: null, // number | null，当前计时区间开始时间戳（内存镜像）
  activeTab: null, // { windowId, tabId, url, title } | null
};

// 空闲检测（防「人离开但 Chrome 窗口仍聚焦」时继续计时）：
// chrome.idle 在系统无键鼠输入约 IDLE_DETECT_SECONDS 秒后触发 idle 事件。
// 用户选择：1 分钟无输入即视为空闲 → 事件到达即停止计时（仅需 API 默认间隔 60 秒）。
// 有声页面（tab.audible）不判空闲：看视频/听音乐即使无输入也继续计时。
export const IDLE_DETECT_SECONDS = 60; // chrome.idle.setDetectionInterval 检测间隔（秒），单一来源
let isIdle = false; // 系统空闲标记

// 由 background 在 chrome.idle.onStateChanged 时调用：idle=true 空闲，false 恢复活跃
function setIdleMark(idle) {
  isIdle = idle;
}

// 串行化 refresh，避免并发事件交错导致结算/计时错乱
let chain = Promise.resolve();
function refresh(reason = 'event') {
  chain = chain
    .then(() => doRefresh(reason))
    .catch((err) => console.error('[timer] refresh 失败：', err));
  return chain;
}

// 查询当前应计时的页面；返回 null 表示不应计时。config 由调用方一次性读取后传入。
async function currentTrackable(config) {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs && tabs[0];
  if (!tab || tab.id === chrome.tabs.TAB_ID_NONE) return null;
  const win = await chrome.windows.get(tab.windowId);
  if (!win || !win.focused) return null; // 窗口失焦/最小化 → 不计时
  // 空闲判定：系统空闲（约 1 分钟无输入）且页面无声音 → 视为离开，不计时
  if (isIdle && !tab.audible) return null;
  if (isExempt(tab.url, tab.title, config)) return null; // 豁免规则（阶段 3）
  return { windowId: tab.windowId, tabId: tab.id, url: tab.url, title: tab.title };
}

// 结算当前计时区间：把 [区间开始, now] 累加到 usageSeconds。
// 区间开始时间优先取 storage（跨 SW 生命周期），内存为镜像，二者一致。
// config 由调用方传入，交给 checkAndNotify 复用，避免同一周期内重复读取。
async function settle(reason, config) {
  const usage = await rolloverIfNeeded(); // 每日重置：跨日先清零（DESIGN.md 第 7 节），并返回最新 usage
  const stored = await chrome.storage.local.get(SESSION_KEY);
  const persistedStart =
    stored[SESSION_KEY] && typeof stored[SESSION_KEY].start === 'number'
      ? stored[SESSION_KEY].start
      : null;
  const start = persistedStart !== null ? persistedStart : state.sessionStart;
  state.sessionStart = null; // 结算即关闭当前区间（内存 + storage 一并清除）
  if (start === null) return;
  await chrome.storage.local.remove(SESSION_KEY);
  const diff = Date.now() - start;
  if (diff < 0 || diff > MAX_SESSION_MS) {
    console.warn(
      `[timer] 丢弃异常区间 ${Math.round(diff / 1000)}s（${reason}，可能为睡眠或系统时间变化）`
    );
    return;
  }
  const seconds = Math.round(diff / 1000);
  if (seconds <= 0) return;
  usage.usageSeconds += seconds;
  await setUsage(usage);
  await checkAndNotify(config, usage); // 额度提醒：badge 更新 / 达到额度弹通知（阶段 5）
  console.log(`[timer] 结算 +${seconds}s（${reason}），今日累计 ${usage.usageSeconds}s`);
}

// 刷新计时状态：只有「是否应计时」发生翻转、或本次是周期 alarm 兜底时，
// 才结算旧区间、决定是否开启新区间；否则直接维持当前区间不动，不做任何 storage 读写。
async function doRefresh(reason) {
  const config = await getConfig(); // 本周期只读一次，向下传给 currentTrackable/settle 复用
  const tab = await currentTrackable(config);
  const wasTiming = state.sessionStart !== null;
  const shouldTime = tab !== null;
  const forceSettle = reason === 'alarm' || wasTiming !== shouldTime;

  if (!forceSettle) {
    state.activeTab = tab; // 更新引用供日志/调试使用，不触发结算
    return;
  }

  await settle(reason, config);
  if (shouldTime) {
    state.activeTab = tab;
    state.sessionStart = Date.now();
    // 区间开始时间持久化：SW 被回收后仍可正确结算（问题 B 治本）
    await chrome.storage.local.set({ [SESSION_KEY]: { start: state.sessionStart } });
    console.log(`[timer] start 计时：${tab.title || '(无标题)'}（${tab.url}）`);
  } else {
    state.activeTab = null;
    state.sessionStart = null;
    await chrome.storage.local.remove(SESSION_KEY);
    console.log('[timer] stop 计时');
  }
}

export { refresh, setIdleMark };
