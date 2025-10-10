# Privacy Policy for Anki Word Assistant

**Last Updated:** 2025-10-10

This Privacy Policy describes how Anki Word Assistant (the "Extension") handles your information.

## 1. Information We Collect

The Extension handles the following data:

*   **Configuration Data:** This includes your AI provider settings and AnkiConnect URL. This data is stored locally on your computer using the `chrome.storage.local` API.
*   **API Key:** Your API key for the selected AI service (e.g., Google Gemini) is encrypted and stored locally on your computer. It is used solely for communicating with the AI service API and is never transmitted to any other server.
*   **User-Input Text:** The text you provide for parsing is sent to the selected AI service API for processing. This data is not stored by the Extension.

## 2. How We Use Your Information

*   Your configuration data is used to operate the Extension's features.
*   Your API key is used exclusively to authenticate with the AI service you have configured.
*   The text you input is used only to generate the Anki card content.

## 3. Information Sharing

We do not share your personal information or data with any third parties, other than the AI service provider (e.g., Google) that you explicitly configure and use through the Extension. Your data is subject to the privacy policy of the AI service you choose to use.

## 4. Data Security

We take reasonable measures to protect your information. Your API key is encrypted before being stored locally to prevent unauthorized access.

## 5. Changes to This Privacy Policy

We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy in the Extension's options.

## 6. Contact Us

If you have any questions about this Privacy Policy, please open an issue on our project's GitHub page.

## 7. Permissions and Runtime Requests

The Extension declares a small set of host permissions in `manifest.json` for AnkiConnect, Google Gemini, OpenAI, and Anthropic. When you configure a custom OpenAI-compatible endpoint, the Extension may request additional host permissions at runtime so that Chrome can send requests to the new domain. This permission prompt happens entirely in your browser, and no configuration data or API keys leave your device during the process. If you deny the request, the new configuration is not saved and the Extension continues using the previous endpoint.
