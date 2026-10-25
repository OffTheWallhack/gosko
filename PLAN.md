# GOSko web – plán dokončenia (október 2026)

Cieľ: dokončiť a vyčistiť web gosko.sk tak, aby sa dal spustiť naostro. Ghoskate (`ghoskate/`) teraz nerieš.

## Ako pracovať

- Repo `OffTheWallhack/gosko`, vetva `main` = živý web (GitHub Pages, teraz `offthewallhack.github.io/gosko/`).
- Každý krok = vlastná vetva `claude/…`, PR, merge. GitHub Action po merge pregeneruje statické stránky (`scripts/build-pages.mjs`).
- Pri každej zmene: zvýš `VERSION` v `sw.js`, spusti `node scripts/build-pages.mjs`, skontroluj JS ako modul (`cp assets/app.js /tmp/x.mjs && node --check /tmp/x.mjs` – obyčajný `node --check` na .js chyby neodhalí).
- Testuj v Playwright v mobilnom viewporte 393×852 (iPhone), pozri screenshoty. Externé CDN (three, leaflet, fonty) v sandboxe nejdú – nahraď ich lokálnymi kópiami z npm.
- Obsah sa mení v `data.js`. Vzhľad: `assets/style.css` (posledné bloky v9–v11 majú prednosť). Logika: `assets/app.js`.
- Používateľ (Robo) píše po slovensky, chce jednoduchý jazyk, pracuje z mobilu. Po každom kroku krátke zhrnutie + screenshoty, žiadne technické detaily navyše.

## Rozhodnutia, ktoré už platia

- Vzhľad: tmavý, štýl PSP/XMB, sklenené zaoblené plochy, krémový text, červená len na hlavnú akciu. Bez zrna, náklonov, pások, bez vlny v pozadí. Nadpisy Anton, text Archivo, žiadne drobné verzálky.
- Jeden duch: vpravo hore „Môj profil“ + kreslená šípka + malý duch (`img/ghost-cream.svg`, krémový obrys). Inde duch nie je. Nový 3D model ducha je hotový: `assets/mascot.js` (telo, tvár z loga, grimasy, veci, scéna, kamoš, efekty), katalóg a nastavenie `assets/ghost.js` (profiles.ghost v2), editor v Mojom profile `assets/ghost-editor.js`. Pixelový duch `assets/pixel-ghost.js` (mapa, zoznamy, alebo ako hlavný), PS1 ako `ps1: true` v mascot.js (odomkne sa na leveli 6). Level ducha = XP z aktivity (`ghostLevel`). Zámky v databáze: `supabase-ghost-v3.sql`.
- Hlavička pripnutá od vrchu (aj pod status barom), pod ňou lišta Skate kalendár. Spodný dok: Domov, Eventy, Rebríček, Komunita, Menu (panel).
- Eventy: jedna stránka `/eventy` – GOSko (nálepky), Slovensko a Česko (iní organizátori + Pridať event), Veľké eventy vo svete (prehľad). Event hub zrušený, `hub/` presmeruje.
- Názvy: GOSko Bratislava, GOSko 2 Žilina, GOSko 3 Bratislava.
- Rebríček: z GOSka 1 a 2 sú len top 3, od GOSka 3 celý pavúk. Žiadne vymyslené čísla.
- Titulka (hero) nemá blok noviniek: bol príliš široký a prázdny. Novinky sú v menu a na `/novinky`. Keď bude nový dôležitý článok, pridá sa na titulku nálepka (ako nálepka ďalšieho eventu vpravo hore).
- Úvodná animácia bez prelietavania: duch a nápis v strede zmiznú, pozadie odroluje a v titulke sa objavia znova.
- Nálepky eventov 1 a 2 sú čierny kruh s kresbou z tlačovej nálepky (`assets/sticker-art.js`: nápis GOSKO a duch na doske), hore GAME OF S.K.A.T.E., dole mesto a číslo. Bratislava červená a biela, Žilina zelená a žltá (`ROUND_PAL` v `assets/board.js`). GOSko 3 má zatiaľ starý štít.
- Hero video: slabší počítač a malá obrazovka dostanú 540p (`video/hero-720.*`), plné video len silný počítač. Pri zapnutom „znížené animácie“ v systéme sa video zámerne nespustí (zobrazí sa obrázok).
- Stránka sa nepribližuje (zoom vypnutý okrem mapy a 3D).
- Ochrana osobných údajov `/sukromie` – návrh, právnikovi pôjde až po dokončení webu.

## Kroky (v tomto poradí, každý zvlášť)

1. **Menu (panel)** – menej položiek: hore 3 veľké karty (Ďalšie GOSko, Rebríček, Navrhni dosku), pod tým zoznam v riadkoch (Novinky, Trik týždňa, Crew, Mapa, Skatepark, Shop), dole drobne Kto sme, Pre rodičov, Partneri, Súkromie, Instagram. Nič, čo je v spodnom doku.
2. **Úvodka** – video → ďalšie GOSko → nálepky eventov → top 3 jazdci → doska → newsletter. Preč: kalendár widget (nahradiť 3 najbližšie eventy + odkaz), GOSko TV, feed „Fresh zo scény“, Kto sme karta, opakovania. Nové video od Roba (1920×1080, 10–20 s) – keď príde, zmenši na ~3–5 MB, MP4 + WebM, poster.
3. **Eventy a stránka eventu** – doladiť karty, prázdne stavy, nálepky, „Chcem jazdiť“ pri GOSko 3.
4. **Rebríček, jazdci, Sieň slávy** – zjednotiť, skrátiť, profil jazdca upratať.
5. **Komunita** – Trik týždňa, Crew, Mapa, Pre rodičov: skryť prázdne veci (Discord „čoskoro“, crew bez popisu), texty bez opakovania.
6. **Hry** – 3D doska (palety + pixel-art fotka hotové), stavebnica parku: mobilné ovládanie, texty.
7. **Shop** – ukážka so záujmom, bez vymyslených cien.
8. **Pre partnerov, Kto sme, Media kit** – skrátiť, overiť čísla (FACTS v data.js), OZ bez „v príprave“.
9. **Profil a admin** – prihlásenie, XP, Ghoskate odkaz len ak dáva zmysel.
10. **Doména gosko.sk + maily** – až keď Robo nastaví DNS: A záznamy 185.199.108.153 / .109 / .110 / .111, CNAME www → offthewallhack.github.io, súbor `CNAME` s `gosko.sk`, `<base href="/">` v index.html, `SITE_URL` v build-pages.mjs, Supabase Site URL + Redirect URLs, vlastné SMTP (Resend) pre prihlasovacie maily, `SITE.email` = info@gosko.sk.
11. **Záverečná kontrola** – prehľadať všetky podstránky (odkazy, chyby v konzole, pretečenie na mobile), sitemap, náhľady pri zdieľaní, offline režim.

## Placeholdery na doplnenie (od Roba)

- `SITE.email`, `SITE.photoCredit`, `SITE.discord`, `SITE.org` (sídlo, IČO OZ, overiť názov).
- GOSko 3: dátum, miesto, `stickerDate`, súradnice.
- GOSko 2 Žilina: fotky, Best Trick, partneri, video.
- Súradnice (lat/lng) všetkých eventov.
- Partneri: logá, weby, popisy.
- Pravidlá a FAQ (`RULES`, `FAQ`), postup do finále (`SEASON_RULES`).
- Plán 2027: mestá.
- Jazdci: fotky, Instagram (profily si môžu prevziať sami).
- Crew: Tlakerz popis, mestá, Instagramy, členovia.
- Shop: ceny a reálne produkty.
- Prvý trik týždňa v admine.
- Nové hero video.
