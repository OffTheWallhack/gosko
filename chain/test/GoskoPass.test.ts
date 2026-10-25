import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import hre, { network } from "hardhat";
import {
  getAddress,
  keccak256,
  maxUint256,
  parseAbi,
  toEventSelector,
  toFunctionSelector,
  toHex,
  zeroHash,
  type Abi,
  type AbiEvent,
  type AbiFunction,
} from "viem";

import GoskoPassModule from "../ignition/modules/GoskoPass.js";

const { viem, networkHelpers, ignition } = await network.create();
const publicClient = await viem.getPublicClient();

const BASE_URI = "https://gosko.sk/api/nft/metadata/";
const CATEGORY = { open: 1, u16: 2, women: 3 } as const;
const MINTER_ROLE = keccak256(toHex("MINTER_ROLE"));
const DEFAULT_ADMIN_ROLE = zeroHash;

// Kódovanie podľa docs/KONTRAKT-REGISTRACIA.md §4.
const registrationKey = (registrationId: string) => keccak256(toHex(registrationId));
const eventKey = (eventId: string) => keccak256(toHex(eventId));
const RIDER_REF = "0x8f2c41a3be6f3d0f1c55a0b7e3d2c9a14e0d6b7f9a1c2e3d4b5a69788796a5b4";
const REG_1 = registrationKey("6b1d2f0e-0000-4000-8000-000000000001");
const REG_2 = registrationKey("6b1d2f0e-0000-4000-8000-000000000002");
const EVENT_BA = eventKey("bratislava-2026-11");

async function deployFixture() {
  const [admin, minter, custody, rider, stranger] = await viem.getWalletClients();
  const pass = await viem.deployContract("GoskoPass", [
    admin.account.address,
    minter.account.address,
    BASE_URI,
  ]);
  return { pass, admin, minter, custody, rider, stranger };
}

async function mintedFixture() {
  const ctx = await deployFixture();
  await ctx.pass.write.mint(
    [ctx.custody.account.address, REG_1, EVENT_BA, RIDER_REF, CATEGORY.open],
    { account: ctx.minter.account },
  );
  return { ...ctx, tokenId: 1n };
}

const deployed = () => networkHelpers.loadFixture(deployFixture);
const minted = () => networkHelpers.loadFixture(mintedFixture);

describe("GoskoPass", () => {
  describe("nasadenie", () => {
    it("nastaví meno, symbol a roly z konštruktora", async () => {
      const { pass, admin, minter } = await deployed();
      assert.equal(await pass.read.name(), "GOSko Pass");
      assert.equal(await pass.read.symbol(), "GOSKO");
      assert.equal(await pass.read.MINTER_ROLE(), MINTER_ROLE);
      assert.equal(await pass.read.hasRole([DEFAULT_ADMIN_ROLE, admin.account.address]), true);
      assert.equal(await pass.read.hasRole([MINTER_ROLE, minter.account.address]), true);
      // Oddelenie rolí: admin nemintuje, minter nespravuje roly.
      assert.equal(await pass.read.hasRole([MINTER_ROLE, admin.account.address]), false);
      assert.equal(await pass.read.hasRole([DEFAULT_ADMIN_ROLE, minter.account.address]), false);
    });

    it("Ignition modul nasadí kontrakt s parametrami admin, minter, baseURI", async () => {
      const [admin, minter] = await viem.getWalletClients();
      const { goskoPass } = await ignition.deploy(GoskoPassModule, {
        parameters: {
          GoskoPassModule: {
            admin: admin.account.address,
            minter: minter.account.address,
            baseURI: BASE_URI,
          },
        },
      });
      assert.equal(await goskoPass.read.hasRole([DEFAULT_ADMIN_ROLE, admin.account.address]), true);
      assert.equal(await goskoPass.read.hasRole([MINTER_ROLE, minter.account.address]), true);
    });
  });

  describe("mint", () => {
    it("vydá token od id 1 na custody a namapuje registrationKey", async () => {
      const { pass, minter, custody } = await deployed();
      const args = [custody.account.address, REG_1, EVENT_BA, RIDER_REF, CATEGORY.u16] as const;

      const { result } = await pass.simulate.mint(args, { account: minter.account.address });
      assert.equal(result, 1n);

      assert.equal(await pass.read.tokenOfRegistration([REG_1]), 0n);
      await pass.write.mint(args, { account: minter.account });

      assert.equal(await pass.read.tokenOfRegistration([REG_1]), 1n);
      assert.equal(await pass.read.ownerOf([1n]), getAddress(custody.account.address));
      assert.equal(await pass.read.balanceOf([custody.account.address]), 1n);
      assert.deepEqual(await pass.read.passOf([1n]), {
        eventId: EVENT_BA,
        riderRef: RIDER_REF,
        category: CATEGORY.u16,
        placement: 0,
        points: 0,
        claimed: false,
      });
    });

    it("ďalší mint dostane ďalšie id", async () => {
      const { pass, minter, custody } = await minted();
      await pass.write.mint([custody.account.address, REG_2, EVENT_BA, RIDER_REF, CATEGORY.women], {
        account: minter.account,
      });
      assert.equal(await pass.read.tokenOfRegistration([REG_2]), 2n);
      assert.equal(await pass.read.balanceOf([custody.account.address]), 2n);
    });

    it("emituje Minted a Locked (ERC-5192)", async () => {
      const { pass, minter, custody } = await deployed();
      const hash = await pass.write.mint(
        [custody.account.address, REG_1, EVENT_BA, RIDER_REF, CATEGORY.open],
        { account: minter.account },
      );
      await viem.assertions.emitWithArgs(hash, pass, "Minted", [1n, REG_1, EVENT_BA]);
      await viem.assertions.emitWithArgs(hash, pass, "Locked", [1n]);
    });

    it("rovnaký registrationKey druhýkrát revertuje AlreadyMinted", async () => {
      const { pass, minter, custody } = await minted();
      await viem.assertions.revertWithCustomError(
        pass.write.mint([custody.account.address, REG_1, EVENT_BA, RIDER_REF, CATEGORY.open], {
          account: minter.account,
        }),
        pass,
        "AlreadyMinted",
      );
    });

    it("kategória mimo 1..3 revertuje InvalidCategory", async () => {
      const { pass, minter, custody } = await deployed();
      for (const category of [0, 4, 255]) {
        await viem.assertions.revertWithCustomError(
          pass.write.mint([custody.account.address, REG_1, EVENT_BA, RIDER_REF, category], {
            account: minter.account,
          }),
          pass,
          "InvalidCategory",
        );
      }
      for (const [i, category] of [CATEGORY.open, CATEGORY.u16, CATEGORY.women].entries()) {
        await pass.write.mint(
          [custody.account.address, registrationKey(`ok-${i}`), EVENT_BA, RIDER_REF, category],
          { account: minter.account },
        );
      }
      assert.equal(await pass.read.balanceOf([custody.account.address]), 3n);
    });

    it("tokenOfRegistration vráti 0 pre neznámu registráciu", async () => {
      const { pass } = await minted();
      assert.equal(await pass.read.tokenOfRegistration([REG_2]), 0n);
    });
  });

  describe("roly", () => {
    it("mint, setResult, revoke a claim smie len MINTER_ROLE", async () => {
      const { pass, admin, custody, rider, stranger, tokenId } = await minted();
      // Admin bez MINTER_ROLE je tiež odmietnutý: roly sú oddelené.
      for (const caller of [stranger, admin]) {
        const who = getAddress(caller.account.address);
        const opts = { account: caller.account };
        const calls = [
          pass.write.mint([custody.account.address, REG_2, EVENT_BA, RIDER_REF, CATEGORY.open], opts),
          pass.write.setResult([tokenId, 1, 100], opts),
          pass.write.revoke([tokenId], opts),
          pass.write.claim([tokenId, rider.account.address], opts),
        ];
        for (const call of calls) {
          await viem.assertions.revertWithCustomErrorWithArgs(
            call,
            pass,
            "AccessControlUnauthorizedAccount",
            [who, MINTER_ROLE],
          );
        }
      }
    });

    it("setBaseURI, pause a unpause smie len admin", async () => {
      const { pass, minter, stranger } = await deployed();
      for (const caller of [stranger, minter]) {
        const who = getAddress(caller.account.address);
        const opts = { account: caller.account };
        for (const call of [
          pass.write.setBaseURI(["https://zle.example/"], opts),
          pass.write.pause(opts),
          pass.write.unpause(opts),
        ]) {
          await viem.assertions.revertWithCustomErrorWithArgs(
            call,
            pass,
            "AccessControlUnauthorizedAccount",
            [who, DEFAULT_ADMIN_ROLE],
          );
        }
      }
    });

    it("admin vie odobrať MINTER_ROLE (napr. pri úniku serverového kľúča)", async () => {
      const { pass, minter, custody } = await deployed();
      await pass.write.revokeRole([MINTER_ROLE, minter.account.address]);
      await viem.assertions.revertWithCustomError(
        pass.write.mint([custody.account.address, REG_1, EVENT_BA, RIDER_REF, CATEGORY.open], {
          account: minter.account,
        }),
        pass,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("soulbound", () => {
    it("locked() je true a neexistujúci token revertuje UnknownToken", async () => {
      const { pass, tokenId } = await minted();
      assert.equal(await pass.read.locked([tokenId]), true);
      await viem.assertions.revertWithCustomError(pass.read.locked([99n]), pass, "UnknownToken");
    });

    it("transferFrom vlastníkom revertuje Soulbound", async () => {
      const { pass, custody, stranger, tokenId } = await minted();
      await viem.assertions.revertWithCustomError(
        pass.write.transferFrom([custody.account.address, stranger.account.address, tokenId], {
          account: custody.account,
        }),
        pass,
        "Soulbound",
      );
    });

    it("safeTransferFrom (oba overloady) vlastníkom revertuje Soulbound", async () => {
      const { pass, custody, stranger, tokenId } = await minted();
      const from = custody.account.address;
      const to = stranger.account.address;
      await viem.assertions.revertWithCustomError(
        pass.write.safeTransferFrom([from, to, tokenId], { account: custody.account }),
        pass,
        "Soulbound",
      );
      await viem.assertions.revertWithCustomError(
        pass.write.safeTransferFrom([from, to, tokenId, "0x"], { account: custody.account }),
        pass,
        "Soulbound",
      );
    });

    it("prevod cez approve aj setApprovalForAll revertuje Soulbound", async () => {
      const { pass, custody, stranger, rider, tokenId } = await minted();
      await pass.write.approve([stranger.account.address, tokenId], { account: custody.account });
      await viem.assertions.revertWithCustomError(
        pass.write.transferFrom([custody.account.address, rider.account.address, tokenId], {
          account: stranger.account,
        }),
        pass,
        "Soulbound",
      );

      await pass.write.setApprovalForAll([rider.account.address, true], { account: custody.account });
      await viem.assertions.revertWithCustomError(
        pass.write.safeTransferFrom([custody.account.address, rider.account.address, tokenId], {
          account: rider.account,
        }),
        pass,
        "Soulbound",
      );
      assert.equal(await pass.read.ownerOf([tokenId]), getAddress(custody.account.address));
    });
  });

  describe("setResult", () => {
    it("uloží umiestnenie a body a emituje ResultSet + MetadataUpdate", async () => {
      const { pass, minter, tokenId } = await minted();
      await viem.assertions.emitWithArgs(
        pass.write.setResult([tokenId, 3, 60], { account: minter.account }),
        pass,
        "ResultSet",
        [tokenId, 3, 60],
      );
      const pass1 = await pass.read.passOf([tokenId]);
      assert.equal(pass1.placement, 3);
      assert.equal(pass1.points, 60);
      // Ostatné polia sa nezmenia.
      assert.equal(pass1.eventId, EVENT_BA);
      assert.equal(pass1.riderRef, RIDER_REF);
      assert.equal(pass1.category, CATEGORY.open);

      // Oprava výsledku je povolená (DB je systém záznamu) a znova emituje MetadataUpdate.
      await viem.assertions.emitWithArgs(
        pass.write.setResult([tokenId, 1, 100], { account: minter.account }),
        pass,
        "MetadataUpdate",
        [tokenId],
      );
      const pass2 = await pass.read.passOf([tokenId]);
      assert.equal(pass2.placement, 1);
      assert.equal(pass2.points, 100);
    });

    it("neexistujúci token revertuje UnknownToken", async () => {
      const { pass, minter } = await minted();
      await viem.assertions.revertWithCustomError(
        pass.write.setResult([42n, 1, 100], { account: minter.account }),
        pass,
        "UnknownToken",
      );
    });
  });

  describe("claim", () => {
    it("presunie token z custody na jazdca práve raz", async () => {
      const { pass, minter, custody, rider, tokenId } = await minted();
      await viem.assertions.emitWithArgs(
        pass.write.claim([tokenId, rider.account.address], { account: minter.account }),
        pass,
        "Claimed",
        [tokenId, getAddress(rider.account.address)],
      );
      assert.equal(await pass.read.ownerOf([tokenId]), getAddress(rider.account.address));
      assert.equal(await pass.read.balanceOf([custody.account.address]), 0n);
      assert.equal((await pass.read.passOf([tokenId])).claimed, true);
      assert.equal(await pass.read.locked([tokenId]), true);

      await viem.assertions.revertWithCustomError(
        pass.write.claim([tokenId, custody.account.address], { account: minter.account }),
        pass,
        "AlreadyClaimed",
      );
    });

    it("po claime je token znova zamknutý: prevod jazdcom revertuje Soulbound", async () => {
      const { pass, minter, rider, stranger, tokenId } = await minted();
      await pass.write.claim([tokenId, rider.account.address], { account: minter.account });
      await viem.assertions.revertWithCustomError(
        pass.write.transferFrom([rider.account.address, stranger.account.address, tokenId], {
          account: rider.account,
        }),
        pass,
        "Soulbound",
      );
      await viem.assertions.revertWithCustomError(
        pass.write.safeTransferFrom([rider.account.address, stranger.account.address, tokenId], {
          account: rider.account,
        }),
        pass,
        "Soulbound",
      );
    });

    it("emituje štandardný Transfer z custody na jazdca", async () => {
      const { pass, minter, custody, rider, tokenId } = await minted();
      await viem.assertions.emitWithArgs(
        pass.write.claim([tokenId, rider.account.address], { account: minter.account }),
        pass,
        "Transfer",
        [getAddress(custody.account.address), getAddress(rider.account.address), tokenId],
      );
    });

    it("neexistujúci token revertuje UnknownToken", async () => {
      const { pass, minter, rider } = await minted();
      await viem.assertions.revertWithCustomError(
        pass.write.claim([7n, rider.account.address], { account: minter.account }),
        pass,
        "UnknownToken",
      );
    });
  });

  describe("revoke", () => {
    it("spáli token a vymaže mapovanie registrácie aj záznam", async () => {
      const { pass, minter, custody, tokenId } = await minted();
      await pass.write.setResult([tokenId, 2, 80], { account: minter.account });
      await viem.assertions.emitWithArgs(
        pass.write.revoke([tokenId], { account: minter.account }),
        pass,
        "Transfer",
        [getAddress(custody.account.address), "0x0000000000000000000000000000000000000000", tokenId],
      );

      assert.equal(await pass.read.tokenOfRegistration([REG_1]), 0n);
      assert.equal(await pass.read.balanceOf([custody.account.address]), 0n);
      await viem.assertions.revertWithCustomError(pass.read.passOf([tokenId]), pass, "UnknownToken");
      await viem.assertions.revertWithCustomError(pass.read.locked([tokenId]), pass, "UnknownToken");
      await viem.assertions.revertWithCustomErrorWithArgs(
        pass.read.ownerOf([tokenId]),
        pass,
        "ERC721NonexistentToken",
        [tokenId],
      );
    });

    it("po revoke sa dá registrácia zmintovať znova, s novým id (id sa nerecyklujú)", async () => {
      const { pass, minter, custody, tokenId } = await minted();
      await pass.write.revoke([tokenId], { account: minter.account });
      await pass.write.mint([custody.account.address, REG_1, EVENT_BA, RIDER_REF, CATEGORY.open], {
        account: minter.account,
      });
      assert.equal(await pass.read.tokenOfRegistration([REG_1]), 2n);
    });

    it("funguje aj na prevzatom tokene", async () => {
      const { pass, minter, rider, tokenId } = await minted();
      await pass.write.claim([tokenId, rider.account.address], { account: minter.account });
      await pass.write.revoke([tokenId], { account: minter.account });
      assert.equal(await pass.read.balanceOf([rider.account.address]), 0n);
      assert.equal(await pass.read.tokenOfRegistration([REG_1]), 0n);
    });

    it("neexistujúci token revertuje UnknownToken", async () => {
      const { pass, minter } = await minted();
      await viem.assertions.revertWithCustomError(
        pass.write.revoke([5n], { account: minter.account }),
        pass,
        "UnknownToken",
      );
    });
  });

  describe("pauza", () => {
    it("zastaví mint, setResult aj claim; revoke ide ďalej", async () => {
      const { pass, minter, custody, rider, tokenId } = await minted();
      await pass.write.pause();
      const opts = { account: minter.account };
      for (const call of [
        pass.write.mint([custody.account.address, REG_2, EVENT_BA, RIDER_REF, CATEGORY.open], opts),
        pass.write.setResult([tokenId, 1, 100], opts),
        pass.write.claim([tokenId, rider.account.address], opts),
      ]) {
        await viem.assertions.revertWithCustomError(call, pass, "EnforcedPause");
      }
      await pass.write.revoke([tokenId], opts);
      assert.equal(await pass.read.tokenOfRegistration([REG_1]), 0n);
    });

    it("unpause obnoví mintovanie", async () => {
      const { pass, minter, custody } = await deployed();
      await pass.write.pause();
      await pass.write.unpause();
      await pass.write.mint([custody.account.address, REG_1, EVENT_BA, RIDER_REF, CATEGORY.open], {
        account: minter.account,
      });
      assert.equal(await pass.read.tokenOfRegistration([REG_1]), 1n);
    });
  });

  describe("metadáta", () => {
    it("tokenURI = baseURI + tokenId", async () => {
      const { pass, tokenId } = await minted();
      assert.equal(await pass.read.tokenURI([tokenId]), `${BASE_URI}1`);
      await viem.assertions.revertWithCustomErrorWithArgs(
        pass.read.tokenURI([9n]),
        pass,
        "ERC721NonexistentToken",
        [9n],
      );
    });

    it("setBaseURI zmení tokenURI a emituje BatchMetadataUpdate(1, max)", async () => {
      const { pass, tokenId } = await minted();
      const next = "https://preview.gosko.sk/api/nft/metadata/";
      await viem.assertions.emitWithArgs(
        pass.write.setBaseURI([next]),
        pass,
        "BatchMetadataUpdate",
        [1n, maxUint256],
      );
      assert.equal(await pass.read.tokenURI([tokenId]), `${next}1`);
    });
  });

  describe("supportsInterface", () => {
    it("hlási ERC-165, ERC-721, ERC-721 Metadata, ERC-5192, ERC-4906 a AccessControl", async () => {
      const { pass } = await deployed();
      // ERC-5192 interfaceId je selektor jedinej funkcie locked(uint256).
      assert.equal(toFunctionSelector("function locked(uint256)"), "0xb45a3c0e");
      const supported = {
        erc165: "0x01ffc9a7",
        erc721: "0x80ac58cd",
        erc721Metadata: "0x5b5e139f",
        erc5192: "0xb45a3c0e",
        erc4906: "0x49064906",
        accessControl: "0x7965db0b",
      } as const;
      for (const [name, id] of Object.entries(supported)) {
        assert.equal(await pass.read.supportsInterface([id]), true, name);
      }
      assert.equal(await pass.read.supportsInterface(["0xffffffff"]), false);
      assert.equal(await pass.read.supportsInterface(["0x780e9d63"]), false, "enumerable nie je");
    });
  });

  describe("ABI", () => {
    // Doslovne z docs/KONTRAKT-REGISTRACIA.md §4. API (viem parseAbi) sa spolieha presne na toto.
    const CONTRACT_ABI = parseAbi([
      "function mint(address to, bytes32 registrationKey, bytes32 eventId, bytes32 riderRef, uint8 category) returns (uint256)",
      "function setResult(uint256 tokenId, uint16 placement, uint16 points)",
      "function revoke(uint256 tokenId)",
      "function claim(uint256 tokenId, address to)",
      "function tokenOfRegistration(bytes32 registrationKey) view returns (uint256)",
      "function passOf(uint256 tokenId) view returns ((bytes32 eventId, bytes32 riderRef, uint8 category, uint16 placement, uint16 points, bool claimed))",
      "function locked(uint256 tokenId) view returns (bool)",
      "function setBaseURI(string uri)",
      "function tokenURI(uint256 tokenId) view returns (string)",
      "event Minted(uint256 indexed tokenId, bytes32 indexed registrationKey, bytes32 indexed eventId)",
      "event ResultSet(uint256 indexed tokenId, uint16 placement, uint16 points)",
      "event Claimed(uint256 indexed tokenId, address to)",
      "event Locked(uint256 tokenId)",
      "event MetadataUpdate(uint256 _tokenId)",
      "event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId)",
      "error AlreadyMinted()",
      "error AlreadyClaimed()",
      "error Soulbound()",
      "error InvalidCategory()",
      "error UnknownToken()",
    ]);

    it("kompilované ABI obsahuje každú položku kontraktu §4 s rovnakou signatúrou", async () => {
      const abi: Abi = (await hre.artifacts.readArtifact("GoskoPass")).abi;
      for (const item of CONTRACT_ABI) {
        if (item.type === "function") {
          const fn = item as AbiFunction;
          const selector = toFunctionSelector(fn);
          const found = abi.find(
            (x): x is AbiFunction => x.type === "function" && toFunctionSelector(x) === selector,
          );
          assert.ok(found, `chýba funkcia ${fn.name}`);
          assert.equal(found.stateMutability, fn.stateMutability, `${fn.name}: stateMutability`);
          assert.deepEqual(
            found.outputs.map((o) => o.type),
            fn.outputs.map((o) => o.type),
            `${fn.name}: výstupy`,
          );
          const shape = (outs: AbiFunction["outputs"]) =>
            outs.flatMap((o) => ("components" in o ? o.components.map((c) => `${c.type} ${c.name}`) : []));
          assert.deepEqual(shape(found.outputs), shape(fn.outputs), `${fn.name}: polia štruktúry`);
        } else if (item.type === "event") {
          const ev = item as AbiEvent;
          const found = abi.find(
            (x): x is AbiEvent => x.type === "event" && toEventSelector(x) === toEventSelector(ev),
          );
          assert.ok(found, `chýba event ${ev.name}`);
          assert.deepEqual(
            found.inputs.map((i) => Boolean(i.indexed)),
            ev.inputs.map((i) => Boolean(i.indexed)),
            `${ev.name}: indexed`,
          );
        } else if (item.type === "error") {
          assert.ok(
            abi.some((x) => x.type === "error" && x.name === item.name && x.inputs.length === 0),
            `chýba error ${item.name}`,
          );
        }
      }
    });

    it("commitnuté chain/abi/GoskoPass.json sa zhoduje s kompiláciou", async () => {
      const { abi } = await hre.artifacts.readArtifact("GoskoPass");
      const committed = JSON.parse(
        await readFile(new URL("../abi/GoskoPass.json", import.meta.url), "utf8"),
      );
      assert.deepEqual(committed, abi, "spusti `npm run abi` v chain/");
    });
  });

  describe("plyn", () => {
    it("mint a setResult sa zmestia do rozpočtu", async () => {
      const { pass, minter, custody, rider } = await deployed();
      const mintHash = await pass.write.mint(
        [custody.account.address, REG_1, EVENT_BA, RIDER_REF, CATEGORY.open],
        { account: minter.account },
      );
      const mint = await publicClient.waitForTransactionReceipt({ hash: mintHash });
      const resultHash = await pass.write.setResult([1n, 1, 100], { account: minter.account });
      const result = await publicClient.waitForTransactionReceipt({ hash: resultHash });
      const claimHash = await pass.write.claim([1n, rider.account.address], { account: minter.account });
      const claim = await publicClient.waitForTransactionReceipt({ hash: claimHash });
      console.log(`[gas] mint=${mint.gasUsed} setResult=${result.gasUsed} claim=${claim.gasUsed}`);
      assert.ok(mint.gasUsed < 250_000n, `mint ${mint.gasUsed}`);
      assert.ok(result.gasUsed < 60_000n, `setResult ${result.gasUsed}`);
    });
  });
});
