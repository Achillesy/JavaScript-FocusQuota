// FocusQuota — 豁免规则（阶段 3）
// 三类豁免：特殊页面 scheme / 域名白名单 / 标题关键词。
// 判定每次实时读取配置（getConfig），配置变更后下一次评估立即生效。
import { getConfig } from './storage.js';

// 特殊页面 scheme：一律不计入普通浏览时间（DESIGN.md 第 14 节）
const SPECIAL_SCHEME_RE =
  /^(chrome|chrome-extension|about|devtools|edge|view-source|file|blob|data|javascript):/i;

// 提取 URL 的 hostname（统一小写）；解析失败返回空串
function extractHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

// 特殊页面判定：无 URL 或特殊 scheme → 豁免
function isSpecialPage(url) {
  if (!url) return true;
  return SPECIAL_SCHEME_RE.test(url);
}

// 白名单匹配：hostname 等于白名单项，或以 ".白名单项" 结尾。
// 例：www.chatgpt.com 匹配 chatgpt.com；notchatgpt.com 不匹配（不以 .chatgpt.com 结尾）
function matchesDomain(hostname, domain) {
  const d = domain.toLowerCase();
  return hostname === d || hostname.endsWith('.' + d);
}

// 标题关键词匹配：title 包含任一关键词，不区分大小写
// 理由：blender 与 Blender 应视为同一关键词，贴近用户直觉，避免大小写差异漏豁免
function matchesKeywords(title, keywords) {
  if (!title) return false;
  const t = title.toLowerCase();
  return keywords.some((kw) => t.includes(kw.toLowerCase()));
}

// 综合豁免判定：返回 true 表示该页面不消耗普通浏览时间
export async function isExempt(url, title) {
  if (isSpecialPage(url)) return true;
  const hostname = extractHostname(url);
  if (!hostname) return true; // 无法提取 hostname（无有效 URL）→ 保守处理为不计时
  const config = await getConfig();
  if (config.excludedDomains.some((d) => matchesDomain(hostname, d))) return true;
  if (matchesKeywords(title, config.titleKeywords)) return true;
  return false;
}
