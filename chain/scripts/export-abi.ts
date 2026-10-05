// Zapíše ABI skompilovaného GoskoPass do chain/abi/GoskoPass.json (commituje sa).
// Spustenie: `npm run abi` (= hardhat run scripts/export-abi.ts).
import { writeFile } from "node:fs/promises";

import hre from "hardhat";

const { abi } = await hre.artifacts.readArtifact("GoskoPass");
const target = new URL("../abi/GoskoPass.json", import.meta.url);
await writeFile(target, JSON.stringify(abi, null, 2) + "\n");
console.log(`ABI (${abi.length} položiek) zapísané do ${target.pathname}`);
