// FocusQuota - Copyright (C) 2026 Achilles Newman
// SPDX-License-Identifier: GPL-3.0-or-later
// This file is part of FocusQuota, licensed under GNU GPL v3.0 or later; see LICENSE in the project root.

// FocusQuota — i18n helper (added in v1.1.0)
// Convention: HTML elements carry copy via data-i18n="key", data-i18n-ph for placeholders,
// data-i18n-alt for alt text; JS calls chrome.i18n.getMessage(key[, substitutions]) directly.
// Keys in _locales/en and _locales/zh_CN must match one-to-one (verified by script, CI or manual).
export function applyI18n(root = document) {
  const t = (key) => chrome.i18n.getMessage(key);
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const v = t(el.getAttribute('data-i18n'));
    if (v) el.textContent = v;
  });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    const v = t(el.getAttribute('data-i18n-ph'));
    if (v) el.placeholder = v;
  });
  root.querySelectorAll('[data-i18n-alt]').forEach((el) => {
    const v = t(el.getAttribute('data-i18n-alt'));
    if (v) el.alt = v;
  });
  // <html lang> follows the UI language (zh-CN / en-US …)
  document.documentElement.lang = chrome.i18n.getUILanguage();
}
