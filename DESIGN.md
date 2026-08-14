# FocusQuota — Design Document

## 1. 项目概述

FocusQuota 是一个基于 Chrome Manifest V3（MV3）的浏览时间统计与提醒扩展。

**核心目标：**

> 帮助用户控制每天的普通上网时间，但不要阻止用户访问网页。

用户每天拥有一个可配置的「普通网页浏览时间额度」。

默认情况下，用户访问的网页都会消耗这个额度。

但是，满足以下任一条件的页面属于「豁免页面」，不消耗额度：

1. 网站域名位于用户配置的白名单中。
2. 当前网页标题包含用户配置的关键词。

例如：

- 用户正在 YouTube 学习 Blender：
  - 网站是 `youtube.com`
  - 或页面标题包含 `Blender`
  - → 不消耗普通浏览时间
- 用户访问 DeepSeek、豆包、ChatGPT：
  - 这些网站可以加入域名白名单
  - → 不消耗普通浏览时间

## 2. 核心设计原则

### 2.1 只提醒，不阻止

这是非常重要的产品要求。

当用户达到每日时间额度后：

- 不禁止网页访问
- 不关闭标签页
- 不重定向网页
- 不显示阻塞页面
- 不修改网页内容
- 不强制用户离开网站

只进行提醒。

例如：

> 今日普通上网时间已达到 120 分钟。

提醒方式可以根据 Chrome Extension API 的合理实现选择，例如：

- extension notification
- popup 中显示
- badge
- 其他低干扰方式

具体 UI 可以后续设计。

## 3. 时间统计规则

### 3.1 默认规则

只要当前网页属于普通页面，并且浏览器处于活跃使用状态，就消耗时间额度。

需要考虑：

- 当前 active tab
- 当前 window 是否处于焦点
- 标签页切换
- 窗口切换
- Chrome 最小化
- Chrome 窗口失去焦点
- 标签页关闭
- 页面导航
- SPA 页面
- 页面标题变化

不能简单使用：

> tab 打开了多久 = 浏览时间

例如，用户打开 YouTube：

```text
YouTube tab 打开
↓
用户离开电脑吃饭
↓
Chrome 一直开着

这段时间不应该继续计入实际活跃浏览时间。
```

## 4. 豁免规则

页面满足以下任意条件，则不计入普通浏览时间。

### 4.1 域名白名单

用户可以配置域名白名单。

例如：

- `chatgpt.com`
- `deepseek.com`
- `doubao.com`

匹配应该考虑实际 hostname，而不是简单字符串包含。

例如，`chatgpt.com` 和 `www.chatgpt.com` 应该可以根据合理的域名匹配规则视为同一个站点。

不要因为 `notchatgpt.com` 包含字符串 `chatgpt.com` 就错误匹配。

具体匹配算法由实现决定，但必须避免简单 substring matching 导致误判。

### 4.2 页面标题关键词

用户可以配置关键词。

例如：

- `Blender`
- `Unreal Engine`
- `Python`
- `C++`
- `教程`
- `documentation`

如果当前页面标题包含这些关键词，则该页面不消耗额度。

例如：

- 标题 `Learn Blender 5.0 - Complete Tutorial` 包含 `Blender` → 豁免
- 标题 `Funny Videos Compilation` 不包含任何豁免关键词 → 计时

## 5. 标题匹配的重要要求

页面标题不是静态的。

尤其现代网站大量使用 SPA。

例如 YouTube：

```text
页面初始加载
↓
title = YouTube
↓
用户打开视频
↓
title = Blender 5 Tutorial...
```

因此扩展需要能够处理：

- 页面导航
- title 动态变化
- SPA 页面 title 更新

不能只在 tab 创建时读取一次 title。

优先使用 Chrome MV3 提供的合理事件/API 进行检测。

不要为了实现标题监控而注入不必要的网页脚本。

## 6. 时间额度

用户可以设置：

`dailyLimitMinutes`

例如 `120`，表示每天允许 2 小时。

默认值可以暂定为 120 分钟。

如果没有特殊理由，不要把默认值硬编码到多个地方。

应该集中定义默认配置。

## 7. 每日重置

统计应该按照用户本地日期计算。

例如 `2026-08-15` 和 `2026-08-16` 属于两个独立的统计周期。

每天第一次运行时，如果发现保存的统计日期不是今天（`usageDate != today`），则：

```text
usageSeconds = 0
usageDate = today
```

不要简单使用固定的 24 小时滚动窗口。

这是「每日额度」，不是「过去 24 小时额度」。

## 8. 数据存储

使用 `chrome.storage.local` 保存配置和统计数据。

至少需要能够保存：

- `dailyLimitMinutes`
- `excludedDomains`
- `titleKeywords`
- `usageSeconds`
- `usageDate`

具体数据结构由实现决定。

不要引入：

- 后端服务器
- 数据库服务器
- 用户账号系统
- 云同步
- API server

第一版必须是完全本地工作的 Chrome Extension。

## 9. 隐私原则

这是一个本地工具。

扩展不应该：

- 上传浏览历史
- 上传 URL
- 上传页面标题
- 上传用户统计数据
- 收集用户行为数据
- 使用第三方分析服务
- 要求注册账号

除 Chrome Extension 正常运行所必须的权限外，不要申请多余权限。

## 10. Chrome Extension 技术要求

使用 Manifest V3。

不要使用 Manifest V2。

优先使用 Chrome 官方 MV3 API。

可能涉及的 API 包括：

- `chrome.tabs`
- `chrome.windows`
- `chrome.storage`
- `chrome.alarms`
- `chrome.notifications`

具体使用哪些 API，由实现根据需求决定。

不要为了简单而过度申请权限。

## 11. MV3 Service Worker

后台逻辑应该使用 MV3 Service Worker。

需要考虑 Service Worker 生命周期：

Service Worker 不是永久运行的后台进程。

因此：

- 不要依赖一个永远运行的 setInterval
- 不要把所有状态只存在 JavaScript 内存
- 重要状态必须持久化
- 需要周期性任务时使用 chrome.alarms
- 每次 Service Worker 重新启动后应该能够从 chrome.storage.local 恢复状态

## 12. 计时器设计

计时逻辑需要避免以下问题：

**问题 A：重复计时**

例如：

```text
tab A active
↓
计时器启动
↓
tab B active
↓
旧计时器没有停止
↓
A + B 同时计时
```

必须保证同一时刻最多只有一个当前计时对象。

**问题 B：Service Worker 被回收**

不能依赖：

```js
let seconds = 0;
```

作为唯一数据来源。

重要统计必须持久化。

**问题 C：系统时间变化**

不要完全依赖 `Date.now()` 的单次差值而不考虑异常情况。

需要合理处理：

- 睡眠
- 唤醒
- 系统时间修改
- Chrome 重启

不要因为电脑睡眠 8 小时而错误增加 8 小时浏览时间。

## 13. Active Tab 判定

普通计时至少需要综合判断：

- Chrome window 是否 active/focused
- 当前 tab 是否 active
- 当前页面是否属于豁免页面

只有满足：

- 浏览器处于活跃状态
- 当前页面为普通页面

才累计时间。

## 14. 特殊页面

需要考虑 Chrome 内部页面，例如：

- `chrome://`
- `chrome-extension://`
- `about:`
- `file:`

默认不应该计入普通网页时间。

不要为了读取这些页面而申请不必要的权限。

## 15. UI

第一版至少需要一个 Popup 或 Options 页面，让用户能够：

**查看：**

- 今日已使用
- 今日额度
- 剩余时间

例如：

```text
今日普通上网时间
43 / 120 分钟
剩余 77 分钟
```

**修改：**

- 每日额度
- 域名白名单
- 标题关键词

## 16. 设置示例

默认配置可以类似：

```json
{
  "dailyLimitMinutes": 120,
  "excludedDomains": [
    "chatgpt.com",
    "deepseek.com",
    "doubao.com"
  ],
  "titleKeywords": [
    "Blender"
  ]
}
```

以上只是示例。

不要把这些网站和关键词永久硬编码为不可修改的规则。

用户应该能够自行编辑。

## 17. 用户需求的典型场景

### 17.1 场景 1：普通娱乐网页

用户打开 `example.com`，标题为 `Funny Videos`，没有匹配白名单或关键词：

- 开始计时

### 17.2 场景 2：YouTube 学习 Blender

用户打开 YouTube 视频 `Blender 5 Complete Tutorial`。

虽然 `youtube.com` 通常是需要计时的网站，但标题包含 `Blender`：

- 不计时

### 17.3 场景 3：ChatGPT

用户打开 `chatgpt.com`，且 `chatgpt.com` 在域名白名单中：

- 不计时

### 17.4 场景 4：达到额度

例如：

```text
dailyLimitMinutes = 120
usage = 120
```

继续访问普通网页：

- 允许访问
- 显示提醒

不能阻止。

## 18. 开发环境

当前开发环境：

- Host OS：Windows 11
- WSL：WSL2，Ubuntu 24.04
- Linux kernel：`6.6.114.1-microsoft-standard-WSL2`
- 架构：`x86_64`
- Node.js：`v24.18.0`
- npm：`11.16.0`

### 18.1 AI 开发工具

**DeepCode**

- 版本：`0.2.0`
- npm 包：`@vegamo/deepcode-cli@0.2.0`
- 安装方式：npm 全局安装（nvm，Node.js v24.18.0）
- 可执行文件：`/home/achilles/.nvm/versions/node/v24.18.0/bin/deepcode`
- 当前模型：`deepseek-v4-flash`（可通过 /model 命令切换）

**Codex**

- 版本：`0.147.0`
- 安装方式：OpenAI standalone installer（不是 npm 安装）
- 可执行文件：`/home/achilles/.local/bin/codex`
- 符号链接：`/home/achilles/.codex/packages/standalone/current/bin/codex`

### 18.2 Sandbox

- bubblewrap：`0.9.0`
- 路径：`/usr/bin/bwrap`

## 19. 项目目录

项目的真实目录位于 Windows 下的 NTFS 格式 USB 磁盘（D: 盘），通过 WSL2 挂载访问。

- WSL 路径：`/mnt/d/Users/Achilles/Workspace_02Tested/JavaScript/FocusQuota`
- Windows 路径：`D:\Users\Achilles\Workspace_02Tested\JavaScript\FocusQuota`

原因：

- Windows 可以直接访问项目
- Chrome 可以直接加载扩展
- Windows Git 环境已经配置完成
- GitHub / GitLab / Gitee 的用户与认证信息**仅仅**保存在 Windows 端
- WSL 不保存这些 Git 平台的登录凭据

不要修改这个 Git 分工。

WSL 中主要负责：

- DeepCode / Codex
- Node.js
- 项目开发
- 测试脚本

Windows 主要负责：

- Git
- GitHub / GitLab / Gitee
- Chrome
- 扩展实际加载与测试

## 20. Git 要求

第一阶段不要修改 Git 全局身份认证配置。

不要执行：

```text
git config --global ...
```

不要要求用户在 WSL 中重新登录 GitHub、GitLab、Gitee。

项目文件虽然位于 /mnt/d，但 Git 操作的认证仍由用户现有 Windows Git 环境负责。

如果需要 Git 操作，只执行项目级必要操作。

## 21. 当前开发策略

第一阶段目标：

做出一个能够实际加载到 Chrome、能够准确计时、能够配置豁免规则、达到额度后只提醒的最小可用 MV3 扩展。

不要第一版就加入：

- AI
- 云端同步
- 用户账号
- 数据分析
- 后端
- Chrome Web Store 特殊集成
- 复杂统计图表
- 社交功能
- 付费系统

保持项目小而可靠。

## 22. 代码质量要求

代码应该：

- 简单
- 可维护
- 模块化
- 使用现代 JavaScript
- 避免不必要的依赖
- 优先 Chrome 原生 API
- 不引入大型框架，除非确实必要

尤其不要为了一个简单 Popup 引入复杂前端框架。

## 23. 第一阶段完成标准

以下全部满足后，才认为 MVP 完成：

- Chrome 可以正常加载 MV3 扩展
- Service Worker 正常运行
- Popup/Options 页面正常运行
- 可以设置每日额度
- 可以设置域名白名单
- 可以设置标题关键词
- 普通页面能够正确计时
- 白名单域名不计时
- 标题关键词匹配页面不计时
- SPA 页面标题变化能够正确更新计时状态
- Tab 切换不会重复计时
- Chrome 窗口失去焦点时停止计时
- Chrome 最小化时不会错误计时
- Chrome 重启后统计数据不会丢失
- Service Worker 重启后统计数据不会丢失
- 每天自动重置
- 睡眠/唤醒不会产生虚假的长时间计时
- 达到额度后仍然可以正常访问网页
- 达到额度后能够提醒
- 不上传任何浏览数据
- 不申请明显多余的 Chrome 权限

## 24. 开发原则

不要为了满足需求而猜测 Chrome API 行为。

如果某个 API 的行为不确定：

1. 查阅 Chrome 官方 MV3 文档。
2. 编写最小测试。
3. 验证后再实现。

尤其是：

- Service Worker 生命周期
- Tab activation
- Window focus
- SPA title changes
- Chrome alarms
- Storage consistency

这些地方不要凭经验猜。

## 25. 后续可能扩展

第一版完成后，可以再考虑：

- 更详细的每日/每周统计
- 网站分类
- 临时豁免
- 手动暂停计时
- 自定义提醒方式
- 更丰富的统计页面
- Firefox 支持
- Chrome Web Store 发布
- GitHub 开源发布

这些都不属于第一阶段 MVP。

---

> 说明：「标题关键词豁免」不是 YouTube 专用规则，而是所有网站通用规则。这样以后在 Reddit、Bilibili、Google、普通博客等网站看到标题含有 Blender、Unreal、Python 等学习内容，也同样不会消耗额度。
