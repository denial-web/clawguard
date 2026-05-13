#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(new URL("..", import.meta.url).pathname);
const distDir = path.join(root, "dist");
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const version = packageJson.version;
const kitName = `clawguard-usb-kit-v${version}`;
const kitDir = path.join(distDir, kitName);
const packageDir = path.join(kitDir, "packages");
const npmCacheDir = path.join(distDir, ".npm-cache");

await fs.rm(kitDir, { recursive: true, force: true });
await fs.mkdir(packageDir, { recursive: true });

const tarballName = await packNpmPackage(packageDir);
const tarballPath = path.join(packageDir, tarballName);

await copyIfExists("docs/CURSOR_USB_HANDOFF.md", "docs/CURSOR_USB_HANDOFF.md");
await copyIfExists("docs/CURSOR_SETUP_PROMPT.md", "CURSOR_SETUP_PROMPT.md");
await copyIfExists("docs/MODEL_PATH_DECISION_TREE.md", "MODEL_PATH_DECISION_TREE.md");
await copyIfExists("docs/FIVE_MINUTE_TESTER_KIT.md", "docs/FIVE_MINUTE_TESTER_KIT.md");
await copyIfExists("docs/EXTERNAL_TESTING.md", "docs/EXTERNAL_TESTING.md");
await copyIfExists("docs/PORTABLE_AGENT_SETUP.md", "docs/PORTABLE_AGENT_SETUP.md");
await copyIfExists("docs/AGENT_MESSAGING_SETUP.md", "docs/AGENT_MESSAGING_SETUP.md");
await copyIfExists("docs/SOP_PACKS.md", "docs/SOP_PACKS.md");
await copyIfExists("docs/PHYSICAL_DEVICE_AI_GOVERNOR.md", "docs/PHYSICAL_DEVICE_AI_GOVERNOR.md");
await copyIfExists("configs", "configs");
await copyIfExists("examples", "examples");
await copyIfExists("docs/assets/clawguard-web-demo.png", "assets/clawguard-web-demo.png");
await copyIfExists("docs/assets/clawguard-sop-demo.png", "assets/clawguard-sop-demo.png");
await copyIfExists("docs/assets/clawguard-demo.mp4", "assets/clawguard-demo.mp4");

await fs.writeFile(path.join(kitDir, "README_FIRST.md"), renderReadme(tarballName));
await fs.writeFile(path.join(kitDir, "TEAM_TEST_CHECKLIST.md"), renderChecklist(tarballName));
await fs.writeFile(path.join(kitDir, "checksums.txt"), await renderChecksums([
  path.join("packages", tarballName),
  "README_FIRST.md",
  "CURSOR_SETUP_PROMPT.md",
  "MODEL_PATH_DECISION_TREE.md"
]));

const archivePath = path.join(distDir, `${kitName}.tar.gz`);
await fs.rm(archivePath, { force: true });
await execFileAsync("tar", ["-czf", archivePath, "-C", distDir, kitName]);

console.log(`ClawGuard USB handoff kit created: ${kitDir}`);
console.log(`Archive: ${archivePath}`);
console.log("");
console.log("Copy either the folder or the .tar.gz archive to a USB drive.");

async function packNpmPackage(destination) {
  await fs.mkdir(npmCacheDir, { recursive: true });
  const { stdout } = await execFileAsync("npm", ["--cache", npmCacheDir, "pack", "--pack-destination", destination], {
    cwd: root
  });
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  const name = lines.at(-1);
  if (!name || !name.endsWith(".tgz")) {
    throw new Error(`Could not determine npm tarball name from npm pack output: ${stdout}`);
  }
  return name;
}

async function copyIfExists(sourceRelative, destinationRelative) {
  const source = path.join(root, sourceRelative);
  const destination = path.join(kitDir, destinationRelative);
  try {
    const stat = await fs.stat(source);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    if (stat.isDirectory()) {
      await fs.cp(source, destination, {
        recursive: true,
        filter: (item) => !item.includes(`${path.sep}node_modules${path.sep}`) && !item.includes(`${path.sep}.git${path.sep}`)
      });
    } else {
      await fs.copyFile(source, destination);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function renderChecksums(files) {
  const lines = [];
  for (const relative of files) {
    const filePath = path.join(kitDir, relative);
    const hash = createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
    lines.push(`${hash}  ${relative}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderReadme(tarballName) {
  return `# ClawGuard USB Handoff Kit v${version}

Start here.

This folder lets a teammate install and test ClawGuard from a USB drive, then ask Cursor to help choose a safe setup path for OpenClaw, Hermes Agent, PicoClaw, local models, API models, SOP workflows, and physical-device dry-run planning.

## Fastest Test

If this PC has internet:

\`\`\`bash
npx --yes --package @denial-web/clawguard@${version} clawguard --version
npx --yes --package @denial-web/clawguard@${version} clawguard demo quickstart
\`\`\`

If this PC is offline, run from this USB kit folder:

\`\`\`bash
npm install -g ./packages/${tarballName}
clawguard --version
clawguard demo quickstart
\`\`\`

If global install is not allowed:

\`\`\`bash
TARBALL="$(pwd)/packages/${tarballName}"
npx --yes --package "$TARBALL" clawguard --version
npx --yes --package "$TARBALL" clawguard demo quickstart
\`\`\`

Expected:

- version prints \`${version}\`
- quickstart says \`Ready: yes\`
- skill scan says \`BLOCK / CRITICAL\`
- device plan says \`BLOCK / drone drone-takeoff\`

## Use Cursor

Open this folder in Cursor and paste the contents of:

\`\`\`text
CURSOR_SETUP_PROMPT.md
\`\`\`

Cursor should ask which path to use:

- framework: OpenClaw, Hermes Agent, PicoClaw, Cursor-only, or other
- model path: local-first, cloud-balanced/API, financial-sensitive, or physical-device safety
- install path: test workspace or real trusted skill folder
- approval path: local logs now, Telegram/WhatsApp later

## Important Files

- \`CURSOR_SETUP_PROMPT.md\` - paste into Cursor.
- \`MODEL_PATH_DECISION_TREE.md\` - choose local/API/financial/device path.
- \`TEAM_TEST_CHECKLIST.md\` - record first test results.
- \`docs/CURSOR_USB_HANDOFF.md\` - full setup guide.
- \`packages/${tarballName}\` - offline npm package.

## Safety

Do not paste real secrets, API keys, private keys, customer data, bank data, camera/audio data, or proprietary files into public issues or chat.

Do not connect to real drones, cameras, robots, toys, IoT, or industrial devices during first setup. Use dry-run planning only.
`;
}

function renderChecklist(tarballName) {
  return `# Team Test Checklist

Tester:
Date:
Machine:
OS:
Node version:
Internet available: yes / no
Framework: OpenClaw / Hermes Agent / PicoClaw / Cursor-only / other
Model path: local-first / cloud-balanced API / financial-sensitive / physical-device safety

## Commands

Online:

\`\`\`bash
npx --yes --package @denial-web/clawguard@${version} clawguard --version
npx --yes --package @denial-web/clawguard@${version} clawguard demo quickstart
\`\`\`

Offline:

\`\`\`bash
npm install -g ./packages/${tarballName}
clawguard --version
clawguard demo quickstart
\`\`\`

Framework setup:

\`\`\`bash
clawguard setup --framework openclaw
clawguard setup --framework hermes
clawguard setup --framework picoclaw
\`\`\`

## Results

- Version command worked: yes / no
- Quickstart demo worked: yes / no
- Output was clear: yes / no / partly
- Chosen framework:
- Chosen model path:
- Biggest confusion:
- Next requested feature:
- Error message, if any:

## Notes

`;
}
