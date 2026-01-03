# 📖 Anki Word Assistant User Manual

**Version**: 1.0  
**Last Updated**: January 2026

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Installation & Setup](#2-installation--setup)
3. [How to Use](#3-how-to-use)
4. [Template Configuration](#4-template-configuration)
5. [Advanced Features](#5-advanced-features)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Quick Start

### What is Anki Word Assistant?

Anki Word Assistant is a Chrome browser extension that:

✅ **Auto-Parse** - Enter a word, AI generates definitions, examples, pronunciation  
✅ **One-Click Cards** - Sync parsed content directly to Anki  
✅ **Web Highlighting** - Select text on any webpage, floating panel appears instantly

### Workflow Overview

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   📝 Input Text        🤖 AI Parsing        📚 Write to Anki │
│                                                             │
│   "vocabulary"   ──►   Word: vocabulary    ──►   ✅ Success  │
│                        Reading: /vəˈkæbjəleri/              │
│                        Meaning: a list of words             │
│                        Example: Build your...               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Installation & Setup

### 2.1 Prerequisites

Before using this extension, ensure you have:

| Step | Requirement                | Notes                                      |
| ---- | -------------------------- | ------------------------------------------ |
| ①    | Install Anki               | [Download Anki](https://apps.ankiweb.net/) |
| ②    | Install AnkiConnect add-on | See steps below                            |
| ③    | Get an AI API Key          | Configure at least one AI provider         |

### 2.2 Installing AnkiConnect

**Steps:**

1. Open Anki desktop application
2. Go to **Tools** → **Add-ons**
3. Click **Get Add-ons**
4. Enter add-on code: `2055492159`
5. Click **OK** and wait for download
6. **Restart Anki**

> ⚠️ **Important**: Anki must be running whenever you use this extension!

### 2.3 Getting an AI API Key

This extension supports three AI providers. Choose at least one:

#### Option 1: Google Gemini (Recommended - Free tier available)

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click **Create API Key**
4. Copy the generated API Key

#### Option 2: OpenAI GPT

1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Click **Create new secret key**
4. Copy your API Key

#### Option 3: Anthropic Claude

1. Visit [Anthropic Console](https://console.anthropic.com/)
2. Sign in or create an account
3. Navigate to API Keys
4. Create and copy your API Key

### 2.4 Configuring the Extension

1. **Open Extension Settings**

   - Right-click the extension icon → Select **Options**
   - Or click extension icon → Click ⚙️ settings button

2. **Configure AI Service**

   - Select your AI provider (e.g., Google Gemini)
   - Paste your API Key
   - Click **Test Connection** to verify

3. **Configure Anki Connection**

   - Ensure Anki is running
   - Click **Test Anki Connection**
   - Look for ✅ success message

4. **Create a Parsing Template** (See Section 4)

---

## 3. How to Use

### 3.1 Method 1: Popup Mode

Best for: Manual word entry, batch processing

**Quick Steps:**

```
Step 1                    Step 2                    Step 3
Click extension icon      Enter text, click Parse   Click Write to Anki
    │                        │                        │
    ▼                        ▼                        ▼
┌─────────┐             ┌─────────┐             ┌─────────┐
│ 🔌 Icon │  ──────►    │ 📝 Input │  ──────►   │ ✅ Done  │
│         │             │ vocabulary│             │         │
└─────────┘             │ [Parse]  │             └─────────┘
                        └─────────┘
```

**Detailed Steps:**

1. Click the **Anki Word Assistant** icon in Chrome toolbar
2. Enter the word or phrase in the input field
3. (Optional) Select a parsing template from dropdown
4. Click the **"Parse"** button
5. Wait for AI to complete parsing
6. Review and edit the generated content (if needed)
7. Click **"Write to Anki"** button
8. See ✅ "Success" message - card added to Anki

### 3.2 Method 2: Floating Assistant Mode

Best for: Reading webpages, quick lookups

**Quick Steps:**

```
Step 1                    Step 2                    Step 3
Select text on webpage    Click floating button     Confirm in panel
    │                        │                        │
    ▼                        ▼                        ▼
 ─────────               ┌─────────┐             ┌─────────┐
│vocabulary│  ──────►    │ 🔘 Button│  ──────►    │ 📋 Panel │
 ─────────               └─────────┘             │ [Write] │
                                                 └─────────┘
```

**Detailed Steps:**

1. On any webpage, **select** (highlight) the text you want to look up
2. A **floating button** 🔘 appears near your selection
3. Click the floating button
4. **Floating panel** appears, AI starts parsing automatically
5. Review the parsed content in each field
6. (Optional) Edit content or switch templates
7. Click the **"Write"** button
8. See success message - card added to Anki

> 💡 **Tip**: Click the 📌 pin button to keep the panel visible when navigating.

### 3.3 Switching Templates

If you have multiple parsing templates:

- **In Popup**: Use the dropdown menu at the top
- **In Floating Panel**: Use the dropdown within the panel

After switching templates, you'll be prompted to re-parse if there was previous content.

---

## 4. Template Configuration

### 4.1 What is a Parsing Template?

A parsing template defines:

- Which fields AI should generate (e.g., Word, Meaning, Example)
- How fields map to your Anki note type
- Custom parsing instructions (optional)

### 4.2 Creating a New Template

1. Open **Extension Settings**
2. Go to the **"Templates"** tab
3. Click **"+ New Template"**
4. Fill in the information:

| Field         | Description         | Example               |
| ------------- | ------------------- | --------------------- |
| Template Name | A recognizable name | "English Vocabulary"  |
| Target Deck   | Anki deck name      | "English::Vocabulary" |
| Note Type     | Anki note template  | "Basic" or custom     |

5. **Add Fields**:

Click **"+ Add Field"** and configure each field:

| Config            | Description                                  |
| ----------------- | -------------------------------------------- |
| Field Name        | Must match Anki note type field name exactly |
| Display Name      | Friendly name shown in UI                    |
| Parse Instruction | How AI should populate this field (optional) |

6. Click **"Save Template"**

### 4.3 Template Examples

#### English Vocabulary Template

```
Template Name: English Vocabulary
Target Deck: English::Words
Note Type: Basic-reversed

Field Configuration:
┌──────────────┬───────────────────────────────────────┐
│ Field Name   │ Parse Instruction                     │
├──────────────┼───────────────────────────────────────┤
│ Word         │ The word itself                       │
│ Pronunciation│ IPA phonetic transcription            │
│ Meaning      │ Definition with part of speech        │
│ Example      │ 1-2 example sentences                 │
│ Etymology    │ Word origin and roots                 │
└──────────────┴───────────────────────────────────────┘
```

#### Japanese Learning Template

```
Template Name: Japanese Vocabulary
Target Deck: 日本語::語彙
Note Type: Japanese-vocab

Field Configuration:
┌──────────────┬───────────────────────────────────────┐
│ Field Name   │ Parse Instruction                     │
├──────────────┼───────────────────────────────────────┤
│ 単語         │ The word (in Japanese)                │
│ 読み方       │ Hiragana reading                      │
│ 意味         │ English/Chinese meaning               │
│ 例文         │ Example sentence in Japanese          │
│ Notes        │ Usage notes, special cases            │
└──────────────┴───────────────────────────────────────┘
```

### 4.4 Custom AI Prompts

Advanced users can customize the AI parsing prompt:

1. In template editor, expand **"Advanced Settings"**
2. Enter your custom prompt in the **"Custom Prompt"** text area
3. Use `{{INPUT_TEXT}}` placeholder for user input

**Example:**

```
You are a professional vocabulary teacher. Analyze this word:

{{INPUT_TEXT}}

Output in JSON format:
{
  "Word": "the word itself",
  "Pronunciation": "IPA transcription",
  "Meaning": "detailed definition",
  "Example": "2 example sentences",
  "Collocations": "common word combinations"
}
```

---

## 5. Advanced Features

### 5.1 Multi-Provider Failover

Configure multiple AI providers for reliability:

- Primary provider is used first
- Automatic failover to backup if primary fails

**Setup**: In settings, configure API keys for multiple providers.

### 5.2 Health Monitoring

Each AI provider has a **"Test Connection"** button:

- ✅ **Healthy** - Service working normally
- ⚠️ **Error** - Service issue, shows error message
- ❓ **Unknown** - Not yet tested

### 5.3 Style Configuration

Customize how content appears in Anki:

| Setting     | Description            | Default |
| ----------- | ---------------------- | ------- |
| Font Size   | Card content font size | 14px    |
| Text Align  | Left/Center/Right      | Left    |
| Line Height | Line spacing           | 1.4     |

### 5.4 Language Settings

Supported interface languages:

- 🇺🇸 English
- 🇨🇳 简体中文
- 🇹🇼 繁體中文
- 🇯🇵 日本語

Change: Settings → Interface → Language

---

## 6. Troubleshooting

### Q1: Can't connect to Anki?

**Symptom**: "Connection failed" error when writing to Anki

**Solutions**:

1. ✅ Ensure Anki desktop is running
2. ✅ Verify AnkiConnect add-on is installed (code: 2055492159)
3. ✅ Restart Anki and try again
4. ✅ Check if firewall blocks port 127.0.0.1:8765

### Q2: AI parsing failed?

**Symptom**: Long wait or error after clicking "Parse"

**Solutions**:

1. ✅ Verify API Key is correct
2. ✅ Check API quota/credits
3. ✅ Try switching to another AI provider
4. ✅ Check network connection

### Q3: Floating assistant not appearing?

**Symptom**: No floating button after selecting text

**Solutions**:

1. ✅ Check if "Floating Assistant" is enabled in settings
2. ✅ Refresh the webpage
3. ✅ Some sites (like Chrome internal pages) don't support extensions

### Q4: Card fields are empty?

**Symptom**: Card created but fields are blank

**Solutions**:

1. ✅ Verify field names match Anki note type exactly
2. ✅ Ensure AI parsed content correctly before writing
3. ✅ Check you selected the correct note type

### Q5: How to update the extension?

**Chrome Web Store**: Updates automatically

**Manual install**:

1. Download latest version
2. Go to `chrome://extensions/`
3. Remove old version
4. Load new version

---

## 📞 Getting Help

If you encounter other issues:

1. Check [GitHub Issues](https://github.com/novahoo13/anki-word-assistant/issues)
2. Submit a new Issue describing your problem
3. Include screenshots and reproduction steps

---

_Thank you for using Anki Word Assistant! Happy learning!_ 🎓
