// FocusQuota — 默认配置（全项目唯一默认值定义处）
// 约束（IMPLEMENTATION.md 阶段 1）：所有默认值只存在于本文件，
// 全项目不得在其他地方再次硬编码这些默认值。

export const DEFAULT_CONFIG = {
  // 每日普通上网时间额度（分钟）
  dailyLimitMinutes: 120,
  // 域名白名单（豁免，不计时）：支持裸域名、www 子域、IPv4 CIDR 网段（如 192.168.31.0/24）
  excludedDomains: ['chatgpt.com', 'deepseek.com', 'doubao.com', '192.168.31.0/24', '172.16.0.0/16'],
  // 标题关键词（页面标题包含任一关键词则豁免）
  titleKeywords: ['Blender'],
};
