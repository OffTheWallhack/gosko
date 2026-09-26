# GOSko web

Stránky: úvod s 3D doskou, rebríček, eventy a kalendár, stránky eventov,
jazdci s vlastnou doskou, stavebnica skateparku s top 10, shop (zatiaľ zber
záujmu), pre partnerov so „Zavolaj si GOSko“ a skrytý admin na adrese `#/admin`.

## Súbory

```
index.html            kostra stránky
data.js               VŠETOK OBSAH: eventy, výsledky, partneri, produkty
assets/app.js         stránky a logika
assets/board.js       3D doska s nálepkami
assets/park.js        stavebnica skateparku
assets/store.js       ukladanie (prehliadač alebo Supabase)
assets/style.css      vzhľad
img/                  logo a fotky
supabase-setup.sql    databáza pre ostrý režim
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
   má bezplatný plán). Bez toho prihlasovacie odkazy ľuďom nebudú chodiť.
6. **Admin:** otvor `#/admin`, prihlás sa svojím e-mailom a potom v SQL Editore spusti:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'tvoj@email.sk';
   ```

V admine potom schvaľuješ parky a eventy od komunity a vidíš registrácie,
objednávky pop-upov a záujem o shop. Všetko sa dá stiahnuť ako CSV.

Na hlasovanie a posielanie parkov sa treba prihlásiť e-mailom (jeden človek,
jeden hlas). Registrácie, eventy a formuláre idú bez prihlásenia.

## Súkromie

- Pri U16 registrácia vyžaduje súhlas rodiča.
- Kontakty z formulárov vidí len admin, verejne sa nezobrazujú.
- Pri fotkách detí z U16 majte súhlas rodičov so zverejnením.
