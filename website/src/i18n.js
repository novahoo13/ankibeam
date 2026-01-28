import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { en, zh_CN, zh_TW, ja } from "./locales";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en,
      zh: zh_CN, // Detect "zh" as zh-CN
      "zh-CN": zh_CN,
      "zh-TW": zh_TW,
      ja,
    },
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
