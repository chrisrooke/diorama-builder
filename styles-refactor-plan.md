# styles.css — Engineering Review & Refactor Plan

**Date:** 2026-08-03
**Branch:** `style-refactor`
**Scope reviewed:** `styles.css` (1266 lines, 187 `@property` rules, 85 style rules)
**Engines tested:** Chrome (via chrome-devtools MCP) and Safari Technology Preview 27.0 (via safari-mcp-stp)

> Status: **recommendations only — no code changed yet.**

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
- `--light-scene-normal-13`, `-23` (`469`, `472`) — body-only, so negligible cost, but dead
- `--elevation-manual` (`713`)

### F2 — `--clip-path`'s `@property` rule is invalid and inert

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

`.face` (`styles.css:750-756`) computes `--face-x-calc`, `--face-y-calc`, `--s-fx`, `--c-fx`,
`--s-fy`, `--c-fy` on all 540 faces. Only `#shade-layer .face` reads them (via
`--face-normal-*`). Two-thirds of that work is discarded. Move the six declarations into
`#shade-layer .face`.

Small alone (4–6%), but it compounds with F1 and F4 — together the three reach −35 to −39%.

### F4 — Per-face shade math is the single largest cost

The `--face-normal-*` → `--face-object-normal-*` → `--dot-product` → `--shade-value-*` chain
(`styles.css:804-874`) runs on 180 shade faces and accounts for **18–24%** of recalc. It is
genuinely needed — but see F5 for what it currently buys.

### F5 — The shade layer is currently a visual no-op while costing ~20%

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

```css
calc(var(--cell-size) / (var(--cell-size) / 2))   /* :736, :738, :918, :919 */
```

This always evaluates to exactly **2**, whatever `--cell-size` is. It is correct today only
because a 5-cell grid happens to centre on index 2. Any other grid size silently mis-centres
every object *and* every shadow.

Correct general form: `calc((var(--cell-size) - 1) / 2)`.

### F7 — Structural repetition

| Pattern | Occurrences |
|---|---|
| 3×3 matrix product (scene×light, scene×object, lightᵀ×object, objectᵀ×light, object×face) | 5 blocks / 45 lines |
| Corner formula `(Rx·X) + (Ry·Y) − (Rz·Z)` | 43 across 5 shapes |
| Euler→matrix sin/cos preamble (scene, light, object, face) | 4 blocks |

`@function` collapses both cleanly. **Browser support is the deciding factor — see §5.**

### F8 — Smaller cleanups

| Item | Location |
|---|---|
| Duplicate `.tetrahedron .face` blocks — merge | `:984` and `:989` |
| `.slope .face:nth-child(n+7)` fully covered by `:nth-child(n+6)` above it | `:1107` vs `:1096` |
| `.curved-lighting::after` — class does not exist in this file (leftover from `styles2.css`) | `:891` |
| `#environment-layer` has no `.scene` wrapper, so scene rotation is duplicated across 3 elements + 4 pseudo-elements instead of one shared ancestor | `:579-609` |
| `content: ''` in a selector list that includes non-pseudo elements (no-op on `.ground`/`.wall-x`/`.wall-y`) | `:593` |
| `--shade-front` → `--before-background` → `background` double indirection (7 extra registered properties per shade face) | `:877-885` |
| Duplicate `body` rule blocks | `:311` and `:414` region |

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

---

## 6. Staged plan

### Stage 1 — Dead code and inert declarations *(no behaviour change)*

- Scope the 26 dead per-object properties (F1) to `.cylinder, .cone, .sphere`
- Hoist the repeated `sqrt(pow()+pow())` denominators into single intermediates
- Delete the `@property --clip-path` rule (F2) — **do not fix its initial-value**
- Delete `--face-normal-12/-22/-32`, `--face-rotated-normal-*`,
  `--dot-product-light-scene-face-object-scene-x`, `--light-scene-normal-13/-23`,
  `--elevation-manual`
- Move the six face-trig declarations into `#shade-layer .face` (F3)
- All F8 cleanups
- Fix F6 (grid-centring) — behaviour-preserving at `--cell-size: 5`

**Expected: −35 to −39% style recalc. Verifiable by screenshot diff in both engines.**

### Stage 2 — Scoping and inheritance

- Collapse the `--shade-front` → `--before-background` → `background` indirection, keeping only
  what `.curved-lighting` will genuinely need
- Give `#environment-layer` a `.scene` wrapper so scene rotation is inherited once
- Audit the remaining 53 `inherits: true` registrations — confirmed *not* a bottleneck on its
  own (adding 50 dummy inheriting registered properties measured zero cost), so this is a
  clarity change, not a performance one

### Stage 3 — Repetition *(gated on §5)*

- If Chrome-first is acceptable: `@function` for the 3×3 matrix product and the corner formula.
  Collapses ~90 lines into two definitions.
- If Firefox/release-Safari must work: selector consolidation only —
  merge `.slope`/`.slope-corner`, unify the `:nth-child(n+N) { display: none }` rules into one
  `.face { display: none }` plus explicit opt-ins.

Hold until Stages 1–2 land: removing dead code deletes a chunk of the repetition for free.

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

1. **Target browsers?** Decides Stage 3 entirely. Chrome-only makes `@function` the biggest
   single win; Firefox support reduces Stage 3 to selector tidying.
2. **How many objects should this hold?** 3–5 is comfortable today. 25+ needs Stages 1–2.
   Beyond ~50 the per-face architecture needs rethinking rather than tuning.
3. **Scope or delete the 26 dead properties?** Recommendation is to scope them, so the
   curved-shape port inherits working machinery. Deleting is tidier now but means rewriting.
4. **Is the F5 shading banding intentionally unfinished?** If more bands are coming, the ~20%
   cost is justified. If not, the shade layer is currently pure overhead.

---

## 8. Verification notes for whoever picks this up

- Serve locally (`python3 -m http.server 8777`) — `file://` works but complicates comparison.
- Benchmark with **never-repeating** values and a **forced sync recalc**; see §2.
- Benchmark in **Safari**, or in Chrome with varied per-object rotations — Chrome at rest
  under-reports by ~2×.
- After each stage, screenshot-diff all six shapes in both engines. The clip-path shapes
  (tetrahedron, pyramid, slope, slope-corner, dodecahedron) are the ones most likely to regress,
  given F2.
