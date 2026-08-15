// FocusQuota — chrome.storage.local 读写封装与校验
// 阶段 1：配置（config）与统计（usage）的存取统一走本模块。
// storage.local 为单一数据源；非法输入在此处被修正或回退默认值。
import { DEFAULT_CONFIG } from './defaults.js';

const CONFIG_KEY = 'config';
const USAGE_KEY = 'usage';

// ---- 本地工具 ----

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// 今日本地日期，格式 YYYY-MM-DD（DESIGN.md 第 7 节：按本地日期统计）
function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 正整数校验（dailyLimitMinutes 必须为正整数）
function isValidPositiveInt(v) {
  return Number.isInteger(v) && v > 0;
}

// 字符串数组清洗：去空串、trim、去重；不是数组则返回 null
function sanitizeStringArray(v) {
  if (!Array.isArray(v)) return null;
  const seen = new Set();
  const cleaned = [];
  for (const item of v) {
    const s = String(item).trim();
    if (s.length > 0 && !seen.has(s)) {
      seen.add(s);
      cleaned.push(s);
    }
  }
  return cleaned;
}

// 逐字段校验 config，非法字段回退默认值
function sanitizeConfig(raw) {
  const out = {};
  out.dailyLimitMinutes = isValidPositiveInt(raw.dailyLimitMinutes)
    ? raw.dailyLimitMinutes
    : DEFAULT_CONFIG.dailyLimitMinutes;

  const domains = sanitizeStringArray(raw.excludedDomains);
  out.excludedDomains = domains !== null ? domains : [...DEFAULT_CONFIG.excludedDomains];

  const keywords = sanitizeStringArray(raw.titleKeywords);
  out.titleKeywords = keywords !== null ? keywords : [...DEFAULT_CONFIG.titleKeywords];
  return out;
}

function sanitizeUsage(raw) {
  return {
    usageSeconds:
      Number.isInteger(raw.usageSeconds) && raw.usageSeconds >= 0 ? raw.usageSeconds : 0,
    usageDate:
      typeof raw.usageDate === 'string' && raw.usageDate.length > 0
        ? raw.usageDate
        : todayString(),
  };
}

// ---- 配置读写 ----

// 读取配置；若从未写入或存储值不合法，则写入（修正后的）默认值并返回。
export async function getConfig() {
  const stored = await chrome.storage.local.get(CONFIG_KEY);
  const raw = stored[CONFIG_KEY];
  const hasStored = raw !== undefined && raw !== null;
  const merged = { ...DEFAULT_CONFIG, ...(isPlainObject(raw) ? raw : {}) };
  const config = sanitizeConfig(merged);
  const dirty = !hasStored || JSON.stringify(config) !== JSON.stringify(merged);
  if (dirty) {
    await chrome.storage.local.set({ [CONFIG_KEY]: config });
  }
  return config;
}

// 合并更新配置：只接受三个白名单字段，未知字段忽略；非法值回退默认。
// 返回更新并校验后的完整配置。
export async function setConfig(partial) {
  const current = await getConfig();
  const allowed = {};
  if ('dailyLimitMinutes' in partial) allowed.dailyLimitMinutes = partial.dailyLimitMinutes;
  if ('excludedDomains' in partial) allowed.excludedDomains = partial.excludedDomains;
  if ('titleKeywords' in partial) allowed.titleKeywords = partial.titleKeywords;
  const merged = { ...current, ...allowed };
  const config = sanitizeConfig(merged);
  await chrome.storage.local.set({ [CONFIG_KEY]: config });
  return config;
}

// ---- 统计读写 ----

// 读取统计；从未写入时返回 { usageSeconds: 0, usageDate: 今日 } 并落盘。
export async function getUsage() {
  const stored = await chrome.storage.local.get(USAGE_KEY);
  const raw = stored[USAGE_KEY];
  if (isPlainObject(raw)) {
    return sanitizeUsage(raw);
  }
  const usage = sanitizeUsage({ usageSeconds: 0, usageDate: todayString() });
  await chrome.storage.local.set({ [USAGE_KEY]: usage });
  return usage;
}

// 整体写入统计（已校验）。
export async function setUsage(usage) {
  const clean = sanitizeUsage(usage);
  await chrome.storage.local.set({ [USAGE_KEY]: clean });
  return clean;
}

// ---- 每日重置 ----

// 每日重置（DESIGN.md 第 7 节）：若 usageDate != 今日，则 usageSeconds=0、usageDate=今日。
// 使用本地日期（YYYY-MM-DD），不使用 24 小时滚动窗口。
// 重置逻辑集中于此函数，所有触发时机（计时结算 / SW 启动 / alarms）复用。
export async function rolloverIfNeeded() {
  const usage = await getUsage();
  const today = todayString();
  if (usage.usageDate !== today) {
    const reset = { usageSeconds: 0, usageDate: today };
    await chrome.storage.local.set({ [USAGE_KEY]: reset });
    console.log('[storage] 每日重置：', reset);
    return reset;
  }
  return usage; // 当日多次检查不会重复归零
}
