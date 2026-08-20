// FocusQuota - Copyright (C) 2026 Achilles Newman
// SPDX-License-Identifier: GPL-3.0-or-later
// 本文件是 FocusQuota 的一部分，依据 GNU GPL v3.0 或更高版本授权；详见项目根目录 LICENSE。

// FocusQuota — Options（阶段 6）：编辑每日额度 / 域名白名单 / 标题关键词
// 复用 js/storage.js（setConfig 负责校验），storage 为单一数据源。
import { getConfig, setConfig } from '../js/storage.js';

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
    btn.textContent = '删除';
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
  // setConfig 内部校验：非法额度（非正整数）回退默认值
  const config = await setConfig({
    dailyLimitMinutes: raw,
    excludedDomains: state.excludedDomains,
    titleKeywords: state.titleKeywords,
  });
  // 用校验后的结果同步界面状态
  state.dailyLimitMinutes = config.dailyLimitMinutes;
  state.excludedDomains = [...config.excludedDomains];
  state.titleKeywords = [...config.titleKeywords];
  render();

  // 保存即视为用户已决心离开设置页，立即关闭，无需固定延时等待
  const tab = await chrome.tabs.getCurrent();
  if (tab && tab.id != null) {
    chrome.tabs.remove(tab.id);
  } else {
    window.close();
  }
});

// 输入额度时实时同步 state，避免后续 render()（如增删列表项）覆盖用户输入
document.getElementById('limit-input').addEventListener('input', (e) => {
  state.dailyLimitMinutes = Number(e.target.value);
});

setupAdd('domain-input', 'domain-add', 'excludedDomains');
setupAdd('keyword-input', 'keyword-add', 'titleKeywords');
load();
