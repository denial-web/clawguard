import assert from "node:assert/strict";
import test from "node:test";
import { isBlockedHost, resolveHostBlocked } from "../../src/install-url/host.js";

test("isBlockedHost blocks loopback, private, and link-local literals", () => {
  for (const host of ["localhost", "app.localhost", "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.0.1", "169.254.169.254", "0.0.0.0", "::1", "fc00::1", "fd12::1", "fe80::1"]) {
    assert.equal(isBlockedHost(host), true, `expected ${host} to be blocked`);
  }
});

test("isBlockedHost blocks numeric and hex IPv4 encodings", () => {
  // 2130706433 === 0x7f000001 === 127.0.0.1
  assert.equal(isBlockedHost("2130706433"), true);
  assert.equal(isBlockedHost("0x7f000001"), true);
  assert.equal(isBlockedHost("017700000001"), true);
});

test("isBlockedHost blocks IPv4-mapped IPv6 forms", () => {
  assert.equal(isBlockedHost("::ffff:127.0.0.1"), true);
  assert.equal(isBlockedHost("::ffff:7f00:1"), true);
  assert.equal(isBlockedHost("[::ffff:169.254.169.254]"), true);
});

test("isBlockedHost allows ordinary public hosts", () => {
  assert.equal(isBlockedHost("example.com"), false);
  assert.equal(isBlockedHost("8.8.8.8"), false);
  assert.equal(isBlockedHost("registry.npmjs.org"), false);
});

test("resolveHostBlocked blocks a public name that resolves to a private address", async () => {
  const lookup = async () => [{ address: "169.254.169.254", family: 4 }];
  assert.equal(await resolveHostBlocked("metadata.evil.example", { lookup }), true);
});

test("resolveHostBlocked blocks when any resolved address is private", async () => {
  const lookup = async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "127.0.0.1", family: 4 }
  ];
  assert.equal(await resolveHostBlocked("rebind.evil.example", { lookup }), true);
});

test("resolveHostBlocked allows a name that resolves only to public addresses", async () => {
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  assert.equal(await resolveHostBlocked("example.com", { lookup }), false);
});

test("resolveHostBlocked does not throw when resolution fails", async () => {
  const lookup = async () => {
    throw new Error("ENOTFOUND");
  };
  assert.equal(await resolveHostBlocked("nonexistent.invalid", { lookup }), false);
});
