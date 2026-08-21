# SAT R&W — Full Section Results (470 questions)

**Source:** bluebooky.com exam, test_date=2026-03-14, section = Reading & Writing. **Method:** All 470 questions answered blind (key withheld), **with chart/table viz_data supplied inline** for every {viz} question this run. Scored against the official correct_answer_index.

## Headline

| Metric | Result |
| :-- | :-- |
| Questions answered | 470 / 470 |
| Correct | **466 (99.1%)** |
| Misses | 4 — all genuine judgment calls, none caused by missing chart data |

This run validates the key lesson from the 283-question run: **once the chart data is fed to the model, the quantitative Command-of-Evidence gap closes** (58/60 here vs. the chart-starved misses last time).

## Accuracy by official skill

| Skill | Correct / Total |
| :-- | :-: |
| Words in Context | 65 / 65 |
| Text Structure and Purpose | 38 / 38 |
| Central Ideas and Details | 25 / 25 |
| Inferences | 42 / 42 |
| Boundaries | 54 / 54 |
| Rhetorical Synthesis | 55 / 55 |
| Cross-Text Connections | 12 / 12 |
| Transitions | 57 / 58 |
| Form, Structure, and Sense | 60 / 61 |
| Command of Evidence | 58 / 60 |

## The 4 misses

| # (id) | Skill | Mine | Key | Note |
| :-: | :-- | :-: | :-: | :-- |
| 276 | Command of Evidence | B | D | Weaken a "trade link" conclusion. I chose migration as the alternative source; key chose spices native to a different (Maluku) region. Both undercut the South-Asia link. |
| 602 | Transitions | B | D | "However" vs. "Moreover" before a sentence about stick charts being memorized. I read contrast; key read addition. |
| 5185 | Command of Evidence | A | B | The "-ly adverb vs. literary merit" exception. I picked celebrated authors with high counts; key picked the acclaimed-novel-≈-genre-fiction option. Flagged as a coin-flip during solving. |
| 5193 | Form, Structure, and Sense | D | C | "suggesting" (participle) vs. "suggested" (finite verb) in a sentence with a later main verb. A genuinely tricky finiteness call. |

## Takeaway across both runs (753 questions total)

- Combined: 466/470 + 275/283 = **741/753 (98.4%)** answered blind; on text-only items the rate is ~99.7%.
- The single systematic weakness from run 1 (chart questions answered without the chart) **disappeared** in run 2 once viz_data was supplied — confirming the build requirement: always pass the table/graph data to the model.
- The residual misses are a handful of genuinely debatable items (a weaken-question with two valid alternatives, a couple of subtle transition/finiteness calls). These are the cases worth human review even in a production system.
