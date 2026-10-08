# GoskoPass (chain/)

Neprenosný (soulbound) ERC-721 pass pre registrácie GOSko na sieti Base. Jeden token na jednu
registráciu, výsledok (umiestnenie a body) sa zapíše po evente. Na chaine nie sú žiadne osobné
údaje, iba náhodný `riderRef`. Systémom záznamu je databáza, chain je jej verejná overiteľná kópia.

Záväzné rozhranie je v [`docs/KONTRAKT-REGISTRACIA.md`](../docs/KONTRAKT-REGISTRACIA.md) §4.
Skompilované ABI je v [`abi/GoskoPass.json`](abi/GoskoPass.json) (commituje sa, test kontroluje zhodu).

Stack: Solidity 0.8.28 (EVM Cancun, optimizer 200), OpenZeppelin Contracts 5, Hardhat 3, viem,
testy cez `node:test`.

## Ako kontrakt funguje

| Funkcia | Kto | Čo robí |
|---|---|---|
| `mint(to, registrationKey, eventId, riderRef, category)` | MINTER_ROLE | vydá token (id od 1) na `to`; rovnaký `registrationKey` druhýkrát revertuje `AlreadyMinted()`; `category` musí byť 1, 2 alebo 3, inak `InvalidCategory()` |
| `setResult(tokenId, placement, points)` | MINTER_ROLE | zapíše alebo opraví výsledok, emituje `ResultSet` a `MetadataUpdate` (ERC-4906) |
| `claim(tokenId, to)` | MINTER_ROLE | jediný povolený prevod: z custody do peňaženky jazdca, iba raz (`AlreadyClaimed()`) |
| `revoke(tokenId)` | MINTER_ROLE | spáli token a uvoľní `registrationKey`; funguje aj počas pauzy |
| `setBaseURI(uri)` | DEFAULT_ADMIN_ROLE | nová adresa metadát, emituje `BatchMetadataUpdate(1, max)` |
| `pause()` / `unpause()` | DEFAULT_ADMIN_ROLE | pauza zastaví `mint`, `setResult` aj `claim` |

- **Soulbound (ERC-5192):** `locked()` vráti vždy `true`. Každý `transferFrom` a `safeTransferFrom`
  (aj cez `approve`) revertuje `Soulbound()`. Výnimky sú iba mint, burn (`revoke`) a jednorazový `claim`.
- **Kódovanie:** `registrationKey = keccak256(utf8(registration.id))`, `eventId = keccak256(utf8(event.id))`,
  `riderRef = riders.rider_ref`. Kategória: 1 = open, 2 = u16, 3 = women.
- `tokenURI(id)` = `baseURI + id`, kde `baseURI` = `${PUBLIC_BASE_URL}/api/nft/metadata/`.
- Kontrakt nie je upgradovateľný. Oprava chyby = nový deploy a nová adresa v `NFT_CONTRACT_ADDRESS`.

## GoskoLoot (odmeny z hry Ghoskate)

Neprenosný (soulbound) ERC-1155 pre odmeny z hry Ghoskate. Jeden claim z databázy (`loot_claims.id`)
vydá práve jeden kus. Na chaine nie sú žiadne osobné údaje, iba `claimRef = keccak256(utf8(loot_claims.id))`.
Skompilované ABI je v [`abi/GoskoLoot.json`](abi/GoskoLoot.json) (commituje sa, test kontroluje zhodu).
Typy (id): 1 ghost drop, 2 park pass, 3 trick card, 4 crew/founder, 5 partner stamp. `name()` = "GOSko Loot",
`symbol()` = "GLOOT", `uri` je šablóna s `{id}`.

| Funkcia | Kto | Čo robí |
|---|---|---|
| `mint(to, id, claimRef)` | MINTER_ROLE | vydá 1 kus typu `id`; rovnaký `claimRef` druhýkrát revertuje `AlreadyMinted()`, nepovolený typ `TypeDisabled()`, nulová adresa `ZeroAddress()`; uloží `typeOfClaim` a `holderOfClaim`, emituje `LootMinted` |
| `revoke(claimRef)` | MINTER_ROLE | spáli kus daného claimu a uvoľní `claimRef` (dá sa znova mintnúť); funguje aj počas pauzy |
| `burn(id)` | držiteľ | právo na výmaz: držiteľ si sám spáli jeden svoj kus; `claimRef` zostáva obsadený, kým ho nezruší `revoke` |
| `setTypeEnabled(id, enabled)` | DEFAULT_ADMIN_ROLE | povolí alebo zakáže mint typu (1 až 5 sú povolené od začiatku) |
| `setURI(uri)` | DEFAULT_ADMIN_ROLE | nová šablóna URI, emituje `BatchMetadataUpdate(0, max)` |
| `pause()` / `unpause()` | DEFAULT_ADMIN_ROLE | pauza zastaví `mint`; `revoke` a `burn` idú ďalej |

- **Soulbound (ERC-5192):** `locked(id)` vráti vždy `true`. Každý `safeTransferFrom` a `safeBatchTransferFrom`
  medzi dvoma adresami aj `setApprovalForAll` revertuje `Soulbound()`. Povolený je iba mint a burn.
- Konštruktor: `(admin, minter, uri)`. Kontrakt nie je upgradovateľný.
- **Nasadzuje sa zatiaľ len lokálne** (`npx hardhat node`), na testnet ani mainnet nie. Mint z API je
  vypnutý, kým nie je nastavená `LOOT_CONTRACT_ADDRESS`.

## Inštalácia a testy

```bash
cd chain
npm install
npx hardhat test nodejs               # alebo z koreňa repa: npm run test:chain
npx hardhat test nodejs --gas-stats   # navyše tabuľka spotreby plynu
```

Po každej zmene kontraktu pregeneruj ABI a commitni ho spolu s kontraktom:

```bash
npm run abi    # zapíše abi/GoskoPass.json aj abi/GoskoLoot.json
```

## Lokálny deploy

Terminál 1 (uzol beží, kým ho nezastavíš; stav drží iba v pamäti):

```bash
cd chain && npx hardhat node
```

Terminál 2:

```bash
cd chain && npm run deploy:local
```

Skript nasadí kontrakt cez Ignition modul vždy nanovo a zapíše `deployments/local.json`
(`address`, `chainId`, `admin`, `minter`, `baseURI`). Súbor je v `.gitignore`. Sieť je v skripte
natvrdo `localhost` a skript skontroluje chainId 31337, takže na verejnú sieť nič nepošle.

- admin = účet #0 uzla, minter = účet #1 uzla (oba vypíše `npx hardhat node` aj s kľúčmi;
  sú to verejne známe testovacie kľúče, použiteľné **iba lokálne**),
- `baseURI` = `${PUBLIC_BASE_URL}/api/nft/metadata/`, predvolene `http://localhost:3000/api/nft/metadata/`.

Premenné pre lokálne API (`.env.local` v koreni):

```bash
CHAIN_ID=31337
RPC_URL=http://127.0.0.1:8545
NFT_CONTRACT_ADDRESS=<address z deployments/local.json>
MINTER_PRIVATE_KEY=<kľúč účtu #1 z výpisu hardhat node>
NFT_CUSTODY_ADDRESS=<napr. účet #2 z výpisu hardhat node>
```

## Base Sepolia a Base mainnet (robí operátor)

Claude ani CI na verejné siete nenasadzujú. Mainnet deploy je operátorská brána (plán, Task 14):
najprv celý tok na Base Sepolia, potom Rado schváli kľúče a až potom mainnet.

### 1. Kľúče a adresy

| Rola | Čo to je | Odporúčanie |
|---|---|---|
| **admin** (`DEFAULT_ADMIN_ROLE`) | spravuje roly, pauzu a baseURI | **Safe** na Base (app.safe.global) alebo hardvérová peňaženka. Nikdy nie serverový kľúč. |
| **minter** (`MINTER_ROLE`) | server (Vercel) mintuje a zapisuje výsledky | **nový kľúč** vygenerovaný len na tento účel, iba MINTER_ROLE, malý zostatok ETH (napr. 0,003 ETH) |
| **custody** | adresa, ktorá drží tokeny do prevzatia | ľubovoľná adresa GOSko, môže byť aj Safe; nemusí nič podpisovať, `claim` volá minter |
| **deployer** | platí za deploy | jednorazový kľúč s malým zostatkom; po deployi **nemá žiadnu rolu**, admin a minter sú parametre konštruktora |

Kľúč deployera ulož do šifrovaného keystore Hardhatu (pýta si heslo, do súborov sa nič nezapíše):

```bash
cd chain
npx hardhat keystore set DEPLOYER_PRIVATE_KEY
npx hardhat keystore set ETHERSCAN_API_KEY      # pre overenie na Basescan
```

`RPC_URL` zadaj pri príkaze ako premennú prostredia. Obe siete čítajú tú istú premennú, preto má
každá sieť v konfigurácii pevný chainId (84532 a 8453): ak RPC ukazuje na inú sieť, Hardhat skončí chybou.

### 2. Parametre

Vytvor `ignition/parameters/base-sepolia.json` (obsahuje iba verejné adresy, môže sa commitnúť):

```json
{
  "GoskoPassModule": {
    "admin": "0x...adresa Safe alebo hardvérovej peňaženky",
    "minter": "0x...adresa nového serverového kľúča",
    "baseURI": "https://<preview alebo gosko.sk>/api/nft/metadata/"
  }
}
```

Modul nemá predvolené hodnoty zámerne: bez parametrov deploy zlyhá a admin nikdy potichu neostane
na kľúči deployera. `baseURI` končí lomkou.

### 3. Deploy a overenie na Base Sepolia

```bash
cd chain
RPC_URL=https://sepolia.base.org \
  npx hardhat ignition deploy ignition/modules/GoskoPass.ts \
  --network baseSepolia --parameters ignition/parameters/base-sepolia.json

npx hardhat ignition verify chain-84532
```

Adresa je v `ignition/deployments/chain-84532/deployed_addresses.json`. Celý priečinok
`ignition/deployments/chain-84532/` commitni (záznam o deployi, plán Task 14).

Potom vo Vercel env (preview) nastav `CHAIN_ID=84532`, `RPC_URL`, `NFT_CONTRACT_ADDRESS`,
`MINTER_PRIVATE_KEY` (tajný, iba vo Verceli, nikdy v repe), `NFT_CUSTODY_ADDRESS`.
Minterovi pošli trochu Sepolia ETH (faucet).

Kontrola: check-in na preview vytvorí token, výsledky zavolajú `setResult`, na
sepolia.basescan.org je token, `locked(id)` vráti `true` a metadáta sa zobrazia.

### 4. Base mainnet (až po schválení)

Rovnaký postup s `ignition/parameters/base.json`:

```bash
RPC_URL=<mainnet RPC> npx hardhat ignition deploy ignition/modules/GoskoPass.ts \
  --network base --parameters ignition/parameters/base.json
npx hardhat ignition verify chain-8453
```

Vo Vercel env (production) `CHAIN_ID=8453` a ostatné hodnoty pre mainnet. Na mintera pošli pár
eur v ETH na Base.

### 5. Prevádzka a incidenty (podpisuje admin, teda Safe)

- **Unikol kľúč mintera:** `revokeRole(MINTER_ROLE, <stará adresa>)`, potom `grantRole(MINTER_ROLE, <nová adresa>)`
  a nový `MINTER_PRIVATE_KEY` vo Verceli. Pri podozrení najprv `pause()`.
- **Zmena domény metadát:** `setBaseURI("https://<nová doména>/api/nft/metadata/")`. Marketplace
  a exploreri dostanú `BatchMetadataUpdate` a metadáta si načítajú znova.
- **Chybný token** (zlá registrácia, výmaz na žiadosť): `revoke(id)` volá server s MINTER_ROLE.
  Registrácia sa potom dá zmintovať znova s novým id.

## Odhad nákladov na Base

Spotreba plynu z `npx hardhat test nodejs --gas-stats`:

| Operácia | Plyn | Pri 0,003 gwei a 3 500 $/ETH |
|---|---|---|
| deploy | ~1 894 000 | ~0,02 $ |
| `mint` | 178 000 až 212 000 | **~0,002 $** |
| `setResult` | ~37 000 | ~0,0004 $ |
| `claim` | ~67 000 | ~0,0007 $ |
| `revoke` | ~52 000 | ~0,0005 $ |

K tomu sa pripočíta poplatok za L1 dáta, zvyčajne zlomok centu.
1 000 mintov aj s výsledkami tak vyjde na pár dolárov. Skutočná cena = plyn × aktuálna cena plynu
na Base, ktorú ukazuje Basescan. Pri 5× drahšom plyne je mint stále okolo 0,01 $.
