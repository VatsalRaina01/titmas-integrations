# C03：验证中文结果说明不会误导使用者

任务定义；可认领状态以GitHub开放任务为准。标签：help wanted、documentation；预计 1–2 小时。
对照 run.py 默认输出与 --json 结果，找实际理解卡点；未复现误导前不称为 Bug。
已经有三值保留与基本文字/JSON一致性测试，不重复它们。

允许改 examples/offline-review/run.py 的展示、其 README 和 tests/test_offline_review.py。
不得改 SDK 结果、枚举、核心评分或授权。不得把 NOT_ASSESSED 转成 FAIL/PASS，
不得把本例与 outcome-review 的 UNKNOWN 当成同一个生产 API 枚举。

提交：具体误解、改前改后、回归测试或独立阅读反馈。只交你有权提供的合成示例。
验收：通过仍不意味着客户接受/权限；失败和未评估均可见；不把合成回执 ID 说成真实签名证明。
