// FocusQuota - Copyright (C) 2026 Achilles Newman
// SPDX-License-Identifier: GPL-3.0-or-later
// 本文件是 FocusQuota 的一部分，依据 GNU GPL v3.0 或更高版本授权；详见项目根目录 LICENSE。

// FocusQuota — i18n 小助手（v1.1.0 新增）
// 约定：HTML 元素用 data-i18n="key" 标记文案，data-i18n-ph 标记 placeholder，
// data-i18n-alt 标记 alt；JS 里直接调 chrome.i18n.getMessage(key[, substitutions])。
// _locales/en 与 _locales/zh_CN 的 key 必须一一对应（CI/人工用脚本核对）。
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
  // <html lang> 跟随界面语言（zh-CN / en-US …）
  document.documentElement.lang = chrome.i18n.getUILanguage();
}
