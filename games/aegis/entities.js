// ============================================================================
// ENTITIES.JS — towers, enemies, projectiles, combat resolution & VFX.
// Load order: 6th — needs every file above; main.js (loaded after) provides
//             the pools and worldGroup before any function here runs.
// Defines:  ok/fail result helpers, buildTower/upgradeTower, spawnEnemy,
//           fireProjectile, spawnTimedVFX + the effect creators (explosions,
//           shockwaves, rings, lightning arcs, bursts), damageEnemy,
//           damageCore, createCreditFloat.
// Consumes: state/entities/waveData + tuning tables (config.js), MODELS
//           (models.js), enemyPool/projectilePool/particlePool/trailPool and
//           worldGroup (created in main.js).
// ============================================================================

const ok    = (value)         => ({ ok: true,  value });
const fail  = (error, detail) => ({ ok: false, error, detail });

// ─── TOWER ASSEMBLY ───────────────────────────────────────────────────────────

function buildTower(gridX, gridZ, towerData) {
    if (!towerData?.id) return fail('buildTower: invalid towerData', towerData);

    grid[gridX][gridZ] = 3;

    const group = new THREE.Group();
    const gw = gridToWorld(gridX, gridZ);
    group.position.set(gw.x, 0, gw.z);

    const accentMat = TOWER_MATS[towerData.id];
    const head = MODELS.buildTowerHead(towerData.id, accentMat, TILE_SIZE);
    if (head) group.add(head);

    worldGroup.add(group);

    const tower = {
        data: { ...towerData },   // copy so upgrades don't mutate TOWER_TYPES
        group,
        head: head ?? null,
        timer: 0,
        upgradeLevel: 0,
        idleTimer: 0,
        isIdle: false,
        targeting: 'furthest',    // 'furthest' | 'closest' | 'weakest'
        gx: gridX, gz: gridZ,     // grid coords — needed for repositioning on grid expansion
        pos: new THREE.Vector3(
            group.position.x,
            TILE_SIZE * 0.5,
            group.position.z,
        ),
    };

    entities.towers.push(tower);
    return ok(tower);
}

// ─── TOWER UPGRADES ───────────────────────────────────────────────────────────

function upgradeTower(tower) {
    const nextLevel = tower.upgradeLevel + 1;
    if (nextLevel > UPGRADE_TIERS.length) return fail('upgradeTower: max level');

    const tier = UPGRADE_TIERS[nextLevel - 1];
    // Upgrade cost uses the tower's original baseCost, scaled by difficulty
    const baseCost = TOWER_TYPES[tower.data.id]?.baseCost ?? tower.data.baseCost ?? 100;
    const cost = getEffectiveCost(Math.ceil(baseCost * tier.costMult));

    if (state.credits < cost) return fail('upgradeTower: insufficient credits');

    updateCredits(-cost);
    tower.upgradeLevel = nextLevel;

    // Scale up stats
    const base = TOWER_TYPES[tower.data.id];
    tower.data.dmg   = Math.ceil(base.dmg   * tier.dmgMult);
    tower.data.range = parseFloat((base.range * tier.rangeMult).toFixed(2));

    // Tier-2 special effects
    if (tier.specialEffect) {
        if (tower.data.id === 'pulse' || tower.data.id === 'missile') {
            if (tower.data.splashRadius) tower.data.splashRadius *= 2;
        }
        if (tower.data.id === 'freeze') {
            tower.data.slowMult = 0.25;
        }
    }

    // Add star visual indicator
    MODELS.addUpgradeVisual(tower, nextLevel, TILE_SIZE);

    createExplosion(tower.pos, tower.data.color, 1.0);
    return ok({ tower, cost });
}

// ─── ENEMY SPAWNING ───────────────────────────────────────────────────────────

function spawnEnemy(hp, speed, scaleStr, type, parent = null, launchAngle = null, forkIdx = null) {
    // Prefer a pooled object already wearing this exact model so
    // applyEnemyStyle can skip the full rebuild.
    const enemy = enemyPool.get(o => o.builtType === type && o.builtScaleStr === scaleStr);
    enemy.launchVel = null;
    enemy.splitPopTimer = -1;
    // Reset scale: an enemy killed mid-split-pop is released at scale < 1 and
    // would otherwise leak that into its next non-launch spawn. (The launch
    // branch below still overwrites this with setScalar(0).)
    enemy.mesh.scale.setScalar(1);

    let assignedPath, startNodeIdx;
    if (parent) {
        assignedPath  = parent.pathArr;
        startNodeIdx  = parent.nodeIdx;
    } else {
        // updateSpawning may pass a pre-picked fork with verified spawn clearance
        const fork = forkIdx ?? (allPathNodes.length > 1 ? (Math.random() < 0.5 ? 0 : 1) : 0);
        assignedPath  = allPathNodes[fork] || pathNodes;
        startNodeIdx  = 0;
    }

    enemy.id = waveData.enemyIdCounter++;
    enemy.hp = hp;
    enemy.speed = speed;
    enemy.baseSpeed = speed;
    enemy.scaleStr = scaleStr; // visual size — used for spawn-clearance checks
    enemy.nodeIdx = startNodeIdx;
    enemy.pathArr = assignedPath;
    enemy.distanceTraveled = parent ? parent.distanceTraveled : 0;
    enemy.slowTimer = 0;
    enemy.poisonTimer = 0;
    enemy.poisonDmg = 0;
    enemy.poisonTickTimer = 0;
    enemy.animTimer = parent ? parent.animTimer : 0;
    enemy.isBoss = type === 'oni';
    enemy.enemyType = type || 'normal';
    enemy.flashTimer = 0;

    MODELS.applyEnemyStyle(enemy, scaleStr, assignedPath[startNodeIdx].y, type);

    if (parent) {
        enemy.mesh.position.copy(parent.mesh.position);
        if (launchAngle !== null) {
            enemy.launchVel = new THREE.Vector3(
                Math.cos(launchAngle) * ENEMY_PHYSICS.launchSpeed,
                0,
                Math.sin(launchAngle) * ENEMY_PHYSICS.launchSpeed
            );
            enemy.mesh.scale.setScalar(0);
            enemy.splitPopTimer = 0;
        } else {
            enemy.mesh.position.x += (Math.random() - 0.5) * 0.6;
            enemy.mesh.position.z += (Math.random() - 0.5) * 0.6;
        }
    } else {
        enemy.mesh.position.copy(assignedPath[0]);
    }

    entities.activeEnemies.push(enemy);
}

// ─── PROJECTILE FIRING ────────────────────────────────────────────────────────

// Static projectile styling — scale vectors built once (was 6 fresh Vector3s
// per shot); speeds come from config. Color is resolved per shot in fireProjectile.
const PROJECTILE_STYLES = {
    pulse:    { scale: new THREE.Vector3(0.30, 0.30, 0.30), speed: ENEMY_PHYSICS.projectileSpeeds.pulse },
    freeze:   { scale: new THREE.Vector3(0.40, 0.40, 0.40), speed: ENEMY_PHYSICS.projectileSpeeds.freeze },
    missile:  { scale: new THREE.Vector3(0.40, 0.60, 0.40), speed: ENEMY_PHYSICS.projectileSpeeds.missile },
    dango:    { scale: new THREE.Vector3(0.35, 0.35, 0.35), speed: ENEMY_PHYSICS.projectileSpeeds.dango },
    venom:    { scale: new THREE.Vector3(0.45, 0.45, 0.45), speed: ENEMY_PHYSICS.projectileSpeeds.venom },
    kaminari: { scale: new THREE.Vector3(0.38, 0.38, 0.38), speed: ENEMY_PHYSICS.projectileSpeeds.kaminari },
};

function fireProjectile(origin, targetEnemy, towerData, towerRef) {
    if (!origin || !targetEnemy?.mesh || !towerData?.id) return fail('fireProjectile: invalid args');
    if (!targetEnemy.active) return fail('fireProjectile: target inactive');

    const p = projectilePool.get();

    p.start.copy(origin);
    p.targetPoint.copy(targetEnemy.mesh.position);
    p.targetEnemy = targetEnemy;
    p.targetId    = targetEnemy.id;
    p.data        = towerData;
    p.towerRef    = towerRef ?? null;
    p.progress    = 0;
    p.distance    = origin.distanceTo(p.targetPoint);
    p.trailTimer  = 0;

    const { mesh } = p;
    const style = PROJECTILE_STYLES[towerData.id] ?? PROJECTILE_STYLES.pulse;
    // Missile is always white; every other projectile uses its tower's color.
    const color = towerData.id === 'missile' ? 0xffffff : towerData.color;
    mesh.material.color.setHex(color);
    mesh.scale.copy(style.scale);
    p.speed = style.speed;
    p.color = color;

    p.group.position.copy(origin);

    if (towerData.id === 'missile') {
        p.mesh.visible = false;
        if (!p.customMissile) {
            p.customMissile = MODELS.buildMiniMissile();
            p.group.add(p.customMissile);
        }
        p.customMissile.visible = true;
    } else {
        p.mesh.visible = true;
        if (p.customMissile) p.customMissile.visible = false;
    }

    entities.activeProjectiles.push(p);
    return ok(p);
}

// ─── VFX ──────────────────────────────────────────────────────────────────────

// Timed VFX harness — drives the common "create meshes → animate for a duration
// → clean up" pattern through entities.activeVFX, so every effect is pause-aware
// (updateVFX only runs while state.isPlaying) and cancelled by cleanupGame.
//   duration  seconds of animation (after `delay`)
//   delay     seconds to wait before the first onUpdate (optional)
//   onUpdate  (progress 0→1, elapsed seconds, dt) called each active frame
//   onDone    cleanup — runs on natural completion AND on cleanupGame disposal
function spawnTimedVFX({ duration, delay = 0, onUpdate, onDone }) {
    let elapsed = -delay;
    entities.activeVFX.push({
        update(dt) {
            elapsed += dt;
            if (elapsed < 0) return false; // still in delay window
            if (onUpdate) onUpdate(Math.min(1, elapsed / duration), elapsed, dt);
            if (elapsed >= duration) { if (onDone) onDone(); return true; }
            return false;
        },
        dispose() { if (onDone) onDone(); },
    });
}

function createExplosion(position, color, scale) {
    if (!position) return fail('createExplosion: invalid position');

    const p = particlePool.get();
    p.group.position.copy(position);
    p.age  = 0;
    p.life = 0.3;

    p.group.children.forEach(child => {
        child.material.color.setHex(color);
        child.scale.setScalar(0.3 * scale);
        child.position.set(0, 0, 0);
        child.userData.velocity.set(
            (Math.random() - 0.5) * 10,
            Math.random() * 10 + 2,
            (Math.random() - 0.5) * 10,
        );
    });

    entities.activeParticles.push(p);
    return ok(p);
}

function createSplitBurst(position, childCount, splitType) {
    const colorMap = { ohagi: 0xff9eb5, mochi: 0xffd1dc };
    const burstColor = colorMap[splitType] ?? 0xffb3d1;

    const p = particlePool.get();
    p.group.position.copy(position);
    p.age  = 0;
    p.life = 0.5;
    p.group.children.forEach(child => {
        child.material.color.setHex(burstColor);
        child.scale.setScalar(0.6);
        child.position.set(0, 0, 0);
        child.userData.velocity.set(
            (Math.random() - 0.5) * 18,
            Math.random() * 14 + 4,
            (Math.random() - 0.5) * 18
        );
    });
    entities.activeParticles.push(p);

    setTimeout(() => { if (worldGroup) createExplosion(position, 0xffffff, 1.0); }, 70);

    createShockwave(position, burstColor, childCount >= 3 ? 10 : 7);
}

function createBossDeathExplosion(position, color) {
    // Large multi-burst
    for (let burst = 0; burst < 4; burst++) {
        const delay = burst * 80;
        setTimeout(() => {
            if (!worldGroup) return;
            createExplosion(
                position.clone().add(new THREE.Vector3(
                    (Math.random()-0.5)*2, Math.random()*1.5, (Math.random()-0.5)*2
                )),
                color, 2.5
            );
        }, delay);
    }

    // Shockwave ring
    createShockwave(position, color);
}

function createShockwave(position, color, speed = ENEMY_PHYSICS.shockwaveSpeed) {
    // Shared pre-rotated geometry; FrontSide — the camera only ever sees the top.
    const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.9, depthWrite: false
    });
    const ring = new THREE.Mesh(ASSETS.geo.shockwaveRing, mat);
    ring.position.copy(position);
    ring.position.y = 0.15;
    ring.renderOrder = 5;
    worldGroup.add(ring);

    spawnTimedVFX({
        duration: 0.3,
        onUpdate: (progress, t) => {
            const s = 1 + t * speed;
            ring.scale.set(s, s, s);
            mat.opacity = Math.max(0, 0.9 - t * 3);
        },
        onDone: () => { worldGroup.remove(ring); mat.dispose(); } // geometry is shared
    });
}

function createSplashRing(position, color, radius) {
    // Shared pre-rotated geometry; FrontSide — the camera only ever sees the top.
    const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0, depthWrite: false
    });
    const ring = new THREE.Mesh(ASSETS.geo.splashRing, mat);
    ring.position.copy(position);
    ring.position.y = 0.12;
    ring.renderOrder = 5;
    ring.scale.setScalar(0.01);
    worldGroup.add(ring);

    const expandTime = 0.18, fadeTime = 0.28;
    spawnTimedVFX({
        duration: expandTime + fadeTime,
        onUpdate: (progress, t) => {
            if (t <= expandTime) {
                const prog = t / expandTime;
                ring.scale.setScalar(radius * prog);
                mat.opacity = 0.32 * prog;
            } else {
                const prog = (t - expandTime) / fadeTime;
                ring.scale.setScalar(radius);
                mat.opacity = Math.max(0, 0.32 * (1 - prog * prog));
            }
        },
        onDone: () => { worldGroup.remove(ring); mat.dispose(); } // geometry is shared
    });
}

function createYuzuEffect(position, radius) {
    const C_FLASH  = 0xd4ffb0;
    const C_BRIGHT = 0x98e07c;
    const C_MID    = 0x6bcb77;
    const gx = position.x, gz = position.z;

    // ground disc — soft area color wash (shared unit geometry, scaled to range)
    {
        const mat = new THREE.MeshBasicMaterial({
            color: C_MID, transparent: true, opacity: 0, depthWrite: false
        });
        const disc = new THREE.Mesh(ASSETS.geo.yuzuDisc, mat);
        disc.position.set(gx, 0.08, gz);
        disc.scale.setScalar(radius);
        disc.renderOrder = 4;
        worldGroup.add(disc);
        spawnTimedVFX({
            duration: 0.77,
            onUpdate: (progress, t) => {
                mat.opacity = t < 0.12
                    ? (t / 0.12) * 0.09
                    : Math.max(0, 0.09 * (1 - (t - 0.12) / 0.65));
            },
            onDone: () => { worldGroup.remove(disc); mat.dispose(); } // geometry is shared
        });
    }

    // ripple rings — 3 staggered, ease-out expansion to full radius
    [
        { delay:   0, color: C_BRIGHT, maxOp: 0.62 },
        { delay: 0.14, color: C_MID,    maxOp: 0.48 },
        { delay: 0.28, color: C_MID,    maxOp: 0.35 },
    ].forEach(({ delay, color, maxOp }) => {
        let initialized = false;
        let mat, ring;
        const expandTime = 0.54, fadeTime = 0.38;

        spawnTimedVFX({
            duration: expandTime + fadeTime,
            delay,
            onUpdate: (progress, t) => {
                // Lazy init: the ring is only built once its delay has elapsed,
                // so a reset during the stagger window has nothing to clean up.
                // Geometry is shared (ASSETS.geo.yuzuRing); FrontSide — the
                // camera only ever sees the top of these ground quads.
                if (!initialized) {
                    mat = new THREE.MeshBasicMaterial({
                        color, transparent: true, opacity: 0, depthWrite: false
                    });
                    ring = new THREE.Mesh(ASSETS.geo.yuzuRing, mat);
                    ring.position.set(gx, 0.12, gz);
                    ring.renderOrder = 5;
                    ring.scale.setScalar(0.01);
                    worldGroup.add(ring);
                    initialized = true;
                }

                if (t <= expandTime) {
                    const prog = 1 - Math.pow(1 - t / expandTime, 2.2);
                    ring.scale.setScalar(Math.max(0.01, radius * prog));
                    mat.opacity = maxOp * Math.min(1, prog * 2.5);
                } else {
                    const prog = (t - expandTime) / fadeTime;
                    mat.opacity = Math.max(0, maxOp * (1 - prog));
                }
            },
            onDone: () => {
                if (initialized) {
                    worldGroup.remove(ring); mat.dispose(); // geometry is shared
                }
            }
        });
    });

    // particles — central flash burst + 6 scattered bursts
    createExplosion(position, C_FLASH, 1.5);
    [
        { delay:  70, dx:  radius * 0.42, dz:  0             },
        { delay: 100, dx: -radius * 0.42, dz:  0             },
        { delay: 130, dx:  0,             dz:  radius * 0.42 },
        { delay: 160, dx:  0,             dz: -radius * 0.42 },
        { delay: 200, dx:  radius * 0.28, dz:  radius * 0.28 },
        { delay: 240, dx: -radius * 0.28, dz: -radius * 0.28 },
    ].forEach(({ delay, dx, dz }) => {
        // Frame-driven delayed burst (was setTimeout): freezes with pause and
        // never stacks a backlog of explosions after a long pause/reset.
        const py = position.y;
        let fired = false;
        spawnTimedVFX({
            delay: delay / 1000,
            duration: 0,
            onUpdate: () => {
                if (!fired) {
                    fired = true;
                    createExplosion(new THREE.Vector3(gx + dx, py, gz + dz), C_BRIGHT, 0.75);
                }
            },
            onDone: () => {} // nothing to clean — must not fire the burst on reset
        });
    });
}

function triggerScreenShake(intensity, duration) {
    screenShake.intensity = intensity;
    screenShake.duration  = duration;
    screenShake.timer     = duration;
}

// Pooled credit-float divs. Kills arrive in bursts (yuzu/missile AoE hit every
// enemy at once), and a createElement + append + remove cycle per kill caused
// DOM churn spikes. Pooled elements stay in the DOM and just toggle display.
const creditFloatPool = [];

function createCreditFloat(position, amount) {
    const layer = document.getElementById('ui-layer');
    if (!layer) return fail('createCreditFloat: no ui-layer');

    let el = creditFloatPool.pop();
    if (!el) {
        el = document.createElement('div');
        el.className = 'credit-float';
        layer.appendChild(el); // appended once — recycled elements never leave the DOM
    }
    el.textContent = `+${amount}g`;

    // Project 3D position to screen
    const screenPos = worldPosToScreen(position);
    el.style.left = screenPos.x + 'px';
    el.style.top  = screenPos.y + 'px';
    el.style.transform = '';
    el.style.opacity = '';
    el.style.display = '';

    entities.activeCreditFloats.push({ el, timer: 0, life: 1.2 });

    return ok(el);
}

// Hide a float's element and return it to the pool (no DOM removal).
function releaseCreditFloat(f) {
    f.el.style.display = 'none';
    creditFloatPool.push(f.el);
}

const _screenV = new THREE.Vector3(); // scratch — consumed within the call

function worldPosToScreen(worldPos) {
    const v = _screenV.copy(worldPos);
    // Convert worldGroup-local to scene-world
    worldGroup.localToWorld(v);
    v.project(camera);
    return {
        x: (v.x *  0.5 + 0.5) * window.innerWidth,
        y: (v.y * -0.5 + 0.5) * window.innerHeight
    };
}

// ─── COMBAT ───────────────────────────────────────────────────────────────────

function damageEnemy(enemy, amount, color = 0xffffff) {
    if (!enemy || !enemy.active) return fail('damageEnemy: invalid enemy');

    enemy.hp -= amount;
    enemy.flashColor = color;
    enemy.body.material.emissive.setHex(color);
    // Use 0.5 intensity instead of 1.0! 1.0 + the diffuse color maxes out RGB to #ffffff (white).
    enemy.body.material.emissiveIntensity = 0.5;
    enemy.flashTimer = 0.10; // seconds

    if (enemy.hp > 0) return ok({ killed: false });

    const idx = entities.activeEnemies.indexOf(enemy);
    if (idx === -1) return fail('damageEnemy: enemy not found');

    const diff = DIFFICULTY_SETTINGS[state.difficulty] || DIFFICULTY_SETTINGS.normal;
    const creditReward = diff.killCredits(state.wave);
    updateCredits(creditReward);
    state.enemiesKilled++;

    // Floating credit text
    createCreditFloat(enemy.mesh.position.clone(), creditReward);

    if (enemy.isBoss) {
        createBossDeathExplosion(enemy.mesh.position.clone(), 0xff4757);
    } else {
        createExplosion(enemy.mesh.position, COLORS.enemyBase, 1.5);
    }

    // Split on death
    const typeDef = ENEMY_TYPES[enemy.enemyType];
    if (typeDef?.splits) {
        const { count, type: splitType } = typeDef.splits;
        const splitDef = ENEMY_TYPES[splitType];
        if (splitDef) {
            const hpBase = getWaveHpBase(state.wave, diff);
            const baseAngle = Math.random() * Math.PI * 2;
            for (let i = 0; i < count; i++) {
                const angle = baseAngle + (i / count) * Math.PI * 2;
                spawnEnemy(
                    hpBase * splitDef.hpMult * 0.55,
                    3.0 * splitDef.speedMult + (Math.random() - 0.5) * 0.4,
                    splitDef.scaleStr,
                    splitDef.type,
                    enemy,
                    angle
                );
            }
            createSplitBurst(enemy.mesh.position.clone(), count, splitType);
        }
    }
    if (typeDef?.splitsMulti) {
        const hpBase = (20 + (state.wave * 15) + Math.pow(state.wave, 1.5)) * diff.hpMult;
        typeDef.splitsMulti.forEach(({ count, type: splitType }) => {
            const splitDef = ENEMY_TYPES[splitType];
            if (!splitDef) return;
            const baseAngle = Math.random() * Math.PI * 2;
            for (let i = 0; i < count; i++) {
                const angle = baseAngle + (i / count) * Math.PI * 2;
                spawnEnemy(
                    hpBase * splitDef.hpMult * 0.55,
                    3.0 * splitDef.speedMult + (Math.random() - 0.5) * 0.4,
                    splitDef.scaleStr,
                    splitDef.type,
                    enemy,
                    angle
                );
            }
            createSplitBurst(enemy.mesh.position.clone(), count, splitType);
        });
    }

    enemyPool.release(enemy);
    entities.activeEnemies.splice(idx, 1);

    return ok({ killed: true, creditReward });
}

function damageCore() {
    const damagePerLeak = 10;
    state.health -= damagePerLeak;

    const healthEl = document.getElementById('core-health');
    if (healthEl) healthEl.innerText = `${Math.max(0, state.health)}%`;

    if (coreMesh) {
        // Red pulse + scale
        coreMesh.material.color.setHex(0xff4757);
        coreMesh.material.emissive.setHex(0xff4757);
        coreMesh.material.emissiveIntensity = 1.5;

        const origScale = coreMesh.scale.clone();
        coreMesh.scale.multiplyScalar(0.72);

        setTimeout(() => {
            if (!coreMesh) return;
            coreMesh.material.color.setHex(COLORS.coreGlow);
            coreMesh.material.emissive.setHex(COLORS.coreGlow);
            coreMesh.material.emissiveIntensity = 0.5;
            coreMesh.scale.copy(origScale);
        }, 250);
    }

    // Flash the HUD health display
    const hEl = document.getElementById('core-health');
    if (hEl) {
        hEl.style.color = '#ff4757';
        setTimeout(() => { hEl.style.color = ''; }, 300);
    }

    triggerScreenShake(0.04, 0.15);

    if (state.health <= 0) triggerGameOver();
    return ok({ gameOver: state.health <= 0 });
}

// ─── KAMINARI CHAIN LIGHTNING VFX ────────────────────────────────────────────

// Bolts are always 3 midpoint-displacement levels deep (2→3→5→9 points), so
// every bolt is written in place into this preallocated 9-point scratch array
// — zero allocation per bolt, even during the 28-38ms re-jitter of live arcs.
// Safe to share across all arcs: generation + geometry write are synchronous.
const BOLT_POINTS = Array.from({ length: 9 }, () => new THREE.Vector3());

// Displace pts[mi] to the jittered midpoint of pts[ai]..pts[bi] (in place).
function displaceMid(pts, ai, mi, bi, jitter) {
    const a = pts[ai], b = pts[bi], mid = pts[mi];
    mid.lerpVectors(a, b, 0.5);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const segLen = Math.sqrt(dx * dx + dz * dz) || 0.001;
    mid.x += (-dz / segLen) * jitter * (Math.random() - 0.5) * 2;
    mid.z += ( dx / segLen) * jitter * (Math.random() - 0.5) * 2;
    mid.y += (Math.random() - 0.5) * jitter * 0.4;
}

// Fractal bolt via midpoint displacement — same math/order as the old
// recursive version (jitter halves by 0.52 per level), allocation-free.
function generateBoltPoints(start, end, jitter) {
    const p = BOLT_POINTS;
    p[0].copy(start);
    p[8].copy(end);
    displaceMid(p, 0, 4, 8, jitter); // level 1
    jitter *= 0.52;
    displaceMid(p, 0, 2, 4, jitter); // level 2
    displaceMid(p, 4, 6, 8, jitter);
    jitter *= 0.52;
    displaceMid(p, 0, 1, 2, jitter); // level 3
    displaceMid(p, 2, 3, 4, jitter);
    displaceMid(p, 4, 5, 6, jitter);
    displaceMid(p, 6, 7, 8, jitter);
    return p;
}

// Rewrite an existing bolt geometry's positions in place — no BufferAttribute
// reallocation and no bounding-sphere recompute (frustum culling is disabled on
// these short-lived additive lines). This is the hot path during re-jitter, so
// keeping it allocation-free is what removed the GC churn behind the old "spam".
function writeBoltGeometry(geo, pts) {
    const attr = geo.attributes.position;
    for (let i = 0; i < pts.length; i++) attr.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
    attr.needsUpdate = true;
}

// Pool of two-layer arc line pairs (fixed 9-point geometries + reusable
// materials). Kaminari fires up to 9 arcs per 0.9s shot — pooled, an arc costs
// zero allocations. Lines stay in worldGroup and toggle visibility.
const arcPool = [];

function acquireArcLines() {
    const arc = arcPool.pop();
    if (arc) {
        arc.outerLine.visible = true;
        arc.innerLine.visible = true;
        return arc;
    }
    const mkLine = (renderOrder) => {
        const mat = new THREE.LineBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 1.0,
            blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const geo = new THREE.BufferGeometry().setFromPoints(BOLT_POINTS); // 9-pt buffer
        const line = new THREE.Line(geo, mat);
        line.renderOrder = renderOrder;
        line.frustumCulled = false;
        worldGroup.add(line);
        return line;
    };
    return { outerLine: mkLine(10), innerLine: mkLine(11) };
}

function releaseArcLines(arc) {
    arc.outerLine.visible = false;
    arc.innerLine.visible = false;
    arcPool.push(arc);
}

// Two-layer lightning arc: soft corona outer + white-hot inner core.
// Frame-driven via entities.activeVFX so it respects pause (updateVFX only runs
// while state.isPlaying) and is cancelled on cleanupGame — never an orphan timer.
function createLightningArc(fromPos, toPos, color, duration, upgradeLevel) {
    if (!worldGroup) return;
    const baseJitter = 0.55 * (upgradeLevel >= 2 ? 1.25 : 1.0);
    const hopDelay   = upgradeLevel >= 2 ? 28 : 38;

    const arc = acquireArcLines();
    const { outerLine, innerLine } = arc;
    outerLine.material.color.setHex(color);
    outerLine.material.opacity = 0.60;
    innerLine.material.color.setHex(color);
    innerLine.material.opacity = 1.0;

    const pts = generateBoltPoints(fromPos, toPos, baseJitter);
    writeBoltGeometry(outerLine.geometry, pts);
    writeBoltGeometry(innerLine.geometry, pts);

    let elapsed = 0, lastRejitter = 0;
    entities.activeVFX.push({
        update: (dt) => {
            elapsed += dt * 1000;
            const progress = Math.min(1, elapsed / duration);

            if (elapsed - lastRejitter >= hopDelay) {
                lastRejitter = elapsed;
                const newPts = generateBoltPoints(fromPos, toPos, baseJitter * 0.55);
                writeBoltGeometry(outerLine.geometry, newPts);
                writeBoltGeometry(innerLine.geometry, newPts);
            }

            const fade = 1 - progress * progress;
            outerLine.material.opacity = 0.60 * fade;
            innerLine.material.opacity = fade;

            if (elapsed >= duration) { releaseArcLines(arc); return true; }
            return false;
        },
        dispose: () => releaseArcLines(arc),
    });
}

// Shared orientation constants/scratch for line math (consumed synchronously)
const VEC_FORWARD = new THREE.Vector3(0, 0, 1);
const _lineDir = new THREE.Vector3();

// Solid colored line for rigid chaining without jitter or white core.
// Uses the shared unit-length thick cylinder (visibly thick — WebGL limits
// LineBasicMaterial to 1px) stretched to span via scale.z, like the sniper beam.
function createSolidLine(fromPos, toPos, color, duration) {
    const distance = fromPos.distanceTo(toPos);
    const lineMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.9, depthWrite: false
    });

    const line = new THREE.Mesh(ASSETS.geo.unitChainCyl, lineMat);
    line.position.copy(fromPos).lerp(toPos, 0.5);
    line.quaternion.setFromUnitVectors(VEC_FORWARD, _lineDir.subVectors(toPos, fromPos).normalize());
    line.scale.set(1, 1, distance);
    line.renderOrder = 15;

    worldGroup.add(line);

    spawnTimedVFX({
        duration: duration / 1000, // callers pass ms
        onUpdate: (progress) => {
            lineMat.opacity = 0.9 * (1 - progress);
            // Shrink as it fades — same as the old (1-p, 1, 1-p) on a
            // distance-baked geometry: z carries length × shrink here.
            line.scale.set(1 - progress, 1, (1 - progress) * distance);
        },
        onDone: () => { worldGroup.remove(line); lineMat.dispose(); } // geometry is shared
    });
}

// Flash ring + 6 radiating spark rays at chain impact point.
// All 7 meshes share ONE frame-driven activeVFX entry (was 7 separate 16ms
// setIntervals) — pause-safe and disposed together on cleanupGame.
function createElectricBurst(position, color) {
    if (!position || !worldGroup) return;

    // 1. White-hot flash ring expanding outward (shared pre-rotated geometry;
    //    FrontSide — only the top face is ever visible from the camera)
    const rMat = new THREE.MeshBasicMaterial({
        color: 0xFFFFFF, transparent: true, opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ASSETS.geo.electricRing, rMat);
    ring.position.copy(position);
    ring.position.y += 0.20;
    ring.renderOrder = 8;
    worldGroup.add(ring);

    // 2. 6 radiating spark rays — shared unit geometry rotated into place per
    //    ray (rotation.y maps the +Z unit ray onto (sin a, 0, cos a), exactly
    //    the old per-ray direction), and ONE material for all six since they
    //    fade in lockstep. Was 6 fresh BufferGeometries + 6 materials per burst.
    const sMat = new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 1.0,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const rays = [];
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const ray = new THREE.Line(ASSETS.geo.sparkRay, sMat);
        ray.position.set(
            position.x + Math.sin(angle) * 0.12,
            position.y + 0.22,
            position.z + Math.cos(angle) * 0.12
        );
        ray.rotation.y = angle;
        ray.renderOrder = 9;
        worldGroup.add(ray);
        rays.push(ray);
    }

    spawnTimedVFX({
        duration: 0.2,
        onUpdate: (progress, t) => {
            // Ring: expand to 5x and fade over 150ms
            const rprog = Math.min(1, t / 0.15);
            ring.scale.setScalar(1 + rprog * 4);
            rMat.opacity = Math.max(0, 0.95 * (1 - rprog * rprog));

            // Spark rays: fade over 200ms (one shared material)
            sMat.opacity = Math.max(0, 1 - progress * progress);
        },
        onDone: () => {
            worldGroup.remove(ring);
            rMat.dispose(); // ring geometry is shared
            rays.forEach(r => worldGroup.remove(r));
            sMat.dispose(); // ray geometry is shared
        }
    });
}

// ─── INTERNAL HELPERS ─────────────────────────────────────────────────────────

function _makeMesh(geo, mat, opts = {}) {
    const mesh = new THREE.Mesh(geo, mat);
    if (opts.uniformScale != null) mesh.scale.setScalar(opts.uniformScale);
    else if (opts.scale)           mesh.scale.copy(opts.scale);
    mesh.position.set(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
    if (opts.shadow) mesh.castShadow = true;
    return mesh;
}
