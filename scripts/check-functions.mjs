import { zipFunctions } from "@netlify/zip-it-and-ship-it";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

await mkdir(".cache/functions", { recursive: true });
const functions = await zipFunctions("netlify/functions", ".cache/functions", {
  config: { "*": { nodeBundler: "esbuild", nodeVersion: "24" } },
});
assert.deepEqual(functions.map((f) => f.name).sort(), [
  "dashboard",
  "sync-daily",
]);
assert.equal(
  functions.find((f) => f.name === "sync-daily").schedule,
  "0 9 * * *",
);
for (const fn of functions)
  console.info(`Função empacotada: ${fn.name} (${fn.runtime}).`);
