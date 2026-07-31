import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, out);
    else if (entry.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

const tests = [];
try {
  walk("tests", tests);
} catch {
  // no tests directory
}

if (tests.length === 0) {
  console.log("No tests found");
  process.exit(0);
}

const result = spawnSync("node", ["--experimental-strip-types", "--test", ...tests], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
