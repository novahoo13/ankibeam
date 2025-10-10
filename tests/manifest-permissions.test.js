import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getAllManifestHostPermissions } from "../utils/providers.config.js";

test("manifest host permissions align with providers config", async () => {
  const manifestUrl = new URL("../manifest.json", import.meta.url);
  const manifest = JSON.parse(await readFile(manifestUrl, "utf-8"));

  const expected = getAllManifestHostPermissions();
  const declared = Array.isArray(manifest.host_permissions)
    ? [...manifest.host_permissions].sort()
    : [];

  assert.deepStrictEqual(
    declared,
    expected,
    "manifest host_permissions must match provider metadata",
  );

  assert.ok(
    Array.isArray(manifest.optional_host_permissions),
    "optional_host_permissions must be defined to support runtime grants",
  );
  assert.ok(
    manifest.optional_host_permissions.includes("http://127.0.0.1/*"),
    "http://127.0.0.1/* must be listed for loopback testing",
  );
  assert.ok(
    manifest.optional_host_permissions.includes("https://*/*"),
    "https://*/* must be listed for OpenAI-compatible hosts",
  );
  assert.ok(
    manifest.optional_host_permissions.includes("http://localhost/*"),
    "http://localhost/* must be listed for local development hosts",
  );
});
