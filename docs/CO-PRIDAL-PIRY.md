# Čo pridal Piry (zlúčenie master-gosko do main)

Robo, toto je zhrnutie vetvy `piry/zlucenie-s-robom`. Základ je **tvoja main** (stav po PR #81).
Tvoj vzhľad, texty, fotky, duch, nálepky, mapa, rebríček aj admin ostali presne tak, ako sú.
Naše funkcie sú pridané navrch a väčšina z nich je **vypnutá prepínačom** v `data.js`.

## Čo sa na webe zmení hneď po zlúčení

1. **Hra v hornej lište.** Na počítači je v hornej lište odkaz „Hra“ so štítkom DEMO.
   Na mobile je v Menu položka „Hra Ghoskate DEMO“.
2. **Stránka `/hra`.** Je to stránka „Pripravujeme“: čo v hre bude, tlačidlo „Daj mi vedieť“
   (odber noviniek so zdrojom `ghoskate`) a odkaz na editor ducha a dosky.
3. Nič iné. Databáza, prihlásenie, registrácia aj admin fungujú ako doteraz.

Tvoja prezentácia `ghoskate/` ostala bez zmeny. `/hra` je samostatná stránka.

## Prepínače v `data.js` (CONFIG)

| Prepínač | Teraz | Čo robí |
|---|---|---|
| `GAME` | `'demo'` | `'demo'` = stránka „Pripravujeme“. `'live'` = plná hra. `'off'` = hra aj odkazy zmiznú. |
| `BACKEND_V2` | `false` | Zapne registráciu v2, pass zo servera, check-in a výsledky cez API a NFT. |
| `API_BASE` | `''` | Adresa API pri `BACKEND_V2`, napríklad `https://gosko-master.vercel.app`. |
| `LOGIN_MODE` | `'magic'` | `'magic'` = tvoje prihlásenie (kód alebo odkaz z e-mailu, voliteľne heslo). `'password'` = e-mail a heslo aj so založením účtu. |
| `TURNSTILE_SITE_KEY` | `''` | Ochrana registrácie proti botom (Cloudflare Turnstile). |
| `NFT_CONTRACT_ADDRESS` | `''` | Adresa kontraktu GoskoPass na sieti Base. |

## Čo je pripravené, ale vypnuté

### Registrácia v2 (`BACKEND_V2`)
- Formulár s dátumom narodenia. Kategóriu U16 web určí sám podľa veku v deň eventu.
- **Dvojkrokový súhlas rodiča.** Rodič dostane e-mail s odkazom. Registrácia jazdca do 16 rokov platí až po potvrdení.
- Voľba, ako sa meno ukáže vo výsledkoch (celé meno, iniciála priezviska alebo prezývka).
- Samostatné súhlasy: pravidlá, osobné údaje, fotky, NFT, newsletter.
- QR pass vzniká na serveri, nie v prehliadači. Pass príde aj e-mailom, dá sa poslať znova.
- Nové adresy: `/registracia/<event>`, `/registracia/potvrdene`, `/registracia/neplatny-odkaz`, `/pass/<token>`.
- Kód: `api/register.js`, `api/consent.js`, `api/pass.js`, `assets/register.js`.

### Admin cez API (`BACKEND_V2`)
- Check-in cez server so stavom súhlasu rodiča a stavom NFT.
- **Ručný check-in podľa mena** pre jazdca bez telefónu (na skeneri aj na stránke check-inu).
- Výsledky sa ukladajú jednou transakciou na serveri a spárujú sa s registráciami.
- Kód: `api/admin/checkin.js`, `api/admin/results.js`.

### GoskoPass NFT (`BACKEND_V2` + kontrakt)
- Neprenosné (soulbound) NFT na sieti Base: záznam o účasti a výsledku, bez osobných údajov.
- Vydá sa len so súhlasom. Pri U16 až po súhlase rodiča.
- Server skúša neúspešné vydanie znova (cron `api/cron/nft-retry.js`).
- Import zakladateľov z 1. kola: `scripts/import-founders.js`.
- Kontrakty a testy: `chain/` (GoskoPass, GoskoLoot).

### Hra Ghoskate (`GAME: 'live'`)
- Herná mapa spotov (MapLibre), check-in na spote, karta spotu.
- Klipy a feed, crew a Turf Wars s pozvánkou odkazom.
- Loot dropy, loadout s 3D doskou, herný profil (prezývka, mesto, stance, avatar).
- Súhlas rodiča pre hráčov do 16 rokov.
- Kód: `assets/game/`, databáza `supabase/migrations/010` až `019`.

### Bezpečnosť databázy (`supabase/migrations/`)
- `001_hardening.sql`: audit našiel riziko, že anonym vie cez verejné pohľady meniť alebo mazať dáta. Migrácia to uzatvára. Na tvojej databáze to over SQL dotazmi v `supabase/checks/grants.sql`.
- `006_privacy.sql`: verejné pohľady bez osobných údajov, mená v admine len verejné.
- `014`, `015`: zosúladenie s tvojou schémou z main (novinky, profily jazdcov, trik mesiaca).

### Ďalšie
- Knižnice (Leaflet, QR, skener) sú uložené priamo na webe v `assets/vendor/`. Web nepotrebuje CDN pre mapu a QR.
- three.js má v importmape kontrolný súčet (integrity), aby sa nedal podvrhnúť.
- `vercel.json`: hlavičky, CSP (zatiaľ len hlásenie), adresy pre Vercel. Na GitHub Pages sa nepoužíva.
- Asi 700 automatických testov: `npm test`.

## Ako zapnúť naše funkcie (keď budeš chcieť)

1. Urob zálohu databázy v Supabase.
2. Skontroluj tabuľku `spot_ratings`. Tvoj web ju používa na hodnotenie parkov, ale hra (`010`) chce tabuľku s rovnakým menom na niečo iné. Pred migráciami treba tvoju tabuľku premenovať na `spot_reviews` aj s dátami. Ozvi sa, pripravíme to spolu.
3. Spusti migrácie `supabase/migrations/001` až `019` v poradí. Postup je v `docs/PREVADZKA-V2.md`.
4. Nasaď API na Vercel a nastav premenné podľa `.env.example`.
5. V `data.js` nastav `API_BASE` a `BACKEND_V2: true`. Pre hru nastav `GAME: 'live'`.
6. Zvýš `VERSION` v `sw.js` a spusti `node scripts/build-pages.mjs`.

## Rebríček: tvoje pravidlá + naše filtre

Body, Best Trick za 20 b., poradie pri rovnosti (skorší event) aj súčet bodov jazdca ostali tvoje.
Overené v prehliadači: Open, U16, Babská, Best Trick aj zoznam jazdcov dávajú rovnaké poradie a body ako tvoja main.
Pribudli tri veci, ktoré sa ukážu samé, až keď majú zmysel:

- **„Všetky časy“** pri výbere sezóny. Ukáže sa, keď sú výsledky aspoň z 2 sezón. Body sa rátajú za každú sezónu zvlášť a potom sčítajú.
- **Krajina (Celkový, Slovensko, Česko…)**. Ukáže sa, keď sú výsledky aspoň z 2 krajín. Krajina je z eventu (`country` v `data.js`), pri `BACKEND_V2` z profilu jazdca.
- **Odkaz „NFT“** pri výsledku na stránke eventu a v profile jazdca. Len pri `BACKEND_V2` a nastavenom `NFT_CONTRACT_ADDRESS`.

Dnes je všetko z jednej sezóny a zo Slovenska, takže rebríček vyzerá presne ako doteraz.

## Čo vedome nie je zapojené

- **Moje pravidlá rebríčka** (`assets/ranking.js`): Best Trick bez bodov a body z rôznych kategórií sa nesčítavajú. Na webe ostávajú tvoje pravidlá, súbor sa používa len v testoch.
- **Rozlíšenie dvoch jazdcov s rovnakým menom** (podľa `rider_id` z registrácie). Pôjde až so zapnutím `BACKEND_V2`, lebo mení adresy profilov jazdcov.
- **Stránka Rebríčkový poriadok** a **prenos passov zo starej adresy** (`/import-passes`) nie sú v menu ani v routách.

## Čo som zmenil v tvojich súboroch

- `assets/app.js`: prepínače, registrácia v2, pass, ručný check-in, prihlásenie heslom, stránka `/hra`, herné adresy a filtre rebríčka (všetky časy, krajina, NFT). Tvoje funkcie sú nezmenené. Nové veci bežia len pri zapnutom prepínači.
- `assets/store.js`: nové metódy pre registráciu v2, hru a prihlásenie heslom. Pri `BACKEND_V2: false` číta a zapisuje tie isté tabuľky ako doteraz.
- `index.html`: odkaz na hru v hornej lište a v menu, integrity pri three.js.
- `assets/style.css`: štýly pre pass, štítok DEMO a hru (pridané na koniec).
- `sw.js`: verzia `gosko-v97`, do offline zoznamu pribudli nové súbory.
- `scripts/build-pages.mjs`: stránka `hra/`, adresa webu sa dá zadať cez `SITE_URL`.
- `assets/map.js`, `assets/qr.js`: knižnice z `assets/vendor/` namiesto CDN.
- `assets/board.js`: kontrola „znížené animácie“ sa číta až pri kreslení. Správanie je rovnaké.
- `assets/pwa.js`: na `/hra` (pri `GAME: 'live'`) ponúkne na plochu appku Ghoskate.

Otázky píš Pirymu. Ak chceš niečo z toho vypnúť alebo prerobiť, stačí upraviť `data.js`.
