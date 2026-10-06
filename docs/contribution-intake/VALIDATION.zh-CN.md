# 首批贡献入口准备：验证记录

观察日期：2026-10-06。复用现有 PR #7；基线为
`8d7f450f04f503c39df4e79d3bbdde93f1131df7`。这是候选准备，不是已开放贡献或用户采用。

## 已执行

- macOS / Python 3.13 新虚拟环境安装已有 Python SDK：通过。
- 新增离线样例测试：17 项；与 SDK、两个适配器一起运行共 25 项通过。
- TypeScript SDK：7 项通过；MCP：9 项通过。
- 既有 onboarding 证据测试：22 项通过；其中 D15 的 17 项另跑通过，不重复计数。
- 既有 OpenAPI 快照：3 项测试通过；快照摘要、生成 SDK 合同检查、MCP 合同检查通过。
- 新增代码和既有 Python 源码静态检查、SDK mypy：通过。
- 演示实际中文输出和 JSON 均已运行；测试阻断 socket/API 客户端创建，保留三值结果。
- 冻结 API、SDK、MCP、历史证据和依赖锁文件未修改。
- 新/修改文件做私有路径、私有仓库、常见密钥格式扫描并人工审读，未发现匹配；
  不是完整秘密扫描或独立安全审计。

## 保留的失败及修正

首次新样例静态检查因无效 noqa 失败；只去掉无效注释后复查通过。
首次聚合测试在适配器依赖安装完成前过早启动，出现缺模块；等待安装完成再运行通过。
首次 mypy 从错误目录运行，找不到生成模型；按现有 CI 的 SDK 工作目录重跑通过。
这些为本轮执行/准备问题，不冒充 TITMAS 发现的客户缺陷。

## 仍需处理

1. 本地 Docker daemon 不可用，未在本机运行 Linux；新增 GitHub Actions Linux 任务，
   结果以候选提交对应的实际 CI 为准。没有伪造通过。
2. npm audit 在既有 MCP 依赖图报告 5 个受影响包：3 moderate、1 high、1 critical；
   历史 onboarding 包安装也给出相同数量，不能重复计成10个独立漏洞。
   fast-uri 为 high，proxy-addr 为 critical；其余为 hono、ip-address、qs。
   这是依赖告警，不代表已证明当前 stdio 路径可被利用。本轮不执行攻击或 npm audit fix，
   依赖升级/可达性评估需独立有界修正，正式推广保持暂停。
3. 读取 main 的 branch protection 返回404，适用 rules 列表为空；本轮不改仓库设置。
   激活外部贡献前应明确维护者审批与所需检查控制，不自动合并。
4. 本次仅精确新增文件获 Apache-2.0 授权。已有 Python SDK 的许可缺口仍待独立核对，
   不得称全仓库已开源；已有 TypeScript package.json 的 Apache 声明保持。
5. 未公开Issue、未邀请人员、未合并、未同步网站/Profile、未做真实外部试用。

参考告警：
- https://github.com/advisories/GHSA-jqcg-44mw-7w3h
- https://github.com/advisories/GHSA-qw65-cvwx-89v3

## 本轮结果

首批有界候选已实现；公开贡献激活尚未通过。准备代码可审查，
不将“测试通过”或“公开PR存在”写成市场价值、完整产品、权限或客户采用。
