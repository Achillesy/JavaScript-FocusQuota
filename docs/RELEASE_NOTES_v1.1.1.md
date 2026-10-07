## v1.1.1 — 英文优先

### 变更
- **默认语言改为英文**：`manifest.json` 的 `default_locale` 由 `zh_CN` 改为 `en`；未列出的语言统一回落到英文
- 全部代码注释与 `console` 日志改为英文（`background.js`、`js/*`、`popup/*`、`options/*`）
- 扩展简介 `appDescription` 改为强调定位（中英同步）：

  > A gentle daily quota for casual browsing — gentler than a Pomodoro timer. Reminds, never blocks.

- 修复 Popup 中一处已失效的 i18n 引用（旧版遗留的 `remaining-min` 元素，`popup.js`）

### 文档与商店素材
- README 拆分为英文优先的 `README.md` 与 `README_zh.md`，中文设计文档移入 `docs/`
- 新增英文商店长描述 `store/LISTING.en.md`
- 商店截图重制并统一为 1280×800；新增中文版截图（`screenshots/`、`store/`）
- 新增 `.gitignore`，忽略 `dist/` 构建产物

### 兼容性与隐私
- **未新增任何权限**：仍为 `storage` / `tabs` / `alarms` / `notifications` / `idle`
- 无新增网络请求，仍为完全本地运行
- `PRIVACY.md` 措辞更新：明确 URL 与页面标题**仅在内存中**用于豁免判定，不落盘、不建浏览历史

### 测试说明
- 静态校验通过：`node scripts/check-locales.mjs`

  ```
  FocusQuota locale check
    locales:    en=29, zh_CN=29  [default: en]
    references: 29 key(s) from 6 file(s)

  OK: locale check passed (0 errors, 0 warning(s)).
  ```

  校验覆盖：中英 29 个文案 key 一一对应；`$named$` 占位符两语言一致且均已声明；
  HTML（`data-i18n*`）、JS（`chrome.i18n.getMessage`）、manifest（`__MSG_*__`）的引用全部可解析。

- **未在真实浏览器中加载验证**（VM 无桌面 Chrome），发布前请用「加载已解压的扩展程序」实测一遍

### 说明
- 商店版会自动更新，无需手动操作
- `default_locale` 变更不涉及权限，无需用户重新授权，走标准审核流程
