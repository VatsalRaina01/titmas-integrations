# 无密钥离线样例：不要把“尚未评估”说成“通过”

这是公开 SDK 的**本地合成响应处理演示**，不是企业评测内核、模型评测或真实客户案例。
固定三个响应，复用 SDK 保留 `FAIL / PASS / NOT_ASSESSED`，不手写传输客户端或第二套验证器。
结果来自预设夹具，不是程序自动检查文案后得出的结论。

## 运行（在仓库根目录）

Python 3.11–3.13。首次安装需要下载已有依赖；完成安装后演示无网络、无 API Key。
不要填入任何真实凭据。不要用历史服务域名替换示例地址。

```sh
python3.13 -m venv .venv
.venv/bin/python -m pip install -e './titmas-python-sdk[dev]'
.venv/bin/python examples/offline-review/run.py
.venv/bin/python examples/offline-review/run.py --json
.venv/bin/python -m pytest tests/test_offline_review.py -q
```

预期三个中文结果：返工前未通过、返工后仅预设检查通过、证据不足尚未评估。
程序退出 0 表示演示成功执行，**不是所有案例通过**。

## 人和智能体分别看什么

- 人：先读每个结果的中文说明及限制。
- 智能体：读取 JSON 中 `outcome.result`、`reason_codes` 和非授权字段。
- SDK 对象与枚举来自既有冻结契约；这里没有新增生产 Schema。
- 合成回执 ID 没有服务器对象、签名或真实租户。不能说完成了回执验证。
- 无模型参与，不请求真实工具、不调用私有服务、不测试企业业务正确性。
- 当前只演示内存接口注入，不验证网络传输或在线可用性。

贡献前见 [贡献说明](../../CONTRIBUTING.zh-CN.md)。公开许可、Linux 干净运行及最终发布状态见
[准备清单](../../docs/contribution-intake/readiness.json)，不能仅凭本地文件存在声称入口已开放。

## 脱敏复现记录

- **测试环境**:
  - 操作系统: Linux (Ubuntu 22.04 LTS x86_64)
  - Python 版本: 3.11.9 (支持 Python 3.11–3.13)
  - 基础提交: `87b92275ebcdcc42fb0a2fbed436e83666ad677f`
- **执行命令与输出验证**:
  1. **依赖安装（需联网）**:
     ```sh
     python3 -m venv .venv
     .venv/bin/python -m pip install -e './titmas-python-sdk[dev]'
     ```
     *说明：此安装阶段依赖网络下载公共包，后续运行完全脱网。*
  2. **普通输出运行**:
     ```sh
     .venv/bin/python examples/offline-review/run.py
     ```
     - 退出码: `0`
     - 预期表现: 顺利输出三种中文预设结果（“返工前未通过”、“返工后仅预设检查通过”、“证据不足尚未评估”）。
  3. **JSON 格式运行**:
     ```sh
     .venv/bin/python examples/offline-review/run.py --json
     ```
     - 退出码: `0`
     - 预期表现: 输出有效的 JSON 回执响应，且不发起任何网络请求。
  4. **测试套件运行**:
     ```sh
     .venv/bin/python -m pytest tests/test_offline_review.py -q
     ```
     - 退出码: `0`
- **复现卡点与修复**:
  - **实际卡点**: 无。无环境安装和运行时的代码报错，网络隔绝状态下能完全运行后续的本地生成与测试命令。
  - **复验结论**: 已在干净环境中完整验证，未发现任何安装或运行缺陷。成功记录。
