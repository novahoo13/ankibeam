/**
 * @fileoverview テンプレートストアの検証スクリプト
 *
 * このスクリプトは阶段1の検査点を验证する:
 * 1. loadConfig()が完全にtemplateLibraryデータがない場合、空のテンプレートオブジェクトを含むconfigを返す
 * 2. setActiveTemplate()によりui.activeTemplateIdとtemplateSelectionSourceが設定される
 * 3. buildPromptFromTemplate()がテンプレートのフィールド順序に従ってスキーマを出力できる
 */

import {
  loadTemplateLibrary,
  getTemplateById,
  saveTemplate,
  deleteTemplate,
  setDefaultTemplate,
  setActiveTemplate,
  listTemplates,
  getActiveTemplate,
  getDefaultTemplate,
  normalizeTemplateFields,
} from "../utils/template-store.js";

import { buildPromptFromTemplate } from "../utils/prompt-engine.js";

/**
 * テスト結果を出力するヘルパー関数
 */
function logTest(testName, passed, message = "") {
  const status = passed ? "✓ PASS" : "✗ FAIL";
  console.log(`${status}: ${testName}`);
  if (message) {
    console.log(`  ${message}`);
  }
}

/**
 * 検査点1: loadConfig()が空のtemplateLibraryを返すことを確認
 */
function testCheckpoint1() {
  console.log("\n=== 検査点1: 空のテンプレートライブラリの読み込み ===");

  // 空のconfigから読み込み
  const emptyConfig = {};
  const library1 = loadTemplateLibrary(emptyConfig);

  logTest(
    "空のconfigから読み込み",
    library1.version === 1 &&
      library1.defaultTemplateId === null &&
      Object.keys(library1.templates).length === 0,
    `version: ${library1.version}, defaultTemplateId: ${library1.defaultTemplateId}, templates count: ${Object.keys(library1.templates).length}`,
  );

  // templateLibraryが存在しないconfigから読み込み
  const configWithoutLibrary = {
    version: "2.3",
    aiConfig: {},
    ui: {},
  };
  const library2 = loadTemplateLibrary(configWithoutLibrary);

  logTest(
    "templateLibraryなしのconfigから読み込み",
    library2.version === 1 &&
      library2.defaultTemplateId === null &&
      Object.keys(library2.templates).length === 0,
    `空のライブラリが返される`,
  );
}

/**
 * 検査点2: setActiveTemplate()によりui設定が更新されることを確認
 */
function testCheckpoint2() {
  console.log("\n=== 検査点2: アクティブテンプレートの設定 ===");

  // テストデータ準備
  const config = {
    templateLibrary: {
      version: 1,
      defaultTemplateId: null,
      templates: {
        tpl_001: {
          id: "tpl_001",
          name: "テストテンプレート",
          description: "テスト用",
          deckName: "Default",
          modelName: "Basic",
          fields: [
            {
              name: "Front",
              label: "正面",
              parseInstruction: "単語",
              order: 0,
            },
            { name: "Back", label: "背面", parseInstruction: "意味", order: 1 },
          ],
          prompt: "",
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-01T00:00:00Z",
        },
      },
    },
    ui: {},
  };

  // アクティブテンプレートを設定
  const result = setActiveTemplate(config, "tpl_001", "popup");

  logTest("setActiveTemplate()の実行", result === true, `戻り値: ${result}`);

  logTest(
    "ui.activeTemplateIdの設定",
    config.ui.activeTemplateId === "tpl_001",
    `activeTemplateId: ${config.ui.activeTemplateId}`,
  );

  logTest(
    "ui.templateSelectionSourceの設定",
    config.ui.templateSelectionSource === "popup",
    `templateSelectionSource: ${config.ui.templateSelectionSource}`,
  );

  // nullでクリア
  setActiveTemplate(config, null, "clear");

  logTest(
    "nullでクリア",
    config.ui.activeTemplateId === null,
    `activeTemplateId: ${config.ui.activeTemplateId}`,
  );
}

/**
 * 検査点3: buildPromptFromTemplate()がフィールド順序に従ってスキーマを出力できることを確認
 */
function testCheckpoint3() {
  console.log("\n=== 検査点3: テンプレートからのプロンプト構築 ===");

  const template = {
    id: "tpl_001",
    name: "基本テンプレート",
    fields: [
      { name: "Word", label: "単語", parseInstruction: "英単語", order: 0 },
      {
        name: "Reading",
        label: "読み方",
        parseInstruction: "発音記号",
        order: 1,
      },
      {
        name: "Meaning",
        label: "意味",
        parseInstruction: "日本語訳",
        order: 2,
      },
    ],
    prompt: "",
  };

  const userInput = "example";

  try {
    const prompt = buildPromptFromTemplate(template, userInput);

    logTest(
      "buildPromptFromTemplate()の実行",
      typeof prompt === "string" && prompt.length > 0,
      `プロンプト長: ${prompt.length}`,
    );

    // プロンプトにフィールド名が含まれることを確認
    const hasWord = prompt.includes("Word");
    const hasReading = prompt.includes("Reading");
    const hasMeaning = prompt.includes("Meaning");

    logTest(
      "フィールド名の含有確認",
      hasWord && hasReading && hasMeaning,
      `Word: ${hasWord}, Reading: ${hasReading}, Meaning: ${hasMeaning}`,
    );

    // ユーザー入力が含まれることを確認
    logTest(
      "ユーザー入力の含有確認",
      prompt.includes(userInput),
      `"${userInput}" が含まれている`,
    );
  } catch (error) {
    logTest(
      "buildPromptFromTemplate()の実行",
      false,
      `エラー: ${error.message}`,
    );
  }
}

/**
 * 追加テスト: テンプレートのCRUD操作
 */
function testTemplateCRUD() {
  console.log("\n=== 追加テスト: テンプレートCRUD操作 ===");

  const config = {
    templateLibrary: {
      version: 1,
      defaultTemplateId: null,
      templates: {},
    },
  };

  // Create: テンプレート作成
  const newTemplate = {
    name: "新規テンプレート",
    description: "テスト用の新規テンプレート",
    deckName: "TestDeck",
    modelName: "TestModel",
    fields: [
      {
        name: "Field1",
        label: "フィールド1",
        parseInstruction: "説明1",
        order: 0,
      },
      {
        name: "Field2",
        label: "フィールド2",
        parseInstruction: "説明2",
        order: 1,
      },
    ],
    prompt: "テストプロンプト",
  };

  let savedTemplate;
  try {
    savedTemplate = saveTemplate(config, newTemplate);
    logTest(
      "テンプレート作成",
      savedTemplate.id && savedTemplate.name === newTemplate.name,
      `ID: ${savedTemplate.id}`,
    );

    // 最初のテンプレートは自動的にデフォルトに設定される
    logTest(
      "自動デフォルト設定",
      config.templateLibrary.defaultTemplateId === savedTemplate.id,
      `defaultTemplateId: ${config.templateLibrary.defaultTemplateId}`,
    );
  } catch (error) {
    logTest("テンプレート作成", false, `エラー: ${error.message}`);
    return;
  }

  // Read: テンプレート読み取り
  const retrieved = getTemplateById(config, savedTemplate.id);
  logTest(
    "テンプレート読み取り",
    retrieved && retrieved.id === savedTemplate.id,
    `取得成功`,
  );

  // List: テンプレート一覧
  const templates = listTemplates(config);
  logTest(
    "テンプレート一覧",
    templates.length === 1 && templates[0].id === savedTemplate.id,
    `テンプレート数: ${templates.length}`,
  );

  // Update: テンプレート更新
  const updatedTemplate = {
    ...savedTemplate,
    name: "更新されたテンプレート",
    description: "説明も更新",
  };
  const updated = saveTemplate(config, updatedTemplate);
  logTest(
    "テンプレート更新",
    updated.name === "更新されたテンプレート" &&
      updated.id === savedTemplate.id,
    `更新成功`,
  );

  // Delete: テンプレート削除
  const deleted = deleteTemplate(config, savedTemplate.id);
  logTest(
    "テンプレート削除",
    deleted === true &&
      Object.keys(config.templateLibrary.templates).length === 0,
    `削除成功、テンプレート数: ${Object.keys(config.templateLibrary.templates).length}`,
  );

  // 削除後defaultTemplateIdがクリアされることを確認
  logTest(
    "削除後のデフォルトクリア",
    config.templateLibrary.defaultTemplateId === null,
    `defaultTemplateId: ${config.templateLibrary.defaultTemplateId}`,
  );
}

/**
 * 追加テスト: フィールド正規化
 */
function testFieldNormalization() {
  console.log("\n=== 追加テスト: フィールド正規化 ===");

  const fields = [
    { name: "Field1", parseInstruction: "説明1", order: 2 },
    { name: "Field2", parseInstruction: "説明2", order: 0 },
    { name: "Field3", parseInstruction: "説明3", order: 1 },
  ];

  try {
    const normalized = normalizeTemplateFields(fields);

    logTest(
      "フィールド正規化",
      normalized.length === 3,
      `フィールド数: ${normalized.length}`,
    );

    // order順にソートされていることを確認
    logTest(
      "order順ソート",
      normalized[0].order === 0 &&
        normalized[1].order === 1 &&
        normalized[2].order === 2,
      `順序: ${normalized.map((f) => f.order).join(", ")}`,
    );

    // labelのデフォルト値が設定されることを確認
    logTest(
      "labelのデフォルト値",
      normalized[0].label === "Field2" &&
        normalized[1].label === "Field3" &&
        normalized[2].label === "Field1",
      `labels: ${normalized.map((f) => f.label).join(", ")}`,
    );
  } catch (error) {
    logTest("フィールド正規化", false, `エラー: ${error.message}`);
  }
}

/**
 * すべてのテストを実行
 */
function runAllTests() {
  console.log("======================================");
  console.log("阶段1 検証スクリプト実行開始");
  console.log("======================================");

  testCheckpoint1();
  testCheckpoint2();
  testCheckpoint3();
  testTemplateCRUD();
  testFieldNormalization();

  console.log("\n======================================");
  console.log("検証完了");
  console.log("======================================\n");
}

// Node.js環境でテストを実行
if (
  typeof process !== "undefined" &&
  process.versions &&
  process.versions.node
) {
  runAllTests();
}

export { runAllTests };
