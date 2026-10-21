/**
 * npm run eval:retrieval — recall@5 of clinical-v2 search on synthetic
 * paraphrases (audit F12). Writes docs/RETRIEVAL_EVAL.md. Measures the search
 * as it is (lexical + lexicon + hashed n-grams); nothing is tuned to the set.
 */
import fs from 'node:fs';
import path from 'node:path';
import { clinicalV2Search } from '../src/kb/clinical-v2-search';

type Case = { target: string; exact: string; paraphrase: string; english: string; lay: string };
const VARIANTS = ['exact', 'paraphrase', 'english', 'lay'] as const;

export async function evalRetrieval() {
  const { cases } = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/tests/fixtures/retrieval-paraphrases.json'), 'utf8')) as { cases: Case[] };
  const rows: { target: string; variant: string; query: string; hit: boolean; rank: number | null }[] = [];
  for (const c of cases) {
    for (const v of VARIANTS) {
      const { hits } = await clinicalV2Search(c[v], { limit: 5 });
      const rank = hits.findIndex((h) => h.topic_title.startsWith(c.target.split(' (')[0]));
      rows.push({ target: c.target, variant: v, query: c[v], hit: rank >= 0, rank: rank >= 0 ? rank + 1 : null });
    }
  }
  const recall = Object.fromEntries(VARIANTS.map((v) => [v, rows.filter((r) => r.variant === v && r.hit).length / cases.length]));
  return { rows, recall, n: cases.length };
}

if (process.argv[1]?.endsWith('eval-retrieval.ts')) {
  void evalRetrieval().then(({ rows, recall, n }) => {
    const md = [
      '# ძიების შეფასება — პერიფრაზები (F12)',
      '',
      `კოლექცია: gmai_clinical_v2 · ${n} სინთეზური შემთხვევა · მეტრიკა: recall@5 (სამიზნე თემა პირველ 5 შედეგში). ძიება: ლექსიკური + ლექსიკონი + hash n-gram (ნასწავლი ემბედინგი არ გამოიყენება).`,
      '',
      '| ვარიანტი | recall@5 |',
      '|---|---|',
      ...VARIANTS.map((v) => `| ${v} | ${(recall[v] * 100).toFixed(0)}% |`),
      '',
      '| სამიზნე | ვარიანტი | მოთხოვნა | რანგი |',
      '|---|---|---|---|',
      ...rows.map((r) => `| ${r.target} | ${r.variant} | ${r.query} | ${r.rank ?? '—'} |`),
      '',
      `დასკვნა: ზუსტი ქართული ტერმინი — ${(recall.exact * 100).toFixed(0)}%, ინგლისური ეკვივალენტი — ${(recall.english * 100).toFixed(0)}%. პერიფრაზისა (${(recall.paraphrase * 100).toFixed(0)}%) და ყოფითი აღწერის (${(recall.lay * 100).toFixed(0)}%) ნაწილი, რომელიც საკვანძო ტერმინს არ შეიცავს, ვერ იძებნება. ეს ლექსიკური ძიების ცნობილი შეზღუდვაა და UI-ში ასეა აღწერილი; ნასწავლი ემბედინგი ჩართული არ არის (ფასიანი გამოძახება — მფლობელის გადაწყვეტილება).`,
    ].join('\n');
    fs.writeFileSync(path.join(process.cwd(), 'docs/RETRIEVAL_EVAL.md'), md + '\n');
    console.log(JSON.stringify(recall));
  });
}
