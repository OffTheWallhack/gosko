-- =====================================================================
-- Seed: štartovacie spoty herného sveta v Bratislave. Po migrácii 010.
-- POZOR: súradnice sú PRIBLIŽNÉ (podľa štvrte a známeho miesta), nie odmerané.
-- Každý spot má needs_verification = true; pred spustením hry ich treba overiť
-- na mape alebo na mieste a potom nastaviť needs_verification = false.
-- Opakovateľné: pevné id, existujúci spot sa nemení (úpravy admina ostanú).
-- =====================================================================
begin;

insert into public.spots (id, user_id, name, city, kind, description, lat, lng, approved, needs_verification) values
  ('5b0a0000-0000-4000-8000-000000000001', null, 'Námestie slobody', 'Bratislava', 'street',
   'Klasický street spot, schody a lavice. Súradnice overiť.', 48.1526, 17.1107, true, true),
  ('5b0a0000-0000-4000-8000-000000000002', null, 'Eurovea nábrežie', 'Bratislava', 'street',
   'Lavice a hrany pri Dunaji. Súradnice overiť.', 48.1405, 17.1243, true, true),
  ('5b0a0000-0000-4000-8000-000000000003', null, 'Námestie SNP', 'Bratislava', 'street',
   'Hladká dlažba v centre. Súradnice overiť.', 48.1442, 17.1118, true, true),
  ('5b0a0000-0000-4000-8000-000000000004', null, 'Pod Mostom SNP (Petržalka)', 'Bratislava', 'street',
   'Pod mostom na petržalskej strane. Súradnice overiť.', 48.1373, 17.1050, true, true),
  ('5b0a0000-0000-4000-8000-000000000005', null, 'Skatepark Draždiak', 'Bratislava', 'park',
   'Petržalka, pri jazere Veľký Draždiak. Súradnice overiť.', 48.1155, 17.1085, true, true),
  ('5b0a0000-0000-4000-8000-000000000006', null, 'Skatepark Ružinov', 'Bratislava', 'park',
   'Ružinov, oblasť Ostredky. Súradnice overiť.', 48.1565, 17.1640, true, true),
  ('5b0a0000-0000-4000-8000-000000000007', null, 'Skatepark Pekná cesta (Rača)', 'Bratislava', 'park',
   'Rača, Pekná cesta. Súradnice overiť.', 48.2050, 17.1520, true, true),
  ('5b0a0000-0000-4000-8000-000000000008', null, 'Skatepark Lamač', 'Bratislava', 'park',
   'Lamač, pri sídlisku. Súradnice overiť.', 48.1905, 17.0510, true, true),
  ('5b0a0000-0000-4000-8000-000000000009', null, 'Skatepark Dúbravka', 'Bratislava', 'park',
   'Dúbravka, pri sídlisku. Súradnice overiť.', 48.1835, 17.0430, true, true),
  ('5b0a0000-0000-4000-8000-00000000000a', null, 'Skatepark Devínska Nová Ves', 'Bratislava', 'park',
   'Devínska Nová Ves. Súradnice overiť.', 48.2095, 16.9805, true, true),
  ('5b0a0000-0000-4000-8000-00000000000b', null, 'Kuchajda', 'Bratislava', 'park',
   'Nové Mesto, areál pri jazere Kuchajda. Súradnice overiť.', 48.1700, 17.1360, true, true)
on conflict (id) do nothing;

commit;
