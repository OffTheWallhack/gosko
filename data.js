/* =====================================================================
   GOSko: všetok obsah webu na jednom mieste.
   Upravuješ len tento súbor. Po uložení nahraj na GitHub a je to.
   ===================================================================== */

/* Supabase: kým je prázdne, web beží v ukážkovom režime
   (formuláre, parky a hlasy sa ukladajú len v prehliadači). Postup v README. */
export const CONFIG = {
  SUPABASE_URL: 'https://moxscedyreyvhkbkebmv.supabase.co',
  // Verejný (publishable) kľúč, je určený na web. Tajný kľúč (sb_secret_…) sem nikdy nepatrí.
  SUPABASE_ANON_KEY: 'sb_publishable_xxQm6zYj66nQ32z4Qi4lJA_DyQrOY5T',
};

export const SITE = {
  instagram: 'g.o.s.ko',
  email: '',            // kontaktný e-mail pre partnerov, napr. 'ahoj@gosko.sk'
  season: 2026,
  photoCredit: '',      // autor fotiek, zobrazí sa pod galériou
  /* Video na pozadí úvodky. Krátky klip bez zvuku (10 – 20 s, MP4, ideálne do 8 MB), nahraj ho do priečinka video/.
     Kým je prázdne, pozadie úvodky hrá YouTube vlog nižšie (bez zvuku). */
  heroVideo: 'video/hero.mp4',
  heroPoster: 'img/hero-poster.jpg',
  vlog: 'h_ZyZHSvmL4',  // YouTube ID vlogu z eventov
};

/* Bodovanie do rebríčka podľa umiestnenia. Body sa rátajú len za Game of Skate. */
export const POINTS = [
  { upTo: 1, points: 100 },
  { upTo: 2, points: 80 },
  { upTo: 4, points: 60 },
  { upTo: 8, points: 40 },
  { upTo: 16, points: 20 },
  { upTo: Infinity, points: 5 },   // účasť
];

export const CATEGORIES = [
  { id: 'open', name: 'Open', note: 'nad 16 rokov' },
  { id: 'u16', name: 'U16', note: 'do 16 rokov' },
  { id: 'women', name: 'Babská kategória', note: '' },
];

/* Eventy. results: poradie mien = umiestnenie (1., 2., 3., ...).
   Voliteľne: endDate: '2026-06-28' (posledný deň viacdňového eventu), prize: '500 € + ceny' (prize pool v kalendári).
   Pre „svet eventu“: videos: ['YouTubeID', …] (ďalšie videá), socials: [{ url: 'https://www.instagram.com/p/…', label: 'Reel z finále', from: 'Instagram' }, …]
   (príspevky ľudí zo sociálnych sietí). Články k eventu priradíš v admine pri novinke (políčko „Patrí k eventu“).
   sticker: 'band' | 'round' | 'next'. status: 'done' | 'next'. */
export const EVENTS = [
  {
    id: 'bratislava-2026-05',
    name: 'GOSko Bratislava',
    city: 'Bratislava',
    date: '2026-05-31',
    place: 'Skatepark Rača, Tbiliská',
    status: 'done',
    season: 2026,
    sticker: 'band',
    stickerDate: '31.05.2026',
    about: 'Prvé GOSko. Game of S.K.A.T.E. o vecné ceny, DJ a Red Bull Sugga, potom afterparty v Bufete pri Amfíku.',
    results: {
      open: ['Sebastian Kozmann', 'Tomáš Čekovský', 'Lukáš Ďuraj'],
      u16: ['Marek Kupkovič', 'Andrej Jaško', 'Tomáš Matel'],
      women: ['Júlia Dubovská'],
    },
    awards: [{ name: 'Best Trick', rider: 'Ján Horvath' }],
    partners: ['redbull', '3style', 'newspirit', 'tysomaru', 'studnica'],
    video: { youtubeId: 'h_ZyZHSvmL4' },
    lat: null, lng: null,   // presná poloha na mape, napr. lat: 48.2, lng: 17.1 (doplň)
    photos: [
      { src: 'img/ba-trick-3.webp', alt: 'Kickflip pod slnečníkom Red Bull' },
      { src: 'img/ba-podium.webp', alt: 'Stupne víťazov kategórie Open' },
      { src: 'img/ba-trick-2.webp', alt: 'Jazdkyňa vo vzduchu nad doskou' },
      { src: 'img/ba-trick-4.webp', alt: 'Trik pred autom Red Bull Sugga' },
      { src: 'img/ba-trick-1.webp', alt: 'Trik na rovine, v pozadí jazdkyňa' },
      { src: 'img/ba-trick-5.webp', alt: 'Jazdec v šiltovke počas triku' },
      { src: 'img/ba-fistbump.webp', alt: 'Dvaja jazdci si ťukajú päsťami' },
      { src: 'img/ba-prize-1.webp', alt: 'Odovzdávanie cien s mikrofónom' },
      { src: 'img/ba-prize-2.webp', alt: 'Víťaz s cenami a vyplazeným jazykom' },
      { src: 'img/ba-prize-3.webp', alt: 'Gratulácia pri odovzdávaní tašky s cenami' },
      { src: 'img/ba-deck.webp', alt: 'Jazdec s kreslenou doskou pred bannerom Newspirit' },
      { src: 'img/ba-boards.webp', alt: 'Jazdec s dvoma doskami' },
      { src: 'img/ba-mc.webp', alt: 'Moderátori s mikrofónom' },
    ],
  },
  {
    id: 'zilina-2026',
    name: 'GOSko Žilina',
    city: 'Žilina',
    date: '2026-06-27',
    place: 'Skatepark Solinky (Shred Fest)',
    status: 'done',
    season: 2026,
    sticker: 'round',
    stickerDate: '27.06.2026',
    lat: null, lng: null,
    about: 'Druhé GOSko, tentoraz ako súčasť festivalu Shred Fest v žilinskom skateparku Solinky.',
    results: {},
    awards: [],
    partners: [],
    photos: [],
  },
  {
    id: 'bratislava-2',
    name: 'GOSko #3 Bratislava',
    city: 'Bratislava',
    date: '',
    place: '',
    status: 'next',
    season: 2026,
    sticker: 'next',
    stickerDate: '',
    lat: null, lng: null,
    about: 'Pilot sezóny 2026/27 a štart všetkého, čo príde v roku 2027. Plánujeme 14. alebo 21. novembra 2026, presný dátum a miesto zverejníme na Instagrame. Zaregistruj sa a dáme ti vedieť medzi prvými.',
    when: '14. alebo 21. 11. 2026',
    registration: true,
    results: {},
    awards: [],
    partners: [],
    photos: [],
  },
];

/* Partneri. Voliteľné polia (doplníš, až keď ich máš od partnera, nič si nevymýšľame):
     logo:  'img/partners/redbull.svg'   (SVG alebo PNG na priehľadnom pozadí)
     url:   'https://…'                   (web partnera)
     about: 'Krátky text o partnerovi'    (keď je vyplnený, partner dostane vlastnú stránku)
   Kým polia chýbajú, partner sa ukáže len ako text s odkazom na Instagram. */
export const PARTNERS = {
  redbull: { name: 'Red Bull', instagram: 'redbullsk' },
  '3style': { name: '3Style Academy', instagram: '3styleacademy.eu' },
  newspirit: { name: 'Newspirit', instagram: 'newspirit.sk' },
  tysomaru: { name: 'Ty Somaru', instagram: 'ty_somaru' },
  studnica: { name: 'Studnica hypotéz', instagram: 'studnicahypotez' },
};

/* Stránka pre partnerov */
export const FACTS = [
  { num: '2', label: 'odjazdené eventy: Bratislava 31. 5. a Žilina 27. 6. 2026' },
  { num: '19 000+', label: 'zobrazení na Instagrame (5 príspevkov @g.o.s.ko)' },
  { num: '6 826', label: 'zobrazení plagátu GOSko Bratislava' },
  { num: '11', label: 'partnerov a spolupracovníkov, od Red Bullu po mesto Žilina' },
  { num: '1 811', label: 'účtov oslovil jeden spoločný post s výsledkami' },
];

/* Plán sezóny (verejná verzia bez presných miest na rok 2027) */
export const PLAN = [
  { when: 'Nov 2026', title: 'Pilot', place: 'Bratislava', note: 'GOSko #3, 14. alebo 21. 11.' },
  { when: '2027', title: 'Stop 1', place: 'krajské mesto' },
  { when: '2027', title: 'Stop 2', place: 'krajské mesto' },
  { when: '2027', title: 'Stop 3', place: 'krajské mesto' },
  { when: '2027 · CZ', title: 'Česko', place: 'prvý stop v Česku', dark: true },
  { when: '2027', title: 'Finále', place: 'oznámime čoskoro', red: true },
];
/* Balíčky bez cien. Cena na vyžiadanie. */
export const PACKAGES = [
  { name: 'Presenting partner', text: 'Celá séria nesie tvoje meno.',
    gets: ['Názov „GOSko presented by…“ na rankingu, webe aj vo videách', 'Vlastná aktivácia na každom evente', 'Exkluzivita v tvojej kategórii'] },
  { name: 'Partner kategórie', text: 'Tvoja značka pri konkrétnej časti programu.',
    gets: ['Vlastná kategória alebo cena, napr. Junior alebo Best Trick', 'Logo v obsahu, ktorý z nej vznikne', 'Aktivácia na mieste'] },
  { name: 'Partner pilotu', text: 'Novembrový pilot v Bratislave, štart celej sezóny.',
    gets: ['Partner novembrového eventu', 'Uvedenie na webe a sieťach', 'Priestor na stánok'] },
  { name: 'Lokálny partner', text: 'Jedna zastávka v tvojom meste alebo priestore.',
    gets: ['Partner konkrétneho eventu', 'Priestor, povolenia alebo vecné plnenie', 'Uvedenie na webe a v komunikácii eventu'] },
];

/* Shop: zatiaľ len ukážka, zbiera záujem. */
export const PRODUCTS = [
  { id: 'sticker', name: 'Nálepka GOSko', img: 'img/sticker.webp', note: 'Presne tá, čo visí po meste.', sizes: [] },
  { id: 'tee', name: 'Tričko GOSko', mock: 'tee', note: 'Tričko s logom GOSko.', sizes: ['S', 'M', 'L', 'XL'] },
  { id: 'hoodie', name: 'Mikina GOSko', mock: 'hoodie', note: 'Mikina s logom GOSko.', sizes: ['S', 'M', 'L', 'XL'] },
  { id: 'deck', name: 'Doska GOSko', mock: 'deck', note: 'Doska s logom GOSko.', sizes: ['8.0"', '8.25"', '8.5"'] },
];

/* =====================================================================
   SEZÓNY, PRAVIDLÁ, FAQ, SÚKROMIE
   ===================================================================== */

/* Sezóny. Keď sezóna skončí, daj finished: true a jej šampióni sa ukážu v Sieni slávy.
   Pri novej sezóne zmeň SITE.season hore a pridaj riadok sem. */
export const SEASONS = {
  2026: { finished: false },
};

/* Pravidlá sezóny a cesta do finále. Kým je finale: null, sekcia „Cesta do finále“ sa nezobrazuje.
   Vyplň, až keď pravidlá naozaj platia:
     finale: { slots: 16, eventsLeft: 1, name: 'Finále' }
       slots      = koľko jazdcov z rebríčka postupuje do finále
       eventsLeft = koľko bodovaných eventov ešte zostáva pred finále (nechaj prázdne, spočíta sa z eventov „ďalší stop“)
     countBest: 2   = do rebríčka sa rátajú len N najlepších výsledkov jazdca (null = rátajú sa všetky) */
export const SEASON_RULES = {
  finale: null,
  countBest: null,
};

/* Pravidlá a FAQ. Kým sú prázdne, stránka Pravidlá sa v menu nezobrazuje.
   RULES: [{ title: 'Ako sa hrá', text: 'Text. Prázdny riadok = nový odstavec.' }]
   FAQ:   [{ q: 'Otázka?', a: 'Odpoveď.' }]
   Pošli mi ich a doplním ich presne tak, ako ich napíšeš. */
export const RULES = [];
export const FAQ = [];

/* Známe skateparky na mape. Poloha je orientačná: ak pin nesedí, v Google Maps podrž prst na
   presnom mieste, skopíruj súradnice a prepíš lat a lng. Navigácia hľadá park podľa názvu a mesta. */
export const SKATEPARKS = [
  { name: 'Skatepark Janka Kráľa (pod Mostom SNP)', city: 'Bratislava', area: 'Petržalka', lat: 48.1371, lng: 17.1050, about: 'Jeden z najväčších skateparkov na Slovensku, 1 350 m² pod mostom, svieti aj večer.', tag: 'betón' },
  { name: 'Skatepark Rača (Urbanpark Tbiliská)', city: 'Bratislava', area: 'Rača', lat: 48.2049, lng: 17.1516, about: 'Domovský park prvého GOSka (31. 5. 2026).', tag: 'GOSko' },
  { name: 'Hangair', city: 'Bratislava', area: 'Vajnory', lat: 48.2045, lng: 17.1890, about: 'Akadémia akčných športov. Vnútorný park s minirampou a vonkajší betónový park.', tag: 'indoor' },
  { name: 'Skatepark Solinky', city: 'Žilina', area: 'Solinky', lat: 49.2160, lng: 18.7650, about: 'Tu bolo druhé GOSko na Shred Feste (27. 6. 2026).', tag: 'GOSko' },
  { name: 'Skatepark Liptovský Mikuláš', city: 'Liptovský Mikuláš', area: '', lat: 49.0832, lng: 19.6131, about: 'Nový betónový park (860 m²), otvorený v roku 2025.', tag: 'betón' },
  { name: 'Skatepark KVP', city: 'Košice', area: 'Sídlisko KVP', lat: 48.7166, lng: 21.2145, about: 'Moderný park na Moskovskej triede, tu sa jazdili Majstrovstvá SR 2026.', tag: 'betón' },
  { name: 'Sketon Skatepark', city: 'Sládkovičovo', area: '', lat: 48.2003, lng: 17.6371, about: 'Domov Cube Skate Day.', tag: 'betón' },
];

/* Profily jazdcov (všetko voliteľné). Kľúč je meno bez diakritiky, malými písmenami, s pomlčkami.
     photo:     'img/riders/sebastian.webp'  (štvorcová fotka, aspoň 300 × 300 px; kým chýba, ukáže sa avatar s iniciálami)
     instagram: 'prezyvka'
     city:      'Bratislava'
     look:      { deck: 'black', grip: 'ghost', wheels: 'red', trucks: 'black' }   (vzhľad dosky v rebríčku)
                deck: cream | black | red | ghosts | poster, grip: black | ghost | red,
                wheels: cream | red | black, trucks: silver | black | red
   Príklad:
     'sebastian-kozmann': { instagram: 'sebo', city: 'Bratislava', look: { deck: 'black', wheels: 'red' } }, */
export const RIDERS = {};

/* Súkromie jazdcov. Predvolene sa mená ukazujú celé (rovnako ako na Instagrame).
   Ak si rodič alebo jazdec praje skrátené meno, pridaj riadok:
     'marek-kupkovic': 'initial'    ->  na webe sa ukáže „Marek K.“
   Kľúč je meno bez diakritiky malými písmenami, slová spojené pomlčkou. */
export const RIDER_PRIVACY = {};
