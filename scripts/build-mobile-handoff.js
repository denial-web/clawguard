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
const kitName = `clawguard-mobile-kit-v${version}`;
const kitDir = path.join(distDir, kitName);
const packageDir = path.join(kitDir, "packages");
const npmCacheDir = path.join(distDir, ".npm-cache");

await fs.rm(kitDir, { recursive: true, force: true });
await fs.mkdir(packageDir, { recursive: true });

const tarballName = await packNpmPackage(packageDir);

await copyIfExists("docs/MOBILE_APPROVAL_HANDOFF.md", "MOBILE_APPROVAL_HANDOFF.md");
await copyIfExists("docs/internal/MOBILE_SETUP_PROMPT.md", "MOBILE_SETUP_PROMPT.md");
await copyIfExists("docs/AGENT_MESSAGING_SETUP.md", "docs/AGENT_MESSAGING_SETUP.md");
await copyIfExists("docs/CURSOR_USB_HANDOFF.md", "docs/CURSOR_USB_HANDOFF.md");
await copyIfExists("docs/internal/CURSOR_SETUP_PROMPT.md", "docs/CURSOR_SETUP_PROMPT.md");
await copyIfExists("docs/MODEL_PATH_DECISION_TREE.md", "docs/MODEL_PATH_DECISION_TREE.md");
await copyIfExists("docs/PORTABLE_AGENT_SETUP.md", "docs/PORTABLE_AGENT_SETUP.md");
await copyIfExists("docs/PHYSICAL_DEVICE_AI_GOVERNOR.md", "docs/PHYSICAL_DEVICE_AI_GOVERNOR.md");
await copyIfExists("configs", "configs");
await copyIfExists("examples", "examples");

await fs.writeFile(path.join(kitDir, "README_FIRST_MOBILE.md"), renderReadme(tarballName));
await fs.writeFile(path.join(kitDir, "TEAM_MOBILE_TEST_CHECKLIST.md"), renderChecklist(tarballName));
await fs.writeFile(path.join(kitDir, "mobile-approval-links.html"), renderMobileLinksHtml());
await fs.writeFile(path.join(kitDir, "checksums.txt"), await renderChecksums([
  path.join("packages", tarballName),
  "README_FIRST_MOBILE.md",
  "MOBILE_SETUP_PROMPT.md",
  "MOBILE_APPROVAL_HANDOFF.md",
  "TEAM_MOBILE_TEST_CHECKLIST.md",
  "mobile-approval-links.html"
]));

const archivePath = path.join(distDir, `${kitName}.tar.gz`);
await fs.rm(archivePath, { force: true });
await execFileAsync("tar", ["-czf", archivePath, "-C", distDir, kitName]);

console.log(`ClawGuard mobile handoff kit created: ${kitDir}`);
console.log(`Archive: ${archivePath}`);
console.log("");
console.log("Copy either the folder or the .tar.gz archive to a USB drive, shared folder, or phone-accessible storage.");

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
  return `# ClawGuard Mobile Approval Kit v${version}

Start here.

This kit helps a teammate use Android or iPhone as an approval device while ClawGuard runs on a PC, server, or workstation.

## What This Is

- Android/iOS approval instructions.
- Telegram-first approval setup.
- WhatsApp Business Cloud API planning notes.
- Cursor prompt for guided setup.
- Offline npm tarball for the PC/server that runs ClawGuard.

## What This Is Not

- Not a native Android app.
- Not a native iOS app.
- Not a way to control arbitrary mobile apps.
- Not a banking, camera, drone, robot, or IoT controller.

Mobile app control needs an official target-app API, Android intent/app link, iOS App Intent, Shortcut, URL scheme, universal link, MDM path, or other approved integration.

## Fast PC/Server Test

If the PC/server has internet:

\`\`\`bash
npx --yes --package @denial-web/clawguard@${version} clawguard --version
npx --yes --package @denial-web/clawguard@${version} clawguard approvals demo-flow --keep
\`\`\`

If the PC/server is offline, run from this kit folder:

\`\`\`bash
npm install -g ./packages/${tarballName}
clawguard --version
clawguard approvals demo-flow --keep
\`\`\`

If global install is not allowed:

\`\`\`bash
TARBALL="$(pwd)/packages/${tarballName}"
npx --yes --package "$TARBALL" clawguard --version
npx --yes --package "$TARBALL" clawguard approvals demo-flow --keep
\`\`\`

## Phone Setup

1. Install Telegram on Android or iPhone.
2. Create a bot with @BotFather.
3. Send one message to the bot.
4. Get the chat id on the PC/server.
5. Run ClawGuard watcher and poller on the PC/server.
6. Reply from the phone:

\`\`\`text
approve <approval-id> reason
deny <approval-id> reason
\`\`\`

## Use Cursor

Open this folder in Cursor on the PC/server and paste:

\`\`\`text
MOBILE_SETUP_PROMPT.md
\`\`\`

Cursor should ask:

- Android or iPhone
- Telegram or WhatsApp Business planning
- OpenClaw, Hermes Agent, PicoClaw, Cursor-only, or other
- action type that needs approval
- test workspace or real trusted folder

## Important Files

- \`README_FIRST_MOBILE.md\` - this file.
- \`MOBILE_SETUP_PROMPT.md\` - paste into Cursor.
- \`MOBILE_APPROVAL_HANDOFF.md\` - mobile support matrix and safety limits.
- \`TEAM_MOBILE_TEST_CHECKLIST.md\` - record team test results.
- \`mobile-approval-links.html\` - phone-readable quick links and reply format.
- \`packages/${tarballName}\` - offline npm package for the PC/server.

## Safety

Keep approval messages short and redacted. Do not send secrets, full customer records, bank data, video/audio content, location data, private keys, API keys, or private file contents to phone messages.
`;
}

function renderChecklist(tarballName) {
  return `# Team Mobile Approval Test Checklist

Tester:
Date:
Phone: Android / iPhone
PC/server OS:
Node version:
Runtime protected: OpenClaw / Hermes Agent / PicoClaw / Cursor-only / other
Channel: Telegram / WhatsApp planning / runtime-native bridge

## PC/Server Commands

Online:

\`\`\`bash
npx --yes --package @denial-web/clawguard@${version} clawguard --version
npx --yes --package @denial-web/clawguard@${version} clawguard approvals demo-flow --keep
\`\`\`

Offline:

\`\`\`bash
npm install -g ./packages/${tarballName}
clawguard --version
clawguard approvals demo-flow --keep
\`\`\`

Telegram dry run:

\`\`\`bash
clawguard approvals doctor --chat-id <telegram-chat-id>
clawguard approvals watch ./.clawguard/approvals.jsonl --via telegram --chat-id <telegram-chat-id> --once --dry-run
\`\`\`

## Results

- Version command worked: yes / no
- Approval demo flow worked: yes / no
- Phone received approval message: yes / no / dry-run only
- Phone reply was processed: yes / no / not tested
- Approval apply worked: yes / no / not tested
- Biggest confusion:
- App-control target requested, if any:
- Was the app-control target blocked, reviewed, or approved:
- Notes:
`;
}

function renderMobileLinksHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ClawGuard Mobile Approval Quick Links</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 24px; line-height: 1.45; color: #172026; background: #f7faf8; }
    main { max-width: 760px; margin: 0 auto; }
    h1 { font-size: 28px; margin: 0 0 12px; }
    h2 { font-size: 18px; margin-top: 28px; }
    code, pre { background: #e9f0ec; border-radius: 6px; }
    code { padding: 2px 5px; }
    pre { padding: 12px; overflow-x: auto; }
    a { color: #0b6b4f; font-weight: 700; }
    .warn { border-left: 4px solid #c85818; padding: 10px 12px; background: #fff4ea; }
  </style>
</head>
<body>
  <main>
    <h1>ClawGuard Mobile Approval</h1>
    <p>Use your phone to approve or deny actions while ClawGuard runs on a PC/server.</p>

    <section class="warn">
      <strong>Safety:</strong> ClawGuard mobile support is for approvals. It does not control arbitrary Android or iOS apps directly.
    </section>

    <h2>Reply Format</h2>
    <pre>approve &lt;approval-id&gt; reason
deny &lt;approval-id&gt; reason</pre>

    <h2>Useful Links</h2>
    <ul>
      <li><a href="https://telegram.org/">Install Telegram</a></li>
      <li><a href="https://t.me/BotFather">Open Telegram BotFather</a></li>
      <li><a href="https://core.telegram.org/bots/api">Telegram Bot API</a></li>
      <li><a href="https://developers.facebook.com/docs/whatsapp/cloud-api">WhatsApp Cloud API</a></li>
    </ul>

    <h2>First PC/Server Commands</h2>
    <pre>clawguard approvals demo-flow --keep
clawguard approvals doctor --chat-id &lt;telegram-chat-id&gt;
clawguard approvals watch ./.clawguard/approvals.jsonl --via telegram --chat-id &lt;telegram-chat-id&gt; --once --dry-run</pre>
  </main>
</body>
</html>
`;
}
