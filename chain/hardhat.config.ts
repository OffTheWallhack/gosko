import { configVariable, defineConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

// Rovnaké nastavenie kompilátora pre testy aj produkčný deploy, aby testovaný
// bytecode bol presne ten, ktorý pôjde na Base. Base podporuje Cancun (TSTORE).
const solc = {
  version: "0.8.28",
  settings: {
    evmVersion: "cancun",
    optimizer: { enabled: true, runs: 200 },
  },
};

export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: {
    profiles: {
      default: solc,
      production: solc,
    },
  },
  networks: {
    // In-process EDR sieť (v Hardhat 3 sa volá "default", v Hardhat 2 "hardhat").
    // Používajú ju testy: `npx hardhat test nodejs`.
    default: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: 31337,
    },
    // Lokálny uzol spustený cez `npx hardhat node`.
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // Verejné siete sú len nakonfigurované. Deploy robí operátor (README).
    // chainId je pevný: ak RPC_URL ukazuje na inú sieť, Hardhat odmietne pokračovať.
    baseSepolia: {
      type: "http",
      chainType: "op",
      chainId: 84532,
      url: configVariable("RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    base: {
      type: "http",
      chainType: "op",
      chainId: 8453,
      url: configVariable("RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  },
  // Overenie zdrojového kódu na Basescan (Etherscan API v2, jeden kľúč pre všetky siete).
  // Premenná sa načíta až pri `hardhat ignition verify`, testy ju nepotrebujú.
  verify: {
    etherscan: { apiKey: configVariable("ETHERSCAN_API_KEY") },
  },
});
