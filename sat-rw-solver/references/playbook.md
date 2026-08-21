# SAT Reading & Writing — Pattern Playbook

Living document. Updated as question batches are analyzed. Goal: capture the recurring logic behind correct answers and wrong-answer traps, so the patterns can later be baked into a system prompt / tutoring engine.

## Progress Tracker

| Batch | Questions | Cumulative Total | Notes |
| :-: | :-- | :-: | :-- |
| 1 | 1–20 | 20 | All 20 keys matched my independent reasoning. Source: bluebooky.com |
| 2 | full 283-question section (bluebooky 2026-05-02, pulled via API) | 283 | Answered blind: 275/283 = **97.2%**; ~99.6% with chart data present. See SAT_RW_283_Results.md. |

### Official skill distribution (from the API's rw_skill field, n=283)

Information & Ideas 106 · Expression of Ideas 83 · Craft & Structure 57 · Conventions 37. By skill: Command of Evidence 62, Rhetorical Synthesis 59, Words in Context 29, Text Structure & Purpose 25, Transitions 24, Central Ideas 20, Form/Structure/Sense 20, Boundaries 17, Inferences 16, Cross-Text 11. Takeaway: **Command of Evidence + Rhetorical Synthesis together are ~43% of the section** — optimize the engine for these first.

### Batch 3 — full 470-question section (bluebooky 2026-03-14), chart data supplied

Answered blind: **466/470 = 99.1%**. Only 4 misses, none from missing chart data. Perfect on 8/10 skills (Words in Context 65/65, Boundaries 54/54, Rhetorical Synthesis 55/55, Inferences 42/42, Cross-Text 12/12, Central Ideas 25/25, Text Structure 38/38). The 4 misses were two debatable Command-of-Evidence items, one "However vs. Moreover" transition, and one "suggesting vs. suggested" finiteness call. See SAT_RW_470_Results_2026-03-14.md.

**Combined across batches 2+3: 741/753 = 98.4% blind; ~99.7% on text-only items.** The batch-2 weakness (chart questions answered without the chart) vanished in batch 3 once viz_data was passed in. Confirmed production rule: **always feed the model the table/graph values for {viz} questions.**

**Answer key, batch 1:** 1-D, 2-C, 3-C, 4-D, 5-A, 6-B, 7-C, 8-A, 9-B, 10-A, 11-C, 12-A, 13-A, 14-C, 15-C, 16-D, 17-C, 18-C, 19-B, 20-B

## A. Question Types Seen So Far

The Digital SAT R&W has 4 domains. Every question maps to one. Counts from batch 1:

| Domain | Skill / subtype | Qs in batch 1 | How to recognize it |
| :-- | :-- | :-- | :-- |
| **Craft & Structure** | Words in Context | 1, 2, 3, 4 | "what does the word ___ most nearly mean" OR a blank needing one logical/precise word |
| | Text Structure & Purpose | 5, 6 | "function of the underlined portion" / "overall structure of the text" |
| | Cross-Text Connections | 7 | Two texts; "what would the author of Text 2 say about Text 1" |
| **Information & Ideas** | Central Ideas & Details | 8 | "what does the text most strongly suggest about ___" |
| | Inferences | 9, 13, 14, 15 | "which choice most logically completes the text" (blank at the END) / "best describes how X presents himself" |
| | Command of Evidence (textual) | 10, 11, 19 | "which finding, if true, would support/weaken" / "which quotation best illustrates the claim" |
| | Command of Evidence (quantitative) | 12, 20 | A table/graph is present; "uses data from the table to complete…" |
| **Standard English Conventions** | Boundaries (punctuation) | 18 | choices differ only in punctuation (commas, periods, colons) |
| | Form, Structure & Sense | 16, 17 | choices are different verb forms or parallel-structure variants; "conforms to the conventions of Standard English" |
| **Expression of Ideas** | (Transitions / Rhetorical Synthesis) | — | not clearly in this batch; watch for it |

## B. Correct-Answer Patterns (by type)

**Words in Context (1–4).** The right answer is the *common, plain* meaning that the surrounding logic demands — not the fanciest synonym.

- Method that works every time: cover the choices, predict your own word from context, then match.
- Q1 "practical end" → **Result** (outcome/aim), not the trap "Publication" (topically tied to a publishing house).
- Q2 capability present even without training → **instinctive for**.
- Q3 pleasure underestimated, tied to surprise → **gratification**.
- Q4 folk art should ___ its form *from* the lives of creators → **derive** (the preposition "from" is the giveaway).

**Text Structure & Purpose (5–6).** The right answer describes the *whole* arc faithfully and neutrally.

- Q5: the underlined list of sources *supports the claim* stated in the first & last sentences → **A**. Right answer ties the part to the framing sentences.
- Q6: must match the literal sequence: older technique → modified into newer → benefit of newer → **B**. Wrong answers insert claims not in the text ("obsolete," "superiority," "hybrid").

**Cross-Text (7).** Pin down each author's exact stance, then find the choice that honors *both*. Text 2 says the whoop could be annoying *but also* wonderful → **C** ("annoying, but it could also be wonderful"). Right answer captures the nuanced/both-sides view, not a one-sided one.

**Central Ideas / Inferences (8, 9, 13–15).** The answer is the *minimal* claim fully supported by the text — no extrapolation.

- Q8: "warm womb cradling all within it," kids never alone → **A** care & protection. Trap answers add unstated functions (governing, hunting, formal network).
- Logical-completion blanks (13–15): the correct choice is forced by a cause→effect or contrast already set up. Q13 complete overlap → can't isolate M cones (**A**). Q15 smaller decline in photosynthesis → stomata stayed more open (**C**).

**Command of Evidence (10, 11, 12, 19, 20).**

- *Support* (10): pick the finding that, if true, makes the underlined claim more likely — Carolina dog sharing the East-Asian-but-not-European marker mirrors exactly the reasoning used for the other breeds → **A**.
- *Weaken* (11): pick the finding that breaks the proposed link — no reliable correlation between clam and salmon accumulation kills the "proxy" hypothesis → **C**.
- *Quantitative* (12, 20): the answer must be (a) factually accurate to the table AND (b) actually illustrate the sentence's point. Q12 must compare an international route that beat a domestic one → **A**. Q20 must use the *right numbers* for the *right systems* → **B** (Game & Watch 18.75M vs ColecoVision 2M).

**Conventions (16, 17, 18).**

- Q16 parallelism: "to prevent and treat" — items in a series share form → **D**.
- Q17 verb finiteness: main clause already has a finite verb ("published"), so the modifier of "pamphlet" must be a participle → **presenting** (**C**). A finite verb would make two predicates with no conjunction.
- Q18 punctuation: the italic title ends at "Muses," then a comma sets off the appositive describing the poet → **C** "Muses, the".

## C. Wrong-Answer Trap Catalog (HIGH VALUE)

| Trap name | Description | Seen in |
| :-- | :-- | :-- |
| **Topic-echo lure** | Choice repeats a word/theme from the passage to feel "related" but doesn't fit the slot | Q1 "Publication" (echoes publishing house) |
| **Too-extreme / added claim** | Choice is plausible but adds an assertion the text never makes (superiority, obsolescence, formality) | Q6 A & C, Q8 B/C/D |
| **One-sided distortion** | In cross-text/nuance questions, a choice that captures only half the author's view | Q7 A, B, D |
| **Right data, wrong pairing** | Quantitative choice cites real numbers but attaches them to the wrong rows/years | Q20 A, C, D; Q12 D |
| **Reverses the logic** | Choice states the opposite cause/effect of what the evidence implies | Q15 C-vs-A (efficiency vs. stomata opening) |
| **Grammatically tempting finite verb** | In Form/Structure items, a conjugated verb that creates a comma splice or double predicate | Q17 A/B/D |
| **Preposition mismatch** | Words-in-context choice whose meaning is fine but collocates wrong with the following preposition | Q4 (needs "___ from"), Q2 (needs "___ for/to") |

## D. Strategy Rules (the "playbook")

1. **Predict before peeking.** For Words-in-Context and logical-completion blanks, generate your own answer from context *first*, then match to a choice. Stops the topic-echo lure cold.
2. **Anchor to text, reject additions.** For Inference / Central Idea / Structure, the answer must be 100% supported. If a choice adds *any* claim not in the text, eliminate it — even if it "sounds smart."
3. **Find the logic connector.** Blanks and inferences hinge on a signal word: cause/effect ("as a result," "since"), contrast ("but," "despite"), or example ("such as"). The correct answer satisfies that relationship.
4. **Two-part test for data questions.** A quantitative choice must be (1) true to the table AND (2) relevant to the sentence's claim. Check both; traps fail one.
5. **For "support" vs "weaken,"** restate the claim/hypothesis as an if→then, then ask whether the choice strengthens or breaks that exact link. Ignore choices about side issues.
6. **Cross-text: stance first.** Write each author's position in a few words before reading choices; pick the choice consistent with *both* and with the requested direction.
7. **Conventions: identify the rule being tested** (parallelism, verb finiteness, punctuation of appositive/title) — choices are designed around exactly one rule.

## E. Open Questions / Things to Watch

- No **Transitions** question ("However," "Therefore," etc.) or explicit **Rhetorical Synthesis** ("student wants to emphasize X — which choice best accomplishes this?") appeared yet. Confirm in later batches.
- Confirm whether quantitative questions always include a deliberately-wrong-number distractor (so far yes).
- Watch whether "most strongly suggest" (Central Ideas) reliably rewards the *least* extrapolated choice (hypothesis: yes).
- Track answer-letter distribution to make sure no positional bias is being read into the data. Batch 1: A×6, B×5, C×7, D×2.

## F. Rules confirmed across the full 283-question pass

**Rhetorical Synthesis (59 Qs, 59/59 correct) — the single most learnable type.** The prompt always states a *specific goal* ("emphasize a difference," "introduce X to a new audience," "describe the format," "specify why"). The right answer does exactly that goal and nothing else:

- "Emphasize a **difference**" → pick the choice that explicitly contrasts the two items; reject choices that state a similarity or just describe one item.
- "Introduce X to a **new audience**" → pick the broad, identifying sentence; reject choices loaded with narrow specifics (sample names, dates).
- "Already familiar with X" → do the opposite: pick the choice with the new specific detail, not the re-introduction.
- "**Specify why** someone won/did something" → pick the choice naming the *reason*; reject choices that only give the year or restate the award's general criteria.
- Accuracy trap: a choice can sound great but mis-state a note (e.g., "build layers of cakes" when the note says "molds for cakes"). Always check the choice against the literal notes.

**Transitions (23/24).** Identify the logical relation between the two sentences before looking: continuation/example (For example, Specifically, Here), contrast (However, Nevertheless, Conversely, Despite), result (Consequently, As a result), sequence (First, Finally). The one miss (#11490) was a restatement-vs-contrast judgment call — when "in other words" and "however" both seem plausible, check whether the second clause *narrows/restates* (→ in other words) or *limits against expectation* (→ however). College Board leaned "however" there.

**Command of Evidence — quantitative ({viz}).** This is the ONLY real weakness, and only when the chart is missing. The answer must (1) read the specific data point correctly and (2) match the sentence's claim. For the production engine: **always feed the model the viz_data (table rows / graph values), not just the prompt.** With the data, these become as reliable as everything else.

**Recurring item families in this bank.** Many questions are *clones*: identical passage/logic with reshuffled options or swapped proper nouns (the "Namesake/end" vocab item, the "tiyospaye," the dog-DNA evidence item, the City-of-Gastronomy cross-text, the viscosity/oobleck synthesis, the Turing Award synthesis, the butterfly "most active" synthesis). The correct *reasoning* is invariant to option order and to the swapped names — a good sign the engine should reason from logic, not memorize letters.
