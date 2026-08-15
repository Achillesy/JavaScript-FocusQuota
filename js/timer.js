// FocusQuota — 计时引擎（阶段 2：核心计时）
// 状态机：idle / timing。单一计时区间，任何状态切换都「先结算旧区间，再开新区间」，
// 保证同一时刻最多只有一个计时区间（DESIGN.md 第 12 节问题 A）。
// 防睡眠误计（问题 C）：单区间超过 MAX_SESSION_MS 视为睡眠/系统时间异常，整段丢弃。
// 持久化（问题 B）：结算后立即写入 chrome.storage.local（经 storage.js 封装）。
import { getUsage, setUsage } from './storage.js';

// 单区间时长上限：超过视为睡眠/异常（建议数分钟内，IMPLEMENTATION.md 阶段 2）
const MAX_SESSION_MS = 5 * 60 * 1000;

const state = {
  sessionStart: null, // number | null，当前计时区间开始时间戳
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

// 特殊页面最小判定（阶段 2；完整豁免规则在阶段 3 实现）
// 这些页面默认不计入普通浏览时间（DESIGN.md 第 14 节）
function isSpecialPage(url) {
  if (!url) return true;
  return /^(chrome|chrome-extension|about|devtools|edge|view-source|file|blob|data|javascript):/i.test(
    url
  );
}

// 查询当前应计时的页面；返回 null 表示不应计时
async function currentTrackable() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs && tabs[0];
  if (!tab || tab.id === chrome.tabs.TAB_ID_NONE) return null;
  const win = await chrome.windows.get(tab.windowId);
  if (!win || !win.focused) return null; // 窗口失焦/最小化 → 不计时
  if (isSpecialPage(tab.url)) return null;
  return { windowId: tab.windowId, tabId: tab.id, url: tab.url, title: tab.title };
}

// 结算当前计时区间：把 [sessionStart, now] 累加到 usageSeconds
async function settle(reason) {
  const start = state.sessionStart;
  if (start === null) return;
  state.sessionStart = null; // 结算即关闭当前区间
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
  console.log(`[timer] 结算 +${seconds}s（${reason}），今日累计 ${usage.usageSeconds}s`);
}

// 刷新计时状态：先结算旧区间，再决定是否开启新区间
async function doRefresh(reason) {
  await settle(reason);
  const tab = await currentTrackable();
  if (tab) {
    state.activeTab = tab;
    state.sessionStart = Date.now();
    console.log(`[timer] start 计时：${tab.title || '(无标题)'}（${tab.url}）`);
  } else {
    state.activeTab = null;
    state.sessionStart = null;
    console.log('[timer] stop 计时');
  }
}

export { refresh };
