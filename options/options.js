// FocusQuota - Copyright (C) 2026 Achilles Newman
// SPDX-License-Identifier: GPL-3.0-or-later
// This file is part of FocusQuota, licensed under GNU GPL v3.0 or later; see LICENSE in the project root.

// FocusQuota — Options (phase 6): edit daily quota / domain allowlist / title keywords
// Reuses js/storage.js (setConfig validates); storage is the single source of truth.
import { getConfig, setConfig } from '../js/storage.js';
import { applyI18n } from '../js/i18n.js';

const state = {
  dailyLimitMinutes: 120,
  excludedDomains: [],
  titleKeywords: [],
};

function renderList(ulId, items, onRemove) {
  const ul = document.getElementById(ulId);
  ul.textContent = '';
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item;
    const btn = document.createElement('button');
    btn.textContent = chrome.i18n.getMessage('optionsRemove');
    btn.className = 'remove';
    btn.addEventListener('click', () => onRemove(item));
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

function render() {
  document.getElementById('limit-input').value = String(state.dailyLimitMinutes);
  renderList('domain-list', state.excludedDomains, (item) => removeItem('excludedDomains', item));
  renderList('keyword-list', state.titleKeywords, (item) => removeItem('titleKeywords', item));
}

function removeItem(key, item) {
  state[key] = state[key].filter((v) => v !== item);
  render();
}

function setupAdd(inputId, btnId, listKey) {
  const input = document.getElementById(inputId);
  const addItem = () => {
    const value = input.value.trim();
    if (!value) return;
    if (!state[listKey].includes(value)) state[listKey].push(value);
    input.value = '';
    render();
  };
  document.getElementById(btnId).addEventListener('click', addItem);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addItem();
  });
}

async function load() {
  const config = await getConfig();
  state.dailyLimitMinutes = config.dailyLimitMinutes;
  state.excludedDomains = [...config.excludedDomains];
  state.titleKeywords = [...config.titleKeywords];
  render();
}

document.getElementById('save').addEventListener('click', async () => {
  const raw = Number(document.getElementById('limit-input').value);
  // setConfig validates internally: an invalid quota (non-positive-integer) falls back to the default
  const config = await setConfig({
    dailyLimitMinutes: raw,
    excludedDomains: state.excludedDomains,
    titleKeywords: state.titleKeywords,
  });
  // Sync the UI state with the validated result
  state.dailyLimitMinutes = config.dailyLimitMinutes;
  state.excludedDomains = [...config.excludedDomains];
  state.titleKeywords = [...config.titleKeywords];
  render();

  // Saving means the user is done with the options page — close immediately, no fixed-delay wait
  const tab = await chrome.tabs.getCurrent();
  if (tab && tab.id != null) {
    chrome.tabs.remove(tab.id);
  } else {
    window.close();
  }
});

// Sync state live while typing the quota, so a later render() (e.g. list add/remove) doesn't clobber user input
document.getElementById('limit-input').addEventListener('input', (e) => {
  state.dailyLimitMinutes = Number(e.target.value);
});

setupAdd('domain-input', 'domain-add', 'excludedDomains');
setupAdd('keyword-input', 'keyword-add', 'titleKeywords');

applyI18n();

// Hide China-only sponsor QR codes (WeChat Pay/Alipay) on non-Chinese UIs; the Ko-fi link stays
if (!chrome.i18n.getUILanguage().startsWith('zh')) {
  document.querySelectorAll('.sponsor-cn, .sponsor-qr').forEach((el) => el.remove());
}

load();
