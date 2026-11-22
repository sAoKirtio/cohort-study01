// Run only from the prototype checkout. Seed only a fresh local database.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

function npm(args) {
  const result = spawnSync(
    process.execPath,
    [process.env.npm_execpath, ...args],
    { stdio: "inherit" }
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync("data.db")) npm(["run", "db:seed"]);
npm([
  "run",
  "dev",
  "--",
  "--host",
  "127.0.0.1",
  "--port",
  "4184",
  "--strictPort",
]);
