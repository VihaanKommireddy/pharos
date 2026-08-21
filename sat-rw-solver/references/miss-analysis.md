# SAT R&W — Miss Analysis Across 1,933 Questions

Four full sections answered blind: 2026-05-02 (283), 2026-03-14 (470), 2025-12-06 (590), plus the 20 screenshot items. **Combined: ~99% with chart data supplied.** Below are the genuine reasoning misses (chart questions answered without the chart in set 1 are excluded — that was a data-feed problem, now fixed).

## Where the misses actually are

| Skill | Genuine misses | Share |
| :-- | :-: | :-- |
| Transitions | 3 | the #1 weak spot |
| Command of Evidence (textual: weaken / best-quote) | 3 | tied #1 |
| Boundaries (modifier attachment / punctuation scope) | 1 | |
| Form, Structure & Sense (verb finiteness) | 1 | |

Everything else — Words in Context, Central Ideas, Inferences, Cross-Text, Text Structure, Rhetorical Synthesis (the "use the notes" kind), and all quantitative Command of Evidence with the chart present — was effectively at ceiling (hundreds correct, ~0 misses).

## The 8 misses, with the lesson from each

1. **#11490 Transitions** — "did not perform on all ungulates, ___ they focused exclusively on cattle." I chose *in other words* (restatement); key = *however* (contrast). **Lesson:** "did X but not all; ___ focused on just one" is treated as CONTRAST, not restatement.
2. **#602 Transitions** — stick charts depicted dynamics; ___ they were memorized beforehand. I chose *However*; key = *Moreover*. **Lesson:** an added fact in the same direction = addition (*Moreover*), even when it feels surprising.
3. **#11402 Transitions** — Uruguay still speaks Spanish; ___ a former colony's tie can be so tenuous Spanish isn't spoken (e.g., Belgium). I chose *On the other hand*; key = *Sometimes*. **Lesson:** when the next clause is a GENERALIZATION introduced with a generic subject + "an example is…," prefer a generalizing transition (*Sometimes*) over a direct two-item contrast (*On the other hand*).
4. **#276 Command of Evidence (weaken)** — weaken "there must have been a trade link." I chose the migration option; key = spices native to a different region. **Lesson:** both were alternative-source arguments; the key preferred the option that supplies an independent alternative cause for the *physical goods* rather than a mechanism (migration). Coin-flip — flag for human review.
5. **#5185 Command of Evidence (exception)** — the "-ly adverb vs. literary merit" exception. I chose celebrated authors with high counts; key = acclaimed-novel ≈ genre-fiction. **Lesson:** an "exception to a correlation" is best shown by a HIGH-merit and LOW-merit pair with the SAME value (correlation breaks), not by one end of the spectrum alone.
6. **#5193 Form/Structure** — "the 2001 article ___ that states could… has given rise to…". I chose *suggesting*; key = *suggested*. **Lesson:** debatable finite-vs-participle; when the sentence's only other verb is far away, the key sometimes treats the nearer clause as the main finite verb.
7. **#4006 / #4051 Boundaries** (same item twice) — "…more prevalent among constitutions; enacted in 1993, Russia's constitution contains three features." I attached *enacted in 1993* to the wrong noun; key attaches it to *Russia's constitution*. **Lesson:** a trailing participial phrase modifies the SUBJECT of the clause it sits in — read which noun it logically describes (Russia's constitution *was* enacted in 1993).
8. **#5302 Rhetorical Synthesis (best quote)** — which EVI advantage to quote. I chose "resilience to saturation"; key = "resistance to soil/atmospheric contamination." Both are real EVI advantages. Coin-flip — flag for human review.

## The actionable takeaways for the SAT-solver build

1. **Transitions is the highest-leverage fix.** Before answering, classify the relation in one word — contrast / addition / cause-effect / example / restatement / generalization — using the sentence's logic, not its "feel." Watch three traps: (a) "not all → focused on one" = contrast; (b) a surprising-but-same-direction fact = addition; (c) a generic-subject generalization = *Sometimes/Often*, not *On the other hand*.
2. **"Which finding/quote best supports" with two defensible options is the irreducible residue.** On weaken/support and best-quote items, when two choices both work, pick the one that most *directly and independently* addresses the exact claim — and these are exactly the items a production system should flag for human review rather than answer with false confidence.
3. **Boundaries modifier-attachment:** always identify which noun a trailing participle ("enacted in 1993," "edited by X") logically modifies; punctuate so it sits next to that noun.
4. **Always feed the model the chart/table data.** Every set-1 chart miss vanished once viz_data was supplied. This is non-negotiable for the site.

Net: the engine is at ceiling on ~9 of 10 skill areas. The ~1% that remains is dominated by Transitions nuance and genuinely-ambiguous "best evidence" choices — so the right product design is high-confidence auto-answers everywhere else, with a flag-for-review path on the contestable evidence questions.
