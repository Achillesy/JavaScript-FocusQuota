# FocusQuota — Implementation Plan

本文件是 FocusQuota 的实施步骤蓝图，与 DESIGN.md 配套使用。DeepCode 与 Codex 均可按本文件执行。

## 使用规则（给 AI 工具）

执行项目时必须遵守：

1. **一次只做一个阶段**，按顺序执行，不得跳级。
2. 开始每个阶段前，先阅读 `DESIGN.md` 和本文件中该阶段的内容。
3. 动手写代码前，先口头给出本阶段的实现计划（涉及文件、数据结构、用到的 Chrome API），等用户确认。
4. 只实现当前阶段范围的内容，不提前实现后续阶段的逻辑。
5. 每阶段完成后，说明：做了什么、每个文件的作用、如何在 Chrome 中验证。
6. 严格按每阶段的「验收标准」逐项自测，未通过不得宣称完成。
7. 权限最小化：manifest 中按需添加权限，每添加一项要说明理由。
8. 环境信息（路径、工具、Git 分工）见 DESIGN.md 第 18~20 节，不违反其中的约束。

## 总览

阶段之间有依赖关系，必须按顺序执行：

```text
阶段 0  项目骨架（可加载的最小 MV3 扩展）
  ↓
阶段 1  配置与存储层（默认配置 + chrome.storage.local）
  ↓
阶段 2  核心计时引擎（单一计时器 + 活跃判定 + 持久化）
  ↓
阶段 3  豁免规则（域名白名单 + 标题关键词 + 特殊页面）
  ↓
阶段 4  每日重置（按本地日期重置统计）
  ↓
阶段 5  额度提醒（达到额度后提醒，不阻止访问）
  ↓
阶段 6  UI（Popup 查看 + Options 编辑）
  ↓
阶段 7  验收（逐条对照 DESIGN.md 第 23 节完成标准）
```

## 建议目录结构

```text
FocusQuota/
├── manifest.json
├── DESIGN.md
├── IMPLEMENTATION.md
├── background.js        # Service Worker（计时引擎入口）
├── js/
│   ├── defaults.js      # 默认配置（集中定义）
│   ├── storage.js       # chrome.storage.local 读写封装
│   ├── exempt.js        # 豁免规则匹配（白名单/关键词/特殊页面）
│   └── timer.js         # 计时逻辑（单一计时器）
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/
│   ├── options.html
│   ├── options.js
│   └── options.css
└── icons/               # 扩展图标（可先用简单占位图标）
```

说明：以上是建议结构，AI 工具如提出等价且更简单的结构，说明理由后可调整，但必须保持「默认配置集中定义」「计时与匹配逻辑独立成模块」两条约束。

---

## 阶段 0：项目骨架

- **目标**：Chrome 能加载一个最小的 MV3 扩展，点击工具栏图标能弹出 Popup。
- **涉及文件**：`manifest.json`、`popup/popup.html`、`popup/popup.js`、`popup/popup.css`、`icons/`（占位图标）、`background.js`（空壳或最小内容）。

**任务：**

1. 创建 `manifest.json`：Manifest V3、`action` 指向 popup、声明 `background.service_worker`。
2. 创建最小 `popup.html`：显示扩展名称和一句占位文字（如「FocusQuota」+ 版本号）。
3. 添加占位图标（可用简单 PNG，或先用无图标加载，说明取舍）。
4. 本阶段 manifest **不添加任何权限**，后续阶段按需添加。

**验收标准：**

- [ ] `chrome://extensions` 开启开发者模式后能加载本扩展，无报错。
- [ ] 工具栏出现扩展图标。
- [ ] 点击图标弹出 Popup，显示占位内容。
- [ ] Service Worker 注册成功（扩展详情页可见）。

**给 AI 的提示（prompt 模板）：**

```text
项目路径：/mnt/d/Users/Achilles/Workspace_02Tested/JavaScript/FocusQuota
请先阅读 DESIGN.md 和 IMPLEMENTATION.md 的「阶段 0」部分。
本次任务：实现阶段 0「项目骨架」。
要求：
1. 先给出实现计划（涉及哪些文件、manifest 结构），我确认后再写代码；
2. 完成后说明每个文件的作用，以及我在 Chrome 中如何验证；
3. 不要实现阶段 1 及以后的内容。
```

---

## 阶段 1：配置与存储层

- **目标**：默认配置集中定义，能通过 `chrome.storage.local` 读写；首次运行自动写入默认值。
- **涉及文件**：`js/defaults.js`、`js/storage.js`、`background.js`（加载这两个模块）。

**任务：**

1. `js/defaults.js`：集中定义默认配置对象，包括：
   - `dailyLimitMinutes`（默认 120）
   - `excludedDomains`（默认可参考 DESIGN.md 第 16 节示例，但必须可由用户编辑）
   - `titleKeywords`（同上）
2. `js/storage.js`：封装存储读写：
   - `getConfig()`：读取配置；若从未写入，则写入默认值并返回。
   - `setConfig(partial)`：合并更新配置。
   - `getUsage()` / `setUsage(usage)`：读写统计（`usageSeconds`、`usageDate`）。
3. 简单校验：`dailyLimitMinutes` 必须为正数，否则拒绝或回退默认值。
4. 本阶段 manifest 添加 `storage` 权限（说明理由）。

**验收标准：**

- [ ] 扩展重新加载后，`chrome.storage.local` 中出现默认配置。
- [ ] 修改配置值后再次读取，能读到新值；扩展重启后数据保留。
- [ ] 非法输入（如负数额度）被拒绝或修正。
- [ ] 所有默认值只存在于 `js/defaults.js`，全项目无第二处硬编码。

**给 AI 的提示（prompt 模板）：**

```text
项目路径：/mnt/d/Users/Achilles/Workspace_02Tested/JavaScript/FocusQuota
请先阅读 DESIGN.md 和 IMPLEMENTATION.md 的「阶段 1」部分。
本次任务：实现阶段 1「配置与存储层」。
要求：
1. 先给出实现计划（数据结构和 storage 封装方案），我确认后再写代码；
2. 完成后说明每个文件的作用、如何在 Service Worker 控制台验证读写；
3. 不要实现阶段 2 及以后的内容。
```

---

## 阶段 2：核心计时引擎

- **目标**：浏览器活跃且当前页为普通页面时准确累计时间；同一时刻最多一个计时器；睡眠/重启不产生虚假时长；状态可持久化恢复。
- **涉及文件**：`js/timer.js`、`background.js`（事件监听 + 计时调度）、`manifest.json`（按需加 `tabs` 权限，说明理由）。

**任务：**

1. 事件监听（在 `background.js`）：
   - `chrome.tabs.onActivated`（标签页切换）
   - `chrome.windows.onFocusChanged`（窗口焦点变化）
   - `chrome.tabs.onRemoved`（标签页关闭）
   - `chrome.tabs.onUpdated`（页面导航、title 变化，本阶段至少处理导航）
2. 活跃判定：窗口 focused + 当前 tab active + 当前页为普通页面（特殊页面判定可先引用阶段 3 的模块骨架，或在本阶段先做最小判定，阶段 3 完善）。
3. 单一计时器（对应 DESIGN.md 第 12 节问题 A）：状态切换时先结算旧状态，再决定是否开启新计时；保证同一时刻只有一个计时区间。
4. 防休眠误计（问题 C）：结算时若时间差异常大（阈值由实现决定，建议不超过数分钟），丢弃该段，并给出理由。
5. 持久化（问题 B）：计时开始记录时间戳，结算时累加 `usageSeconds` 并立即写入 `chrome.storage.local`；不得只存在内存变量。
6. 用 `chrome.alarms` 做周期结算（如每分钟），防止 Service Worker 被回收时丢失未结算时长；SW 启动时从 storage 恢复状态。
7. 本阶段添加 `tabs` 权限（理由：后台需要读取当前标签页的 URL 与 title 以判断是否计时）。

**验收标准：**

- [ ] 打开普通网页停留，`usageSeconds` 随时间增加。
- [ ] 切换标签页、切换窗口、最小化 Chrome，计时停止；切回后继续。
- [ ] 日志或数据证明同一时刻不存在两个计时区间。
- [ ] 模拟睡眠（如手工把结算时间戳改大）不会产生 8 小时虚假时长。
- [ ] 扩展/浏览器重启后，统计值不丢失且能继续累计。
- [ ] 特殊页面（`chrome://` 等）不计时。

**给 AI 的提示（prompt 模板）：**

```text
项目路径：/mnt/d/Users/Achilles/Workspace_02Tested/JavaScript/FocusQuota
请先阅读 DESIGN.md 和 IMPLEMENTATION.md 的「阶段 2」部分。
本次任务：实现阶段 2「核心计时引擎」。
要求：
1. 先给出实现计划：状态机设计（何时开始/结算/持久化）、如何保证单一计时器、如何防休眠误计；
2. 特别说明：tab 切换与窗口失焦的结算时序、Service Worker 被回收时如何用 alarms 兜底；
3. 我确认计划后再写代码；完成后给出验证步骤（含如何在 Service Worker 控制台查看状态）；
4. 不要实现阶段 3 的完整豁免逻辑，本阶段先做最小页面判定。
```

---

## 阶段 3：豁免规则

- **目标**：域名白名单、标题关键词、特殊页面三类豁免全部生效，SPA title 变化能触发重新判定。
- **涉及文件**：`js/exempt.js`、`background.js`（接入豁免判定）。

**任务：**

1. `js/exempt.js` 实现：
   - 域名匹配：提取当前页 hostname；白名单项匹配「hostname 等于白名单项」或「hostname 以 `.白名单项` 结尾」（使 `www.chatgpt.com` 匹配 `chatgpt.com`，而 `notchatgpt.com` 不匹配）。
   - 标题关键词：title 包含任一关键词（建议不区分大小写，说明理由）。
   - 特殊页面：`chrome://`、`chrome-extension://`、`about:`、`file:` 一律不计时。
2. 接入计时引擎：每次状态切换时评估当前 tab 是否豁免，豁免则不计时。
3. 标题变化监听：用 `chrome.tabs.onUpdated` 的 `changeInfo.title` 捕获 SPA 页面标题变化并触发重新判定；**不得注入网页脚本**（DESIGN.md 第 5 节）。
4. 白名单/关键词配置变更后，下一次评估立即生效。

**验收标准：**

- [ ] 白名单域名不计时。
- [ ] `www.` 前缀域名与裸域名视为同一站点。
- [ ] `notchatgpt.com` 不因包含 `chatgpt.com` 而被豁免。
- [ ] 标题含关键词的页面不计时；不含关键词的普通页计时。
- [ ] YouTube 打开含「Blender」的视频标题后，从计时变为不计时（SPA title 变化）。
- [ ] `chrome://`、`file:` 等特殊页面不计时。

**给 AI 的提示（prompt 模板）：**

```text
项目路径：/mnt/d/Users/Achilles/Workspace_02Tested/JavaScript/FocusQuota
请先阅读 DESIGN.md 和 IMPLEMENTATION.md 的「阶段 3」部分。
本次任务：实现阶段 3「豁免规则」。
要求：
1. 先给出实现计划：域名匹配算法、title 变化监听方式；
2. 演示并解释为什么 `notchatgpt.com` 不会被误判为白名单 `chatgpt.com`；
3. 我确认计划后再写代码；完成后给出各场景的验证方法。
```

---

## 阶段 4：每日重置

- **目标**：按用户本地日期重置统计；跨日、SW 重启等场景下正确重置。
- **涉及文件**：`js/timer.js`、`js/storage.js`、`background.js`。

**任务：**

1. 在以下时机检查「今日」：计时结算时、SW 启动时、`chrome.alarms` 触发时。
2. 判断规则（DESIGN.md 第 7 节）：若 `usageDate != today`，则 `usageSeconds = 0`、`usageDate = today`。
3. 使用本地日期（`YYYY-MM-DD`），不使用 24 小时滚动窗口。
4. 重置逻辑集中为一个函数，所有时机复用。

**验收标准：**

- [ ] 修改系统日期为次日并触发一次结算，统计归零且 `usageDate` 更新为次日。
- [ ] 归零后重新浏览，新一天的统计正确累计。
- [ ] 当日多次检查不会重复归零。

**给 AI 的提示（prompt 模板）：**

```text
项目路径：/mnt/d/Users/Achilles/Workspace_02Tested/JavaScript/FocusQuota
请先阅读 DESIGN.md 和 IMPLEMENTATION.md 的「阶段 4」部分。
本次任务：实现阶段 4「每日重置」。
要求：
1. 先给出实现计划：重置函数设计、所有触发时机；
2. 说明如何通过修改系统日期在 Chrome 中验证跨日重置；
3. 我确认计划后再写代码。
```

---

## 阶段 5：额度提醒

- **目标**：达到每日额度后提醒用户，且完全不阻止访问。
- **涉及文件**：`js/timer.js` 或新增 `js/notify.js`、`background.js`、`manifest.json`（添加 `notifications` 权限，说明理由）。

**任务：**

1. 额度判定：`usageSeconds >= dailyLimitMinutes * 60`。
2. 提醒方式（DESIGN.md 第 2.1 节，只提醒不阻止）：
   - `chrome.notifications` 弹一次性通知（如「今日普通上网时间已达到 120 分钟」）。
   - `chrome.action.setBadgeText` 在图标上持续显示（如「满」或剩余分钟数）。
3. 防打扰：同一天达到额度后只弹一次通知，后续以 badge 持续提示。
4. 绝不执行：重定向、关闭标签页、阻塞页面、修改网页内容（DESIGN.md 第 2.1 节）。

**验收标准：**

- [ ] 达到额度时弹出通知一次。
- [ ] 图标 badge 显示持续提示。
- [ ] 达到额度后仍可正常访问任意网页。
- [ ] 同日不会反复弹通知。
- [ ] 额度被调大后，次日（或重置后）按新额度重新计算。

**给 AI 的提示（prompt 模板）：**

```text
项目路径：/mnt/d/Users/Achilles/Workspace_02Tested/JavaScript/FocusQuota
请先阅读 DESIGN.md 和 IMPLEMENTATION.md 的「阶段 5」部分。
本次任务：实现阶段 5「额度提醒」。
要求：
1. 先给出实现计划：通知触发条件、防重复策略、badge 内容；
2. 说明为什么本实现满足「只提醒不阻止」；
3. 我确认计划后再写代码；完成后给出验证步骤。
```

---

## 阶段 6：UI（Popup 与 Options）

- **目标**：Popup 查看今日使用/额度/剩余；Options 编辑额度、白名单、关键词。
- **涉及文件**：`popup/*`、`options/*`、`background.js`（如需暴露状态）。

**任务：**

1. Popup：
   - 显示：今日已使用、今日额度、剩余时间（如「43 / 120 分钟，剩余 77 分钟」）。
   - 打开时从 storage 读取最新值；数据在计时中被修改时，通过 `chrome.storage.onChanged` 或重新读取保持同步。
2. Options：
   - 编辑每日额度（数字输入）。
   - 编辑域名白名单（列表增删）。
   - 编辑标题关键词（列表增删）。
   - 保存后写入 storage，并提示成功。
3. 不使用任何前端框架（DESIGN.md 第 22 节），原生 HTML/CSS/JS 即可。
4. 配置修改后，计时/豁免逻辑立即生效（storage 为单一数据源）。

**验收标准：**

- [ ] Popup 数字与 Service Worker 中 storage 数据一致。
- [ ] Options 修改额度后，Popup 显示新额度，计时判定随之变化。
- [ ] Options 增删白名单/关键词后，豁免行为立即变化。
- [ ] Popup/Options 打开、切换、保存均无报错。

**给 AI 的提示（prompt 模板）：**

```text
项目路径：/mnt/d/Users/Achilles/Workspace_02Tested/JavaScript/FocusQuota
请先阅读 DESIGN.md 和 IMPLEMENTATION.md 的「阶段 6」部分。
本次任务：实现阶段 6「Popup 与 Options UI」。
要求：
1. 先给出实现计划：页面结构、与 storage 的数据流；
2. 不使用任何前端框架，保持简单；
3. 我确认计划后再写代码；完成后给出各功能的验证步骤。
```

---

## 阶段 7：验收

- **目标**：逐条对照 DESIGN.md 第 23 节「第一阶段完成标准」验收，补齐遗漏。
- **涉及文件**：按验收结果修改相关文件。

**任务：**

1. 逐条核对 DESIGN.md 第 23 节全部条目（约 21 项），每项在 Chrome 中实际验证。
2. 记录每项的验证结果；未通过的项，回到对应阶段修复。
3. 最终自查：
   - 无上传任何浏览数据（DESIGN.md 第 9 节）。
   - 无多余权限。
   - 默认配置仍集中定义，无散落硬编码。
   - 全程未注入网页脚本、未修改网页内容。

**验收标准：**

- [ ] DESIGN.md 第 23 节全部条目通过。
- [ ] 隐私原则与权限最小化复查通过。
- [ ] 可交付：加载扩展后完整走通「配置 → 计时 → 豁免 → 重置 → 提醒 → 查看」全流程。

**给 AI 的提示（prompt 模板）：**

```text
项目路径：/mnt/d/Users/Achilles/Workspace_02Tested/JavaScript/FocusQuota
请先阅读 DESIGN.md（重点第 23 节）和 IMPLEMENTATION.md 的「阶段 7」部分。
本次任务：阶段 7「验收」。
要求：逐条列出 DESIGN.md 第 23 节的完成标准，标注每项「已通过/未通过/待验证」，未通过项给出修复方案。先给验收清单，不要直接改代码。
```

---

## 附录：通用验证方法

- **加载扩展**：Chrome 打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择项目目录。
- **查看 Service Worker**：扩展详情页点击「Service Worker」链接，打开 DevTools；在 Console 中可调用 `chrome.storage.local.get(null)` 查看数据。
- **重新加载**：修改代码后，在扩展卡片点击刷新按钮；popup 可直接重新打开。
- **查看当前状态**：可在 SW 中临时打印计时状态（开始时间、当前区间、usageSeconds），验证后移除。
- **模拟睡眠**：在 SW 中手工修改最后结算时间戳并触发结算，确认不会产生虚假时长。
- **模拟跨日**：修改系统日期为次日（注意改回），触发一次结算或重启扩展，确认统计归零。
