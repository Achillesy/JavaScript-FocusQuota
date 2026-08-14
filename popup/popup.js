// FocusQuota — Popup（阶段 0：占位内容）
// 从 manifest 读取版本号显示，避免版本号在页面中硬编码。
const versionEl = document.getElementById('version');
versionEl.textContent = chrome.runtime.getManifest().version;
