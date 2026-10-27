# Title lab

The Title lab picks which **title + one-line hook** each event card shows on Home. Claude drafts the variants, a second check screens them, the organizer approves them, and a bandit learns which variant works best for each **taste cluster** of visitors.

It is based on **LOLA**: Zikun Ye, Hema Yoganarasimhan and Yufeng Zheng, *"LOLA: LLM-Assisted Online Learning Algorithm for Content Experiments"*, arXiv:2406.02611 (2024). <https://arxiv.org/abs/2406.02611>

> **In one line:** an LLM's guess about which title will work is the starting point (a prior), and real clicks and bookings take over as they arrive. That matters most when an event gets too little traffic for a classic A/B test.

---

## 1. What LOLA does and what we take from it

LOLA studies headline experiments (on Upworthy's archive of real headline A/B tests). It combines two things:

1. **LLM-based predictions** of how well each headline will perform, and
2. **an online learning algorithm (UCB)** that allocates traffic across headlines and learns from real clicks.

The paper reports that combining LLM predictions with UCB beats both a standard A/B test and a bandit without the predictions, and that the gain is largest when **traffic is limited**. Small organizers' events are exactly that case: a few hundred card views, not millions.

**What follows LOLA here:**

| LOLA idea | Here |
| --- | --- |
| LLM predicts each variant's performance | Claude scores each variant's click appeal (0–1) |
| The prediction is a prior for the bandit | The prior is converted to a rate and counted as `priorWeight` pseudo-impressions |
| UCB allocates traffic and learns online | UCB picks the variant on every card impression |
| Designed for limited traffic | Sample events get tens to hundreds of impressions |

**Our extensions (not in the paper):**

| Extension | Why |
| --- | --- |
| **LLM-generated variants.** LOLA tests headlines written by people. Here Claude writes them, each anchored to one of the event's Qloo links. | New organizers rarely have time to write five titles. |
| **One bandit per taste cluster.** A cluster is the visitor's top-matching Qloo reference for the event. | "For fans of Prateek Kuhad" may win with Kuhad fans and lose with people who only like acoustic music. One pooled bandit would average that away. |
| **Bookings as the reward,** with clicks as a fallback | Organizers care about seats, not clicks. Bookings are rare, so clicks stand in until a cluster has enough bookings. |
| **Variance-scaled bonus** | See §4. Standard UCB1 explores almost uniformly at single-digit click rates. |
| **Guardrails plus a second check** | Generated copy must not invent facts or imply that a referenced artist is involved. |
| **Simulated audience** | Shows organizers what the bandit does before real traffic arrives. Kept separate from real data. |

**Where we're weaker than the paper:** LOLA's predictions come from models evaluated against historical headline tests. Ours are zero-shot Claude ratings with no calibration against past experiments, which is why the prior weight is modest and configurable.

---

## 2. Generating variants

When an organizer publishes an event, Offbeat drafts **5 variants** in the background (`generateOnPublish`, run with Next's `after()` so it never slows down the save). Organizers can also click **Generate title variants** on `/organizer`.

Each variant is anchored to a different Qloo link on the event (`planAnchors()` in `src/lib/server/titleLab.ts`):

1. **One per "for fans of" entity.** The copy must say "for fans of X" or "if you liked X".
2. **One vibe tag** (e.g. "Acoustic").
3. Other direct links (a performer actually listed, the film being screened), then more tags.
4. If there are fewer than four links, the list is filled with a second angle on an existing anchor.
5. **A plain descriptive control** with no references.

For *Acoustic Sundowner* that gives: For fans of Prateek Kuhad · Vibe: Acoustic · Vibe: Singersongwriter · Prateek Kuhad (second angle) · Control.

### Guardrails, enforced before saving

Every draft goes through two checks. If either fails, the variant is replaced by a template for the same anchor, and the reason is shown to the organizer.

1. **Rules** (`guardrailIssues()` in `src/lib/titleLab.ts`, unit-tested):
   - Title ≤ 60 characters, hook ≤ 110.
   - A "for fans of" reference must use fans-of phrasing, and may not appear with involvement words (live, performs, featuring, presents, with, tribute…) or a possessive ("Kuhad's").
   - No urgency or hype (selling fast, last chance, limited, don't miss…).
   - Every number and multi-word proper name must appear in the event data.
2. **Second check: a Claude review.** A separate call reviews all drafts against the event data and fails any that imply involvement, make unsupported claims or use false urgency.

Organizer edits go through **both** checks again before they're saved. Organizers can **approve**, **edit** or **remove** each variant. Only approved variants are served, and a lab goes live once at least two are approved.

Without an LLM (no API key and no local Claude CLI), templates and heuristic priors are used and labelled as such.

For demos, `npm run titles:seed` drafts and approves variants for every published event (the sample events are seeded rather than published through the form, so they have none until then). It skips the organizer review, so read what it prints.

---

## 3. Priors

Claude scores every variant × cluster pair for expected click appeal (0–1). Appeal is mapped to a plausible rate:

```
prior click rate   = 0.02 + 0.10 × appeal          (2%–12%)
prior booking rate = prior click rate × 0.20
```

If Claude's scores are missing or invalid, a heuristic fills them in: 0.75 when the variant's anchor *is* the cluster's reference, 0.45 for the control, 0.35 otherwise, and 0.4/0.5 for the "no matching interests" cluster.

---

## 4. The bandit

Implemented in pure TypeScript (`ucbScores()` and `ucbPick()` in `src/lib/titleLab.ts`):

```
w     = priorWeight (pseudo-impressions, default 20, configurable)
c     = exploration (default 0.5, configurable)
n     = real impressions of this variant in this cluster
mean  = (w · priorRate + successes) / (w + n)
bonus = c · sqrt(2 · max(mean·(1−mean), 0.01) · ln N / (w + n)),   N = Σ (w + n)
pick  = argmax(mean + bonus), ties at random
```

- **Reward:** bookings (demo holds) once the cluster has `minBookings` (default 10) bookings; clicks before that.
- **Per cluster:** a visitor's cluster is the event reference that `rankByTaste()` found most connected to their interests. Visitors with no interests, or no match, go in **No matching interests**.
- **Variance-scaled bonus:** plain UCB1's `sqrt(2 ln N / n)` is about 0.1–0.3 at this traffic, larger than the click rates being compared, so it would barely exploit. Scaling by the Bernoulli variance keeps the bonus on the same scale as the rates. The 0.01 floor stops a variant with zero successes from being starved.
- **Logging:** each pick increments the cluster's impression count, is appended to a rolling window (used for "current traffic share") and is written to a bounded log `{at, kind, clusterId, variantId, uid}`. Clicks go through `/api/title-lab/click`, which logs the click and sets a 24-hour `ob_tl` cookie. A reservation for the same event is then logged as a booking for that variant and cluster.

---

## 5. Organizer view

On `/organizer`, each published event has a **Title lab** card showing:

- per variant: impressions, clicks, CTR, bookings, current traffic share (last 200 impressions), status, anchor, and how it was produced and checked;
- **leader per cluster**, named only once every variant shown in that cluster has 30+ impressions;
- a one-line **insight** built from those numbers only (`insightLine()`), with no LLM involved, so it can't say anything the table doesn't support.

---

## 6. Simulated audience

The **Simulated audience** toggle on each card switches to a clearly labelled synthetic view.

- **2,000 synthetic visitors.** 40% have no matching interests; the rest are split evenly across the event's references.
- **Click probability** = `0.02 + 0.10 × affinity(cluster reference, variant anchor) + N(0, 0.02)` noise. A click books with probability `0.2 × (0.5 + affinity)`.
- **Affinity comes from Qloo Insights:** the cluster's reference is the signal and the variant anchors are `filter.results`; `query.affinity` is the value used. A reference always has affinity 1 to itself, the control gets 0.35, and anchors Qloo doesn't return get 0.2. Raw affinities from different queries are compared here, which the ranking code deliberately avoids. That's acceptable for a synthetic audience, not for ranking real people.
- **Same visitors for both policies.** Each visitor's outcome for every variant is drawn once, and both the bandit and an **equal-split A/B test** see those same outcomes (common random numbers).
- **The chart** shows, for the bandit and for the equal split, the share of the last 200 visitors who were shown a *top* title for their cluster. A top title is within 0.5 percentage points of the cluster's best expected click rate. Qloo often gives several anchors near-identical affinity, and those count as ties.
- **What to expect:** Qloo's affinities between an event's own references are high and close together (about 0.76–1.0 for *Acoustic Sundowner*), so the titles' true click rates are close too. Across 30 seeds on that event, the bandit averaged **about 12% more clicks** than the equal split, at prior weight 20 and exploration 0.5. A single run can show much less, because of noise.

Simulation results are stored in `lab.simulation`. Serving, real stats, the log and the insight never read it (covered by a unit test).

---

## 7. Files and tests

```text
src/lib/titleLab.ts                       pure: UCB with priors, guardrails, simulation, leader, insight
src/lib/titleLab.test.ts                  13 tests
src/lib/server/titleLab.ts                generation, second check, priors, serving, logging, simulation affinity
src/lib/server/titleLab.test.ts           5 tests (templates, approval, logging, edits, real vs simulated)
src/app/api/organizer/title-lab/route.ts  organizer actions
src/app/api/title-lab/click/route.ts      click logging + booking attribution cookie
src/components/organizer/TitleLab.tsx     organizer card, simulation chart
```

## 8. Known limitations

- Impressions are counted when Home renders on the server, so a page render that nobody looks at still counts.
- Holds count as bookings, because payments aren't connected.
- Zero-shot priors aren't calibrated against past results (see §1).
- Clusters come from a visitor's *top* match only. Someone who matches two references counts only toward the stronger one.
