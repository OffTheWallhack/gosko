// Lokálny deploy GoskoPass na `npx hardhat node` (http://127.0.0.1:8545, chainId 31337).
// Spustenie: `npm run deploy:local` (= hardhat run scripts/deploy-local.ts --network localhost).
//
// Sieť je natvrdo "localhost", takže ani omylom zadané `--network base` nič nenasadí
// na verejnú sieť. Každý beh nasadí kontrakt nanovo: `hardhat node` drží stav iba
// v pamäti, takže starý Ignition journal by po reštarte uzla ukazoval na adresu bez kódu.
//
// Účty sú predvolené testovacie účty hardhat uzla:
//   #0 = admin (DEFAULT_ADMIN_ROLE), #1 = minter (MINTER_ROLE).
import { mkdir, rm, writeFile } from "node:fs/promises";

import { network } from "hardhat";
import { getAddress } from "viem";

import GoskoPassModule from "../ignition/modules/GoskoPass.js";

const LOCAL_CHAIN_ID = 31337;

const { viem, ignition } = await network.create("localhost");
const publicClient = await viem.getPublicClient();

const chainId = await publicClient.getChainId();
if (chainId !== LOCAL_CHAIN_ID) {
  throw new Error(`deploy-local: očakávaný chainId ${LOCAL_CHAIN_ID}, uzol hlási ${chainId}`);
}

const [adminClient, minterClient] = await viem.getWalletClients();
const admin = getAddress(adminClient.account.address);
const minter = getAddress(minterClient.account.address);
const publicBaseUrl = (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const baseURI = `${publicBaseUrl}/api/nft/metadata/`;

await rm(new URL(`../ignition/deployments/chain-${LOCAL_CHAIN_ID}`, import.meta.url), {
  recursive: true,
  force: true,
});

const { goskoPass } = await ignition.deploy(GoskoPassModule, {
  parameters: { GoskoPassModule: { admin, minter, baseURI } },
  displayUi: false,
});

const deployment = { address: goskoPass.address, chainId, admin, minter, baseURI };
const outDir = new URL("../deployments/", import.meta.url);
await mkdir(outDir, { recursive: true });
await writeFile(new URL("local.json", outDir), JSON.stringify(deployment, null, 2) + "\n");

console.log("GoskoPass nasadený lokálne:");
console.log(JSON.stringify(deployment, null, 2));
console.log(`Zapísané do ${new URL("local.json", outDir).pathname}`);
