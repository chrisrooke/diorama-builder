/* Dodecahedron hoist experiment.
   .dodecahedron carries 45 custom-property declarations. Only the 20 --cornerN
   expressions and --elevation-surface depend on the object's rotation; the
   other 24 are literals or functions of --object-size, i.e. document-wide
   singletons being recomputed once per dodecahedron per layer (three times per
   object). F11a's rule says those belong on body.
   Variants:
     original — as shipped (45 decls on .dodecahedron)
     fixed    — same shape, but --face-translate declared on the figure too, so
                the corner chain stops reading the registered initial (the bug)
     hoisted  — fixed, plus the 24 singletons moved to body (21 decls left) */
window.DODEC = (function () {
  var CONSTS =
    '--dodecahedron-angle:atan(2);' +
    '--phi:calc((1 + sqrt(5)) / 2);' +
    '--pentagon-top-x:0;--pentagon-top-y:0.5;' +
    '--pentagon-tl-x:-0.47552825814;--pentagon-tl-y:0.15450849719;' +
    '--pentagon-bl-x:-0.29389262614;--pentagon-bl-y:-0.40450849719;' +
    '--pentagon-br-x:0.29389262614;--pentagon-br-y:-0.40450849719;' +
    '--pentagon-tr-x:0.47552825814;--pentagon-tr-y:0.15450849719;' +
    '--c-90:0;--s-90:1;--c-162:-0.95105651629;--s-162:0.30901699437;' +
    '--c-234:-0.58778525229;--s-234:-0.80901699437;' +
    '--c-306:0.58778525229;--s-306:-0.80901699437;' +
    '--c-18:0.95105651629;--s-18:0.30901699437;';

  var SIZED =
    '--dodecahedron-face-translate:calc(var(--object-size-half) * (pow(var(--phi), 2) / 2));' +
    '--dodecahedron-midcorner-depth:calc(var(--pentagon-bl-y) * 2 * var(--object-size));' +
    '--dodecahedron-midcorner-height:calc(var(--dodecahedron-face-translate) + var(--dodecahedron-midcorner-depth));';

  /* corner1-10: pentagon ring, top and bottom */
  function ring() {
    var names = ['top', 'tl', 'bl', 'br', 'tr'], out = '';
    for (var s = 0; s < 2; s++) {
      var sign = s ? ' * -1' : '';
      for (var i = 0; i < 5; i++) {
        var n = s * 5 + i + 1;
        out += '--corner' + n + ':calc(' +
          '(var(--corner-Rx) * var(--pentagon-' + names[i] + '-x) * var(--object-size)' + sign + ') + ' +
          '(var(--corner-Ry) * var(--dodecahedron-face-translate)' + sign + ') - ' +
          '(var(--corner-Rz) * var(--pentagon-' + names[i] + '-y) * var(--object-size)' + sign + '));';
      }
    }
    return out;
  }
  /* corner11-20: mid-corner ring */
  function mid() {
    var angs = ['90', '162', '234', '306', '18'], out = '';
    for (var s = 0; s < 2; s++) {
      var sign = s ? ' * -1' : '';
      for (var i = 0; i < 5; i++) {
        var n = 11 + s * 5 + i;
        out += '--corner' + n + ':calc(' +
          '(var(--corner-Rx) * var(--c-' + angs[i] + ') * var(--dodecahedron-midcorner-depth)' + sign + ') + ' +
          '(var(--corner-Ry) * var(--dodecahedron-midcorner-height)' + sign + ') - ' +
          '(var(--corner-Rz) * var(--s-' + angs[i] + ') * var(--dodecahedron-midcorner-depth)' + sign + '));';
      }
    }
    return out;
  }
  var ELEV = (function () {
    var a = [];
    for (var i = 1; i <= 20; i++) a.push('var(--corner' + i + ')');
    return '--elevation-surface:calc(min(' + a.join(',') + '));';
  })();

  var CORNERS = ring() + mid() + ELEV;

  var ref = null;
  function find() {
    if (ref) return ref;
    for (var i = 0; i < document.styleSheets.length; i++) {
      var sh = document.styleSheets[i], rules;
      try { rules = sh.cssRules; } catch (e) { continue; }
      for (var j = 0; j < rules.length; j++) {
        var r = rules[j];
        if (r.constructor.name === 'CSSStyleRule' && r.selectorText === '.dodecahedron') {
          ref = { sheet: sh, index: j, original: r.cssText };
          return ref;
        }
      }
    }
    return null;
  }

  function extra() {
    var el = document.getElementById('dodec-extra');
    if (!el) { el = document.createElement('style'); el.id = 'dodec-extra'; document.head.appendChild(el); }
    return el;
  }

  function set(variant) {
    var r = find();
    r.sheet.deleteRule(r.index);
    var body, ex = '';
    if (variant === 'original') {
      body = null;
    } else if (variant === 'fixed') {
      body = CONSTS + SIZED + CORNERS;
      ex = '.dodecahedron .face{--face-translate:var(--dodecahedron-face-translate);}';
    } else {                                     /* hoisted */
      body = CORNERS;
      ex = 'body{' + CONSTS + SIZED + '}' +
           '.dodecahedron .face{--face-translate:var(--dodecahedron-face-translate);}';
    }
    r.sheet.insertRule(body === null ? r.original : ('.dodecahedron{' + body + '}'), r.index);
    extra().textContent = ex;
    document.body.getBoundingClientRect();
    var live = r.sheet.cssRules[r.index];
    var n = 0; for (var k = 0; k < live.style.length; k++) if (live.style[k].indexOf('--') === 0) n++;
    return n;
  }

  return { set: set, find: find, CONSTS: CONSTS, SIZED: SIZED, CORNERS: CORNERS };
})();
