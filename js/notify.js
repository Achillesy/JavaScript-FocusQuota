// FocusQuota - Copyright (C) 2026 Achilles Newman
// SPDX-License-Identifier: GPL-3.0-or-later
// This file is part of FocusQuota, licensed under GNU GPL v3.0 or later; see LICENSE in the project root.

// FocusQuota — quota reminders (phase 5)
// When the daily quota is reached: fire a system notification + persistent icon badge.
// Remind again on every new page opened (navigation) after the quota is reached (user's choice; short debounce guards against chained-navigation bursts).
// Remind only, never block access (DESIGN.md §2.1: no redirects, no tab closing, no page blocking, no page modification).
import { getConfig, getUsage } from './storage.js';

const NOTIFY_ID = 'focusquota-limit-reached';
// Records the date the quota notification already fired "today", for anti-nag (once per day)
const LIMIT_NOTIFIED_KEY = 'limitNotifiedDate';
// Min interval between navigation reminders: avoid bursts from redirect chains / SPA URL churn on one navigation
const NAV_NOTIFY_MIN_MS = 10 * 1000;
let lastNavNotifyAt = 0; // in-memory; re-reminding after an SW restart is acceptable

// Evaluate and fire quota reminders. Called after each settlement / on SW startup / on config change.
// config/usage are optional: if the caller already read them in this refresh cycle, pass them in to avoid re-reading storage;
// otherwise (e.g. SW init, config-change listener) they are read fresh internally.
export async function checkAndNotify(config, usage) {
  config = config ?? (await getConfig());
  usage = usage ?? (await getUsage());
  const limitSeconds = config.dailyLimitMinutes * 60;
  const over = usage.usageSeconds >= limitSeconds;

  if (over) {
    // Persistent cue: after the quota is reached the badge shows overage minutes (red),
    // i.e. how far beyond the daily limit — "1" reads better than total used "121",
    // and matches the notification wording ("X minutes over the limit").
    const overMin = Math.ceil((usage.usageSeconds - limitSeconds) / 60);
    const text = overMin > 999 ? '999+' : String(overMin);
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: '#d93025' }); // red
    // Anti-nag: notify at most once per day; the badge keeps reminding afterwards
    const stored = await chrome.storage.local.get(LIMIT_NOTIFIED_KEY);
    if (stored[LIMIT_NOTIFIED_KEY] !== usage.usageDate) {
      try {
        await chrome.notifications.create(NOTIFY_ID, {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'FocusQuota',
          message: chrome.i18n.getMessage('notifyLimitReached', [
            String(config.dailyLimitMinutes),
          ]),
          priority: 1,
        });
      } catch (err) {
        console.warn('[notify] failed to send notification:', err);
      }
      await chrome.storage.local.set({ [LIMIT_NOTIFIED_KEY]: usage.usageDate });
      console.log(`[notify] quota reminder fired (${usage.usageDate})`);
    }
  } else {
    // Quota not reached: badge shows remaining minutes (badge fits 4 chars max; over 999 shows 999+)
    const remaining = Math.ceil((limitSeconds - usage.usageSeconds) / 60);
    const text = remaining > 999 ? '999+' : String(remaining);
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: '#1a73e8' }); // blue
  }
}

// Remind on every new page opened (navigation) after the quota is reached; ignore when under quota or inside the debounce window.
export async function notifyOnNavigation() {
  const config = await getConfig();
  const usage = await getUsage();
  if (usage.usageSeconds < config.dailyLimitMinutes * 60) return; // quota not reached
  const now = Date.now();
  if (now - lastNavNotifyAt < NAV_NOTIFY_MIN_MS) return; // debounce
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
      message: chrome.i18n.getMessage('notifyOverQuota', [
        String(usedMinutes),
        String(overMinutes),
      ]),
      priority: 1,
    });
    console.log('[notify] quota reached: new-page reminder');
  } catch (err) {
    console.warn('[notify] failed to send notification:', err);
  }
}
