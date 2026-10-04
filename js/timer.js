// FocusQuota - Copyright (C) 2026 Achilles Newman
// SPDX-License-Identifier: GPL-3.0-or-later
// This file is part of FocusQuota, licensed under GNU GPL v3.0 or later; see LICENSE in the project root.

// FocusQuota — timing engine (phase 2: core timing)
// State machine: idle / timing. A single timing session: the old session is settled and a new one
// opened only when "should be timing" actually flips, so at most one session exists at any moment
// (DESIGN.md §12 issue A).
// Optimization: if "should be timing" did not change around this event (e.g. switching between two
// tabs that both time / both exempt, or an SPA title change with an unchanged exemption verdict),
// skip settlement and storage writes; only the periodic alarm (every minute) forces one settlement
// as a safety net (keeps usageSeconds/badge from lagging and bounds single-session length).
// Sleep miscount guard (issue C): a single session longer than MAX_SESSION_MS is treated as
// sleep / system clock anomaly and discarded wholesale.
// Persistence (issue B): write through to chrome.storage.local right after settling (via storage.js).
import { getConfig, setUsage, rolloverIfNeeded } from './storage.js';
import { isExempt } from './exempt.js';
import { checkAndNotify } from './notify.js';

// Single-session length cap: longer sessions are treated as sleep / clock anomaly and discarded wholesale.
// 30 minutes: tolerates Chrome's background throttling of alarms (a single session almost never exceeds 30 min in normal use);
// sleep durations far exceed this, so they are still correctly discarded — the sleep guard stays effective.
const MAX_SESSION_MS = 30 * 60 * 1000;

// Timing-session persistence key: after SW reclaim/restart, settle using the stored start timestamp — nothing lost
const SESSION_KEY = 'timingSession';

const state = {
  sessionStart: null, // number | null, current session start timestamp (in-memory mirror)
  activeTab: null, // { windowId, tabId, url, title } | null
};

// Idle detection (do not keep timing when the user walks away but the Chrome window stays focused):
// chrome.idle fires the idle event after ~IDLE_DETECT_SECONDS seconds without keyboard/mouse input.
// User's choice: 1 minute without input counts as idle → stop timing as soon as the event arrives
// (the API's default 60-second interval is all we need).
// Audible pages (tab.audible) are never idle: video/music keeps timing even without input.
export const IDLE_DETECT_SECONDS = 60; // chrome.idle.setDetectionInterval interval (seconds); single source of truth
let isIdle = false; // system idle flag

// Called by background on chrome.idle.onStateChanged: idle=true means idle, false means active again
function setIdleMark(idle) {
  isIdle = idle;
}

// Serialize refresh: concurrent events must not interleave settlement/timing
let chain = Promise.resolve();
function refresh(reason = 'event') {
  chain = chain
    .then(() => doRefresh(reason))
    .catch((err) => console.error('[timer] refresh failed:', err));
  return chain;
}

// Find the currently trackable page; null means "do not time". config is read once by the caller and passed in.
async function currentTrackable(config) {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs && tabs[0];
  if (!tab || tab.id === chrome.tabs.TAB_ID_NONE) return null;
  const win = await chrome.windows.get(tab.windowId);
  if (!win || !win.focused) return null; // window blurred/minimized → do not time
  // Idle check: system idle (~1 min without input) and page silent → user walked away, do not time
  if (isIdle && !tab.audible) return null;
  if (isExempt(tab.url, tab.title, config)) return null; // exemption rules (phase 3)
  return { windowId: tab.windowId, tabId: tab.id, url: tab.url, title: tab.title };
}

// Settle the current timing session: add [session start, now] to usageSeconds.
// The session start prefers storage (survives SW lifetimes); memory is the mirror — the two agree.
// config comes from the caller and is reused by checkAndNotify, avoiding duplicate reads in one cycle.
async function settle(reason, config) {
  const usage = await rolloverIfNeeded(); // Daily rollover: zero out across the day boundary first (DESIGN.md §7), then return the fresh usage
  const stored = await chrome.storage.local.get(SESSION_KEY);
  const persistedStart =
    stored[SESSION_KEY] && typeof stored[SESSION_KEY].start === 'number'
      ? stored[SESSION_KEY].start
      : null;
  const start = persistedStart !== null ? persistedStart : state.sessionStart;
  state.sessionStart = null; // Settling closes the current session (cleared from both memory and storage)
  if (start === null) return;
  await chrome.storage.local.remove(SESSION_KEY);
  const diff = Date.now() - start;
  if (diff < 0 || diff > MAX_SESSION_MS) {
    console.warn(
      `[timer] discarded abnormal session ${Math.round(diff / 1000)}s (${reason}; possibly sleep or system clock change)`
    );
    return;
  }
  const seconds = Math.round(diff / 1000);
  if (seconds <= 0) return;
  usage.usageSeconds += seconds;
  await setUsage(usage);
  await checkAndNotify(config, usage); // Quota reminder: badge update / notify when quota reached (phase 5)
  console.log(`[timer] settled +${seconds}s (${reason}); ${usage.usageSeconds}s total today`);
}

// Refresh timing state: settle the old session and decide whether to open a new one
// only when "should be timing" flipped or this is the periodic alarm safety net;
// otherwise keep the current session untouched with no storage writes at all.
async function doRefresh(reason) {
  const config = await getConfig(); // Read once per cycle; passed down to currentTrackable/settle for reuse
  const tab = await currentTrackable(config);
  const wasTiming = state.sessionStart !== null;
  const shouldTime = tab !== null;
  const forceSettle = reason === 'alarm' || wasTiming !== shouldTime;

  if (!forceSettle) {
    state.activeTab = tab; // Update the reference for logging/debugging; no settlement triggered
    return;
  }

  await settle(reason, config);
  if (shouldTime) {
    state.activeTab = tab;
    state.sessionStart = Date.now();
    // Persist the session start: correct settlement even after SW reclaim (fixes issue B at the root)
    await chrome.storage.local.set({ [SESSION_KEY]: { start: state.sessionStart } });
    console.log(`[timer] start timing: ${tab.title || '(untitled)'} (${tab.url})`);
  } else {
    state.activeTab = null;
    state.sessionStart = null;
    await chrome.storage.local.remove(SESSION_KEY);
    console.log('[timer] stop timing');
  }
}

export { refresh, setIdleMark };
