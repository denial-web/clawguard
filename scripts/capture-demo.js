#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { createWebServer } from "../src/web-server.js";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(import.meta.dirname, "..");
const assetsDir = path.join(rootDir, "docs", "assets");
const videoName = "clawguard-demo.webm";
const mp4Name = "clawguard-demo.mp4";
const reportName = "clawguard-dependency-risk-report.html";
const webScreenshotName = "clawguard-web-demo.png";
const reportScreenshotName = "clawguard-html-report.png";

async function main() {
  await fs.mkdir(assetsDir, { recursive: true });

  const server = createWebServer({ rootDir });
  await listen(server);

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 4173;
  const baseUrl = `http://127.0.0.1:${port}`;
  const tempVideoDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-demo-video-"));
  let browser;
  let context;
  let page;

  try {
    browser = await chromium.launch({
      headless: true
    });
    context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      recordVideo: {
        dir: tempVideoDir,
        size: { width: 1280, height: 900 }
      }
    });
    page = await context.newPage();

    await page.addInitScript(() => {
      const cursor = document.createElement("div");
      cursor.setAttribute("data-clawguard-demo-cursor", "true");
      Object.assign(cursor.style, {
        position: "fixed",
        left: "0",
        top: "0",
        width: "18px",
        height: "18px",
        border: "2px solid #20242a",
        borderRadius: "999px",
        background: "rgba(255, 255, 255, 0.82)",
        boxShadow: "0 4px 18px rgba(32, 36, 42, 0.28)",
        pointerEvents: "none",
        transform: "translate(-50px, -50px)",
        transition: "transform 80ms linear, width 120ms ease, height 120ms ease",
        zIndex: "2147483647"
      });
      window.addEventListener("DOMContentLoaded", () => {
        document.body.append(cursor);
      });
      window.addEventListener("mousemove", (event) => {
        cursor.style.transform = `translate(${event.clientX - 9}px, ${event.clientY - 9}px)`;
      });
      window.addEventListener("mousedown", () => {
        cursor.style.width = "26px";
        cursor.style.height = "26px";
      });
      window.addEventListener("mouseup", () => {
        cursor.style.width = "18px";
        cursor.style.height = "18px";
      });
    });

    await page.goto(baseUrl, { waitUntil: "load" });
    await pause(500);

    const dependencyRisk = page.getByRole("button", {
      name: "Dependency Risk Install scripts, direct sources, and loose specs."
    });
    await moveToLocator(page, dependencyRisk);
    await pause(250);
    await dependencyRisk.click();
    await page.getByRole("heading", { name: "Dependency Risk" }).waitFor();
    await page.getByText("Block").waitFor();
    await pause(700);

    await page.screenshot({
      path: path.join(assetsDir, webScreenshotName),
      fullPage: true
    });

    const downloadButton = page.getByRole("button", { name: "Download HTML" });
    await moveToLocator(page, downloadButton);
    await pause(250);
    const downloadPromise = page.waitForEvent("download");
    await downloadButton.click();
    const download = await downloadPromise;
    const reportPath = path.join(assetsDir, reportName);
    await download.saveAs(reportPath);
    await pause(700);

    const reportHtml = await fs.readFile(reportPath, "utf8");
    await page.setContent(reportHtml, { waitUntil: "load" });
    await page.mouse.move(1120, 92, { steps: 24 });
    await pause(900);
    await page.screenshot({
      path: path.join(assetsDir, reportScreenshotName),
      fullPage: true
    });

    const video = page.video();
    await context.close();
    context = null;
    await browser.close();
    browser = null;

    const videoPath = await video.path();
    const finalVideoPath = path.join(assetsDir, videoName);
    await fs.copyFile(videoPath, finalVideoPath);
    const mp4Path = await maybeCreateMp4(finalVideoPath);

    console.log(`Captured web screenshot: docs/assets/${webScreenshotName}`);
    console.log(`Captured report screenshot: docs/assets/${reportScreenshotName}`);
    console.log(`Captured HTML report: docs/assets/${reportName}`);
    console.log(`Captured demo video: docs/assets/${videoName}`);
    if (mp4Path) {
      console.log(`Captured MP4 video: docs/assets/${path.basename(mp4Path)}`);
    } else {
      console.log("MP4 not created because ffmpeg is not installed.");
    }
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
    server.close();
  }
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function moveToLocator(page, locator) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Could not locate demo target for mouse movement.");
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 32 });
}

async function maybeCreateMp4(webmPath) {
  if (!(await hasFfmpeg())) {
    return "";
  }

  const mp4Path = path.join(assetsDir, mp4Name);
  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    webmPath,
    "-movflags",
    "faststart",
    "-pix_fmt",
    "yuv420p",
    mp4Path
  ]);
  return mp4Path;
}

async function hasFfmpeg() {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

function pause(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});
