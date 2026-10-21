# საწყისი მასალა — SHA-256 (მფლობელის საქაღალდე)

საქაღალდე: `C:\Users\davit\Desktop\georgian expert AI` · გამოთვლილია მფლობელის კომპიუტერზე 2026-10-21 (`sha256sum`). ფაილები არ შეცვლილა და არ წაშლილა. release არქივში არცერთი არ შედის; ამ ცხრილით მოწმდება, რომ აღდგენისას იგივე ვერსია გამოიყენება.

| SHA-256 | ბაიტი | ფაილი | სტატუსი |
|---|---:|---|---|
| 0c2f28640d3f4656906647147747f1fc65c90f2ebd93bc9733157c2716f3a38d | 18695215 | GMAI_Quality_Defect_Rules_Master_v1.json | ავტორის მასალა; ნორმალიზებული ვერსია repo-შია (authored/quality) |
| acc90d5dd43b6d11d2883cc339c184091dcbfadde77a480e8b811f56a74db40f | 1743963 | GMAI_Quality_Defect_Rules_Master_v1.zip | იგივე, არქივი |
| afbf09a5acdeea1a1d784154e30a43fe3ab9b2596c60d8d2794ba10680ad81af | 38180589 | GMAI_Clinical_Knowledge_L5_v2.zip | მფლობელის პაკეტი; repo-შია (authored/gmai_clinical_v2, public/clinical-v2) |
| 52bf26e2dd03287299602aa7642be03615e6dbd7a852c738c05f90040171b931 | 27021708 | GMAI_Medication_L5_Vercel_Lite.zip | repo-შია (knowledge/medications, 515 ფაილი) |
| cbfad7b1487189df8dde36b58fae7c593ac8b655b410321274ec71cb442423e3 | 1882716 | GMAI_Clinical_Rules_Master_v1.zip | UpToDate-დან წარმოებული — მხოლოდ internal, მფლობელის მიერ იმპორტი; release-ში არ შედის |
| 66f9f57054db57166f627a90ab17f777f57633c9be90ea376181577d3e1bac46 | 32490031 | GMAI_UpToDate_2022_FHIR_R4_Single_Document_Bundle.json | მესამე მხარის მასალა — არ გამოიყენება release-ში |
| dd7b4899fb9b9a1595e2391bd8dbd5f7584d6daa873d4871885e0ae41ccb9ab4 | 272717 | GMAI_UpToDate_L1_L3_Batch_01_15_topics.zip | იგივე |
| 081e65ac849c00095c7f64b6a101f7bfc5b95e73e030c464c3fe283dfb23ac85 | 378275 | GMAI_UpToDate_L1_L3_Batch_02_15_topics.zip | იგივე |
| 7278e667a781159074f648b64499d1ccfff4aa37e7b8bc690e3029394ba46118 | 366136 | GMAI_UpToDate_L1_L3_Batch_03_15_topics.zip | იგივე |
| 90b4806d8289e78b8a99307542f7823c3516398a7875fd2b7471f7abd70f4b66 | 800317 | GMAI_UpToDate_L1_L3_Batch_04_30_topics.zip | იგივე |
| 92330e3ec3613707e6634186b1e6ff7c7feeb23bc65dd9533f239aee0592d8e5 | 2073245 | GMAI_UpToDate_L1_L3_Batch_05_30_topics.zip | იგივე |
| cf67c88a0b904d9cfba993c7f047146d1e4768b3a6798c2c7c2b4b504d049e80 | 66443 | GMAI_UpToDate_L1_L3_Final_Batch_topic_107.zip | იგივე |

## F21 — იმპორტი რეალურ ფაილზე

`GMAI_Quality_Defect_Rules_Master_v1.json` (sha256 0c2f2864…a38d), `APP_TIER=internal EMBEDDING_PROVIDER=hash`, ცარიელი SQLite, 2026-10-21:

- status SUCCESS; quality rules 4482; audit questions 128; taxonomy nodes 160;
- taxonomy parent links 205; unresolved 0; BROKEN_TAXONOMY_PARENT warnings 0 (აუდიტამდე: 124);
- quarantined 0.
