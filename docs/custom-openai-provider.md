# 自定义 OpenAI 兼容供应商操作指南

本文说明如何在 Anki Word Assistant 中接入任意兼容 OpenAI Chat Completions API 的服务，并解释保存流程中的权限提示。

## 前置条件
- 已获取目标服务的 API Key，并确认其兼容 OpenAI Chat Completions 接口。
- 了解该服务的基础 URL（例：`https://proxy.example.com/v1`）以及可用的模型名称。
- Chrome 浏览器 121+，允许扩展请求可选的站点访问权限。

## 配置步骤
1. 在浏览器地址栏输入 `chrome://extensions`，找到 Anki Word Assistant，点击“详细信息”并进入“扩展选项”或直接在扩展弹窗中打开“设置中心”。
2. 切换到“AI 配置”标签页，选择“OpenAI GPT”面板，填入兼容服务提供的 API Key。
3. 在“API 地址”字段中输入自定义端点（如 `https://proxy.example.com/v1` 或 `https://example.com:8443/v1`），必要时同步更新默认模型名称。
4. 点击“保存设置”后，Chrome 会弹出新的域名访问权限提示，请确认授权；如果拒绝，配置不会写入，需要重新保存并授权。
5. 授权成功后，点击“测试连接”按钮验证服务可用性，并在“Prompt 模板”区域为新模型调整提示词。

## 权限与撤销
- 扩展默认仅声明 Google、OpenAI、Anthropic 以及 AnkiConnect 的域名；保存自定义端点时会额外请求 `https://*/*`、`http://localhost/*` 或 `http://127.0.0.1/*` 中匹配的新域名。
- 可在 `chrome://extensions/?id=<扩展ID>` 的“站点访问权限”中查看或撤销已授权的域名；撤销后再次保存会重新触发授权提示。
- 将“API 地址”恢复为官方端点并保存，可回退到最初的权限集。

## 常见问题
- **授权提示未出现**：请确认输入的 URL 以 `http://` 或 `https://` 开头，并包含域名；纯主机名会被判定为非法格式。
- **仍然无法访问自定义域名**：检查该域名是否需要额外的自签证书或内网访问权限；如需代理，请确保浏览器可以直接访问该地址。
- **想一次性接入多个子域名**：可使用相同的保存流程逐个授权，每个域名均会在 Chrome 中独立记录。
