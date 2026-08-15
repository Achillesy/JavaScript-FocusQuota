// FocusQuota — 计时引擎（阶段 2：核心计时）
// 状态机：idle / timing。单一计时区间，任何状态切换都「先结算旧区间，再开新区间」，
// 保证同一时刻最多只有一个计时区间（DESIGN.md 第 12 节问题 A）。
// 防睡眠误计（问题 C）：单区间超过 MAX_SESSION_MS 视为睡眠/系统时间异常，整段丢弃。
// 持久化（问题 B）：结算后立即写入 chrome.storage.local（经 storage.js 封装）。
import { getUsage, setUsage, rolloverIfNeeded } from './storage.js';
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

// 串行化 refresh，避免并发事件交错导致结算/计时错乱
let chain = Promise.resolve();
function refresh(reason = 'event') {
  chain = chain
    .then(() => doRefresh(reason))
    .catch((err) => console.error('[timer] refresh 失败：', err));
  return chain;
}

// 查询当前应计时的页面；返回 null 表示不应计时
async function currentTrackable() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs && tabs[0];
  if (!tab || tab.id === chrome.tabs.TAB_ID_NONE) return null;
  const win = await chrome.windows.get(tab.windowId);
  if (!win || !win.focused) return null; // 窗口失焦/最小化 → 不计时
  if (await isExempt(tab.url, tab.title)) return null; // 豁免规则（阶段 3）
  return { windowId: tab.windowId, tabId: tab.id, url: tab.url, title: tab.title };
}

// 结算当前计时区间：把 [区间开始, now] 累加到 usageSeconds。
// 区间开始时间优先取 storage（跨 SW 生命周期），内存为镜像，二者一致。
async function settle(reason) {
  await rolloverIfNeeded(); // 每日重置：跨日先清零（DESIGN.md 第 7 节）
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
  const usage = await getUsage();
  usage.usageSeconds += seconds;
  await setUsage(usage);
  await checkAndNotify(); // 额度提醒：badge 更新 / 达到额度弹通知（阶段 5）
  console.log(`[timer] 结算 +${seconds}s（${reason}），今日累计 ${usage.usageSeconds}s`);
}

// 刷新计时状态：先结算旧区间，再决定是否开启新区间
async function doRefresh(reason) {
  await settle(reason);
  const tab = await currentTrackable();
  if (tab) {
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

export { refresh };
