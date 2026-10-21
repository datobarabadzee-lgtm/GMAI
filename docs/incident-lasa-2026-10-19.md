## Incident: look-alike drug name (LASA), 2026-10-19 evening — fixed and live
- **What happened:** "კოლომიცინი" (Colomycin = colistimethate) was resolved to "კოლხიცინი" (colchicine) by 2-edit fuzzy matching. A colchicine label summary was then shown under the name კოლომიცინი.
- **Root cause:**
  - The fuzzy match result was used as the drug's identity in three places: label lookup (`latinCandidates`), free-text mentions (`drugMentions`) and the summary card.
  - The name dictionary had no entry for Colomycin.
- **Fix (live):**
  - A fuzzy match now returns `inn: null` plus a `suggestion`.
  - Nothing is produced for the drug — label, summary, dose, interaction or age warning — until the user confirms. The drug summary API returns 409 NEEDS_CONFIRMATION; the UI shows a "did you mean" button.
  - The openFDA label must carry the searched name (identity check).
  - `findDrug` accepts a partial name only if it has 5 or more letters and matches exactly one drug.
- **Dictionary additions:**
  - Brands: Colomycin / Coly-Mycin / Promixin → colistimethate.
  - About 40 hospital and ICU agents: colistin, polymyxin, aminoglycosides, carbapenems, vasopressors, sedatives, neuromuscular blockers, alteplase and others.
- **Tests:** `src/tests/lasa-safety.test.ts`. Total: 366 passing.
- **Next step:** import the Georgian national medicines register (brand → INN, form, strength) as the authoritative name source. Fuzzy matching then serves only as a suggestion over that register.

## Follow-up (same evening)
- The medication L5 Lite package was integrated as the identity service; see `claude/medication-identity.md`.
- Name-based label lookup was removed from every route and agent.
- A test scans the source tree to show that no name-based lookup remains.
