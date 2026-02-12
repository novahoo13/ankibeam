# New AI Providers Implementation Plan

## 1. Objective

Add support for popular and region-specific AI providers to AnkiBeam, enhancing user choice and flexibility.
**Target Providers:**

- **DeepSeek** (Global/CN) - High performance/cost ratio.
- **Groq** (Global) - Extreme speed.
- **Zhipu AI** (CN) - GLM-4 series.
- **Qwen** (CN) - Alibaba Cloud DashScope.
- **Moonshot AI** (CN) - Kimi series (Long context).

## 2. API Specifications (Verified Feb 2026)

### 2.1 DeepSeek

- **Base URL**: `https://api.deepseek.com`
- **Models**:
  - `deepseek-chat` (V3)
  - `deepseek-reasoner` (R1)
- **Compatibility**: OpenAI Compatible

### 2.2 Groq

- **Base URL**: `https://api.groq.com/openai/v1`
- **Models**:
  - `llama-3.3-70b-versatile` (Default)
  - `llama-3.1-8b-instant`
  - `mixtral-8x7b-32768`
  - `gemma2-9b-it`
- **Compatibility**: OpenAI Compatible

### 2.3 Zhipu AI (ChatGLM)

- **Base URL**: `https://open.bigmodel.cn/api/paas/v4`
- **Models**:
  - `glm-4`
  - `glm-4-flash`
  - `glm-4-air`
  - `glm-4-plus`
- **Compatibility**: OpenAI Compatible

### 2.4 Qwen (Alibaba DashScope)

- **Base URL**: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- **Models**:
  - `qwen-max`
  - `qwen-plus`
  - `qwen-turbo`
  - `qwen-long`
- **Compatibility**: OpenAI Compatible

### 2.5 Moonshot AI (Kimi)

- **Base URL**: `https://api.moonshot.cn/v1`
- **Models**:
  - `kimi-k2.5` (Default, released 2026-01-27, multimodal + 256K context)
  - `moonshot-v1-8k` (Stable)
  - `moonshot-v1-32k`
  - `moonshot-v1-128k`
- **Compatibility**: OpenAI Compatible

## 3. Implementation Steps

### Step 1: Configuration (`utils/providers.config.js`)

- Add new provider objects to the `PROVIDERS` array.
- Generate unique `encryptionSalt` for each provider (using random byte arrays).
- Define `hostPermissions` for each.
- Implement OpenAI-compatible `api` configuration for all new providers.

### Step 2: Permissions (`manifest.json`)

- Update `host_permissions` to include:
  - `https://api.deepseek.com/*`
  - `https://api.groq.com/*`
  - `https://open.bigmodel.cn/*`
  - `https://dashscope.aliyuncs.com/*`
  - `https://api.moonshot.cn/*`

### Step 3: Localization (`_locales`)

- Add label and placeholder strings to `messages.json` for:
  - `en`
  - `zh_CN`
  - `zh_TW`
  - `ja`

## 4. Verification Plan

- **Static Analysis**: Verify config structure matches existing providers.
- **Build Check**: Ensure no syntax errors.
- **Manual Verification (Later)**: User will verify connection using actual API keys.
