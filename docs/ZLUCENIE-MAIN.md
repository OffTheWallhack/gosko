# Zlúčenie Robovej `main` do `master-gosko`

Tento súbor je pre Roba aj pre nás: čo sa pri zlúčení zmenilo, kde sa jeho a naše veci prekrývajú
a čo treba vedieť, keby sa `master-gosko` raz vracal do `main`.

## 2. zlúčenie: PR #6 až #9 (5. 10. 2026)

Robo pridal novú úvodku (3D duch, video na pozadí, rotátor noviniek, nálepky eventov), skutočné adresy
s náhľadmi pre zdieľanie, spodné menu, komunitu (trik týždňa, profil jazdca, crew, hodnotenie spotov, XP,
stránka pre rodičov), event hub `hub/` a stránku `/doska`. Všetko je prevzaté. Naše veci ostali:
registrácia v2 so súhlasom rodiča, rebríček z `results_public`, hra Ghoskate, prihlásenie heslom,
naša Supabase v `data.js` a CSP.

### Adresy: `/eventy` namiesto `#/eventy`

- Robo prepol web z `#/eventy` na skutočné adresy. Router v `assets/app.js` stále pracuje s tvarom `#/…`
  (tabuľka `ROUTES`), adresu v prehliadači len prekladá. Staré odkazy (`/#/admin`, `/#/mapa`, odkazy
  z e-mailov `#/pass/<token>`, `#/checkin/<token>`, `#/registracia/potvrdene`) fungujú ďalej: prepíšu sa na `/admin`,
  `/mapa` a pod. Výnimka je `#/import-passes/…?to=…` (prenos passov z GitHub Pages), ten ostáva v hashi.
- Robo beží na GitHub Pages pod `/gosko/` a dynamické adresy mu chytá `404.html`. My bežíme na Verceli
  v koreni domény: `<base href="/">` a vo `vercel.json` je `rewrites`, ktorý pošle známe stránky (`/eventy`,
  `/event/…`, `/checkin/…`, `/admin`, `/profil`…) na `index.html`. `/api/*`, súbory a priečinky z `.vercelignore`
  ostávajú mimo. Pri novej stránke treba pridať jej prvé slovo do `rewrites` (test na to upozorní).
- Odkazy `#/…` z hry (`assets/game/*`) prekladá klik na skutočnú adresu, hra si sama zapisuje `/spot/<id>`.
- `scripts/build-pages.mjs` (stránky s náhľadom) berie adresu webu z `<meta name="gosko:base-url">` v `index.html`
  (u nás `https://gosko.sk`) a nastaví podľa nej `<base href>`. Stránky v repe sú vygenerované pre nás.
  `index.html` si pri generovaní nechá vlastnú hlavičku, mení sa len obsah pre vyhľadávače.
  Robove stránky článkov z jeho databázy (`novinka/<id>/`) sme zmazali: u nás tie články nie sú.
- GitHub Actions `pages.yml` beží len na `main`, na `master-gosko` nič nerobí.

### Prekrytia: čo je čo

| Vec | Robova (web) | Naša (hra Ghoskate) |
|---|---|---|
| Mapa | `/spoty`: skateparky zo `SKATEPARKS`, spoty od komunity, hodnotenie hviezdičkami, spot mesiaca | `/hra` (appka Ghoskate, predtým `/mapa`): MapLibre mapa spotov, check-in do 150 m, holo karta, crew a loot; spot na `/hra/spot/<id>` |
| Klipy | trik týždňa: bucket **`clips`** (verejný, video do 30 MB, nahrá ktokoľvek prihlásený do vlastného priečinka) | klipy zo spotov: bucket **`media`** (`016_game_clips.sql`, súkromný, video do 60 s a 50 MB a fotky, len hráč so súhlasmi) |
| Hodnotenie spotov | tabuľka **`spot_reviews`** (v jeho databáze `spot_ratings`): hviezdičky 1 až 5 a štítky podľa `spot_key` (`park:<slug>`, `spot:<id>`) | tabuľka `spot_ratings`: lebky 1 až 5 podľa `spot_id` a hráča (`010_game_core.sql`) |
| Crew | `/crew`, `/crew/<id>`: partie z `data.js` (`CREWS`), členovia z profilu jazdca | herné crew v databáze (`011_game_crews.sql`, `017_game_crews_page.sql`) na **`/hra/crew`**, pozvánka `/hra/crew/pridat/<KÓD>` |
| Profil | `/profil`: účet, heslo, XP a odznaky, profil jazdca („Som to ja“) | `/hra/profil`: hráčsky profil (prezývka, mesto, stance, avatar a farba, súhlasy) |
| XP a odznaky | `my_activity()`: fotky, spoty, parky, triky, hodnotenia (check-in na evente zatiaľ 0, registrácia nie je naviazaná na účet) | body a gear v hre |

Názov `spot_ratings` mal každý inak, preto Robova tabuľka u nás dostala meno `spot_reviews`
(`supabase-setup.sql`, `015_main_sync2.sql`, `assets/store.js`). Pri návrate do `main` treba v jeho databáze
buď tabuľku premenovať, alebo v `store.js` vrátiť `spot_ratings`.

Herná crew bola na `#/crew`. Robova stránka crew dostala `#/crew`, hra sa presunula na `#/hra/crew`.

### Hra Ghoskate ako samostatná appka na `/hra` (8. 10. 2026)

- Všetky herné stránky sú pod `/hra`: `/hra` (mapa), `/hra/spot/<id>`, `/hra/profil`, `/hra/crew`, `/hra/rebricek`,
  `/hra/potvrdene`, `/hra/feed`, `/hra/loadout`. Router v `assets/app.js` pozná len tieto; staré tvary prepíše
  `legacyGameRoute()` v `assets/game/return.js`.
- Staré adresy: `/mapa`, `/mapa/`, `/spot/<id>`, `/feed`, `/loadout` presmeruje Vercel (`redirects` vo `vercel.json`, 308,
  pred súbormi). Hash z e-mailov a starých záložiek (`#/mapa`, `#/spot/<id>`) prepíše router v prehliadači.
  `scripts/dev-server.js` vie `redirects` tiež. Odkaz zo súhlasu rodiča (`api/consent.js`, `#/hra/potvrdene`) sa nemenil.
- Na `/hra/*` má body triedu `game-app`: hlavička, spodné menu a pätička webu sú skryté, hra má vlastnú hornú lištu
  (Ghoskate, „← GOSko“ späť na web, PROFIL) a spodné menu MAPA, FEED, CREW, REBRÍČEK, LOADOUT (od Taskov 4 až 6).
  Admin hry (loot dropy, odkaz na moderáciu klipov) je na `/hra/admin`.
- `<head>` sa v hre prepne na `ghoskate.webmanifest` (id a start_url `/hra`), `apple-mobile-web-app-title` Ghoskate,
  ikonu `icons/ghoskate-apple-touch.png` a farbu `#14111C`; mimo hry späť na GOSko. Statická stránka `hra/index.html`
  (náhľad pre zdieľanie, `scripts/build-pages.mjs`) to má priamo v HTML. Robova `mapa/index.html` je zmazaná, `/mapa`
  ju aj tak preskočí presmerovaním.
- Vstup z webu: „Ghoskate“ v hlavnom menu, nálepka „Hra“ v hlavičke na mobile, „Hraj sa“ v menu, pätička, karta na úvodke
  a tlačidlo na Robovej `/spoty`. Robova `/spoty` je inak bez zmeny.
- Pri návrate do `main`: Robove GitHub Pages (`/gosko/`) by potrebovali presmerovanie `/mapa` v `404.html`, `redirects`
  z `vercel.json` tam neplatia. Manifest hry má absolútne `/hra`, na Pages by bol `start_url` mimo `/gosko/`.

### Databáza: `supabase/migrations/015_main_sync2.sql`

Robo mal v `supabase-setup.sql` len holé tabuľky („na živej databáze už spustené“). Migrácia 015 ich
vytvorí a utiahne ako 001/006/014:

- `posts.event_id`: článok patrí k eventu (anon ho číta, píše admin).
- `rider_profiles`: verejne cez pohľad `rider_profiles_public` (len schválené, bez `user_id` a poznámky
  k overeniu, `claimed` = profil už niekto prevzal). Jazdec si nárokuje profil len ako `pending` a len pre seba,
  jeden profil na účet. Status, vlastníka a slug mení len admin (trigger `rider_profile_guard`).
  Keď admin nahrá fotku jazdcovi, profil nepatrí adminovi.
- Trik týždňa: `trick_challenges` (číta každý, píše admin), `trick_entries` (klip pošle prihlásený len
  kým je zadanie otvorené, vidí len svoje), `trick_votes` (jeden hlas na účet, len za finalistu a len
  vo fáze hlasovania), pohľad `trick_results` (finalisti a počet hlasov, bez `user_id`).
- `spot_reviews`: anon vidí hviezdičky a štítky bez `user_id`, prihlásený hodnotí len za seba.
- `user_id` všade dopĺňa databáza (`auth.uid()`), web ho neposiela.
- `my_activity()`: SECURITY DEFINER, bez EXECUTE pre PUBLIC a anon.
- Úložisko: bucket `clips` (video do 30 MB, len do vlastného priečinka), admin smie nahrať fotku jazdca
  do `photos/riders/`.

Testy: `tests/integration/db/main-sync-015.test.js`, audit práv v `hardening.test.js`.

### Prihlásenie

Robo opravil prihlásenie kódom z e-mailu (prvé prihlásenie je technicky `signup`, skúša sa oboje) a pridal
náhradné prihlásenie vložením odkazu. To je prevzaté v režime `magic`. U nás ostáva `CONFIG.LOGIN_MODE = 'password'`
(e-mail a heslo, nový účet s potvrdením e-mailu). Z Robovho prevzaté aj: spracovanie návratu z odkazu
v e-maile (`#access_token=…` vedie na `/profil`), tlačidlo účtu v hlavičke a zmena hesla v profile.
Odkaz z e-mailu vedie vždy na koreň webu (v Supabase stačí mať adresu webu v Redirect URLs).

### Ostatné úpravy pri zlúčení

- 3D (three.js, 1,3 MB) sa naďalej načítava až keď treba: doska na úvodke až pri priblížení, nálepky
  a duch cez `import()`. Importmap má aj `three/addons/` (Robov duch potrebuje `SVGLoader`) s integrity
  hashom, CSP hash importmapy je prepočítaný.
- Robove odkazy z databázy (kalendár, sociálne siete eventu, klipy v admine) idú cez `safeUrl`.
- Herné stránky sú bez pásu eventov a spoločnej pätičky.
- Service worker `gosko-v20` (Robo mal v19, my v16), s appkou Ghoskate `gosko-v21`.

### Klipy, crew, loot a profil v hre (Tasky 4 až 6, 8. 10. 2026)

- **Bucket na klipy hry je vlastný `media`, nie Robov `clips`.** Dôvody: iné pravidlá (video do 60 s a 50 MB aj fotky,
  Robov `clips` má 30 MB a len video), nahrávať smie len hráč, ktorý môže zverejňovať (16+ alebo U16 so súhlasom
  rodiča s hrou aj s fotkami a videami), a bucket je súkromný: súbor číta každý len kým je jeho klip verejný (po skrytí
  adminom alebo odvolaní súhlasu už nie), autor a admin vždy. Politiky na `storage.objects` majú `bucket_id = 'media'`
  a názvy začínajú „Ghoskate:“, Robove sú viazané na `'clips'` a ostali bez zmeny; navzájom sa nekrížia.
- Pri návrate do `main`: Robova politika „Prihlásený nahrá klip triku“ pustí do `clips` každého prihláseného (aj U16 bez
  súhlasu rodiča). Hry sa to netýka, ale pri zlúčení identity hráča a jazdca by stálo za to zvážiť rovnaké pravidlo ako v `media`.
- Súhlas rodiča s hrou a súhlas s fotkami a videami sú dve políčka na tej istej stránke `/api/consent` (fotky sú nepovinné,
  nezaškrtnuté). Hráč si nový odkaz pre rodiča vypýta v profile, súhlas s klipmi vie sám odvolať.
- Herná logika, ktorá sa nesmie dať obísť, je v DB ako SECURITY DEFINER s `auth.uid()`: `add_clip`, `my_crew`, `crew_preview`,
  `rotate_invite_code`, `claim_loot`, `set_loadout`, `set_nft_consent`, `update_profile`. Admin loot ide cez `/api/admin/loot`
  (requireAdmin) a RPC len pre `service_role`.
