# styles.css — Engineering Review & Refactor Plan

**Review date:** 2026-08-03
**Last updated:** 2026-08-08
**Branch:** `style-refactor`
**Scope reviewed:** `styles.css` (1266 lines at review time, 187 `@property` rules, 85 style rules)
**Engines tested:** Chrome (via chrome-devtools MCP) and Safari Technology Preview 27.0 (via safari-mcp-stp)

> **Status: Stage 1 implemented; sphere re-enabled.** Findings F1–F3, F6 and most of F8 are
> done; F5 was examined and dismissed; F7 is deferred on browser support. The sphere was
> re-enabled on 2026-08-08, producing F11–F13. See §0 for the current state and §4/§4a for
> each finding's outcome.
>
> **Two entries have been corrected rather than extended** — the clarification under §5a P3,
> and the correction note at the end of F12. F12's first version reached the *opposite*
> conclusion because it used repeating property values (§2 trap 2). Read §2 before adding any
> measurement to this document, and re-read it before trusting one.

---

## 0. Where this stands *(read this first)*

This document is both the original engineering review and the running record of what was
done about it. Sections 1–5 are the review as written on 2026-08-03; §4 has since been
annotated with an outcome per finding. Nothing has been deleted — a dismissed finding is
marked dismissed, with the reasoning, rather than removed.

### Progress

| Finding | Summary | Status |
|---|---|---|
| F1 | 26 dead per-object properties computed every frame | **Done** — commented out, registrations kept |
| F2 | `@property --clip-path` invalid and inert | **Done** — rule deleted |
| F3 | Face trig computed in 3 layers, read in 1 | **Done** — moved to `#shade-layer .face` |
| F4 | Per-face shade math is the largest single cost | **No action** — genuinely needed |
| F5 | Shade layer is a visual no-op | **Dismissed** — see F5; the claim was too broad |
| F6 | Latent bug in grid-centring expression | **Done** — all 4 call sites |
| F7 | Structural repetition; `@function` collapses it | **Deferred** — sample code written, see §9 |
| F8 | Seven smaller cleanups | **5 of 7 done**, 2 deliberately held |
| F9 | *(new)* Column 1 of the face chain orphaned by F1 | **Done** — commented out 2026-08-08 |
| F10 | Residual body-level dead properties | **Open, low priority** — plus `--face-normal-11/-21/-31`, added 2026-08-08 |
| F11 | `--light-scene-normal-13/-23` registered `inherits: false`; sphere gradient frozen | **Done** — incl. F11a placement, F11b T07 registrations |
| F12 | Scope the shade chain off the sphere's hidden faces | **Open, recommended** — ~18%, no DOM change, needs `:where()` |
| F13 | Gradient angle vs. rotated pseudo-element | **Closed, no action** — no measurable difference |

### Commits

| Commit | Contents |
|---|---|
| `88a5f06` | This plan, as originally written |
| `a1b2d40` | Finding update |
| `e31773c` | Stage 1 implementation — F1, F2, F3, F6, F8 |
| `eb56c1d` | New declarations, updated report |
| *(working)* | Stage 1b — sphere re-enabled: F11/F11a/F11b, F9 first row; F12 and F13 investigated and closed |

### Files

| File | Role |
|---|---|
| `styles.css` | The in-progress refactor. The live stylesheet — the only one `index.html` links. |
| `styles2.css` | The 2711-line original. Still the source for the curved shapes and all UI styles. |
| `styles-refactor-plan.md` | This document. |
| `styles-functions-sample.css` | **Reference only — not linked from `index.html`.** F7 sample code showing what the `@function` refactor would look like. Parked until release-Safari support is confirmed. See §9. |

### Convention adopted during Stage 1

Dead code is **commented out, not deleted**, and its `@property` registration is **left
active**. The reason is that most of it is not dead in general — it is dead only because
the curved shapes (`.sphere`, `.cone`, `.cylinder`, `.hemisphere`, `.octantsphere`) haven't
been ported from `styles2.css` yet. Commenting out removes the per-frame cost immediately;
keeping the registration means the port is an uncomment rather than a rewrite, and the
recorded `initial-value` documents what the property resolves to in the default scene.

Commented-out blocks carry a marker so they're greppable:

```css
/* Commented out as only needed on curved elements. Property declarations intact.
Re-intro on cylinder, .cone, .sphere classes */
```

---

## 1. Context

`styles.css` is the in-progress refactor of `styles2.css` (2711 lines). It currently covers the
flat-face shapes only:

| In `styles.css` | Still only in `styles2.css` |
|---|---|
| cube, tetrahedron, pyramid, slope, slope-corner, dodecahedron | sphere, cylinder, cone, hemisphere, octantsphere, `.curved-lighting`, all UI/control-panel styles |

`index.html` still references shape classes (`cylinder`, `cone`, `hemisphere`, `sphere`,
`octantsphere`) that have no rules in `styles.css` yet. Several findings below are a direct
consequence of that half-ported state — the machinery for the curved shapes is still being
computed even though nothing reads it.

**Runtime shape:** 4 `.scene-container` layers (`environment`, `shadow`, `object`, `shade`).
Each of the latter three holds one `.scene` with N `.object` elements, each with 12 `.face`
divs, each face having `::before` and `::after`. So the per-object cost is multiplied by three.

---

## 2. Measurement methodology

Naive benchmarking of this file is badly misleading. Three traps, all of which I hit before
getting to clean numbers:

1. **vsync quantisation.** Measuring `requestAnimationFrame` deltas on a 120 Hz display
   quantises every result to a multiple of 8.33 ms. Real 15–30% differences vanish or appear
   as cliffs. → Measure a *forced synchronous* style recalc instead
   (`setProperty` then `getBoundingClientRect`).
2. **Value-level caching.** Cycling a property through a repeating set of values (e.g. `i % 90`)
   lets the engine cache the resolved values. This understated cost by roughly **8×** —
   6 ms vs 53 ms for the identical DOM. → Use **never-repeating** values
   (`45 + seq++ * 0.013`), which is what a real slider drag produces.
3. **Cold-start contamination.** The first measurement after cloning DOM includes layer
   allocation and first paint. → Warm up ~200 iterations before sampling; run variants
   A/B/A ×3 and take the median of medians.

All numbers below: **45 objects / 540 faces, unique per-object rotations, unthrottled**,
unless stated otherwise.

---

## 3. Headline results

> All numbers in this section are the **pre-Stage-1 baseline** (commit `88a5f06`). Stage 1
> has since implemented all three of the variants below, so the "All three together" row is
> the *predicted* current state. It has **not been re-measured** — that is outstanding.

### Where the time goes (median forced style recalc)

| Variant | Chrome | Δ | Safari TP 27 | Δ |
|---|---|---|---|---|
| Baseline | 12.0 ms | — | 17 ms | — |
| Dead per-object matrix math removed | 10.3 ms | −14% | 15 ms | −12% |
| Face trig scoped to shade layer only | 11.5 ms | −4% | 16 ms | −6% |
| Per-face shade math removed | 9.1 ms | −24% | 14 ms | −18% |
| **All three together** | **7.3 ms** | **−39%** | **11 ms** | **−35%** |

Both engines agree closely on the shape of the problem. Safari is ~40% slower in absolute
terms but the *relative* wins are the same, so the plan below is engine-agnostic.
(Safari's `performance.now()` has 1 ms resolution, hence the integer values.)

### Scaling (Chrome, 4× CPU throttle, per animation frame)

| Objects | Frame time |
|---|---|
| 1 | 8.3 ms |
| 5 | 15.9 ms |
| 25 | 33.3 ms |

Roughly linear at ~1 ms per object per frame under 4× throttle. Comfortable to ~5 objects;
frames start dropping around 25.

### Chrome hides the real cost from you; Safari doesn't

Same DOM, 45 objects, only the rotations differ:

| Object rotations | Chrome | Safari TP 27 |
|---|---|---|
| All identical (the default state) | 7.1 ms | 16 ms |
| All unique (real usage) | 13.3 ms | 17 ms |
| **Ratio** | **1.9×** | **1.06×** |

Chrome shares computed style across elements whose declared *and* inherited values match, so
in the default state it computes each face's shade math once and reuses it across all objects.
The moment a user rotates objects independently, that sharing collapses and cost roughly
doubles. Safari does little or no such sharing — its numbers are honest at rest.

**Implication:** benchmark in Safari, or in Chrome with deliberately varied rotations.
Chrome-at-rest systematically flatters this architecture.

---

## 4. Findings

### F1 — 26 registered properties per object are computed every frame and never read

> **Status: done** (`e31773c`, plus `@property` follow-up). All three blocks
> (`--object-scene-normal-*`, `--object-light-normal-*`, `--light-cylinder-normal-*`) and the
> `--px/--py/--pz` and `--light-px/--light-pz` groups are commented out on `.object`, with
> registrations left active per the §0 convention. `--elevation-manual` commented out.
> `--face-normal-12/-22/-32`, `--face-object-normal-12/-22/-32`,
> `--face-rotated-normal-a/b/c` and `--dot-product-light-scene-face-object-scene-x`
> commented out in `#shade-layer .face`.
>
> The repeated `sqrt(pow()+pow())` denominators are hoisted into `--norm-denom` and
> `--light-norm-denom`, both registered at `styles.css:129` and `:133`:
>
> ```css
> @property --norm-denom { syntax: "<number>"; inherits: false; initial-value: 0.8660254038; }
> @property --light-norm-denom { syntax: "<number>"; inherits: false; initial-value: 0.5; }
> ```
>
> The initial values are derived from the existing chain so it stays self-consistent:
> `sqrt(0.6123724357² × 2) = 0.8660254038` reproduces `--px: -0.7071067812`, and
> `sqrt(0² + 0.5²) = 0.5` reproduces `--light-pz: 1`. Note `--py` divides by the x/z-only
> denominator — that matches the pre-existing behaviour and was deliberately preserved.
>
> **Not actioned:** `--light-scene-normal-13/-23` (`styles.css:470`, `:473`) are still live.
> Body-level, so the cost is negligible. See also F9. **Correction (2026-08-07):** these are
> no longer dead — `styles.css:1366` reads both. See F11.

Static analysis of the comment-stripped CSS shows zero `var()` reads for:

| Property group | Count | Lines |
|---|---|---|
| `--object-scene-normal-11` … `-23` | 6 (of 9; `-31/-32/-33` feed only the dead `--px/--py/--pz`) | `styles.css:655-663` |
| `--object-light-normal-*` | 9 | `styles.css:667-675` |
| `--light-cylinder-normal-a/b/c` | 3 | `styles.css:683-685` |
| `--px`, `--py`, `--pz` | 3 | `styles.css:691-693` |
| `--light-px`, `--light-pz` | 2 | `styles.css:698-699` |

Each is a three-term dot product. On top of that, the normalisation denominator
`sqrt(pow(...,2) + pow(...,2))` is computed **three times** at `691-693` and **twice** at
`698-699` — it should be hoisted into one intermediate custom property.

These exist because the cylinder/cone/sphere rules haven't been ported yet. **Do not delete —
scope them** to `.cylinder, .cone, .sphere` so the curved-shape port has them ready without
every cube paying for them.

Worth **12–14%** of style recalc on its own, in both engines.

Also dead, same category:
- `--face-normal-12`, `-22`, `-32` (`styles.css:805, 808, 811`) — column 2 is computed but its
  consumers `--face-object-normal-12/22/32` are commented out.
- `--dot-product-light-scene-face-object-scene-x` (`847-854`)
- `--face-rotated-normal-a/b/c` (`835-837`) — pure unread aliases, and unregistered
- ~~`--light-scene-normal-13`, `-23` (`469`, `472`) — body-only, so negligible cost, but dead~~
  — **no longer true as of `eb56c1d`;** read at `:1366`. See F11.
- `--elevation-manual` (`713`)

### F2 — `--clip-path`'s `@property` rule is invalid and inert

> **Status: done** (`e31773c`). The `@property --clip-path` rule is deleted; the
> `--clip-path: unset` declaration on `.face` is untouched. Behaviour is unchanged, because
> the registration was being dropped anyway — `--clip-path` was always an unregistered
> custom property in practice.

```css
@property --clip-path { syntax: "<string>"; inherits: true; initial-value: unset; }  /* :204 */
```

`unset` does not parse as a `<string>`, so the registration is dropped. Confirmed behaviourally
in **both** engines: setting `--clip-path: polygon(...)` succeeds and the resulting
`clip-path` applies — which a genuinely registered `<string>` property would reject.

**The code only works because the registration failed.** Delete the `@property` rule; do not
"fix" the `initial-value`, or every clipped shape (tetrahedron, pyramid, slope, slope-corner,
dodecahedron) breaks.

> Detection caveat: Chrome omits the rule from `CSSPropertyRule` enumeration (186 of 187 kept);
> Safari still lists all 187 in the CSSOM despite not honouring it. The behavioural test is the
> reliable one, and both engines behave identically.

### F3 — Per-face trig computed in three layers, read in one

> **Status: done** (`e31773c`). All six declarations moved from `.face` into
> `#shade-layer .face` (`styles.css:809-815`). Verified safe: `.face`'s own `transform` reads
> `--face-x-deg`/`--face-y-deg` directly, not the `-calc` forms, and no other rule reads the
> six. Specificity is not a problem — `#shade-layer .face` (1,1,0) beats the shape rules
> that set `--face-*-deg`, but it never declares those, so there is no conflict.

`.face` (`styles.css:750-756`) computes `--face-x-calc`, `--face-y-calc`, `--s-fx`, `--c-fx`,
`--s-fy`, `--c-fy` on all 540 faces. Only `#shade-layer .face` reads them (via
`--face-normal-*`). Two-thirds of that work is discarded. Move the six declarations into
`#shade-layer .face`.

Small alone (4–6%), but it compounds with F1 and F4 — together the three reach −35 to −39%.

### F4 — Per-face shade math is the single largest cost

> **Status: no action, by design.** The chain is genuinely needed and stays. Note F3 and F1
> have since trimmed its inputs, and F9 identifies a further half of it that is now orphaned.

The `--face-normal-*` → `--face-object-normal-*` → `--dot-product` → `--shade-value-*` chain
(`styles.css:804-874`) runs on 180 shade faces and accounts for **18–24%** of recalc. It is
genuinely needed — but see F5 for what it currently buys.

### F5 — ~~The shade layer is currently a visual no-op while costing ~20%~~ **DISMISSED**

> **Status: dismissed 2026-08-04.** The finding overstated its case and the shade layer
> stays as it is. Kept here rather than deleted, because the underlying arithmetic is worth
> having on record.
>
> **What the formula actually does.** `--shade-value-front` is a genuine three-band step
> function of the dot product:
>
> | `--dot-product` | `--shade-value-front` | Under `overlay` |
> |---|---|---|
> | `< 0` | 37.5 | darkens |
> | `0 … 0.995037` | 62.5 | neutral — no-op |
> | `≥ 0.995037` | 75 | lightens |
>
> Move the light and faces cross those boundaries, so the layer visibly responds. It is not
> a no-op.
>
> **What was actually true, and only this.** At the *default* light position
> (`--light-x: 60deg`, `--light-y: 0`, giving `--light-normal-13/23/33 = 0 / 0.866 / 0.5`)
> the three visible cube faces have dot products of 0.5 (front), 0.866 (top) and 0 (right).
> All three land in the middle band, so the default state alone renders neutral. That is a
> property of one camera/light configuration, not of the mechanism — and the right face
> sitting exactly on the `0` boundary means even a small light rotation moves it.
>
> The original finding generalised "neutral at rest" into "no-op", which does not follow.
> The `T05B` comment about more shading levels stands; the top band being ~5.7° wide is a
> tuning question for when those land, not a reason to question the layer's cost.

The finding as originally written follows.

With the present three-band formula:

```css
--shade-value-front: calc(37.5 + (25 * clamp(...)) + (12.5 * clamp(... --shade-calc ...)));  /* :865 */
```

`--shade-calc` is `0.995037` (`styles.css:495`), so the top band only fires when the face is
within ~5.7° of facing the light directly. In the default scene, **every visible face of the
cube computes to `62.5`** — neutral grey, which under `mix-blend-mode: overlay` is a no-op.
Only the hidden bottom/back faces differ.

The `T05B` comment ("will need multiple of these for multiple shading levels") suggests this is
known and in progress. Flagged so the cost/benefit is explicit: ~20% of recalc is currently
buying nothing on screen.

### F6 — Latent bug in the grid-centring expression

> **Status: done** (`e31773c`). All four call sites now use `calc((var(--cell-size) - 1) / 2)`:
> `styles.css:750`, `:752` (object transform) and `:933`, `:934` (shadow transform).
> Behaviour is identical at `--cell-size: 5` and now correct for any grid size.

```css
calc(var(--cell-size) / (var(--cell-size) / 2))   /* :736, :738, :918, :919 */
```

This always evaluates to exactly **2**, whatever `--cell-size` is. It is correct today only
because a 5-cell grid happens to centre on index 2. Any other grid size silently mis-centres
every object *and* every shadow.

Correct general form: `calc((var(--cell-size) - 1) / 2)`.

### F7 — Structural repetition

> **Status: deferred, sample code written.** Not implemented: release Safari (26.5.2) support
> for `@function` is unconfirmed and is a requirement for this project, so the refactor stays
> parked. Sample code showing exactly what it would look like is in
> `styles-functions-sample.css` — see **§9**, which also records a performance caveat that
> changes the recommendation for one of the three patterns.

| Pattern | Occurrences |
|---|---|
| 3×3 matrix product (scene×light, scene×object, lightᵀ×object, objectᵀ×light, object×face) | 5 blocks / 45 lines |
| Corner formula `(Rx·X) + (Ry·Y) − (Rz·Z)` | 43 across 5 shapes |
| Euler→matrix sin/cos preamble (scene, light, object, face) | 4 blocks |

`@function` collapses both cleanly. **Browser support is the deciding factor — see §5.**

### F8 — Smaller cleanups

Locations are as at review time (`88a5f06`); current line numbers are given in the status
column where the item was actioned.

| Item | Was at | Status |
|---|---|---|
| Duplicate `.tetrahedron .face` blocks — merge | `:984`, `:989` | **Done** — merged at `:998-1002`. Cascade order preserved: the merged block still precedes the `:nth-child(2..4)` overrides that depend on coming after it. |
| `.slope .face:nth-child(n+7)` fully covered by `:nth-child(n+6)` above it | `:1107` vs `:1096` | **Done** — rule removed. `:1109` covers `n+7` onward for both `.slope` and `.slope-corner`. |
| `content: ''` in a selector list that includes non-pseudo elements | `:593` | **Done** — dropped from the mixed list, added to the four pseudo-element rules that need it (`:604`, `:608`). |
| `.curved-lighting::after` — class does not exist in this file | `:891` | **Held deliberately.** Kept for the curved-shape port, same reasoning as the §0 convention. Now at `:906`. |
| `--shade-front` → `--before-background` → `background` double indirection | `:877-885` | **Held deliberately.** May be needed for natural light and for `.curved-lighting`. Revisit in Stage 2. |
| Duplicate `body` rule blocks | `:311`, `:414` | **Won't fix.** Judged fine as-is — they are separate concerns that happen to share a selector. |
| `#environment-layer` has no `.scene` wrapper, so scene rotation is duplicated across 3 elements + 4 pseudo-elements | `:579-609` | **Open, to investigate.** Carried into Stage 2. |

---

## 4a. Findings arising from Stage 1

### F9 — Column 1 of the face chain is now orphaned

**Raised:** 2026-08-04, post-implementation. **Status: half done (2026-08-08).**

Commenting out `--dot-product-light-scene-face-object-scene-x` (per F1) removed the only
consumer of the face matrix's first column. These were still computed on all 180 shade faces
and read by nothing:

| Property | Location | Cost | Status |
|---|---|---|---|
| `--face-object-normal-11`, `-21`, `-31` | `styles.css:805`, `:809`, `:812` | 3 three-term dot products per face | **Commented out** 2026-08-08 |
| `--face-normal-11`, `-21`, `-31` | `styles.css:821`, `:824`, `:827` | their sole upstream | **Still live, now orphaned** |

Commenting out the first row removed the only consumers of the second, so `--face-normal-11`,
`-21` and `-31` are now dead in exactly the same way. Finish the job with the same treatment.

That is **half the remaining per-face matrix work** — the same category as F4, and worth
acting on if the shade cost is still the bottleneck after Stage 1 is measured.

Column 1 is exactly the input the commented-out x-direction dot product wants back (the cone
needs it — `styles2.css:1688`), and that block is marked "needs verifying" rather than
abandoned, so both rows stay commented rather than deleted, per the §0 convention.

If it is actioned, the remaining chain reduces cleanly — `--face-normal-13/-23/-33` feed
`--face-object-normal-13/-23/-33` feed `--dot-product`, and all four of
`--s-fx`/`--c-fx`/`--s-fy`/`--c-fy` stay in use, so nothing else needs touching.

**Expectation-setting, from F12:** do this for tidiness and for consistency with F1, not for
speed. F12 measured a comparable change — keeping a 25-declaration block off 880 faces — at
**zero**. Per-element overhead, not declaration count, is what these faces cost.

### F10 — Residual body-level dead properties

**Raised:** 2026-08-04. **Status: open, low priority. Partly superseded — see F11.**

Now dead as a consequence of F1, all declared on `body` only, so the per-frame cost is
negligible and none of it scales with object count:

- ~~`--light-scene-normal-13`, `-23`~~ — **no longer dead.** `#shade-layer .sphere .face`
  reads both at `styles.css:1382` (added in `eb56c1d`, after this finding was written).
  Do not remove. See F11.
- `--light-normal-11/12/21/22/31/32` — only column 3 is read now
- `--scene-normal-31/32/33` — consumed only by the commented-out `--object-scene-normal-*`

The remaining two groups are needed again by the curved-shape port. Recommendation: leave them.

**Note added 2026-08-08:** `--face-normal-11/-21/-31` also went dead on 2026-08-08, but they
belong to **F9**, not here — they are declared on `#shade-layer .face`, so unlike everything
in this finding they are computed on every face of every object rather than once on `body`.
Tracked in F9's table.

### F11 — `--light-scene-normal-13/-23` were registered `inherits: false`

**Raised:** 2026-08-07. **Status: done** (this commit).

```css
@property --light-scene-normal-13 { syntax: "<number>"; inherits: false; initial-value: 0.3535533906; }
@property --light-scene-normal-23 { syntax: "<number>"; inherits: false; initial-value: 0.5732233047; }
```

Both are computed on `body` only, but `inherits: false` meant the computed value stopped
there. The one consumer, `#shade-layer .sphere .face` (`--lighting-bg-angle`), therefore
resolved each `var()` to the registered **initial-value** instead.

Symptom: the sphere's shade gradient rendered at the correct angle on load — the two initial
values are exactly the default light/scene pose — and then never moved when the light or scene
was rotated. It failed silently: no invalid value, no fallback, just a frozen constant.

Fixed by flipping both registrations to `inherits: true` (`styles.css:73`, `:76`). Safe
because `body` is the only rule that sets either property, and every input they're derived
from (`--light-normal-13/23/33`, `--scene-normal-*`) is already registered `inherits: true` —
these two were the outliers.

Verified in Chrome after the fix: `--lighting-bg-angle` reads `211.666deg` at the default
pose, `214.372deg` at `--light-y-unit: 40`, `189.85deg` at `--scene-y-unit: 120`, and returns
to `211.666deg` when both are cleared.

**Note for the curved-shape port:** `--light-scene-normal-33` is still commented out at both
its registration (`styles.css:79`) and its declaration. It is currently only referenced from
the commented-out `--dot-product-light-scene-face-object-scene-x` block, so it's inert today —
but uncomment **both** when that dot product is restored, and register it `inherits: true`.

#### F11a — where these two belong (resolved 2026-08-08)

They were briefly moved onto `#shade-layer .sphere` to satisfy F1, then moved back to `body`
(`styles.css:485`, `:488`). `body` is correct, and the reasoning is worth recording because it
marks the boundary of the F1 principle:

`--light-scene-normal-13/-23` are the product of the scene and light matrices. They depend on
**neither** the object nor the face, so there is exactly one correct value document-wide. F1
targets properties whose cost scales with object or face count; these are singletons, and
scoping them to `.sphere` actively made things worse — N spheres recomputing one identical
pair N times. This is the same call F10 made originally.

`body:has(.sphere)` was considered, to compute them only when a sphere exists. Rejected:
P2's own measurement (50 extra inheriting registered properties on `body` with `calc(sin())`
chains → **zero** measurable change) says the thing being avoided costs nothing, while `:has()`
adds a selector that re-evaluates on DOM mutation — and `tabs.js` adds, removes and re-classes
objects at runtime. Real cost to avoid a zero cost.

**Rule of thumb:** scope per-object and per-face properties; leave scene- and light-level
singletons on `body`, next to the `--scene-normal-*` / `--light-normal-*` they derive from.

#### F11b — T07 registration and transform cleanup (done 2026-08-08)

Re-enabling the sphere brought in eight unregistered custom properties. Six are now registered
(`styles.css:220-224`, plus `--shade-orient`); two are deliberately left unregistered —
`--clip-path` (F2) and `--before-background`, which holds a gradient rather than a `<color>`.

All four `--shade-*` properties need `inherits: true`: they are declared on `.face` or
`.curved-lighting` but read from `.curved-lighting::before/::after`, a generation down.
`--lighting-bg-angle` is declared and read inside one rule, so it stays `inherits: false`.
Its initial value, `211.6655075486deg`, is `180deg + atan2(0.3535533906, 0.5732233047)` — the
default pose, consistent with the two initial values it is derived from.

**`--shade-light-transform` / `--shade-dark-transform` replaced by `--shade-orient`.** The old
pair baked `translateZ(var(--lighting-translate))` into a custom property declared on `.face`.
A `var()` inside a custom property is substituted **on the element that declares it**, so the
translate was frozen at `.face` and `.sphere .highlight` could never override it — which is
why styles2.css wrote the whole four-rotation prefix out a second time for the highlight
(`styles2.css:1459-1470`) and a *fourth and fifth* time for the hemisphere (`:1834-1875`).

Confirmed in Chrome:

```
parent { --t: 0px; --composed: translateZ(var(--t)); }
child  { --t: 999px; }
→ child's --t        = "999px"
→ child's --composed = "translateZ(0px)"    ← 0px baked in at the parent
```

`--shade-orient` therefore carries **orientation only**. Each consumer appends its own
`rotateY()` and `translateZ()` in the real `transform` property, where the var resolves
per-element. `.sphere .highlight` now sets `--lighting-translate: var(--object-size-half)` and
nothing else. Verified: `--lighting-translate` resolves to `0px` on the face and `37.5px` on
the highlight, and all three resolved `matrix3d` values are byte-identical to the
pre-refactor transform strings.

Also folded away in the same pass: `--shade-front-transform` / `--shade-back-transform`, which
existed only to be read by `--before-transform` / `--after-transform` on the following two
lines. Nothing in either stylesheet overrode them.

**Per-shape override seam — do not inline.** `--shade-light` / `--shade-dark` look like
constants in the sphere, but `styles2.css:1594-1595` overrides both for cylinder and cone
(`var(--lightness-bright)` / `var(--lightness-dark)`). They stay variables. Their home on
`.curved-lighting` is better than styles2's, which buried them in `#shade-layer .sphere .face`.

### F12 — Scope the shade chain off the sphere's hidden faces — **~18%, no DOM change**

**Raised:** 2026-08-08. **Status: open, recommended. Measured, with a required `:where()` caveat.**

`tabs.js:284` gives every object 12 faces; the sphere uses one and hides the rest with
`.sphere .face:nth-child(n + 2) { display: none }` (`styles.css:1425`). Per the P3
clarification those hidden faces still resolve their own style, so the question is whether the
25-declaration `#shade-layer .face` block can be kept off them **without** a wrapper element —
identical DOM across shapes is what makes shape switching a pure class change, and that is
worth preserving.

**It can, and it is worth ~18% of style recalc.** Narrowing the live rule's `selectorText` at
runtime, §2-compliant methodology (45 objects / 540 faces, never-repeating values, forced
synchronous recalc, 200-iteration warm-up, A/B ×5, median of 150):

| `#shade-layer .face` selector | Median | vs baseline |
|---|---|---|
| `#shade-layer .face` (today) | 6.7 ms | — |
| narrowed to skip the sphere's hidden faces | 5.5 ms | **−17.9%** |
| narrowed **and** hidden faces detached from the DOM | 4.7 ms | −30% |

So the hidden faces cost ~2.0 ms in total, split roughly **1.2 ms declarations / 0.8 ms bare
element overhead**. The declarations are the larger half and the only half reachable from CSS.
The residual 0.8 ms is flat per-element style-resolution overhead that nothing in CSS removes —
not `display`, not `content-visibility`, not `contain`, not `initial` overrides. That part
needs fewer elements, i.e. per-shape face generation in `tabs.js`, and is not recommended
while uniform DOM is a goal.

#### The selector must not raise specificity — use `:where()`

The obvious narrowing is wrong:

```css
/* WRONG — (1,3,0) beats #shade-layer .sphere .face at (1,2,0) */
#shade-layer :not(.sphere) > .face,
#shade-layer .sphere > .face:first-child { … }
```

`#shade-layer .face` is specificity (1,1,0). Adding `.sphere` and `:first-child` takes the
second arm to (1,3,0), which then **outranks** `#shade-layer .sphere .face` (1,2,0) and wins
`--before-background` — silently replacing the sphere's gradient with the flat `--shade-front`.
Verified: `--before-background` went from `linear-gradient(207.605deg, …)` to
`rgb(159, 159, 159)`. `:where()` contributes zero specificity and fixes it:

```css
/* CORRECT — both arms stay exactly (1,1,0) */
#shade-layer :where(:not(.sphere)) > .face,
#shade-layer :where(.sphere) > .face:where(:first-child) { … }
```

Re-verified with `:where()`: the visible face is byte-identical — `--before-background`
gradient, `--dot-product` `0.162891`, and the `.curved-lighting::before` `matrix3d` all
unchanged — while the hidden faces' `--dot-product` falls back to its registered initial `0.5`,
which is the intended effect.

**Generalising to the port.** Each curved shape uses a different number of faces, so the
second arm grows as shapes land. Keep every arm inside `:where()` so specificity stays flat,
and keep the list next to the `display: none` rules that define which faces are unused, since
the two must agree.

#### Correction — the first version of this finding said the opposite

This was originally recorded as "the declarations are free; only element overhead costs,
therefore no CSS change can help, keep the uniform DOM and do nothing". That was wrong, and it
was wrong because the first measurement cycled `--light-y-unit` through `(i*3) % 360` — a
repeating 120-value set. That is **§2 trap 2**, which §2 already warns understates cost by
up to 8×. With repeating values the narrowed selector measured 1.3 ms vs 1.2 ms (no
difference); with never-repeating values it measures 5.5 ms vs 6.7 ms (−18%).

The lesson is that §2's traps apply to *every* measurement in this document, including the
ones added after §2 was written. Both F12 and F13 were re-run under §2 methodology before
being recorded here; F13's conclusion survived, F12's inverted.

### F13 — Gradient angle vs. rotated pseudo-element: no difference

**Raised:** 2026-08-08. **Status: closed, no action. `styles.css:1383` stays as it is.**

`#shade-layer .sphere .face` rebuilds `--before-background` whenever the light or scene moves:

```css
--before-background: linear-gradient(var(--lighting-bg-angle), hsl(0 0 62.5%) 0% 50%, hsl(0 0 37.5%) 50% 100%);
```

The standard advice — animate a compositable `transform` rather than a paint property —
suggests painting a fixed gradient once and rotating it. Since the pseudo-element is a square
with `border-radius: 50%`, i.e. a circle, rotating it about its centre is visually identity, so
the swap would have been correct. It is also pointless.

Four variants of `#shade-layer .sphere .face::before`, §2-compliant (45 objects / 540 faces,
never-repeating values, forced synchronous recalc, 200-iteration warm-up of every variant,
3 reps of 120, median):

| Variant | Medians | Median of medians |
|---|---|---|
| **A** `linear-gradient(var(--lighting-bg-angle), …)` (today) | 6.4 / 6.7 / 7.7 ms | 6.7 ms |
| **B** fixed `0deg` gradient + `transform: rotate(var(--lighting-bg-angle))` | 6.6 / 6.7 / 6.6 ms | 6.6 ms |
| **C** fixed gradient, angle never changes, no rotation | 6.5 / 6.8 / 6.7 ms | 6.7 ms |
| **D** no gradient at all, flat `hsl(0 0 50%)` | 6.4 / 6.7 / 7.0 ms | 6.7 ms |

All four are within noise of each other. **D settles it:** deleting the gradient entirely
changes nothing, so there is no cost for B to save. Painting is not the bottleneck here — the
custom-property and 3D-transform pipeline is, which is what F12 and F4 address.

The "animate transform, not paint" rule wins when an element can be promoted to a composited
layer and rotated without re-rastering. This pseudo-element cannot be: it sits under
`mix-blend-mode: overlay` on `#shade-layer`, inside a `preserve-3d` subtree, and its own 3D
transform (the `--shade-orient` chain) changes every frame anyway. The raster happens
regardless; recomputing the gradient is a rounding error on top of it.

**Methodology warning — this one nearly produced a false finding twice.** The first run showed
A at ~17 ms and B at ~8.4 ms on `requestAnimationFrame` deltas, an apparent 2× win for B. That
was **§2 traps 1 and 3 together**: vsync quantisation on a 120 Hz display, plus cold raster/GPU
warm-up in whichever variant ran first. The numbers above are the §2-compliant re-run. Any
future measurement here must warm **both** code paths and use forced synchronous recalc rather
than frame deltas.

### Verification performed on Stage 1

No behavioural testing was run — this was a static review. What was checked:

- Comment nesting, brace and paren balance across the whole file (all balanced; no nested
  `/* */`, which is the main hazard when commenting out blocks that already contain comments).
- Every `var()` read in the comment-stripped CSS resolved against every active declaration.
  No dangling references — nothing commented out is still being read. The only unresolved
  reads are `--scene-*-unit`, `--light-*-unit`, `--object-*-unit` and `--x/y/z-pos`, all of
  which are set from JS at runtime and backed by `@property` initial values.
- The inverse sweep — declared but never read — is what surfaced F9 and F10.

**Still outstanding:** screenshot diff of all six shapes in both engines, and a re-measure
against the §3 baseline.

---

## 5. Browser support for the repetition fix

Tested directly rather than trusting MDN's BCD, which is behind:

| Feature | MDN BCD says | Actually observed |
|---|---|---|
| `@function` | Chrome 139+; Firefox ✗; **Safari ✗** | Chrome 139+; **Safari TP 27.0 ✓** — `--double(15px)` resolved to `30px` |
| `if()` | Chrome 137+; Firefox ✗; **Safari ✗** | Chrome 137+; **Safari TP 27.0 ✓** — resolved correctly |

**Important caveat:** I tested **Safari Technology Preview 27.0**. The installed release Safari
is **26.5.2**, and I could not test it (the release-Safari MCP server fails to connect). STP
runs ahead of release, so `@function` support in shipping Safari is **unconfirmed**. Firefox has
neither feature.

So: `@function` is viable for a Chrome-first project, plausibly viable for Safari soon, and
not viable if Firefox matters.

---

## 5a. Assessment of three previously-raised optimisation points

All three were tested rather than accepted. Chrome, 45 objects / 540 faces, unthrottled,
probe element deliberately placed *outside* every layer being hidden (an earlier run had the
probe inside the hidden subtree, which produced a false result).

### P1 — "Set variables as close to the consumer as possible, not on a shared high ancestor"

**Right practice, wrong rationale — and it's already the biggest item in Stage 1.**

The stated reason is that updating on `body` forces the browser to walk a large subtree. That
does not hold here. Removing the **entire 169-element controls subtree** from the DOM changed
recalc time not at all:

| | Median |
|---|---|
| Baseline | 11.7 ms |
| Controls subtree removed from DOM | 12.8 ms |

Chrome already tracks which elements actually depend on `--scene-y-unit` and skips the rest, so
the controls cost nothing despite sitting under the element being mutated. Moving the scene and
light variables off `body` onto a scene-only wrapper would buy nothing.

The principle's *other* form is where the value is: don't **compute** values on elements that
don't consume them. That is exactly finding **F1** (26 dead per-object properties, worth 12–14%)
and **F3** (face trig computed in three layers, read in one). Keep the practice; discard the
"invalidation walk" reasoning.

### P2 — "Register hot-path variables with `@property` and `inherits: false`"

**Not applicable to this file, and the premise doesn't pay off here anyway.**

Two independent checks:

1. *The mechanism.* Adding **50 extra `inherits: true` registered properties** on `body`, each
   with a `calc(sin(var(--scene-y)) * n)` chain, produced **zero** measurable change
   (25.0 ms before, 25.0 ms after). Inherited registered properties that resolve to the same
   value across a subtree are computed once and shared — the count is not the cost.
2. *The candidates.* All 53 `inherits: true` properties in this file genuinely cross an element
   boundary: `body` → `.object` (`--scene-normal-*`, `--light-normal-*`),
   `.object` → `.face` (`--object-normal-*`, `--side-x-angle`, `--phi`),
   `.face` → `::before`/`::after` (`--clip-path`, `--before-background`, `--after-transform`).
   There is essentially nothing to flip.

**Trap to avoid:** the `::before`/`::after` group *must* stay `inherits: true`. Pseudo-elements
only see a custom property if it inherits; flipping those to `inherits: false` silently breaks
every clip-path and every shade colour.

### P3 — "`content-visibility: auto` is the one thing that actually skips the recompute, unlike `display: none`"

**The comparative claim is false.** `display: none` skips the recompute just as completely.

Measured on `#shade-layer`:

| Treatment | Median | vs baseline |
|---|---|---|
| Baseline | 11.7 ms | — |
| `display: none` | 6.2 ms | **−47%** |
| `content-visibility: hidden` | 6.2 ms | **−47%** |
| Detached from the DOM entirely | 6.2 ms | −47% |
| `visibility: hidden` | 13.7 ms | +17% (worse) |

`display: none`, `content-visibility: hidden` and full DOM removal are **indistinguishable** —
all three reclaim the layer's entire share of style recalc. `visibility: hidden` reclaims
nothing, because the subtree stays fully styled and laid out.

`content-visibility: auto` measured similarly fast, but I am **not** claiming that result: `auto`
only skips work for *off-screen* content, and this layout has nothing off-screen (in landscape
the controls sit beside the scene; hidden tab panels already use `.is-hidden { display: none }`).
My synchronous-recalc harness also doesn't give Chrome's on-screen relevance check a chance to
run between ticks, so the number is likely an artefact.

**The genuinely useful finding underneath P3:** each of the three scene layers costs roughly a
third of style recalc, and hiding one with a single `display: none` reclaims all of it. If the
shadow or shade layer can be user-toggleable — or auto-disabled during a drag and restored on
release — that is a **~33–47% win from one line**, larger than any variable-level
micro-optimisation in this document. Worth considering as its own stage.

#### Clarification added 2026-08-08 — this applies to subtree *roots*, not to any element

As written, the table above invites an over-generalisation ("`display: none` skips the
recompute"), and that reading is wrong. What `display: none` skips is everything **below** the
hidden element. The hidden element's **own** computed style is still fully resolved — it has
to be, since `display` is itself one of its computed properties.

Both effects measured in one harness (80 spheres, 960 faces, median of 80 synchronous recalcs):

| Treatment | Median | vs baseline |
|---|---|---|
| Baseline | 1.3 ms | — |
| `display: none` on **`#shade-layer`** (a root above ~1000 elements) | 0.1 ms | **−92%** |
| The 880 already-`display: none` **faces** detached from the DOM | 0.8 ms | **−38%** |
| Restored | 1.4 ms | — |

Row 2 is P3's finding and it holds. Row 3 is the corollary: those 880 faces were still costing
0.5 ms *while already being* `display: none`, because each is a leaf whose own style must be
resolved. P3's large win came from hiding a root with a big subtree beneath it — not from
`display: none` being cheap per element.

> **Caveat on the absolute figures in this table:** this run cycled `--scene-y-unit` through
> `45 + (i % 30)`, a repeating 30-value set — **§2 trap 2**, which understates cost. The
> *ordering* and the qualitative conclusion are unaffected (every row shares the same value
> pattern), but do not compare these milliseconds against §3 or F12/F13, which are
> §2-compliant. **F12 re-measures this properly** and shows the hidden-face cost splits about
> 60/40 between declarations and bare element overhead.

---

## 6. Staged plan

### Stage 1 — Dead code and inert declarations *(no behaviour change)* — **IMPLEMENTED**

- [x] Scope the 26 dead per-object properties (F1) — implemented by commenting out rather
      than by scoping to `.cylinder, .cone, .sphere`. Same effect today, and the port becomes
      an uncomment; see the §0 convention.
- [x] Hoist the repeated `sqrt(pow()+pow())` denominators into single intermediates —
      `--norm-denom`, `--light-norm-denom`, both registered
- [x] Delete the `@property --clip-path` rule (F2)
- [x] Remove `--face-normal-12/-22/-32`, `--face-rotated-normal-*`,
      `--dot-product-light-scene-face-object-scene-x`, `--elevation-manual` — commented out,
      not deleted
- [x] `--light-scene-normal-13/-23` — correctly not removed; they turned out to be live.
      Their `inherits: false` registration was a real bug, fixed separately — see F11
- [x] Move the six face-trig declarations into `#shade-layer .face` (F3)
- [x] F8 cleanups — 3 done, 2 held deliberately, 1 won't-fix, 1 carried to Stage 2
- [x] Fix F6 (grid-centring) — all four call sites

**Expected: −35 to −39% style recalc. Not yet re-measured, and no screenshot diff run yet —
both outstanding.** F9 offers a further reduction on top of this if wanted, though F12 suggests
the reduction will be smaller than the declaration count implies.

### Stage 1b — Sphere re-enabled *(2026-08-08)* — **IMPLEMENTED**

- [x] Register the six unregistered T07 properties (F11b). `--clip-path` and
      `--before-background` remain deliberately unregistered
- [x] Fix `--light-scene-normal-13/-23` to `inherits: true` (F11) — the sphere gradient was
      frozen at its initial value
- [x] Move both back to `body` from `#shade-layer .sphere` (F11a)
- [x] Replace `--shade-light-transform`/`--shade-dark-transform` with orientation-only
      `--shade-orient`; `.sphere .highlight` now overrides `--lighting-translate` alone (F11b)
- [x] Fold away `--shade-front-transform`/`--shade-back-transform` — unread one-hop aliases
- [x] Comment out `--face-object-normal-11/-21/-31` (F9, first row)
- [ ] Comment out `--face-normal-11/-21/-31` (F9, second row — orphaned by the above)

Verified in Chrome: all three sphere `matrix3d` values byte-identical to pre-refactor;
`--lighting-translate` resolves `0px` on the face and `37.5px` on the highlight;
`--lighting-bg-angle` tracks light and scene changes and returns to `211.666deg` on reset.

### Stage 1c — Scope the shade chain off unused faces (F12) *(next, recommended)*

- [ ] Narrow `#shade-layer .face` so the sphere's hidden faces don't match, using `:where()`
      throughout to keep both arms at specificity (1,1,0). **Raising specificity silently
      breaks the sphere gradient — see F12.**
- [ ] Re-verify the visible face is unchanged (`--before-background` gradient, `--dot-product`,
      `.curved-lighting::before` matrix) and that hidden faces fall back to initial values
- [ ] Extend the selector list as each curved shape is ported; keep it adjacent to the
      `display: none` rules that define which faces are unused

**Measured: −17.9% style recalc** at 45 objects / 540 faces, no DOM change, class-only shape
switching preserved. Larger than anything remaining in Stage 2.

### Stage 2 — Scoping and inheritance *(next)*

- Collapse the `--shade-front` → `--before-background` → `background` indirection, keeping only
  what `.curved-lighting` will genuinely need
- Give `#environment-layer` a `.scene` wrapper so scene rotation is inherited once
- Audit the remaining 53 `inherits: true` registrations — confirmed *not* a bottleneck on its
  own (adding 50 dummy inheriting registered properties measured zero cost), so this is a
  clarity change, not a performance one

### Stage 3 — Repetition *(gated on §5)* — **ON HOLD**

Release Safari support is required (see §7 Q1), and `@function` support there is unconfirmed.
Held until that resolves.

- If it becomes viable: `@function` for the 3×3 matrix product and the corner formula.
  Collapses ~90 lines into two definitions. **Sample code written — see §9.** Note §9's
  performance caveat: the Euler-preamble variant of this refactor would *cost* time, not
  save it.
- Meanwhile: selector consolidation only —
  merge `.slope`/`.slope-corner`, unify the `:nth-child(n+N) { display: none }` rules into one
  `.face { display: none }` plus explicit opt-ins.

### Stage 3b — Layer toggling *(new; see §5a P3 — possibly the best effort/reward here)*

- Make the shadow and/or shade layer switchable via `display: none`
- Optionally auto-disable one during an active drag, restore on release
- **~33–47% for a one-line change**, independent of every other stage

### Stage 4 — Compositing

- `will-change: transform` on `.object` (`:743`) promotes *every* object — measure memory and
  layer count against the two `mix-blend-mode` layers before changing
- Re-verify in Safari: `preserve-3d` combined with `mix-blend-mode` is the most likely source of
  engine divergence, and I have not yet stress-tested that specific interaction

---

## 7. Open questions

1. **Target browsers?** — **Answered: release Safari must work.** That gates Stage 3 off
   until `@function` support in shipping Safari is confirmed (STP 27.0 has it; 26.5.2
   untested). Firefox has neither `@function` nor `if()`; whether Firefox is also a
   requirement is still open and would rule Stage 3 out entirely rather than merely deferring
   it.
2. **How many objects should this hold?** — Still open. 3–5 is comfortable today. 25+ needs
   Stages 1–2. Beyond ~50 the per-face architecture needs rethinking rather than tuning.
3. **Scope or delete the 26 dead properties?** — **Answered: neither.** Commented out in
   place with registrations kept. See the §0 convention for why.
4. **Is the F5 shading banding intentionally unfinished?** — **Answered: yes**, more layers
   are planned. F5 dismissed on separate grounds anyway — the layer is not a no-op. See F5.
5. **Is F9's column 1 coming back?** — New. Depends on whether the x-direction dot product
   (`--dot-product-light-scene-face-object-scene-x`) gets reinstated. If it is abandoned,
   F9 is a straightforward saving on 180 faces.

---

## 8. Verification notes for whoever picks this up

- Serve locally (`python3 -m http.server 8777`) — `file://` works but complicates comparison.
- Benchmark with **never-repeating** values and a **forced sync recalc**; see §2.
- Benchmark in **Safari**, or in Chrome with varied per-object rotations — Chrome at rest
  under-reports by ~2×.
- After each stage, screenshot-diff all six shapes in both engines. The clip-path shapes
  (tetrahedron, pyramid, slope, slope-corner, dodecahedron) are the ones most likely to regress,
  given F2.
- **Two static checks are cheap and catch most of what this kind of refactor breaks.** Both
  were run against Stage 1 (see §4a):
  1. Strip comments, then check brace/paren balance and look for a `/*` inside a comment.
     Commenting out a block that already contains a comment terminates it early and silently
     eats the rest of the file — CSS has no nested comments.
  2. Strip comments, collect every `var(--x)` read and every `--x:` declaration, and diff
     both ways. Reads-with-no-declaration catches things you commented out too eagerly;
     declarations-with-no-read catches what you *just* orphaned. The second direction is
     the one that found F9.
  Bear in mind properties set from JS (`--scene-*-unit`, `--x/y/z-pos`) will always appear
  as unresolved reads — they are backed by `@property` initial values, not by declarations.

---

## 9. `@function` sample code (F7)

Written 2026-08-04. Lives in **`styles-functions-sample.css`** — a reference file, **not
linked from `index.html`** and not imported anywhere. Syntax verified against
[MDN `@function`](https://developer.mozilla.org/en-US/docs/Web/CSS/@function).

Three patterns, in descending order of how worthwhile they are:

| § | Pattern | Collapses | Verdict |
|---|---|---|---|
| 1 | `--dot3()` — three-term dot product | 5 matrix blocks, ~45 lines | **Adopt when support allows** |
| 2 | `--corner()` — `(Rx·X) + (Ry·Y) − (Rz·Z)` | 43 occurrences across 5 shapes | **Adopt when support allows** |
| 3 | `--rotm-*()` — Euler → matrix entries | the 4 preamble blocks | **Don't** — see below |

`--corner()` relies on a spec guarantee worth knowing: custom properties defined on the
element a function is *called from* are visible inside the function body. So `--corner-Rx/Ry/Rz`
resolve per-object without being threaded through the call signature.

### The caveat that changes the recommendation

**§3 works against F1.** The current preamble computes `sin(--face-x-calc)` once into
`--s-fx` and reads it from three matrix entries. Four independent function calls each
recompute their own sin/cos — `sin(y)` twice, `cos(x)` twice — on 180 shade faces. That is
precisely the duplicated-subexpression problem F1 identified in the `sqrt(pow()+pow())`
denominators, reintroduced in a new place.

§1 and §2 have no such problem: one call in, one value out, exactly like the `calc()` they
replace. And they account for ~88 of the ~90 duplicated lines, so skipping §3 costs almost
nothing in tidiness.

**Recommendation: adopt §1 and §2 only, if and when release-Safari support lands.**
