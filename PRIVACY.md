# Privacy Policy for Anki Word Assistant

**Last Updated: January 3, 2026**

## Overview

Anki Word Assistant is a browser extension that helps users create Anki flashcards using AI services. This privacy policy explains how the extension handles user data.

## Data Collection

### What We DON'T Collect

- ❌ We do NOT collect any personal information
- ❌ We do NOT track your browsing activity
- ❌ We do NOT send any data to our servers
- ❌ We do NOT use analytics or tracking tools

### What Data Is Stored Locally

The following data is stored **locally on your device** using Chrome's storage API:

| Data Type     | Purpose                                        | Storage Location  |
| ------------- | ---------------------------------------------- | ----------------- |
| API Keys      | To authenticate with AI services you configure | Local (encrypted) |
| Configuration | Your preferences and settings                  | Local             |
| Templates     | Custom parsing templates you create            | Local             |

## Third-Party Services

When you use this extension, your input text is sent to the AI service **you have configured**:

- **Google Gemini** (if configured): Subject to [Google's Privacy Policy](https://policies.google.com/privacy)
- **OpenAI** (if configured): Subject to [OpenAI's Privacy Policy](https://openai.com/privacy/)
- **Anthropic Claude** (if configured): Subject to [Anthropic's Privacy Policy](https://www.anthropic.com/privacy)

The extension also communicates with:

- **AnkiConnect** (local software): Only communicates with Anki running on your local machine (127.0.0.1:8765)

## Data Security

- All API keys are encrypted using AES-GCM 256-bit encryption before storage
- Data never leaves your device except when explicitly sending queries to AI services
- No data is transmitted to any servers owned or operated by us

## Permissions Explained

| Permission                | Why It's Needed                                           |
| ------------------------- | --------------------------------------------------------- |
| `storage`                 | To save your settings and templates locally               |
| `<all_urls>`              | To enable the floating assistant on any webpage you visit |
| `http://127.0.0.1:8765/*` | To communicate with AnkiConnect on your local machine     |
| AI Service URLs           | To send your text for AI parsing when you request it      |

## Your Control

You have complete control over your data:

- **Delete all data**: Uninstall the extension or clear extension data in Chrome settings
- **View stored data**: Use Chrome DevTools to inspect local storage
- **Disable features**: Turn off the floating assistant in extension options

## Children's Privacy

This extension is not intended for children under 13. We do not knowingly collect data from children.

## Changes to This Policy

If we make changes to this privacy policy, we will update the "Last Updated" date at the top.

## Contact

For privacy-related questions, please open an issue on our GitHub repository:
https://github.com/novahoo13/anki-word-assistant/issues

---

_This extension is open source and you can review the complete source code on GitHub._
