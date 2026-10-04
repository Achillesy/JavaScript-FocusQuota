// FocusQuota - Copyright (C) 2026 Achilles Newman
// SPDX-License-Identifier: GPL-3.0-or-later
// This file is part of FocusQuota, licensed under GNU GPL v3.0 or later; see LICENSE in the project root.

// FocusQuota — default config (the single place where defaults are defined)
// Constraint (IMPLEMENTATION.md phase 1): all defaults live only in this file;
// they must not be hard-coded anywhere else in the project.

export const DEFAULT_CONFIG = {
  // Daily casual-browsing time quota (minutes)
  dailyLimitMinutes: 120,
  // Domain allowlist (exempt, not timed): bare domains, www subdomains, IPv4 CIDR ranges (e.g. 192.168.31.0/24)
  excludedDomains: ['chatgpt.com', 'deepseek.com', 'doubao.com'],
  // Title keywords (a page whose title contains any keyword is exempt)
  titleKeywords: ['Blender'],
};
