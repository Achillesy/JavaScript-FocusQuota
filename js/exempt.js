// FocusQuota — 豁免规则（阶段 3）
// 三类豁免：特殊页面 scheme / 域名白名单 / 标题关键词。
// config 由调用方（timer.js）在一次 refresh 周期内读取一次后传入，避免每次判定
// 都重复访问 chrome.storage.local；配置变更后下一次 refresh 周期立即生效。

// 特殊页面 scheme：一律不计入普通浏览时间（DESIGN.md 第 14 节）
const SPECIAL_SCHEME_RE =
  /^(chrome|chrome-extension|about|devtools|edge|view-source|file|blob|data|javascript):/i;

// 本地环回/本机地址：调试本地服务一律不计入普通浏览时间（内置，不可通过配置删除）
const BUILTIN_LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'];

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

// IPv4 字符串 → 32 位无符号整数；非法返回 null
function ipv4ToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let val = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n < 0 || n > 255) return null;
    val = (val << 8) | n;
  }
  return val >>> 0;
}

// IPv4 CIDR 匹配（如 192.168.31.0/24）：hostname 在该网段内返回 true
function matchesCidr(hostname, cidr) {
  const slash = cidr.indexOf('/');
  if (slash === -1) return false;
  const prefix = Number(cidr.slice(slash + 1));
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const net = ipv4ToInt(cidr.slice(0, slash));
  const host = ipv4ToInt(hostname);
  if (net === null || host === null) return false; // 非 IPv4（如域名）不参与 CIDR 匹配
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (net & mask) === (host & mask);
}

// 白名单匹配：
// - CIDR 网段（含 /，如 192.168.31.0/24）→ 网段匹配
// - 常规域名 → hostname 等于白名单项，或以 ".白名单项" 结尾
//   例：www.chatgpt.com 匹配 chatgpt.com；notchatgpt.com 不匹配（不以 .chatgpt.com 结尾）
function matchesDomain(hostname, domain) {
  const d = domain.toLowerCase();
  if (d.includes('/')) return matchesCidr(hostname, d);
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
// config 为调用方已读取好的配置对象（不再内部读取 storage，纯同步计算）。
export function isExempt(url, title, config) {
  if (isSpecialPage(url)) return true;
  const hostname = extractHostname(url);
  if (!hostname) return true; // 无法提取 hostname（无有效 URL）→ 保守处理为不计时
  if (BUILTIN_LOCAL_HOSTS.includes(hostname)) return true; // 本地环回地址
  if (config.excludedDomains.some((d) => matchesDomain(hostname, d))) return true;
  if (matchesKeywords(title, config.titleKeywords)) return true;
  return false;
}
