function getTabPanel(tab) {
    return document.getElementById(tab.getAttribute('aria-controls'));
}

function activateTab(tab, tabs) {
    tabs.forEach(t => {
        const isTarget = t === tab;
        t.setAttribute('aria-selected', isTarget ? 'true' : 'false');
        t.setAttribute('tabindex', isTarget ? '0' : '-1');
        getTabPanel(t).classList.toggle('is-hidden', !isTarget);
    });
    tab.focus();
}

function deactivateAll(tabs) {
    tabs.forEach(t => {
        t.setAttribute('aria-selected', 'false');
        t.setAttribute('tabindex', '-1');
        getTabPanel(t).classList.add('is-hidden');
    });
}

function initTablist(tablistEl, { closeable = false } = {}) {
    const tabs = Array.from(tablistEl.querySelectorAll(':scope > [role="tab"]'));
    if (!tabs.length) return;

    if (closeable) {
        deactivateAll(tabs);
        tabs[0].setAttribute('tabindex', '0');
    } else {
        activateTab(tabs[0], tabs);
    }

    tablistEl.addEventListener('keydown', e => {
        const current = tabs.indexOf(document.activeElement);
        if (current === -1) return;

        let next = -1;
        if (e.key === 'ArrowRight') next = (current + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        else return;

        e.preventDefault();
        activateTab(tabs[next], tabs);
    });

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (closeable && tab.getAttribute('aria-selected') === 'true') {
                deactivateAll(tabs);
                tab.setAttribute('tabindex', '0');
                tab.focus();
            } else {
                activateTab(tab, tabs);
            }
        });
    });
}

document.querySelectorAll('[role="tablist"]').forEach(tablistEl => {
    const closeable = !tablistEl.closest('[role="tabpanel"]');
    initTablist(tablistEl, { closeable });
});

function openTab(tabEl) {
    const tablist = tabEl.closest('[role="tablist"]');
    if (!tablist) return;
    const tabs = Array.from(tablist.querySelectorAll(':scope > [role="tab"]'));
    activateTab(tabEl, tabs);
}

// Spinbuttons
const spinbuttons = {};

function initSpinbutton(inputEl, onChange) {
    const min = parseInt(inputEl.getAttribute('aria-valuemin'), 10);
    const max = parseInt(inputEl.getAttribute('aria-valuemax'), 10);
    const errorEl = document.getElementById(inputEl.getAttribute('aria-errormessage'));
    const outputEl = inputEl.closest('.spinner-field')?.querySelector('output');
    const [decrementBtn, incrementBtn] = inputEl.closest('.spinner').querySelectorAll('button');

    function announce(value) {
        if (!outputEl) return;
        outputEl.textContent = value;
        const delay = parseInt(outputEl.dataset.selfDestruct, 10);
        if (delay) setTimeout(() => { outputEl.textContent = ''; }, delay);
    }

    function updateButtons(value) {
        decrementBtn.setAttribute('aria-disabled', value <= min ? 'true' : 'false');
        incrementBtn.setAttribute('aria-disabled', value >= max ? 'true' : 'false');
    }

    function setValid(value) {
        inputEl.value = value;
        inputEl.setAttribute('aria-valuenow', value);
        inputEl.removeAttribute('aria-invalid');
        if (errorEl) errorEl.classList.add('is-hidden');
        updateButtons(value);
        announce(value);
        onChange(value);
    }

    function applyDelta(delta) {
        const current = parseInt(inputEl.getAttribute('aria-valuenow'), 10);
        const next = Math.min(max, Math.max(min, current + delta));
        if (next !== current) setValid(next);
    }

    function commit() {
        const parsed = parseInt(inputEl.value.trim(), 10);
        if (isNaN(parsed) || parsed < min || parsed > max) {
            inputEl.setAttribute('aria-invalid', 'true');
            if (errorEl) errorEl.classList.remove('is-hidden');
        } else {
            setValid(parsed);
        }
    }

    inputEl.addEventListener('keydown', e => {
        if (e.key === 'ArrowUp')   { e.preventDefault(); applyDelta(1); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); applyDelta(-1); }
        else if (e.key === 'Home') { e.preventDefault(); setValid(min); }
        else if (e.key === 'End')  { e.preventDefault(); setValid(max); }
    });

    inputEl.addEventListener('blur', commit);
    decrementBtn.addEventListener('click', () => applyDelta(-1));
    incrementBtn.addEventListener('click', () => applyDelta(1));

    updateButtons(parseInt(inputEl.getAttribute('aria-valuenow'), 10));

    // setValue is for external control (e.g. selectObject) — updates display only, no announce or onChange
    const api = {
        setValue(value) {
            const clamped = Math.min(max, Math.max(min, value));
            inputEl.value = clamped;
            inputEl.setAttribute('aria-valuenow', clamped);
            inputEl.removeAttribute('aria-invalid');
            if (errorEl) errorEl.classList.add('is-hidden');
            updateButtons(clamped);
        }
    };
    spinbuttons[inputEl.id] = api;
    return api;
}

// Scene / light sliders — write to body
const body = document.getElementById('body');

function bindSlider(id, cssVar) {
    const slider = document.getElementById(id);
    if (!slider) return;
    const update = () => body.style.setProperty(cssVar, slider.value);
    slider.addEventListener('input', update);
    update();
}

bindSlider('light-x', '--light-x-unit');
bindSlider('light-y', '--light-y-unit');
bindSlider('scene-x', '--scene-x-unit');
bindSlider('scene-y', '--scene-y-unit');

// Objects
const SHAPE_CLASSES = ['cube', 'tetrahedron', 'pyramid', 'dodecahedron', 'sphere', 'cylinder', 'cone'];

const OBJECT_DEFAULTS = {
    'object1': { '--x-pos': '3', '--y-pos': '0', '--z-pos': '2' },
    'object2': { '--x-pos': '1', '--y-pos': '0', '--z-pos': '2' },
    'object3': { '--x-pos': '2', '--y-pos': '0', '--z-pos': '2' },
    'object4': { '--x-pos': '4', '--y-pos': '0', '--z-pos': '2' },
};

let selectedObjectId = null;

function getObjectFigures(id) {
    return document.querySelectorAll(`[data-object="${id}"]`);
}

function deselectObject() {
    selectedObjectId = null;
    document.querySelectorAll('[data-object]').forEach(f => f.classList.remove('is-selected'));
    document.getElementById('panel_object-unselected').classList.remove('is-hidden');
    document.getElementById('panel_object-selected').classList.add('is-hidden');
}

function selectObject(id) {
    selectedObjectId = id;

    document.querySelectorAll('[data-object]').forEach(f => f.classList.remove('is-selected'));
    getObjectFigures(id).forEach(f => f.classList.add('is-selected'));

    document.getElementById('panel_object-unselected').classList.add('is-hidden');
    document.getElementById('panel_object-selected').classList.remove('is-hidden');

    openTab(document.getElementById('tab_object'));

    const figure = document.querySelector(`[data-object="${id}"]`);
    const cs = getComputedStyle(figure);
    const getVar = name => cs.getPropertyValue(name).trim() || '0';

    // Spinbutton controls (value = CSS var + 1)
    spinbuttons['x-move']?.setValue(parseInt(getVar('--x-pos')) + 1);
    spinbuttons['y-move']?.setValue(parseInt(getVar('--y-pos')) + 1);
    spinbuttons['z-move']?.setValue(parseInt(getVar('--z-pos')) + 1);

    // Range slider controls
    document.getElementById('object-x').value = getVar('--object-x-unit');
    document.getElementById('object-y').value = getVar('--object-y-unit');
    document.getElementById('object-z').value = getVar('--object-z-unit');
    document.getElementById('hue').value = getVar('--hue');

    const shapeClass = SHAPE_CLASSES.find(s => figure.classList.contains(s)) || 'cube';
    document.getElementById(`shape_${shapeClass}`).checked = true;
}

function initObjects() {
    document.querySelectorAll('[data-object]').forEach(figure => {
        const id = figure.dataset.object;
        const defaults = OBJECT_DEFAULTS[id] || { '--x-pos': '2', '--y-pos': '0', '--z-pos': '2' };

        figure.style.setProperty('--object-x-unit', '0');
        figure.style.setProperty('--object-y-unit', '0');
        figure.style.setProperty('--object-z-unit', '0');
        figure.style.setProperty('--hue', '0');
        for (const [prop, val] of Object.entries(defaults)) {
            figure.style.setProperty(prop, val);
        }

        if (!SHAPE_CLASSES.some(s => figure.classList.contains(s))) {
            figure.classList.add('cube');
        }
        figure.addEventListener('click', () => selectObject(id));
    });
}

function bindObjectSlider(id, cssVar) {
    const slider = document.getElementById(id);
    if (!slider) return;
    slider.addEventListener('input', () => {
        if (!selectedObjectId) return;
        getObjectFigures(selectedObjectId).forEach(f => f.style.setProperty(cssVar, slider.value));
    });
}

initObjects();

// New object creation
const MAX_OBJECTS = 5 * 5 * 5;
const newObjectBtn = document.querySelector('#button_new-object');

function createObject() {
    const existingIds = new Set(
        Array.from(document.querySelectorAll('[data-object]')).map(f => f.dataset.object)
    );
    if (existingIds.size >= MAX_OBJECTS) return;

    const nums = Array.from(existingIds)
        .map(id => parseInt(id.replace('object', ''), 10))
        .filter(n => !isNaN(n));
    const id = `object${nums.length ? Math.max(...nums) + 1 : 1}`;

    const makeFaces = count => Array(count).fill('<div class="face"></div>').join('');

    const shadowFig = document.createElement('figure');
    shadowFig.className = 'object cube';
    shadowFig.dataset.object = id;
    shadowFig.innerHTML = makeFaces(12);
    document.querySelector('#shadow-layer .scene').appendChild(shadowFig);

    const objectFig = document.createElement('figure');
    objectFig.className = 'object cube';
    objectFig.dataset.object = id;
    objectFig.innerHTML = makeFaces(12);
    document.getElementById('light').before(objectFig);

    const shadeFig = document.createElement('figure');
    shadeFig.className = 'object cube';
    shadeFig.dataset.object = id;
    shadeFig.innerHTML = `<div class="face"><div class="curved-lighting"><div class="top-bottom"></div><div class="highlight"></div></div></div>${makeFaces(11)}`;
    document.querySelector('#shade-layer .scene').appendChild(shadeFig);

    const defaults = { '--x-pos': '2', '--y-pos': '0', '--z-pos': '2' };
    getObjectFigures(id).forEach(figure => {
        figure.style.setProperty('--object-x-unit', '0');
        figure.style.setProperty('--object-y-unit', '0');
        figure.style.setProperty('--object-z-unit', '0');
        figure.style.setProperty('--hue', '0');
        for (const [prop, val] of Object.entries(defaults)) {
            figure.style.setProperty(prop, val);
        }
        figure.addEventListener('click', () => selectObject(id));
    });

    newObjectBtn.disabled = existingIds.size + 1 >= MAX_OBJECTS;

    selectObject(id);
}

newObjectBtn.addEventListener('click', createObject);

// Deselect when the Object Controls tab is explicitly closed
document.getElementById('tab_object').addEventListener('click', () => {
    if (document.getElementById('tab_object').getAttribute('aria-selected') === 'false') {
        deselectObject();
    }
});

// Object selector spinbuttons — form submission wired separately
initSpinbutton(document.getElementById('x-select'), () => {});
initSpinbutton(document.getElementById('y-select'), () => {});
initSpinbutton(document.getElementById('z-select'), () => {});

// x-pos is a spinbutton; value offset: spinbutton shows 1–5, CSS var is 0–4
initSpinbutton(document.getElementById('x-move'), value => {
    if (!selectedObjectId) return;
    getObjectFigures(selectedObjectId).forEach(f => f.style.setProperty('--x-pos', String(value - 1)));
});

bindObjectSlider('object-x', '--object-x-unit');
bindObjectSlider('object-y', '--object-y-unit');
bindObjectSlider('object-z', '--object-z-unit');
initSpinbutton(document.getElementById('y-move'), value => {
    if (!selectedObjectId) return;
    getObjectFigures(selectedObjectId).forEach(f => f.style.setProperty('--y-pos', String(value - 1)));
});

initSpinbutton(document.getElementById('z-move'), value => {
    if (!selectedObjectId) return;
    getObjectFigures(selectedObjectId).forEach(f => f.style.setProperty('--z-pos', String(value - 1)));
});
bindObjectSlider('hue', '--hue');

document.querySelectorAll('[name="shape_select"]').forEach(radio => {
    radio.addEventListener('change', () => {
        if (!selectedObjectId || !radio.checked) return;
        const shape = radio.id.replace('shape_', '');
        getObjectFigures(selectedObjectId).forEach(f => {
            SHAPE_CLASSES.forEach(s => f.classList.remove(s));
            f.classList.add(shape);
        });
    });
});
