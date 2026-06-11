// ============================================================================
// UI.JS — menus, modals, tutorial, sidebar build, pointer interaction, radius
//         & ghost visualizers, mini 3D previews, error toast/system overlay.
// Load order: 5th — needs config.js, assets.js, models.js, map.js.
// Defines:  buildUI, setupInteraction, openModal/closeModal/transitionModal,
//           showErrorToast/showSystemOverlay, drawRadius/hideRadius,
//           generateGhostModel, disposeHierarchy, showInfoPanel, updateCredits.
// Consumes: state/entities (config.js), MODELS (models.js), worldGroup/camera/
//           renderer (created in main.js — used after init() runs), and
//           buildTower/upgradeTower (entities.js — bound at click time).
// ============================================================================

let ghostGroup, radiusGroup;
let uiScene, uiCamera, uiRenderer, uiModel;

// ─── TUTORIAL ──────────────────────────────────────────────────────────────

const TUTORIAL_STEPS = [
    {
        text: 'Click a tower in the left panel to select it, then click a green grass tile to place it.',
        highlight: '#sidebar-left'
    },
    {
        text: 'Enemies follow the sand path automatically. Your towers will fire on their own!',
        highlightCenter: true,
        condensed: true
    },
    {
        text: 'Earn gold by defeating enemies. Don\'t let them reach the glowing Core!',
        highlight: '#sidebar-right'
    }
];
let tutorialStep = 0;

function setupTutorial() {
    const overlay  = document.getElementById('tutorial-overlay');
    const textEl   = document.getElementById('tutorial-text');
    const nextBtn  = document.getElementById('btn-tutorial-next');
    const skipBtn  = document.getElementById('btn-tutorial-skip');
    const dotsEl   = document.getElementById('tutorial-dots');
    const countEl  = document.getElementById('tutorial-step-count');
    const vignette = document.getElementById('tutorial-vignette');
    const card     = overlay.querySelector('.tutorial-card');

    function showStep(idx, animate) {
        const step = TUTORIAL_STEPS[idx];

        if (animate && idx > 0) {
            card.classList.add('step-exit');
            setTimeout(() => {
                card.classList.remove('step-exit');
                updateCardContent();
                card.classList.add('step-enter');
                setTimeout(() => card.classList.remove('step-enter'), ANIMATION_TIMINGS.tutorialStepEnter);
            }, ANIMATION_TIMINGS.tutorialStepExit);
        } else {
            updateCardContent();
        }

        function updateCardContent() {
            textEl.innerText = step.text;

            // Dots
            dotsEl.innerHTML = '';
            TUTORIAL_STEPS.forEach((_, i) => {
                const dot = document.createElement('div');
                dot.className = 'tutorial-dot' + (i === idx ? ' active' : '');
                dotsEl.appendChild(dot);
            });

            // Step counter
            if (countEl) countEl.innerText = `${idx + 1} / ${TUTORIAL_STEPS.length}`;

            // Handle condensed variation
            if (step.condensed) {
                card.classList.add('condensed');
            } else {
                card.classList.remove('condensed');
            }

            // Spotlight vignette
            if (step.highlight) {
                const el = document.querySelector(step.highlight);
                if (el) {
                    const r = el.getBoundingClientRect();
                    vignette.style.setProperty('--hl-x', r.left + 'px');
                    vignette.style.setProperty('--hl-y', r.top + 'px');
                    vignette.style.setProperty('--hl-w', r.width + 'px');
                    vignette.style.setProperty('--hl-h', r.height + 'px');
                    vignette.classList.remove('no-spotlight');
                    vignette.classList.add('has-spotlight');
                }
            } else if (step.highlightCenter) {
                // Highlight a central area for the track
                const w = window.innerWidth * 0.5;
                const h = window.innerHeight * 0.5;
                const x = (window.innerWidth - w) / 2;
                const y = (window.innerHeight - h) / 2;
                vignette.style.setProperty('--hl-x', x + 'px');
                vignette.style.setProperty('--hl-y', y + 'px');
                vignette.style.setProperty('--hl-w', w + 'px');
                vignette.style.setProperty('--hl-h', h + 'px');
                vignette.classList.remove('no-spotlight');
                vignette.classList.add('has-spotlight');
            } else {
                vignette.classList.remove('has-spotlight');
                vignette.classList.add('no-spotlight');
            }

            nextBtn.innerText = idx === TUTORIAL_STEPS.length - 1 ? 'Got it!' : 'Next';
        }
    }

    showStep(0, false);

    nextBtn.addEventListener('click', () => {
        tutorialStep++;
        if (tutorialStep >= TUTORIAL_STEPS.length) {
            endTutorial();
        } else {
            showStep(tutorialStep, true);
        }
    });

    skipBtn.addEventListener('click', endTutorial);
}

function endTutorial() {
    const vignette = document.getElementById('tutorial-vignette');
    if (vignette) {
        vignette.classList.remove('has-spotlight', 'no-spotlight');
    }
    document.getElementById('tutorial-overlay').classList.add('hidden');
    safeStorage.set('aegis_tutorial_shown', '1');

    if (document.body.classList.contains('is-playing')) {
        state.isPlaying = true;
        if (typeof clock !== 'undefined') clock.getDelta();
    }
}

// ─── MODAL HELPERS ─────────────────────────────────────────────────────────

function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden', 'exiting');
}

function closeModal(id, duration) {
    duration = duration === undefined ? 280 : duration;
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('exiting');
    setTimeout(() => {
        el.classList.add('hidden');
        el.classList.remove('exiting');
    }, duration);
}

// Close one modal, then open another after the standard close animation.
// opts: { delay, closeDur, before, after } — before/after run around the open.
function transitionModal(fromId, toId, opts = {}) {
    closeModal(fromId, opts.closeDur ?? ANIMATION_TIMINGS.modalClose);
    setTimeout(() => {
        if (opts.before) opts.before();
        if (toId) openModal(toId);
        if (opts.after) opts.after();
    }, opts.delay ?? ANIMATION_TIMINGS.modalReopen);
}

// ─── ERROR FEEDBACK ──────────────────────────────────────────────────────────
// Lazily-built, reusable surfaces for runtime failures (game-loop errors, WebGL
// loss). Kept dependency-free so they work even when the 3D side is broken.

let errorToastEl = null, errorToastTimer = 0;
function showErrorToast(msg) {
    if (!errorToastEl) {
        errorToastEl = document.createElement('div');
        errorToastEl.id = 'error-toast';
        document.body.appendChild(errorToastEl);
    }
    errorToastEl.textContent = msg;
    errorToastEl.classList.add('show');
    clearTimeout(errorToastTimer);
    errorToastTimer = setTimeout(() => errorToastEl.classList.remove('show'), 4000);
}

let systemOverlayEl = null;
function showSystemOverlay(title, msg) {
    if (!systemOverlayEl) {
        systemOverlayEl = document.createElement('div');
        systemOverlayEl.id = 'system-overlay';
        systemOverlayEl.innerHTML =
            '<div class="system-overlay-card glass-card">' +
            '<h2 id="system-overlay-title"></h2><p id="system-overlay-msg"></p>' +
            '</div>';
        document.body.appendChild(systemOverlayEl);
    }
    systemOverlayEl.querySelector('#system-overlay-title').textContent = title;
    systemOverlayEl.querySelector('#system-overlay-msg').textContent = msg;
    systemOverlayEl.classList.add('show');
}

// ─── MENU ENTRANCE ANIMATION ────────────────────────────────────────────────

function animateMenuEntrance() {
    const logo  = document.querySelector('.menu-logo-area');
    const panel = document.getElementById('start-panel');
    if (!logo || !panel) return;

    // Reset animation classes so they replay
    logo.classList.remove('anim-in');
    panel.classList.remove('anim-in');

    // Force reflow to allow re-animation
    void logo.offsetWidth;
    void panel.offsetWidth;

    // Double-rAF ensures the browser paints the reset state first
    requestAnimationFrame(() => requestAnimationFrame(() => {
        logo.classList.add('anim-in');
        panel.classList.add('anim-in');

        // Start idle pulse on CTA after panel finishes animating in
        const btn = document.getElementById('btn-start');
        if (btn) {
            btn.classList.remove('idle-pulse');
            setTimeout(() => btn.classList.add('idle-pulse'), ANIMATION_TIMINGS.tutorialPulseDelay);
        }
    }));
}

// ─── DIFFICULTY SLIDER ──────────────────────────────────────────────────────

function updateDiffSlider() {
    const seg    = document.getElementById('difficulty-seg');
    const slider = document.getElementById('diff-slider');
    if (!seg || !slider) return;
    const active = seg.querySelector('.diff-opt.selected');
    if (!active) return;
    slider.style.left  = active.offsetLeft + 'px';
    slider.style.width = active.offsetWidth + 'px';
}

// ─── STAT BUMP ANIMATION ───────────────────────────────────────────────────

function animateStatBump(el) {
    if (!el) return;
    el.classList.remove('stat-bumping');
    void el.offsetWidth;
    el.classList.add('stat-bumping');
    setTimeout(() => el.classList.remove('stat-bumping'), ANIMATION_TIMINGS.statBumpDuration);
}

// ─── FLOATING PARTICLE SYSTEM ──────────────────────────────────────────────

let particleCanvas, particleCtx, menuParticles = [];
let particleAnimId = null;

function setupMenuParticles() {
    particleCanvas = document.getElementById('menu-particles');
    if (!particleCanvas) return;
    particleCtx = particleCanvas.getContext('2d');

    function resize() {
        particleCanvas.width  = window.innerWidth;
        particleCanvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const COLORS = ['rgba(0,212,255,', 'rgba(255,77,166,', 'rgba(126,211,33,', 'rgba(241,196,15,'];

    menuParticles = Array.from({length: 35}, () => createParticle(true));

    function createParticle(randomY) {
        const col = COLORS[Math.floor(Math.random() * COLORS.length)];
        return {
            x:       Math.random() * window.innerWidth,
            y:       randomY ? Math.random() * window.innerHeight : window.innerHeight + 10,
            size:    Math.random() * 5 + 3,
            speedY:  Math.random() * 0.5 + 0.2,
            speedX:  (Math.random() - 0.5) * 0.3,
            opacity: Math.random() * 0.35 + 0.08,
            color:   col,
            square:  Math.random() > 0.5
        };
    }

    function animateParticles() {
        particleAnimId = requestAnimationFrame(animateParticles);

        // Only update and draw during menu or paused
        if (typeof state !== 'undefined' && state.isPlaying) return;

        if (!particleCtx) return;
        particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);

        menuParticles.forEach((p, i) => {
            p.y  -= p.speedY;
            p.x  += p.speedX;
            p.opacity -= 0.0003;

            if (p.y < -20 || p.opacity <= 0) {
                menuParticles[i] = createParticle(false);
                return;
            }

            particleCtx.save();
            particleCtx.globalAlpha = p.opacity;
            particleCtx.fillStyle = p.color + p.opacity + ')';

            if (p.square) {
                particleCtx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            } else {
                particleCtx.beginPath();
                particleCtx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
                particleCtx.fill();
            }
            particleCtx.restore();
        });
    }

    animateParticles();
}

// ─── INTERACTION SETUP ─────────────────────────────────────────────────────

// Set/clear the tower being moved AND update the cursor immediately — the
// mousemove handler also sets it, but waiting for the next move makes the
// grab cursor feel laggy after click-to-grab.
function setMovingTower(t) {
    state.movingTower = t;
    if (renderer?.domElement) {
        renderer.domElement.style.cursor = t ? 'grabbing' : 'pointer';
    }
}

function setupInteraction() {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    floorPlane = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshBasicMaterial({visible: false}));
    floorPlane.rotation.x = -Math.PI / 2;
    worldGroup.add(floorPlane);

    ghostGroup = new THREE.Group();
    radiusGroup = new THREE.Group();
    worldGroup.add(ghostGroup);
    worldGroup.add(radiusGroup);

    setupUIRenderer();
    setupTutorial();

    function updatePointer(e) {
        if(!state.isPlaying) return;

        let cx = e.clientX, cy = e.clientY;
        if(e.touches && e.touches.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }

        mouse.x = (cx / window.innerWidth) * 2 - 1;
        mouse.y = -(cy / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(floorPlane);

        renderer.domElement.style.cursor = state.movingTower ? 'grabbing' : 'pointer';

        if (intersects.length > 0) {
            const localX = intersects[0].point.x - worldGroup.position.x;
            const localZ = intersects[0].point.z - worldGroup.position.z;

            const { x: gx, z: gz } = worldToGrid(localX, localZ);

            if (gx >= 0 && gx < GRID_WIDTH && gz >= 0 && gz < GRID_HEIGHT) {
                state.hoverPos = {x: gx, z: gz};
                const gg = gridToWorld(gx, gz); ghostGroup.position.set(gg.x, 0, gg.z);

                if (state.selectedTower === 'move') {
                    if (state.movingTower) {
                        state.hoverValid = grid[gx][gz] === 0 || (gx === state.movingTower.origX && gz === state.movingTower.origZ);
                        ghostGroup.visible = true;
                        drawRadius(gx, gz, state.movingTower.data.range, 0xaaaaaa);
                    } else {
                        state.hoverValid = grid[gx][gz] === 3;
                        ghostGroup.visible = false;
                        if (!state.inspectedTower) hideRadius();
                    }
                } else if (state.selectedTower) {
                    const towerData = TOWER_TYPES[state.selectedTower];
                    state.hoverValid = grid[gx][gz] === 0 && state.credits >= getEffectiveCost(towerData.baseCost);
                    ghostGroup.visible = true;
                    drawRadius(gx, gz, towerData.range, 0xaaaaaa);
                } else {
                    state.hoverValid = false;
                    ghostGroup.visible = false;
                }
            } else {
                state.hoverValid = false;
                ghostGroup.visible = false;
                if (!state.inspectedTower) hideRadius();
            }
        } else {
            state.hoverValid = false;
            ghostGroup.visible = false;
            if (!state.inspectedTower) hideRadius();
        }
    }

    function handleAction(e) {
        if (e && e.target && e.target.closest('#ui-layer')) return;
        if (!state.isPlaying || !state.selectedTower) return;

        const {x, z} = state.hoverPos;

        if (!state.hoverValid) {
            if (state.inspectedTower || state.movingTower) {
                state.inspectedTower = null;
                setMovingTower(null);
                hideInfoPanel();
                hideRadius();
                ghostGroup.visible = false;
            }
            if (state.selectedTower !== 'move') {
                selectTower('move');
            }
            return;
        }

        if (state.selectedTower === 'move') {
            if (!state.movingTower) {
                if (grid[x][z] === 3) {
                    const towerIdx = entities.towers.findIndex(t => {
                        const tg = worldToGrid(t.group.position.x, t.group.position.z);
                        return tg.x === x && tg.z === z;
                    });

                    if (towerIdx !== -1) {
                        const t = entities.towers[towerIdx];

                        if (state.inspectedTower !== t) {
                            state.inspectedTower = t;
                            showInfoPanel(t);
                            drawRadius(x, z, t.data.range, 0xff4757);
                        } else if (hasFreeBuildCell()) {
                            // No free cells → moving is disabled (a move could
                            // only land back on its own spot); on Seamless this
                            // re-enables automatically when the map expands.
                            setMovingTower(t);
                            refreshMoveBtn();
                            state.inspectedTower = null;
                            hideInfoPanel();
                            t.origX = x; t.origZ = z;
                            generateGhostModel(t.data.id);
                        }
                    }
                }
            } else {
                if (grid[x][z] === 0 || (x === state.movingTower.origX && z === state.movingTower.origZ)) {
                    grid[state.movingTower.origX][state.movingTower.origZ] = 0;
                    grid[x][z] = 3;

                    const mv = gridToWorld(x, z);
                    state.movingTower.pos.set(mv.x, TILE_SIZE * 0.5, mv.z);
                    state.movingTower.group.position.set(mv.x, 0, mv.z);
                    state.movingTower.gx = x;
                    state.movingTower.gz = z;

                    setMovingTower(null);
                    refreshMoveBtn();
                    ghostGroup.visible = false;
                    hideRadius();
                }
            }
            return;
        }

        const towerData = TOWER_TYPES[state.selectedTower];
        const effectiveCost = getEffectiveCost(towerData.baseCost);
        if (grid[x][z] === 0 && state.credits >= effectiveCost) {
            const result = buildTower(x, z, towerData);

            if (result.ok) {
                updateCredits(-effectiveCost);
                const newTower = result.value;

                if (state.selectedTower !== 'move') {
                    selectTower('move');
                }

                state.inspectedTower = newTower;
                showInfoPanel(newTower);
                drawRadius(x, z, newTower.data.range, 0xff4757);

                // That was the last free cell → announce it (not on Seamless,
                // where the board keeps growing). Placement-edge only, so it
                // can never re-fire: a full board accepts no further placements.
                if (!hasFreeBuildCell() && !MAP_CONFIGS[state.currentMap]?.isSeamless) {
                    showBoardFullBanner();
                }
            }
        }
    }

    window.addEventListener('mousemove', updatePointer);
    window.addEventListener('touchstart', updatePointer, {passive: false});
    window.addEventListener('touchmove', updatePointer, {passive: false});
    window.addEventListener('mousedown', handleAction);
    window.addEventListener('touchend', (e) => {
        if(e.target.closest('#ui-layer')) return;
        handleAction(e);
    });
    window.addEventListener('mouseleave', () => {
        state.hoverValid = false;
        ghostGroup.visible = false;
        if (!state.inspectedTower) hideRadius();
    });
}

// --- MINI 3D UI RENDERER ---

function setupUIRenderer() {
    const container = document.getElementById('info-render-container');
    uiScene = new THREE.Scene();

    uiCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    uiCamera.position.set(0, 3, 5);
    uiCamera.lookAt(0, 1, 0);

    uiRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    uiRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    uiRenderer.setSize(58, 58);
    container.appendChild(uiRenderer.domElement);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(2, 5, 3);
    uiScene.add(light);
    uiScene.add(new THREE.AmbientLight(0xffffff, 0.7));

    function animateUI() {
        requestAnimationFrame(animateUI);
        if(uiModel && !document.getElementById('info-panel').classList.contains('hidden')) {
            uiModel.rotation.y += 0.02;
            uiRenderer.render(uiScene, uiCamera);
        }
    }
    animateUI();
}

// --- RADIUS & GHOST VISUALIZERS ---

// drawRadius runs on EVERY mousemove while placing/moving/inspecting a tower.
// One shared geometry + one shared material (recolored per call — only one
// radius is ever visible), and tile meshes are pooled inside radiusGroup and
// reused by index. The old version built a fresh geometry/material per call and
// dropped the previous ones un-disposed — an unbounded GPU-memory leak.
let radiusTileGeo = null, radiusTileMat = null;
function ensureRadiusAssets() {
    if (radiusTileGeo) return;
    radiusTileGeo = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
    radiusTileGeo.rotateX(-Math.PI / 2);
    radiusTileMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        depthTest: false
    });
}

function hideRadius() {
    radiusGroup.visible = false;
}

function drawRadius(gx, gz, range, colorHex) {
    ensureRadiusAssets();
    radiusTileMat.color.setHex(colorHex);
    radiusGroup.visible = true;

    let used = 0;
    const maxDist = Math.ceil(range);

    // We want the HIGHLIGHT box visually rounded DOWN if the tile's outer edge isn't safely in the circle
    // A tile's center is (dx, dz). The farthest corner from the tower cell center is at distance:
    // centerDist + (sqrt(0.5^2 + 0.5^2) = ~0.7071)

    for (let x = gx - maxDist; x <= gx + maxDist; x++) {
        for (let z = gz - maxDist; z <= gz + maxDist; z++) {
            if (x < 0 || x >= GRID_WIDTH || z < 0 || z >= GRID_HEIGHT) continue;

            const dx = Math.abs(x - gx);
            const dz = Math.abs(z - gz);
            const centerDist = Math.sqrt(dx*dx + dz*dz);

            // Include cells by extending the valid range threshold by 25% (1.25 buffer)
            // so if more than the center of a cell is in the radius, it includes it.
            if ((centerDist + 0.7071) <= (range * 1.25)) {
                let tile = radiusGroup.children[used];
                if (!tile) {
                    tile = new THREE.Mesh(radiusTileGeo, radiusTileMat);
                    tile.renderOrder = 1;
                    radiusGroup.add(tile);
                }
                const rw = gridToWorld(x, z);
                tile.position.set(rw.x, 0.08, rw.z);
                tile.visible = true;
                used++;
            }
        }
    }
    // Hide pooled tiles beyond this radius' footprint
    for (let i = used; i < radiusGroup.children.length; i++) {
        radiusGroup.children[i].visible = false;
    }
}

// Shared translucent material for ghost previews — never disposed.
const GHOST_MAT = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.6 });

// Dispose every geometry/material in a hierarchy, except the shared ghost
// material. Safe for ghost/uiModel heads: buildTowerHead(id, null, …) creates
// fresh geometries AND materials per call (std()/glow()/glass() factories).
function disposeHierarchy(root) {
    root.traverse(node => {
        if (node.geometry) node.geometry.dispose();
        if (node.material && node.material !== GHOST_MAT) {
            if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
            else node.material.dispose();
        }
    });
}

function generateGhostModel(id) {
    while (ghostGroup.children.length > 0) {
        const old = ghostGroup.children[0];
        ghostGroup.remove(old);
        disposeHierarchy(old);
    }
    if(!id || id === 'move') return;

    const ghostWrapper = new THREE.Group();
    const head = MODELS.buildTowerHead(id, null, TILE_SIZE);
    if(head) {
        head.traverse(node => {
            if(node.isMesh) {
                const orig = node.material;
                node.material = GHOST_MAT;
                // buildTowerHead made these fresh just for this preview — drop them
                if (orig) {
                    if (Array.isArray(orig)) orig.forEach(m => m.dispose());
                    else orig.dispose();
                }
            }
        });
        ghostWrapper.add(head);
    }

    ghostGroup.add(ghostWrapper);
}

// --- UI MANAGEMENT ---

function buildUI() {
    const elSidebarLeft = document.getElementById('sidebar-left');

    const iconRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    iconRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    iconRenderer.setSize(128, 128);
    const iconScene = new THREE.Scene();

    const iconCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    iconCamera.position.set(0, 2.5, 5);
    iconCamera.lookAt(0, 1.2, 0);

    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(2, 5, 3);
    iconScene.add(light);
    iconScene.add(new THREE.AmbientLight(0xffffff, 0.8));

    const moveBtn = document.createElement('div');
    moveBtn.className = 'tower-btn';
    moveBtn.id = 'btn-move';
    moveBtn.innerHTML = `
        <div class="tower-icon" style="background: rgba(255,255,255,0.1);">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L8.5 6.5H10.5V12H13.5V6.5H15.5L12 2Z"   fill="rgba(255,255,255,0.9)"/>
                <path d="M12 22L15.5 17.5H13.5V12H10.5V17.5H8.5L12 22Z" fill="rgba(255,255,255,0.9)"/>
                <path d="M2 12L6.5 8.5V10.5H12V13.5H6.5V15.5L2 12Z"    fill="rgba(255,255,255,0.9)"/>
                <path d="M22 12L17.5 15.5V13.5H12V10.5H17.5V8.5L22 12Z" fill="rgba(255,255,255,0.9)"/>
            </svg>
        </div>
        <div class="tower-name">Move</div>
    `;
    moveBtn.addEventListener('click', () => selectTower('move'));
    elSidebarLeft.appendChild(moveBtn);

    Object.values(TOWER_TYPES).forEach(tower => {
        const model = MODELS.buildTowerHead(tower.id, null, TILE_SIZE);
        if (model) {
            iconScene.add(model);
            iconRenderer.render(iconScene, iconCamera);
            iconScene.remove(model);
        }

        const dataURL = iconRenderer.domElement.toDataURL('image/png');

        const btn = document.createElement('div');
        btn.className = 'tower-btn';
        btn.id = `btn-${tower.id}`;

        // Set tower accent color as a CSS custom property
        const hexColor = '#' + tower.color.toString(16).padStart(6, '0');
        btn.style.setProperty('--tower-color', hexColor);

        btn.innerHTML = `
            <div class="tower-icon" style="background-image: url('${dataURL}'); background-size: 150%; background-position: center 65%; background-repeat: no-repeat; background-color: rgba(255,255,255,0.1);"></div>
            <div class="tower-name">${tower.name}</div>
            <div class="tower-cost" id="cost-${tower.id}">${tower.baseCost}g</div>
        `;
        btn.addEventListener('click', () => selectTower(tower.id));
        elSidebarLeft.appendChild(btn);
    });

    iconRenderer.dispose();
    buildGuide();
}

function buildGuide() {
    // ── Shared thumbnail renderer ──────────────────────────────────
    const thumbR   = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    thumbR.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    thumbR.setSize(128, 128);
    const thumbSc  = new THREE.Scene();
    const thumbCam = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    const tDirLt   = new THREE.DirectionalLight(0xffffff, 1.2);
    tDirLt.position.set(2, 5, 3);
    thumbSc.add(tDirLt, new THREE.AmbientLight(0xffffff, 0.85));

    function snapThumb(model) {
        thumbSc.add(model);
        thumbR.render(thumbSc, thumbCam);
        thumbSc.remove(model);
        model.traverse(n => { n.geometry?.dispose(); n.material?.dispose(); });
        return thumbR.domElement.toDataURL('image/png');
    }

    // ── Tower thumbnails ───────────────────────────────────────────
    thumbCam.position.set(0, 2.5, 5);
    thumbCam.lookAt(0, 1.2, 0);
    const towerImgs = {};
    Object.values(TOWER_TYPES).forEach(t => {
        const m = MODELS.buildTowerHead(t.id, null, TILE_SIZE);
        towerImgs[t.id] = m ? snapThumb(m) : '';
    });

    // ── Enemy thumbnails ───────────────────────────────────────────
    // Industry-standard approach: build every enemy at its true in-game scale
    // (et.scaleStr * TILE_SIZE), then use a single fixed camera sized to the
    // largest enemy so smaller enemies naturally appear smaller in frame.
    const MAX_ENEMY_SCALE = Math.max(...Object.values(ENEMY_TYPES).map(et => {
        // oni has an internal 1.5× body multiplier on top of its scaleStr
        return et.type === 'oni' ? et.scaleStr * 1.5 : et.scaleStr;
    }));
    const refS = MAX_ENEMY_SCALE * TILE_SIZE * 0.48;
    // Camera framed so the largest enemy (oni) nearly fills the thumbnail (~2% padding).
    // Elevated camera for a steeper, top-down-ish angled view. Centered carefully.
    thumbCam.position.set(0, refS * 3.2, refS * 1.5);
    thumbCam.lookAt(0, refS * 0.35, 0);

    const enemyImgs = {};
    Object.values(ENEMY_TYPES).forEach(et => {
        const group = new THREE.Group();
        const visualGroup = new THREE.Group();
        group.add(visualGroup);
        const body  = new THREE.Mesh();
        visualGroup.add(body);
        const fake = { mesh: group, visualGroup, body, scanner: null, baseHeight: 0 };
        // Pass the enemy's actual scaleStr so its model matches in-game proportions
        MODELS.applyEnemyStyle(fake, et.scaleStr * TILE_SIZE, 0, et.type);

        // Force the thumbnail to red to match the in-game behavior
        if (fake.body.material?.color) fake.body.material.color.setHex(COLORS.enemyBase);

        // Make the posed thumbnail look cuter by giving it a slight jaunty angle.
        // oodako/gashadokuro/bakedanuki are authored facing -Z (flipped at runtime
        // by animateEnemy) — turn them here too so they face the thumbnail camera.
        const facesAway = ['oodako', 'gashadokuro', 'bakedanuki'].includes(et.type);
        group.rotation.set(0, -Math.PI / 8 + (facesAway ? Math.PI : 0), 0.05);

        enemyImgs[et.type] = snapThumb(group);
    });

    thumbR.dispose();

    // ── Content data ───────────────────────────────────────────────
    const TOWER_PILLS = {
        pulse: 'Rapid-Fire', venom: 'Poison DOT', freeze: 'Slow 50%',
        dango: 'Chain x2',   beam:  'Continuous',  missile: 'AoE Splash',
        sniper: 'Long Range', yuzu: 'Area Poison', kaminari: 'Chain x8'
    };
    const ENEMY_LORE = {
        mochi:      "A squishy lil blob that just wants a hug! Sadly, hugs break the Core.",
        takoyaki:   "A tiny ant that drank way too much juice. Zooms past before you can even say 'bug'!",
        onigiri:    "A grumpy beetle pretending to be a knight. Looks tough, mostly just confused.",
        gyoza:      "A cranky sideways-walking crab! Boasts a fearsome fiddler claw and 8 scuttling legs.",
        tamagoyaki: "A wiggly, giggly centipede wearing way too many orange shoes!",
        kurage:     "A silly glowing gecko. Someone should tell him neon green isn't good camouflage!",
        warabi:     "A chunky little rat looking for cheese! Built like a brick, rolls like a potato.",
        nerikiri:   "A jumpy grasshopper made of candy. Loves to show off his big leafy legs!",
        kuronyudo:  "A giant grumbling duck looking for his pond. Gets annoyed and points his eyebrows at you!",
        tarabagani: "The king of the sea floor! One look at those twin claws and even towers start sweating.",
        daigamo:    "A colossal, chronically grumpy duck. The frown is permanent. The danger is real.",
        oodako:     "A giant kawaii octopus who just wants to cuddle — with all eight arms at once. The Core is not a pillow.",
        gashadokuro:"A colossal skeleton made of mochi bones. It rattles, it stomps, and it absolutely refuses to lie down.",
        bakedanuki: "A chubby shape-shifting tanuki with a smug grin and zero regrets. Leaves quite the mess when defeated.",
        raiju:      "A crackling electric wolf who generates his own thunder. Faster than he looks and twice as shocking.",
        yamata:     "An ancient eight-headed dragon centipede asleep underground for 800 years. Very grumpy about being woken up.",
        ohagi:      "A red treat that loves peek-a-boo — poke it and three little mochis pop out to say hi!",
        oni:        "The biggest, bossiest, grumpiest boss of them all! Definitely needs a time-out."
    };
    const ENEMY_SPECIAL = {
        ohagi:      { label: 'Splits into 3 Mochi',  cls: 'special--red'  },
        kuronyudo:  { label: 'Splits into 2 Ohagi',  cls: 'special--red'  },
        tarabagani: { label: 'Splits into 2 Gyoza',       cls: 'special--red'  },
        daigamo:    { label: 'Splits into 5 Ohagi',       cls: 'special--red'  },
        oodako:     { label: 'Splits into 6 Takoyaki',    cls: 'special--red'  },
        gashadokuro:{ label: 'Splits into 5 Onigiri',     cls: 'special--red'  },
        bakedanuki: { label: 'Splits: 3 Warabi + 2 Nerikiri', cls: 'special--red'  },
        raiju:      { label: 'Splits into 4 Kurage',      cls: 'special--red'  },
        yamata:     { label: 'Splits into 4 Tamagoyaki',  cls: 'special--red'  },
        kurage:     { label: 'Ultra-Fast', cls: 'special--cyan' },
        oni:        { label: 'Splits into 2 Mochi',  cls: 'special--red'  }
    };
    const ENEMY_COLORS = {
        mochi:      '#FFD1DC',
        takoyaki:   '#C68642',
        onigiri:    '#F5F5F7',
        gyoza:      '#F5E6C8',
        tamagoyaki: '#F9D56E',
        kurage:     '#88EEFF',
        warabi:     '#5AC8FA',
        nerikiri:   '#C084FC',
        kuronyudo:  '#FF3B30',
        tarabagani: '#8B1A1A',
        daigamo:    '#2C3E50',
        oodako:     '#D96A8C',
        gashadokuro:'#EDE8D0',
        bakedanuki: '#8B5E3C',
        raiju:      '#1A3A5C',
        yamata:     '#2D1B69',
        ohagi:      '#C8507A',
        oni:        '#FFB7C5'
    };

    // ── Basics HTML ────────────────────────────────────────────────
    const BASICS = [
        { color: '#00d4ff', title: 'Select & Build',  text: 'Pick a tower from the left panel, then click any green grass tile to place it.' },
        { color: '#ff4d93', title: 'Enemies March',   text: 'Critters follow the sand path automatically — your towers open fire on their own.' },
        { color: '#ffd166', title: 'Earn Gold',       text: 'Every defeated enemy drops gold. Use it to build more or upgrade what you have.' },
        { color: '#ff4757', title: 'Guard the Core',  text: 'Your Core starts at 100 HP. Every enemy that breaks through costs 10. Zero means game over.' },
        { color: '#7ed321', title: 'Upgrade Power',   text: 'Click any placed tower, then hit Upgrade for ★ (+25% dmg, +10% range) or ★★ (+50% dmg, +15% range).' }
    ];
    document.getElementById('guide-basics').innerHTML = `<div class="basics-grid">${
        BASICS.map(s => `<div class="basics-card" style="--bcard-color:${s.color}">
            <div class="basics-card-bar"></div>
            <div class="basics-card-body">
                <strong class="basics-card-title">${s.title}</strong>
                <p class="basics-card-text">${s.text}</p>
            </div>
        </div>`).join('')
    }</div>`;

    // ── Towers HTML ────────────────────────────────────────────────
    document.getElementById('guide-towers').innerHTML = `<div class="guide-card-grid">${
        Object.values(TOWER_TYPES).map(t => {
            const hex  = '#' + t.color.toString(16).padStart(6, '0');
            const bDmg = Math.round(t.dmg / 80 * 100);
            const bRng = Math.round(t.range / 6 * 100);
            const bRat = Math.round(Math.min(100, 0.02 / t.fireRate * 100));
            const pill = TOWER_PILLS[t.id] || '';
            return `<div class="guide-card tower-card" style="--card-color:${hex}">
                <div class="guide-thumb"><img src="${towerImgs[t.id]}" alt="${t.name}" draggable="false"></div>
                <div class="guide-card-info">
                    <div class="guide-card-header">
                        <span class="guide-card-name">${t.name}</span>
                    </div>
                    <span class="guide-pill" style="background:${hex}22;color:${hex};border-color:${hex}44">${pill}</span>
                    <div class="guide-stats">
                        <div class="guide-stat-row"><span class="guide-stat-label">DMG</span><div class="guide-stat-bar"><div class="guide-stat-fill" style="width:${bDmg}%;background:${hex}"></div></div></div>
                        <div class="guide-stat-row"><span class="guide-stat-label">RNG</span><div class="guide-stat-bar"><div class="guide-stat-fill" style="width:${bRng}%;background:${hex}"></div></div></div>
                        <div class="guide-stat-row"><span class="guide-stat-label">RATE</span><div class="guide-stat-bar"><div class="guide-stat-fill" style="width:${bRat}%;background:${hex}"></div></div></div>
                    </div>
                    <p class="guide-card-tooltip">${t.tooltip}</p>
                </div>
            </div>`;
        }).join('')
    }</div>`;

    // ── Enemies HTML ───────────────────────────────────────────────
    const wTier = w => w <= 5 ? 'easy' : w <= 11 ? 'mid' : 'hard';
    document.getElementById('guide-enemies').innerHTML = `<div class="guide-card-grid">${
        Object.values(ENEMY_TYPES).sort((a,b) => a.introduceWave - b.introduceWave).map(et => {
            const bHP  = Math.min(100, Math.round(et.hpMult / 16.0 * 100));
            const bSpd = Math.round(et.speedMult / 2.20 * 100);
            const wc   = wTier(et.introduceWave);
            const sp   = ENEMY_SPECIAL[et.type];
            const name = et.type.charAt(0).toUpperCase() + et.type.slice(1);
            // Ignore the individual enemy theme colors to ensure the left edge border is strictly Red
            const ec = '#ff4757'; 
            return `<div class="guide-card enemy-card" style="--card-color:${ec}">
                <div class="guide-thumb"><img src="${enemyImgs[et.type]}" alt="${name}" draggable="false"></div>
                <div class="guide-card-info">
                    <div class="guide-card-header">
                        <span class="guide-card-name">${name}</span>
                        <span class="wave-badge wave-badge--${wc}">Wave ${et.introduceWave}</span>
                    </div>
                    <p class="guide-card-lore">${ENEMY_LORE[et.type] || ''}</p>
                    <div class="guide-stats">
                        <div class="guide-stat-row"><span class="guide-stat-label">HP</span><div class="guide-stat-bar"><div class="guide-stat-fill" style="width:${bHP}%;background:#ff4757"></div></div></div>
                        <div class="guide-stat-row"><span class="guide-stat-label">SPD</span><div class="guide-stat-bar"><div class="guide-stat-fill" style="width:${bSpd}%;background:#74b9ff"></div></div></div>
                    </div>
                    ${sp ? `<span class="guide-pill ${sp.cls}">${sp.label}</span>` : ''}
                </div>
            </div>`;
        }).join('')
    }</div>`;

    // ── Codex HTML ─────────────────────────────────────────────────
    document.getElementById('guide-codex').innerHTML = `
    <div class="codex-section">
        <h3>Status Effects</h3>
        <div class="codex-effect-list">
            <div class="codex-effect"><div class="codex-effect-dot" style="background:#6bcb77"></div><div><strong>Poison</strong> — Damage over time. Ticks every 0.5s for the full duration. Applied by Venom &amp; Yuzu.</div></div>
            <div class="codex-effect"><div class="codex-effect-dot" style="background:#74b9ff"></div><div><strong>Slow</strong> — Reduces movement speed by 50% for the effect duration. Applied by Freeze.</div></div>
            <div class="codex-effect"><div class="codex-effect-dot" style="background:#8B5CF6"></div><div><strong>Chain</strong> — Damage arcs to nearby enemies within chain range. Applied by Dango (x2) &amp; Kaminari (x8).</div></div>
        </div>
    </div>
    <div class="codex-section">
        <h3>Upgrade System</h3>
        <div class="codex-upgrade-path">
            <div class="codex-tier"><div class="codex-tier-label">Base</div><div class="codex-tier-stat">Starting stats</div></div>
            <div class="codex-arrow">&#9654;</div>
            <div class="codex-tier codex-tier--1"><div class="codex-tier-label">&#9733; Tier 1</div><div class="codex-tier-stat">+25% dmg &nbsp;+10% range</div></div>
            <div class="codex-arrow">&#9654;</div>
            <div class="codex-tier codex-tier--2"><div class="codex-tier-label">&#9733;&#9733; Tier 2</div><div class="codex-tier-stat">+50% dmg &nbsp;+15% range</div></div>
        </div>
    </div>
    <div class="codex-section">
        <h3>Targeting Modes</h3>
        <div class="codex-target-list">
            <div class="codex-target"><strong>Furthest</strong><p>Default. Prioritizes enemies deepest along the path — prevents breakouts near the Core.</p></div>
            <div class="codex-target"><strong>Closest</strong><p>Finishes stragglers before they escape your range. Good for towers near the entry point.</p></div>
            <div class="codex-target"><strong>Weakest</strong><p>Low-HP priority — great for cleanup towers positioned behind your main defensive line.</p></div>
        </div>
    </div>
    <div class="codex-section">
        <h3>Map Progression</h3>
        <div class="codex-map-prog-list">
            <div class="codex-map-prog-row">
                <div class="codex-map-prog-dot" style="background:#7ed321"></div>
                <div><strong>Bamboo Pass</strong> — Always unlocked. Classic zigzag layout.</div>
            </div>
            <div class="codex-map-prog-row">
                <div class="codex-map-prog-dot" style="background:#00d4ff"></div>
                <div><strong>Serpent Valley</strong> — Reach wave <strong>10</strong> on Bamboo Pass.</div>
            </div>
            <div class="codex-map-prog-row">
                <div class="codex-map-prog-dot" style="background:#8B5CF6"></div>
                <div><strong>Twin Forks</strong> — Reach wave <strong>20</strong> on Serpent Valley.</div>
            </div>
            <div class="codex-map-prog-row">
                <div class="codex-map-prog-dot" style="background:#FFD166"></div>
                <div><strong>Seamless</strong> — Reach wave <strong>30</strong> on Twin Forks. The map grows after every wave — the Core shifts one cell each time, and the grid expands when it has nowhere left to go.</div>
            </div>
        </div>
    </div>
    <div class="codex-section">
        <h3>Pro Tips</h3>
        <div class="codex-tip-list">
            <div class="tip-box">Cover path bends — enemies slow at corners, making them prime targets for damage towers.</div>
            <div class="tip-box">Pair Freeze with Sniper or Beam for maximum efficiency against tanky high-HP foes.</div>
            <div class="tip-box">Ohagi splits on death — position AoE towers (Missile, Yuzu) nearby to catch all three mochi.</div>
        </div>
    </div>`;

    // ── Tab switching ──────────────────────────────────────────────
    document.querySelectorAll('.guide-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.guide-tab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.guide-pane').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('guide-' + btn.dataset.tab).classList.add('active');
        });
    });

    // Reset to Basics whenever the guide opens
    const guideModal = document.getElementById('how-to-play-modal');
    new MutationObserver(() => {
        if (!guideModal.classList.contains('hidden')) {
            document.querySelectorAll('.guide-tab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.guide-pane').forEach(p => p.classList.remove('active'));
            document.querySelector('.guide-tab[data-tab="basics"]').classList.add('active');
            document.getElementById('guide-basics').classList.add('active');
        }
    }).observe(guideModal, { attributes: true, attributeFilter: ['class'] });
}

function refreshMoveBtn() {
    const btn = document.getElementById('btn-move');
    if (btn) btn.classList.toggle('selected', !!state.movingTower);
}

// True if at least one empty buildable cell (grid value 0) exists on the board.
function hasFreeBuildCell() {
    for (let x = 0; x < GRID_WIDTH; x++) {
        for (let z = 0; z < GRID_HEIGHT; z++) {
            if (grid[x] && grid[x][z] === 0) return true;
        }
    }
    return false;
}

// Gray out tower buttons when unaffordable OR when the board has no free cell
// left to build on. Called from updateCredits (covers placements, since they
// spend credits) and from the Seamless expansion, which adds fresh cells.
function refreshTowerButtons() {
    const anyFreeCell = hasFreeBuildCell();
    Object.values(TOWER_TYPES).forEach(tower => {
        const btn = document.getElementById(`btn-${tower.id}`);
        if (btn) {
            const cost = getEffectiveCost(tower.baseCost);
            btn.classList.toggle('disabled', state.credits < cost || !anyFreeCell);
        }
    });

    // Auto-deselect if the selected tower can no longer be placed
    if (state.selectedTower && state.selectedTower !== 'move') {
        if (!anyFreeCell || state.credits < getEffectiveCost(TOWER_TYPES[state.selectedTower].baseCost)) {
            selectTower('move');
        }
    }

    // Keep the "Click again to move" hint in sync if a panel is open
    // (covers the board filling up or the Seamless map expanding mid-inspect).
    updateMoveHint();
}

// Moving is pointless with zero free cells — hide the info panel's move hint.
// Re-appears automatically when cells free up (Seamless expansion).
function updateMoveHint() {
    const hint = document.querySelector('#info-panel .info-hint');
    if (hint) hint.style.display = hasFreeBuildCell() ? '' : 'none';
}

// Wave-style notification when the last buildable cell is filled (non-seamless
// maps only). Reuses the pre-styled #milestone-banner, which had no other user.
function showBoardFullBanner() {
    const el = document.getElementById('milestone-banner');
    if (!el) return;
    el.innerHTML = 'BENTO BOX FULL!<div class="milestone-sub">No more space to place!</div>';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2200);
}

function selectTower(id) {
    if (id && id !== 'move' &&
        (state.credits < getEffectiveCost(TOWER_TYPES[id].baseCost) || !hasFreeBuildCell())) return;

    if (state.movingTower) {
        setMovingTower(null);
    }

    if (id === 'move' && state.selectedTower === 'move') return;

    state.selectedTower = state.selectedTower === id ? null : id;
    state.inspectedTower = null;
    hideInfoPanel();
    hideRadius();

    generateGhostModel(state.selectedTower);

    document.querySelectorAll('.tower-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.id === `btn-${state.selectedTower}`);
    });
    refreshMoveBtn(); // move btn only highlights when actively dragging a tower

    state.hoverValid = false;
    hoverMesh.visible = false;
}

function showInfoPanel(tower) {
    const data = tower.data || tower;

    document.getElementById('info-name').innerText = data.name;
    document.getElementById('info-dmg').innerText = data.dmg;
    document.getElementById('info-rng').innerText = data.range;
    document.getElementById('info-spd').innerText = (1 / data.fireRate).toFixed(1) + '/s';

    const upgradeEl = document.getElementById('info-upgrade-level');
    if (upgradeEl && tower.upgradeLevel !== undefined) {
        upgradeEl.innerText = tower.upgradeLevel >= 2 ? '★★ MAX' :
                              tower.upgradeLevel === 1 ? '★ Tier 1' : 'Base';
    }

    const upgradeBtn = document.getElementById('btn-upgrade');
    if (upgradeBtn && tower.upgradeLevel !== undefined) {
        if (tower.upgradeLevel >= UPGRADE_TIERS.length) {
            upgradeBtn.innerText = 'MAX LEVEL';
            upgradeBtn.disabled = true;
        } else {
            const tier = UPGRADE_TIERS[tower.upgradeLevel];
            const baseCost = TOWER_TYPES[data.id]?.baseCost ?? 100;
            const cost = getEffectiveCost(Math.ceil(baseCost * tier.costMult));
            upgradeBtn.innerText = `Upgrade ${tier.label} — ${cost}g`;
            upgradeBtn.disabled = state.credits < cost;
            upgradeBtn.onclick = () => {
                if (!state.inspectedTower) return;
                const res = upgradeTower(state.inspectedTower);
                if (res.ok) {
                    showInfoPanel(state.inspectedTower);
                    const t = state.inspectedTower;
                    const { x: gx, z: gz } = worldToGrid(t.pos.x, t.pos.z);
                    drawRadius(gx, gz, t.data.range, 0xff4757);
                }
            };
        }
    }

    const targetGroup = document.getElementById('targeting-select');
    if (targetGroup && tower.targeting !== undefined) {
        targetGroup.querySelectorAll('.targeting-opt').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.value === tower.targeting);
            btn.onclick = () => {
                if (!state.inspectedTower) return;
                state.inspectedTower.targeting = btn.dataset.value;
                targetGroup.querySelectorAll('.targeting-opt').forEach(b =>
                    b.classList.toggle('selected', b === btn)
                );
            };
        });
    }

    if (uiModel) {
        uiScene.remove(uiModel);
        disposeHierarchy(uiModel); // fresh-built per panel open — dispose or it leaks
    }
    uiModel = MODELS.buildTowerHead(data.id, null, TILE_SIZE);
    if(uiModel) {
        uiModel.position.set(0, -0.3, 0);
        uiModel.scale.set(1.3, 1.3, 1.3);
        uiScene.add(uiModel);
    }

    updateMoveHint();
    document.getElementById('info-panel').classList.remove('hidden');
}

function hideInfoPanel() {
    document.getElementById('info-panel').classList.add('hidden');
}

function updateCredits(amt) {
    state.credits += amt;
    const creditsEl = document.getElementById('credits');
    if (creditsEl) {
        creditsEl.innerText = state.credits;
        animateStatBump(creditsEl);
    }

    refreshTowerButtons();

    // Re-evaluate upgrade button affordability while a tower is inspected
    const upgradeBtn = document.getElementById('btn-upgrade');
    if (upgradeBtn && state.inspectedTower && state.inspectedTower.upgradeLevel < UPGRADE_TIERS.length) {
        const tier = UPGRADE_TIERS[state.inspectedTower.upgradeLevel];
        const baseCost = TOWER_TYPES[state.inspectedTower.data.id]?.baseCost ?? 100;
        const cost = getEffectiveCost(Math.ceil(baseCost * tier.costMult));
        upgradeBtn.disabled = state.credits < cost;
    }
}

// Called whenever difficulty changes — refreshes all displayed costs + affordability
function updateTowerCosts() {
    Object.values(TOWER_TYPES).forEach(tower => {
        const cost = getEffectiveCost(tower.baseCost);
        const costEl = document.getElementById(`cost-${tower.id}`);
        if (costEl) costEl.textContent = cost + 'g';
        const btn = document.getElementById(`btn-${tower.id}`);
        if (btn) btn.classList.toggle('disabled', state.credits < cost);
    });
}

// Low health stat box indicator
function updateHealthStatBox() {
    const box = document.getElementById('health-stat-box');
    if (!box) return;
    if (state.health <= 30) {
        box.classList.add('low-health');
    } else {
        box.classList.remove('low-health');
    }
}
