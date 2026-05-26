#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const schemasDir = path.join(repoRoot, "schemas");
const outDir = path.resolve(repoRoot, process.argv[2] ?? "docs-site");

async function listSchemas() {
  const entries = await fs.readdir(schemasDir);
  return entries.filter((name) => name.endsWith(".schema.json")).sort();
}

async function readMeta(file) {
  const text = await fs.readFile(path.join(schemasDir, file), "utf8");
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`schemas/${file} is not valid JSON: ${error.message}`);
  }

  return {
    file,
    title: parsed.title ?? file,
    description: parsed.description ?? "",
    id: parsed.$id ?? null
  };
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderIndex(schemas) {
  const rows = schemas.map((schema) => {
    const href = `./schemas/${schema.file}`;
    return [
      "  <li>",
      `    <h3><a href=\"${escapeHtml(href)}\">${escapeHtml(schema.title)}</a></h3>`,
      schema.description ? `    <p>${escapeHtml(schema.description)}</p>` : "",
      `    <p><code>${escapeHtml(schema.file)}</code>${schema.id ? ` &middot; <code>${escapeHtml(schema.id)}</code>` : ""}</p>`,
      "  </li>"
    ].filter(Boolean).join("\n");
  }).join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>ClawGuard Schemas</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
      h1 { font-size: 1.6rem; }
      h3 { margin-bottom: 0.2rem; }
      ul { list-style: none; padding: 0; }
      li { margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid #ddd; }
      code { background: #f4f4f4; padding: 0.05rem 0.3rem; border-radius: 3px; }
      a { color: #1a4fa0; text-decoration: none; }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <h1>ClawGuard Schemas</h1>
    <p>JSON Schemas published from <code>schemas/</code> in <a href="https://github.com/denial-web/clawguard">denial-web/clawguard</a>. These are the resolvable targets for the <code>$id</code> URLs embedded in each schema.</p>
    <ul>
${rows}
    </ul>
  </body>
</html>
`;
}

async function rmRecursive(target) {
  await fs.rm(target, { recursive: true, force: true });
}

async function copyFile(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}

async function main() {
  const files = await listSchemas();
  const schemas = await Promise.all(files.map(readMeta));
  await rmRecursive(outDir);
  await fs.mkdir(outDir, { recursive: true });

  for (const schema of schemas) {
    const source = path.join(schemasDir, schema.file);
    const destination = path.join(outDir, "schemas", schema.file);
    await copyFile(source, destination);
  }

  await fs.writeFile(path.join(outDir, "index.html"), renderIndex(schemas));
  await fs.writeFile(path.join(outDir, ".nojekyll"), "");
  console.log(`Wrote ${schemas.length} schema(s) to ${outDir}`);
}

main().catch((error) => {
  console.error(`build-pages failed: ${error.message}`);
  process.exitCode = 1;
});
