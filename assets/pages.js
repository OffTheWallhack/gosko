/* Texty stránok #/rebricek/pravidla (Rebríčkový poriadok) a #/sukromie (zásady ochrany osobných údajov).
   Bez DOM, testujú sa v Node. Tabuľka bodov sa generuje z POINTS v data.js, takže vždy sedí s rebríčkom.
   Sekcia = { title, paras?: [text], items?: [text], table?: pointsTable(), draft?: true }.
   draft = návrh, ktorý ešte musí skontrolovať organizátor alebo právnik (na stránke má štítok). */

/* Riadky tabuľky bodov: { from, to, label, points }. POINTS = [{ upTo, points }] zoradené podľa upTo. */
export function pointsTable(points) {
  let from = 1;
  return points.map(p => {
    const to = p.upTo;
    const label = !Number.isFinite(to) ? `${from}. miesto a horšie (účasť)` : to === from ? `${from}. miesto` : `${from}. až ${to}. miesto`;
    const row = { from, to, label, points: p.points };
    from = Number.isFinite(to) ? to + 1 : from;
    return row;
  });
}

/* Rebríčkový poriadok GOSko Ranking. rules = SEASON_RULES, categories = CATEGORIES z data.js. */
export function rankingRules({ points, rules = {}, categories = [] }) {
  const best = rules.countBest;
  return [
    { title: 'GOSko Ranking', paras: [
      'GOSko Ranking je rebríček jazdcov série Game of S.K.A.T.E. GOSko. Počíta sa zo zapísaných výsledkov eventov GOSko, nie z iných súťaží.',
      'Nie je to oficiálny rebríček národného športového zväzu ani World Skate a neudeľuje tituly majstra Slovenska.',
    ] },
    { title: 'Body za umiestnenie', paras: ['Body dostane každý jazdec, ktorý sa zúčastnil súboja, podľa konečného umiestnenia v kategórii. Body sa rátajú len za Game of S.K.A.T.E., ocenenia ako Best Trick body nemajú.'],
      table: pointsTable(points) },
    { title: 'Sezóna a všetky časy', paras: [
      best ? `Do rebríčka sezóny sa rátajú ${best} najlepšie výsledky jazdca v danej kategórii.` : 'Do rebríčka sezóny sa rátajú všetky výsledky jazdca v danej kategórii.',
      'Rebríček všetkých čias sčíta body zo všetkých sezón. Pravidlo o najlepších výsledkoch platí v každej sezóne zvlášť.',
      'Body z rôznych kategórií sa nesčítavajú. Jazdec, ktorý jazdil v dvoch kategóriách, je v oboch rebríčkoch osobitne.',
    ] },
    { title: 'Kategórie', items: categories.map(c => (c.note ? `${c.name}: ${c.note}.` : `${c.name}.`)),
      paras: ['O kategórii U16 rozhoduje vek jazdca v deň eventu, nie voľba vo formulári. Babská kategória je voľba pre jazdkyne od 16 rokov, mladšie jazdkyne jazdia v U16.'] },
    { title: 'Krajiny', paras: [
      'Okrem celkového rebríčka sú aj rebríčky podľa krajiny jazdca: Slovensko a Česko. Krajinu si jazdec vyberie pri registrácii.',
      'Jazdec z Česka je v rebríčku Česka aj v celkovom rebríčku. Staršie výsledky zapísané len menom majú krajinu podľa miesta eventu.',
    ] },
    { title: 'Rovnosť bodov', items: [
      'Pri rovnosti bodov je vyššie jazdec s viac výhrami (1. miestami).',
      'Ak je aj počet výhier rovnaký, rozhoduje najlepšie umiestnenie.',
      'Ak sa jazdci nelíšia ani tým, zoradia sa podľa abecedy a majú rovnaký počet bodov.',
    ] },
    { title: 'Jazdec a jeho záznam', paras: [
      'Každý registrovaný jazdec má vlastný profil, takže dvaja jazdci s rovnakým menom sa nepomiešajú. Meno sa zobrazí tak, ako si jazdec vybral pri registrácii: celé, s iniciálou priezviska alebo prezývkou.',
      'Ak jazdec súhlasil (pri jazdcovi do 16 rokov rodič), výsledok sa zapíše aj ako neprenosný záznam na blockchaine. Ten neobsahuje žiadne osobné údaje. Rozhodujúci je vždy záznam v databáze GOSko.',
    ] },
    { title: 'Zmeny a opravy', draft: true, paras: [
      'Chybu vo výsledku nahlás organizátorom do 14 dní od eventu. Opravené výsledky sa prepočítajú v celom rebríčku.',
      'Rebríčkový poriadok môže organizátor zmeniť pred začiatkom sezóny. Zmena počas sezóny platí len vtedy, ak neubližuje jazdcom, ktorí už body majú.',
    ] },
  ];
}

/* Zásady ochrany osobných údajov (návrh, skontroluje právnik). Verzia súhlasu = CONSENT_VERSION na serveri. */
export const PRIVACY_VERSION = '2026-10';
export const PRIVACY = [
  { title: 'Kto spracúva tvoje údaje', draft: true, paras: [
    'Prevádzkovateľom je občianske združenie Slovenská federácia skateboardingu (SFS), keď ho úrad zaregistruje. Dovtedy je prevádzkovateľom organizátor série GOSko. Presné identifikačné údaje doplníme po registrácii združenia.',
    'Kontakt: formulár „Súkromie a odstránenie“ na tejto stránke alebo Instagram @g.o.s.ko.',
  ] },
  { title: 'Aké údaje a prečo', items: [
    'Registrácia na event: meno a priezvisko, dátum narodenia, e-mail, krajina, voliteľne mesto a Instagram. Potrebujeme ich na organizáciu eventu, zaradenie do kategórie a vstupný QR pass (právny základ: plnenie zmluvy o účasti na súťaži).',
    'Dátum narodenia určí kategóriu (U16 podľa veku v deň eventu) a či treba súhlas rodiča.',
    'Výsledky a body: umiestnenie a verejné meno jazdca tak, ako si ho zvolil (celé meno, meno a iniciála alebo prezývka). Výsledky zverejňujeme v rebríčku GOSko Ranking (oprávnený záujem na evidencii výsledkov súťaže).',
    'Fotky a videá z eventu zverejníme len so súhlasom, ktorý si dal pri registrácii. Súhlas môžeš kedykoľvek odvolať.',
    'Odber noviniek len so súhlasom, odhlásiť sa dá kedykoľvek.',
  ] },
  { title: 'Jazdci do 16 rokov', paras: [
    'Ak má jazdec v deň eventu menej ako 16 rokov, registrácia platí až po potvrdení rodiča alebo zákonného zástupcu. Rodičovi pošleme e-mail s odkazom na potvrdenie. Bez potvrdenia meno jazdca nikde verejne neukážeme.',
    'Súhlas s fotkami a so záznamom na blockchaine dáva za jazdca do 16 rokov rodič (§ 15 zákona č. 18/2018 Z. z.).',
  ] },
  { title: 'Blockchain a NFT', paras: [
    'Ak s tým jazdec súhlasí (pri jazdcovi do 16 rokov rodič), účasť a výsledok sa zapíšu ako neprenosný záznam (NFT) na verejnej sieti Base.',
    'Na blockchaine nie je žiadny osobný údaj: žiadne meno, prezývka, dátum narodenia, e-mail ani ich odvodená podoba. Je tam len náhodný identifikátor, event, kategória, umiestnenie a body. Prepojenie identifikátora s tebou je iba v databáze GOSko.',
    'Pri výmaze údajov zmažeme toto prepojenie aj meno v metadátach, takže záznam na blockchaine už nikoho neidentifikuje. Záznam nemá peňažnú hodnotu, nepredáva sa a nedá sa previesť.',
  ] },
  { title: 'Kto ďalší údaje vidí', items: [
    'Supabase (databáza a prihlásenie), Vercel (hosting webu), Resend (odosielanie e-mailov), Cloudflare Turnstile (ochrana formulára pred robotmi).',
    'Údaje nepredávame a neposielame na marketing tretím stranám.',
  ] },
  { title: 'Ako dlho', draft: true, paras: [
    'Registračné údaje uchovávame počas sezóny a 3 roky po nej. Výsledky a body ostávajú v histórii súťaže, kým nepožiadaš o výmaz alebo skrátenie mena.',
  ] },
  { title: 'Tvoje práva', paras: [
    'Máš právo na prístup k údajom, opravu, výmaz, obmedzenie spracúvania, prenosnosť a námietku. Súhlas môžeš kedykoľvek odvolať. Rodič môže tieto práva uplatniť za jazdca do 16 rokov.',
    'Sťažnosť môžeš podať na Úrad na ochranu osobných údajov SR (dataprotection.gov.sk).',
  ] },
];
