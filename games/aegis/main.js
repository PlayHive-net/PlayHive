// ============================================================================
// MAIN.JS — bootstrap, game loop, tower firing, projectiles, waves, lifecycle.
// Load order: 7th (last) — wires everything together and starts the loop.
// Defines:  init/setupThreeJS/setupPools, gameLoop (with error boundary),
//           updateTowers/Enemies/Projectiles/VFX, findTowerTarget &
//           findNextChainTarget, the fire* functions, startWave/startGame/
//           cleanupGame/resetGame, triggerGameOver, map-unlock flow.
// Consumes: every global defined by the six files above.
// ============================================================================

// ─── PER-FRAME SCRATCH VECTORS ───────────────────────────────────────────────
// Each is written and fully consumed within a single function call — never
// stored on an object. Avoids per-enemy/per-projectile Vector3 allocation in
// the hot loops.
const _enemyDir    = new THREE.Vector3(); // updateEnemyMovement
const _faceDir     = new THREE.Vector3(); // updateEnemyFacing
const _beamSrc     = new THREE.Vector3(); // updateBeamVisual
const _beamDir     = new THREE.Vector3(); // updateBeamVisual
const _projPos     = new THREE.Vector3(); // updateProjectiles
const _missileLook = new THREE.Vector3(); // updateProjectiles (missile lookAt)
const VEC_FWD      = new THREE.Vector3(0, 0, 1);
const VEC_DOWN     = new THREE.Vector3(0, -1, 0);

// ==========================================
// MAP UNLOCK SYSTEM
// ==========================================

const MAP_UNLOCK_REQS = [0, 10, 20, 30]; // waves needed on previous map to unlock each map

function isMapUnlocked(id) {
    if (id === 0) return true;
    const prev = parseInt(safeStorage.get(`aegis_map_best_${id - 1}`, '0'));
    return prev >= MAP_UNLOCK_REQS[id];
}

function updateMapUnlockUI() {
    document.querySelectorAll('.btn-map').forEach(btn => {
        const id = parseInt(btn.dataset.map);
        const locked = !isMapUnlocked(id);
        btn.classList.toggle('locked', locked);

        const badge = btn.querySelector('.map-unlock-req');
        if (badge) {
            if (locked) {
                const prev = parseInt(safeStorage.get(`aegis_map_best_${id - 1}`, '0'));
                badge.textContent = `${prev} / ${MAP_UNLOCK_REQS[id]} waves`;
            } else {
                badge.textContent = '';
            }
        }

        const tooltip = btn.querySelector('.map-tooltip');
        if (tooltip) {
            if (locked) {
                const prevMapName = MAP_CONFIGS[id - 1]?.name ?? 'previous map';
                const prev = parseInt(safeStorage.get(`aegis_map_best_${id - 1}`, '0'));
                tooltip.textContent = `Reach wave ${MAP_UNLOCK_REQS[id]} on ${prevMapName} to unlock (${prev}/${MAP_UNLOCK_REQS[id]})`;
            } else {
                tooltip.textContent = '';
            }
        }

        if (locked && btn.classList.contains('selected')) {
            btn.classList.remove('selected');
        }
    });

    // If the currently selected map got locked somehow, fall back to map 0
    const currentBtn = document.querySelector(`.btn-map[data-map="${state.currentMap}"]`);
    if (currentBtn && currentBtn.classList.contains('locked')) {
        state.currentMap = 0;
        const fallback = document.querySelector('.btn-map[data-map="0"]');
        if (fallback) fallback.classList.add('selected');
        rebuildMap();
    }
}

// ==========================================
// INITIALIZATION & THREE.JS SETUP
// ==========================================
function init() {
    if (setupThreeJS() === false) return; // no WebGL → overlay already shown
    buildUI();
    generateMapInstanced();
    setupPools();
    setupInteraction();
    setupMenuParticles();

    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-pause').addEventListener('click', togglePause);
    document.getElementById('btn-resume').addEventListener('click', togglePause);

    document.getElementById('btn-unlock-play').addEventListener('click', () => closeMapUnlockModal(true));
    document.getElementById('btn-unlock-continue').addEventListener('click', () => closeMapUnlockModal(false));

    document.getElementById('btn-how-to-play').addEventListener('click', () => {
        openModal('how-to-play-modal');
    });
    const handleCloseHtp = () => {
        const isStartScreen = !document.getElementById('start-screen').classList.contains('hidden');
        if (!state.isPlaying && !isStartScreen) {
            transitionModal('how-to-play-modal', 'pause-screen'); // back to pause menu
        } else {
            closeModal('how-to-play-modal', ANIMATION_TIMINGS.modalClose);
        }
    };

    document.getElementById('btn-close-htp').addEventListener('click', handleCloseHtp);
    document.getElementById('btn-close-htp-x').addEventListener('click', handleCloseHtp);

    document.getElementById('btn-pause-htp').addEventListener('click', () => {
        transitionModal('pause-screen', 'how-to-play-modal');
    });

    document.getElementById('btn-quit-to-menu').addEventListener('click', () => {
        state.isPlaying = false;

        // Save progress for the map the player was just on before cleanup resets state.wave
        if (state.wave > 0) {
            const mapKey = `aegis_map_best_${state.currentMap}`;
            const prev = parseInt(safeStorage.get(mapKey, '0'));
            if (state.wave > prev) safeStorage.set(mapKey, state.wave);
        }

        transitionModal('pause-screen', 'start-screen', {
            delay: ANIMATION_TIMINGS.modalReopenDelay,
            before: () => {
                cleanupGame();
                document.body.classList.remove('is-playing');
            },
            after: () => {
                animateMenuEntrance();
                updateMapUnlockUI();
            }
        });
    });

    // Difficulty segmented control
    document.querySelectorAll('.diff-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.diff-opt').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            state.difficulty = btn.dataset.diff;
            updateTowerCosts();
            updateDiffSlider();
        });
    });

    // Map select buttons
    document.querySelectorAll('.btn-map').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('locked')) return;
            document.querySelectorAll('.btn-map').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            state.currentMap = parseInt(btn.dataset.map);
            rebuildMap();
        });
    });

    updateMapUnlockUI();

    window.addEventListener('resize', onWindowResize, false);

    // Position slider after layout is ready
    requestAnimationFrame(() => requestAnimationFrame(updateDiffSlider));

    // Kick off the render loop
    requestAnimationFrame(gameLoop);

    // Animate the start screen in
    animateMenuEntrance();
}

function checkFirstVisit() {
    if (!safeStorage.get('aegis_tutorial_shown')) {
        document.getElementById('tutorial-overlay')?.classList.remove('hidden');
        return true;
    }
    return false;
}

function setupThreeJS() {
    const container = document.getElementById('game-canvas');
    if (!container) return false;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x45aaf2);

    const aspect = window.innerWidth / window.innerHeight;
    const d = 16;
    camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
    camera.position.set(20, 25, 20);
    camera.lookAt(0, 0, 0);
    camera.userData.targetX = 20;
    camera.userData.targetZ = 20;

    // r128's WebGLRenderer constructor throws when a WebGL context can't be created
    // (old hardware, disabled GPU, headless drivers) — fail with a friendly message.
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch (e) {
        showSystemOverlay('WebGL unavailable',
            'AEGIS needs WebGL to run. Please update your browser or enable hardware acceleration.');
        return false;
    }
    // Crisp on hi-DPI screens, capped at 2x so 4K displays stay fast.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.cursor = 'pointer';
    container.appendChild(renderer.domElement);

    // GPU context can be lost on driver resets / aggressive tab discarding.
    // Without this handler the canvas silently goes black under a live game.
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        state.isPlaying = false;
        showSystemOverlay('Graphics context lost', 'Please refresh the page to continue.');
    });

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(10, 30, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.left = -20;
    dirLight.shadow.camera.right = 20;
    dirLight.shadow.camera.top = 20;
    dirLight.shadow.camera.bottom = -20;
    scene.add(dirLight);

    worldGroup = new THREE.Group();
    worldGroup.position.set(-MAP_OFFSET_X + TILE_SIZE/2, 0, -MAP_OFFSET_Z + TILE_SIZE/2);
    scene.add(worldGroup);

    const hoverGeo = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
    const hoverMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
    hoverMesh = new THREE.Mesh(hoverGeo, hoverMat);
    hoverMesh.rotation.x = -Math.PI / 2;
    hoverMesh.position.y = 0.05;
    hoverMesh.visible = false;
    worldGroup.add(hoverMesh);
}

function setupPools() {
    enemyPool = new ObjectPool(() => {
        const mesh = new THREE.Group();
        const visualGroup = new THREE.Group();
        mesh.add(visualGroup);

        const body = new THREE.Mesh(ASSETS.geo.box, ASSETS.mat.enemy.clone());
        body.castShadow = true;
        visualGroup.add(body);

        worldGroup.add(mesh);

        return {
            id: -1, mesh, visualGroup, body,
            hp: 0, speed: 0, baseSpeed: 0,
            nodeIdx: 0, distanceTraveled: 0, slowTimer: 0, baseHeight: 0,
            poisonTimer: 0, poisonDmg: 0, poisonTickTimer: 0, animTimer: 0,
            flashTimer: 0, active: false, enemyType: 'normal', scanner: null,
            launchVel: null, splitPopTimer: -1, splitPopDuration: 0.22,
            // Model memo — applyEnemyStyle skips the full rebuild when a pooled
            // object is reused with the same type+scale it was last built as.
            builtType: null, builtScaleStr: -1
        };
    }, 20);

    projectilePool = new ObjectPool(() => {
        const pGroup = new THREE.Group();
        const mesh = new THREE.Mesh(ASSETS.geo.box, ASSETS.mat.projectile.clone());
        pGroup.add(mesh);
        worldGroup.add(pGroup);

        return {
            group: pGroup, mesh,
            start: new THREE.Vector3(), targetPoint: new THREE.Vector3(),
            targetEnemy: null, targetId: -1, data: null,
            speed: 0, progress: 0, distance: 0, active: false,
            color: 0xffffff, trailTimer: 0
        };
    }, 30);

    particlePool = new ObjectPool(() => {
        const group = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({color: 0xffffff});
        for(let i=0; i<8; i++) {
            const p = new THREE.Mesh(ASSETS.geo.box, mat);
            // Velocity is allocated once here and re-.set() on every burst —
            // explosions fire constantly and must not allocate per particle.
            p.userData.velocity = new THREE.Vector3();
            group.add(p);
        }
        worldGroup.add(group);
        return { group, age: 0, life: 0.3, active: false };
    }, 15);

    trailPool = new ObjectPool(() => {
        // Shared geometry; material is per-dot because opacity fades independently.
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
        const mesh = new THREE.Mesh(ASSETS.geo.trailDot, mat);
        worldGroup.add(mesh);
        return { mesh, mat, timer: 0, life: COMBAT_TUNING.trailLife, active: false };
    }, 24);
}

// ==========================================
// CORE GAME LOOP & UPDATES
// ==========================================
function startWave() {
    state.wave++;
    const waveEl = document.getElementById('wave-display');
    if (waveEl) waveEl.innerText = state.wave;

    const count = WAVE_SPAWNING.baseEnemyCount + Math.floor(state.wave * WAVE_SPAWNING.enemyCountScale);
    waveData.spawnInterval = Math.max(WAVE_SPAWNING.minSpawnInterval,
        WAVE_SPAWNING.initialSpawnInterval - (state.wave * WAVE_SPAWNING.spawnIntervalDecayPerWave));
    waveData.spawnTimer = waveData.spawnInterval;
    waveData.waveClearedHandled = false;

    // PRE-GENERATE AND SORT ENEMY QUEUE
    waveData.enemyQueue = [];
    const diff = DIFFICULTY_SETTINGS[state.difficulty] || DIFFICULTY_SETTINGS.normal;
    const hpBase = getWaveHpBase(state.wave, diff);
    
    const isBossWave = (state.wave % 5 === 0);
    
    // Find new enemies introduced this wave (excluding oni since boss waves handle it)
    const newEnemies = Object.values(ENEMY_TYPES).filter(e => e.introduceWave === state.wave && e.type !== 'oni');
    
    let specialSpawns = [];
    if (isBossWave) {
        // Boss spawns last and waits for field clear
        specialSpawns.push({
            hp: hpBase * 5,
            speed: 3.2,
            scaleStr: 1.3,
            type: 'oni',
            waitForClear: true
        });
    } else if (newEnemies.length > 0) {
        // New enemy introductions spawn last and wait for field clear
        newEnemies.forEach(e => {
            specialSpawns.push({
                hp: hpBase * e.hpMult,
                speed: 3.0 * e.speedMult, // Pure base speed
                scaleStr: e.scaleStr,
                type: e.type,
                waitForClear: true
            });
        });
    }

    const regularCount = count - specialSpawns.length;
    
    for (let i = 0; i < regularCount; i++) {
        let variant = pickEnemyVariant(state.wave);
        
        // Don't spawn the newly introduced enemy in the regular swarm yet
        if (specialSpawns.length > 0 && variant.introduceWave === state.wave && state.wave > 1) {
            variant = pickEnemyVariant(state.wave - 1);
        }

        const speedJitter = (Math.random() - 0.5) * 0.4;
        const speed = 3.0 * variant.speedMult + speedJitter;
        waveData.enemyQueue.push({
            hp: hpBase * variant.hpMult,
            speed: speed,
            scaleStr: variant.scaleStr,
            type: variant.type
        });
    }
    
    // Sort fastest first (highest speed first)
    waveData.enemyQueue.sort((a, b) => b.speed - a.speed);
    
    // Append special spawns at the end
    waveData.enemyQueue.push(...specialSpawns);
    
    waveData.enemiesToSpawn = waveData.enemyQueue.length;

    const elAnnouncer = document.getElementById('wave-announcer');
    if (elAnnouncer) {
        elAnnouncer.innerText = `WAVE ${state.wave}`;
        elAnnouncer.classList.add('show');
        setTimeout(() => elAnnouncer.classList.remove('show'), 2000);
    }

}

// Error boundary: one uncaught exception must not freeze the game forever.
// Log once per error streak (no per-frame console spam); after ~0.5s of
// consecutive failing frames, pause and tell the player to refresh.
let loopErrorStreak = 0;
const LOOP_ERROR_PAUSE_AFTER = 30;

function gameLoop() {
    requestAnimationFrame(gameLoop); // scheduling stays outside the try — loop must survive
    try {
        const raw = clock.getDelta();
        // Tab-wake guard: after a long background period treat the first frame as a
        // normal 60fps step instead of the 0.1s clamp (prevents a visible lurch).
        const dt = raw > 0.5 ? 0.016 : Math.min(raw, 0.1);

        if (state.isPlaying) {
            updateSpawning(dt);
            updateEnemies(dt);
            updateTowers(dt);
            updateProjectiles(dt);
            updateParticles(dt);
            updateTrails(dt);
            updateCreditFloats(dt);
            updateLowHealthWarning(dt);
            updateVFX(dt);
            if(coreMesh) coreMesh.rotation.y += dt;
        }

        applyScreenShake(dt);
        renderer.render(scene, camera);
        loopErrorStreak = 0; // any clean frame resets the latch
    } catch (err) {
        loopErrorStreak++;
        if (loopErrorStreak === 1) {
            console.error('AEGIS frame error:', err);
            showErrorToast('Something went wrong — trying to recover.');
        }
        if (loopErrorStreak === LOOP_ERROR_PAUSE_AFTER && state.isPlaying) {
            state.isPlaying = false;
            showSystemOverlay('Persistent error', 'AEGIS hit a repeating error. Refresh the page to continue.');
        }
    }
}

function updateVFX(dt) {
    if (!entities.activeVFX) return;
    for (let i = entities.activeVFX.length - 1; i >= 0; i--) {
        const vfx = entities.activeVFX[i];
        if (vfx.update(dt)) {
            entities.activeVFX.splice(i, 1);
        }
    }
}

function applyScreenShake(dt) {
    const tx = camera.userData.targetX !== undefined ? camera.userData.targetX : 20;
    const tz = camera.userData.targetZ !== undefined ? camera.userData.targetZ : 20;

    if (screenShake.timer <= 0) {
        if (state.isPlaying) {
            camera.position.x += (tx - camera.position.x) * 0.3;
            camera.position.z += (tz - camera.position.z) * 0.3;
        }
        return;
    }
    screenShake.timer -= dt;
    const t = screenShake.timer / screenShake.duration;
    const amp = screenShake.intensity * t;
    camera.position.x = tx + (Math.random() - 0.5) * amp * 2;
    camera.position.z = tz + (Math.random() - 0.5) * amp * 2;
}

function updateLowHealthWarning(dt) {
    if (state.health > 30) {
        lowHealthPulseTimer = 0;
        lowHealthPulseState = false;
        if (coreMesh) {
            coreMesh.material.color.setHex(COLORS.coreGlow);
            coreMesh.material.emissive.setHex(COLORS.coreGlow);
        }
        const hEl = document.getElementById('core-health');
        if (hEl) hEl.style.color = '';
        updateHealthStatBox();
        return;
    }

    updateHealthStatBox();
    lowHealthPulseTimer -= dt;
    if (lowHealthPulseTimer <= 0) {
        lowHealthPulseState = !lowHealthPulseState;
        lowHealthPulseTimer = 0.6;

        const col = lowHealthPulseState ? 0xff4757 : COLORS.coreGlow;
        if (coreMesh) {
            coreMesh.material.color.setHex(col);
            coreMesh.material.emissive.setHex(col);
            coreMesh.material.emissiveIntensity = lowHealthPulseState ? 1.2 : 0.5;
        }
        const hEl = document.getElementById('core-health');
        if (hEl) hEl.style.color = lowHealthPulseState ? '#ff4757' : '';
    }
}

function pickEnemyVariant(wave) {
    const pool = Object.values(ENEMY_TYPES).filter(e => e.introduceWave <= wave);
    let total = pool.reduce((sum, e) => sum + e.weight, 0);
    let r = Math.random() * total;
    for (const e of pool) {
        r -= e.weight;
        if (r <= 0) return e;
    }
    return pool[0];
}

// Approximate world half-width of an enemy from its visual scale. Used to keep
// spawn points clear — bigger critters claim proportionally more space.
function enemySpawnRadius(scaleStr) {
    return Math.max(0.4, (scaleStr || 1) * 0.55);
}

// Returns the index of a path fork whose spawn point has enough clearance for
// an enemy of this size, or -1 if every spawn point is currently crowded.
// Picks randomly among clear forks so multi-path maps keep their 50/50 feel.
function findClearSpawnFork(scaleStr) {
    const newR = enemySpawnRadius(scaleStr);
    const forks = allPathNodes.length > 0 ? allPathNodes : [pathNodes];
    const clear = [];
    for (let f = 0; f < forks.length; f++) {
        const start = forks[f]?.[0];
        if (!start) continue;
        let blocked = false;
        for (const e of entities.activeEnemies) {
            const minGap = newR + enemySpawnRadius(e.scaleStr);
            if (e.mesh.position.distanceToSquared(start) < minGap * minGap) {
                blocked = true;
                break;
            }
        }
        if (!blocked) clear.push(f);
    }
    if (clear.length === 0) return -1;
    return clear[Math.floor(Math.random() * clear.length)];
}

function updateSpawning(dt) {
    if (waveData.enemiesToSpawn > 0) {
        waveData.spawnTimer -= dt;
        if (waveData.spawnTimer <= 0) {
            if (waveData.enemyQueue && waveData.enemyQueue.length > 0) {
                const nextEnemy = waveData.enemyQueue[0];

                // If this is a special final spawn that requires the board to be clear
                if (nextEnemy.waitForClear && entities.activeEnemies.length > 0) {
                    waveData.spawnTimer = 0.5; // check again soon
                } else {
                    // Never spawn an enemy overlapping one already on the path —
                    // hold the spawn until a fork's entry point has clearance.
                    const fork = findClearSpawnFork(nextEnemy.scaleStr);
                    if (fork === -1) {
                        waveData.spawnTimer = 0.15; // spawn area crowded — retry shortly
                    } else {
                        const enemyDef = waveData.enemyQueue.shift();
                        waveData.spawnTimer = waveData.spawnInterval;
                        waveData.enemiesToSpawn--;

                        spawnEnemy(
                            enemyDef.hp,
                            enemyDef.speed,
                            enemyDef.scaleStr,
                            enemyDef.type,
                            null,
                            null,
                            fork
                        );
                    }
                }
            } else {
                waveData.enemiesToSpawn--;
            }
        }
    } else if (entities.activeEnemies.length === 0) {
        if (!waveData.waveClearedHandled && state.wave > 0) {
            waveData.waveClearedHandled = true;
            triggerWaveCleared();
        }
        if (!waveData.unlockModalOpen) waveData.timer -= dt;
        if (waveData.timer <= 0 && !waveData.unlockModalOpen) {
            waveData.timer = 3.0;
            startWave();
        }
    }
}

function triggerWaveCleared() {
    const el = document.getElementById('wave-cleared-banner');
    if (!el) return;
    el.innerText = `Wave ${state.wave} Cleared!`;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2200);

    // Per-map best wave tracking (used for unlock progression)
    const mapKey = `aegis_map_best_${state.currentMap}`;
    const prev = parseInt(safeStorage.get(mapKey, '0'));

    // Detect if this wave just triggers a first-time unlock of the next map
    const nextMapId = state.currentMap + 1;
    const wasNextMapLocked = nextMapId < MAP_CONFIGS.length && !isMapUnlocked(nextMapId);

    if (state.wave > prev) safeStorage.set(mapKey, state.wave);

    if (wasNextMapLocked && state.wave >= MAP_UNLOCK_REQS[nextMapId]) {
        waveData.unlockModalOpen = true;
        setTimeout(() => showMapUnlockModal(nextMapId), ANIMATION_TIMINGS.mapUnlockDelay);
    }

    // Seamless map: move the core after the banner fades
    if (state.currentMap === 3) {
        setTimeout(() => moveSeamlessCore(), 2500);
    }
}

function updateEnemies(dt) {
    for (let i = entities.activeEnemies.length - 1; i >= 0; i--) {
        const enemy = entities.activeEnemies[i];

        updateEnemyEffects(enemy, dt);
        updateEnemyPhysics(enemy, dt);
        updateEnemyAnimation(enemy, dt);
        
        const isCardinalFacer = isEnemyCardinalFacer(enemy);
        const shouldRemove = updateEnemyMovement(enemy, dt, isCardinalFacer);
        
        if (shouldRemove) {
            entities.activeEnemies.splice(i, 1);
            continue;
        }

        MODELS.animateEnemy(enemy, dt);
    }
}

function updateEnemyEffects(enemy, dt) {
    const bodyMat = enemy.body?.material;
    if (!bodyMat?.color) return;

    if (enemy.poisonTimer > 0) {
        enemy.poisonTimer -= dt;
        enemy.poisonTickTimer -= dt;
        if (enemy.poisonTickTimer <= 0) {
            enemy.poisonTickTimer = 0.5;
            damageEnemy(enemy, enemy.poisonDmg, 0x6bcb77);
            if (!enemy.active) return;
        }
    } else {
        enemy.poisonTimer = 0;
    }

    if (enemy.slowTimer > 0 && !enemy.isBoss) {
        enemy.slowTimer -= dt;
        enemy.speed = enemy.baseSpeed * enemy.slowMult;
    } else {
        enemy.slowTimer = 0;
        enemy.speed = enemy.baseSpeed;
    }

    if (enemy.flashTimer > 0) {
        const flashHex = enemy.flashColor ?? 0xffffff;
        bodyMat.color.setHex(flashHex);
        if (bodyMat.emissive) {
            bodyMat.emissive.setHex(flashHex);
            bodyMat.emissiveIntensity = 0.5;
        }
    } else if (enemy.slowTimer > 0) {
        bodyMat.color.setHex(COLORS.enemyFreeze);
        if (bodyMat.emissive) {
            bodyMat.emissive.setHex(0x000000);
            bodyMat.emissiveIntensity = 0;
        }
    } else {
        bodyMat.color.setHex(enemy.poisonTimer > 0 ? 0x6bcb77 : COLORS.enemyBase);
        if (bodyMat.emissive) {
            bodyMat.emissive.setHex(0x000000);
            bodyMat.emissiveIntensity = 0;
        }
    }
}

function updateEnemyPhysics(enemy, dt) {
    if (enemy.launchVel) {
        enemy.launchVel.multiplyScalar(Math.pow(0.012, dt));
        enemy.mesh.position.x += enemy.launchVel.x * dt;
        enemy.mesh.position.z += enemy.launchVel.z * dt;
        if (enemy.launchVel.length() < 0.08) enemy.launchVel = null;
    }

    if (enemy.enemyType === 'nerikiri') {
        const cycleDist = 2.5; 
        const cycleTime = cycleDist / enemy.baseSpeed; 
        
        enemy.animTimer += dt * (enemy.speed / enemy.baseSpeed);
        if (enemy.animTimer >= cycleTime) {
            enemy.animTimer %= cycleTime;
        }
        
        const progress = enemy.animTimer / cycleTime;
        
        if (progress < 0.4) {
            enemy.speed = 0;
        } else {
            enemy.speed = enemy.speed / 0.6;
        }
    }
}

function updateEnemyAnimation(enemy, dt) {
    if (enemy.flashTimer > 0) {
        enemy.flashTimer = Math.max(0, enemy.flashTimer - dt);
    }

    if (enemy.splitPopTimer >= 0) {
        enemy.splitPopTimer += dt;
        const t = Math.min(1, enemy.splitPopTimer / enemy.splitPopDuration);
        const eased = 1 - Math.pow(1 - t, 2.2);
        const bounce = 1 + Math.sin(t * Math.PI) * 0.18;
        enemy.mesh.scale.setScalar(eased * bounce);
        if (t >= 1) { enemy.mesh.scale.setScalar(1); enemy.splitPopTimer = -1; }
    }
}

function updateEnemyMovement(enemy, dt, isCardinalFacer) {
    const targetNode = (enemy.pathArr || pathNodes)[enemy.nodeIdx + 1];
    if (!targetNode) {
        damageCore();
        enemyPool.release(enemy);
        return true; 
    }

    const dir = _enemyDir.subVectors(targetNode, enemy.mesh.position);
    dir.y = 0;
    const distToNode = dir.length();
    const moveAmt = enemy.speed * dt;
    enemy.distanceTraveled += moveAmt;

    if (moveAmt >= distToNode) {
        enemy.mesh.position.x = targetNode.x;
        enemy.mesh.position.z = targetNode.z;
        enemy.nodeIdx++;
        
        if (isCardinalFacer) {
            const newTarget = (enemy.pathArr || pathNodes)[enemy.nodeIdx + 1];
            if (newTarget) updateEnemyFacing(enemy, targetNode, newTarget);
        }
    } else {
        dir.normalize();
        enemy.mesh.position.x += dir.x * moveAmt;
        enemy.mesh.position.z += dir.z * moveAmt;

        if (isCardinalFacer) {
            const currentNode = (enemy.pathArr || pathNodes)[enemy.nodeIdx];
            if (currentNode) {
                updateEnemyFacing(enemy, currentNode, targetNode);
            } else {
                enemy.mesh.lookAt(enemy.mesh.position.x + dir.x, enemy.mesh.position.y, enemy.mesh.position.z + dir.z);
            }
        } else {
            enemy.mesh.lookAt(enemy.mesh.position.x + dir.x, enemy.mesh.position.y, enemy.mesh.position.z + dir.z);
        }
    }

    return false;
}

function isEnemyCardinalFacer(enemy) {
    const cardinalFacers = ['takoyaki', 'onigiri', 'kurage', 'warabi', 'nerikiri', 'tamagoyaki'];
    return cardinalFacers.includes(enemy.enemyType);
}

function updateEnemyFacing(enemy, fromNode, toNode) {
    const direction = _faceDir.subVectors(toNode, fromNode);
    direction.y = 0;
    direction.normalize();
    enemy.mesh.lookAt(
        enemy.mesh.position.x + direction.x,
        enemy.mesh.position.y,
        enemy.mesh.position.z + direction.z
    );
}

function togglePause() {
    const pauseScreen = document.getElementById('pause-screen');
    const isStartScreen = !document.getElementById('start-screen').classList.contains('hidden');

    if (isStartScreen) return;

    state.isPlaying = !state.isPlaying;

    if (state.isPlaying) {
        closeModal('pause-screen', 220);
        clock.getDelta();
    } else {
        openModal('pause-screen');
    }
}

function updateTowers(dt) {
    entities.towers.forEach(tower => {
        tower.timer -= dt;

        MODELS.animateTowerIdle(tower, dt);

        let bestTarget = findTowerTarget(tower);

        if (bestTarget) {
            tower.idleTimer = 0;
            tower.isIdle = false;
            MODELS.aimTower(tower, bestTarget.mesh.position, dt);
        } else {
            tower.idleTimer += dt;
            tower.isIdle = true;
        }

        // Per-frame beam visual update (must run every frame, not just when firing)
        if (tower.beamGroup?.visible) {
            tower.beamActiveTimer -= dt;
            const t = clock.elapsedTime;
            if (tower.beamActiveTimer > 0) {
                // Track only while it's still the SAME enemy — pooled objects get
                // recycled for new spawns, and on multi-spawn maps that would drag
                // the beam clear across the map to the other entrance.
                const bt = tower.beamTarget;
                if (bt?.active && bt.id === tower.beamTargetId && bt.mesh?.position) {
                    updateBeamVisual(tower, bt.mesh.position);
                } else if (bt) {
                    tower.beamTarget = null;   // target died — hold last position…
                    tower.beamActiveTimer = 0; // …and start the fade immediately
                }
                const pulse = 0.5 + Math.sin(t * 38) * 0.5;
                tower.beamCore.material.opacity   = 0.80 + pulse * 0.15;
                tower.beamMid.material.opacity    = 0.55 + pulse * 0.22;
                tower.beamGlow.material.opacity   = 0.08 + pulse * 0.10;
                tower.beamImpact.material.opacity = 0.25 + pulse * 0.28;
                tower.beamImpact.scale.setScalar(0.85 + pulse * 0.30);
            } else {
                tower.beamCore.material.opacity   = Math.max(0, tower.beamCore.material.opacity   - dt * 10);
                tower.beamMid.material.opacity    = Math.max(0, tower.beamMid.material.opacity    - dt * 8);
                tower.beamGlow.material.opacity   = Math.max(0, tower.beamGlow.material.opacity   - dt * 5);
                tower.beamImpact.material.opacity = Math.max(0, tower.beamImpact.material.opacity - dt * 8);
                if (tower.beamCore.material.opacity === 0) {
                    tower.beamGroup.visible  = false;
                    tower.beamImpact.visible = false;
                    tower.beamCore.material.opacity   = 0.95;
                    tower.beamMid.material.opacity    = 0.80;
                    tower.beamGlow.material.opacity   = 0.14;
                    tower.beamImpact.material.opacity = 0.40;
                }
            }
        }

        if (tower.timer > 0) return;

        if (bestTarget) {
            if (tower.data.id === 'beam') {
                fireBeam(tower, bestTarget);
            } else if (tower.data.id === 'sniper') {
                fireSniper(tower, bestTarget);
            } else if (tower.data.id === 'yuzu') {
                fireYuzu(tower);
            } else if (tower.data.id === 'kaminari') {
                fireKaminari(tower, bestTarget);
            } else {
                fireProjectile(tower.pos, bestTarget, tower.data, tower);
            }

            tower.timer = tower.data.fireRate;
            MODELS.triggerTowerFire(tower);
        }
    });
}

// Runs per tower per frame — single pass, no intermediate array, squared
// distances (no sqrt). `>=` keeps the old reduce() tie-break (later enemy wins).
function findTowerTarget(tower) {
    const rangeSq = Math.pow(tower.data.range * TILE_SIZE, 2);
    const mode = tower.targeting || 'furthest';
    let best = null, bestMetric = -Infinity;
    for (let i = 0; i < entities.activeEnemies.length; i++) {
        const e = entities.activeEnemies[i];
        const dSq = tower.pos.distanceToSquared(e.mesh.position);
        if (dSq > rangeSq) continue;
        const metric = mode === 'closest' ? -dSq
                     : mode === 'weakest' ? -e.hp
                     : e.distanceTraveled; // 'furthest' default
        if (metric >= bestMetric) { bestMetric = metric; best = e; }
    }
    return best;
}

// Nearest active enemy to fromEnemy within chainRangeSq, excluding already-chained
// ids. Shared by Kaminari's precomputed chain and Dango's interleaved chain.
function findNextChainTarget(fromEnemy, chainedIds, chainRangeSq) {
    let best = null, bestSq = chainRangeSq;
    for (const e of entities.activeEnemies) {
        if (chainedIds.has(e.id)) continue;
        const dSq = fromEnemy.mesh.position.distanceToSquared(e.mesh.position);
        if (dSq <= bestSq) { bestSq = dSq; best = e; }
    }
    return best;
}

function fireBeam(tower, bestTarget) {
    // Lazy-init persistent beam visual on first fire
    if (!tower.beamGroup) {
        const group = new THREE.Group();

        const coreGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 6);
        coreGeo.rotateX(Math.PI / 2);
        tower.beamCore = new THREE.Mesh(coreGeo,
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false }));

        const midGeo = new THREE.CylinderGeometry(0.060, 0.060, 1, 6);
        midGeo.rotateX(Math.PI / 2);
        tower.beamMid = new THREE.Mesh(midGeo,
            new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.80, depthWrite: false }));

        const glowGeo = new THREE.CylinderGeometry(0.20, 0.20, 1, 8);
        glowGeo.rotateX(Math.PI / 2);
        tower.beamGlow = new THREE.Mesh(glowGeo,
            new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.BackSide }));

        group.add(tower.beamGlow);
        group.add(tower.beamMid);
        group.add(tower.beamCore);
        group.visible = false;
        tower.beamGroup = group;
        worldGroup.add(group);

        const impGeo = new THREE.SphereGeometry(0.20, 8, 6);
        tower.beamImpact = new THREE.Mesh(impGeo,
            new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.40, depthWrite: false }));
        tower.beamImpact.visible = false;
        worldGroup.add(tower.beamImpact);

        tower.beamActiveTimer = 0;
    }

    tower.beamTarget = bestTarget;
    tower.beamTargetId = bestTarget.id; // identity check for the visual tracker
    updateBeamVisual(tower, bestTarget.mesh.position);
    tower.beamImpact.visible = true;
    tower.beamGroup.visible = true;
    tower.beamActiveTimer = 0.10;
    tower.attackPoseTimer = Math.max(tower.attackPoseTimer || 0, 0.22);

    damageEnemy(bestTarget, tower.data.dmg, tower.data.color);
}

function updateBeamVisual(tower, targetPos) {
    if (!targetPos) return;

    const src = _beamSrc.copy(tower.pos);
    if (tower.head?.userData?.wandTip) {
        tower.head.userData.wandTip.getWorldPosition(src);
        worldGroup.worldToLocal(src);
        // Lower only the wand-side endpoint to match the firing pose.
        src.y -= 0.16;
    }

    const dist = src.distanceTo(targetPos);
    if (dist < 0.01) return;

    const dir = _beamDir.subVectors(targetPos, src).normalize();
    tower.beamGroup.quaternion.setFromUnitVectors(VEC_FWD, dir);
    tower.beamGroup.position.copy(src).lerp(targetPos, 0.5);
    tower.beamGroup.scale.z = dist;
    tower.beamImpact.position.copy(targetPos);
}

function fireSniper(tower, bestTarget) {
    const dist = tower.pos.distanceTo(bestTarget.mesh.position);
    // Shared unit-length geometry stretched to span — no per-shot geometry build.
    const sniperMat = new THREE.MeshBasicMaterial({ color: 0xffcd3c, transparent: true, opacity: 1.0 });
    const sniperMesh = new THREE.Mesh(ASSETS.geo.unitBeam, sniperMat);
    sniperMesh.position.copy(tower.pos).lerp(bestTarget.mesh.position, 0.5);
    sniperMesh.lookAt(bestTarget.mesh.position);
    sniperMesh.scale.z = dist;
    worldGroup.add(sniperMesh);

    spawnTimedVFX({
        duration: 0.15,
        onUpdate: (progress) => { sniperMat.opacity = Math.max(0, 1.0 - progress); },
        onDone: () => {
            worldGroup.remove(sniperMesh);
            sniperMat.dispose(); // material only — geometry is shared
        }
    });

    damageEnemy(bestTarget, tower.data.dmg, tower.data.color);
    spawnTrailDot(tower.pos, 0xffcd3c);
}

function fireYuzu(tower) {
    const range = tower.data.range * TILE_SIZE;
    const rangeSq = range * range;
    // Snapshot active enemies — damageEnemy may splice the array mid-loop
    const inRange = entities.activeEnemies.filter(e =>
        tower.pos.distanceToSquared(e.mesh.position) <= rangeSq
    );
    inRange.forEach(e => {
        damageEnemy(e, tower.data.dmg, tower.data.color);
        if (e.active) {
            e.poisonTimer     = tower.data.poisonTime;
            e.poisonDmg       = tower.data.poisonDmg;
            e.poisonTickTimer = tower.data.poisonTick;
        }
    });

    const burstPos = tower.pos.clone().add(new THREE.Vector3(0, 0.5, 0));
    createYuzuEffect(burstPos, tower.data.range * TILE_SIZE);
}

function fireKaminari(tower, bestTarget) {
    if (tower.data.id === 'kaminari') MODELS.kaminariFireAnim(tower);

    // Initial instant hit: from tower tip down to primary target
    const emitOrigin = new THREE.Vector3(tower.pos.x, tower.pos.y + TILE_SIZE * 0.35, tower.pos.z);
    createLightningArc(emitOrigin, bestTarget.mesh.position.clone(), tower.data.color, 220, tower.upgradeLevel ?? 0);
    damageEnemy(bestTarget, tower.data.dmg, tower.data.color);
    if (bestTarget.active) createElectricBurst(bestTarget.mesh.position, tower.data.color);

    // Chain to nearby enemies
    const chained = new Set([bestTarget.id]);
    const chainOrder = [bestTarget];
    let chainFrom = bestTarget;
    const chainRangeSq = Math.pow(tower.data.chainRange * TILE_SIZE, 2);

    for (let c = 0; c < tower.data.chainCount; c++) {
        const chainTarget = findNextChainTarget(chainFrom, chained, chainRangeSq);
        if (!chainTarget) break;
        chained.add(chainTarget.id);
        chainOrder.push(chainTarget);
        chainFrom = chainTarget;
    }

    if (chainOrder.length < 2) return;

    // Staggered cascade — frame-driven (one activeVFX entry) instead of wall-clock
    // setTimeouts. This makes the cascade pause-aware (updateVFX only runs while
    // state.isPlaying) and auto-cancelled on cleanupGame, so no hop ever fires on a
    // cleared/new board. Each hop captures the target's id and re-validates identity
    // before drawing/damaging: a pooled enemy that died and was recycled for a new
    // far-side enemy will fail the id check, so the chain can never arc or shock
    // across the map. Mirrors the dango/venom/freeze guard (id === captured id).
    const upgradeLevel = tower.upgradeLevel ?? 0;
    const hopDelayMs = upgradeLevel >= 2 ? COMBAT_TUNING.kaminariHopDelayUpgradedMs : COMBAT_TUNING.kaminariHopDelayMs;
    const chainColor = tower.data.color;
    const chainDmg = Math.ceil(tower.data.dmg * COMBAT_TUNING.chainDmgMult);

    const hops = [];
    for (let i = 1; i < chainOrder.length; i++) {
        hops.push({
            fromEnemy: chainOrder[i - 1], fromId: chainOrder[i - 1].id,
            toEnemy:   chainOrder[i],     toId:   chainOrder[i].id,
            delay: i * hopDelayMs,
            done: false,
        });
    }

    let elapsed = 0;
    entities.activeVFX.push({
        update: (dt) => {
            elapsed += dt * 1000;
            let remaining = false;
            for (const hop of hops) {
                if (hop.done) continue;
                if (elapsed < hop.delay) { remaining = true; continue; }
                hop.done = true;

                const to = hop.toEnemy;
                if (!to.active || to.id !== hop.toId) continue; // recycled/dead → skip hop
                const toPos = to.mesh.position.clone();

                const from = hop.fromEnemy;
                if (from.active && from.id === hop.fromId) {
                    createLightningArc(from.mesh.position.clone(), toPos, chainColor, 220, upgradeLevel);
                }
                createElectricBurst(toPos, chainColor);
                damageEnemy(to, chainDmg, chainColor);
                triggerScreenShake(0.018, 0.12);
            }
            return !remaining; // complete once every hop has fired or been skipped
        },
        dispose: () => {}, // child arcs/bursts are their own activeVFX entries
    });
}

// ─── TRAIL SYSTEM ─────────────────────────────────────────────────────────────

function spawnTrailDot(position, color) {
    const t = trailPool.get();
    t.mesh.position.copy(position);
    t.mat.color.setHex(color);
    t.mat.opacity = 0.8;
    t.timer = 0;
    entities.activeTrails.push(t);
}

function updateTrails(dt) {
    for (let i = entities.activeTrails.length - 1; i >= 0; i--) {
        const t = entities.activeTrails[i];
        t.timer += dt;
        const alpha = 1 - (t.timer / t.life);
        t.mat.opacity = Math.max(0, alpha * 0.8);
        if (t.timer >= t.life) {
            trailPool.release(t);
            entities.activeTrails.splice(i, 1);
        }
    }
}

function updateProjectiles(dt) {
    for (let i = entities.activeProjectiles.length - 1; i >= 0; i--) {
        const p = entities.activeProjectiles[i];
        p.progress += (p.speed * dt) / Math.max(p.distance, 0.1);

        if (p.targetEnemy && p.targetEnemy.active && p.targetEnemy.id === p.targetId) {
            p.targetPoint.copy(p.targetEnemy.mesh.position);
        }

        if (p.progress >= 1) {
            handleImpact(p);
            if (p.customMissile) p.customMissile.visible = false;
            projectilePool.release(p);
            entities.activeProjectiles.splice(i, 1);
            continue;
        }

        const currentPos = _projPos.lerpVectors(p.start, p.targetPoint, p.progress);

        if (p.data.id === 'missile') {
            currentPos.y += Math.sin(p.progress * Math.PI) * (p.distance * 0.3);
            p.mesh.lookAt(_missileLook.copy(currentPos).add(VEC_DOWN));
        } else {
            p.mesh.lookAt(p.targetPoint);
        }

        p.group.position.copy(currentPos);

        p.trailTimer += dt;
        if (p.trailTimer >= COMBAT_TUNING.trailInterval) {
            p.trailTimer = 0;
            spawnTrailDot(currentPos, p.color || 0xffffff);
        }
    }
}

function handleImpact(p) {
    createExplosion(p.targetPoint, p.data.color, p.data.id === 'missile' ? 2 : 1);

    if (p.data.id === 'missile') {
        triggerScreenShake(0.06, 0.2);
        const splashSq = Math.pow(p.data.splashRadius * TILE_SIZE, 2);
        for (let j = entities.activeEnemies.length - 1; j >= 0; j--) {
            const e = entities.activeEnemies[j];
            if (e.mesh.position.distanceToSquared(p.targetPoint) <= splashSq) {
                damageEnemy(e, p.data.dmg, p.data.color);
            }
        }
        createSplashRing(p.targetPoint, p.data.color, p.data.splashRadius * TILE_SIZE);
    } else if (p.data.id === 'dango') {
        if (p.targetEnemy.active && p.targetEnemy.id === p.targetId) {
            
            damageEnemy(p.targetEnemy, p.data.dmg, p.data.color);

            // Chain to nearby enemies. Selection stays interleaved with damage on
            // purpose: a mid-chain kill can split an enemy, and the children are
            // then valid targets for the next hop (precomputing would change that).
            const chained = new Set([p.targetId]);
            let chainFrom = p.targetEnemy;
            const chainRangeSq = Math.pow(p.data.chainRange * TILE_SIZE, 2);

            for (let c = 0; c < p.data.chainCount; c++) {
                const chainTarget = findNextChainTarget(chainFrom, chained, chainRangeSq);
                if (!chainTarget) break;
                chained.add(chainTarget.id);
                
                // Show a splash marker on the hop and draw the chaining line
                createExplosion(chainTarget.mesh.position.clone(), p.data.color, 0.7);
                createSolidLine(chainFrom.mesh.position.clone(), chainTarget.mesh.position.clone(), p.data.color, 150);
                
                damageEnemy(chainTarget, Math.ceil(p.data.dmg * COMBAT_TUNING.chainDmgMult), p.data.color);
                if (!chainTarget.active) break;
                chainFrom = chainTarget;
            }
        }
    } else if (p.data.id === 'venom') {
        if (p.targetEnemy.active && p.targetEnemy.id === p.targetId) {
            damageEnemy(p.targetEnemy, p.data.dmg, p.data.color);
            if (p.targetEnemy.active) {
                p.targetEnemy.poisonTimer = p.data.poisonTime;
                p.targetEnemy.poisonDmg = p.data.poisonDmg;
                p.targetEnemy.poisonTickTimer = p.data.poisonTick;
            }
        }
    } else {
        if (p.targetEnemy.active && p.targetEnemy.id === p.targetId) {
            if (p.data.id === 'freeze') {
                p.targetEnemy.slowTimer = p.data.slowTime;
                p.targetEnemy.slowMult = p.data.slowMult;
            }
            damageEnemy(p.targetEnemy, p.data.dmg, p.data.color);
        }
    }
}

function updateParticles(dt) {
    for (let i = entities.activeParticles.length - 1; i >= 0; i--) {
        const p = entities.activeParticles[i];
        p.age += dt;
        if (p.age >= p.life) {
            particlePool.release(p);
            entities.activeParticles.splice(i, 1);
            continue;
        }
        p.group.children.forEach(child => {
            child.position.addScaledVector(child.userData.velocity, dt);
            child.scale.multiplyScalar(Math.pow(0.9, dt / 0.016));
        });
    }
}

function updateCreditFloats(dt) {
    for (let i = entities.activeCreditFloats.length - 1; i >= 0; i--) {
        const f = entities.activeCreditFloats[i];
        f.timer += dt;
        const progress = f.timer / f.life;
        // transform/opacity only — compositor-friendly, no layout work per frame.
        // (-50% keeps the CSS horizontal centering from .credit-float.)
        f.el.style.transform = `translate(-50%, ${-progress * 55}px)`;
        f.el.style.opacity = Math.max(0, 1 - progress * 1.3);
        if (f.timer >= f.life) {
            releaseCreditFloat(f);
            entities.activeCreditFloats.splice(i, 1);
        }
    }
}

// ==========================================
// LIFECYCLE MANAGEMENT
// ==========================================
function startGame() {
    const btn = document.getElementById('btn-start');
    if (btn) btn.classList.remove('idle-pulse');

    closeModal('start-screen', 200);
    setTimeout(() => {
        document.body.classList.add('is-playing');
        const diff = DIFFICULTY_SETTINGS[state.difficulty] || DIFFICULTY_SETTINGS.normal;
        state.credits = diff.startCredits;
        state.health = 100;
        state.enemiesKilled = 0;
        state.isPlaying = true;

        updateCredits(0);
        updateTowerCosts();
        const healthEl = document.getElementById('core-health');
        if (healthEl) healthEl.innerText = '100%';
        const waveEl = document.getElementById('wave-display');
        if (waveEl) waveEl.innerText = '0';
        selectTower('move');
        waveData.timer = 2.0;

        if (checkFirstVisit()) {
            state.isPlaying = false;
        }
    }, 220);
}

function triggerGameOver() {
    state.isPlaying = false;

    const finalWave = state.wave;

    const best = parseInt(safeStorage.get('aegis_best_wave', '0'));
    if (finalWave > best) {
        safeStorage.set('aegis_best_wave', finalWave);
        safeStorage.set('aegis_best_kills', state.enemiesKilled);
    }
    const bestWave = Math.max(finalWave, best);

    // Per-map best wave tracking (used for unlock progression)
    const mapKey = `aegis_map_best_${state.currentMap}`;
    const prevMapBest = parseInt(safeStorage.get(mapKey, '0'));
    if (finalWave > prevMapBest) safeStorage.set(mapKey, finalWave);

    const flash = document.getElementById('death-flash');
    if (flash) {
        flash.classList.add('active');
        setTimeout(() => flash.classList.remove('active'), 500);
    }

    setTimeout(() => {
        cleanupGame();
        document.body.classList.remove('is-playing');

        const lastEl = document.getElementById('last-wave-display');
        const bestEl = document.getElementById('best-wave-display');
        const statsRow = document.getElementById('last-run-stats');
        if (lastEl) lastEl.innerText = finalWave;
        if (bestEl) bestEl.innerText = bestWave;
        if (statsRow) statsRow.classList.remove('hidden');

        openModal('start-screen');
        animateMenuEntrance();
        updateMapUnlockUI();
    }, 620);
}

function cleanupGame() {
    entities.towers.forEach(t => {
        worldGroup.remove(t.group);
        if (t.beamGroup) {
            worldGroup.remove(t.beamGroup);
            t.beamCore.geometry.dispose();
            t.beamCore.material.dispose();
            t.beamMid.geometry.dispose();
            t.beamMid.material.dispose();
            t.beamGlow.geometry.dispose();
            t.beamGlow.material.dispose();
        }
        if (t.beamImpact) {
            worldGroup.remove(t.beamImpact);
            t.beamImpact.geometry.dispose();
            t.beamImpact.material.dispose();
        }
    });
    entities.towers = [];

    entities.activeEnemies.forEach(e => enemyPool.release(e));
    entities.activeProjectiles.forEach(p => projectilePool.release(p));
    entities.activeParticles.forEach(p => particlePool.release(p));
    entities.activeTrails.forEach(t => trailPool.release(t));
    entities.activeCreditFloats.forEach(releaseCreditFloat);

    if (entities.activeVFX) {
        entities.activeVFX.forEach(vfx => {
            if (vfx.dispose) vfx.dispose();
        });
    }

    entities.activeEnemies = [];
    entities.activeProjectiles = [];
    entities.activeParticles = [];
    entities.activeTrails = [];
    entities.activeCreditFloats = [];
    entities.activeVFX = [];

    for (let x = 0; x < GRID_WIDTH; x++)
        for (let z = 0; z < GRID_HEIGHT; z++)
            if (grid[x] && grid[x][z] === 3) grid[x][z] = 0;

    state.wave = 0;
    waveData.enemiesToSpawn = 0;
    waveData.waveClearedHandled = false;
    waveData.unlockModalOpen = false;
    // Hide unlock modal immediately if it was open during cleanup
    const unlockOverlay = document.getElementById('map-unlock-overlay');
    if (unlockOverlay) {
        unlockOverlay.classList.remove('show');
        unlockOverlay.classList.add('hidden');
    }
    screenShake.timer = 0;
    lowHealthPulseTimer = 0;
    lowHealthPulseState = false;

    // Reset seamless map state so a fresh path generates on next play
    if (state.currentMap === 3) {
        const seamlessBaseSize = MAP_CONFIGS[3]?.gridSize || 7;
        state.seamlessPath = null;
        state.seamlessGridSize = seamlessBaseSize;
        state.seamlessGridWidth = seamlessBaseSize;
        state.seamlessGridHeight = seamlessBaseSize;
        GRID_WIDTH = seamlessBaseSize;
        GRID_HEIGHT = seamlessBaseSize;
        MAP_OFFSET_X = (GRID_WIDTH * TILE_SIZE) / 2;
        MAP_OFFSET_Z = (GRID_HEIGHT * TILE_SIZE) / 2;
        worldGroup.position.set(-MAP_OFFSET_X + TILE_SIZE / 2, 0, -MAP_OFFSET_Z + TILE_SIZE / 2);
        adjustCameraForGridSize();
    }

    rebuildMap();

    const healthEl = document.getElementById('core-health');
    if (healthEl) healthEl.innerText = '100%';
    const waveEl = document.getElementById('wave-display');
    if (waveEl) waveEl.innerText = '0';
    hideInfoPanel();
    selectTower(null);

    const healthBox = document.getElementById('health-stat-box');
    if (healthBox) healthBox.classList.remove('low-health');
}

function resetGame() {
    cleanupGame();
    startGame();
}

function onWindowResize() {
    // devicePixelRatio can change when the window moves between monitors
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    adjustCameraForGridSize();

    // Re-position diff slider after resize
    requestAnimationFrame(updateDiffSlider);
}

function showMapUnlockModal(nextMapId) {
    const cfg = MAP_CONFIGS[nextMapId];
    if (!cfg) return;
    const nameEl = document.getElementById('muc-map-name');
    if (nameEl) nameEl.textContent = cfg.name;
    const overlay = document.getElementById('map-unlock-overlay');
    if (!overlay) return;
    overlay.dataset.nextMap = nextMapId;
    overlay.classList.remove('hidden');
    // Reading offsetHeight forces a reflow so the CSS transition fires on .show
    overlay.offsetHeight;
    overlay.classList.add('show');
}

function closeMapUnlockModal(goToNext) {
    const overlay = document.getElementById('map-unlock-overlay');
    const nextMapId = parseInt(overlay.dataset.nextMap || '1');
    overlay.classList.remove('show');
    setTimeout(() => {
        overlay.classList.add('hidden');
        waveData.unlockModalOpen = false;
    }, 380);

    if (goToNext) {
        state.isPlaying = false;
        setTimeout(() => {
            cleanupGame();
            document.body.classList.remove('is-playing');
            // Switch to the newly unlocked map
            state.currentMap = nextMapId;
            document.querySelectorAll('.btn-map').forEach(b => b.classList.remove('selected'));
            const nextBtn = document.querySelector(`.btn-map[data-map="${nextMapId}"]`);
            if (nextBtn) nextBtn.classList.add('selected');
            rebuildMap();
            openModal('start-screen');
            animateMenuEntrance();
            updateMapUnlockUI();
        }, 420);
    }
}

window.onload = init;
