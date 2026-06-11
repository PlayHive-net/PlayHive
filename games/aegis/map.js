// ============================================================================
// MAP.JS — grid/path generation, instanced terrain, core visuals, and the
//          ever-growing Seamless map (grid expansion + cinematics).
// Load order: 4th — needs config.js, assets.js, models.js.
// Defines:  generateMapInstanced, rebuildMap, seamless-map expansion & core
//           movement, camera fitting (adjustCameraForGridSize).
// Consumes: grid/pathNodes/allPathNodes + GRID_* globals (mutates GRID_* for
//           Seamless growth), worldGroup/scene/camera (created in main.js —
//           only used after init() runs).
// ============================================================================
function generateMapInstanced() {
    const mapCfg = MAP_CONFIGS[state.currentMap] || MAP_CONFIGS[0];
    
    if (mapCfg.isSeamless) {
        const baseSize = mapCfg.gridSize || 7;
        if (!state.seamlessGridWidth || !state.seamlessGridHeight) {
            state.seamlessGridWidth = baseSize;
            state.seamlessGridHeight = baseSize;
        }
        GRID_WIDTH = state.seamlessGridWidth;
        GRID_HEIGHT = state.seamlessGridHeight;
        MAP_OFFSET_X = (GRID_WIDTH * TILE_SIZE) / 2;
        MAP_OFFSET_Z = (GRID_HEIGHT * TILE_SIZE) / 2;
    } else if (mapCfg.gridSize) {
        GRID_WIDTH = mapCfg.gridSize;
        GRID_HEIGHT = mapCfg.gridSize;
        MAP_OFFSET_X = (GRID_WIDTH * TILE_SIZE) / 2;
        MAP_OFFSET_Z = (GRID_HEIGHT * TILE_SIZE) / 2;
    } else {
        GRID_WIDTH = 14;
        GRID_HEIGHT = 14;
        MAP_OFFSET_X = (GRID_WIDTH * TILE_SIZE) / 2;
        MAP_OFFSET_Z = (GRID_HEIGHT * TILE_SIZE) / 2;
    }

    worldGroup.position.set(-MAP_OFFSET_X + TILE_SIZE / 2, 0, -MAP_OFFSET_Z + TILE_SIZE / 2);
    if (typeof adjustCameraForGridSize === "function") adjustCameraForGridSize();

    // Clear old path nodes and grid
    pathNodes = [];
    allPathNodes = [];
    for(let x=0; x<GRID_WIDTH; x++) {
        grid[x] = [];
        for(let z=0; z<GRID_HEIGHT; z++) grid[x][z] = 0;
    }
    let PATH_COORDS, coreCoord, forkPaths = null;

    if (mapCfg.isSeamless) {
        // Seamless map: generate a fresh random path if one doesn't exist yet
        if (!state.seamlessPath) {
            state.seamlessPath = generateRandomPath(GRID_WIDTH); // or GRID_HEIGHT
        }
        PATH_COORDS = state.seamlessPath;
        PATH_COORDS.forEach(([x, z]) => { grid[x][z] = 1; });
        coreCoord = PATH_COORDS[PATH_COORDS.length - 1];
        grid[coreCoord[0]][coreCoord[1]] = 2;
        PATH_COORDS.forEach(([x, z]) => {
            const gw = gridToWorld(x, z);
            pathNodes.push(new THREE.Vector3(gw.x, 0, gw.z));
        });
        allPathNodes = [pathNodes];

        if (state.spawnerPrependedNodes && typeof entities !== 'undefined') {
            entities.activeEnemies.forEach(e => {
                e.nodeIdx += state.spawnerPrependedNodes;
                e.pathArr = allPathNodes[0];
            });
            state.spawnerPrependedNodes = 0;
        }
    } else {
        PATH_COORDS = mapCfg.path;
        PATH_COORDS.forEach(([x, z]) => { grid[x][z] = 1; });

        if (mapCfg.paths) {
            // Multi-fork: build a separate node array per fork for enemy navigation
            forkPaths = mapCfg.paths;
            forkPaths.forEach(forkCoords => {
                allPathNodes.push(forkCoords.map(([x, z]) => {
                    const gw = gridToWorld(x, z);
                    return new THREE.Vector3(gw.x, 0, gw.z);
                }));
            });
            pathNodes = allPathNodes[0]; // backwards-compat alias
            coreCoord = forkPaths[0][forkPaths[0].length - 1];
        } else {
            PATH_COORDS.forEach(([x, z]) => {
                const gw = gridToWorld(x, z);
                pathNodes.push(new THREE.Vector3(gw.x, 0, gw.z));
            });
            allPathNodes = [pathNodes];
            coreCoord = PATH_COORDS[PATH_COORDS.length - 1];
        }
        grid[coreCoord[0]][coreCoord[1]] = 2;
    }

    // Re-mark any placed towers so the grid stays consistent during mid-game rebuilds
    if (typeof entities !== 'undefined') {
        entities.towers.forEach(t => { grid[t.gx][t.gz] = 3; });
    }

    // ── Shared tile rendering ──────────────────────────────────────────────────
    let g1Count = 0, g2Count = 0, pathCount = 0;
    for(let x=0; x<GRID_WIDTH; x++) {
        for(let z=0; z<GRID_HEIGHT; z++) {
            if(grid[x][z] === 1 || grid[x][z] === 2) pathCount++;
            else if((x+z)%2===0) g1Count++;
            else g2Count++;
        }
    }

    const instGrass1 = new THREE.InstancedMesh(ASSETS.geo.tile, ASSETS.mat.grass1, g1Count);
    const instGrass2 = new THREE.InstancedMesh(ASSETS.geo.tile, ASSETS.mat.grass2, g2Count);
    const instPath   = new THREE.InstancedMesh(ASSETS.geo.tile, ASSETS.mat.path,   pathCount);

    instGrass1.receiveShadow = true;
    instGrass2.receiveShadow = true;
    instPath.receiveShadow   = true;

    let iG1 = 0, iG2 = 0, iP = 0;
    const dummy = new THREE.Object3D();

    for(let x=0; x<GRID_WIDTH; x++) {
        for(let z=0; z<GRID_HEIGHT; z++) {
            let yOffset = -TILE_SIZE * 0.25;
            let isPath = (grid[x][z] === 1 || grid[x][z] === 2);
            if (isPath) yOffset += 0.1;

            const gw = gridToWorld(x, z);
            dummy.position.set(gw.x, yOffset, gw.z);
            dummy.updateMatrix();

            if (isPath) {
                instPath.setMatrixAt(iP++, dummy.matrix);
            } else {
                if ((x+z)%2===0) instGrass1.setMatrixAt(iG1++, dummy.matrix);
                else              instGrass2.setMatrixAt(iG2++, dummy.matrix);
            }
        }
    }

    instGrass1.userData.terrain = true;
    instGrass2.userData.terrain = true;
    instPath.userData.terrain   = true;

    worldGroup.add(instGrass1);
    worldGroup.add(instGrass2);
    worldGroup.add(instPath);

    buildCoreVisuals(coreCoord[0], coreCoord[1]);

    if (forkPaths) {
        forkPaths.forEach(forkCoords => buildPathArrows(forkCoords));
    } else {
        buildPathArrows(PATH_COORDS);
    }
}

function buildPathArrows(path) {
    const arrowMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.35,
        depthWrite: false
    });
    const arrowGeo = new THREE.BufferGeometry();
    const s = TILE_SIZE * 0.28;
    const verts = new Float32Array([
        0,    0,  s,      // tip
       -s*0.5, 0, -s*0.5, // left base
        s*0.5, 0, -s*0.5  // right base
    ]);
    arrowGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    arrowGeo.computeVertexNormals();

    for(let i = 0; i < path.length - 1; i++) {
        const [x0, z0] = path[i];
        const [x1, z1] = path[i + 1];
        const dx = x1 - x0, dz = z1 - z0;
        // Negate dx/dz: the 180° flip reverses both world axes relative to grid axes
        const angle = Math.atan2(-dx, -dz);

        const arrow = new THREE.Mesh(arrowGeo, arrowMat);
        const gw0 = gridToWorld(x0, z0);
        arrow.position.set(gw0.x, 0.12, gw0.z);
        arrow.rotation.y = angle;
        arrow.renderOrder = 2;
        arrow.userData.terrain = true;
        arrow.userData.arrowMat = arrowMat;
        worldGroup.add(arrow);
    }
}

function buildCoreVisuals(gx, gz, isAnimated = false, growDir = null) {
    const coreGroup = new THREE.Group();
    const cgw = gridToWorld(gx, gz);
    const finalY = TILE_SIZE * 0.5;

    let isNew = false;
    let wave = 0;

    // Check if the core spawned on a newly expanded strip to inherit delay timings
    if (isAnimated && growDir) {
        if ((growDir[0] < 0 && gx === 0) || 
            (growDir[0] > 0 && gx === GRID_WIDTH - 1) || 
            (growDir[1] < 0 && gz === 0) || 
            (growDir[1] > 0 && gz === GRID_HEIGHT - 1)) {
            isNew = true;
            const cornX = growDir[0] < 0 ? 0 : GRID_WIDTH - 1;
            const cornZ = growDir[1] < 0 ? 0 : GRID_HEIGHT - 1;
            wave = Math.abs(gx - cornX) + Math.abs(gz - cornZ);
        }
    }

    coreGroup.position.set(cgw.x, isNew ? finalY - 10 : finalY, cgw.z);

    const baseMesh = new THREE.Mesh(ASSETS.geo.box, ASSETS.mat.towerBase);
    baseMesh.scale.set(TILE_SIZE*0.9, TILE_SIZE*0.5, TILE_SIZE*0.9);
    baseMesh.position.y = -0.25;
    baseMesh.castShadow = true;
    coreGroup.add(baseMesh);

    coreMesh = new THREE.Mesh(
        ASSETS.geo.box,
        new THREE.MeshLambertMaterial({
            color: COLORS.coreGlow,
            emissive: COLORS.coreGlow,
            emissiveIntensity: 0.5
        })
    );
    coreMesh.scale.set(TILE_SIZE*0.6, TILE_SIZE*0.8, TILE_SIZE*0.6);
    coreMesh.position.y = 0.5;
    coreGroup.add(coreMesh);

    coreGroup.userData.terrain = true;
    coreGroup.userData.isCore = true;
    worldGroup.add(coreGroup);

    // Sync rising elevation bounce with the terrain tiles
    if (isNew) {
        coreGroup.scale.setScalar(0.05);

        const WAVE_DELAY = 55;
        const TILE_DUR = 480;
        const startTime = performance.now();

        function easeOutBack(t) {
            const c1 = 1.4, c3 = c1 + 1;
            return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
        }

        function animFrame(now) {
            const elapsed = now - startTime - wave * WAVE_DELAY;
            if (elapsed < 0) {
                requestAnimationFrame(animFrame);
                return;
            }
            if (elapsed >= TILE_DUR) {
                coreGroup.position.y = finalY;
                coreGroup.scale.setScalar(1);
                return;
            }
            const p = elapsed / TILE_DUR;
            const eased = easeOutBack(p);
            coreGroup.position.y = finalY - 10 * (1 - Math.min(eased, 1));
            coreGroup.scale.setScalar(Math.max(0.05, Math.min(eased, 1.15)));
            
            requestAnimationFrame(animFrame);
        }
        requestAnimationFrame(animFrame);
    }
}

// Rebuild map (used when switching maps or after game cleanup)
function rebuildMap() {
    // Only remove objects tagged as terrain — pool meshes (enemies, projectiles,
    // particles) live in worldGroup too and must not be detached from the scene.
    const toRemove = worldGroup.children.filter(c => c.userData.terrain);
    toRemove.forEach(c => {
        worldGroup.remove(c);
        if (c.userData.arrowMat) c.userData.arrowMat.dispose();
        if (c.geometry && !c.isInstancedMesh) c.geometry.dispose();
        if (c.userData.isCore) {
            c.traverse(child => {
                if (child.isMesh && child.material) child.material.dispose();
            });
        }
    });
    generateMapInstanced();
}

// ==========================================
// SEAMLESS MAP — RANDOM PATH GENERATION
// ==========================================

function generateRandomPath(size) {
    // Fixed entrance: [0,0]→[1,0] is prepended to every path so the spawner always
    // connects cleanly. These 2 cells are "ghosts" — in visited so we don't revisit them,
    // but transparent to the 8-way buffer so the walk can turn freely from [1,1] onward.
    const ENTRANCE = [[0, 0], [1, 0]];
    const ghostSet  = new Set(['0,0', '1,0']);
    const totalTarget = Math.floor(size * size * 0.45);
    const ALL_DIRS = [[-1,0],[1,0],[0,-1],[0,1]];

    function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function canMove(nx, nz, visited, cx, cz, gpx, gpz) {
        if (nx < 0 || nx >= size || nz < 0 || nz >= size) return false;
        if (visited.has(`${nx},${nz}`)) return false;
        if (nx === 0 || nz === 0) return false;
        for (let adx = -1; adx <= 1; adx++) {
            for (let adz = -1; adz <= 1; adz++) {
                if (adx === 0 && adz === 0) continue;
                const ax = nx + adx, az = nz + adz;
                if (ax === cx && az === cz) continue; // skip parent
                if (gpx !== undefined && ax === gpx && az === gpz) continue; // skip grandparent (allows 90° turns)
                if (ghostSet.has(`${ax},${az}`)) continue;
                if (visited.has(`${ax},${az}`)) return false;
            }
        }
        return true;
    }

    for (let attempt = 0; attempt < 20; attempt++) {
        // Generated walk starts at [1,1] — just inside the entrance, free to turn in any direction
        const path    = [[1, 1]];
        const visited = new Set([...ghostSet, '1,1']);
        const dirStack = [shuffle(ALL_DIRS)];

        let backtracks = 0;
        const MAX_BACKTRACKS = 8000;

        while (path.length >= 1 && backtracks < MAX_BACKTRACKS) {
            const [cx, cz] = path[path.length - 1];
            const gp = path.length >= 2 ? path[path.length - 2] : null;
            const gpx = gp ? gp[0] : undefined, gpz = gp ? gp[1] : undefined;
            const onEdge   = cx === size - 1 || cz === size - 1;
            const totalLen = path.length + ENTRANCE.length;

            if (totalLen >= totalTarget && onEdge) return [...ENTRANCE, ...path];

            const dirs = dirStack[dirStack.length - 1];
            let moved = false;

            while (dirs.length > 0) {
                const [dx, dz] = dirs.pop();
                const nx = cx + dx, nz = cz + dz;

                // Don't reach the far edge until the path is long enough
                if (totalLen < totalTarget && (nx === size - 1 || nz === size - 1)) continue;

                if (canMove(nx, nz, visited, cx, cz, gpx, gpz)) {
                    // Prefer turning: put "keep going straight" last in the try-list
                    const nextDirs    = shuffle(ALL_DIRS);
                    const straightIdx = nextDirs.findIndex(d => d[0] === dx && d[1] === dz);
                    if (straightIdx !== -1) {
                        nextDirs.splice(straightIdx, 1);
                        nextDirs.unshift([dx, dz]); // index 0 = tried last by pop()
                    }
                    path.push([nx, nz]);
                    visited.add(`${nx},${nz}`);
                    dirStack.push(nextDirs);
                    moved = true;
                    break;
                }
            }

            if (!moved) {
                if (path.length <= 1) break; // exhausted all options from [1,1], retry attempt
                const popped = path.pop();
                visited.delete(`${popped[0]},${popped[1]}`);
                dirStack.pop();
                backtracks++;
            }
        }

        // Accept any path that reached the far edge
        if (path.length > 0) {
            const [lx, lz] = path[path.length - 1];
            if (lx === size - 1 || lz === size - 1) return [...ENTRANCE, ...path];
        }
    }

    // Absolute fallback: march along interior row then down far column
    const fbPath = [[1, 1]];
    let cur = [1, 1];
    while (cur[0] < size - 1) { cur = [cur[0] + 1, cur[1]]; fbPath.push([...cur]); }
    while (cur[1] < size - 1) { cur = [cur[0], cur[1] + 1]; fbPath.push([...cur]); }
    return [...ENTRANCE, ...fbPath];
}

// ==========================================
// SEAMLESS MAP — CORE MOVEMENT PER WAVE
// ==========================================

function moveSeamlessCore() {
    const path = state.seamlessPath;
    if (!path || path.length === 0) return;

    const core = path[path.length - 1];
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];

    // Shuffle directions
    for (let i = dirs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }

    const candidate = _findSeamlessMoveCandidate(core, dirs);

    if (candidate) {
        _applySeamlessCoreMove(core, candidate, false);
    } else {
        // No room — expand the grid then retry
        const growDir = _determineGrowthDirection(core);
        expandSeamlessGrid(growDir);

        // Expansion on left/top shifts the path coordinates by +1 on those axes.
        const shiftedCore = state.seamlessPath[state.seamlessPath.length - 1];
        const candidate2 = _findSeamlessMoveCandidate(shiftedCore, dirs);
        if (candidate2) _applySeamlessCoreMove(shiftedCore, candidate2, true, growDir);
    }
}

function _determineGrowthDirection(core) {
    let growX;
    if (core[0] === 0) growX = -1;
    else if (core[0] === GRID_WIDTH - 1) growX = 1;
    else {
        const distLeft = core[0];
        const distRight = (GRID_WIDTH - 1) - core[0];
        growX = distLeft <= distRight ? -1 : 1;
    }

    let growZ;
    if (core[1] === 0) growZ = -1;
    else if (core[1] === GRID_HEIGHT - 1) growZ = 1;
    else {
        const distTop = core[1];
        const distBottom = (GRID_HEIGHT - 1) - core[1];
        growZ = distTop <= distBottom ? -1 : 1;
    }

    return [growX, growZ];
}

function _findSeamlessMoveCandidate(core, dirs) {
    const edgeDirs = [[-1,0],[1,0],[0,-1],[0,1]];
    const recentPathStart = Math.max(0, state.seamlessPath.length - 6);
    const allDirs = [
        [-1,-1], [0,-1], [1,-1],
        [-1, 0],          [1, 0],
        [-1, 1], [0, 1], [1, 1]
    ];

    for (const [dx, dz] of dirs) {
        const cx = core[0] + dx;
        const cz = core[1] + dz;
        if (cx < 0 || cx >= GRID_WIDTH || cz < 0 || cz >= GRID_HEIGHT) continue;
        const isPerimeter = (cx === 0 || cx === GRID_WIDTH - 1 || cz === 0 || cz === GRID_HEIGHT - 1);
        if (!isPerimeter) continue;
        if (grid[cx][cz] !== 0) continue;

        let blockedByPathTouch = false;
        for (const [adx, adz] of allDirs) {
            const ax = cx + adx;
            const az = cz + adz;
            if (ax < 0 || ax >= GRID_WIDTH || az < 0 || az >= GRID_HEIGHT) continue;
            if (ax === core[0] && az === core[1]) continue;

            if (grid[ax][az] === 1 || grid[ax][az] === 2) {
                const pathIdx = state.seamlessPath.findIndex(([px, pz]) => px === ax && pz === az);
                const isRecentPath = pathIdx >= recentPathStart;

                const isEdgeTouch = adx === 0 || adz === 0;
                if (isRecentPath) {
                    if (isEdgeTouch) {
                        blockedByPathTouch = true;
                        break;
                    }
                } else {
                    blockedByPathTouch = true;
                    break;
                }
            }
        }
        if (blockedByPathTouch) continue;

        return [cx, cz];
    }
    return null;
}

function _applySeamlessCoreMove(oldCore, newCore, didExpand, growDir) {
    state.seamlessPath.push([...newCore]);

    if (didExpand) {
        grid[oldCore[0]][oldCore[1]] = 1;
        grid[newCore[0]][newCore[1]] = 2;

        pathNodes = state.seamlessPath.map(([x, z]) => {
            const gw = gridToWorld(x, z);
            return new THREE.Vector3(gw.x, 0, gw.z);
        });
        allPathNodes = [pathNodes];

        // Clear all old terrain.
        const toRemove = worldGroup.children.filter(c => c.userData.terrain);
        toRemove.forEach(c => {
            worldGroup.remove(c);
            if (c.userData.arrowMat) c.userData.arrowMat.dispose();
            if (c.geometry && !c.isInstancedMesh) c.geometry.dispose();
            if (c.userData.isCore) {
                c.traverse(child => {
                    if (child.isMesh && child.material) child.material.dispose();
                });
            }
        });

        // Rebuild interior terrain instantly.
        _buildSeamlessInterior(growDir);

        // Animate the new edge strips.
        addAnimatedBorderTiles(growDir);

        buildCoreVisuals(newCore[0], newCore[1], true, growDir);
    } else {
        rebuildMap();
    }

    if (typeof entities !== 'undefined') {
        const activePath = (allPathNodes && allPathNodes[0]) ? allPathNodes[0] : pathNodes;
        entities.activeEnemies.forEach(e => {
            e.pathArr = activePath;
            if (activePath.length >= 2 && e.nodeIdx > activePath.length - 2) {
                e.nodeIdx = activePath.length - 2;
            }
        });
    }

    playCinematicExpansion(didExpand, newCore);
}

// Builds InstancedMesh terrain for every cell NOT on the two newly-expanded edge strips.
// Called after expandSeamlessGrid() so GRID_WIDTH and grid[] are already updated.
function _buildSeamlessInterior(growDir) {
    function isNew(x, z) {
        if (!growDir) return false;
        if (growDir[0] < 0 && x === 0) return true;
        if (growDir[0] > 0 && x === GRID_WIDTH - 1) return true;
        if (growDir[1] < 0 && z === 0) return true;
        if (growDir[1] > 0 && z === GRID_HEIGHT - 1) return true;
        return false;
    }

    let g1C = 0, g2C = 0, pC = 0;
    for (let x = 0; x < GRID_WIDTH; x++) for (let z = 0; z < GRID_HEIGHT; z++) {
        if (isNew(x, z)) continue;
        if (grid[x][z] === 1 || grid[x][z] === 2) pC++;
        else if ((x + z) % 2 === 0) g1C++;
        else g2C++;
    }

    const iG1 = g1C > 0 ? new THREE.InstancedMesh(ASSETS.geo.tile, ASSETS.mat.grass1, g1C) : null;
    const iG2 = g2C > 0 ? new THREE.InstancedMesh(ASSETS.geo.tile, ASSETS.mat.grass2, g2C) : null;
    const iP  = pC  > 0 ? new THREE.InstancedMesh(ASSETS.geo.tile, ASSETS.mat.path,   pC)  : null;
    [iG1, iG2, iP].forEach(m => { if (m) { m.receiveShadow = true; m.userData.terrain = true; } });

    const dummy = new THREE.Object3D();
    let ig1 = 0, ig2 = 0, ip = 0;
    for (let x = 0; x < GRID_WIDTH; x++) for (let z = 0; z < GRID_HEIGHT; z++) {
        if (isNew(x, z)) continue;
        const isPath = grid[x][z] === 1 || grid[x][z] === 2;
        const yOff = isPath ? -TILE_SIZE * 0.25 + 0.1 : -TILE_SIZE * 0.25;
        const gw = gridToWorld(x, z);
        dummy.position.set(gw.x, yOff, gw.z);
        dummy.updateMatrix();
        if (isPath) { if (iP)  iP.setMatrixAt(ip++,   dummy.matrix); }
        else if ((x + z) % 2 === 0) { if (iG1) iG1.setMatrixAt(ig1++, dummy.matrix); }
        else { if (iG2) iG2.setMatrixAt(ig2++, dummy.matrix); }
    }
    [iG1, iG2, iP].forEach(m => { if (m) { m.instanceMatrix.needsUpdate = true; worldGroup.add(m); } });

    // Rebuild all path arrows now that old ones were cleared with terrain.
    buildPathArrows(state.seamlessPath);
}

function addAnimatedBorderTiles(growDir) {
    if (!growDir) return;
    function isNew(x, z) {
        if (growDir[0] < 0 && x === 0) return true;
        if (growDir[0] > 0 && x === GRID_WIDTH - 1) return true;
        if (growDir[1] < 0 && z === 0) return true;
        if (growDir[1] > 0 && z === GRID_HEIGHT - 1) return true;
        return false;
    }
    const cornX = growDir[0] < 0 ? 0 : GRID_WIDTH - 1;
    const cornZ = growDir[1] < 0 ? 0 : GRID_HEIGHT - 1;

    const borderGroup = new THREE.Group();
    borderGroup.userData.terrain = true;
    worldGroup.add(borderGroup);

    const tiles = [];
    for (let x = 0; x < GRID_WIDTH; x++) {
        for (let z = 0; z < GRID_HEIGHT; z++) {
            if (!isNew(x, z)) continue;

            const isPath = grid[x][z] === 1 || grid[x][z] === 2;
            const mat = isPath ? ASSETS.mat.path : ((x + z) % 2 === 0 ? ASSETS.mat.grass1 : ASSETS.mat.grass2);
            const yOff = isPath ? -TILE_SIZE * 0.25 + 0.1 : -TILE_SIZE * 0.25;
            const gw = gridToWorld(x, z);

            const mesh = new THREE.Mesh(ASSETS.geo.tile, mat);
            mesh.receiveShadow = true;
            mesh.userData.terrain = true;
            mesh.position.set(gw.x, yOff - 10, gw.z);
            mesh.scale.setScalar(0.05);
            borderGroup.add(mesh);
            const wave = Math.abs(x - cornX) + Math.abs(z - cornZ);
            tiles.push({ mesh, yOff, wave });
        }
    }

    const WAVE_DELAY = 55;  // ms between each wave (Manhattan distance ring)
    const TILE_DUR   = 480; // ms for each tile's rise + scale animation
    const startTime  = performance.now();

    function easeOutBack(t) {
        // slight overshoot then settle — more satisfying "pop" than plain ease-out
        const c1 = 1.4, c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    function animFrame(now) {
        let anyActive = false;
        for (const t of tiles) {
            const elapsed = now - startTime - t.wave * WAVE_DELAY;
            if (elapsed < 0) { anyActive = true; continue; }
            if (elapsed >= TILE_DUR) {
                t.mesh.position.y = t.yOff;
                t.mesh.scale.setScalar(1);
                continue;
            }
            const p = elapsed / TILE_DUR;
            const eased = easeOutBack(p);
            t.mesh.position.y = t.yOff - 10 * (1 - Math.min(eased, 1));
            t.mesh.scale.setScalar(Math.max(0.05, Math.min(eased, 1.15)));
            anyActive = true;
        }
        if (anyActive) requestAnimationFrame(animFrame);
    }
    requestAnimationFrame(animFrame);
}

function playCinematicExpansion(didExpand, newCore) {
    // 1. Screen Shake
    if (typeof camera !== 'undefined') {
        const intensity = didExpand ? 0.6 : 0.2;
        const duration = didExpand ? 800 : 400;
        const startY = camera.position.y;
        let start = performance.now();
        function shake(t) {
            const el = t - start;
            if (el > duration) {
                camera.position.y = startY;
                return;
            }
            const factor = 1 - (el / duration);
            camera.position.y = startY + (Math.random() - 0.5) * intensity * factor;
            requestAnimationFrame(shake);
        }
        requestAnimationFrame(shake);
    }

    // 3. Spawning particles at the new core location
    const gw = gridToWorld(newCore[0], newCore[1]);
    
    // Create a temporary "pillar of light"
    const pillarGeo = new THREE.CylinderGeometry(0.5, 0.5, 20, 16);
    const pillarMat = new THREE.MeshBasicMaterial({ 
        color: 0x00ffff, 
        transparent: true, 
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(gw.x, 10, gw.z);
    worldGroup.add(pillar);

    // Create expanding ground ring
    const ringGeo = new THREE.RingGeometry(0.1, 0.5, 32);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(gw.x, 0.2, gw.z);
    worldGroup.add(ring);

    // If grid expanded, highlight the border
    let borderLine;
    if (didExpand) {
        const dX = (GRID_WIDTH * TILE_SIZE) / 2;
        const dZ = (GRID_HEIGHT * TILE_SIZE) / 2;
        const borderGeo = new THREE.BufferGeometry();
        const verts = new Float32Array([
            -dX, 0.2, -dZ,
             dX, 0.2, -dZ,
             dX, 0.2,  dZ,
            -dX, 0.2,  dZ,
            -dX, 0.2, -dZ
        ]);
        borderGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        const borderMat = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            linewidth: 3,
            transparent: true,
            opacity: 1
        });
        borderLine = new THREE.Line(borderGeo, borderMat);
        worldGroup.add(borderLine);
    }

    let start = performance.now();
    function animCore(t) {
        const el = t - start;
        if (el > 1500) {
            worldGroup.remove(pillar);
            worldGroup.remove(ring);
            if (borderLine) worldGroup.remove(borderLine);
            pillarGeo.dispose();
            pillarMat.dispose();
            ringGeo.dispose();
            ringMat.dispose();
            if (borderLine) {
                borderLine.geometry.dispose();
                borderLine.material.dispose();
            }
            return;
        }
        
        // Flash pillar
        pillarMat.opacity = 0.8 * (1 - el / 1500);
        pillar.scale.set(1 + (el/500)*2, 1, 1 + (el/500)*2);
        
        // Expand ring
        ring.scale.setScalar(1 + (el/200)*3);
        ringMat.opacity = Math.max(0, 1 - el / 500);

        // Flash border
        if (borderLine) {
            borderLine.material.opacity = Math.max(0, 1 - el / 1000);
            const bump = 1 + Math.sin(el * 0.02) * 0.05;
            borderLine.scale.set(bump, 1, bump);
        }

        requestAnimationFrame(animCore);
    }
    requestAnimationFrame(animCore);
}

// ==========================================
// SEAMLESS MAP — GRID EXPANSION
// ==========================================

function expandSeamlessGrid(growDir) {
    const expandNegX = growDir[0] < 0;
    const expandNegZ = growDir[1] < 0;
    const oldW = GRID_WIDTH;
    const oldH = GRID_HEIGHT;

    // Keep the seamless map square by expanding one row and one column every time.
    GRID_WIDTH += 1;
    GRID_HEIGHT += 1;

    const newGrid = [];
    for (let x = 0; x < GRID_WIDTH; x++) {
        newGrid[x] = [];
        for (let z = 0; z < GRID_HEIGHT; z++) {
            const oldX = expandNegX ? x - 1 : x;
            const oldZ = expandNegZ ? z - 1 : z;
            const inOld = oldX >= 0 && oldX < oldW && oldZ >= 0 && oldZ < oldH;
            newGrid[x][z] = inOld && grid[oldX] && grid[oldX][oldZ] !== undefined ? grid[oldX][oldZ] : 0;
        }
    }
    grid = newGrid;

    if (state.seamlessPath) {
        state.seamlessPath.forEach(pt => {
            if (expandNegX) pt[0] += 1;
            if (expandNegZ) pt[1] += 1;
        });

        state.seamlessPath.forEach(([x, z], i) => {
            grid[x][z] = (i === state.seamlessPath.length - 1) ? 2 : 1;
        });
    }

    if (typeof entities !== 'undefined') {
        entities.towers.forEach(t => {
            if (expandNegX) t.gx += 1;
            if (expandNegZ) t.gz += 1;

            grid[t.gx][t.gz] = 3;

            const gw = gridToWorld(t.gx, t.gz);
            t.group.position.set(gw.x, 0, gw.z);
            t.pos.set(gw.x, TILE_SIZE * 0.5, gw.z);
        });
    }

    state.seamlessGridWidth = GRID_WIDTH;
    state.seamlessGridHeight = GRID_HEIGHT;
    MAP_OFFSET_X = (GRID_WIDTH * TILE_SIZE) / 2;
    MAP_OFFSET_Z = (GRID_HEIGHT * TILE_SIZE) / 2;
    worldGroup.position.set(-MAP_OFFSET_X + TILE_SIZE / 2, 0, -MAP_OFFSET_Z + TILE_SIZE / 2);

    adjustCameraForGridSize();

    // The new row/column adds buildable cells — un-gray the tower buttons if
    // the board was full before this expansion.
    refreshTowerButtons();
}

function adjustCameraForGridSize() {
    if (!camera) return;
    const aspect = window.innerWidth / window.innerHeight;
    const maxDim = Math.max(GRID_WIDTH, GRID_HEIGHT);
    const d = 16 * (maxDim / 14);
    camera.left   = -d * aspect;
    camera.right  =  d * aspect;
    camera.top    =  d;
    camera.bottom = -d;
    camera.updateProjectionMatrix();

    const scale = maxDim / 14;

    const nearCorner = gridToWorld(0, 0);
    const farCorner = gridToWorld(GRID_WIDTH - 1, GRID_HEIGHT - 1);
    const centerX = worldGroup.position.x + (nearCorner.x + farCorner.x) * 0.5;
    const centerZ = worldGroup.position.z + (nearCorner.z + farCorner.z) * 0.5;

    camera.position.set(20 * scale + centerX, 25 * scale, 20 * scale + centerZ);
    camera.lookAt(centerX, 0, centerZ);
    
    // Store standard pan targets so screen shake in main.js returns to the right panning offset
    camera.userData.targetX = 20 * scale + centerX;
    camera.userData.targetZ = 20 * scale + centerZ;
}
