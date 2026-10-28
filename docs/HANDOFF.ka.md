# GMAI — როგორ გავაგრძელოთ მუშაობა სხვა AI-ით (GPT / Astra, Gemini, Claude)

ყველა წესი, დიზაინის პრინციპი და ინფრასტრუქტურა ჩაწერილია საცავის ფაილში **`AGENTS.md`**.
GPT-ის Codex, Gemini CLI და Claude Code ამ ფაილს **ავტომატურად კითხულობენ**, როცა საცავს ხსნიან
(`GEMINI.md` და `CLAUDE.md` იმავე ფაილზე მიუთითებენ). ასე რომ, კონტექსტი არ იკარგება, რომელი AI-ც არ უნდა აიღოთ.

## სად რა არის

| რა | სად |
|---|---|
| კოდი | https://github.com/datobarabadzee-lgtm/GMAI (ფილიალი `main`) |
| საიტი | https://gmai-29267867738.europe-west1.run.app |
| სერვერი | Google Cloud → Cloud Run → სერვისი `gmai` (europe-west1, პროექტი „My First Project“) |
| გასაღებები და მოდელები | Cloud Run → gmai → Edit & deploy new revision → Variables & Secrets (კოდში არასდროს!) |
| განახლება | `main`-ზე ატვირთული ცვლილება 6–10 წუთში თავად ქვეყნდება საიტზე |

## როგორ მივცე დავალება (მაგ. Astra-ს Codex-ში ან Gemini-ს)

1. მიეცით წვდომა GitHub-ის საცავზე `datobarabadzee-lgtm/GMAI` (Codex: „Connect GitHub“ → აირჩიეთ საცავი).
2. **API გასაღები ან პაროლი ჩატში არასდროს ჩაწეროთ.** AI-ს ის არ სჭირდება კოდის შესაცვლელად.
3. ჩასვით ეს ტექსტი და ბოლოში დაამატეთ თქვენი დავალება:

```
You are working on the GMAI repository (github.com/datobarabadzee-lgtm/GMAI).
Before anything else, read AGENTS.md completely and follow it strictly.
Key points: do not change the existing design; all UI text in Georgian; every clinical
number must come from a primary source you actually opened (add it to sources.json);
no secrets in the repo; deterministic functions with independently computed tests.
Work on a new branch. Run typecheck, lint, all tests and the public build — all must pass.
Do NOT push to main: open a pull request and explain the change to me in Georgian,
simply, with screenshots of the changed screens (mobile and desktop).

My task:
<აქ დაწერეთ, რა გინდათ — ქართულად შეიძლება>
```

4. **AI-ს `main`-ში პირდაპირ ატვირთვის უფლება არ მისცეთ.** სთხოვეთ Pull Request (ზემოთ ასეა დაწერილი).
   ჯერ თავად ნახავთ, რა შეიცვალა, მერე დააჭერთ **Merge**-ს GitHub-ზე, და ცვლილება საიტზე 6–10 წუთში გამოჩნდება.
5. სამედიცინო შინაარსი (ციფრი, დოზა, ვადა) ყოველთვის თქვენ დაადასტურეთ — წყაროს ბმულით.

## თუ რამე გაფუჭდა

- **სწრაფი დაბრუნება:** Cloud Run → gmai → **Revisions** → აირჩიეთ წინა (მწვანე) ვერსია → **Manage traffic** → 100% → Save.
  საიტი 1 წუთში ძველ ვერსიას დაუბრუნდება.
- ან GitHub-ზე: ცუდი Pull Request → **Revert**.

## ღია საკითხები

- OpenAI-ის გასაღები ერთხელ ჩატში ჩაიწერა — სჯობს შეიცვალოს (platform.openai.com/api-keys → ახალი → Cloud Run-ში ჩასმა → ძველის წაშლა).
- საკუთარი `.ge` დომენი.
- სახელმწიფო სკრინინგ-პროგრამების დეტალები პრევენციის გეგმისთვის (თქვენგან).
- ცოდნის ბაზაში ხშირი თემების შევსება (მაგ. ჰიპერტენზიის პირველი რიგის მკურნალობა).
