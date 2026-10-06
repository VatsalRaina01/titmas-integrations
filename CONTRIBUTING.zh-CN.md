# 带着你的编码智能体参与 TITMAS

只有默认分支已合并且维护者发布了开放任务时，才能认领；功能分支始终是候选。
主责任仓库为 titmas-integrations；Owner 为 zhangbin。私有核心仍不公开。

## 先体验，再贡献

先运行 [离线样例](examples/offline-review/README.zh-CN.md)。无需 Key、模型服务或私有仓库权限。
本例只有合成 SDK 响应处理价值，不代表完整企业评测产品或真实在线调用。

任务定义见 [三个任务](docs/contribution-intake/tasks.json)，实时可认领状态见
[公开任务列表](https://github.com/joy7758/titmas-integrations/issues?q=is%3Aissue%20is%3Aopen%20label%3Abounded-contribution)。
没有开放任务时不要自行批量提交；定义和示例并不都表示已确认缺陷。

## 人和机器人都遵守

1. 先认领一个范围清楚的任务；一个问题一个 PR。每位参与者先一个，整个首批最多三个同时进行。
2. 写出复现、允许目录、最小改动和可重复测试。无缺陷可以报告“未发现”，不强行改代码。
3. 保留三值语义，不修改冻结契约、生成代码、身份/权限、发布流程或生产连接。
4. AI 辅助贡献注明实际操作者/提交账号与工具参与；不要提交私人会话、思维链、Key、客户资料或生产数据。
5. 测试通过不等于自动合并。维护者负责采纳、合并和发布；不按 PR 数奖励，不制造模型独立性或客户采用。
6. 只贡献你有权提供的材料。精确新增文件与已获批准Python SDK的许可见 LICENSE-SCOPE.json；
   未列出的既有文件不能因仓库可见而被当成已获本次开源授权。
7. 安全漏洞或泄漏不贴入公开 Issue。使用 [安全说明](SECURITY.md) 中的私密报告渠道；
   若渠道不可用，先暂停提交敏感材料并向 Owner 请求安全渠道。

建议维护预算每周五小时，工作日一天内首次响应是准备目标，不是 SLA。超量暂停认领。
欢迎真实修复、反例、适配和可用性反馈；不接受批量刷格式、无依据依赖升级、广告或重复任务。

## 运行检查

```sh
.venv/bin/python -m pytest titmas-python-sdk/tests tests/test_offline_review.py -q
.venv/bin/python -m ruff check examples/offline-review/run.py tests/test_offline_review.py
```

其他受影响包仍须运行原聚合工作流。外部代码只进入一次性、无生产秘密、最小权限测试环境；
不使用带私有 Key 的维护者终端或生产机运行贡献者代码。不自动合并、发布或部署。

退出方式：暂停新任务，不删除历史问题/失败/署名；已公开的副本无法保证撤回。
