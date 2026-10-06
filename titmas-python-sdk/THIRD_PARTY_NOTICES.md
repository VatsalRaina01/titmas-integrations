# 来源与第三方边界

本目录原有代码由提交 `0f699fb` 引入。Git记录只有一个提交作者，但这本身不是完整权属证明。
Owner zhangbin 于2026-10-06明确同意：仅对已有Python SDK本项目有权许可的原创部分及可许可生成产物采用Apache-2.0。
精确文件见仓库根 `LICENSE-SCOPE.json`；既有文件的授权前摘要见 `docs/contribution-intake/PYTHON-SDK-LICENSE-PROVENANCE.json`。

## 自动生成部分

`generated/` 来源于锁定的OpenAPI Generator 7.24.0和已批准公开的冻结输入，摘要仍为
`4a56b4b4e1c841f8349ac9e79df82fd610467e7c1c1406e428cd251d5932eaf0`。
未改生成器、模板、生成脚本、契约或生成字节。
上游[该版本README的生成代码许可说明](https://github.com/OpenAPITools/openapi-generator/blob/v7.24.0/README.md#34---license-information-on-generated-code)
区分工具/模板许可与用户对生成输出的许可选择。本SDK的许可来自本次Owner决定。
保留每个文件原有来源标识；不声称OpenAPI Generator背书TITMAS。

## 外部依赖不重新许可

httpx、pydantic、python-dateutil、typing-extensions以及构建/开发依赖没有复制到本SDK源码中；
安装时由包管理器取得，各自分发件的LICENSE/NOTICE继续适用。
本次Apache许可不覆盖或替换这些分发件的许可，也不把源OpenAPI文件、其他SDK、适配器和私有核心纳入。
下游分发者仍需随实际依赖分发件保留其许可和声明。

许可文件随Python构建产物包含；本轮不向包仓库发布、不发Release、不部署。
