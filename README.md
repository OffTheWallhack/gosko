# GOSko web

Stránky: úvod s 3D doskou, rebríček, eventy a kalendár, stránky eventov s videom,
jazdci s vlastnou doskou, odznakmi a zdieľateľnou kartou, mapa spotov od komunity,
stavebnica skateparku s top 10, shop (zatiaľ zber záujmu), pre partnerov s media
kitom a „Zavolaj si GOSko“, odber noviniek, vstupné QR passy a skrytý admin
na adrese `#/admin` so skenerom na check-in (`#/admin/scan`).

Web sa dá pridať na plochu telefónu ako appka a funguje aj bez signálu
(okrem vecí, ktoré potrebujú internet: mapa, video, formuláre).

## Súbory

```
index.html            kostra stránky
data.js               VŠETOK OBSAH: eventy, výsledky, partneri, produkty
assets/app.js         stránky a logika
assets/board.js       3D doska s nálepkami
assets/park.js        stavebnica skateparku
assets/store.js       ukladanie (prehliadač alebo Supabase)
assets/badges.js      odznaky jazdcov (počítajú sa z výsledkov)
assets/card.js        zdieľateľná karta jazdca (Instagram Story)
assets/map.js         mapa spotov (Leaflet + OpenStreetMap)
assets/qr.js          QR passy a skener na check-in
assets/pwa.js         pridanie na plochu
sw.js                 offline režim (pri väčšej zmene zvýš VERSION)
manifest.webmanifest  nastavenie appky na ploche
icons/                ikony appky
assets/style.css      vzhľad
img/                  logo a fotky
supabase-setup.sql    databáza pre ostrý režim (základ)
supabase/migrations/  migrácie 001–014 nad supabase-setup.sql (registrácia v2, výsledky, NFT, hra, novinky)
supabase/checks/      grants.sql: audit práv anon/authenticated (iba čítanie)
chain/                kontrakt GoskoPass (Hardhat), lokálny deploy
vercel.json           hlavičky, cache, CSP, funkcie a cron pre Vercel
.vercelignore         čo sa nenahrá na Vercel (a teda nie je verejné)
api/                  Vercel funkcie (registrácia, passy, admin, NFT, cron)
scripts/dev-server.js lokálny server s rovnakými hlavičkami a routovaním /api ako na Verceli
tests/                unit, api, integračné, smoke a lokálne e2e testy
supabase-seed-events.sql  skate eventy doma a vo svete do kalendára (sezóna 2026)
video/                video na úvodke (WebM + MP4)
```

## 1. Nasadenie na Vercel

Web je statický (bez buildu) a k nemu patria Vercel funkcie v `api/`. Nasadzuje sa
z príkazového riadku, takže na to netreba prístup do GitHub repozitára.

### Prvé nasadenie (preview)

1. Raz: `npm i -g vercel` a `vercel login`.
2. V koreni projektu spusti `vercel`. Pri prvom spustení sa opýta na účet (scope),
   názov projektu (`gosko`) a priečinok (`./`). Nastavenia buildu nemeň: `vercel.json`
   už hovorí, že framework nie je, build nie je a výstup je koreň (`.`).
3. Vypíše sa adresa preview nasadenia. Preview je predvolene za Vercel Authentication,
   takže ho uvidíš prihlásený do Vercelu.
4. Over ho smoke testom (viď nižšie).

Do produkcie ide `vercel --prod`.

### Premenné prostredia

Zoznam je v `.env.example`. Na Vercel sa pridávajú v **Project Settings → Environment Variables**
alebo príkazom `vercel env add NAZOV production` (opýta sa na hodnotu, takže tajné
hodnoty nejdú do histórie shellu). To isté pre `preview`, ak ich majú mať aj preview nasadenia.
Po zmene premenných treba nasadiť znova, inak ich bežiaca verzia nevidí.

| Skupina | Premenné | Poznámka |
|---|---|---|
| Databáza | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_AUTH_URL` | service role kľúč je TAJNÝ, v dashboarde ho označ ako Sensitive |
| Registrácia | `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `MAIL_FROM`, `PUBLIC_BASE_URL`, `CONSENT_VERSION`, `RATE_LIMIT_PER_10MIN` | `TURNSTILE_SECRET_KEY` a `RESEND_API_KEY` sú TAJNÉ; v produkcii musia byť nastavené |
| NFT | `CHAIN_ID`, `RPC_URL`, `NFT_CONTRACT_ADDRESS`, `NFT_CUSTODY_ADDRESS`, `MINTER_PRIVATE_KEY` | `MINTER_PRIVATE_KEY` je TAJNÝ; kým je `NFT_CONTRACT_ADDRESS` prázdna, NFT je vypnuté a registrácia funguje ďalej |
| Cron | `CRON_SECRET` | TAJNÝ; Vercel ho posiela cronu automaticky ako `Authorization: Bearer ...` |

`PUBLIC_BASE_URL` je adresa bez lomky na konci (`https://gosko.sk`). Preview nasadenia majú inú
adresu, takže odkazy v e-mailoch testuj radšej na produkcii alebo tam nastav `PUBLIC_BASE_URL`
na adresu preview.

Verejné hodnoty webu nie sú v prostredí, sú v `CONFIG` v `data.js`:

| Kľúč | Čo to je | Prázdne znamená |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | projekt Supabase a verejný (publishable) kľúč | ukážkový režim, všetko len v prehliadači |
| `TURNSTILE_SITE_KEY` | verejný site key Cloudflare Turnstile (secret je len v prostredí API) | widget sa v registrácii nezobrazí; API v produkcii bez `TURNSTILE_SECRET_KEY` registráciu odmietne |
| `API_BASE` | adresa Vercel funkcií, ak web beží inde (napr. `https://gosko.sk`) | API na tom istom webe (`/api/...`) |
| `NFT_CONTRACT_ADDRESS` | adresa kontraktu GoskoPass na Base, verejná | pri výsledkoch sa nezobrazí odkaz na NFT |

`NFT_CONTRACT_ADDRESS` doplní operátor do `data.js` ručne po nasadení kontraktu, rovnakú hodnotu ako
v prostredí API. Pohľad `results_public` adresu kontraktu nevracia (len `chain_id`, `token_id`, `nft_status`),
odkaz na prieskumník si web skladá z `CONFIG`.

Verzia Node pre funkcie sa berie z `engines.node` v `package.json` (Node 22).

### Doména gosko.sk

1. Doménu kúp u registrátora (vlastník projektu).
2. Vo Vercele: **Project → Settings → Domains → Add** `gosko.sk`, alebo `vercel domains add gosko.sk`.
3. Vercel ukáže, aké DNS záznamy nastaviť. Zvyčajne `A` záznam pre `gosko.sk` a `CNAME`
   pre `www`; presné hodnoty vždy preber z dashboardu. Dá sa aj presunúť nameservery na Vercel.
4. Presmeruj `www.gosko.sk` na `gosko.sk` (v Domains pri `www`) a nastav `PUBLIC_BASE_URL=https://gosko.sk`.
5. Certifikát vystaví Vercel sám.

### Supabase Auth: adresy pre novú doménu

V Supabase: **Authentication → URL Configuration**.

- **Site URL:** `https://gosko.sk`
- **Redirect URLs:** `https://gosko.sk/**`, `https://www.gosko.sk/**`, pre lokálny vývoj
  `http://localhost:3000/**` a podľa potreby vzor pre preview nasadenia (`https://*-tvoj-tim.vercel.app/**`).
  Staré adresy z GitHub Pages ponechaj, kým nie je hotové presmerovanie.

Prihlasovacie e-maily (magic link) idú na Site URL, takže ju prepni ešte pred ostrým spustením.

### Hlavičky a CSP

`vercel.json` nastavuje cache (`/sw.js` bez cache, `assets/*`, `data.js` a `index.html` s
`max-age=0, must-revalidate`; názvy súborov nemajú hash, preto nikdy `immutable`), bezpečnostné
hlavičky a Content Security Policy. CSP beží zatiaľ ako **Report-Only**: nič nezablokuje, len
vypíše porušenia do konzoly prehliadača. Vynucuje sa iba `frame-ancestors 'none'`.
Ak je konzola na všetkých routách čistá, prepni CSP na vynucovanie: v `vercel.json` premenuj kľúč
`Content-Security-Policy-Report-Only` na `Content-Security-Policy`, predtým zmaž samostatný riadok
`Content-Security-Policy` s `frame-ancestors` (plná CSP ho už obsahuje, inak by bol kľúč dvakrát)
a uprav test v `tests/unit/vercel-config.test.js`.

**CSP hash importmapy.** Inline `<script type="importmap">` v `index.html` povoľuje v `script-src`
hash `'sha256-...'`. Po akejkoľvek zmene importmapy (aj medzery) sa hash zmení a treba ho
prepočítať:

```bash
node --input-type=module -e "import {readFileSync} from 'node:fs'; import {createHash} from 'node:crypto'; for (const m of readFileSync('index.html','utf8').matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) console.log(\"'sha256-\" + createHash('sha256').update(m[1]).digest('base64') + \"'\")"
```

Vypísaný hash vlož do `script-src` vo `vercel.json`. Stráži to `npm test` (nesedí hash, test spadne a vypíše
očakávaný) aj smoke test proti živej adrese.

### Cron: opakovanie NFT mintu

Funkcia `api/cron/nft-retry` dorobí mint a zápis výsledkov, ktoré pri check-ine nevyšli. Vo `vercel.json`
(`crons`) beží predvolene **raz denne** (`0 6 * * *`, čas je UTC) a pre plán Hobby to je jediná možnosť:
cron častejší ako raz denne tam zlyhá už pri nasadení a Hobby ho spustí kedykoľvek v danej hodine.

| Plán | `schedule` | Poznámka |
|---|---|---|
| Hobby | `0 6 * * *` | raz denne; neúspešný mint sa dorobí do 24 hodín |
| Pro | `*/10 * * * *` | každých 10 minút |

Zmeň `crons[0].schedule` vo `vercel.json` a nasaď znova. Cron beží len na produkčnom nasadení.
Okamžité spustenie rukou:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://gosko.sk/api/cron/nft-retry
```

### Smoke test nasadenia

```bash
GOSKO_URL=https://gosko-xyz.vercel.app npm run test:smoke
```

Skontroluje, že `/`, `/sw.js`, manifest, `data.js` a všetky `assets/*.js` vrátia 200, že sedia hlavičky
a hash CSP, a že nič z `.vercelignore` (`/supabase-setup.sql`, `/README.md`, `/chain/`, `/.env.example`)
nie je verejné. Preview za Vercel Authentication potrebuje navyše `VERCEL_AUTOMATION_BYPASS_SECRET`
(Project Settings → Deployment Protection → Protection Bypass for Automation).

### Stránky (hash routy)

| Route | Čo je tam |
|---|---|
| `#/registracia/<event>` | registrácia v2 (`POST /api/register`), pod 16 rokov s rodičom |
| `#/registracia/potvrdene`, `#/registracia/neplatny-odkaz` | sem presmeruje odkaz rodiča z e-mailu (`/api/consent`) |
| `#/pass`, `#/pass/<token>` | moje passy; pass z odkazu v e-maile sa načíta zo servera (`GET /api/pass`) |
| `#/checkin/<token>`, `#/admin/scan` | check-in pre crew (`POST /api/admin/checkin`), aj ručne podľa mena |
| `#/admin/vysledky/<event>` | zápis výsledkov a pavúka (`POST /api/admin/results`) |
| `#/rebricek`, `#/rebricek/pravidla` | GOSko Ranking z `results_public` a rebríčkový poriadok |
| `#/pravidla`, `#/sukromie` | súťažný poriadok a ochrana osobných údajov |

API endpointy sú v `docs/KONTRAKT-REGISTRACIA.md`, časť 3.

### Supabase v produkcii: poradie migrácií

Všetko v **SQL Editore** projektu, po jednom súbore, v tomto poradí:

1. `supabase/checks/grants.sql` (iba čítanie): ulož si výsledok. Riadky `KRITICKÉ` pri `*_public` pohľadoch
   sú dôvod migrácie 001.
2. `supabase/migrations/001_hardening.sql`
3. `supabase/migrations/002_registration_v2.sql` (premenuje starú tabuľku `registrations` na `registrations_legacy`)
4. `supabase/migrations/003_results_rpc.sql`
5. `supabase/migrations/004_guardian_after_checkin.sql`
6. `supabase/migrations/005_results_clear_nft.sql` (vyhodený jazdec alebo zmazaná kategória vynuluje výsledok aj na chaine)
7. `supabase/migrations/006_privacy.sql` (opravy z bezpečnostného auditu: rodič pri registrácii, platnosť odkazu pre rodiča,
   `riderRef` pre každý token, `riders_public` bez mesta, `registrations_admin` pre admin výsledkov, práva na nové funkcie)
8. `supabase/migrations/010_game_core.sql` až `013_game_consent.sql` (hra Ghoskate)
9. `supabase/migrations/014_main_sync.sql` (z Robovej main: kalendár `end_date`, `prize` a fotka eventu, novinky `posts`,
   pozvánky adminov `admin_invites`; admin z pozvánky až po potvrdení e-mailu)
10. `supabase/seed/events_2026.sql` (eventy a výsledky z `data.js`), voliteľne `supabase-seed-events.sql` (skate kalendár)
11. Znova `supabase/checks/grants.sql`: nesmie ostať žiadny riadok `KRITICKÉ`.

Každá migrácia je v transakcii a dá sa spustiť znova. Po opätovnom spustení 001 treba znova spustiť 002 až 005
(001 odoberá všetky práva).

Pred prvým zápisom výsledkov cez nový admin skontroluj tabuľky `brackets` a `event_awards`: pred 006 sa do pavúka
a ocenení načítavali celé mená z registrácií. Riadky s celým menom jazdca, ktorý si zvolil skrátené meno alebo prezývku,
(a mená U16 bez súhlasu rodiča) uprav alebo zmaž; sú verejné.

### Čo musí urobiť operátor (brány)

Kód je hotový a lokálne overený, toto sa bez vlastníka projektu nedá:

1. **Supabase:** spustiť migrácie (vyššie) a do Vercelu dať `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Sensitive).
2. **Resend:** overiť doménu odosielateľa a nastaviť `RESEND_API_KEY`, `MAIL_FROM`. Bez kľúča e-maily neodídu.
3. **Turnstile:** založiť widget pre `gosko.sk`, site key do `CONFIG.TURNSTILE_SITE_KEY`, secret do `TURNSTILE_SECRET_KEY`.
   V produkcii bez secretu API registráciu odmietne.
4. **Minter a kontrakt:** vyrobiť novú peňaženku mintera (nikdy nie testovacie kľúče Hardhatu), poslať jej trochu ETH
   na Base, nasadiť GoskoPass (`chain/README.md`), nastaviť `CHAIN_ID`, `RPC_URL`, `NFT_CONTRACT_ADDRESS`,
   `MINTER_PRIVATE_KEY`, `NFT_CUSTODY_ADDRESS` vo Verceli a adresu kontraktu aj do `CONFIG.NFT_CONTRACT_ADDRESS`.
5. **Doména `gosko.sk`:** kúpiť, pripojiť vo Verceli, `PUBLIC_BASE_URL=https://gosko.sk`, Supabase Auth URL (vyššie).
6. **GitHub Pages:** súbory z `redirect/` (`index.html`, `sw.js`) nahrá vlastník repozitára do gh-pages, aby
   stará adresa presmerovala na `gosko.sk` a starý service worker sa odregistroval.
7. **Zakladatelia a NFT:** import (`node scripts/import-founders.js <csv> --dry-run`, potom bez `--dry-run`; CSV
   s osobnými údajmi nikdy do repa) zapíše registrácie bez NFT súhlasu. Od zakladateľov treba **najprv získať
   súhlas s NFT**, zapísať ho (`nft_consent = true`) a až potom spustiť `node scripts/backfill-mint.js --dry-run`
   a `node scripts/backfill-mint.js`.
8. **CSP:** po kontrole konzoly na produkcii prepnúť z Report-Only na vynucovanie (vyššie). `script-src` povoľuje
   z jsDelivr už len `three@0.160.0`; hlavička HSTS je zapnutá, takže doména musí ostať na HTTPS.

## 2. Lokálny vývoj

Potrebuješ Node 22 alebo novší. Raz `npm install` (jediná závislosť je `viem` pre API).

```bash
cp .env.example .env.local      # doplň hodnoty; .env.local sa necommituje
node scripts/dev-server.js      # http://localhost:3000
```

Dev server nemá závislosti a správa sa ako Vercel: servíruje súbory z koreňa, pridáva hlavičky
z `vercel.json`, neservíruje nič z `.vercelignore` (takže `/README.md` dá 404 ako na produkcii)
a `/api/*` smeruje na súbory v `api/`, vrátane dynamických `[id]` (`api/nft/metadata/[id].js` je
`/api/nft/metadata/7`). Port a adresu zmeníš cez `PORT` a `HOST` (`PORT=3001 node scripts/dev-server.js`).
Premenné z `.env.local` sa načítajú do prostredia funkcií.
Bez `RESEND_API_KEY` e-maily neodchádzajú a do konzoly sa vypíše len predmet; s `MAIL_DEV_LOG=full` aj adresa
a text (napr. odkaz pre rodiča). Obsahujú osobné údaje, preto to nie je predvolené.

Web treba otvárať cez server, nie dvojklikom na `index.html`, inak prehliadač moduly nenačíta.
Service worker na `localhost` cachuje súbory, takže po zmene zvýš `VERSION` v `sw.js` alebo ho v DevTools
(Application) odregistruj.

Testy:

| Príkaz | Čo robí |
|---|---|
| `npm test` | unit a api testy, bez siete a bez databázy |
| `npm run test:db` | testy databázy, treba lokálny Postgres a PostgREST (postup v `docs/KONTRAKT-REGISTRACIA.md`, časť Lokálny test stack) |
| `npm run test:api-int` | API proti PostgREST a lokálnemu Hardhat uzlu |
| `npm run test:chain` | testy kontraktu (Hardhat, priečinok `chain/`) |
| `npm run test:smoke` | smoke test nasadenia, treba `GOSKO_URL` (bez neho sa preskočí) |
| `npm run test:e2e` | celý tok v prehliadači proti lokálnemu stacku (nižšie) |

Smoke test sa dá pustiť aj proti lokálnemu serveru: v jednom termináli `node scripts/dev-server.js`,
v druhom `GOSKO_URL=http://localhost:3000 npm run test:smoke`.

### Lokálny end-to-end beh

`tests/e2e/local.e2e.test.js` spustí všetko sám a na konci to zastaví: lokálnu DB `gosko_test` s migráciami
001–006 a PostgREST na porte 3901, `npx hardhat node` (8545) s GoskoPass nasadeným cez
`chain/scripts/deploy-local.ts`, dev server na porte 3010 a headless Chromium. Prejde registráciu dospelého
a pass, registráciu U16 so súhlasom rodiča (GET stránka, POST potvrdenie), check-in adminom s mintom,
metadáta NFT bez osobných údajov, uloženie výsledkov s rebríčkom a zmazanie výsledkov s vynulovaním na chaine.

```bash
PLAYWRIGHT_MODULE=/cesta/k/node_modules/playwright npm run test:e2e
```

Potrebuje lokálny Postgres (socket `/tmp`, port 5432), `postgrest`, `chain/node_modules` a Playwright
s nainštalovaným Chromiom (nie je závislosť projektu, preto `PLAYWRIGHT_MODULE`). Port 8545 musí byť voľný.
Dev server dostane lokálne hodnoty cez prostredie (nič sa nezapisuje do `.env.local`). GoTrue lokálne
nebeží, preto test spustí malú bránu na porte 3902: `/auth/v1/user` overí testovací JWT a `/rest/v1/*`
pošle na PostgREST, aby supabase-js v prehliadači fungoval ako proti Supabase. Prehliadač má zakázané
všetky požiadavky mimo localhost (aj `*.supabase.co`) a test zlyhá, ak by niektorá išla na Supabase.

## 3. Bežná údržba: `data.js`

- **Nový event:** skopíruj blok v `EVENTS` a uprav ho. Dostane nálepku na doske.
- **Výsledky:** do `results` zapíš mená v poradí umiestnenia. Rebríček,
  profily jazdcov a ich dosky sa prepočítajú samy.
- **Žilina:** doplň `date`, `place`, `stickerDate` a `results`.
- **Fotky:** nahraj ich do `img/` a pridaj do `photos` pri evente.
  Ideálne `.webp` alebo `.jpg` s šírkou okolo 1400 px.
- **Autor fotiek:** `SITE.photoCredit`. **Kontaktný e-mail:** `SITE.email`.
- **Bodovanie:** `POINTS`.
- **Video:** pri evente `video: { youtubeId: '…' }` (ID je časť odkazu za `youtu.be/`).
- **Event na mape:** pri evente doplň `lat` a `lng` (súradnice skopíruješ
  z Google Maps: podrž prst na mieste).

Na jednej doske je miesto na 8 nálepiek, jazdec vidí tie najnovšie.

## 4. Ukážkový vs. ostrý režim

Kým je `CONFIG` v `data.js` prázdny, všetko funguje, ale formuláre, parky
a hlasy sa ukladajú len v prehliadači toho, kto ich poslal. Na ukážku partnerom
to stačí. Na skutočný zber registrácií a hlasovanie treba Supabase.

## 5. Ostrý režim cez Supabase (free plán)

1. Na supabase.com založ projekt.
2. **SQL Editor → New query**, vlož celý `supabase-setup.sql` a daj **Run**.
3. **Project Settings → API**: skopíruj *Project URL* a *anon public* kľúč
   do `CONFIG` v `data.js`. Anon kľúč je určený na verejný web.
4. **Authentication → URL Configuration**: do *Site URL* daj adresu webu.
5. **Authentication → SMTP**: nastav vlastný e-mailový server (napr. Resend,
   má bezplatný plán). Bez toho prihlasovacie e-maily ľuďom nebudú chodiť.
6. **Authentication → Email Templates → Magic Link**: do textu e-mailu pridaj
   riadok `Tvoj kód: {{ .Token }}`. Ľudia, ktorí majú GOSko pridané na ploche,
   sa tak prihlásia kódom (odkaz by sa im otvoril v Safari mimo appky).
   Prihlásený človek ostáva prihlásený, kým sa sám neodhlási.
7. **Admin:** otvor `#/admin`, prihlás sa svojím e-mailom a potom v SQL Editore spusti:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'tvoj@email.sk';
   ```
   Alebo pozvánkou (migrácia 014): `insert into public.admin_invites (email) values ('meno@example.com');`.
   Admin práva dostane účet s týmto e-mailom, keď je e-mail potvrdený (aj už existujúci potvrdený účet).

### Prihlásenie heslom (`LOGIN_MODE`)

`CONFIG.LOGIN_MODE` v `data.js` určuje prihlásenie do adminu, hlasovania aj hry:

- `'password'` (teraz): e-mail a heslo (`signInWithPassword`), nový účet v tom istom okne (`signUp`).
  Admina založíš v **Authentication → Users → Add user** s heslom a zaškrtnutým **Auto Confirm User**,
  potom mu daj admin práva (SQL vyššie alebo pozvánka).
- `'magic'`: kód alebo odkaz z e-mailu (body 5 a 6 vyššie). Prepnutie späť je len táto jedna hodnota.

**Authentication → Sign In / Providers → Email: „Confirm email“ musí ostať zapnuté.** Hra
(`/api/game/link-rider`) aj pozvánky adminov veria, že e-mail je overený; s vypnutým potvrdzovaním si
ktokoľvek založí účet s cudzím e-mailom (napr. pozvaného admina alebo rodiča jazdca).

V admine potom schvaľuješ parky, eventy a spoty od komunity a vidíš registrácie,
odber noviniek, objednávky pop-upov a záujem o shop. Všetko sa dá stiahnuť ako CSV.

## Stavebnica parku

Na PC: prekážku vyber klikom alebo ju myšou potiahni rovno na plochu. Položenú prekážku chytíš
a presunieš, R otočí, Delete zmaže, Ctrl+D skopíruje, Ctrl+Z/Ctrl+Y späť/znova.
Pravé tlačidlo otáča pohľad, koliesko približuje (najprv klikni do plochy). Na mobile sa prekážka
chytí podržaním prsta. Plocha má tri veľkosti a prekážky sa dajú prefarbiť.

## Kalendár eventov

Eventy od komunity a svetové/domáce skate eventy sú v Supabase v tabuľke `community_events`
(schválené sa ukážu v kalendári). Súbor `supabase-seed-events.sql` ich vloží znova, ak treba
(duplicitné sa nevložia). Ďalšie pridáš cez „Pridať event“ a schváliš v admine.
Pri evente môže byť aj posledný deň (`end_date`) a prize pool (`prize`). Vlajka sa ukáže podľa krajiny.

## Novinky a články (bez programovania)

1. Otvor `#/admin` a prihlás sa e-mailom a heslom (účet musí byť admin, postup je vyššie).
2. Klikni **+ Pridať novinku**, vyplň nadpis, pár viet, prípadne fotku a odkaz, a daj **Zverejniť**.
3. Novinka sa hneď ukáže v časti **Novinky**, na úvodke aj v bežiacom páse. Upraviť alebo zmazať ju vieš v admine.

Ďalšieho admina pridáš rovnako ako seba (SQL príkaz vyššie s jeho e-mailom).

## Video na úvodke

Nahraj krátky klip bez zvuku (10 – 20 s, MP4, do ~8 MB) do priečinka `video/` a v `data.js` vyplň
`SITE.heroVideo: 'video/hero.mp4'`. Kým je prázdne, na pozadí hrá YouTube vlog (`SITE.vlog`).

## Fotky k eventom v kalendári

V admine v časti **Fotky k eventom v kalendári** pri evente vyber fotku. Bez fotky sa ukáže grafika s názvom mesta.

## Skateparky na mape

Zoznam je v `data.js` v `SKATEPARKS`. Poloha je orientačná, presné súradnice skopíruješ z Google Maps.

## Newsletter

Odberatelia sa zbierajú v admine v sekcii **Odber noviniek**. Keď vyhlásiš
event, stiahni CSV a pošli e-mail cez svoj mail alebo nástroj ako Mailchimp
či Ecomail. Kto sa chce odhlásiť, toho zmaž v Supabase v tabuľke
`newsletter_subscribers`.

## Check-in na evente

1. Jazdec sa zaregistruje na webe a dostane QR pass (nájde ho v menu „Môj pass“).
2. Crew sa na mobile prihlási ako admin a otvorí `#/admin/scan`.
3. Namieri kameru na QR, skontroluje meno (pri U16 aj súhlas rodiča) a potvrdí príchod.
   Ide to aj bežnou kamerou mobilu: QR otvorí stránku na potvrdenie.
4. V admine pri registráciách vidíš, koľko ľudí prišlo.

Check-in potrebuje internet. Pri check-ine jazdca so súhlasom s NFT (U16 až po súhlase rodiča) sa vydá
GoskoPass; ak mint nevyjde, dorobí ho cron. Výsledky uložené v `#/admin/vysledky` idú rovno do rebríčka
(`results_public`) a na chain; staršie výsledky v `data.js` ostávajú.

Na hlasovanie a posielanie parkov sa treba prihlásiť e-mailom (jeden človek,
jeden hlas). Registrácie, eventy a formuláre idú bez prihlásenia.

## Súkromie

- Mapa používa podklady OpenStreetMap, ktoré sú zadarmo pri uvedení zdroja (je v rohu mapy).
- Fotky spotov sú verejné hneď po nahratí na adrese, ktorú pozná len systém; na mape sa ukážu až po schválení.

- Pri U16 registrácia vyžaduje súhlas rodiča.
- Kontakty z formulárov vidí len admin, verejne sa nezobrazujú.
- Pri fotkách detí z U16 majte súhlas rodičov so zverejnením.

## Na evente: výsledky a TV

- **Zápis výsledkov:** `#/admin/vysledky`. Vyber event a kategóriu, zapíš jazdcov (alebo ich načítaj z registrácií a check-inu), vytvor pavúk a ťukaním na meno označuj víťazov. Po dohraní klikni „Uložiť výsledky do rebríčka“. Dá sa zapísať aj len poradie bez pavúka.
- **TV mód:** `#/tv/ID-eventu` (napr. `#/tv/bratislava-2`). Otvor na TV alebo notebooku v aute, klikni na ikonu celej obrazovky v pravom hornom rohu. Obrazovka sa každých 5 sekúnd sama obnoví a strieda pavúk, výsledky a rebríček. Keď v admine označíš „Teraz jazdia“, TV ukáže tento súboj veľkým písmom.
- Bez Supabase sa všetko ukladá len v jednom prehliadači, TV na inom zariadení vtedy zmeny neuvidí.

## Doplníš neskôr v data.js

- `RULES`, `FAQ`: pravidlá a časté otázky. Kým sú prázdne, stránka Pravidlá sa v menu nezobrazuje.
- `SEASON_RULES.finale`: koľko jazdcov postupuje do finále. Kým je `null`, sekcia „Cesta do finále“ sa nezobrazuje.
- `PARTNERS`: `logo`, `url`, `about` pre každého partnera.
- `RIDER_PRIVACY`: skrátené mená jazdcov na žiadosť (napr. „Marek K.“).
- `SEASONS`: po skončení sezóny `finished: true`, šampióni sa ukážu v Sieni slávy.

Ak máš Supabase už nastavený zo staršej verzie, spusti v SQL Editore len časť súboru `supabase-setup.sql` od riadku „Výsledky, pavúky, ocenenia“ po „Prístupy“, a potom nové riadky `grant` na konci.
