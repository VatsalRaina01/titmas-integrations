# 有界贡献入口安全修正记录

日期：2026-10-06（北京时间）。依据用户在上一轮限定方案后的“给予完全授权”。
只处理已有依赖图、仓库合并控制及许可核实；不扩大私有核心公开范围。

## 依赖事实

原两个锁文件各涉及同5个包，不应计成10个独立漏洞。审计报告3个中级、1个高级、1个严重级别包。
本轮仅更新这些传递依赖的兼容解析，不改直接依赖、API合同、SDK源代码或MCP工具定义：

| 包 | 原MCP版本 | 原验证包版本 | 修正版本 |
|---|---|---|---|
| fast-uri | 3.1.5 | 3.1.5 | 3.1.8 |
| hono | 4.13.1 | 4.12.33 | 4.13.13 |
| ip-address | 10.3.1 | 10.4.0 | 10.7.3 |
| proxy-addr | 2.0.7 | 2.0.7 | 2.0.8 |
| qs | 6.15.3 | 6.15.3 | 6.16.0 |

执行：`npm update fast-uri hono ip-address proxy-addr qs --package-lock-only --ignore-scripts`。
随后用 `npm ci --ignore-scripts` 安装锁定依赖，运行原测试和 `npm audit --audit-level=moderate`。
当前已知告警归零只属于当次 registry 审计快照，不证明没有未知漏洞，不证明当前stdio可利用性或生产安全。
一次验证包audit因TLS网络失败未运行后续测试；保留该事实并独立重试，不视作0告警。

新增 `dependency-audit` CI：审计失败、网络不可用或发现中级以上问题时失败关闭，不自动修锁。
保留 [2026-08-13原记录](../../MCP-TRANSITIVE-DEPENDENCY-REMEDIATION-v1.0.md)，不改写旧结果。

上游依据：[proxy-addr公告](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)、
[fast-uri公告](https://github.com/advisories/GHSA-qw65-cvwx-89v3)；其他具体公告以 npm audit 当前输出为准。

## 许可边界

生成器本身Apache-2.0不自动构成Python SDK的许可决定。
历史Git仅识别本项目单一提交来源与已锁定生成方式；这不是法律权属认证。
本轮在得到明确的限定Python SDK许可决定前不改变既有SDK许可。

## 合并和公开边界

将设置与回读记录区分，不用文档存在证明远端保护已生效。
当前只有Owner一个可写维护者；不会伪造独立GitHub审批。
最终合并必须绑定Owner本次授权、精确提交、全部必要检查和未解决项。
私有源码、真实数据、生产权限、包发布、Release和Deployment均不在本轮范围内。

2026-10-06实际设置并回读：main要求PR、11项来自GitHub Actions的必要检查、最新基线，
管理员也受约束；禁止强推和删除，讨论必须解决。独立approval数量为0，因为目前只有Owner可写；
Owner手动合并与独立第二人审批不是同一件事，不声称已经实现后者。
自动合并保持关闭；Actions保持只读令牌、不可审批PR；所有外部贡献者的工作流均须维护者先批准。
GitHub私密漏洞报告已启用并回读为true，见 [安全说明](../../SECURITY.md)。
