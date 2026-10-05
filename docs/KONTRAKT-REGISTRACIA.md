# Kontrakt: registrácia jazdcov, výsledky, GOSko Ranking, NFT

Záväzné rozhranie medzi databázou, API, webom a kontraktom. Kto mení rozhranie, mení najprv tento súbor.
Plán: `~/.claude/plans/gosko-vercel-registracia-nft.md`.

## 0. Zásady
- **Databáza je systém záznamu.** Blockchain je verejná, overiteľná kópia výsledkov.
- **Na chaine ani v NFT metadátach nie sú osobné údaje:** žiadne mená, prezývky, dátumy, e-maily ani hashe z nich. Na chaine je iba náhodný `riderRef`, od 006 iný pre každý token (`nft_tokens.rider_ref`), takže passy jedného jazdca sa na chaine nedajú pospájať.
- **Server je bez frameworku:** Vercel Node funkcie (ESM), prístup k Supabase cez PostgREST `fetch`, bez supabase-js. Jediná runtime závislosť je `viem`.
- **Jazdec do 16 rokov** (vek v deň eventu) potrebuje potvrdenie rodiča e-mailom. NFT mu vznikne len so súhlasom rodiča.
- Kategórie: `open` (16+), `u16` (do 16), `women` (babská, voliteľná od 16 rokov; mladšie jazdkyne idú do u16).

## 1. Premenné prostredia (`.env.example`)
| Premenná | Kde | Popis |
|---|---|---|
| `SUPABASE_URL` | server | napr. `https://moxscedyreyvhkbkebmv.supabase.co`, lokálne `http://127.0.0.1:3901` (PostgREST) |
| `SUPABASE_SERVICE_ROLE_KEY` | server, TAJNÝ | service role JWT |
| `SUPABASE_AUTH_URL` | server | voliteľné, default `${SUPABASE_URL}/auth/v1` |
| `TURNSTILE_SECRET_KEY` | server, TAJNÝ | Cloudflare Turnstile; prázdne = overenie vypnuté (len lokálne, `NODE_ENV!=production`) |
| `RESEND_API_KEY` | server, TAJNÝ | prázdne = e-maily sa len zalogujú (dev) |
| `MAIL_FROM` | server | `GOSko <registracia@gosko.sk>` |
| `PUBLIC_BASE_URL` | server | `https://gosko.sk` (bez lomky na konci) |
| `CONSENT_VERSION` | server | `2026-10` |
| `CHAIN_ID` | server | 8453 Base, 84532 Base Sepolia, 31337 lokálny hardhat |
| `RPC_URL` | server | RPC endpoint |
| `NFT_CONTRACT_ADDRESS` | server | adresa GoskoPass; prázdne = NFT vypnuté (registrácia funguje ďalej) |
| `MINTER_PRIVATE_KEY` | server, TAJNÝ | kľúč s MINTER_ROLE |
| `NFT_CUSTODY_ADDRESS` | server | adresa, ktorá drží tokeny do prevzatia |
| `CRON_SECRET` | server, TAJNÝ | Vercel cron `Authorization: Bearer` |
| `RATE_LIMIT_PER_10MIN` | server | default 5 |

Klient (`data.js` → `CONFIG`): `SUPABASE_URL`, `SUPABASE_ANON_KEY` (už existujú), nový `TURNSTILE_SITE_KEY` (prázdne = widget sa nezobrazí), nový `API_BASE` (default `''` = rovnaký origin).

## 2. Databáza (Supabase Postgres)
Migrácie: `supabase/migrations/001_hardening.sql`, `002_registration_v2.sql`, `003_results_rpc.sql`. Platí poradie: najprv pôvodný `supabase-setup.sql`, potom 001, 002 a 003.

### Tabuľky (nové alebo zmenené)
```
events(id text PK, name text NOT NULL, city text, country char(2) NOT NULL DEFAULT 'SK',
       date date, season int, status text CHECK IN ('planned','open','done','cancelled') DEFAULT 'planned',
       registration_open boolean NOT NULL DEFAULT false, capacity int, created_at timestamptz DEFAULT now())

riders(id uuid PK DEFAULT gen_random_uuid(), rider_ref text UNIQUE NOT NULL  -- '0x' + 64 hex, náhodné
       , display_name text NOT NULL, nickname text, country char(2) NOT NULL DEFAULT 'SK', city text,
       public_name_mode text NOT NULL DEFAULT 'full' CHECK IN ('full','short','nick'),
       is_founder boolean NOT NULL DEFAULT false, created_at timestamptz DEFAULT now())

rider_private(rider_id uuid PK REFERENCES riders ON DELETE CASCADE, legal_name text NOT NULL,
       birth_date date NOT NULL, email text NOT NULL, phone text, instagram text,
       guardian_name text, guardian_email text, created_at, updated_at)
       UNIQUE INDEX ON (lower(email), birth_date)

registrations  -- pôvodná tabuľka sa premenuje na registrations_legacy (dáta zostanú)
registrations(id uuid PK DEFAULT gen_random_uuid(), rider_id uuid NOT NULL REFERENCES riders ON DELETE CASCADE,
       event_id text NOT NULL REFERENCES events, category text NOT NULL CHECK IN ('open','u16','women'),
       status text NOT NULL CHECK IN ('pending_guardian','confirmed','checked_in','no_show','cancelled'),
       token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
       consent_version text NOT NULL, consent_at timestamptz NOT NULL,
       photo_consent boolean NOT NULL DEFAULT false, nft_consent boolean NOT NULL DEFAULT false,
       guardian_token uuid UNIQUE, guardian_confirmed_at timestamptz,
       guardian_name text, guardian_email text, guardian_token_expires_at timestamptz,  -- 006: rodič pri registrácii, platnosť odkazu
       checked_in_at timestamptz, created_at timestamptz DEFAULT now(),
       UNIQUE(rider_id, event_id))

event_results  -- existujúca tabuľka + nové stĺpce
       + registration_id uuid NULL REFERENCES registrations ON DELETE SET NULL
       + points int NOT NULL DEFAULT 0     -- vypĺňa trigger cez points_for(place)
       (rider_name ostáva pre staršie výsledky bez registrácie)

nft_tokens(registration_id uuid PK REFERENCES registrations ON DELETE CASCADE, chain_id int NOT NULL,
       contract text NOT NULL, token_id numeric, status text NOT NULL
       CHECK IN ('pending','minted','result_pending','result_set','failed','revoked'),
       mint_tx text, result_tx text, error text, attempts int NOT NULL DEFAULT 0,
       created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())

audit_log(id bigserial PK, at timestamptz DEFAULT now(), actor uuid, action text NOT NULL,
       entity text, entity_id text, data jsonb)

rate_limits(key text, window_start timestamptz, count int NOT NULL DEFAULT 0, PRIMARY KEY(key, window_start))
```

### Funkcie
- `points_for(place int) returns int IMMUTABLE`: 1 → 100, 2 → 80, ≤4 → 60, ≤8 → 40, ≤16 → 20, inak 5 (zhodné s `POINTS` v `data.js`).
- `public_name(display_name, nickname, mode)`: `full` vráti display_name; `short` vráti prvé slovo + iniciálu posledného s bodkou („Marek K.“); `nick` vráti nickname, a ak chýba, správa sa ako `short`.
- `rate_limit_hit(p_key text, p_limit int, p_window_minutes int) returns boolean`: atomicky započíta pokus, vráti `true`, ak je limit prekročený. `SECURITY DEFINER`, EXECUTE iba pre `service_role`.
- `save_results(p_event_id text, p_category text, p_rows jsonb, p_actor uuid) returns int` (003):
  - `p_rows` = `[{"registration_id": uuid|null, "rider_name": text, "place": int}]`.
  - V **jednej transakcii** zmaže a vloží výsledky danej kategórie a zapíše `audit_log`.
  - Pri každom riadku s `registration_id`, ktorý má token v `nft_tokens` (status `minted` alebo `result_set`), nastaví status `result_pending`.
  - Vráti počet riadkov. EXECUTE iba pre `service_role`.
- `confirm_guardian(p_token uuid) returns registrations`: z `pending_guardian` urobí `confirmed`, nastaví `guardian_confirmed_at` a vynuluje `guardian_token`. Od 006 odmietne token po `guardian_token_expires_at` (PT404, 7 dní po evente, bez dátumu 60 dní). EXECUTE iba pre `service_role`.

### Pohľady (iba SELECT pre anon/authenticated, bez PII)
- `riders_public(id, public_name, country, is_founder)` (od 006 bez `city`)
- `results_public(event_id, category, place, points, rider_id NULL, public_name, chain_id, token_id, nft_status)`: pri starších výsledkoch bez registrácie je `public_name = rider_name` a `rider_id = null`. Pri zástupnom mene `GOSko jazdec` (U16 bez súhlasu rodiča, zrušená registrácia) sú od 006 `rider_id`, `chain_id`, `token_id` a `nft_status` NULL.
- `registrations_admin(id, event_id, category, status, checked_in_at, public_name)` (006): iba admin (`is_admin()`), verejné meno podľa `public_name_mode`, U16 bez súhlasu rodiča `public_name = NULL`. Z neho admin berie mená do pavúka, ocenení a výsledkov (tie sú verejné).
- `events_public` = `events`

### RLS a granty (001 + 002)
- `REVOKE ALL` na všetky tabuľky a pohľady v `public` od `anon` a `authenticated`, potom grant iba toho, čo treba:
  - SELECT na verejné pohľady,
  - INSERT na formulárové tabuľky (`community_events`, `newsletter_subscribers`, `bookings`, `shop_interest`, `privacy_requests`) cez **stĺpcové granty** bez `approved`/`id`/`created_at`,
  - SELECT/UPDATE/DELETE pre admina podľa existujúcich politík.
- Do `riders`, `rider_private`, `registrations`, `nft_tokens`, `audit_log` a `rate_limits` **nemá anon žiadny prístup**. Admin (authenticated + `is_admin()`) má SELECT. Zápisy robí iba `service_role` cez API.
- `registrations_legacy`: iba admin SELECT, anon nemá INSERT (starý formulár sa vypne).
- Pohľady `community_events_public`, `spots_public`, `event_photos_public` a `parks_ranked` majú iba SELECT; žiadny UPDATE/DELETE pre anon.
- CHECK: `community_events.link`, `spots.photo_url`, `event_photos.photo_url/clip_url` musia byť `^https?://` alebo NULL.

### Lokálny test stack
- `supabase/test/shim.sql`: role `anon`, `authenticated`, `service_role` (NOLOGIN), `authenticator` (LOGIN, s členstvom vo všetkých troch), schéma `auth` s `auth.uid()` (z `current_setting('request.jwt.claims', true)::json->>'sub'`) a `auth.users(id uuid PK)`, schéma `storage` s tabuľkami `buckets`, `objects` a funkciou `storage.foldername(text)`. Ak treba, aj `extensions`.
- `scripts/test-db.sh`: `dropdb --if-exists gosko_test && createdb gosko_test`, potom shim, `supabase-setup.sql` a migrácie 001–006 v poradí s `ON_ERROR_STOP=1`. Socket `/tmp`, port 5432.
- PostgREST (`/opt/homebrew/bin/postgrest`) beží na porte **3901** s `db-uri=postgresql://authenticator@/gosko_test?host=/tmp`, `db-schemas=public`, `db-anon-role=anon` a `jwt-secret` = 32+ znakový testovací reťazec v `supabase/test/postgrest.conf`. Testy si vyrobia JWT (HS256) pre `anon`, `authenticated` (sub = uuid admina) a `service_role` cez `node:crypto`.
- Helper `tests/helpers/stack.js` exportuje `startStack()` (vytvorí DB a spustí postgrest), `stopStack()`, `jwt(role, sub?)` a `REST_URL`.

## 3. API (Vercel Functions, `api/`, ESM, Node 22)
Každý handler: `export function createHandler(deps)` + `export default createHandler(defaultDeps())`. Závislosti (`fetch`, `env`, `now`, `db`, `mail`, `turnstile`, `chain`) sa dajú v testoch nahradiť. Odpovede sú JSON `{ ok, ... }` alebo `{ ok:false, error:'kod', message:'slovensky text' }`.

| Endpoint | Vstup | Výstup |
|---|---|---|
| `POST /api/register` | `{event_id, legal_name, display_name?, nickname?, birth_date:'YYYY-MM-DD', email, phone?, instagram?, country:'SK'\|'CZ'\|..., city?, women?:bool, guardian_name?, guardian_email?, public_name_mode:'full'\|'short'\|'nick', consents:{rules:true, privacy:true, photo:bool, nft:bool}, turnstile_token}` | 201 `{ok, status:'confirmed'\|'pending_guardian', pass:{token, event_id, event_name, public_name, category}}`; 400 `invalid_input`, 403 `captcha_failed`, 404 `event_not_found`, 202 `{ok, status:'check_email', mail_sent}` pre známeho jazdca (rovnaký `lower(email)` + `birth_date`, aj duplicitnú registráciu: pass ide len e-mailom na adresu jazdca, odpoveď nemá meno ani token), 415 `unsupported_media_type` (iný Content-Type ako JSON), 422 `guardian_required` alebo `event_closed`, 429 `rate_limited` |
| `GET /api/consent?token=` | guardian token | 302 na `${PUBLIC_BASE_URL}/#/registracia/potvrdene`, prípadne `/#/registracia/neplatny-odkaz` |
| `GET /api/pass?token=` | token registrácie | `{ok, pass:{token, event_id, event_name, public_name, category, status}}`, 404 |
| `POST /api/pass` | `{email, event_id}` | vždy 200 `{ok:true}`; ak registrácia existuje, odíde e-mail s odkazom na pass (proti zisťovaniu e-mailov) |
| `POST /api/admin/checkin` | hlavička `Authorization: Bearer <supabase user JWT>`; `{token}` alebo `{registration_id}`, prípadne `{event_id, rider_name}` pre ručný check-in | `{ok, registration:{id, status, public_name, category, guardian_ok}, nft:{status}}`; 401/403; idempotentné |
| `POST /api/admin/results` | Bearer admin; `{event_id, category, rows:[{registration_id?, rider_name, place}]}` | `{ok, saved:n, nft_updates:n}` |
| `GET /api/nft/metadata/:id` | tokenId | ERC-721 JSON (bez PII) |
| `GET /api/nft/image/:id` | tokenId | `image/svg+xml` nálepka |
| `GET /api/cron/nft-retry` | `Authorization: Bearer ${CRON_SECRET}` | `{ok, minted:n, results:n, failed:n}` |

Pravidlá:
- `register` overí Turnstile, potom rate limit (kľúč `reg:<ip>`, limit `RATE_LIMIT_PER_10MIN`/10 min).
- Validácia: meno 2–60 znakov, e-mail, dátum narodenia nie v budúcnosti a vek 6–99, krajina ISO-2, súhlasy `rules` a `privacy` = true.
- Event musí byť `registration_open` a mať voľnú kapacitu.
- Vek sa počíta k dátumu eventu. Pod 16 rokov: kategória `u16`, povinné `guardian_email` (iné ako email jazdca), status `pending_guardian` a e-mail rodičovi s odkazom `/api/consent?token=…`. Od 16 rokov: `confirmed` a `women ? 'women' : 'open'`.
- Jazdec sa deduplikuje podľa `lower(email)` + `birth_date`, pri zhode sa použije existujúci a nič sa na ňom nemení (ani rodič v `rider_private`). Rodič sa ukladá k registrácii (`registrations.guardian_*`); pri známom jazdcovi s uloženým rodičom ide súhlas tomuto rodičovi. `rider_ref` = `'0x' + randomBytes(32)`.
- Bez `public_name_mode` je predvolené `full`, pre jazdca do 16 rokov `short`. Formulár má predvolené `short`.
- E-maily odchádzajú cez Resend. Bez kľúča sa iba vypíše `console.info('[mail:dev]', …)`.
- Admin auth: `GET ${SUPABASE_AUTH_URL}/user` s JWT používateľa vráti `id`, potom sa cez service role overí riadok v `admins`. V testoch sa nahrádza (`deps.auth`).
- `checkin`: status `checked_in`; ak `nft_consent` a je nastavené `NFT_CONTRACT_ADDRESS`, vznikne `nft_tokens(status='pending')` a skúsi sa mint (chyba mintu check-in nezhodí, ostane `failed` a dorobí ho cron).
- `results` volá RPC `save_results`, potom pre tokeny `result_pending` skúsi `setResult`.

### Rebríček
Rebríček sa počíta na klientovi (`assets/ranking.js`) z verejných pohľadov `events_public` a `results_public`, ktoré klient číta cez supabase-js s anon kľúčom. Samostatné API na rebríček nie je. Ak Supabase nie je dostupný, ako záložný zdroj slúžia výsledky v `data.js`.

## 4. Kontrakt GoskoPass (`chain/`, Solidity 0.8.28, OZ 5, Hardhat 3 + viem)
```
// ABI (human-readable, pre viem parseAbi):
function mint(address to, bytes32 registrationKey, bytes32 eventId, bytes32 riderRef, uint8 category) returns (uint256)
function setResult(uint256 tokenId, uint16 placement, uint16 points)
function revoke(uint256 tokenId)
function claim(uint256 tokenId, address to)
function tokenOfRegistration(bytes32 registrationKey) view returns (uint256)
function passOf(uint256 tokenId) view returns ((bytes32 eventId, bytes32 riderRef, uint8 category, uint16 placement, uint16 points, bool claimed))
function locked(uint256 tokenId) view returns (bool)
function setBaseURI(string uri)
function tokenURI(uint256 tokenId) view returns (string)
event Minted(uint256 indexed tokenId, bytes32 indexed registrationKey, bytes32 indexed eventId)
event ResultSet(uint256 indexed tokenId, uint16 placement, uint16 points)
event Claimed(uint256 indexed tokenId, address to)
event Locked(uint256 tokenId)
event MetadataUpdate(uint256 _tokenId)
event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId)
```
- `tokenId` začína od 1. `tokenOfRegistration` vráti 0, ak token neexistuje. `mint` s rovnakým `registrationKey` revertuje `AlreadyMinted()`.
- Kódovanie: `registrationKey = keccak256(utf8(registration.id))`, `eventId = keccak256(utf8(event.id))`, `riderRef = nft_tokens.rider_ref` (bytes32, náhodný pre každý token, vzniká s riadkom `nft_tokens`; do 006 to bol `riders.rider_ref`). `category`: 1 = open, 2 = u16, 3 = women.
- **Soulbound:** `locked()` vráti vždy true; každý prenos revertuje `Soulbound()`. Výnimky sú mint, burn (`revoke`) a jednorazový `claim`. `claim` presunie token z vlastníka (custody) na `to` a potom je token znova zamknutý. Druhý `claim` revertuje `AlreadyClaimed()`.
- **Roly:** `DEFAULT_ADMIN_ROLE` (deployer alebo Safe) a `MINTER_ROLE` (server). `Pausable`: pauza zastaví mint, setResult aj claim. `supportsInterface` hlási aj ERC-5192 (`0xb45a3c0e`) a ERC-4906 (`0x49064906`).
- `setResult` emituje `ResultSet` a `MetadataUpdate`. `tokenURI` = `baseURI + tokenId`, baseURI = `${PUBLIC_BASE_URL}/api/nft/metadata/`.
- Lokálny deploy: `chain/scripts/deploy-local.ts` alebo Ignition modul. Testy: `cd chain && npx hardhat test nodejs`.

## 5. NFT metadáta (`/api/nft/metadata/:id`)
```json
{ "name": "GOSko Pass #12 · GOSko Bratislava 2026", "description": "Záznam o účasti a výsledku v sérii Game of S.K.A.T.E. GOSko. Neprenosný.",
  "image": "<PUBLIC_BASE_URL>/api/nft/image/12", "external_url": "<PUBLIC_BASE_URL>/#/event/bratislava-2026-05",
  "attributes": [ {"trait_type":"Event","value":"GOSko Bratislava"}, {"trait_type":"Dátum","value":"2026-05-31"},
    {"trait_type":"Kategória","value":"Open"}, {"trait_type":"Umiestnenie","value":1,"display_type":"number"},
    {"trait_type":"Body","value":100,"display_type":"number"}, {"trait_type":"Zakladateľ","value":"Áno"} ] }
```
Žiadne meno ani prezývka. Pri výmaze údajov (privacy request) zostane iba event, kategória, umiestnenie a body.

## 6. Web (`assets/`)
- `assets/ranking.js`: čisté funkcie rebríčka (z `app.js`), vstupom sú dáta a konfigurácia.
- `assets/util.js`: `safeUrl`, `csvCell`, `icsText`, `esc`.
- `assets/register.js`: čisté funkcie formulára (`ageAt`, `categoryFor`, `validateRegistration`, `buildPayload`) a `submitRegistration(fetch, payload)`.
- Routy: `#/registracia/:eventId`, `#/registracia/potvrdene`, `#/registracia/neplatny-odkaz`, `#/pass/:token`, `#/sukromie`, `#/pravidla`, `#/rebricek/pravidla`.
- QR pass ukazuje na `${origin}${pathname}#/checkin/<token>` (ako doteraz). Pass sa načítava zo servera (`GET /api/pass`) a localStorage slúži len ako cache.

## 7. Testy
- `npm test` spúšťa `tests/unit/**` a `tests/api/**`, bez siete a bez DB.
- `npm run test:db` spúšťa `tests/integration/db/**` proti lokálnemu Postgresu a PostgRESTu.
- `npm run test:api-int` spúšťa `tests/integration/api/**` (API proti PostgRESTu a lokálnemu hardhat uzlu).
- `npm run test:chain` = `cd chain && npx hardhat test nodejs`.
- `npm run test:smoke` = `tests/smoke/**` (env `GOSKO_URL`).
