# GMAI public clinical rules: format (v1)

One file per cluster: `rules/<CLUSTER>.json`, a JSON array of rule objects.
Clusters and the topics they cover are listed in `tools/clusters.json`.
Topic numbers refer to `tools/topic_index.csv` (`topic_order`). The 2022 corpus serves only as the topic list.
No text, structure or wording may be copied from it.

## Rule object

```json
{
  "rule_id": "PUB-CHOL-001",
  "cluster": "CHOL",
  "topics": [7],
  "rule_type": "treatment",
  "population": "all",
  "condition_ka": "ქოლერის ეჭვი ან დადასტურება, მძიმე დეჰიდრატაცია",
  "recommendation_ka": "დაუყოვნებლივ ინტრავენური რინგერ-ლაქტატი: 100 მლ/კგ ...",
  "doses": [
    {"drug": "doxycycline", "amount": 300, "unit": "mg", "route": "PO",
     "frequency": "single dose", "population": "adult", "max_amount": null, "max_unit": null}
  ],
  "numeric_values": [
    {"value": 100, "unit": "mL/kg", "meaning_ka": "IV სითხის მოცულობა მძიმე დეჰიდრატაციისას"}
  ],
  "red_flags_ka": ["..."],
  "sources": [
    {"org": "WHO", "title": "...", "year": 2024,
     "url": "https://www.who.int/...", "type": "guideline",
     "supports": "short English paraphrase of what this source states that backs the numbers"}
  ],
  "evidence_checked": "2026-10-27",
  "status": "CLINICAL_REVIEW_REQUIRED"
}
```

### Field rules
- `rule_id`: `PUB-<CLUSTER>-NNN`, unique.
- `topics`: one or more topic numbers, each belonging to this cluster.
- `rule_type`: one of `diagnosis, evaluation, red_flag, treatment, dosing, prevention, monitoring, referral, epidemiology`.
- `population`: one of `adult, child, infant, adolescent, pregnancy, older_adult, all, immunocompromised`.
- `condition_ka` and `recommendation_ka`: Georgian clinical text, independently written.
- **Every number that appears in `recommendation_ka`** must also appear in `doses[].amount`, `doses[].max_amount` or `numeric_values[].value`. Numbers that are part of a name (e.g. COVID-19, IL-6) go in `numeric_values` with unit `"label"`.
- `doses[].unit` and `numeric_values[].unit` come from the controlled list in `validate.py` (`UNITS`).
- `sources`: at least one source. It must be primary or authoritative (WHO, CDC, NICE, ECDC, IDSA, ACR, EULAR, ESC, ACOG, AAP, EMA, FDA, the Georgian MoH/NCDC, Cochrane, or a peer-reviewed guideline on PubMed/PMC). The year must be 2018 or later unless it is still the current edition, which must be noted in `supports`. **uptodate.com is not allowed.**
- `status`: always `CLINICAL_REVIEW_REQUIRED` until a physician signs off.
