# Anki Word Assistant

Anki Word Assistant is a Chrome extension designed to streamline the process of creating Anki cards from online dictionary results or any selected text.

## ✨ Features

- **AI-Powered Parsing**: Utilizes AI (Google Gemini by default) to intelligently parse unstructured text into structured "Front" and "Back" fields for your Anki cards.
- **Direct Anki Integration**: Connects directly to your Anki desktop application via the AnkiConnect addon, allowing you to create new cards with a single click.
- **Highly Configurable**:
    - **AI Model Selection**: Choose the specific Gemini model you want to use (e.g., `gemini-1.5-flash`, `gemini-1.5-pro`).
    - **Custom Prompts**: Tailor the AI's behavior by providing your own custom prompt templates.
- **Secure**: Your API key is encrypted and stored locally on your machine, never exposed in plain text.
- **Modern UI**: A clean and intuitive interface for a smooth user experience.

## 🚀 Installation and Setup

Follow these steps to get the extension up and running.

### Step 1: Prerequisites

1.  **Anki**: Make sure you have the [Anki desktop application](https://apps.ankiweb.net/) installed.
2.  **AnkiConnect**: Install the [AnkiConnect addon](https://ankiweb.net/shared/info/2055492159) within Anki. This is required for the extension to communicate with Anki.

### Step 2: Load the Extension

1.  Open your Chrome/Edge browser and navigate to the extensions page (`chrome://extensions` or `edge://extensions`).
2.  Enable **"Developer mode"** using the toggle switch.
3.  Click the **"Load unpacked"** button.
4.  Select the root folder of this project.

### Step 3: Configure the Extension

1.  After loading, the Anki Word Assistant icon will appear in your browser's toolbar.
2.  **Right-click** the icon and select **"Options"**.
3.  In the options page:
    -   **AI Service Configuration**: Enter your **Gemini API Key**. You can also specify a different **Model Name** if you wish.
    -   **AnkiConnect Configuration**: Test the connection to ensure the extension can communicate with Anki.
    -   **Prompt Configuration**: (Optional) You can add a custom prompt to guide the AI.
4.  Click the **"Test"** buttons to verify your connections.
5.  Click **"Save Config"** to save your settings.

## 💡 How to Use

1.  Click the Anki Word Assistant icon in your browser toolbar to open the popup.
2.  Paste any text (like a dictionary entry) into the main text area.
3.  Click the **"Parse"** button. The AI will process the text and populate the "Front" and "Back" fields.
4.  Review and edit the generated content as needed.
5.  Click the **"Write to Anki"** button to create the new card in your default Anki deck.

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.