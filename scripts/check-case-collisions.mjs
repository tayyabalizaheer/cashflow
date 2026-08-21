import { execFileSync } from "node:child_process";

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

const byLowerPath = new Map();

for (const file of files) {
  const key = file.toLowerCase();
  const matches = byLowerPath.get(key) ?? [];
  matches.push(file);
  byLowerPath.set(key, matches);
}

const collisions = [...byLowerPath.values()].filter((matches) => matches.length > 1);

if (collisions.length > 0) {
  console.error("Case-only path conflicts found:");
  for (const matches of collisions) {
    console.error(`\n${matches.join("\n")}`);
  }
  process.exit(1);
}

console.log("No case-only path conflicts found.");
