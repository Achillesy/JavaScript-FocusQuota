// FocusQuota — 额度提醒（阶段 5）
// 达到每日额度后：弹系统通知 + 图标 badge 持续提示。
// 达额后每次打开新网页（导航）时再次提醒（用户选择；含短去抖防连环导航连弹）。
// 只提醒，绝不阻止访问（DESIGN.md 第 2.1 节：不重定向、不关标签页、不阻塞页面、不改网页内容）。
import { getConfig, getUsage } from './storage.js';

const NOTIFY_ID = 'focusquota-limit-reached';
// 记录「今日已弹过额度通知」的日期，用于防打扰（同日只弹一次）
const LIMIT_NOTIFIED_KEY = 'limitNotifiedDate';
// 导航提醒最小间隔：避免同一导航的重定向/SPA 连环 URL 变化连弹
const NAV_NOTIFY_MIN_MS = 10 * 1000;
let lastNavNotifyAt = 0; // 内存记录；SW 重启后允许重新提醒，可接受

// 判定并执行额度提醒。每次结算后 / SW 启动时 / 配置变更时调用。
// config/usage 可选：调用方若在同一 refresh 周期内已读取过，可直接传入避免重复读 storage；
// 省略时（如 SW 初始化、配置变更监听）内部自行读取最新值。
export async function checkAndNotify(config, usage) {
  config = config ?? (await getConfig());
  usage = usage ?? (await getUsage());
  const limitSeconds = config.dailyLimitMinutes * 60;
  const over = usage.usageSeconds >= limitSeconds;

  if (over) {
    // 持续提示：达额后 badge 继续显示已用分钟数（红色），让用户看到超出/累计进度
    const usedMin = Math.ceil(usage.usageSeconds / 60);
    const text = usedMin > 999 ? '999+' : String(usedMin);
    await chrome.action.setBadgeText({ text });
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

// 达额后每次打开新网页（导航）时提醒；未达额或去抖窗口内忽略。
export async function notifyOnNavigation() {
  const config = await getConfig();
  const usage = await getUsage();
  if (usage.usageSeconds < config.dailyLimitMinutes * 60) return; // 未达额
  const now = Date.now();
  if (now - lastNavNotifyAt < NAV_NOTIFY_MIN_MS) return; // 去抖
  lastNavNotifyAt = now;
  const usedMinutes = Math.ceil(usage.usageSeconds / 60);
  const overMinutes = Math.max(
    0,
    Math.ceil((usage.usageSeconds - config.dailyLimitMinutes * 60) / 60)
  );
  try {
    await chrome.notifications.create(NOTIFY_ID, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'FocusQuota',
      message: `今日上网时长已经达到 ${usedMinutes} 分钟，超过限制额度 ${overMinutes} 分钟`,
      priority: 1,
    });
    console.log('[notify] 已达额：打开新网页提醒');
  } catch (err) {
    console.warn('[notify] 通知发送失败：', err);
  }
}
