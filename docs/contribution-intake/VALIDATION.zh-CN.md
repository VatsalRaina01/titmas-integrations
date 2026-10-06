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
- 提交 `2639351c8ca8eec02f32aab563686b49cbd1be33` 的
  [GitHub Actions](https://github.com/joy7758/titmas-integrations/actions/runs/37424724455)
  共10个作业全部通过，其中新增 Ubuntu 离线样例作业完成安装、测试和中文及 JSON 输出检查，
  既有 SDK 确定性再生成作业亦通过。这不消除下列依赖告警或许可缺口。
- 新/修改文件做私有路径、私有仓库、常见密钥格式扫描并人工审读，未发现匹配；
  不是完整秘密扫描或独立安全审计。

## 保留的失败及修正

首次新样例静态检查因无效 noqa 失败；只去掉无效注释后复查通过。
首次聚合测试在适配器依赖安装完成前过早启动，出现缺模块；等待安装完成再运行通过。
首次 mypy 从错误目录运行，找不到生成模型；按现有 CI 的 SDK 工作目录重跑通过。
这些为本轮执行/准备问题，不冒充 TITMAS 发现的客户缺陷。

## 仍需处理

1. 本地 Docker daemon 不可用，未在本机运行 Linux。随后上述 GitHub Ubuntu 作业通过，
   因而补足该提交的隔离环境验证；不声称已在所有开发者机器运行。
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

## Owner后续授权后的进展（保留上文原快照）

2026-10-06，用户批准继续有限修正后，两个锁文件中的5包告警经兼容更新归零；
原MCP9项、历史证据22项、Python聚合25项和API快照3项复验通过，直接依赖与API不变。
一次audit TLS失败后独立重试成功，不将网络失败算通过。
main合并保护、外部工作流人工审批和私密安全渠道已配置并回读。
细节见 [修正记录](SECURITY-REMEDIATION-20261006.zh-CN.md)。
本节不是独立安全审计；Python SDK许可与完整公开激活继续单独核对。

## Python SDK限定许可补充（2026-10-06）

Owner明确同意仅对Python SDK本项目有权许可部分补充Apache-2.0，保留第三方及私有核心。
来源见PYTHON-SDK-LICENSE-PROVENANCE.json（授权前38文件摘要），NOTICE及THIRD_PARTY_NOTICES.md。
生成代码、运行逻辑、冻结输入和生成工具不变；只改SDK许可元数据与说明。
本地wheel核对License-Expression=Apache-2.0及LICENSE/NOTICE/THIRD_PARTY_NOTICES.md全部包含；
wheel仅本地验证，没有发布。

保留过程：首次测试有3项旧“仅新增文件/永远草稿”断言失败，按明确授权改为精确Python清单、
实时GitHub任务状态以及不自动激活；新增生成字节保全和许可元数据测试。一次导入排序检查失败后修正。
本轮最终CI以PR当前Head对应GitHub运行记录为准，不将旧提交CI移植为新提交PASS。
当前任务是否已发布/可认领由默认分支与开放Issue组合决定，机器状态null表示待实时核验，不表示通过。
