import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Parametre nemajú predvolené hodnoty zámerne: deploy bez explicitného
// admina, mintera a baseURI zlyhá, namiesto toho, aby admin potichu ostal
// na deployerovom kľúči. Príklad parametrov je v chain/README.md.
export default buildModule("GoskoPassModule", (m) => {
  const admin = m.getParameter<string>("admin");
  const minter = m.getParameter<string>("minter");
  const baseURI = m.getParameter<string>("baseURI");

  const goskoPass = m.contract("GoskoPass", [admin, minter, baseURI]);

  return { goskoPass };
});
