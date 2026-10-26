// Zapíše ABI skompilovaných GoskoPass a GoskoLoot do chain/abi/*.json (commitujú sa).
// Spustenie: `npm run abi` (= hardhat run scripts/export-abi.ts).
import { writeFile } from "node:fs/promises";

import hre from "hardhat";

for (const name of ["GoskoPass", "GoskoLoot"]) {
  const { abi } = await hre.artifacts.readArtifact(name);
  const target = new URL(`../abi/${name}.json`, import.meta.url);
  await writeFile(target, JSON.stringify(abi, null, 2) + "\n");
  console.log(`ABI ${name} (${abi.length} položiek) zapísané do ${target.pathname}`);
}
