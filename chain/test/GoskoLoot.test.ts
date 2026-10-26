import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import hre, { network } from "hardhat";
import { getAddress, keccak256, toHex, zeroAddress, zeroHash, type Abi } from "viem";

const { viem, networkHelpers } = await network.create();

const URI_TEMPLATE = "https://gosko-master.vercel.app/api/nft/loot/{id}";
const MINTER_ROLE = keccak256(toHex("MINTER_ROLE"));
const DEFAULT_ADMIN_ROLE = zeroHash;
const TYPE = { ghost: 1n, parkPass: 2n, trickCard: 3n, crew: 4n, partner: 5n } as const;

// claimRef = keccak256(utf8(loot_claims.id))
const claimRef = (id: string) => keccak256(toHex(id));
const CLAIM_1 = claimRef("c0a1-0000-4000-8000-000000000001");
const CLAIM_2 = claimRef("c0a1-0000-4000-8000-000000000002");

async function deployFixture() {
  const [admin, minter, holder, stranger] = await viem.getWalletClients();
  const loot = await viem.deployContract("GoskoLoot", [
    admin.account.address,
    minter.account.address,
    URI_TEMPLATE,
  ]);
  return { loot, admin, minter, holder, stranger };
}

async function mintedFixture() {
  const ctx = await deployFixture();
  await ctx.loot.write.mint([ctx.holder.account.address, TYPE.ghost, CLAIM_1], {
    account: ctx.minter.account,
  });
  return ctx;
}

const deployed = () => networkHelpers.loadFixture(deployFixture);
const minted = () => networkHelpers.loadFixture(mintedFixture);

describe("GoskoLoot", () => {
  describe("nasadenie", () => {
    it("nastaví meno, symbol, roly a uri šablónu s {id}", async () => {
      const { loot, admin, minter, holder } = await deployed();
      assert.equal(await loot.read.name(), "GOSko Loot");
      assert.equal(await loot.read.symbol(), "GLOOT");
      assert.equal(await loot.read.hasRole([DEFAULT_ADMIN_ROLE, admin.account.address]), true);
      assert.equal(await loot.read.hasRole([MINTER_ROLE, minter.account.address]), true);
      assert.equal(await loot.read.hasRole([MINTER_ROLE, admin.account.address]), false);
      assert.equal(await loot.read.hasRole([MINTER_ROLE, holder.account.address]), false);
      const uri = await loot.read.uri([1n]);
      assert.equal(uri, URI_TEMPLATE);
      assert.ok(uri.includes("{id}"));
    });

    it("typy 1 až 5 sú povolené, 6 nie", async () => {
      const { loot } = await deployed();
      for (const id of [1n, 2n, 3n, 4n, 5n]) {
        assert.equal(await loot.read.typeEnabled([id]), true, `typ ${id}`);
      }
      assert.equal(await loot.read.typeEnabled([6n]), false);
      assert.equal(await loot.read.typeEnabled([0n]), false);
    });
  });

  describe("mint", () => {
    it("vydá 1 kus, uloží claim a emituje LootMinted", async () => {
      const { loot, minter, holder } = await deployed();
      await viem.assertions.emitWithArgs(
        loot.write.mint([holder.account.address, TYPE.parkPass, CLAIM_1], { account: minter.account }),
        loot,
        "LootMinted",
        [getAddress(holder.account.address), TYPE.parkPass, CLAIM_1],
      );
      assert.equal(await loot.read.balanceOf([holder.account.address, TYPE.parkPass]), 1n);
      assert.equal(await loot.read.typeOfClaim([CLAIM_1]), TYPE.parkPass);
      assert.equal(await loot.read.holderOfClaim([CLAIM_1]), getAddress(holder.account.address));
    });

    it("druhý mint s rovnakým claimRef revertuje AlreadyMinted", async () => {
      const { loot, minter, holder } = await minted();
      await viem.assertions.revertWithCustomError(
        loot.write.mint([holder.account.address, TYPE.ghost, CLAIM_1], { account: minter.account }),
        loot,
        "AlreadyMinted",
      );
      assert.equal(await loot.read.balanceOf([holder.account.address, TYPE.ghost]), 1n);
    });

    it("rôzne claimRef na ten istý typ sa sčítajú", async () => {
      const { loot, minter, holder } = await minted();
      await loot.write.mint([holder.account.address, TYPE.ghost, CLAIM_2], { account: minter.account });
      assert.equal(await loot.read.balanceOf([holder.account.address, TYPE.ghost]), 2n);
    });

    it("bez MINTER_ROLE revertuje AccessControlUnauthorizedAccount", async () => {
      const { loot, stranger, holder } = await deployed();
      await viem.assertions.revertWithCustomErrorWithArgs(
        loot.write.mint([holder.account.address, TYPE.ghost, CLAIM_1], { account: stranger.account }),
        loot,
        "AccessControlUnauthorizedAccount",
        [getAddress(stranger.account.address), MINTER_ROLE],
      );
    });

    it("na nulovú adresu revertuje", async () => {
      const { loot, minter } = await deployed();
      await viem.assertions.revertWithCustomError(
        loot.write.mint([zeroAddress, TYPE.ghost, CLAIM_1], { account: minter.account }),
        loot,
        "ZeroAddress",
      );
    });

    it("nepovolený typ revertuje TypeDisabled, admin ho vie povoliť a zakázať", async () => {
      const { loot, admin, minter, holder, stranger } = await deployed();
      await viem.assertions.revertWithCustomError(
        loot.write.mint([holder.account.address, 6n, CLAIM_1], { account: minter.account }),
        loot,
        "TypeDisabled",
      );
      // Povoliť typ môže iba admin.
      await viem.assertions.revertWithCustomErrorWithArgs(
        loot.write.setTypeEnabled([6n, true], { account: stranger.account }),
        loot,
        "AccessControlUnauthorizedAccount",
        [getAddress(stranger.account.address), DEFAULT_ADMIN_ROLE],
      );
      await viem.assertions.emitWithArgs(
        loot.write.setTypeEnabled([6n, true], { account: admin.account }),
        loot,
        "TypeEnabledSet",
        [6n, true],
      );
      await loot.write.mint([holder.account.address, 6n, CLAIM_1], { account: minter.account });
      assert.equal(await loot.read.balanceOf([holder.account.address, 6n]), 1n);

      await loot.write.setTypeEnabled([6n, false], { account: admin.account });
      await viem.assertions.revertWithCustomError(
        loot.write.mint([holder.account.address, 6n, CLAIM_2], { account: minter.account }),
        loot,
        "TypeDisabled",
      );
    });

    it("pauza zastaví mint, unpause ho obnoví", async () => {
      const { loot, admin, minter, holder } = await deployed();
      await loot.write.pause({ account: admin.account });
      await viem.assertions.revertWithCustomError(
        loot.write.mint([holder.account.address, TYPE.ghost, CLAIM_1], { account: minter.account }),
        loot,
        "EnforcedPause",
      );
      await loot.write.unpause({ account: admin.account });
      await loot.write.mint([holder.account.address, TYPE.ghost, CLAIM_1], { account: minter.account });
      assert.equal(await loot.read.balanceOf([holder.account.address, TYPE.ghost]), 1n);
    });

    it("pause a unpause smie iba admin", async () => {
      const { loot, minter } = await deployed();
      await viem.assertions.revertWithCustomErrorWithArgs(
        loot.write.pause({ account: minter.account }),
        loot,
        "AccessControlUnauthorizedAccount",
        [getAddress(minter.account.address), DEFAULT_ADMIN_ROLE],
      );
    });
  });

  describe("soulbound", () => {
    it("safeTransferFrom držiteľom revertuje Soulbound", async () => {
      const { loot, holder, stranger } = await minted();
      await viem.assertions.revertWithCustomError(
        loot.write.safeTransferFrom(
          [holder.account.address, stranger.account.address, TYPE.ghost, 1n, "0x"],
          { account: holder.account },
        ),
        loot,
        "Soulbound",
      );
    });

    it("safeBatchTransferFrom držiteľom revertuje Soulbound", async () => {
      const { loot, holder, stranger } = await minted();
      await viem.assertions.revertWithCustomError(
        loot.write.safeBatchTransferFrom(
          [holder.account.address, stranger.account.address, [TYPE.ghost], [1n], "0x"],
          { account: holder.account },
        ),
        loot,
        "Soulbound",
      );
    });

    it("setApprovalForAll revertuje Soulbound", async () => {
      const { loot, holder, stranger } = await minted();
      await viem.assertions.revertWithCustomError(
        loot.write.setApprovalForAll([stranger.account.address, true], { account: holder.account }),
        loot,
        "Soulbound",
      );
    });

    it("locked() je true a supportsInterface hlási ERC1155, AccessControl, ERC5192", async () => {
      const { loot } = await deployed();
      assert.equal(await loot.read.locked([TYPE.ghost]), true);
      assert.equal(await loot.read.supportsInterface(["0xb45a3c0e"]), true); // ERC-5192
      assert.equal(await loot.read.supportsInterface(["0xd9b67a26"]), true); // ERC-1155
      assert.equal(await loot.read.supportsInterface(["0x0e89341c"]), true); // ERC-1155 metadata URI
      assert.equal(await loot.read.supportsInterface(["0x7965db0b"]), true); // AccessControl
      assert.equal(await loot.read.supportsInterface(["0x01ffc9a7"]), true); // ERC-165
      assert.equal(await loot.read.supportsInterface(["0xffffffff"]), false);
    });
  });

  describe("revoke a burn", () => {
    it("revoke spáli kus a uvoľní claimRef, ktorý sa dá znova mintnúť", async () => {
      const { loot, minter, holder, stranger } = await minted();
      await viem.assertions.revertWithCustomErrorWithArgs(
        loot.write.revoke([CLAIM_1], { account: stranger.account }),
        loot,
        "AccessControlUnauthorizedAccount",
        [getAddress(stranger.account.address), MINTER_ROLE],
      );
      await viem.assertions.emitWithArgs(
        loot.write.revoke([CLAIM_1], { account: minter.account }),
        loot,
        "LootRevoked",
        [getAddress(holder.account.address), TYPE.ghost, CLAIM_1],
      );
      assert.equal(await loot.read.balanceOf([holder.account.address, TYPE.ghost]), 0n);
      assert.equal(await loot.read.typeOfClaim([CLAIM_1]), 0n);
      assert.equal(await loot.read.holderOfClaim([CLAIM_1]), zeroAddress);

      await loot.write.mint([holder.account.address, TYPE.trickCard, CLAIM_1], { account: minter.account });
      assert.equal(await loot.read.balanceOf([holder.account.address, TYPE.trickCard]), 1n);
    });

    it("revoke neznámeho claimu revertuje UnknownClaim", async () => {
      const { loot, minter } = await deployed();
      await viem.assertions.revertWithCustomError(
        loot.write.revoke([CLAIM_1], { account: minter.account }),
        loot,
        "UnknownClaim",
      );
    });

    it("revoke funguje aj počas pauzy", async () => {
      const { loot, admin, minter, holder } = await minted();
      await loot.write.pause({ account: admin.account });
      await loot.write.revoke([CLAIM_1], { account: minter.account });
      assert.equal(await loot.read.balanceOf([holder.account.address, TYPE.ghost]), 0n);
    });

    it("držiteľ si môže sám spáliť svoj kus, aj počas pauzy", async () => {
      const { loot, admin, holder } = await minted();
      await loot.write.pause({ account: admin.account });
      await loot.write.burn([TYPE.ghost], { account: holder.account });
      assert.equal(await loot.read.balanceOf([holder.account.address, TYPE.ghost]), 0n);
    });

    it("burn bez kusa revertuje a cudzí kus spáliť nejde", async () => {
      const { loot, stranger } = await minted();
      await viem.assertions.revertWithCustomError(
        loot.write.burn([TYPE.ghost], { account: stranger.account }),
        loot,
        "ERC1155InsufficientBalance",
      );
    });

    it("revoke po burne držiteľom neprepadne a uvoľní claimRef", async () => {
      const { loot, minter, holder } = await minted();
      await loot.write.burn([TYPE.ghost], { account: holder.account });
      await loot.write.revoke([CLAIM_1], { account: minter.account });
      assert.equal(await loot.read.holderOfClaim([CLAIM_1]), zeroAddress);
    });
  });

  describe("setURI", () => {
    it("mení iba admin, emituje BatchMetadataUpdate a uri sa zmení", async () => {
      const { loot, admin, minter } = await deployed();
      const next = "https://example.org/loot/{id}.json";
      await viem.assertions.revertWithCustomErrorWithArgs(
        loot.write.setURI([next], { account: minter.account }),
        loot,
        "AccessControlUnauthorizedAccount",
        [getAddress(minter.account.address), DEFAULT_ADMIN_ROLE],
      );
      await viem.assertions.emitWithArgs(
        loot.write.setURI([next], { account: admin.account }),
        loot,
        "BatchMetadataUpdate",
        [0n, 2n ** 256n - 1n],
      );
      assert.equal(await loot.read.uri([1n]), next);
    });
  });

  describe("ABI", () => {
    it("commitnuté chain/abi/GoskoLoot.json sa zhoduje s kompiláciou", async () => {
      const { abi } = await hre.artifacts.readArtifact("GoskoLoot");
      const committed: Abi = JSON.parse(
        await readFile(new URL("../abi/GoskoLoot.json", import.meta.url), "utf8"),
      );
      assert.deepEqual(committed, abi, "spusti `npm run abi` v chain/");
    });
  });
});
