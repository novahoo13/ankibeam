# AnkiBeam

English | [简体中文](docs/README_zh_CN.md) | [繁體中文](docs/README_zh_TW.md) | [日本語](docs/README_ja.md)

An AI-powered assistant to help create Anki cards from dictionary lookup results.

## ✨ Features

- **AI-Powered Parsing** — Enter a word or phrase, and the AI automatically generates definitions, example sentences, etymology, and more
- **Floating Assistant** — Select text on any webpage to instantly parse and save to Anki with one click
- **Custom Templates** — Flexibly configure output fields to match different Anki note types
- **Multiple AI Providers** —
  - Google Gemini (default: `gemini-2.5-flash`)
  - OpenAI GPT (default: `gpt-5.2`)
  - Anthropic Claude (default: `claude-sonnet-4-5`)
- **Automatic Failover** — Seamlessly switches to a backup provider when the primary one is unavailable
- **Multilingual UI** — English, 简体中文, 繁體中文, 日本語

## 📦 Installation

### Prerequisites

1. **Anki Desktop** — [Download Anki](https://apps.ankiweb.net/)
2. **AnkiConnect Plugin** — Install the AnkiConnect plugin in Anki
   - Open Anki → Tools → Add-ons → Get Add-ons
   - Enter the code: `2055492159`
   - Restart Anki

### Install the Extension

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the project folder

## 🚀 Usage

### Popup Mode

1. Click the AnkiBeam icon in the Chrome toolbar
2. Enter a word or phrase in the input box
3. Click **Parse** to generate AI content
4. Review and edit the results
5. Click **Write to Anki** to save the card

### Floating Assistant

1. Select any text on a webpage
2. Click the floating button that appears
3. View the parsed results in the floating panel
4. Click **Write** to save to Anki

### Configuration

After installation, right-click the extension icon → **Options** to access the settings page, where you can configure:

- **AI Provider** — Select a provider and enter your API Key
- **Anki Connection** — Set the default deck and note type
- **Templates** — Create and manage custom parsing templates with field mapping and custom prompts
- **Style** — Customize font size, text alignment, and line height for Anki card content

> 📖 For detailed setup instructions, see the [User Manual](docs/USER_MANUAL_EN.md).

## ❓ FAQ

### Cannot connect to Anki?

1. Make sure Anki Desktop is running
2. Verify the AnkiConnect plugin is installed (code: `2055492159`)
3. Restart Anki and try again

### AI parsing failed?

1. Check that the API Key is configured correctly
2. Confirm the API Key has sufficient quota
3. Try switching to a different AI provider

### Floating Assistant not showing up?

1. Check that **Floating Assistant** is enabled in settings
2. Refresh the webpage and try again
3. Some special pages (e.g., Chrome built-in pages) do not support content scripts

## 🔒 Privacy

- All API Keys are encrypted and stored locally
- Query content is only sent to the AI provider you have configured
- The extension does not collect any user data
- See the full [Privacy Policy](PRIVACY.md)

## 🛠 Development

### Tech Stack

- Chrome Extension Manifest V3
- ES6 Modules
- Tailwind CSS

### Local Development

```bash
# Install dependencies
npm install

# Watch CSS changes
npm run css:watch

# Run tests
npm test
```

## 📄 License

[MIT License](LICENSE)

## 💬 Feedback & Support

If you have any questions or suggestions, please submit an [Issue](https://github.com/novahoo13/ankibeam/issues).
