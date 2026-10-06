# C02：补充一个真正遗漏的反例（Issue 草稿）

尚未公开；建议标签：help wanted、tests；预计 1–2 小时。
先看 tests/test_offline_review.py 与既有 SDK 测试。UNKNOWN/APPROVED/布尔/数字/null结果、
空原因列表、非合成输入、无网络与工作目录变化已有覆盖，禁止重复刷相同用例。

从未覆盖的映射或夹具边界提出一个最小反例，先在 Issue 描述预期与依据再动手。
只改 tests/test_offline_review.py 或有理由调整 examples/offline-review/responses.json。
用现有生成模型和 SDK 测试，不制造另一套 Schema 或传输客户端。
运行贡献说明两条测试/静态检查命令。修复触及 SDK/契约时停止，交维护者单独决定。

验收：用例不是重复；现有正常路径保留；失败事实不删除；不能改期望或放宽规则凑通过。
测试只使用合成材料。无问题可报告未发现，不强制 PR。
