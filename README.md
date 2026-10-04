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
supabase-setup.sql    databáza pre ostrý režim
supabase-seed-events.sql  skate eventy doma a vo svete do kalendára (sezóna 2026)
```

## 1. Nahratie na GitHub (zadarmo)

1. Na github.com vytvor repozitár, napr. `gosko`.
2. **Add file → Upload files** a pretiahni tam celý obsah priečinka
   (aj priečinky `assets` a `img`).
3. **Settings → Pages → Branch: main, / (root) → Save.**
4. O minútu-dve beží web na `https://tvojemeno.github.io/gosko/`.

Web treba otvárať cez túto adresu. Ak otvoríš `index.html` priamo z počítača
dvojklikom, prehliadač moduly nenačíta.

## 2. Bežná údržba: `data.js`

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

## 3. Ukážkový vs. ostrý režim

Kým je `CONFIG` v `data.js` prázdny, všetko funguje, ale formuláre, parky
a hlasy sa ukladajú len v prehliadači toho, kto ich poslal. Na ukážku partnerom
to stačí. Na skutočný zber registrácií a hlasovanie treba Supabase.

## 4. Ostrý režim cez Supabase (free plán)

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

Check-in potrebuje internet. Body do rebríčka sa stále zapisujú do `data.js`.

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
