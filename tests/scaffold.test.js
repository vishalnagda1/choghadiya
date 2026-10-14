// tests/scaffold.test.js — DO-01 scaffold & vendored-dependency integrity.
//
// Owned by devops-engineer. Guards the DO-01 acceptance criteria that are
// testable (package metadata, CNAME, and the vendored suncalc build actually
// loading and computing). The product test suites (tests/fixtures.js,
// tests/sequences.test.js, tests/choghadiya.test.js) are BE-01's; this file
// touches none of them and may be folded into BE-04's suite later.
//
// No network access: every assertion runs against the local repo.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("package.json is an ESM package pinned at the 2.1.0 release baseline", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.type, "module");
  assert.equal(pkg.version, "2.1.0");
  assert.equal(typeof pkg.scripts.test, "string");
  assert.equal(typeof pkg.scripts.dev, "string");
});

test("CNAME pins the GitHub Pages custom domain", () => {
  const cname = readFileSync(join(root, "CNAME"), "utf8").trim();
  assert.equal(cname, "time.gitick.com");
});

test("vendored suncalc 2.1.1 exposes the ESM API (getTimes is a function)", async () => {
  const SunCalc = await import("../vendor/suncalc-2.1.1.js");
  assert.equal(typeof SunCalc.getTimes, "function");
  assert.equal(typeof SunCalc.getPosition, "function");
});

test("vendored suncalc computes real sunrise/sunset for Mumbai (offline)", async () => {
  const SunCalc = await import("../vendor/suncalc-2.1.1.js");
  const times = SunCalc.getTimes(new Date("2026-10-14T06:00:00Z"), 19.076, 72.8777);
  assert.ok(times.sunrise instanceof Date && !Number.isNaN(times.sunrise.getTime()));
  assert.ok(times.sunset instanceof Date && !Number.isNaN(times.sunset.getTime()));
  assert.ok(times.sunset > times.sunrise);
});
