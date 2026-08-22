# styles.css — Performance Status

**Measured:** 2026-08-22
**Branch:** `style-refactor` (at `7fbe644`, plus the fix in §6)
**Engines:** Chrome 151 (`chrome-devtools` MCP) · Safari Technology Preview 27.0 (driven by AppleScript — see §10)
**Supersedes:** `styles-refactor-plan.md` and `styles-refactor-next.md` as the working reference.
Both stay on disk as history; §8 lists every claim in them this round corrects.

---

## 0. Read this first

The curved shapes are ported. This round re-measured the file from scratch in both engines,
with a method rebuilt to survive this machine's noise (§2 — the old protocol could not
resolve anything under ~10%), and **the conclusion has changed since the last report.**

> **The calc chains are no longer the problem they were.** Neutralising *every*
> per-object and per-face calc chain in the file at once buys ≈37% in Chrome and ≈42% in
> Safari. The remaining ~60% is selector matching and per-element style resolution on the
> elements that are left, and the only thing measured this round that reached it was
> removing a whole layer.

That reframes the remaining work. Micro-optimising the maths has roughly 3-8% left in it, in
pieces of 1-2% each. Two things that sound like they should help do not: cutting declaration
counts (§4a) and cutting element counts (§4b), both measured at zero.

**§11 is the section to read if the object count needs to go up.** The 25-30 ms is not the
cost of the scene maths — it is the cost of *any* inherited change at the root, and it is
largely avoidable for scene rotation.

Three things worth knowing immediately:

| | |
|---|---|
| **The curved shapes are the cheap ones.** | A scene of 45 spheres/cylinders/cones costs *less* than 45 flat shapes — 20.4 ms vs 34.1 ms in Chrome, 27.4 vs 40.4 in Safari. The curved port did not make this slower. The worry that prompted this round is unfounded. |
| **The dodecahedron is the expensive one.** | 63.6 ms for 45 of them in Chrome, against 23.7 for cubes and 11.0 for spheres. It is 2.7× a cube and 5.8× a sphere, and it is the only shape with no `display: none` arm. |
| **A real bug turned up.** | The dodecahedron's whole corner chain was reading a registered initial instead of its own face translate, so every dodecahedron sat ~11.6px into the floor. Found, fixed, verified — §6. |

### Changes applied to `styles.css` this round

Two, both small, both verified:

1. **The dodecahedron elevation bug** — §6. Four edits: one `@property` registration, one
   declaration on `.dodecahedron`, ten `--cornerN` expressions plus
   `--dodecahedron-midcorner-height` repointed, and `.dodecahedron .face` now reading the
   figure-level name instead of respelling the expression.
2. **The stale T05B comment** — old item D, now C1 in §7. It still listed cylinder and cone
   as unported.

Nothing else in the stylesheet was touched, and the computed-value diff in §6 confirms it.
The other candidates measured this round (§4a, §4b, §7 D1) did not earn their diff.

**Where the effort should go next**, in order: §7.

---

## 1. Current cost

Standard scene unless stated: **45 objects, unique per-object rotations, unthrottled**,
median forced synchronous style recalc. Chrome's absolute baseline drifts between sessions
(25.1-30.4 ms for the same scene); the paired method in §2 is what makes the *comparisons*
stable, and every percentage below is paired.

### Scaling — linear, and steeper than it looks

| Objects | Face elements | Chrome | Safari TP 27 |
|---:|---:|---:|---:|
| 1 | 36 | 0.9 ms | 0.8 ms |
| 5 | 180 | 3.7 ms | 3.6 ms |
| 10 | 360 | 7.0 ms | — |
| 25 | 900 | 17.7 ms | 20.4 ms |
| 45 | 1620 | 31.5 ms | 36.5 ms |
| 75 | 2700 | 51.3 ms | — |
| 100 | 3600 | 67.3 ms | 81.8 ms |

Clean straight line in both engines: **~0.67 ms per object in Chrome, ~0.82 ms in Safari.**
No cliff, no threshold — just a constant per-object price.

On absolute cross-engine ratios, treat this table and the per-shape table below as giving a
range rather than a number. Safari runs 16-22% slower across the scaling sweep but 10-54%
slower shape by shape, and the two sweeps were taken in different sessions. Chrome's own
baseline for one fixed scene drifted 25.1-30.4 ms across this round, which is most of that
spread. The old report's "~40% slower in absolute terms" is still a fair characterisation;
what is reliable, and what §3 is built on, is the *paired* comparisons within one engine.

### By shape mix, 45 objects

| Mix | Chrome | Safari TP 27 |
|---|---:|---:|
| Curved only (sphere/cylinder/cone) | 20.4 ms | 27.4 ms |
| Mixed (all nine) | 31.5 ms | 36.5 ms |
| Flat only (cube…dodecahedron) | 34.1 ms | 40.4 ms |

### Frame budget — what this means for the user

rAF interval, Chrome, unthrottled, on a 120 Hz display (so quantised to 8.33 ms). **The
answer depends entirely on which slider is being dragged** — a distinction this document
missed on the first pass, because every measurement above drives a body-level property:

| Objects | Dragging one object | Dragging the scene | Dragging the light |
|---:|---:|---:|---:|
| 25 | 8.3 ms — **120 fps** | 24.9 ms — 40 fps | 23.3 ms — 43 fps |
| 45 | 15.2 ms — 66 fps | 50.0 ms — 20 fps | 41.7 ms — 24 fps |
| 100 | 33.8 ms — 30 fps | 150 ms — 7 fps | 108.5 ms — 9 fps |

**This answers open question 2 of the old report**, but not with a single number. Editing
objects is comfortable to ~45 and usable to ~100. Dragging the scene or the light is what
breaks, and it breaks at ~25. §11 is about closing that gap; the scene half of it is largely
fixable.

### Per shape — 45 objects, all one shape

| Shape | Faces kept visible | Chrome | ×cube | Safari TP 27 | ×cube |
|---|---:|---:|---:|---:|---:|
| sphere | 1 | 11.0 ms | 0.46× | 15.4 ms | 0.42× |
| cylinder | 3 | 21.6 ms | 0.91× | 28.1 ms | 0.77× |
| slope | 5 | 23.0 ms | 0.97× | 34.0 ms | 0.93× |
| **cube** | 6 | **23.7 ms** | 1.00× | **36.6 ms** | 1.00× |
| pyramid | 5 | 23.9 ms | 1.01× | 34.2 ms | 0.93× |
| slope-corner | 5 | 26.2 ms | 1.11× | 35.4 ms | 0.97× |
| tetrahedron | 4 | 26.3 ms | 1.11× | 29.4 ms | 0.80× |
| cone | 4 | 33.8 ms | **1.43×** | 37.1 ms | 1.01× |
| **dodecahedron** | 12 | **63.6 ms** | **2.68×** | **73.8 ms** | **2.02×** |

The **dodecahedron** is the outlier in both engines — 2.0-2.7× a cube on 2× the faces, the
extra being its 45-declaration rule, the widest in the file. It is also the only shape with
no `display: none` arm, because it is the only one that uses all 12 faces.

The **cone** and the **tetrahedron** are engine divergences rather than shape problems. The
cone is 1.43× a cube in Chrome but 1.01× in Safari, on a third fewer faces; the tetrahedron
is 1.11× in Chrome and 0.80× in Safari. In both cases Chrome is paying for something WebKit
is not. This file's relative costs otherwise agree closely across engines (§3b, §3c), which
makes these two worth a look — the cone especially, since it is the larger gap and since the
curved shapes still to be ported will be built on the same machinery (§7 A3).

---

## 2. Method — and why the old numbers were hard to reproduce

The three traps from `styles-refactor-plan.md` §2 all still apply; all five are collected in
§10. Two further problems surfaced this round, both of which silently corrupt results, and
both are why this round's numbers differ from the last one's.

### 2a. Run-level interference — fixed by paired interleaving

The old protocol (A/B/A ×3, median of run medians) could not resolve anything under ~10%
on this machine. Whole runs would land 40% high, and with only three runs per arm a single
contaminated run moved the median. Measured spread on identical work: 25.3-29.9 ms.

**Fix:** switch the ablation between *every sample*, so interference lands on both arms
equally, and take paired medians. Sanity check: baseline against itself now reads
**−0.7% in Chrome and 0.0% in Safari**.

That null test is the method's best case, not its working precision. §3f is a worked example
of a real ablation scattering ±2% around zero across four scenes. **Treat anything under
about 3% as unresolved until it has been measured across several scenes**, and read the 1-2%
rows in §3c and §3d as "small" rather than as numbers.

### 2b. The measurement method has its own cost — the sham control

This is the important one, and it invalidates a naive reading of any ablation table.

An ablation neutralises a calc by **adding** a declaration that overrides it with a
constant. But adding declarations to elements that already match is itself expensive. Run a
*sham* — the same declarations on the same selectors, with the property names renamed so
nothing is actually overridden and no arithmetic is saved:

| Sham (declarations added, nothing overridden) | Chrome | Safari TP 27 |
|---|---:|---:|
| ~50 declarations, all-calc shaped | **+7.2%** | **+21.4%** |
| ~17 declarations, shade-chain shaped | **+3.2%** | **+11.9%** |

So every override result understates the true cost of the chain it neutralises, by ~7 points
in Chrome and ~21 in Safari. Uncorrected, several Safari ablations come out *positive* —
`face-trig` at +5.6%, `face-object-matrix` at +5.8%, `corner-chain` at +3.6% — which reads as
"removing this calc makes the page slower". It does not. That is the sham cost swamping a
small genuine saving.

**Every corrected figure in §3 is `measured delta − sham delta`.** It also means: adding ~50
custom-property declarations to already-matching elements costs a fifth of Safari's entire
style recalc. Declaration count is not free, especially in WebKit.

One caveat on the correction. The sham renames the properties, so its declarations are
*unregistered* where the real ones are registered, and the two do not cost the same (§4c).
That makes the sham a conservative estimate of the method's overhead, and every corrected
figure in §3 a lower bound on the chain's true cost. It is the right direction to be wrong
in, but do not read the corrected numbers as exact.

### 2c. Safari's 1 ms timer — fixed by batching

`performance.now()` in STP 27 has exactly 1 ms resolution (measured: 60 ticks in 60 ms
across 751,805 calls). At ~37 ms per recalc that is 3% granularity — coarser than most of
the effects here. **Fix:** time 10 recalcs per sample and divide. Each is still an
independent forced sync recalc on a never-repeating value, so nothing caches across them.
This is what brought Safari's null test to 0.0%.

---

## 3. Where the time goes

### 3a. Style, not layout

`getBoundingClientRect()` (style + layout) and `getComputedStyle()` (style only) cost
**28.8 ms each** on the standard scene. Layout contributes nothing measurable: the whole
cost is style recalculation. Paint and compositing were measured separately, on frame
intervals rather than forced recalcs, and are not where the time is either (§5).

*Chrome only.* This split was not run in Safari, so strictly it is a Blink result — though
the layer breakdown in §3b agrees closely across engines, which makes a different answer in
WebKit unlikely.

> **Corrected in §11.** "Paint and compositing are not where the time is" holds for a *scene
> drag*, where 30 ms of style recalc dwarfs everything. It is false for an *object* drag,
> where style costs 0.5 ms and the frame still takes 16 ms at 45 objects — all of it paint
> and compositing across the three layers. §11 has the numbers. The forced-recalc metric this
> document is built on cannot see paint at all, which is exactly why it took a different
> measurement to find it.

That is why this document is entirely about style, and why the compositing items the old
report carried are closed rather than pursued.

### 3b. By layer

Whole-layer `display: none`, 45 objects:

| Layer | Chrome, mixed | Chrome, curved | Safari, mixed |
|---|---:|---:|---:|
| `#shade-layer` | **−49.5%** | **−56.6%** | **−51.1%** |
| `#shadow-layer` | −27.2% | −22.8% | −24.6% |
| `#object-layer` | −16.1% | — | −21.5% |
| `#environment-layer` | −0.7% | — | +4.1% |

The shade layer is half the total in both engines, and 57% on a curved scene. It is where
the per-face chain lives and where the `::before`/`::after` pair does real work. The two
engines agree closely on the whole breakdown, which is the usual pattern for this file — the
per-shape cone figure in §1 is the exception, not the rule.

(`#environment-layer` reads +4.1% in Safari. That layer is three elements; the figure is
noise plus the cost of the extra rule, not a real effect.)

### 3c. By calc chain — Chrome, 45 mixed objects

Paired, sham-corrected where a sham was measured.

| Ablated chain | Raw | Corrected | Notes |
|---|---:|---:|---|
| **All calc chains at once** | −29.6% | **≈ −37%** | The whole arithmetic budget |
| Generic per-face shade chain (T05B) | −17.4% | ≈ −20.6% | Single largest chain |
| Per-object rotation matrix (`.object`) | −8.8% | | 6 trig + 9 matrix terms × 3 layers |
| `--shade-value-front/-back` banding | −6.8% | | The `round()`/`clamp()` pairs |
| Corner chain → `--elevation-surface` | −5.6% | | All flat shapes |
| `--face-object-normal-*` (2 matrix rows) | −4.6% | | |
| Face trig (`--s-fx`…`--c-fy`) | −3.3% | | |
| `@container style(--object-scene-normal-32)` | −2.4% | | **Noise — see §3f** |
| Curved: light-in-object-space chain | −2.2% | | |
| Curved: cone shadow silhouette | −1.3% | | |
| Curved: first-face gradient direction | −1.1% | | |
| Curved: `--bright-dot-product` / highlight | −1.0% | | |
| Curved: scene×object product, `--px`/`--pz` | −0.7% | | |
| `--corner-Rx/Ry/Rz` on `.object` | −0.4% | | |
| Curved: cone silhouette (view arm) | +1.2% | | Within sham noise |
| Sphere gradient angle (one `atan2`) | +1.1% | | Within sham noise |

**Every curved-shape chain is 1-2%.** The cylinder and cone machinery that this round set
out to investigate is not a bottleneck in a mixed scene.

### 3d. By calc chain — Chrome, 45 curved objects

The curved chains get their fair test on a scene made only of them:

| Ablated chain | Delta |
|---|---:|
| All calc chains at once | −35.4% |
| Generic per-face shade chain | −12.9% |
| Per-object rotation matrix | −10.9% |
| Cone silhouette (view arm) | −3.5% |
| First-face gradient direction | −3.5% |
| Scene×object product, `--px`/`--pz` | −3.0% |
| `@container style(…)` — *noise, see §3f* | −2.7% |
| Light-in-object-space chain | −2.5% |
| `--bright-dot-product` / highlight | −0.7% |
| Cone shadow silhouette | +0.5% |
| Sphere gradient angle | −0.2% |

Even here, with nothing but curved shapes on screen, no single curved chain exceeds 3.5%.
The generic per-face chain and the per-object matrix — neither of them curved-specific —
are still the two biggest items.

### 3e. Deleting a rule vs neutralising its values

Deleting a rule from the sheet removes its declarations, its arithmetic *and* its selector
match. Overriding removes only the arithmetic (and adds sham cost). The gap is instructive:

| Rule | Deleted outright | Values overridden |
|---|---:|---:|
| `#shade-layer .face:not(:where(…))` (22 decls) | **−28.1%** | −17.4% |
| `.object` (28 decls) | **−14.1%** | −8.8% |
| `.dodecahedron` (45 decls) | −1.3% | — |

The deleted-outright column is 1.6× the overridden column in both rows, which looks like
evidence that carrying a declaration costs about as much again as evaluating it. §4 tests
that inference directly, and it does not survive: deleting a rule also removes its selector
match, and that — not the declarations — is what the extra points are.

(`.dodecahedron` reads low here because only 5 of the 45 objects in a mixed scene are
dodecahedra. Its real weight is in the per-shape table in §1.)

### 3f. The style container query costs nothing — a worked example of §2a

The `@container style(--object-scene-normal-32: 0)` rule on the cone read −2.4% on the mixed
scene and −2.7% on the curved one, which looked like a small fixed invalidation cost worth
chasing. Removing the rule from the sheet across four cone densities says otherwise:

| Scene | Cones | Delta with the query removed |
|---|---:|---:|
| 45 cubes | 0 | −0.5% |
| Mixed | 5 | **+1.2%** |
| Curved | 15 | −2.3% |
| All cones | 45 | −0.7% |

No trend with cone count, and the all-cone scene — where the effect should be largest by a
wide margin — is the second *smallest* reading. This is scatter around zero. **The style
container query is free; the two readings in §3c and §3d are noise**, and the 1-2% band is
where this method stops being trustworthy even paired.

Worth keeping in mind for every other 1-2% row in §3c and §3d: they are individually at the
edge of resolution. What those tables support is the ranking of the large items and the
conclusion that no curved chain is a bottleneck — not the precise value of any small one.

---

## 4. What this costs per element, and what does not help

The obvious inference from §3e — that declaration *count* is a big lever — turns out to be
wrong in Chrome, and only mildly right in Safari. Two experiments settle it.

### 4a. Collapsing passthrough declarations: no effect

The hottest rule in the file carries 22 declarations, six of which are single-consumer
passthroughs. Four variants, each checked before timing to confirm the rendered
`::before`/`::after` backgrounds are identical across all of them (v3 additionally stops
declaring `--shade-front`/`--shade-back` at all, so those two read as their registered
initials — that is the variant working as intended, not a difference on screen):

| Variant | Declarations | Chrome | Safari TP 27 |
|---|---:|---:|---:|
| v0 — as shipped | 22 | — | — |
| v1 — `--face-x-calc`/`--face-y-calc` folded into the trig | 20 | −0.7% | −0.4% |
| v2 — v1 + `--shade-value-*` folded into `--shade-*` | 18 | +0.7% | −0.4% |
| v3 — v2 + `--shade-*` folded into `--before/--after-background` | 16 | −0.3% | **−2.0%** |

Chrome runs were exceptionally tight (±0.2 ms), so this is not noise-limited: **removing six
declarations from the hottest rule in the file changes nothing in Chrome.** Safari, where a
declaration costs ~3× more (§2b), gets 2% for the full collapse — but only at v3, which is
the variant that folds the shade maths into `--before-background`. That property is
deliberately unregistered (it carries gradients, not a `<color>`), so v3 trades a computed
colour for a token stream in the one place the sphere and cylinder/cone overrides hook into.
Two percent in one engine is not worth spending that seam on. Not recommended.

### 4b. Element count: also no effect

`tabs.js` builds 12 faces per object whatever the shape, and T05B hides the surplus. Rebuilding
the DOM with only the faces each shape actually uses:

| Scene | Face elements | Delta |
|---|---:|---:|
| Mixed, 45 objects | 1620 → 675 (−58%) | **0.0%** |
| Curved, 45 objects | 1620 → 360 (−78%) | −2.2% |
| Removing both `::before`/`::after` on every face | — | −1.9% |

**Removing 58% of the face elements from the DOM saves nothing.** The surplus faces already
cost nothing to keep. This closes open question 3 of the old report: F12's "further ~30%
available on an all-sphere scene from detaching hidden faces entirely" no longer holds — the
F12 scoping work already took that win. Per-shape face generation in `tabs.js` would buy
nothing, and the uniform 12-face DOM (and with it class-only shape switching) can stay.

### 4c. `@property` registration is a 7× speedup, not a cost

The old report's P2 measured registrations as costless and moved on. They are considerably
better than costless:

| Change | Effect |
|---|---:|
| Remove all 224 `@property` registrations | **+665%** (28.8 ms → 228.7 ms) |
| Remove only the 75 `inherits: true` ones | **+18.4%** |

An unregistered custom property is stored as a token stream and re-substituted at each
`var()`; a registered one is computed once into a typed value. On a chain this deep that is
the difference between 29 ms and 229 ms. **Register everything** is not a tidiness
convention in this file — it is the single biggest performance decision in it, and the §2
"traps" entry about registration switching on a broken declaration is the only cost.

This also disposes of the "audit the `inherits: true` registrations" item: the 75 inheriting
registrations are load-bearing, and the audit is a clarity exercise with a measured 18%
downside if it goes wrong.

---

## 5. Things the numbers rule out

Recorded so they are not rediscovered:

- **`will-change: transform`** (I4 in the old report). Measured on frame intervals, on both
  a scene drag and — the harder test — a one-object drag at 45 and 100 objects, where style
  costs 0.5 ms and the frame is essentially all paint (§11e). Removing it from `.object` or
  `.scene` moves nothing: 16.6 → 16.3 ms at 45, 41.6 → 40.0 at 100. Promoting every object to
  its own layer neither helps nor hurts. **Close I4.**
- **`backface-visibility: hidden`.** Measured at exactly 0.0% (§11a). It is already applied,
  and toggling it either way changes nothing: culling happens at paint time, and this cost is
  at style time.
- **Dropping the `::after` pseudo-element** (the "see inside the object" surface). +0.2% —
  removing *either* pseudo-element alone is free; only removing both saves anything (2.7%),
  so there is no partial win here (§11a).
- **Collapsing passthrough custom properties.** §4a.
- **Per-shape face generation in `tabs.js`.** §4b.
- **Reducing `@property` registrations.** §4c.
- **`--shade-front` → `--before-background` indirection** (I2). Keep it, for the reason the
  old report guessed at plus a measured one: it is the seam the sphere and cylinder/cone
  gradient overrides hang off, and collapsing it (v3 in §4a) buys nothing. **Close I2.**

**Not ruled out, moved to §11f:** `mix-blend-mode`. On a scene drag it is one vsync step and
looked negligible, but on a paint-bound frame it is worth 7% at 45 objects and **20% at 100**
(41.6 → 33.4 ms, §11e). It is a real paint cost that grows with object count — the reason not
to touch it is that the two blended layers are the shading model, not that it is free.

---

## 6. Bug found and fixed — the dodecahedron sat in the floor

**Symptom.** Every dodecahedron was ~11.6px too low, its bottom faces clipped through the
ground plane and its shadow detached. Visible at rest, at any grid size.

**Cause.** `.dodecahedron` computes its corner chain from `var(--face-translate)`:

```css
--dodecahedron-midcorner-height: calc(var(--face-translate) + var(--dodecahedron-midcorner-depth));
--corner1: calc(… + (var(--corner-Ry) * var(--face-translate)) - …);   /* ×10 */
```

but `--face-translate` is declared on `.dodecahedron .face`, not on the figure, and it is
registered `inherits: false`. On the figure it therefore resolved to the registered initial
`5vh` instead of `calc(var(--object-size-half) * (pow(var(--phi), 2) / 2))`. No invalid
value, no fallback, no warning — just a constant.

This is a **regression introduced by the refactor**, and specifically by registering the
property. `styles2.css:1257` declares `--face-translate` on `.object.dodecahedron` — the
figure — and gives the dodecahedron's faces no declaration of their own at all; unregistered
custom properties inherit, so the faces picked it up from the figure and both ends agreed.
`styles.css` registers it `inherits: false` and moves the declaration to
`.dodecahedron .face`, which severs the path in both directions at once.

It is trap 4 of the old report in mirror image: not a descendant reading a body-level
property, but an ancestor reading a descendant's. Worth noting that this is the flip side of
§4c — registration is worth 7×, and this is the bill for it.

**Confirmation** (Chrome, default grid):

| | Before | After | Registered initial for `--dodecahedron-midcorner-height` |
|---|---:|---:|---:|
| figure `--face-translate` | 37.5px (=`5vh`) | 49.09px | |
| `--dodecahedron-midcorner-height` | −23.18px | −11.59px | −1.5450849719vh = **−11.59px** |
| `--elevation-surface` | −37.5px | −49.09px | |

The registered initial was computed from the *correct* value, which is what confirms the
intent rather than the arithmetic.

**Fix applied.** A figure-level name for the quantity, registered `inherits: true` so both
the figure and its faces can read it:

```css
@property --dodecahedron-face-translate { syntax: "<length>"; inherits: true; initial-value: 6.5450849719vh; }

.dodecahedron      { --dodecahedron-face-translate: calc(var(--object-size-half) * (pow(var(--phi), 2) / 2)); }
.dodecahedron .face{ --face-translate: var(--dodecahedron-face-translate); }
```

and the ten `--cornerN` expressions plus `--dodecahedron-midcorner-height` now read
`--dodecahedron-face-translate`.

**Verified.**

- `--elevation-surface` is −49.09px at rest and −53.69px at a 37/63/19 rotation; figure and
  face now agree on the translate.
- **Nothing else moved.** Computed-value diff (§10, `snap.js`) across 9 shapes × 3 layers ×
  2 poses — transform, display, clip-path, border-radius and both pseudo-elements' background
  and transform: **6 of 54 cases differ, all six the dodecahedron**, in all three layers, in
  both poses. Identical result in Chrome and in Safari TP.
- Screenshots before/after show the solid seated on the floor with its shadow attached:
  `dodec-unfixed.png`, `dodec-fixed.png`.
- Performance impact nil — 60.8 → 60.6 ms on 45 dodecahedra, within noise.
- Brace/paren balance and the declared-vs-read diff re-run clean.

The stale T05B comment (old item D / C1 below) was corrected in the same pass.

---

## 7. What to do next, in order

### A. Worth doing

- [ ] **A0 — De-inherit the scene-rotation chain. See §11d.** Scene rotation currently
      invalidates every element in all three layers to recompute values that, for flat shapes,
      cannot have changed. Driving it through a non-inheriting property on the six elements
      whose transforms read it takes a 45-cube scene from **27.45 ms to 0.0 ms**, and a mixed
      scene from 29.6 to 7.6 ms once the scene-normal block moves onto the curved shape
      classes. **This is the largest change available in this document, by a wide margin**,
      and it is the one that raises the object ceiling rather than trimming the cost of the
      current one.

- [ ] **A1 — Decide the object budget, per interaction.** Not one number — §11b/§11e:
      editing an object is 0.2-0.6 ms of style plus paint, and is comfortable to ~45 objects
      and usable to ~100; the *world* sliders are what break, at ~25. If A0 lands, the scene
      slider stops being the constraint and the light slider becomes it. `MAX_OBJECTS` in
      `tabs.js` should be set against whichever interaction the product cares about most.

- [ ] **A1b — Reduce what the shade layer costs to paint. See §11g.** At 100 objects it is
      **71% of the frame** on a scene drag, and its `mix-blend-mode: overlay` alone is 43%.
      This, not style, is what caps the object count — A0 without it gets 100 cubes from
      65.8 ms to 58.3 ms and no further. Bigger than every calc-level change in this document
      combined.

- [ ] **A2 — Decide whether the dodecahedron really needs all 12 faces.** It is the only
      shape without a `display: none` arm and the most expensive in the file, 2.0× a cube in
      Safari and 2.7× in Chrome. If the geometry needs 12, there is nothing to do — the T05B
      comment now records the decision either way (C1), so this is a question to answer, not
      a change to make.

- [ ] **A3 — Find out why the cone is 1.43× a cube in Chrome but 1.01× in Safari.** On a
      third fewer faces, and with the silhouette chain measuring only −3.5% even on a
      curved-only scene, neither the face count nor the arithmetic explains the Chrome
      figure — and an engine-specific gap this size is usually one construct that Blink
      handles badly. The two silhouette faces' `--before-transform` and their `clip-path`
      are the first suspects; the `@container style()` query is *not* one, since §3f prices
      it at zero. Worth one session before hemisphere and octantsphere land, since they will
      be built on the same machinery.

- [ ] **A4 — The `@container style(--object-scene-normal-32: 0)` query, on correctness
      grounds only.** It looked like a 2.4-2.7% cost; measured across four cone densities it
      is not a cost at all (§3f). What remains is that it tests a float for **exact equality
      with 0**, which is fragile on its own terms — and `--cone-side-visible` already collapses
      the gradient by the same criterion two rules later. The question is whether the query
      does anything the `scaleX()` does not. No performance reason to touch it.

### B. Finish the port

Unchanged from the old report except that the face-count guesses can now be checked against
§1's per-shape table as each lands.

- [ ] **hemisphere** — `styles2.css:1768` onward
- [ ] **octantsphere** — `styles2.css:1925` onward
- [ ] **corner-cylinder** — `styles2.css:2513` onward
- [ ] **UI / control panel** — all of it, from `styles2.css`. Largest single chunk left, and
      still entirely absent from `styles.css`.

The per-shape checklist in `styles-refactor-next.md` §2B still applies and is still correct.
Add one step to it, from §6: **if a shape's figure-level rule reads a property that only its
faces declare, that read resolves to the registered initial.** Check both directions.

### C. Housekeeping

- [x] **C1 — Stale comment at `styles.css:886`.** ~~Still says "Shapes still to port …
      cylinder n+4, cone n+5"~~ — **done this pass.** Now lists the three shapes actually
      remaining, flags the counts as estimates to verify per shape, and records why the
      dodecahedron is absent from both lists.
- [ ] **C2 — `--light-normal-11/12/21/22/31/32` are declared on `body` and read nowhere**
      (F10). Six declarations, document-level, so the cost does not scale with object count
      and the remaining port needs them back. **Recommendation unchanged: leave them.**
      Listed so it is not rediscovered a fourth time.
- [ ] **C3 — `--py` is registered but neither declared nor read.** Parked for the port,
      consistent with the file's convention. No action.
- [ ] **C4 — `calc(90deg - var(--cone-angle))` is written twice** — as `--highlight-angle` on
      `.cylinder .highlight, .cone .highlight` and as `--face-x-deg` on `#shade-layer .cone`.
      Cosmetic; they cannot drift because both derive from `--cone-angle`.
- [ ] **C5 — N2 from the old report: share the highlight's angles and sizing across the three
      curved shapes.** Still worth doing, still for clarity rather than speed — the whole
      highlight chain measures −0.7%. Do it before hemisphere and octantsphere land so they
      are not a third and fourth copy.
- [ ] **C6 — Give `#environment-layer` a `.scene` wrapper** (F8). The layer measures −0.7%
      total, so this is purely about not writing the scene rotation out across 3 elements and
      4 pseudo-elements.

### D. Optional, measured, marginal

- [ ] **D1 — Hoist the dodecahedron's 24 document-singleton declarations to `body`.**
      `.dodecahedron` carries 45 declarations; only the 20 `--cornerN` expressions and
      `--elevation-surface` depend on the object. The other 24 are literals or functions of
      `--object-size`, recomputed once per dodecahedron per layer. Hoisting them is the F11a
      principle applied, takes the rule from 45 declarations to 21, and measures
      **−2.0% on an all-dodecahedron scene, −0.4% mixed, and 0.0% on a scene with none** —
      so there is no downside, but there is not much upside either. Correctness-neutral;
      verified to produce identical geometry. Do it when touching the rule for another
      reason. Experiment code: `dodec-exp.js`.

### E. Blocked / on hold

- [ ] **Stage 3 — `@function` refactor (F7).** Unchanged: gated on release-Safari support,
      which is required and still unconfirmed. Note that §4a weakens the *performance* case
      for it considerably — collapsing repetition into functions is now a readability change,
      not a speed one, and §9's warning that the Euler-preamble variant would *cost* time
      still stands. Sample code parked in `styles-functions-sample.css`.
- [ ] **Open question 1 — does Firefox matter?** Still unanswered, and it still decides
      whether Stage 3 is deferred or dead.

---

## 8. Corrections to the earlier documents

| Where | Said | Now |
|---|---|---|
| `plan.md` §3 | "All three together: −39% Chrome / −35% Safari" (predicted, never measured) | Not verifiable as stated — the scene it describes (flat shapes only) no longer exists, and four ports have landed since. Superseded by §1 and §3 here, measured. |
| `plan.md` F12 / open question 3 | "a further ~30% available on an all-sphere scene from detaching hidden faces" | **No longer true.** Trimming 58% of face elements measures 0.0% (§4b). The scoping work already took that win. |
| `plan.md` §5a P2 | Registrations measured "at zero cost" | Understated by a wide margin. They are worth 7× (§4c). |
| `plan.md` I2 | "Investigate whether the `--shade-front` indirection is worth collapsing; default answer probably keep" | **Keep, measured.** Collapsing it buys −0.3% in Chrome and −2.0% in Safari, and the Safari gain comes only from folding the shade maths into the unregistered `--before-background` — the seam the sphere and cylinder/cone overrides hook into (§4a). Closed. |
| `plan.md` I4 | `will-change: transform` — "not yet looked at" | Looked at. No effect, in any scene size, on either selector. Closed (§5). |
| `next.md` §0 | "F12 — both lists carry `.cylinder > .face:nth-child(n+4)` and **`.cone > .face:nth-child(n+3)`**" | The file has `.cone > .face:nth-child(n+5)`, which is correct — the cone uses four faces (side, cap, two silhouettes). The `n+3` in the report is wrong. |
| `next.md` §5 | "Chrome under-reports this architecture by ~2× at rest" and "Safari is ~40% slower in absolute terms" | Both stand. Session-to-session drift in Chrome (25.1-30.4 ms on one fixed scene) is wide enough that no tighter figure than "~40%" is defensible — see the caveat under §1. |
| `next.md` §2A | "Re-measure against the §3 baseline" | Done, differently — the §3 baseline is not reconstructible, so this round measures the current file by ablation instead (§3). |
| `next.md` §2A | "Stress-test `preserve-3d` + `mix-blend-mode` in Safari" | Partly done. Blend measures one vsync step at 45 objects in Chrome (§5), and the layer breakdown agrees closely between engines (§3b) — no divergence found in the numbers. But the style-vs-layout split (§3a) was run in Chrome only, and no *visual* stress test was done in Safari. **Still open.** |
| `next.md` §6 Q2 | "How many objects should this hold? Unanswered." | **Answered:** ~10 smooth, ~25 tolerable, 45 broken; 0.67 ms/object Chrome, 0.82 ms/object Safari (§1). |

---

## 9. Architecture traps

Each of these has cost real debugging time once. Traps 1-7 are in
`styles-refactor-next.md` §4 — all still live, all still correct, read them there. Two to
add from this round. (For *measurement* traps, see §10.)

8. **An ancestor cannot read a property its descendants declare.** `--face-translate` is
   registered `inherits: false` and declared on `.dodecahedron .face`; `.dodecahedron` read it
   and silently got the registered initial. Cost: every dodecahedron in the floor for an
   unknown period (§6). The mirror of trap 4 — check *both* directions when scoping.

9. **Neutralising a declaration costs something.** Overriding a calc with a constant adds a
   declaration, and on this architecture that is worth +7% (Chrome) to +21% (Safari) for ~50
   of them. Any ablation measurement needs a sham control or it is reading the method, not the
   code (§2b).

---

## 10. Replication

### Measurement traps — all five, in one place

These are the traps that corrupt *numbers*; §9 has the ones that corrupt CSS. The first three
are carried from `styles-refactor-plan.md` §2 and are all still live; the
last two are new this round. Any measurement of this file has to satisfy all five.

1. **vsync quantisation.** `requestAnimationFrame` deltas on a 120 Hz display quantise to
   multiples of 8.33 ms, so real 15-30% differences vanish or appear as cliffs. → Measure a
   **forced synchronous style recalc** (`setProperty`, then `getBoundingClientRect`), and use
   frame intervals only for paint/compositing questions.
2. **Value-level caching.** Cycling a property through a repeating set (`i % 90`) lets the
   engine cache resolved values — it understated cost by ~8× in the original work. → Use
   **never-repeating** values (`45 + seq++ * 0.013`), which is what a slider drag produces.
3. **Cold-start contamination.** The first measurements after cloning DOM include layer
   allocation and first paint. → Warm **every** variant before sampling any of them.
4. **Run-level interference** (§2a). → Switch variants between every sample and take paired
   medians. Verify with a baseline-against-baseline null test before trusting a run.
5. **The method's own cost** (§2b). → Every override ablation needs a sham control, or the
   number is measuring the measurement.

### The harness

Three files were added to the repo root for this round. None is linked from `index.html`;
all three are injected at measurement time and none is part of the build.

| File | What it is |
|---|---|
| `perf-bench.js` | The measurement harness — scene builder, ablations, paired sampling, `@property` and rule-deletion probes |
| `snap.js` | Computed-value diff kit (see below) — the regression check for any change to `styles.css` |
| `dodec-exp.js` | The §7 D1 experiment |

```
python3 -m http.server 8777
```

Then in either engine's console:

```js
// 45 objects, one of each shape, unique rotations
BENCH.build(45, ['cube','tetrahedron','pyramid','slope','slope-corner',
                 'dodecahedron','sphere','cylinder','cone']);

BENCH.sweep(['shade-chain','object-matrix','corner-chain'], 60, 50);  // Chrome
BENCH.sweepBatched(['shade-chain','object-matrix'], 25, 6, 10);       // Safari (1ms timer)
BENCH.sweep(['sham-all-calc']);                                       // the control from §2b

BENCH.build(45, ['sphere'], {trimFaces: true});   // DOM with only the faces a shape uses
BENCH.frames(90);                                 // rAF interval
BENCH.removeProperties('inheriting');             // @property cost probe
BENCH.checkShadeVariants();                       // §4a, verifies output is identical first
```

`dodec-exp.js` holds the §7 D1 experiment (`DODEC.set('original'|'fixed'|'hoisted')`).

`snap.js` is the **computed-value diff kit**, and it is the thing to reach for after any
change to this file. It snapshots transform, display, clip-path, border-radius and both
pseudo-elements' background and transform, for every shape in every layer, across two poses
— then lets you swap in the previous stylesheet and diff:

```js
BENCH.build(9, SNAPKIT.MIX);
window.__NEW = SNAPKIT.both();      // 27 targets × 2 poses
SNAPKIT.swap('/styles-previous.css');
// compare SNAPKIT.both() against window.__NEW
```

That is how §6's fix was confirmed to touch nothing else: 54 cases compared, 6 differing,
all of them the dodecahedron in all three layers — identical result in Chrome and Safari.
It is faster and far more sensitive than screenshot-diffing, and it is what the old
report's outstanding "screenshot-diff every ported shape in both engines" item actually
wanted.

**Driving Safari.** The `safari-mcp-stp` MCP server dropped its connection partway through
this round and could not be restarted from inside the session. Safari Technology Preview was
driven by AppleScript instead, which needs *Develop → Allow JavaScript from Apple Events*:

```zsh
osascript -e 'tell application "Safari Technology Preview" to do JavaScript "…" in document 1'
```

Two cautions with that route. `do JavaScript` blocks Safari's main thread for the whole
measurement, so long sweeps look like a hang; and **do not toggle whole-layer `display: none`
in a paired loop** — each toggle rebuilds ~1600 renderers and a 6-ablation sweep did not
finish in ten minutes. Measure layer attribution with absolute samples instead.

---

## 11. Getting past ten objects

Added after the first pass, in response to two specific questions — does
`backface-visibility: hidden` help, and would dropping the `::after` pseudo-elements help.
Neither does. But asking them turned up the thing that does.

### 11a. The two candidates, measured

| Change | Chrome, 45 mixed |
|---|---:|
| `backface-visibility: visible` instead of `hidden` (everywhere it is set) | **0.0%** |
| `.face::after { content: none }` — drop the "see inside" surface | +0.2% |
| `.face::before { content: none }` | +0.4% |
| Both pseudo-elements removed | −2.7% |

`backface-visibility` is exactly zero, and the reasoning behind the question was right: a
culled face is still an element, still matched, still resolved. Culling is a paint-time
decision and the cost here is style-time.

The `::after` result is more interesting than it looks. Removing *either* pseudo-element
alone is free; removing *both* saves 2.7%. So the cost is not per-pseudo-element — it is the
one-off cost of a face having any pseudo-element at all. Dropping `::after` gets you none of
the 2.7% and loses the ability to see inside an object. **Not worth doing.**

### 11b. What the recalc actually responds to

Every number in §1-§4 drives `--scene-y-unit` on `body`. That turns out to be the worst case
in the file, and not for the reason it looks like:

| Property changed | Chrome, 45 mixed | 45 cubes | 45 curved | Safari, 45 mixed |
|---|---:|---:|---:|---:|
| `body --scene-y-unit` | 26.0 ms | 25.6 ms | 20.7 ms | 34.2 ms |
| `body --light-y-unit` | 25.3 ms | 26.5 ms | 21.7 ms | 35.2 ms |
| **one object `--object-y-unit`** (3 figures) | **0.6 ms** | **0.6 ms** | **0.3 ms** | **0.7 ms** |
| **one object `--x-pos`** | **0.2 ms** | **0.2 ms** | **0.1 ms** | **0.2 ms** |

Moving or rotating a single object costs **0.2-0.7 ms and does not scale with scene size** —
the same 0.5 ms at 100 objects as at 45, in both engines. The whole "45 objects is unusable"
conclusion applies only to the two world sliders. Chrome and Safari agree to within a
factor this document rarely sees them agree to.

### 11c. Why: any inherited change at the root costs full price

The 26 ms is not the scene trigonometry. Drive properties that nothing in the document reads:

| Property changed on `body` | Cost |
|---|---:|
| `--scene-y-unit` (feeds the entire tree) | 30.2 ms |
| `--zz-unread-inherit` — registered, `inherits: true`, **read by nothing** | **30.4 ms** |
| `--zz-unregistered` — never declared or registered anywhere | 29.7 ms |
| `color` — a plain inherited property this file never uses | 29.3 ms |
| `--zz-unread-noinherit` — registered, **`inherits: false`** | **0.0 ms** |

Changing *any* inheriting property at the root costs the same as changing the one that feeds
everything. Blink does not prune by whether a descendant actually reads the value; the
subtree is revisited either way. Set the same unread inheriting property on the three
`.scene` wrappers instead and it still costs 29.5 ms, because the whole object tree is
underneath them.

**So the cost model is: `elements below the changed inherited property` × ~0.03 ms per
visible face.** That also explains §4b — trimming the hidden faces changed nothing because
hidden faces were never part of that count.

### 11d. The fix for scene rotation: stop inheriting it

For flat shapes, scene rotation feeds **nothing but transforms** — `.scene`,
`#shadow-layer .scene`, and the environment ground/walls. The shade chain does not use it
(`--dot-product` is built from `--face-object-normal-*` and `--light-normal-*`, neither of
which is scene-dependent). So a scene drag currently invalidates ~700 visible faces to
recompute values that cannot have changed.

Driving scene rotation through a **non-inheriting** property declared on the six elements
whose transforms read it, instead of through `body`:

| 45 cubes, Chrome | |
|---|---:|
| Scene rotation via inherited `--scene-y-unit` on `body` | 27.45 ms |
| Scene rotation via non-inheriting `--scene-y-local` on 6 elements | **0.0 ms** |

Verified rotating correctly in all four layers, not just measured. That is scene rotation
going from the single most expensive interaction in the app to free.

Curved shapes are the complication: sphere, cylinder and cone genuinely read scene rotation
in their shading (`--shade-orient`, `--object-scene-normal-*`, `--light-scene-normal-13/23`).
They would need the scene values delivered to the curved figures only — which means moving
the scene-normal derivation off `body` and onto `.sphere, .cylinder, .cone`. Cost of that
design, measured by driving an inherited property on just the curved figures:

| Mixed scene | Today (on `body`) | Scoped to curved figures | |
|---|---:|---:|---:|
| Chrome, 45 objects (15 curved) | 29.55 ms | **7.6 ms** | 3.9× |
| Chrome, 100 objects (33 curved) | 58.65 ms | **15.2 ms** | 3.9× |
| Safari, 45 objects (15 curved) | 34.2 ms | **8.4 ms** | 4.1× |

A ~4× improvement on the worst interaction in both engines, and better than that on scenes
without curved shapes.

**But style is only half a frame.** Measured end-to-end on a flat-shape scene, where A0 can
be fully simulated:

| Scene drag, Chrome | Today | With A0 |
|---|---:|---:|
| 45 cubes | 25.0 ms (40 fps) | **16.7 ms (60 fps)** |
| 100 cubes | 65.8 ms (15 fps) | 58.3 ms (17 fps) |

A0 removes the style cost completely and the frame still does not collapse, because paint
takes over (§11e). It is a real win at ~45 objects — 40 fps to 60 — and close to irrelevant
at 100. **A0 alone does not raise the ceiling to 100 objects; §11g is what would.**

**Light drags cannot be fixed this way.** Every face's `--dot-product` depends on light
direction, so a light change genuinely does invalidate everything. That one is inherent to
the lighting model, not to how the properties are plumbed.

### 11e. The other half: paint, which the forced-recalc metric cannot see

§3a concluded that style recalc is 100% of the cost. That is true when style recalc is 30 ms.
It is false once it is 0.5 ms — and dragging one object is exactly that case:

| Dragging ONE object | 45 objects | 100 objects |
|---|---:|---:|
| Style recalc (forced) | 0.6 ms | 0.5 ms |
| **Actual frame** | **16.6 ms** | **41.6 ms** |
| …with `#shadow-layer` removed | 8.3 ms | 16.7 ms |
| …with `#shade-layer` removed | 8.3 ms | 23.4 ms |
| …with `mix-blend-mode: normal` | 15.4 ms | 33.4 ms |
| …with `will-change: transform` removed from `.object` | 16.3 ms | 40.0 ms |

Almost all of that frame is paint and compositing, and it scales with the three parallel
layer trees — remove either blended layer and the frame roughly halves. `will-change` remains
a no-op (§5 stands). This is the floor that the §11d fix cannot go below: even with scene
rotation made free, 100 objects would still cost ~40 ms a frame to repaint.

### 11f. What this means in practice

Ranked by what it buys, for the goal of more objects on screen:

1. **De-inherit the scene chain** (§11d) — scene rotation from 27 ms to ~0 on flat scenes,
   29.6 → 7.6 ms mixed. Touches `body`, `.scene`, the environment rules, and moves the
   scene-normal block onto the three curved shape classes. The largest single win available
   and the only one that changes the shape of the problem rather than trimming it.
2. **Attack the shade layer's paint cost** (§11g) — the single largest item at high object
   counts, worth 71% of a 100-object frame. Note this corrects an earlier draft of this
   section, which named the *shadow* layer: shadows matter for object drags, the shade layer
   matters for scene drags, and the second is much the larger effect. Do not generalise from
   one interaction to the other — this document has now made that mistake twice (§3a, and
   here).
3. **Nothing needed for object editing** — already 0.2-0.6 ms and flat in scene size. If the
   common case is placing and rotating objects rather than swinging the camera, the current
   architecture already supports far more than 10.
4. **Accept that light drags are expensive**, or degrade them deliberately — e.g. drop to a
   cheaper shading model while the light slider is being dragged, and restore on release.

None of this needs `@function`, and none of it is in the calc chains.

### 11g. The paint ceiling — what actually caps the object count

With A0 simulated, so style recalc is out of the picture, a scene drag on **100 cubes** costs
58.3 ms a frame. Where it goes:

| 100 cubes, scene drag, A0 applied | Frame | vs baseline |
|---|---:|---:|
| A0 only | 58.3 ms | — |
| `#shadow-layer` hidden | 58.4 ms | **0%** |
| **`#shade-layer` hidden** | **16.7 ms** | **−71%** |
| Both blended layers hidden | 16.6 ms | −71% |
| Blend modes off, layers still painted | 33.3 ms | −43% |
| Objects at half scale (¼ the painted area) | 25.0 ms | −57% |

The shade layer is the whole problem, and `mix-blend-mode: overlay` across the full viewport
is most of it. Painted *area* matters nearly as much as element count — quartering it saves
57% — which is the signature of rasterisation cost rather than style or layout.

Note the regime dependence, because it is easy to get wrong: on a **one-object** drag at 45
mixed objects (§11e) hiding the shadow layer halved the frame; on a **scene** drag at 100
cubes it does nothing at all. The two interactions have different bottlenecks and neither
generalises to the other.

Things worth trying against this, none of them measured yet:

- **Drop `mix-blend-mode` on `#shade-layer`** and get the shading into the object layer some
  other way — pre-multiplied colours on the object faces, or a non-blended overlay. Worth 43%
  of the frame at 100 objects, and it is the difference between three composited
  full-viewport layers and one.
- **Constrain the composited area.** The layers are full-viewport; the diorama occupies a
  fraction of it. `contain: paint` or a tighter containing block on the blended layers may
  cut the rasterised region.
- **Fold the shade layer into the object layer.** The largest change, and the one that
  removes a third of the DOM as well as a blended layer. Everything in §3b and §11g points at
  it; nothing in this document has costed it.
