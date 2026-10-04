// FocusQuota - Copyright (C) 2026 Achilles Newman
// SPDX-License-Identifier: GPL-3.0-or-later
// This file is part of FocusQuota, licensed under GNU GPL v3.0 or later; see LICENSE in the project root.

// FocusQuota — exemption rules (phase 3)
// Three exemption kinds: special-page schemes / domain allowlist / title keywords.
// config is read once per refresh cycle by the caller (timer.js) and passed in, so verdicts
// never re-hit chrome.storage.local; config changes take effect on the next refresh cycle.

// Special-page schemes: never count toward casual browsing time (DESIGN.md §14)
const SPECIAL_SCHEME_RE =
  /^(chrome|chrome-extension|about|devtools|edge|view-source|file|blob|data|javascript):/i;

// Loopback/local addresses: local dev servers never count toward casual browsing time (built in, not removable via config)
const BUILTIN_LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'];

// Extract a URL's hostname (lowercased); return '' on parse failure
function extractHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

// Special-page verdict: no URL or special scheme → exempt
function isSpecialPage(url) {
  if (!url) return true;
  return SPECIAL_SCHEME_RE.test(url);
}

// IPv4 string → 32-bit unsigned int; null if invalid
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

// IPv4 CIDR match (e.g. 192.168.31.0/24): true if hostname is inside the range
function matchesCidr(hostname, cidr) {
  const slash = cidr.indexOf('/');
  if (slash === -1) return false;
  const prefix = Number(cidr.slice(slash + 1));
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const net = ipv4ToInt(cidr.slice(0, slash));
  const host = ipv4ToInt(hostname);
  if (net === null || host === null) return false; // non-IPv4 (e.g. domain names) never match CIDR
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (net & mask) === (host & mask);
}

// Allowlist matching:
// - CIDR range (contains /, e.g. 192.168.31.0/24) → range match
// - Plain domain → hostname equals the entry, or ends with ".<entry>"
//   e.g. www.chatgpt.com matches chatgpt.com; notchatgpt.com doesn't (doesn't end with .chatgpt.com)
function matchesDomain(hostname, domain) {
  const d = domain.toLowerCase();
  if (d.includes('/')) return matchesCidr(hostname, d);
  return hostname === d || hostname.endsWith('.' + d);
}

// Title keyword match: title contains any keyword, case-insensitive
// Rationale: blender and Blender should count as the same keyword — matches user intuition, avoids case-miss exemptions
function matchesKeywords(title, keywords) {
  if (!title) return false;
  const t = title.toLowerCase();
  return keywords.some((kw) => t.includes(kw.toLowerCase()));
}

// Combined exemption verdict: true means this page consumes no casual browsing time
// config is the already-read config object from the caller (no internal storage reads; pure sync computation).
export function isExempt(url, title, config) {
  if (isSpecialPage(url)) return true;
  const hostname = extractHostname(url);
  if (!hostname) return true; // hostname unextractable (no valid URL) → conservatively do not time
  if (BUILTIN_LOCAL_HOSTS.includes(hostname)) return true; // loopback address
  if (config.excludedDomains.some((d) => matchesDomain(hostname, d))) return true;
  if (matchesKeywords(title, config.titleKeywords)) return true;
  return false;
}
