// FocusQuota — 额度提醒（阶段 5）
// 达到每日额度后：弹一次性系统通知 + 图标 badge 持续提示。
// 只提醒，绝不阻止访问（DESIGN.md 第 2.1 节：不重定向、不关标签页、不阻塞页面、不改网页内容）。
import { getConfig, getUsage } from './storage.js';

const NOTIFY_ID = 'focusquota-limit-reached';
// 记录「今日已弹过额度通知」的日期，用于防打扰（同日只弹一次）
const LIMIT_NOTIFIED_KEY = 'limitNotifiedDate';

// 判定并执行额度提醒。每次结算后 / SW 启动时 / 配置变更时调用。
export async function checkAndNotify() {
  const config = await getConfig();
  const usage = await getUsage();
  const limitSeconds = config.dailyLimitMinutes * 60;
  const over = usage.usageSeconds >= limitSeconds;

  if (over) {
    // 持续提示：badge 显示「满」
    await chrome.action.setBadgeText({ text: '满' });
    await chrome.action.setBadgeBackgroundColor({ color: '#d93025' }); // 红色
    // 防打扰：同一天只弹一次通知，之后以 badge 持续提示
    const stored = await chrome.storage.local.get(LIMIT_NOTIFIED_KEY);
    if (stored[LIMIT_NOTIFIED_KEY] !== usage.usageDate) {
      try {
        await chrome.notifications.create(NOTIFY_ID, {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'FocusQuota',
          message: `今日普通上网时间已达到 ${config.dailyLimitMinutes} 分钟。仅提醒，不阻止访问。`,
          priority: 1,
        });
      } catch (err) {
        console.warn('[notify] 通知发送失败：', err);
      }
      await chrome.storage.local.set({ [LIMIT_NOTIFIED_KEY]: usage.usageDate });
      console.log(`[notify] 已弹额度提醒（${usage.usageDate}）`);
    }
  } else {
    // 未达额度：badge 显示剩余分钟数（badge 最多 4 字符，超 999 显示 999+）
    const remaining = Math.ceil((limitSeconds - usage.usageSeconds) / 60);
    const text = remaining > 999 ? '999+' : String(remaining);
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: '#1a73e8' }); // 蓝色
  }
}
