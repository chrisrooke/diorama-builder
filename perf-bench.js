/* perf-bench.js — measurement harness for the styles.css refactor.
   Not linked from index.html; injected by the MCP driver during testing.
   Methodology: styles-refactor-plan.md §2 / styles-refactor-next.md §5.
     - forced synchronous style recalc (setProperty then getBoundingClientRect),
       not rAF deltas, to dodge vsync quantisation
     - never-repeating driver values, to defeat value-level caching
     - warm every variant before sampling; A/B/A xN, median of medians       */
(function () {
'use strict';

/* Faces each shape actually uses, read off the display:none list in T05B.
   The DOM always builds 12 (tabs.js), so the surplus is hidden rather than absent. */
var FACES_USED = {
  cube: 6, tetrahedron: 4, pyramid: 5, slope: 5, 'slope-corner': 5,
  dodecahedron: 12, sphere: 1, cylinder: 3, cone: 4
};

var SHADE_FIRST_FACE =
  '<div class="face"><div class="curved-lighting">' +
  '<div class="top-bottom"></div><div class="highlight"></div></div></div>';

function faces(n) {
  var s = '';
  for (var i = 0; i < n; i++) s += '<div class="face"></div>';
  return s;
}

function scenes() {
  return {
    shadow: document.querySelector('#shadow-layer .scene'),
    object: document.querySelector('#object-layer .scene'),
    shade:  document.querySelector('#shade-layer .scene'),
    light:  document.getElementById('light')
  };
}

function clearScene() {
  var s = scenes();
  ['shadow', 'object', 'shade'].forEach(function (k) {
    var nodes = s[k].querySelectorAll(':scope > figure.object');
    for (var i = 0; i < nodes.length; i++) nodes[i].remove();
  });
}

/* Build n objects across all three layers. shapes is cycled. */
function build(n, shapes, opts) {
  opts = opts || {};
  var unique = opts.uniqueRotations !== false;
  clearScene();
  var s = scenes();
  var trim = !!opts.trimFaces;
  for (var i = 0; i < n; i++) {
    var shape = shapes[i % shapes.length];
    var count = trim ? (FACES_USED[shape] || 12) : 12;
    var plain = faces(count);
    var shade = SHADE_FIRST_FACE + faces(count - 1);
    var figs = [];
    for (var l = 0; l < 3; l++) {
      var f = document.createElement('figure');
      f.className = 'object ' + shape;
      f.dataset.object = 'bench' + i;
      f.innerHTML = (l === 2) ? shade : plain;
      figs.push(f);
    }
    s.shadow.appendChild(figs[0]);
    if (s.light) s.object.insertBefore(figs[1], s.light);
    else s.object.appendChild(figs[1]);
    s.shade.appendChild(figs[2]);

    var x = i % 5, z = Math.floor(i / 5) % 5, y = Math.floor(i / 25);
    var rx = unique ? (i * 37.3) % 360 : 0;
    var ry = unique ? (i * 53.7) % 360 : 0;
    var rz = unique ? (i * 71.1) % 360 : 0;
    for (var j = 0; j < 3; j++) {
      var st = figs[j].style;
      st.setProperty('--x-pos', String(x));
      st.setProperty('--y-pos', String(y));
      st.setProperty('--z-pos', String(z));
      st.setProperty('--object-x-unit', String(rx));
      st.setProperty('--object-y-unit', String(ry));
      st.setProperty('--object-z-unit', String(rz));
      st.setProperty('--hue', String((i * 23) % 360));
    }
  }
  document.body.getBoundingClientRect();
  var faceCount = document.querySelectorAll('.scene .object > .face').length;
  return { objects: n, faceElements: faceCount, trimmed: trim, shapes: shapes.slice() };
}

/* ---- ablations -------------------------------------------------------- */
/* Each neutralises one calc chain by overriding its outputs with constants at
   equal specificity, later in the cascade. A losing declaration is never
   computed, so the delta is that chain's own cost. Downstream consumers keep
   running, on constant inputs. */

var ABLATIONS = {

  /* T05B: the whole generic per-face shade chain (trig -> face normal ->
     face*object normal -> dot product -> shade value -> colour). F4. */
  'shade-chain': [
    '#shade-layer .face{',
    '--face-x-calc:0deg;--face-y-calc:0deg;',
    '--s-fx:0;--c-fx:1;--s-fy:0;--c-fy:1;',
    '--face-normal-13:0;--face-normal-23:0;--face-normal-33:1;',
    '--face-object-normal-13:0;--face-object-normal-23:0;--face-object-normal-33:1;',
    '--dot-product:.5;',
    '--shade-value-front:62.5;--shade-value-back:37.5;',
    '--shade-front:hsl(0 0 62.5%);--shade-back:hsl(0 0 37.5%);',
    '}'
  ].join(''),

  /* Just the four sin/cos on each face. */
  'face-trig': [
    '#shade-layer .face{',
    '--face-x-calc:0deg;--face-y-calc:0deg;',
    '--s-fx:0;--c-fx:1;--s-fy:0;--c-fy:1;}'
  ].join(''),

  /* Just the two 3-term matrix rows (face normal x object normal). */
  'face-object-matrix': [
    '#shade-layer .face{',
    '--face-object-normal-13:0;--face-object-normal-23:0;--face-object-normal-33:1;}'
  ].join(''),

  /* Just the round()/clamp() banding that turns a dot product into a lightness. */
  'shade-banding':
    '#shade-layer .face{--shade-value-front:62.5;--shade-value-back:37.5;}',

  /* Per-object rotation matrix: 6 trig + 9 matrix terms on every .object in
     all three layers. */
  'object-matrix': [
    '.object{',
    '--object-x-calc:0deg;--object-y-calc:0deg;--object-z-calc:0deg;',
    '--s-ox:0;--c-ox:1;--s-oy:0;--c-oy:1;--s-oz:0;--c-oz:1;',
    '--object-normal-11:1;--object-normal-12:0;--object-normal-13:0;',
    '--object-normal-21:0;--object-normal-22:1;--object-normal-23:0;',
    '--object-normal-31:0;--object-normal-32:0;--object-normal-33:1;}'
  ].join(''),

  /* T07B object-level: scene x object product, normalisation (sqrt+2 pow), px/pz. */
  'curved-object-chain': [
    '#object-layer .cylinder,#shade-layer .cylinder,',
    '#object-layer .cone,#shade-layer .cone{',
    '--object-scene-normal-31:0;--object-scene-normal-33:1;',
    '--norm-denom:1;--px:0;--pz:1;}'
  ].join(''),

  /* T07B: light direction expressed in object space, + the bright-side angle. */
  'curved-light-chain': [
    '#shade-layer .cylinder,#shadow-layer .cylinder,',
    '#shade-layer .cone,#shadow-layer .cone{',
    '--light-cylinder-normal-a:0;--light-cylinder-normal-b:0;--light-cylinder-normal-c:1;}',
    '#shade-layer .cylinder,#shade-layer .cone{',
    '--face-bright-y-deg:0deg;--face-bright-y-calc:0deg;}'
  ].join(''),

  /* T07Bii: the cone silhouette chain (asin/abs/tan/sign/atan2, view arm). */
  'cone-silhouette': [
    '#object-layer .cone,#shade-layer .cone{',
    '--object-scene-normal-32:0;--scene-x-angle:0deg;--scene-x-abs:0deg;',
    '--cone-side-visible:1;--silhouette-offset:0deg;',
    '--silhouette-left-angle:0deg;--silhouette-right-angle:0deg;}'
  ].join(''),

  /* T07Bii: the same chain run from the light, for the shadow. */
  'cone-shadow-silhouette': [
    '#shadow-layer .cone{',
    '--shadow-dot-product:0;--shadow-x-angle:0deg;--shadow-x-abs:0deg;',
    '--shadow-offset:0deg;--shadow-left-angle:0deg;--shadow-right-angle:0deg;}'
  ].join(''),

  /* The highlight's bright dot product + scale. */
  'bright-dot': [
    '#shade-layer .cylinder,#shade-layer .cone{',
    '--face-bright-normal-a:0;--face-bright-normal-b:0;--face-bright-normal-c:1;',
    '--bright-dot-product:1;}',
    '.cylinder .highlight,.cone .highlight{--highlight-scale:1;}'
  ].join(''),

  /* T07B first-face gradient direction (column-1 chain + its dot product). */
  'curved-gradient-direction': [
    '#shade-layer .cylinder .face:first-child,#shade-layer .cone .face:first-child,',
    '#shade-layer .cone .face:nth-child(3),#shade-layer .cone .face:nth-child(4){',
    '--face-normal-11:1;--face-normal-21:0;--face-normal-31:0;',
    '--face-object-normal-11:1;--face-object-normal-21:0;--face-object-normal-31:0;',
    '--dot-product-light-scene-face-object-scene-x:1;}'
  ].join(''),

  /* Sphere gradient angle (one atan2 per sphere face). */
  'sphere-gradient': [
    '#shade-layer .sphere .face{--lighting-bg-angle:180deg;}'
  ].join(''),

  /* Compositing hints. Only visible in a paint/composite measurement. */
  'will-change': '.object{will-change:auto;}',
  'scene-will-change': '.scene{will-change:auto;}',
  'blend': '#shade-layer{mix-blend-mode:normal;}',


  /* Per-object corner chain -> --elevation-surface. 8 terms on a cube, 4 on a
     tetra/pyramid, 6 on a slope, 20 on a dodecahedron, plus an N-arg min().
     Runs in all three layers. */
  'corner-chain': [
    '.cube,.tetrahedron,.pyramid,.slope,.slope-corner,.dodecahedron{',
    (function () { var s = ''; for (var i = 1; i <= 20; i++) s += '--corner' + i + ':0px;'; return s; })(),
    '--elevation-surface:0px;}'
  ].join(''),

  /* The three row-2 terms feeding every corner expression. Declared on .object,
     so they are computed for curved shapes too, which never read them. */
  'corner-R': '.object{--corner-Rx:0;--corner-Ry:1;--corner-Rz:0;}',


  /* Backface culling. Already applied to both pseudo-elements; this turns it
     off, to price it in either direction. */
  'backface-visible': '.face::before,.face::after,.curved-lighting,.curved-lighting::before,.curved-lighting::after,.curved-lighting .top-bottom,.curved-lighting .top-bottom::before,.curved-lighting .top-bottom::after,.highlight{backface-visibility:visible;}',

  /* Drop the back face of every face -- the "see inside the object" surface.
     ::before alone for comparison. */
  'no-after-pseudo':  '.face::after{content:none;}',
  'no-before-pseudo': '.face::before{content:none;}',

  /* The two pseudo-element boxes on every face. Visually load-bearing; measured
     only to size the element-count lever. */
  'no-pseudo': '.face::before,.face::after{content:none;}',

  /* Whole-layer removal, to attribute cost per layer. */
  'no-shadow-layer': '#shadow-layer{display:none;}',
  'no-object-layer': '#object-layer{display:none;}',
  'no-shade-layer': '#shade-layer{display:none;}',
  'no-environment-layer': '#environment-layer{display:none;}',

  /* Everything above that is a pure calc chain, at once. Upper bound. */
  'all-calc': null   /* filled in below */
};

ABLATIONS['all-calc'] = [
  'shade-chain', 'object-matrix', 'curved-object-chain', 'curved-light-chain',
  'cone-silhouette', 'cone-shadow-silhouette', 'bright-dot',
  'curved-gradient-direction', 'sphere-gradient', 'corner-chain', 'corner-R'
].map(function (k) { return ABLATIONS[k]; }).join('\n');


/* Control for the override method itself. An ablation replaces a calc with a
   constant, but it does so by ADDING a declaration -- and declaration count is
   itself a cost. This sham applies the same declarations on the same selectors
   with the property names renamed, so nothing real is overridden and no
   arithmetic is saved. Its delta is the overhead the method adds; subtract it
   from every override result to recover the arithmetic alone. In Safari the
   overhead can exceed the saving, which is why raw override deltas there can
   come out positive. */
ABLATIONS['sham-all-calc'] = ABLATIONS['all-calc'].replace(/--(?!zz-)/g, '--zz-');
ABLATIONS['sham-shade-chain'] = ABLATIONS['shade-chain'].replace(/--(?!zz-)/g, '--zz-');

/* The style container query can't be neutralised by a cascade override —
   it is removed from the sheet and put back. */
var containerRule = null, containerParent = null, containerIndex = -1;

function findContainerRule() {
  for (var i = 0; i < document.styleSheets.length; i++) {
    var sheet = document.styleSheets[i], rules;
    try { rules = sheet.cssRules; } catch (e) { continue; }
    for (var j = 0; j < rules.length; j++) {
      var r = rules[j];
      if (r.constructor && /Container/.test(r.constructor.name) &&
          /object-scene-normal-32/.test(r.conditionText || r.cssText)) {
        return { parent: sheet, index: j, text: r.cssText };
      }
    }
  }
  return null;
}

function setContainerQuery(on) {
  if (!on && containerRule === null) {
    var found = findContainerRule();
    if (!found) return false;
    containerRule = found.text; containerParent = found.parent; containerIndex = found.index;
    containerParent.deleteRule(containerIndex);
    return true;
  }
  if (on && containerRule !== null) {
    containerParent.insertRule(containerRule, containerIndex);
    containerRule = null;
    return true;
  }
  return true;
}

function styleEl() {
  var el = document.getElementById('bench-ablation');
  if (!el) {
    el = document.createElement('style');
    el.id = 'bench-ablation';
    document.head.appendChild(el);
  }
  return el;
}

function setAblation(name) {
  setContainerQuery(true);                       /* restore if removed */
  var el = styleEl();
  if (!name || name === 'baseline') { el.textContent = ''; }
  else if (name === 'style-container-query') { el.textContent = ''; setContainerQuery(false); }
  else { el.textContent = ABLATIONS[name] || ''; }
  document.body.getBoundingClientRect();
}

/* ---- measurement ------------------------------------------------------ */

var seq = 0;

function sample(iterations) {
  var st = document.body.style, out = [], i, v, t0;
  for (i = 0; i < iterations; i++) {
    v = 45 + (seq++) * 0.013;          /* never repeats */
    t0 = performance.now();
    st.setProperty('--scene-y-unit', String(v));
    document.body.getBoundingClientRect();
    out.push(performance.now() - t0);
  }
  return out;
}

function median(a) {
  var b = a.slice().sort(function (x, y) { return x - y; });
  return b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2;
}

/* A/B/A xN across variants; median of per-run medians. */
function run(variants, opts) {
  opts = opts || {};
  var warm = opts.warm || 200, samples = opts.samples || 150, reps = opts.reps || 3;
  var i, r, v;
  for (i = 0; i < variants.length; i++) { setAblation(variants[i]); sample(warm); }
  var runs = {};
  for (i = 0; i < variants.length; i++) runs[variants[i]] = [];
  for (r = 0; r < reps; r++) {
    for (i = 0; i < variants.length; i++) {
      v = variants[i];
      setAblation(v);
      sample(40);                       /* re-warm this path */
      runs[v].push(median(sample(samples)));
    }
  }
  setAblation(null);
  var out = {};
  for (i = 0; i < variants.length; i++) out[variants[i]] = median(runs[variants[i]]);
  return { medians: out, runs: runs, samples: samples, reps: reps };
}

/* Animation-frame cost, for the things a forced recalc can't see
   (paint, compositing, blend, will-change). */
function frames(count) {
  return new Promise(function (resolve) {
    var st = document.body.style, times = [], last = 0, n = 0;
    function step(t) {
      if (last) times.push(t - last);
      last = t;
      st.setProperty('--scene-y-unit', String(45 + (seq++) * 0.013));
      if (++n < count) requestAnimationFrame(step);
      else resolve({ median: median(times), mean: times.reduce(function(a,b){return a+b;},0)/times.length,
                     p95: times.slice().sort(function(a,b){return a-b;})[Math.floor(times.length*0.95)] });
    }
    requestAnimationFrame(step);
  });
}


/* Paired interleaved A/B. Switching the sheet between every sample means any
   machine interference lands on both arms equally, which is what makes small
   effects (<5%) readable at all. Two untimed flushes after each switch absorb
   the full rule-match pass a sheet change forces. */
function pair(a, b, n, warm) {
  n = n || 120; warm = warm || 80;
  setAblation(a); sample(warm);
  setAblation(b); sample(warm);
  var A = [], B = [];
  for (var i = 0; i < n; i++) {
    setAblation(a); sample(2); A.push(sample(1)[0]);
    setAblation(b); sample(2); B.push(sample(1)[0]);
  }
  setAblation(null);
  var ma = median(A), mb = median(B);
  return {
    a: a, b: b, n: n,
    aMs: +ma.toFixed(3), bMs: +mb.toFixed(3),
    deltaPct: +(100 * (mb - ma) / ma).toFixed(1),
    aQ1: +percentile(A, 25).toFixed(3), bQ1: +percentile(B, 25).toFixed(3),
    deltaQ1Pct: +(100 * (percentile(B,25) - percentile(A,25)) / percentile(A,25)).toFixed(1)
  };
}

function percentile(arr, p) {
  var b = arr.slice().sort(function (x, y) { return x - y; });
  return b[Math.min(b.length - 1, Math.floor(b.length * p / 100))];
}

/* Every ablation against baseline, paired. */
function sweep(names, n, warm) {
  var out = [];
  for (var i = 0; i < names.length; i++) out.push(pair('baseline', names[i], n, warm));
  return out;
}


/* ---- @property registration probe ------------------------------------ *
   A cascade override can't measure what the typed-property machinery itself
   costs: overriding a value still leaves the property registered, and every
   inheriting registered property has to be resolved and stored on every
   element. The only way to price that is to remove the registrations. This
   changes semantics (an unregistered custom property is substituted as tokens
   at var() time rather than computed eagerly), so it is a cost probe, not a
   proposed change. */
var removedProps = null;

function removeProperties(filter) {
  if (removedProps) return removedProps.length;
  removedProps = [];
  for (var i = 0; i < document.styleSheets.length; i++) {
    var sh = document.styleSheets[i], rules;
    try { rules = sh.cssRules; } catch (e) { continue; }
    for (var j = rules.length - 1; j >= 0; j--) {
      var r = rules[j];
      if (r.constructor.name !== 'CSSPropertyRule') continue;
      var inh = /inherits\s*:\s*true/.test(r.cssText);
      if (filter === 'inheriting' && !inh) continue;
      if (filter === 'non-inheriting' && inh) continue;
      removedProps.push({ sheet: sh, index: j, text: r.cssText });
      sh.deleteRule(j);
    }
  }
  document.body.getBoundingClientRect();
  return removedProps.length;
}

function restoreProperties() {
  if (!removedProps) return 0;
  var n = removedProps.length;
  for (var i = removedProps.length - 1; i >= 0; i--) {
    var e = removedProps[i];
    try { e.sheet.insertRule(e.text, e.index); } catch (err) {}
  }
  removedProps = null;
  document.body.getBoundingClientRect();
  return n;
}

function countProperties() {
  var all = 0, inh = 0;
  for (var i = 0; i < document.styleSheets.length; i++) {
    var sh = document.styleSheets[i], rules;
    try { rules = sh.cssRules; } catch (e) { continue; }
    for (var j = 0; j < rules.length; j++) {
      if (rules[j].constructor.name !== 'CSSPropertyRule') continue;
      all++;
      if (/inherits\s*:\s*true/.test(rules[j].cssText)) inh++;
    }
  }
  return { total: all, inheriting: inh };
}

/* Paired A/B where the B arm is a callback pair rather than a stylesheet. */
function pairFn(applyB, undoB, n, warm) {
  n = n || 100; warm = warm || 80;
  sample(warm); applyB(); sample(warm); undoB(); 
  var A = [], B = [];
  for (var i = 0; i < n; i++) {
    sample(2); A.push(sample(1)[0]);
    applyB(); sample(2); B.push(sample(1)[0]); undoB();
  }
  var ma = median(A), mb = median(B);
  return { aMs: +ma.toFixed(3), bMs: +mb.toFixed(3), deltaPct: +(100 * (mb - ma) / ma).toFixed(1) };
}

/* Style-recalc only, no layout: getComputedStyle flushes style but not layout. */
function sampleStyleOnly(iterations) {
  var st = document.body.style, out = [], probe = document.querySelector('#shade-layer .face') || document.body;
  for (var i = 0; i < iterations; i++) {
    var v = 45 + (seq++) * 0.013;
    var t0 = performance.now();
    st.setProperty('--scene-y-unit', String(v));
    getComputedStyle(probe).getPropertyValue('--shade-front');
    out.push(performance.now() - t0);
  }
  return out;
}


/* ---- rule deletion probe ---------------------------------------------- *
   An override ablation replaces a calc with a constant, so the property is
   still declared, computed and stored on the element -- it prices the
   arithmetic only. Deleting the rule outright removes the declaration as
   well. The gap between the two is what the per-property machinery costs,
   as distinct from the maths inside it. */
var deletedRules = null;

function deleteRulesMatching(pattern) {
  if (deletedRules) restoreRules();
  var re = new RegExp(pattern);
  deletedRules = [];
  for (var i = 0; i < document.styleSheets.length; i++) {
    var sh = document.styleSheets[i], rules;
    try { rules = sh.cssRules; } catch (e) { continue; }
    for (var j = rules.length - 1; j >= 0; j--) {
      var r = rules[j];
      if (r.constructor.name !== 'CSSStyleRule') continue;
      if (!re.test(r.selectorText)) continue;
      deletedRules.push({ sheet: sh, index: j, text: r.cssText });
      sh.deleteRule(j);
    }
  }
  document.body.getBoundingClientRect();
  return deletedRules.length;
}

function restoreRules() {
  if (!deletedRules) return 0;
  var n = deletedRules.length;
  for (var i = deletedRules.length - 1; i >= 0; i--) {
    var e = deletedRules[i];
    try { e.sheet.insertRule(e.text, e.index); } catch (err) {}
  }
  deletedRules = null;
  document.body.getBoundingClientRect();
  return n;
}


/* ---- batched timing (Safari) ------------------------------------------ *
   Safari's performance.now() has 1ms resolution, which at ~30ms per recalc
   is ~3% granularity -- too coarse to read a 2% effect. Timing K recalcs per
   sample and dividing puts the granularity back under 0.5%. Each recalc in
   the batch is still an independent forced sync recalc on a never-repeating
   value, so nothing is cached across them. */
function sampleBatched(samples, batch) {
  batch = batch || 10;
  var st = document.body.style, out = [], i, k, t0;
  for (i = 0; i < samples; i++) {
    t0 = performance.now();
    for (k = 0; k < batch; k++) {
      st.setProperty('--scene-y-unit', String(45 + (seq++) * 0.013));
      document.body.getBoundingClientRect();
    }
    out.push((performance.now() - t0) / batch);
  }
  return out;
}

function pairBatched(a, b, n, warm, batch) {
  n = n || 40; warm = warm || 8; batch = batch || 10;
  setAblation(a); sampleBatched(warm, batch);
  setAblation(b); sampleBatched(warm, batch);
  var A = [], B = [];
  for (var i = 0; i < n; i++) {
    setAblation(a); sampleBatched(1, 3); A.push(sampleBatched(1, batch)[0]);
    setAblation(b); sampleBatched(1, 3); B.push(sampleBatched(1, batch)[0]);
  }
  setAblation(null);
  var ma = median(A), mb = median(B);
  return { a: a, b: b, aMs: +ma.toFixed(3), bMs: +mb.toFixed(3),
           deltaPct: +(100 * (mb - ma) / ma).toFixed(1) };
}

function sweepBatched(names, n, warm, batch) {
  var out = [];
  for (var i = 0; i < names.length; i++) {
    var r = pairBatched('baseline', names[i], n, warm, batch);
    out.push({ ablation: names[i], base: r.aMs, ablated: r.bMs, delta: r.deltaPct + '%' });
  }
  return out;
}


/* ---- shade-rule collapse experiment ----------------------------------- *
   The hottest rule in the file carries 22 custom-property declarations, six of
   which are single-consumer passthroughs. Roughly 40% of a declaration's cost
   is fixed overhead independent of the arithmetic inside it, so folding a
   passthrough into its only consumer should pay even though it duplicates a
   little maths. These four variants are byte-identical in output; only the
   number of intermediate properties differs. */

var SHADE_TAIL =
  '--face-normal-13:calc(var(--s-fy) * var(--c-fx));' +
  '--face-normal-23:calc(-1 * var(--s-fx));' +
  '--face-normal-33:calc(var(--c-fx) * var(--c-fy));' +
  '--face-object-normal-13:calc(var(--object-normal-11) * var(--face-normal-13) + var(--object-normal-12) * var(--face-normal-23) + var(--object-normal-13) * var(--face-normal-33));' +
  '--face-object-normal-23:calc(var(--object-normal-21) * var(--face-normal-13) + var(--object-normal-22) * var(--face-normal-23) + var(--object-normal-23) * var(--face-normal-33));' +
  '--face-object-normal-33:calc(var(--object-normal-31) * var(--face-normal-13) + var(--object-normal-32) * var(--face-normal-23) + var(--object-normal-33) * var(--face-normal-33));' +
  '--dot-product:calc((var(--face-object-normal-13) * var(--light-normal-13)) + (var(--face-object-normal-23) * var(--light-normal-23)) + (var(--face-object-normal-33) * var(--light-normal-33)));';

var SV_FRONT = 'calc(37.5 + (25 * clamp(0, round(down, var(--dot-product) + 1, 1), 1)) + (12.5 * clamp(0, round(down, var(--dot-product) - var(--shade-calc) + 1, 1), 1)))';
var SV_BACK  = 'calc(37.5 + (25 * clamp(0, round(down, 1 - var(--dot-product), 1), 1)) + (12.5 * clamp(0, round(down, 1 - var(--dot-product) - var(--shade-calc), 1), 1)))';

var SHADE_FIXED = '--after-display:block;--before-transform:rotateY(0deg);--after-transform:rotateY(180deg);';

var SHADE_DECLS = {
  /* v0 — as shipped: 22 declarations. */
  v0: '--face-x-calc:calc(var(--face-x-deg) * -1);--face-y-calc:var(--face-y-deg);' +
      '--s-fx:sin(var(--face-x-calc));--c-fx:cos(var(--face-x-calc));' +
      '--s-fy:sin(var(--face-y-calc));--c-fy:cos(var(--face-y-calc));' +
      SHADE_TAIL +
      '--shade-value-front:' + SV_FRONT + ';--shade-value-back:' + SV_BACK + ';' +
      '--shade-front:hsl(0 0 calc(1% * var(--shade-value-front)));' +
      '--shade-back:hsl(0 0 calc(1% * var(--shade-value-back)));' +
      '--before-background:var(--shade-front);--after-background:var(--shade-back);' + SHADE_FIXED,

  /* v1 — 20: --face-x-calc / --face-y-calc folded into the four trig calls.
     Costs one extra negation (it was read twice); saves two properties. */
  v1: '--s-fx:sin(calc(var(--face-x-deg) * -1));--c-fx:cos(calc(var(--face-x-deg) * -1));' +
      '--s-fy:sin(var(--face-y-deg));--c-fy:cos(var(--face-y-deg));' +
      SHADE_TAIL +
      '--shade-value-front:' + SV_FRONT + ';--shade-value-back:' + SV_BACK + ';' +
      '--shade-front:hsl(0 0 calc(1% * var(--shade-value-front)));' +
      '--shade-back:hsl(0 0 calc(1% * var(--shade-value-back)));' +
      '--before-background:var(--shade-front);--after-background:var(--shade-back);' + SHADE_FIXED,

  /* v2 — 18: also folds --shade-value-front/-back into --shade-front/-back.
     Each was read exactly once, so no arithmetic is duplicated. */
  v2: '--s-fx:sin(calc(var(--face-x-deg) * -1));--c-fx:cos(calc(var(--face-x-deg) * -1));' +
      '--s-fy:sin(var(--face-y-deg));--c-fy:cos(var(--face-y-deg));' +
      SHADE_TAIL +
      '--shade-front:hsl(0 0 calc(1% * ' + SV_FRONT + '));' +
      '--shade-back:hsl(0 0 calc(1% * ' + SV_BACK + '));' +
      '--before-background:var(--shade-front);--after-background:var(--shade-back);' + SHADE_FIXED,

  /* v3 — 16: also folds --shade-front/-back into --before/--after-background.
     Watch this one: --before-background is deliberately unregistered (it holds
     gradients, not a <color>), so an unregistered property would carry the
     whole expression as a token stream instead of a computed colour. */
  v3: '--s-fx:sin(calc(var(--face-x-deg) * -1));--c-fx:cos(calc(var(--face-x-deg) * -1));' +
      '--s-fy:sin(var(--face-y-deg));--c-fy:cos(var(--face-y-deg));' +
      SHADE_TAIL +
      '--before-background:hsl(0 0 calc(1% * ' + SV_FRONT + '));' +
      '--after-background:hsl(0 0 calc(1% * ' + SV_BACK + '));' + SHADE_FIXED
};

var shadeRuleRef = null;

function findShadeRule() {
  if (shadeRuleRef) return shadeRuleRef;
  for (var i = 0; i < document.styleSheets.length; i++) {
    var sh = document.styleSheets[i], rules;
    try { rules = sh.cssRules; } catch (e) { continue; }
    for (var j = 0; j < rules.length; j++) {
      var r = rules[j];
      if (r.constructor.name !== 'CSSStyleRule') continue;
      if (r.selectorText.indexOf('#shade-layer') === 0 &&
          r.selectorText.indexOf(':not(') > 0 &&
          r.style.getPropertyValue('--dot-product')) {
        shadeRuleRef = { sheet: sh, index: j, selector: r.selectorText, original: r.cssText };
        return shadeRuleRef;
      }
    }
  }
  return null;
}

function setShadeVariant(v) {
  var ref = findShadeRule();
  if (!ref) return false;
  ref.sheet.deleteRule(ref.index);
  var text = (v === 'original')
    ? ref.original
    : ref.selector + '{' + SHADE_DECLS[v] + '}';
  ref.sheet.insertRule(text, ref.index);
  document.body.getBoundingClientRect();
  return true;
}

/* Confirm every variant computes the same shading before trusting any timing. */
function checkShadeVariants() {
  var probes = ['#shade-layer .cube .face', '#shade-layer .cube .face:nth-child(4)',
                '#shade-layer .tetrahedron .face:nth-child(3)', '#shade-layer .dodecahedron .face:nth-child(7)'];
  var read = function () {
    return probes.map(function (s) {
      var el = document.querySelector(s);
      if (!el) return 'NO-EL';
      var g = getComputedStyle(el);
      return [g.getPropertyValue('--shade-front').trim(),
              g.getPropertyValue('--shade-back').trim(),
              getComputedStyle(el, '::before').backgroundColor,
              getComputedStyle(el, '::after').backgroundColor].join('|');
    }).join(' // ');
  };
  setShadeVariant('original');
  var ref = read(), out = { reference: ref, match: {} };
  ['v0', 'v1', 'v2', 'v3'].forEach(function (v) {
    setShadeVariant(v);
    var got = read();
    out.match[v] = (got === ref) ? 'identical' : ('DIFFERS: ' + got);
  });
  setShadeVariant('original');
  return out;
}


/* ---- what actually triggers the recalc -------------------------------- *
   Every number in this harness so far was driven by --scene-y-unit on body,
   which is the worst case: a document-wide singleton feeding every layer.
   A user dragging an object slider changes a property on three figures, not
   on body. Whether that costs the same thing is the difference between "45
   objects is unusable" and "45 objects is unusable only while rotating the
   scene". */

function sampleDriver(targets, prop, base, span, samples) {
  var out = [], i, j, v, t0;
  for (i = 0; i < samples; i++) {
    v = base + (seq++) * span;
    t0 = performance.now();
    for (j = 0; j < targets.length; j++) targets[j].style.setProperty(prop, String(v));
    document.body.getBoundingClientRect();
    out.push(performance.now() - t0);
  }
  return out;
}

function sampleDriverBatched(targets, prop, base, span, samples, batch) {
  batch = batch || 10;
  var out = [], i, k, j, t0;
  for (i = 0; i < samples; i++) {
    t0 = performance.now();
    for (k = 0; k < batch; k++) {
      var v = base + (seq++) * span;
      for (j = 0; j < targets.length; j++) targets[j].style.setProperty(prop, String(v));
      document.body.getBoundingClientRect();
    }
    out.push((performance.now() - t0) / batch);
  }
  return out;
}

/* The figures for one object, across all three layers. */
function objectFigures(index) {
  return Array.prototype.slice.call(
    document.querySelectorAll('.object[data-object="bench' + index + '"]'));
}

function drivers(warm, samples, batched) {
  var body = [document.body];
  var one = objectFigures(0);
  var set = [
    ['body --scene-y-unit',        body, '--scene-y-unit',   45, 0.013],
    ['body --scene-x-unit',        body, '--scene-x-unit',  -30, 0.013],
    ['body --light-y-unit',        body, '--light-y-unit',    0, 0.013],
    ['body --light-x-unit',        body, '--light-x-unit',   60, 0.013],
    ['one object --object-y-unit', one,  '--object-y-unit',   0, 0.013],
    ['one object --x-pos',         one,  '--x-pos',           2, 0.0001],
    ['one object --hue',           one,  '--hue',             0, 0.013]
  ];
  var fn = batched ? sampleDriverBatched : sampleDriver;
  var out = {};
  /* warm every driver before timing any of them */
  set.forEach(function (d) { fn(d[1], d[2], d[3], d[4], warm, 10); });
  set.forEach(function (d) { out[d[0]] = +median(fn(d[1], d[2], d[3], d[4], samples, 10)).toFixed(3); });
  return out;
}

window.BENCH = {
  build: build, clearScene: clearScene, run: run, sample: sample,
  median: median, frames: frames, setAblation: setAblation,
  pair: pair, sweep: sweep, percentile: percentile,
  removeProperties: removeProperties, restoreProperties: restoreProperties,
  countProperties: countProperties, pairFn: pairFn, sampleStyleOnly: sampleStyleOnly,
  deleteRulesMatching: deleteRulesMatching, restoreRules: restoreRules,
  sampleBatched: sampleBatched, pairBatched: pairBatched, sweepBatched: sweepBatched,
  drivers: drivers, sampleDriver: sampleDriver, sampleDriverBatched: sampleDriverBatched,
  objectFigures: objectFigures,
  setShadeVariant: setShadeVariant, checkShadeVariants: checkShadeVariants,
  findShadeRule: findShadeRule, shadeDecls: SHADE_DECLS,
  ablations: Object.keys(ABLATIONS).concat(['style-container-query']),
  reset: function () { seq = 0; }
};
})();
