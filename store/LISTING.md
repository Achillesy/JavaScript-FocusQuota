# FocusQuota — Chrome Web Store 上架资料

> 填写顺序：Store listing → Privacy practices → Distribution。
> 截图与宣传图在本目录：`shot_options.png`、`shot_popup.png`（1280×800，英文版）、`promo_440x280.png`（440×280）。
> 中文版截图为 `shot_options_zh.png`、`shot_popup_zh.png`（供中文版 listing 用）。

## Store listing

- **Name（名称）**: `FocusQuota`
- **Short description（摘要，≤132 字符）**:
  `A gentle daily quota for casual browsing. FocusQuota reminds you when time is up — it never blocks any website.`
- **Category（类别）**: Productivity
- **Language（语言）**: English

### Detailed description（完整描述）

```
FocusQuota helps you keep casual browsing within a daily limit — with a gentle reminder, never a block.

How it works
• Set a daily quota in minutes (default 120).
• FocusQuota quietly tracks time spent on ordinary browsing in the active tab.
• When you reach your quota, you get a friendly notification — that's it. No website is ever blocked or redirected.
• Idle time doesn't count: if there's no keyboard or mouse input for about a minute and the page is silent, the timer pauses.
• A domain whitelist and title keywords let you exempt work sites (e.g. chatgpt.com) or apps (e.g. Blender) from the quota.

Privacy first
• Everything runs locally in your browser. Your browsing data never leaves your device — no accounts, no servers, no analytics.
• Open source under GPL-3.0: https://github.com/Achillesy/JavaScript-FocusQuota

Note: the extension's interface is currently in Simplified Chinese.
```

## Privacy practices（隐私问卷）

- **Single purpose（单一用途）**:
  `Help users limit daily casual browsing time through reminders, without blocking any website.`
- **Does your extension collect or use user data?** 读取当前活动标签页的 URL/标题，仅在内存中瞬时判断，不落盘、不建历史 → 按问卷如实选：
  - **Browsing activity**（勾选）— 用途：读取当前活动标签页的 URL/标题，在内存中实时判断是否计入每日普通上网用时，判断完即弃、不存储；落盘的只有累计用时秒数与用户设置，**不传输、不共享、不出售**。
  - 其余数据类型不勾选。
- **Data usage / handling disclosure**:
  `The extension reads the active tab's URL and page title in memory, only to decide whether the current page counts toward the daily quota. The URL and title are never stored, and no history is built. Only the accumulated browsing time (seconds) and the user's settings are stored in the browser's local storage on the device, and nothing is ever transmitted, shared, or sold.`
- **Permission justifications（权限说明）**:
  - `storage` — Stores quota settings, whitelist, and today's usage counters locally on the device.
  - `tabs` — Reads the active tab's URL and title to decide whether the current page counts toward the daily quota. Only the active tab is ever read; the background timer has no user gesture, so `activeTab` cannot substitute. Nothing is transmitted.
  - `alarms` — Wakes the extension periodically to update the timer.
  - `notifications` — Shows a reminder when the daily quota is reached.
  - `idle` — Detects system idle state so idle time is not counted as browsing.
- **Remote code**: 无。所有代码随包发布，不加载任何外部脚本。

## Distribution（发行）

- **Visibility（可见性）**: 待用户定 — Public / Unlisted / Private
- **定价**: 免费

## 备注

- 商店商品 URL 在首次上传 ZIP 建好 item 后产生，形如 `https://chromewebstore.google.com/detail/<32位ID>`，
  拿到后回填到 README 安装节，并把"未上架"相关文字改掉。
- manifest 版本已升到 1.0.0（商店首发版）。
