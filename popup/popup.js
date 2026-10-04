// FocusQuota - Copyright (C) 2026 Achilles Newman
// SPDX-License-Identifier: GPL-3.0-or-later
// This file is part of FocusQuota, licensed under GNU GPL v3.0 or later; see LICENSE in the project root.

// FocusQuota — Popup (phase 6): shows today's usage / quota / remaining
// Shares js/storage.js with the Service Worker; storage is the single source of truth.
import { getConfig, getUsage } from '../js/storage.js';
import { applyI18n } from '../js/i18n.js';

async function render() {
  const config = await getConfig();
  const usage = await getUsage();
  const limitSeconds = config.dailyLimitMinutes * 60;

  const usedMin = Math.floor(usage.usageSeconds / 60);
  const remainingMin = Math.max(0, Math.ceil((limitSeconds - usage.usageSeconds) / 60));
  const over = usage.usageSeconds >= limitSeconds;

  document.getElementById('used-min').textContent = String(usedMin);
  document.getElementById('limit-min').textContent = String(config.dailyLimitMinutes);

  const remainingEl = document.getElementById('remaining');
  remainingEl.textContent = over
    ? chrome.i18n.getMessage('popupQuotaUsedUp')
    : chrome.i18n.getMessage('popupRemaining', [String(remainingMin)]);
  remainingEl.classList.toggle('over', over);

  document.getElementById('version').textContent = chrome.runtime.getManifest().version;
}

document.getElementById('open-options').addEventListener('click', () => {
  // Open the options page URL directly (tabs permission already granted) — more reliable than depending on options_ui registration
  chrome.tabs
    .create({ url: chrome.runtime.getURL('options/options.html') })
    .catch((err) => console.warn('[popup] failed to open options page:', err));
});

// Render on open; live-refresh on timing/config changes (numbers stay in sync while the popup is open)
chrome.storage.onChanged.addListener(() => render());

applyI18n();
render();
