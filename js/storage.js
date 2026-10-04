// FocusQuota - Copyright (C) 2026 Achilles Newman
// SPDX-License-Identifier: GPL-3.0-or-later
// This file is part of FocusQuota, licensed under GNU GPL v3.0 or later; see LICENSE in the project root.

// FocusQuota — chrome.storage.local read/write wrapper with validation
// Phase 1: all config and usage access goes through this module.
// storage.local is the single source of truth; invalid input is fixed or falls back to defaults here.
import { DEFAULT_CONFIG } from './defaults.js';

const CONFIG_KEY = 'config';
const USAGE_KEY = 'usage';

// ---- local helpers ----

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Today's local date, YYYY-MM-DD (DESIGN.md §7: stats are per local date)
function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Positive-integer check (dailyLimitMinutes must be a positive integer)
function isValidPositiveInt(v) {
  return Number.isInteger(v) && v > 0;
}

// Sanitize a string array: drop empties, trim, dedupe; return null if not an array
function sanitizeStringArray(v) {
  if (!Array.isArray(v)) return null;
  const seen = new Set();
  const cleaned = [];
  for (const item of v) {
    const s = String(item).trim();
    if (s.length > 0 && !seen.has(s)) {
      seen.add(s);
      cleaned.push(s);
    }
  }
  return cleaned;
}

// Validate config field by field; invalid fields fall back to defaults
function sanitizeConfig(raw) {
  const out = {};
  out.dailyLimitMinutes = isValidPositiveInt(raw.dailyLimitMinutes)
    ? raw.dailyLimitMinutes
    : DEFAULT_CONFIG.dailyLimitMinutes;

  const domains = sanitizeStringArray(raw.excludedDomains);
  out.excludedDomains = domains !== null ? domains : [...DEFAULT_CONFIG.excludedDomains];

  const keywords = sanitizeStringArray(raw.titleKeywords);
  out.titleKeywords = keywords !== null ? keywords : [...DEFAULT_CONFIG.titleKeywords];
  return out;
}

function sanitizeUsage(raw) {
  return {
    usageSeconds:
      Number.isInteger(raw.usageSeconds) && raw.usageSeconds >= 0 ? raw.usageSeconds : 0,
    usageDate:
      typeof raw.usageDate === 'string' && raw.usageDate.length > 0
        ? raw.usageDate
        : todayString(),
  };
}

// ---- config read/write ----

// Read config; if never written or the stored value is invalid, write back the (sanitized) defaults and return them.
export async function getConfig() {
  const stored = await chrome.storage.local.get(CONFIG_KEY);
  const raw = stored[CONFIG_KEY];
  const hasStored = raw !== undefined && raw !== null;
  const merged = { ...DEFAULT_CONFIG, ...(isPlainObject(raw) ? raw : {}) };
  const config = sanitizeConfig(merged);
  const dirty = !hasStored || JSON.stringify(config) !== JSON.stringify(merged);
  if (dirty) {
    await chrome.storage.local.set({ [CONFIG_KEY]: config });
  }
  return config;
}

// Merge-update config: only the three whitelisted fields are accepted, unknown fields ignored; invalid values fall back to defaults.
// Returns the full updated and validated config.
export async function setConfig(partial) {
  const current = await getConfig();
  const allowed = {};
  if ('dailyLimitMinutes' in partial) allowed.dailyLimitMinutes = partial.dailyLimitMinutes;
  if ('excludedDomains' in partial) allowed.excludedDomains = partial.excludedDomains;
  if ('titleKeywords' in partial) allowed.titleKeywords = partial.titleKeywords;
  const merged = { ...current, ...allowed };
  const config = sanitizeConfig(merged);
  await chrome.storage.local.set({ [CONFIG_KEY]: config });
  return config;
}

// ---- usage read/write ----

// Read usage; if never written, return { usageSeconds: 0, usageDate: today } and persist it.
export async function getUsage() {
  const stored = await chrome.storage.local.get(USAGE_KEY);
  const raw = stored[USAGE_KEY];
  if (isPlainObject(raw)) {
    return sanitizeUsage(raw);
  }
  const usage = sanitizeUsage({ usageSeconds: 0, usageDate: todayString() });
  await chrome.storage.local.set({ [USAGE_KEY]: usage });
  return usage;
}

// Write usage as a whole (already validated).
export async function setUsage(usage) {
  const clean = sanitizeUsage(usage);
  await chrome.storage.local.set({ [USAGE_KEY]: clean });
  return clean;
}

// ---- daily rollover ----

// Daily rollover (DESIGN.md §7): if usageDate != today, set usageSeconds=0 and usageDate=today.
// Uses the local date (YYYY-MM-DD), not a rolling 24-hour window.
// Rollover logic lives only here; all triggers (settlement / SW startup / alarms) reuse it.
export async function rolloverIfNeeded() {
  const usage = await getUsage();
  const today = todayString();
  if (usage.usageDate !== today) {
    const reset = { usageSeconds: 0, usageDate: today };
    await chrome.storage.local.set({ [USAGE_KEY]: reset });
    console.log('[storage] daily rollover:', reset);
    return reset;
  }
  return usage; // repeated checks on the same day never zero out twice
}
