# Brief: writing GMAI public clinical rules

Project root: `/home/user/gmai_public_rules`

Goal: for each cluster you were assigned, write `rules/<CLUSTER>.json`. It holds independently written clinical rules
in Georgian, drawn from **current primary sources**, and every rule cites its sources. The platform is
Georgian Expert Medical AI. A physician reviews every rule before release.

## Read first
- `tools/SCHEMA.md`: the format, which is mandatory.
- `tools/clusters.json`: the topic numbers for each cluster.
- `tools/topic_index.csv`: the topic titles (`topic_order` = topic number).
- `rules/CHOL.json`: a finished example to copy the style, depth and source format from.

## Hard rules
1. **Do not open or read anything under `/home/user/src`** (the 2022 UpToDate-derived corpus). You may use only the topic
   titles in `tools/topic_index.csv`. uptodate.com must never appear as a source.
2. **Round 2: the network is now open.** Read primary documents directly with **WebFetch** (who.int, cdc.gov, nice.org.uk,
   pmc.ncbi.nlm.nih.gov, idsociety.org, etc.) and confirm every number against the document text. WebSearch shares a
   budget of 200 calls per turn across all agents, so use **at most 8 WebSearch calls in total**, and only to find a URL
   you cannot guess. Prefer known landing pages (e.g. NICE guideline pages, the CDC Yellow Book, WHO fact sheets and
   guideline pages, PMC full-text guideline articles).
   **WebFetch fails with DNS errors here, but `curl -sL` through the proxy works.** Download pages and PDFs with
   curl into your own folder, convert them to text (`pdftotext` for PDFs, or Python's html.parser for HTML), and grep
   or read the text. Some publisher sites (annalsofoncology.org, gut.bmj.com) return 403; try the PMC or Europe PMC
   full text instead (`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=...&format=json`, then
   `.../rest/PMCxxxx/fullTextXML`). Bash occasionally reports "no verdict"; if so, just retry.
   Write rules in **small pieces**, e.g. a Python script that adds 3–4 rules per run to a list and dumps the JSON, so
   that one interrupted output never leaves a half-written `rules/*.json`. Write to a temp file first and move it into
   `rules/` only after it validates.
   Keep helper scripts in your own folder: `/tmp/claude-0/-home-user/7dbce7f2-1137-56c6-8098-497f3b04377f/scratchpad/r2_<your clusters>/`.
3. **Never invent a source or URL.** Cite only URLs that came back in your search results, or official landing pages you
   are certain exist. If a search did not confirm a number (a dose, a threshold or a duration), leave that rule out rather
   than guess. The `supports` field must paraphrase what that source says.
4. Prefer the newest edition: 2020–2026. Older editions are acceptable only if they are still current, and you must
   write "current edition" in `supports`.
5. Georgian text must be professional clinical Georgian. Drug names go in Georgian transliteration (e.g. „დოქსიციკლინი“),
   Latin script only for organism names and abbreviations. No Armenian characters.
6. **Every number in `condition_ka` / `recommendation_ka` must appear in `doses` or `numeric_values`** (see SCHEMA). Ranges
   like "2–4" mean both numbers are needed. Names containing numbers (e.g. HLA-B27, ICHD-3) go in with unit "label".
   Keep numbers in the text to the ones that matter.
7. Aim for 10–25 rules per cluster and **at least 3 rules for every topic** in the cluster. Cover, as relevant: diagnostic
   criteria, red flags, initial evaluation, first-line treatment with adult and pediatric dosing, alternatives,
   contraindications, monitoring, prevention, and when to refer or hospitalize. Pathogenesis or epidemiology topics get
   clinically useful epidemiology, risk-factor or diagnosis rules.
8. Note where guidance conflicts between bodies (e.g. US vs. Europe) inside the recommendation text. Do not silently merge it.
9. After writing each file, run `python3 tools/validate.py rules/<CLUSTER>.json` and fix every ERROR. Fix WARNs about
   coverage. A WARN that a domain is "not on allowlist" is fine if the source is authoritative. If Bash is temporarily
   unavailable, retry later. Do not finish while a file has errors.
10. Do not edit `tools/`, `rules/CHOL.json`, or other agents' cluster files. Do not spawn subagents.

## Report
At the end, give one line per cluster with the rule count, the topics covered and their counts, and any topic or number
you could not confirm and therefore omitted.
