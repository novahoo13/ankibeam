# 📦 发布指南：从零开始发布到 GitHub 和 Chrome Web Store

本指南将详细介绍如何将 Anki Word Assistant 扩展发布到 GitHub 和 Chrome Web Store。

---

## 📋 目录

1. [发布前准备清单](#一发布前准备清单)
2. [GitHub 发布](#二github-发布)
3. [Chrome Web Store 发布](#三chrome-web-store-发布)
4. [常见问题解答](#四常见问题解答)

---

## 一、发布前准备清单

### ✅ 必须完成的事项

| 项目             | 状态    | 说明                   |
| ---------------- | ------- | ---------------------- |
| 📄 README.md     | ✅ 已有 | 项目说明文档           |
| 📄 LICENSE 文件  | ❌ 缺失 | 需要创建开源许可证文件 |
| 🖼️ 扩展图标      | ✅ 已有 | 16/48/128px PNG 图标   |
| 📝 manifest.json | ✅ 已有 | 版本号为 1.0           |
| 🌐 多语言支持    | ✅ 已有 | 4 种语言               |
| 🔒 .gitignore    | ✅ 已有 | 已配置正确             |

### ⚠️ 建议补充的事项

| 项目        | 说明                          |
| ----------- | ----------------------------- |
| 📸 商店截图 | Chrome Web Store 需要宣传截图 |
| 🖼️ 宣传图   | 商店展示用的横幅图片          |
| 📝 隐私政策 | Chrome Web Store 必需         |

---

## 二、GitHub 发布

### 步骤 1: 创建 LICENSE 文件 ⭐

README 中提到使用 MIT License，需要创建对应的 LICENSE 文件。

**操作方法**：在项目根目录创建 `LICENSE` 文件（下面会自动帮你创建）

### 步骤 2: 检查敏感信息

确保代码中没有：

- ❌ 真实的 API Key
- ❌ 个人隐私信息
- ❌ 绝对路径或本地配置

**当前项目状态**: ✅ 安全（API Key 是用户配置的，不在代码中）

### 步骤 3: 推送到 GitHub

```bash
# 1. 确保所有更改已提交
git add .
git commit -m "chore: prepare for v1.0 release"

# 2. 推送到远程仓库
git push origin dev

# 3. 如果要发布正式版，合并到 main 分支
git checkout main
git merge dev
git push origin main
```

### 步骤 4: 创建 GitHub Release

1. 打开 GitHub 仓库页面: https://github.com/novahoo13/anki-word-assistant
2. 点击右侧的 **"Releases"**
3. 点击 **"Create a new release"**
4. 填写以下信息：
   - **Tag version**: `v1.0.0`
   - **Release title**: `Anki Word Assistant v1.0.0`
   - **Description**: 写上主要功能和更新说明
5. 上传扩展的 ZIP 包（可选）
6. 点击 **"Publish release"**

---

## 三、Chrome Web Store 发布

### 准备工作

#### 1. 注册开发者账号 💰

- 访问 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
- 需要支付 **一次性费用 $5 美元**（约 ¥35）
- 使用 Google 账号登录

#### 2. 准备宣传素材

Chrome Web Store 需要以下素材：

| 素材         | 规格                   | 说明                          |
| ------------ | ---------------------- | ----------------------------- |
| **应用图标** | 128×128 px             | ✅ 已有 (`icons/icon128.png`) |
| **小宣传图** | 440×280 px             | 商店列表缩略图                |
| **大宣传图** | 1400×560 px            | 商店详情页横幅 (可选)         |
| **截图**     | 1280×800 或 640×400 px | 至少 1 张，建议 3-5 张        |

#### 3. 准备隐私政策

Chrome Web Store 要求提供隐私政策页面。你可以：

- 在 GitHub 仓库中创建 `PRIVACY.md`
- 或使用免费的隐私政策生成工具

### 打包扩展

**方法一：使用 Chrome 浏览器打包**

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启 "开发者模式"
3. 点击 "打包扩展程序"
4. 选择项目目录（不包括 `node_modules`）
5. 生成 `.crx` 文件和 `.pem` 私钥（保存好私钥！）

**方法二：创建 ZIP 文件（推荐）**

```bash
# 在项目根目录执行
# 创建一个不包含开发文件的 ZIP 包

# 首先创建一个临时目录
mkdir -p dist-package

# 复制需要的文件
cp -r background content icons options popup services styles utils _locales dist-package/
cp manifest.json dist-package/

# 创建 ZIP（排除不需要的文件）
cd dist-package
zip -r ../anki-word-assistant-v1.0.0.zip . \
    -x "*.DS_Store" \
    -x "*node_modules*" \
    -x "*.git*"
cd ..

# 清理临时目录
rm -rf dist-package
```

### 提交到 Chrome Web Store

1. 登录 [Developer Dashboard](https://chrome.google.com/webstore/devconsole/)

2. 点击 **"新项"** (New Item)

3. 上传 ZIP 文件

4. 填写商店信息：

   **基本信息：**

   - **商品名称**: Anki Word Assistant
   - **摘要**: AI 驱动的 Anki 单词卡片助手（最多 132 字符）
   - **详细说明**: 从 README 复制功能介绍

   **图形资源：**

   - 上传应用图标和截图

   **隐私设置：**

   - 选择单个用途描述
   - 声明权限用途（storage 用于保存配置）
   - 填写隐私政策 URL

5. 点击 **"提交审核"**

### 审核时间

- 通常需要 **1-3 个工作日**
- 首次发布可能需要更长时间
- 如果被拒绝，会收到邮件说明原因

---

## 四、常见问题解答

### Q: 我需要付费吗？

- **GitHub**: 免费
- **Chrome Web Store**: 一次性 $5 美元注册费

### Q: 发布后可以更新吗？

可以！只需要：

1. 修改 `manifest.json` 中的 `version` 号
2. 重新打包并上传到 Chrome Web Store
3. 等待审核通过

### Q: 权限声明会被审核吗？

是的，Chrome 会审核你申请的权限是否合理。你的扩展使用了：

- `storage` - 保存用户配置 ✅ 合理
- `<all_urls>` - 浮动助手需要在所有页面运行 ✅ 合理（但需要在描述中说明）

### Q: 需要更新版本号吗？

建议每次发布使用语义化版本号：

- `1.0.0` → `1.0.1` (Bug 修复)
- `1.0.0` → `1.1.0` (新功能)
- `1.0.0` → `2.0.0` (重大更新)

---

## 📝 下一步行动

请告诉我你想先做哪一步，我可以帮你：

1. **创建 LICENSE 文件** ← 推荐先做
2. **创建隐私政策文件**
3. **生成打包脚本**
4. **准备商店描述文案**
5. **生成宣传截图**

---

_祝发布顺利！_ 🎉
