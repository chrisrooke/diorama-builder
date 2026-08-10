# styles.css — Outstanding Work

**Created:** 2026-08-09
**Branch:** `style-refactor`
**Companion to:** `styles-refactor-plan.md` — the full engineering review and the running record
of everything already done. That document is the reasoning; this one is the to-do list.

> **Read `styles-refactor-plan.md` §2 before taking any measurement**, and re-read it before
> trusting one. The measurement methodology is restated in §5 below, but the two worked
> examples of getting it wrong (F12, F13) are only in the original.

---

## 0. Why this file exists

`styles-refactor-plan.md` has grown to ~980 lines of review, findings, corrections and
outcomes. Almost all of it is history. This file extracts just the parts that are still
*actionable*, and restates the methodology needed to verify any of it.

Nothing here supersedes the original — where an item has reasoning behind it, the finding
reference (F1, F12, P3…) points back at it.

### Status corrections since the original was last updated (2026-08-08)

Four commits have landed since (`f4ffc86` sphere, `051367b` performance refactor, `1203e5c`
slope corner calcs, `7b069ed` cylinder). Three items the original lists as outstanding are
resolved by events:

| Original item | Now |
|---|---|
| F9 — comment out `--face-normal-11/-21/-31` (orphaned column 1) | **Do not.** The cylinder/cone port brought column 1 back. Open question Q5 is answered: yes, it came back. It is now scoped to its only consumer: commented out in the shared `#shade-layer .face:not(:where(…))` block (`styles.css:891`, `:894`, `:897`, along with the dependent `--face-object-normal-11/-21/-31` at `:902`, `:905`, `:908`) and declared on `#shade-layer .cylinder .face:first-child, #shade-layer .cone .face:first-child` at `:1599-1604`. |
| F12 — add an arm to both face lists for cylinder and cone | **Done.** Both lists carry `.cylinder > .face:nth-child(n+4)` and `.cone > .face:nth-child(n+3)`. |
| §4a F11 — `--dot-product-light-scene-face-object-scene-x` may be abandoned | **Restored**, scoped to `#shade-layer .cylinder .face:first-child, #shade-layer .cone .face:first-child` (`:1516`). |

### Landed 2026-08-09 — curved-lighting / cylinder / top-bottom audit

A pass over the newly added cylinder, `.curved-lighting` and `.top-bottom` styles, covering
registration coverage and repeated/unnecessary calcs.

- **Every custom property in the file is now registered**, apart from the two deliberate
  exceptions (`--clip-path`, F2; `--before-background`, which holds gradients rather than a
  `<color>`). 21 new `@property` rules. Three had to be `inherits: true` — `--cone-angle`,
  `--bright-dot-product`, `--lightness-bright/-dark` — because they are declared on the object
  and read on `.highlight` / `.top-bottom::before`, which is the same shape as the F11 bug.
- **`--grid-centre` + `--object-offset-x/-z` hoisted.** The grid-centring expression was
  spelled out in four transforms; two of them (`.sphere`, `#shadow-layer .object.sphere`) had
  reintroduced the **F6 bug** — `calc(var(--cell-size) / (var(--cell-size) / 2))`, which is
  always 2. Verified: at `--cell-size: 4` and `7` the sphere's translation now matches the
  cube's exactly; before the fix it would have sat at the cell-2 position at any grid size.
- **Dead dark-lighting chain commented out** on `#shade-layer .cylinder, .cone` — 11
  declarations per object per frame including two `sign()` and four `pow()` calls. Nothing read
  `--dark-dot-product` because `--lightness-dark` is the constant `37.5%`. Registrations parked
  alongside. Uncomment together with `styles2.css:1569-1571`.
- **`background` on `#shade-layer .cylinder, .cone` commented out.** It reads
  `--background-rotation`, which is declared nowhere in this repo — so the `var()` is invalid at
  computed-value time and the whole declaration has always been dropped. The gradient has never
  painted, in this file or `styles2.css`. Left off rather than switched on.
- **Two `atan2` calls removed** from `.cylinder .curved-lighting`'s transform by reusing angles
  the shade layer already computes: `atan2(a, c)` is `--face-bright-y-calc`, and
  `atan2(-px, pz)` is `calc(var(--face-y-deg) * -1)`. Verified still live, not frozen — the
  transform tracks light-y and scene-y and returns exactly to its rest value.
- **Duplicate declarations dropped:** `display: block` on `.cylinder .curved-lighting` (already
  set by the `.sphere, .cylinder, .cone` rule above), and the `.curved-lighting::after` arm of
  `#shade-layer .face::after`, which lost both its declarations to T07's own rule at equal
  specificity later in the file.

**Verified** by diffing computed values across 9 shapes × 2 poses (default and a
scene/light/object/position-rotated pose) against the pre-change file: 4 differences out of 18
cases, all explained — two are float-serialisation noise at 3e-6 on the cylinder/cone
`.curved-lighting` matrix, and two are the cone's highlight transform going from `none`
(invalid, because `--cone-angle` was undeclared) to a real matrix. That transform still resolves
to `scaleX(0)` at both poses, so nothing changes on screen. Cube, tetrahedron, pyramid, slope,
slope-corner, dodecahedron and sphere are byte-identical in both poses. Screenshots of cylinder
and sphere confirm shading, cap, highlight and shadow.

---

## 1. Current state

| | |
|---|---|
| `styles.css` | 1589 lines. The live stylesheet — the only one `index.html` links. |
| `styles2.css` | 2711 lines. The original. Still the source for the unported shapes **and all UI styles**. |

**Ported:** cube, tetrahedron, pyramid, slope, slope-corner, dodecahedron, sphere, cylinder, cone.

**Not ported:** hemisphere, octantsphere, corner-cylinder — and **the entire control-panel /
UI layer**, which has no rules in `styles.css` at all (one grep for `controls`, `button`,
`label`, `.tab` returns a single comment). `index.html` and `tabs.js` reference all of it.

---

## 2. Actions outstanding

Ordered by what unblocks the most. Checkboxes are for updating in place as work lands.

### A. Verification debt — do this first

Everything below A is being decided on numbers that were never taken. §3 of the original
records the post-Stage-1 figures as **predicted, not measured**, and four further commits have
landed on top.

- [ ] **Re-measure against the §3 baseline.** Chrome and Safari TP, §5 methodology. The claim
      to test is −35 to −39% style recalc vs commit `88a5f06`.
- [ ] **Screenshot-diff every ported shape in both engines.** Never run. The clip-path shapes
      (tetrahedron, pyramid, slope, slope-corner, dodecahedron) are the likeliest regressions
      because of F2 — the `@property --clip-path` deletion. Only Chrome spot checks of cube and
      sphere exist.
- [ ] **Stress-test `preserve-3d` + `mix-blend-mode` in Safari.** The most likely source of
      engine divergence in this architecture, and still untested (Stage 4).

### B. Finish the port

For each remaining shape, the work is the same shape of thing:

- [ ] **hemisphere** — `styles2.css:1768` onward
- [ ] **octantsphere** — `styles2.css:1925` onward
- [ ] **corner-cylinder** — `styles2.css:2513` onward
- [ ] **UI / control panel** — all of it, from `styles2.css`. Largest single chunk left.

Per-shape checklist, derived from what the sphere and cylinder ports actually needed:

1. Add an arm to **both** lists in T05B (`styles.css:785` and `:802`) — the `display: none`
   list and the `#shade-layer .face:not(:where(…))` exclusion. **They must agree.** A missing
   arm in the second only wastes work; a missing arm in the first shows a face that shouldn't
   be visible.
2. Keep every arm inside `:where()`. Specificity must stay exactly (1,1,0) — raising it lets
   the generic rule outrank `#shade-layer .sphere .face` (1,2,0) and silently replaces the
   sphere's gradient with a flat `--shade-front` (F12).
3. Uncomment the machinery the shape needs, per the §0 convention in the original (dead code is
   commented out, `@property` registration left active, so a port is an uncomment).
4. Register any new custom property, and get `inherits` right — see the trap in §4 below.
5. Update the stale comment at `styles.css:783` (see D).

> **Face counts:** the table in the original predicts hemisphere `n+3`, octantsphere `n+5`,
> corner-cylinder `n+6`. These are estimates read off `styles2.css`. Cone was predicted `n+5`
> and landed at `n+3`. Verify per shape rather than trusting the table.

### C. Scoping and inheritance (Stage 2)

- [ ] **N2 — share the highlight's angles and sizing across the three curved shapes.**
      The two highlight rules are unconnected, and each repeats magic numbers the other also
      uses. `.sphere .highlight` sets all four of `top`/`left`/`width`/`height` from
      `calc(50% - var(--object-size) * .05)` and `calc(var(--object-size) * .1)`;
      `.cylinder .highlight, .cone .highlight` repeats the same two literals for `left` and
      `width` only, deliberately leaving `top`/`height` at the inherited `0` / `100%` so the
      cylinder's highlight is a full-height stripe rather than a dot.

      The `.05` is only ever *half* of the `.1` — that is the relationship that keeps the
      highlight centred, and right now it is expressed nowhere. Change either literal on its own
      and the highlight goes off-centre with no error. Replace both with a connected pair:

      ```css
      --highlight-size: calc(var(--object-size) * .1);
      --highlight-inset: calc(50% - var(--highlight-size) / 2);
      ```

      declared once on `.curved-lighting` (which all three shapes share) so each shape overrides
      only the axis that genuinely differs.

      The **angles and translate need the same treatment**. Today the sphere orients its
      highlight with `var(--shade-orient) rotateY(0deg) translateZ(var(--lighting-translate))`
      and sets `--lighting-translate: var(--object-size-half)`, while cylinder/cone write
      `translateZ(var(--object-size-half))` literally and then apply
      `rotateX(var(--highlight-angle)) scaleX(var(--highlight-scale))`. That is the same
      translate expressed two different ways, and `--highlight-angle` exists for two of the three
      shapes. Giving the sphere `--highlight-angle: 0deg` and routing all three through
      `--lighting-translate` would let one transform serve all three, with each shape supplying
      only its own angle and scale. Do this **before** hemisphere and octantsphere land, since
      both will need a highlight and would otherwise be a third and fourth copy.

- [ ] **Give `#environment-layer` a `.scene` wrapper.** It is the only layer without one
      (`index.html:9`), so scene rotation is written out across 3 elements + 4 pseudo-elements
      at `styles.css:582` instead of being inherited once. Carried from F8; still true.
- [ ] **Audit the 53 `inherits: true` registrations.** Confirmed *not* a bottleneck — P2
      measured 50 extra inheriting registered properties on `body` at zero cost. This is a
      clarity change only. **Trap:** anything read from `::before`/`::after` must stay
      `inherits: true`; pseudo-elements only see a custom property if it inherits.

### D. Housekeeping

- [ ] `styles.css:783` still says "Shapes still to port… cylinder n+4, cone n+5". Both are
      ported, and cone uses `n+3`. Correct it to the three shapes actually remaining.
- [ ] **The cone has no `--cone-angle`.** `.cylinder` sets `90deg`; the cone needs `63.435deg`
      (`styles2.css:1643`, "side angle of cone, height = diameter") and sets nothing, so it now
      falls back to the registered initial `90deg` and behaves as a cylinder. Before registration
      it fell back to *invalid*, which is why `.cone .highlight`'s transform resolved to `none`.
      Part of "TO UPDATE: cone doesn't work".
- [ ] F10's body-level dead properties (`--light-normal-11/12/21/22/31/32`,
      `--scene-normal-31/32/33`). **Recommendation: leave them.** Body-level, so the cost
      doesn't scale with object count, and the remaining port needs them back. Listed so it
      isn't rediscovered as a finding a third time.

### E. Blocked / on hold

- [ ] **Stage 3 — `@function` refactor (F7).** Gated on release-Safari support, which is
      required for this project and still unconfirmed (STP 27.0 has it; release 26.5.2
      untested — the release-Safari MCP server wouldn't connect). Sample code is written and
      parked in `styles-functions-sample.css`, not linked from `index.html`.
      **Adopt §1 (`--dot3()`) and §2 (`--corner()`) only** — §9's caveat is that the
      Euler-preamble variant would recompute `sin`/`cos` per call on 180 faces and *cost* time.
      Firefox has neither `@function` nor `if()`; if Firefox becomes a requirement this is dead
      rather than deferred.
- [ ] Meanwhile, the non-gated half: selector consolidation only — merge `.slope`/`.slope-corner`,
      unify the `:nth-child(n+N) { display: none }` rules into one `.face { display: none }`
      plus explicit opt-ins.

---

## 3. To investigate

### I1 — Layer toggling *(probably the best effort/reward left in the file)*

Each of the three scene layers costs roughly a third of style recalc, and hiding one with a
single `display: none` reclaims all of it — measured at **−47%** on `#shade-layer` (P3).
`content-visibility: hidden` and full DOM detachment measure identically; `visibility: hidden`
reclaims nothing and is 17% *worse*.

Proposal: make the shadow and/or shade layer user-toggleable, and/or auto-disable one during an
active drag and restore on release. One line of CSS, independent of every other item here.

**Caveat that constrains the design:** this works because `#shade-layer` is a *root* with ~1000
elements beneath it. `display: none` skips everything *below* the hidden element; the element's
own computed style is still fully resolved. Hiding leaves buys much less — that's exactly what
F12 had to work around.

### I2 — Is the `--shade-front` → `--before-background` → `background` indirection still worth collapsing?

Listed in the original as a Stage 2 collapse (F8, held). **The case has likely reversed.** When
it was raised, only the flat shapes existed and the hop looked redundant. Now three rules
override `--before-background` with a gradient — sphere (`:1339`), cylinder/cone (`:1525`) —
against the generic `--shade-front` passthrough at `:868-871`. That indirection is the seam
those overrides hang off.

Investigate whether anything is still redundant, but the default answer is now probably "keep".

### I3 — `--light-scene-normal-33`

Registration (`styles.css:79`) and declaration (`:491`) are both still commented out. Its
original consumer, the x-direction dot product, has since been restored for cylinder/cone —
but that implementation reads `--light-normal-13/23/33` directly and does **not** use it.

So it is currently inert with no pending consumer. Decide whether the remaining shapes need it;
if one does, uncomment **both** the registration and the declaration, and register it
`inherits: true` (its siblings `-13`/`-23` were an `inherits: false` bug that silently froze the
sphere gradient at its initial value — F11).

### I4 — `will-change: transform` on `.object`

Three occurrences (`:578`, `:622`, `:717`). This promotes *every* object to its own layer.
Measure memory and layer count against the two `mix-blend-mode` layers before changing anything
(Stage 4). Not yet looked at.

---

## 4. Traps worth knowing before touching this file

Each of these has already cost real debugging time once.

1. **`:where()` in the shade-layer exclusion is load-bearing.** `#shade-layer .face` is (1,1,0).
   Drop the `:where()` and the rule climbs to (1,3,0), outranks `#shade-layer .sphere .face`
   (1,2,0), and silently replaces the sphere's gradient with a flat colour. No error, just a
   wrong render. (F12)
2. **`@property --clip-path` must stay deleted.** `unset` doesn't parse as a `<string>`, so the
   registration was always being dropped — the clipped shapes work *because* it failed. Do not
   "fix" the `initial-value`. (F2)
3. **A `var()` inside a custom property is substituted on the element that declares it**, not
   the one that reads it. `--composed: translateZ(var(--t))` on a parent bakes in the parent's
   `--t` forever. This is why `--shade-orient` carries orientation only and each consumer
   appends its own `translateZ()` in the real `transform`. (F11b)
4. **`inherits: false` on a `body`-level property that a descendant reads** resolves silently to
   the registered `initial-value`. No invalid value, no fallback — just a constant. Cost: the
   sphere's gradient was frozen for an unknown period. (F11)
5. **Scope per-object and per-face properties; leave scene- and light-level singletons on
   `body`.** Scoping a document-wide singleton to `.sphere` makes it worse — N spheres
   recomputing one identical value N times. (F11a)
6. **An unregistered, undeclared `var()` silently deletes the whole declaration.** Not just the
   `var()` — the entire property becomes invalid at computed-value time and falls back to
   inherited/initial. `--background-rotation` killed a gradient on `#shade-layer .cylinder` that
   consequently never painted in either stylesheet, and `--cone-angle` killed `.cone .highlight`'s
   whole `transform`. Both looked like "that feature isn't finished" rather than a typo.
   Registering every property is what makes this class of failure impossible — but note that
   registering an already-broken one *switches the declaration on*, which is a visual change.
7. **Chrome under-reports this architecture by ~2× at rest**, because it shares computed style
   across elements whose values match. See §5.

---

## 5. Measurement and verification methodology *(preserved for replication)*

Carried forward from `styles-refactor-plan.md` §2 and §8. Every measurement in either document
must satisfy this. The original contains two worked examples of what happens otherwise — F13
nearly produced a false finding twice, and F12's first version reached the **opposite**
conclusion.

### Setup

- Serve locally: `python3 -m http.server 8777`. `file://` works but complicates comparison.
- Engines: Chrome via the `chrome-devtools` MCP; Safari Technology Preview 27.0 via
  `safari-mcp-stp`. The release-Safari MCP server does not connect.
- Standard scene unless stated otherwise: **45 objects / 540 faces, unique per-object rotations,
  unthrottled.**

### The three traps

1. **vsync quantisation.** `requestAnimationFrame` deltas on a 120 Hz display quantise every
   result to a multiple of 8.33 ms — real 15–30% differences vanish or appear as cliffs.
   → Measure a **forced synchronous style recalc** instead: `setProperty`, then
   `getBoundingClientRect`.
2. **Value-level caching.** Cycling a property through a repeating set (`i % 90`) lets the
   engine cache resolved values. Understated cost by roughly **8×** — 6 ms vs 53 ms for
   identical DOM. → Use **never-repeating** values (`45 + seq++ * 0.013`), which is what a real
   slider drag produces.
3. **Cold-start contamination.** The first measurement after cloning DOM includes layer
   allocation and first paint. → Warm up **~200 iterations of every variant**, then sample.

### Sampling protocol

Run variants **A/B/A ×3** (F12 used ×9), take the **median of medians**. F12 sampled 150 per
run, F13 sampled 120 × 3. Warm **both** code paths, not just the one measured first.

Safari's `performance.now()` has 1 ms resolution — hence integer values in the original's
tables. Don't read precision into them that isn't there.

### Benchmark in Safari, or in Chrome with varied rotations

Chrome shares computed style across elements whose declared *and* inherited values match, so at
rest it computes each face's shade math once and reuses it across all objects. The moment
objects rotate independently that sharing collapses and cost roughly doubles:

| Object rotations | Chrome | Safari TP 27 |
|---|---|---|
| All identical (default state) | 7.1 ms | 16 ms |
| All unique (real usage) | 13.3 ms | 17 ms |
| **Ratio** | **1.9×** | **1.06×** |

Chrome-at-rest systematically flatters this architecture. Safari is ~40% slower in absolute
terms but its numbers are honest, and the *relative* wins agree closely across both engines.

### Two static checks — cheap, and catch most of what this kind of refactor breaks

Both should be run after any commenting-out pass:

1. **Strip comments, then check brace/paren balance and look for a `/*` inside a comment.**
   CSS has no nested comments, so commenting out a block that already contains one terminates
   early and silently eats the rest of the file.
2. **Strip comments, collect every `var(--x)` read and every `--x:` declaration, and diff both
   ways.** Reads-with-no-declaration catches things commented out too eagerly.
   Declarations-with-no-read catches what was *just* orphaned — this direction is what found F9.

   Properties set from JS (`--scene-*-unit`, `--light-*-unit`, `--object-*-unit`, `--x/y/z-pos`)
   always appear as unresolved reads. They're backed by `@property` initial values, not by
   declarations, and are expected.

### After each stage

Screenshot-diff every ported shape in **both** engines. Still outstanding — see §2A.

---

## 6. Open questions

1. **Does Firefox matter?** Release Safari is confirmed as a requirement, which defers Stage 3.
   Firefox has neither `@function` nor `if()`, so if it's also required, Stage 3 is dead rather
   than parked. Unanswered.
2. **How many objects should this hold?** 3–5 is comfortable today; 25+ needs Stages 1–2;
   beyond ~50 the per-face architecture needs rethinking rather than tuning. Unanswered.
3. **Is per-shape face generation in `tabs.js` permanently off the table?** F12 measured a
   further ~30% available on an all-sphere scene from detaching hidden faces entirely. Nothing
   in CSS reclaims it — not `display`, not `content-visibility`, not `contain`. It needs fewer
   elements, which costs the uniform DOM and therefore class-only shape switching. Currently
   answered "no" on those grounds; worth revisiting only if object counts need to go up.
