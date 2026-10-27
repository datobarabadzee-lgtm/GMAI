#!/usr/bin/env python3
"""Validate GMAI public clinical rules.

usage: python3 tools/validate.py [rules/CLUSTER.json ...]   (default: all)
Exit code 1 if any ERROR. Writes reports/validation.json when run on all files.
"""
import csv, json, re, sys, pathlib
from urllib.parse import urlparse

ROOT = pathlib.Path(__file__).resolve().parent.parent
CLUSTERS = json.load(open(ROOT / "tools/clusters.json"))
TOPICS = {int(r["topic_order"]): r for r in csv.DictReader(open(ROOT / "tools/topic_index.csv"))}

RULE_TYPES = {"diagnosis", "evaluation", "red_flag", "treatment", "dosing", "prevention",
              "monitoring", "referral", "epidemiology"}
POPULATIONS = {"adult", "child", "infant", "adolescent", "pregnancy", "older_adult", "all",
               "immunocompromised"}
UNITS = {
    "mg", "g", "mcg", "ng", "kg", "mL", "L", "IU", "units", "mmol", "mEq",
    "mg/kg", "mg/kg/day", "mg/kg/dose", "mcg/kg", "mL/kg", "mL/kg/h", "units/kg", "IU/kg", "mg/m2",
    "g/day", "mg/day", "mcg/day", "IU/day", "mL/h", "L/day", "mL/day",
    "°C", "min", "h", "day", "week", "month", "year", "times/day", "times/week", "doses",
    "mm", "cm", "mmHg", "%", "bpm", "breaths/min", "kg/m2",
    "mg/dL", "mg/L", "g/dL", "g/L", "mmol/L", "µmol/L", "U/L", "x ULN", "ng/mL", "pg/mL",
    "x10^9/L", "cells/µL", "copies/mL", "mm/h", "mL/min", "mL/min/1.73m2", "T-score", "Z-score",
    "dB", "Hz", "score", "points", "ratio", "count", "label", "age_years", "age_months", "age_days",
    "weeks_gestation", "SD", "HU", "mSv", "mm3", "cases", "per 100000", "%/year",
}
ALLOWED_DOMAINS = [
    "who.int", "cdc.gov", "nice.org.uk", "ecdc.europa.eu", "idsociety.org", "rheumatology.org",
    "eular.org", "escardio.org", "acog.org", "aap.org", "publications.aap.org", "ema.europa.eu",
    "fda.gov", "moh.gov.ge", "ncdc.ge", "matsne.gov.ge", "cochranelibrary.com", "ncbi.nlm.nih.gov",
    "pubmed.ncbi.nlm.nih.gov", "nih.gov", "nhs.uk", "sign.ac.uk", "gov.uk", "paho.org",
    "acpjournals.org", "aafp.org", "entnet.org", "aaaai.org", "acaai.org", "thoracic.org",
    "atsjournals.org", "ersjournals.com", "asco.org", "ascopubs.org", "nccn.org", "esmo.org",
    "hematology.org", "ashpublications.org", "americanheadachesociety.org", "ihs-headache.org",
    "ichd-3.org", "aasld.org", "easl.eu", "gastro.org", "acg.gi.org", "gi.org", "journals.lww.com",
    "academic.oup.com", "nejm.org", "thelancet.com", "bmj.com", "jamanetwork.com", "springer.com",
    "link.springer.com", "wiley.com", "onlinelibrary.wiley.com", "sciencedirect.com",
    "bonehealthandosteoporosis.org", "aace.com", "endocrine.org", "iofbonehealth.org", "osteoporosis.foundation",
    "asas-group.org", "oarsi.org", "aaos.org", "orthoinfo.aaos.org", "aan.com", "acep.org",
    "acr.org", "acsearch.acr.org", "rcpch.ac.uk", "rcog.org.uk", "esccap.org", "unaids.org",
    "hiv.gov", "clinicalinfo.hiv.gov", "eacsociety.org", "bhiva.org", "stoptb.org", "tbcindia.gov.in",
    "msf.org", "medicalguidelines.msf.org", "gtfcc.org", "ilae.org", "nature.com", "frontiersin.org",
    "mdpi.com", "plos.org", "journals.plos.org", "europepmc.org", "dovepress.com", "hopkinsguides.com",
    "asha.org", "aao.org", "ashp.org", "idsa.org", "escmid.org", "ersnet.org", "ers.org",
    "ginasthma.org", "goldcopd.org", "aspergillus.org.uk", "mycology.org", "isth.org", "chestnet.org",
    "journal.chestnet.org", "ahajournals.org", "heart.org", "acc.org", "eanm.org", "rcr.ac.uk",
    "radiopaedia.org", "allergyfoundation.org", "eaaci.org", "euforea.eu", "rhinologyjournal.com",
    "epos2020.com", "aarda.org", "arthritis.org", "versusarthritis.org",
]
BANNED_DOMAINS = ["uptodate.com", "wolterskluwer.com"]
ARMENIAN = re.compile(r"[԰-֏]")
GEORGIAN = re.compile(r"[Ⴀ-ჿ]")
NUM = re.compile(r"(?<![A-Za-zႠ-ჿ\d.,])\d+(?:[.,]\d+)?")

# Conservative ceilings for common drugs: (unit, max single amount) per population group.
DOSE_CEILINGS = {
    ("paracetamol", "mg", "adult"): 1000, ("paracetamol", "mg/kg", "child"): 15,
    ("ibuprofen", "mg", "adult"): 800, ("ibuprofen", "mg/kg", "child"): 10,
    ("amoxicillin", "mg/kg", "child"): 50, ("azithromycin", "mg/kg", "child"): 20,
    ("azithromycin", "g", "adult"): 1, ("azithromycin", "mg", "adult"): 1000,
    ("doxycycline", "mg", "adult"): 300, ("ciprofloxacin", "mg", "adult"): 750,
    ("ceftriaxone", "g", "adult"): 2, ("ceftriaxone", "mg/kg", "child"): 100,
    ("vancomycin", "mg/kg", "adult"): 35, ("vancomycin", "mg/kg", "child"): 20,
    ("rifampicin", "mg/kg", "adult"): 35, ("gentamicin", "mg/kg", "adult"): 7,
    ("streptomycin", "mg/kg", "adult"): 15, ("streptomycin", "g", "adult"): 1,
    ("isoniazid", "mg/kg", "child"): 15, ("isoniazid", "mg", "adult"): 900,
    ("prednisolone", "mg/kg", "child"): 2, ("dexamethasone", "mg/kg", "child"): 0.6,
    ("dexamethasone", "mg", "adult"): 10, ("ivermectin", "mcg/kg", "all"): 400,
    ("praziquantel", "mg/kg", "all"): 75, ("albendazole", "mg", "adult"): 400,
    ("voriconazole", "mg/kg", "adult"): 6, ("enoxaparin", "mg/kg", "adult"): 1.5,
    ("alendronate", "mg", "adult"): 70, ("zoledronic acid", "mg", "adult"): 5,
    ("vitamin d", "IU", "adult"): 4000, ("calcium", "mg", "adult"): 1200,
    ("zinc", "mg", "child"): 20, ("hydroxyurea", "mg/kg/day", "all"): 35,
    ("polyethylene glycol", "g", "adult"): 34, ("loperamide", "mg", "adult"): 4,
}
POP_GROUP = {"adult": "adult", "older_adult": "adult", "pregnancy": "adult", "adolescent": "adult",
             "child": "child", "infant": "child", "all": "all", "immunocompromised": "adult"}


def norm_num(s):
    return float(s.replace(",", "."))


def check_rule(r, cluster, seen, errors, warnings):
    rid = r.get("rule_id", "?")
    def E(m): errors.append(f"{rid}: {m}")
    def W(m): warnings.append(f"{rid}: {m}")

    for f in ["rule_id", "cluster", "topics", "rule_type", "population", "condition_ka",
              "recommendation_ka", "doses", "numeric_values", "sources", "evidence_checked", "status"]:
        if f not in r:
            E(f"missing field {f}")
    if errors and errors[-1].startswith(f"{rid}: missing"):
        return
    if not re.fullmatch(rf"PUB-{cluster}-\d{{3}}", rid):
        E("rule_id must be PUB-<CLUSTER>-NNN")
    if rid in seen:
        E("duplicate rule_id")
    seen.add(rid)
    if r["cluster"] != cluster:
        E("cluster field mismatch")
    for t in r["topics"]:
        if t not in CLUSTERS[cluster]["topics"]:
            E(f"topic {t} not in cluster {cluster}")
    if r["rule_type"] not in RULE_TYPES:
        E(f"bad rule_type {r['rule_type']}")
    if r["population"] not in POPULATIONS:
        E(f"bad population {r['population']}")
    if r["status"] != "CLINICAL_REVIEW_REQUIRED":
        E("status must be CLINICAL_REVIEW_REQUIRED")

    text = r["condition_ka"] + " " + r["recommendation_ka"] + " " + " ".join(r.get("red_flags_ka", []))
    if ARMENIAN.search(text):
        E("Armenian characters in text")
    for f in ("condition_ka", "recommendation_ka"):
        s = r[f]
        geo = len(GEORGIAN.findall(s)); lat = len(re.findall(r"[A-Za-z]", s))
        if geo == 0 or geo < lat:
            E(f"{f} is not predominantly Georgian")
    if len(r["recommendation_ka"]) < 25:
        W("recommendation_ka very short")

    # numbers in text must be backed by structured values
    structured = set()
    for d in r["doses"]:
        for k in ("drug", "amount", "unit", "route", "frequency", "population"):
            if k not in d:
                E(f"dose missing {k}")
        if d.get("unit") not in UNITS:
            E(f"dose unit not allowed: {d.get('unit')}")
        if d.get("max_unit") not in (None, *UNITS):
            E(f"max_unit not allowed: {d.get('max_unit')}")
        for k in ("amount", "max_amount"):
            v = d.get(k)
            if v is not None:
                if not isinstance(v, (int, float)) or v <= 0:
                    E(f"dose {k} must be positive number: {v}")
                else:
                    structured.add(float(v))
        key = (str(d.get("drug", "")).lower(), d.get("unit"), POP_GROUP.get(d.get("population"), "all"))
        lim = DOSE_CEILINGS.get(key) or DOSE_CEILINGS.get((key[0], key[1], "all"))
        if lim is not None and isinstance(d.get("amount"), (int, float)) and d["amount"] > lim:
            E(f"dose {d['drug']} {d['amount']} {d['unit']} exceeds ceiling {lim} ({key[2]})")
    for n in r["numeric_values"]:
        if n.get("unit") not in UNITS:
            E(f"numeric unit not allowed: {n.get('unit')}")
        if not isinstance(n.get("value"), (int, float)):
            E(f"numeric value not a number: {n.get('value')}")
        else:
            structured.add(float(n["value"]))
        if not n.get("meaning_ka"):
            E("numeric_values item missing meaning_ka")
    for m in NUM.findall(r["recommendation_ka"] + " " + r["condition_ka"]):
        if norm_num(m) not in structured:
            E(f"number '{m}' in text has no structured value (doses/numeric_values)")

    if not r["sources"]:
        E("no sources")
    for s in r["sources"]:
        for k in ("org", "title", "year", "url", "type", "supports"):
            if not s.get(k):
                E(f"source missing {k}")
        url = s.get("url", "")
        host = urlparse(url).hostname or ""
        if not url.startswith("https://"):
            E(f"source url must be https: {url}")
        if any(host == b or host.endswith("." + b) for b in BANNED_DOMAINS):
            E(f"banned source domain {host}")
        elif not any(host == a or host.endswith("." + a) for a in ALLOWED_DOMAINS):
            W(f"source domain not on allowlist: {host}")
        y = s.get("year")
        if isinstance(y, int):
            if y < 2018 and "current" not in s.get("supports", "").lower():
                E(f"source year {y} < 2018 without 'current edition' note")
            if y > 2026:
                E(f"source year {y} in the future")


def main(paths):
    full = not paths
    if full:
        paths = sorted((ROOT / "rules").glob("*.json"))
    errors, warnings, seen = [], [], set()
    coverage = {t: 0 for t in TOPICS}
    counts = {}
    for p in map(pathlib.Path, paths):
        cluster = p.stem
        if cluster not in CLUSTERS:
            errors.append(f"{p.name}: unknown cluster"); continue
        try:
            rules = json.load(open(p))
        except Exception as e:
            errors.append(f"{p.name}: invalid JSON: {e}"); continue
        counts[cluster] = len(rules)
        for r in rules:
            check_rule(r, cluster, seen, errors, warnings)
            for t in r.get("topics", []):
                if t in coverage:
                    coverage[t] += 1
    checked_topics = [t for c in counts for t in CLUSTERS[c]["topics"]]
    for t in checked_topics:
        if coverage[t] < 3:
            warnings.append(f"topic {t} ({TOPICS[t]['title']}) has only {coverage[t]} rules")
    if full:
        missing = [c for c in CLUSTERS if c not in counts]
        for c in missing:
            errors.append(f"cluster {c} has no rules file")
        (ROOT / "reports").mkdir(exist_ok=True)
        json.dump({"rules": sum(counts.values()), "per_cluster": counts,
                   "topic_coverage": {t: coverage[t] for t in sorted(coverage)},
                   "errors": errors, "warnings": warnings},
                  open(ROOT / "reports/validation.json", "w"), ensure_ascii=False, indent=1)
    print(f"files={len(counts)} rules={sum(counts.values())} errors={len(errors)} warnings={len(warnings)}")
    for m in errors[:200]:
        print("ERROR", m)
    for m in warnings[:100]:
        print("WARN ", m)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
