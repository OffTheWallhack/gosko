# Čo pribudlo (november 2026)

Všetko sa upravuje v `data.js`, kód netreba meniť.

## Triky (`/triky`)
- **Trik dňa**: mení sa sám každý deň a prejde všetky triky, kým sa nejaký zopakuje. Ukáže sa aj kartou na úvodke.
- **Hádž trik**: náhodný trik podľa obtiažnosti, plus počítadlo písmen S.K.A.T.E. pre 2 až 6 hráčov.
- **Slovník trikov**: hľadanie a filter podľa obtiažnosti.
- Úprava: `TRICKS` (názov, `level` = zaklad / stredne / tazke, `how`, nepovinné `tip`), `TRICK_LEVELS` (názvy úrovní), `TRICKS_PAGE` (texty stránky).
- Vypnutie: `TRICKS_PAGE.enabled = false`. Zmizne stránka, karta na úvodke aj odkazy.

## Vyhľadávanie
- Otvoríš ho klávesom `/` alebo `Ctrl+K` (na Macu `Cmd+K`), lupou v hornej lište (počítač) alebo tlačidlom „Hľadať na webe“ v menu (telefón).
- Hľadá v stránkach, eventoch, jazdcoch, crew, partneroch, parkoch a trikoch. Bez diakritiky, na veľkosti písmen nezáleží.
- Nová položka sa objaví sama, keď ju pridáš do `EVENTS`, `CREWS`, `PARTNERS`, `SKATEPARKS` alebo `TRICKS`.

## Technické
- Logika bez DOM: `assets/tricks.js`, `assets/search.js`. Rozhranie: `assets/extras.js`. Testy: `tests/unit/tricks.test.js`.
- Statická stránka `/triky` sa vygeneruje po zlúčení cez GitHub Action (`scripts/build-pages.mjs`).
