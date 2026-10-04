// FocusQuota - Copyright (C) 2026 Achilles Newman
// SPDX-License-Identifier: GPL-3.0-or-later
// This file is part of FocusQuota, licensed under GNU GPL v3.0 or later; see LICENSE in the project root.

// FocusQuota — Service Worker (phase 5: quota reminders + idle detection)
// Event-driven timing + chrome.alarms periodic settlement as a safety net (no unsettled time is lost when the SW is reclaimed).
import { getConfig, rolloverIfNeeded } from './js/storage.js';
import { refresh, setIdleMark, IDLE_DETECT_SECONDS } from './js/timer.js';
import { checkAndNotify, notifyOnNavigation } from './js/notify.js';

const SETTLE_ALARM = 'focusquota-settle';

console.log('[FocusQuota] Service Worker started (phase 5)');

// Startup init: persist default config, check daily rollover, register the settlement alarm, refresh timing state, init badge
(async function init() {
  try {
    await getConfig();
    await rolloverIfNeeded(); // check day rollover on SW startup (DESIGN.md §7)
    // Create the settlement alarm idempotently: init runs on every SW wake-up; a duplicate create would reset the period
    const existingAlarm = await chrome.alarms.get(SETTLE_ALARM);
    if (!existingAlarm) {
      await chrome.alarms.create(SETTLE_ALARM, { periodInMinutes: 1 });
    }
    // Init idle detection: set the detection interval, then mark idle state from the current system state
    await chrome.idle.setDetectionInterval(IDLE_DETECT_SECONDS);
    const idleState = await chrome.idle.queryState(IDLE_DETECT_SECONDS);
    setIdleMark(idleState === 'idle' || idleState === 'locked');
    await refresh('init');
    await checkAndNotify(); // init badge (remaining minutes / full)
  } catch (err) {
    console.error('[FocusQuota] init failed:', err);
  }
})();

// Idle detection: stop timing after the user walks away (~1 min without input); resume on return
chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'active') {
    setIdleMark(false);
    refresh('idle-active');
  } else {
    // idle / locked: mark idle directly; timer.js decides whether to stop (audible pages excepted)
    setIdleMark(true);
    refresh('idle');
  }
});

// Refresh badge/notification verdict immediately after config changes (e.g. quota adjusted)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.config) checkAndNotify();
});

// Periodic settlement (every 1 min): safety-net settlement before SW reclaim; at most 1 minute of unsettled time is lost
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SETTLE_ALARM) refresh('alarm');
});

// Tab switched
chrome.tabs.onActivated.addListener(() => refresh('tab-activated'));

// Window focus changed (incl. minimize / blur / focus)
chrome.windows.onFocusChanged.addListener(() => refresh('window-focus'));

// Tab closed
chrome.tabs.onRemoved.addListener(() => refresh('tab-removed'));

// Page navigation (URL change, incl. SPA route jumps) and title changes (SPA title updates).
// Both can change the exemption verdict, so re-evaluate; never inject scripts into web pages (DESIGN.md §5).
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    // Wait for refresh to finish settlement/rollover before evaluating the navigation reminder, to avoid dirty reads at the day boundary;
    // and only remind for the active tab the user is looking at — background tab auto-refresh/jumps must not disturb the user.
    refresh('tab-navigated').then(() => {
      if (tab.active) notifyOnNavigation();
    });
  } else if (changeInfo.title) {
    refresh('tab-title');
  }
});
