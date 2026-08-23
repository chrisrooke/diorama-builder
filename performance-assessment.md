# Diorama Builder performance assessment

Date: 2026-08-23

## Executive conclusion

The current DOM/CSS architecture does not scale to a 10×10×10 scene. A 1,000-object scene creates 3,000 object figures across the object, shade, and shadow layers, 36,000 face elements, and 42,186 total DOM elements before generated pseudo-elements are counted. In Chrome, a global scene or light update takes about 0.51 seconds of forced style/layout and a rendered frame takes about 3.6 seconds. Safari completed the initial 42,186-element build but its MCP transport terminated on the next interaction.

The primary CSS problem is not `calc()` by itself. It is the combination of:

1. scene and light variables being updated on `body`;
2. many registered, inheriting custom properties derived from those variables;
3. invalidation spreading through all three large render layers; and
4. a very expensive paint/compositing model: three copies of each object, two generated surfaces per face, persistent `will-change`, and blend-mode layers.

At 125 mixed objects in Chrome, freezing the root scene dependency reduced forced recalculation from 72.5 ms to effectively zero. By comparison, replacing the per-face shading arithmetic with constants saved 15.4%. Removing the shade layer saved 51.7% of forced recalculation and about 61.5% of rendered-frame time. This is strong evidence that scoping invalidation and reducing rendered surfaces should come before micro-optimizing individual expressions.

## Scope and method

This assessment was performed against the current `index.html`, `tabs.js`, and active `styles.css`. The unused `styles2.css` was not benchmarked.

Chrome was controlled through the `chrome-devtools` MCP and Safari Technology Preview through `safari-mcp-stp`. Both used a 1440×900 viewport with no CPU or network throttling. The local app was served over HTTP.

Test scenes were created ephemerally in each browser by following the production three-layer object pattern:

- one `figure.object` in each of `#shadow-layer`, `#object-layer`, and `#shade-layer`;
- twelve `.face` children per figure;
- the curved-lighting subtree on the first shade-layer face;
- matching `data-object` identifiers across all three figures; and
- per-object position, rotation, and hue variables.

The main 125- and 1,000-object stress scenes cycled through the shape classes currently exposed by the app, including classes whose ports are still incomplete. Selection and the object rotation slider were checked after injection; all three matching figures were selected and updated together. Shape-specific comparisons and the visually equivalent face-count experiment were restricted to the nine ported shapes.

Two timing modes were used:

- **Forced style/layout:** change a never-repeated CSS variable and immediately read `getBoundingClientRect()`. This measures the synchronous work that blocks an input handler, but does not include all paint/compositing cost.
- **Rendered frames:** change the variable from `requestAnimationFrame()` and measure frame intervals. This includes browser rendering work and exposes paint/compositing bottlenecks.

The optimization experiments used temporary stylesheet overrides or CSSOM edits inside the page. They were removed after each experiment and no test instrumentation was added to the repository.

### Limitations

- Safari's timing resolution is coarser than Chrome's, so its numbers should be treated as approximate.
- The 1,000-object Safari build completed, but the next interaction closed the MCP transport. No Safari ablation experiments could be collected after that failure.
- The tests are local lab measurements on one machine, not field data.
- Some ablations deliberately freeze or simplify visuals to price a dependency chain. They are diagnostic bounds, not direct patches.

## Baseline scaling results

### DOM and initial flush

| Logical objects | Object figures | Face elements | Total DOM elements | Chrome first flush | Safari first flush |
|---:|---:|---:|---:|---:|---:|
| 1 | 3 | 36 | 228 | Small enough to be below the meaningful stress threshold | Small enough to be below the meaningful stress threshold |
| 125 (5³) | 375 | 4,500 | 5,436 | 88.4 ms | 144 ms |
| 1,000 (10³) | 3,000 | 36,000 | 42,186 | 626.6 ms | 859 ms, followed by MCP transport termination on interaction |

Chrome's performance trace for the 1,000-object scene reported a single style recalculation of 897 ms affecting 79,329 elements, including generated/render-tree participants.

### Control updates

Median forced style/layout time:

| Browser and scene | Scene Y | Light Y | One object rotation | One object position | One object hue |
|---|---:|---:|---:|---:|---:|
| Chrome, 1 object | 0.69 ms | 0.62 ms | <0.01 ms | <0.01 ms | <0.01 ms |
| Safari, 1 object | 0.9 ms | 1.0 ms | Below timer resolution | Below timer resolution | Below timer resolution |
| Chrome, 125 mixed | 67.5 ms | 67.0 ms | 0.6 ms | 0.2 ms | 0.6 ms |
| Safari, 125 mixed | 110.5 ms | 99.5 ms | 1.0 ms | <0.5 ms | 0.5 ms |
| Chrome, 1,000 mixed | 510.7 ms | 517.4 ms | 1.0 ms | 0.5 ms | 0.6 ms |

The local object controls scale well because they update only three figures. Global scene and light controls scale with most of the rendered document because their source variables live on `body`.

Object selection itself remained relatively cheap: approximately 0.25 ms at 125 objects and 1.85 ms at 1,000 objects in Chrome, despite the current `querySelectorAll('[data-object]')` deselection pass.

### Rendered frames

| Browser and scene | Scene rotation median frame | Light rotation median frame | Approximate rate |
|---|---:|---:|---:|
| Chrome, 1 object | 8.3 ms | 8.3 ms | Display-limited on the 120 Hz test display |
| Safari, 1 object | 17 ms | 17 ms | Display-limited near 60 Hz |
| Chrome, 125 mixed | 191.7 ms | 178.8 ms | 5–6 fps |
| Safari, 125 mixed | 110 ms | 110 ms | About 9 fps |
| Chrome, 1,000 mixed | 3,625 ms | 3,633 ms | About 0.28 fps |

Chrome's gap between the 125-object forced recalculation (about 67 ms) and rendered frame (about 180–192 ms) shows that style invalidation is important but paint/compositing is the larger end-to-end cost.

## What the CSS is costing

After stripping comments, the active stylesheet contains:

- 225 `@property` registrations, 76 of them inheriting;
- 804 `var()` references;
- 192 `calc()` calls;
- 55 trigonometric function calls;
- 13 `pow()`, 7 `sqrt()`, and 6 `round()` calls; and
- 317 active custom-property declarations.

The densest rules are:

| Rule | Custom-property declarations | Math-function calls |
|---|---:|---:|
| `body` | 43 | 35 |
| `.dodecahedron` | 46 | 29 |
| `.object` | 28 | 26 |
| generic shade-layer face rule | 22 | 24 |

Twenty-six registered properties are never read by active CSS. Most have no active declaration and are cleanup rather than runtime work. Six unused, inheriting light-matrix properties are actively declared on `body`; temporarily deleting those six declarations did not improve the median at 125 objects, so this should not be treated as a performance priority.

### Dependency and layer ablations at 125 mixed objects in Chrome

| Experiment | Baseline | Variant | Change | Interpretation |
|---|---:|---:|---:|---|
| Freeze `--scene-y` above the dependency graph | 72.5 ms | <0.1 ms | ~−100% | Root custom-property propagation is the dominant scene-recalc trigger. |
| Freeze `--light-y` above the dependency graph | 72.7 ms | 0.05 ms | −99.9% | The same is true for light updates. |
| Replace generic per-face shade math with constants | 73.0 ms | 61.8 ms | −15.4% | The arithmetic matters, but is much smaller than invalidation and layer cost. |
| Hide shade layer | 73.4 ms | 35.5 ms | −51.7% | The shade copy and its face rules are the largest style-cost component. |
| Hide shadow layer | 74.3 ms | 55.8 ms | −24.8% | Shadow duplication is the next largest style component. |
| Hide object layer | 74.1 ms | 62.8 ms | −15.2% | Base colour geometry is the smallest of the three object copies. |
| Scope the light chain to shade, shadow, and light-marker targets | 75.7 ms | 62.4 ms | −17.6% | Narrower invalidation is a practical, visual-preserving direction. |

### Paint/compositing ablations at 125 mixed objects in Chrome

| Experiment | Baseline frame | Variant frame | Change |
|---|---:|---:|---:|
| Remove persistent per-object `will-change` | 216.8 ms | 204.5 ms | −5.7% in this sequential run; low confidence |
| Change shade and shadow blending to `normal` | 216.8 ms | 141.7 ms | −34.6% |
| Remove both face pseudo-elements | 216.8 ms | 87.5 ms | −59.7% |
| Hide shade layer | 216.8 ms | 83.4 ms | −61.5% |

The blend and pseudo-element experiments change appearance, so they are not direct fixes. They price the surfaces that must be redesigned or culled if a much larger scene is required.

### Shape-dependent cost at 125 objects in Chrome

| Shape | Scene recalculation | Rendered frame |
|---|---:|---:|
| Sphere | 33.5 ms | 41.7 ms |
| Cylinder | 70.0 ms | 83.2 ms |
| Cube | 79.8 ms | 100.4 ms |
| Dodecahedron | 191.6 ms | 966.7 ms |

The dodecahedron is not merely another object for budgeting purposes. In this test it was about 2.4× the cube's recalculation cost and nearly 10× its rendered-frame cost. Scene limits should therefore use a weighted shape/render-surface budget, not only a logical-object count.

## Recommendations

### 1. Do not target 1,000 simultaneously rendered DOM objects

Treat 10×10×10 as a data-model size, not a live DOM size. Keep logical objects in JavaScript, but render only the visible or actively editable subset. For genuinely dense scenes, use WebGL/canvas with instancing rather than three DOM copies plus pseudo-elements per face.

The current 1,000-object scene is roughly two orders of magnitude over a 60 fps frame budget in Chrome and is unstable through Safari's inspection transport. Expression-level tuning cannot close that gap.

Recommended architecture for larger grids:

1. retain all cells/objects in a scene model;
2. perform frustum, layer, and occlusion culling before DOM creation;
3. create DOM figures only for visible objects;
4. reduce detail for distant or non-selected objects; and
5. switch to an instanced GPU renderer if hundreds of objects must remain visible.

### 2. Remove scene and light drivers from `body`

This is the highest-value CSS-variable change.

For scene rotation:

- update the transforms of the three `.scene` wrappers and the environment faces directly;
- do not make the raw angle and complete scene-normal matrix inherit through every object and face;
- publish scene-normal components only to curved-shape geometry that consumes them; and
- consider calculating the small scene matrix once in JavaScript during slider input, then setting final values on the few required carriers.

A cube-only proof that directly updated six carrier transforms, while preventing `--scene-y` from inheriting through the object trees, reduced forced recalculation from 79.3 ms to below 0.1 ms at 125 objects. The rendered frame improved by a smaller 16.4%, from 100.7 ms to 84.2 ms, because paint remained expensive. This is still worthwhile, but it must be paired with surface reduction.

For light rotation:

- put the full light-normal chain only on `#shade-layer` and `#shadow-layer`;
- give `#light` only the two angles required by its transform; and
- update these three fixed targets from the slider rather than updating `body`.

The scoped light prototype reduced forced recalculation by 17.6% at 125 mixed objects without hiding a render layer.

### 3. Reduce surfaces that are actually rendered

Each logical object currently creates three figures, 36 face elements, and up to 72 face pseudo-elements before curved-lighting descendants are counted. This dominates paint at scale.

Priorities:

- Keep the uniform twelve-face DOM unless another requirement justifies changing it. In a visually equivalent test using only the nine ported shapes, removing already-hidden surplus faces reduced the scene from 4,500 to 1,875 face elements but changed forced recalculation by only −4.2% and made the median rendered frame 2.4% slower. Both differences are small enough to treat as no benefit. The earlier apparent improvement came from also deleting faces from not-yet-ported shape classes, which changed what was rendered.
- Cull genuinely invisible geometry, such as interior faces in a dense voxel structure, before it reaches paint. This is different from removing faces already excluded by `display: none`.
- Investigate whether back surfaces can be created only for the selected “see inside” object rather than for every face in every object. This requires a visual-equivalence test because removing only one pseudo-element may not avoid the face's renderer cost.
- Consider lower-detail shade/shadow geometry for unselected objects.
- Explore a single rendered layer or precombined colours where visual requirements allow it. The current shade copy is the largest style and paint component.

### 4. Make `will-change` temporary and coarse-grained

`will-change: transform` is currently applied to every `.object` in all three layers, which becomes 3,000 hints in the 1,000-object scene. Test replacing the permanent hints with hints applied only while an object is actively manipulated, or promote a small number of scene/layer wrappers instead.

Removing the object-level hint improved one 125-object Chrome run by 5.7%, but this was a small sequential result and should not be treated as proven. Make this change only after inspecting compositor-layer count and repeating an interleaved visual benchmark.

### 5. Treat blend modes as an explicit performance budget

Changing the shade and shadow layers to normal blending improved the 125-object Chrome frame by 34.6%, but changes the image. Do not simply remove blending; prototype alternatives:

- precombine shade with the object's base colour;
- constrain the blended layer to the smallest possible painted area;
- use simpler shading for non-selected or distant objects; or
- move colour and lighting to a fragment shader in a GPU renderer.

### 6. Optimize the per-face math after invalidation is scoped

The generic shade calculation is a real secondary cost: neutralizing it saved 15.4% of a light update. After the root-variable work:

- inline single-use pass-through custom properties where it reduces computed-property storage without duplicating expensive math;
- avoid recomputing object rotation matrices in all three copies when final values can be calculated once per logical object;
- specialize common shapes rather than forcing them through general formulae; and
- keep correctness snapshots for boundary angles, curved highlights, and front/back shade selection.

Do not begin by replacing every `calc()` with JavaScript. Single-object rotation, position, and hue changes are already around 0.5–1 ms even in the 1,000-object Chrome scene. The expensive path is a global inherited change.

### 7. Use weighted performance limits and regression tests

Define budgets for:

- visible logical objects;
- face/pseudo-element count;
- dodecahedron-equivalent complexity;
- scene/light input latency; and
- rendered frame time.

Suggested automated cases are 1 object, 5³ mixed objects, the maximum supported visible budget, all dodecahedra as a worst case, and a 10³ logical scene with culling enabled. Record both forced recalculation and rendered-frame metrics because either number alone gives an incomplete diagnosis.

## Implementation order

1. Introduce a scene model plus visible-object culling and decide the maximum live render budget.
2. Move light state off `body` to the shade/shadow/light carriers.
3. Split scene transform updates from scene-normal data; directly transform fixed carriers and scope matrix values to consumers.
4. Add culling for genuinely invisible/interior geometry; do not prioritize removal of already-hidden surplus faces.
5. Re-test permanent object-level `will-change` with compositor-layer and memory evidence before changing it.
6. Prototype shade/blend alternatives and reduced detail.
7. Only then simplify the remaining per-face custom-property chains.

## Comparison with the previous Claude report

This section was added only after the independent assessment above was complete.

### Findings that independently agree

The two assessments converge on the important conclusions:

- Root-level inherited custom-property changes are the main style-recalculation problem. Both found that scene rotation can become effectively free for flat shapes when it is driven through non-inheriting values on the small set of transform carriers.
- Moving the light chain off `body` is the safest immediate CSS-variable improvement. Claude measured a 24% forced-recalc reduction at 45 mixed objects; this assessment's independent scoped prototype measured 17.6% at 125 mixed objects. The exact percentages differ, but the dependency analysis and direction agree.
- Single-object controls are already cheap and do not need a broad rewrite. Both measured rotation at roughly 0.5–1 ms and position at roughly 0.2–0.5 ms across much larger scenes.
- The shade layer is approximately half of forced recalculation and the dominant paint cost at higher counts. Both also found blend modes increasingly expensive once the workload becomes paint-bound.
- The dodecahedron is the clear shape outlier, at roughly 2–3× a cube's style cost. This assessment additionally observed a much larger rendered-frame penalty at 125 dodecahedra.
- Large solid grids are not reachable through expression tuning. Claude reached the same conclusion at 512 objects; this assessment extended the stress test to 1,000 and observed 3.6-second Chrome frames and Safari MCP failure after the initial flush.
- Optimizing individual curved-shape expressions is lower priority than scoping invalidation, reducing painted area, and establishing a live-render budget.

### Differences and corrections

- **Hidden face nodes:** Claude reported no benefit from generating fewer already-hidden faces. My initial broad stress run appeared to disagree, but it included not-yet-ported shape classes and therefore changed the rendered output. A corrected nine-ported-shape run reduced face nodes by 58% with no frame improvement, so the final conclusion agrees with Claude: keep the uniform DOM unless implementing real visibility/occlusion culling.
- **`will-change`:** Claude found no effect at 45 and 100 objects. This assessment saw a 5.7% improvement in one 125-object sequential run. That is not strong enough to overturn Claude's repeated result; `will-change` is left as a low-priority compositor/memory investigation, not a recommended immediate removal.
- **Ablation percentages:** Claude used paired interleaving and sham controls, while this assessment used fresh sequential baselines and deliberately large diagnostic changes. Exact small percentages should therefore come from Claude's more controlled protocol. The independent tests are strongest as confirmation of the ranking and of the 125/1,000-object failure modes.
- **Safari route:** Claude's report ultimately used AppleScript after its Safari MCP failed. This assessment obtained its Safari measurements through `safari-mcp-stp` as requested, until the 1,000-object interaction terminated that transport.
- **`@property`:** Claude separately measured typed registrations as a major speedup. This assessment counted and traced registrations but did not repeat the destructive all-registration probe, so it neither independently confirms nor contradicts that result. Nothing here recommends reducing registration coverage.

Claude's report contains earlier recommendations that are explicitly withdrawn or corrected in its later sections. Its final ranking—move the light chain, then de-inherit the scene chain, then address shade-layer paint and large-scene culling—matches the independent ranking here. The main addition from this assessment is the explicit 10×10×10 failure measurement and the recommendation to treat 1,000 objects as model data rather than simultaneously rendered DOM.
