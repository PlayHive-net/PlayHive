// ============================================================================
// CONFIG.JS — constants, tuning tables, shared state & the object-pool class
// Load order: 1st of 7 plain <script> files (everything below depends on it;
// requires the global THREE from the CDN tag in index.html).
// Defines:  safeStorage, TILE_SIZE + grid globals, gridToWorld/worldToGrid,
//           TOWER_TYPES, UPGRADE_TIERS, COLORS, ANIMATION_TIMINGS,
//           WAVE_SPAWNING, ENEMY_PHYSICS, COMBAT_TUNING, ENEMY_TYPES,
//           MAP_CONFIGS, DIFFICULTY_SETTINGS, getEffectiveCost, getWaveHpBase,
//           state, entities, waveData, clock, ObjectPool + pool handles.
// NOTE: GRID_WIDTH/GRID_HEIGHT/MAP_OFFSET_*/GRID_ORIGIN_* are intentionally
//       `let` — the Seamless map mutates them as the board grows
//       (map.js expandSeamlessGrid) and cleanupGame (main.js) resets them.
// ============================================================================

// ─── SAFE STORAGE ─────────────────────────────────────────────────────────────
// localStorage throws in some privacy modes / when site data is blocked. Probe it
// once (the probe must both read AND write — different setups fail differently)
// and fall back to a per-session in-memory store so the game still boots and
// plays; best-wave progress simply won't persist.
const safeStorage = (() => {
    const mem = {};
    let ls = null;
    try {
        ls = window.localStorage;
        const probe = '__aegis_probe__';
        ls.setItem(probe, '1');
        ls.removeItem(probe);
    } catch (e) {
        ls = null;
    }
    return {
        get(key, fallback = null) {
            if (ls) { try { const v = ls.getItem(key); return v === null ? fallback : v; } catch (e) {} }
            return key in mem ? mem[key] : fallback;
        },
        set(key, value) {
            if (ls) { try { ls.setItem(key, String(value)); return; } catch (e) {} }
            mem[key] = String(value);
        }
    };
})();

const TILE_SIZE = 2;
let GRID_WIDTH = 14;
let GRID_HEIGHT = 14;
let GRID_ORIGIN_X = 13;
let GRID_ORIGIN_Z = 13;
let MAP_OFFSET_X = ((GRID_WIDTH) * TILE_SIZE) / 2;
let MAP_OFFSET_Z = ((GRID_HEIGHT) * TILE_SIZE) / 2;

// ─── MAP COORDINATE TRANSFORM ─────────────────────────────────────────────────
// Maps are authored with [0,0] at the "far" corner (top-left on screen).
// gridToWorld() applies a 180° flip so enemies enter from the near/bottom edge.
// New maps need no extra work — just define path coords and the transform handles
// the rest automatically.
function gridToWorld(gx, gz) {
    return { x: (GRID_ORIGIN_X - gx) * TILE_SIZE, z: (GRID_ORIGIN_Z - gz) * TILE_SIZE };
}
function worldToGrid(wx, wz) {
    return { x: Math.round(GRID_ORIGIN_X - wx / TILE_SIZE), z: Math.round(GRID_ORIGIN_Z - wz / TILE_SIZE) };
}

// Towers listed cheapest → most expensive (base/Normal price)
const TOWER_TYPES = {
    pulse:   { id: 'pulse',   name: 'Pulse',   costOffset: 1.0, baseCost: 100, range: 3.0, dmg: 10, fireRate: 0.3,  color: 0x7ed321, turnSpeed: 5.0,
               tooltip: 'Rapid-fire energy blasts. Great all-rounder.' },
    venom:   { id: 'venom',   name: 'Venom',   costOffset: 8.1, baseCost: 150, range: 2.5, dmg: 2,  fireRate: 0.8,  color: 0x6bcb77, poisonDmg: 4, poisonTime: 4.0, poisonTick: 0.5, turnSpeed: 3.0,
               tooltip: 'Applies poison: 4 dmg/tick for 4 seconds.' },
    freeze:  { id: 'freeze',  name: 'Freeze',  costOffset: 4.0, baseCost: 200, range: 2.5, dmg: 5,  fireRate: 1.0,  color: 0x74b9ff, slowMult: 0.5, slowTime: 2.0, turnSpeed: 3.5,
               tooltip: 'Slows enemies by 50% for 2 seconds.' },
    dango:   { id: 'dango',   name: 'Dango',   costOffset: 2.8, baseCost: 275, range: 3.0, dmg: 12, fireRate: 1.0,  color: 0x9333EA, chainCount: 2, chainRange: 2.5, turnSpeed: 4.5,
               tooltip: 'Chains to 2 nearby enemies at 75% damage.' },
    missile: { id: 'missile', name: 'Missile', costOffset: 1.0, baseCost: 400, range: 4.5, dmg: 40, fireRate: 2.0,  color: 0xff7b00, splashRadius: 1, turnSpeed: 2.5,
               tooltip: 'AoE splash — hits multiple enemies at once.' },
    beam:    { id: 'beam',    name: 'Beam',    costOffset: 1.5, baseCost: 325, range: 2.0, dmg: 3,  fireRate: 0.02, color: 0x00d4ff, turnSpeed: 8.0,
               tooltip: 'Continuous laser. Melts high-HP targets.' },
    sniper:  { id: 'sniper',  name: 'Sniper',  costOffset: 0.5, baseCost: 500, range: 6.0, dmg: 80, fireRate: 3.5,  color: 0xffcd3c, turnSpeed: 2.0,
               tooltip: 'Extreme range & damage. Obliterates single targets.' },
    yuzu:    { id: 'yuzu',    name: 'Yuzu',    costOffset: 4.5, baseCost: 620, range: 3.5, dmg: 18, fireRate: 3.5,  color: 0xFFD166, poisonDmg: 6, poisonTime: 3.0, poisonTick: 0.5, turnSpeed: 3.0,
               tooltip: 'Citrus burst — instantly poisons every enemy in range.' },
    kaminari:{ id: 'kaminari',name: 'Kaminari',costOffset: 2.0, baseCost: 800, range: 3.5, dmg: 50, fireRate: 0.9,  color: 0x8B5CF6, chainCount: 8, chainRange: 4.0, turnSpeed: 5.5,
               tooltip: 'Thunder arc — chains between every enemy in range.' },
};

// Dynamically calculate baseCost for all towers based on stats
Object.values(TOWER_TYPES).forEach(t => {
    t.baseCost = Math.round((t.dmg * (1 / t.fireRate) + t.dmg * t.range) * (t.costOffset || 1.0));
});

// Upgrade tiers: applied on top of the tower's live dmg/range
const UPGRADE_TIERS = [
    { costMult: 0.5, dmgMult: 1.25, rangeMult: 1.10, label: '★' },
    { costMult: 1.0, dmgMult: 1.50, rangeMult: 1.15, label: '★★', specialEffect: true }
];

const COLORS = {
    grass1: 0x71c837, grass2: 0x61b52a,
    path: 0xdfa570,
    coreGlow: 0x00d4ff,
    hoverValid: 0x7ed321, hoverInvalid: 0xff4757,
    enemyBase: 0xff4757, enemyFreeze: 0x74b9ff
};

const ANIMATION_TIMINGS = {
    modalClose: 240,
    modalReopen: 260,
    modalReopenDelay: 280,
    mapUnlockDelay: 2400,
    tutorialStepExit: 200,
    tutorialStepEnter: 350,
    tutorialPulseDelay: 700,
    statBumpDuration: 320,
};

const WAVE_SPAWNING = {
    baseEnemyCount: 5,
    enemyCountScale: 1.5,
    initialSpawnInterval: 1.8,
    minSpawnInterval: 0.3,
    spawnIntervalDecayPerWave: 0.08,
};

const ENEMY_PHYSICS = {
    launchSpeed: 7.0,
    projectileSpeeds: {
        pulse: 15,
        freeze: 10,
        missile: 8,
        dango: 12,
        venom: 8,
        kaminari: 20,
    },
    shockwaveSpeed: 18,
};

// ==========================================
// ENEMY TYPES (Kawaii Bento Critters)
// ==========================================
const ENEMY_TYPES = {
    mochi:      { type: 'mochi',      scaleStr: 1.00, speedMult: 1.00, hpMult: 1.00, weight: 3, introduceWave: 1  },
    takoyaki:   { type: 'takoyaki',   scaleStr: 0.72, speedMult: 1.90, hpMult: 0.40, weight: 2, introduceWave: 3  },
    onigiri:    { type: 'onigiri',    scaleStr: 1.15, speedMult: 0.85, hpMult: 1.55, weight: 2, introduceWave: 5  },
    gyoza:      { type: 'gyoza',      scaleStr: 1.30, speedMult: 0.48, hpMult: 2.80, weight: 1, introduceWave: 7  },
    tamagoyaki: { type: 'tamagoyaki', scaleStr: 0.88, speedMult: 1.45, hpMult: 0.82, weight: 2, introduceWave: 9  },
    kurage:     { type: 'kurage',     scaleStr: 1.40, speedMult: 1.00, hpMult: 0.65, weight: 1, introduceWave: 11 },
    warabi:     { type: 'warabi',     scaleStr: 1.42, speedMult: 0.55, hpMult: 3.80, weight: 1, introduceWave: 13 },
    nerikiri:   { type: 'nerikiri',   scaleStr: 1.18, speedMult: 0.78, hpMult: 2.30, weight: 1, introduceWave: 15 },
    kuronyudo:  { type: 'kuronyudo',  scaleStr: 2.00, speedMult: 0.28, hpMult: 6.00, weight: 1, introduceWave: 17,
                  splits: { count: 2, type: 'ohagi' } },
    tarabagani: { type: 'tarabagani', scaleStr: 1.90, speedMult: 0.38, hpMult: 5.60, weight: 1, introduceWave: 21,
                  splits: { count: 2, type: 'gyoza' } },
    daigamo:    { type: 'daigamo',    scaleStr: 2.60, speedMult: 0.20, hpMult: 11.00, weight: 1, introduceWave: 24,
                  splits: { count: 5, type: 'ohagi' } },
    oodako:     { type: 'oodako',     scaleStr: 2.40, speedMult: 0.25, hpMult: 12.00, weight: 1, introduceWave: 26,
                  splits: { count: 6, type: 'takoyaki' } },
    gashadokuro:{ type: 'gashadokuro',scaleStr: 1.80, speedMult: 0.30, hpMult: 13.00, weight: 1, introduceWave: 30,
                  splits: { count: 5, type: 'onigiri' } },
    bakedanuki: { type: 'bakedanuki', scaleStr: 1.70, speedMult: 0.45, hpMult: 9.00,  weight: 1, introduceWave: 33,
                  splitsMulti: [{ count: 3, type: 'warabi' }, { count: 2, type: 'nerikiri' }] },
    raiju:      { type: 'raiju',      scaleStr: 1.60, speedMult: 0.75, hpMult: 8.00,  weight: 1, introduceWave: 35,
                  splits: { count: 4, type: 'kurage' } },
    yamata:     { type: 'yamata',     scaleStr: 2.20, speedMult: 0.22, hpMult: 14.00, weight: 1, introduceWave: 38,
                  splits: { count: 4, type: 'tamagoyaki' } },
    ohagi:      { type: 'ohagi',      scaleStr: 1.60, speedMult: 0.32, hpMult: 4.50, weight: 1, introduceWave: 6,
                  splits: { count: 3, type: 'mochi' } },
    oni:        { type: 'oni',        scaleStr: 1.30, speedMult: 0.40, hpMult: 5.20, weight: 0, introduceWave: 5,
                  splits: { count: 2, type: 'mochi' } },
};

// ==========================================
// MAP CONFIGURATIONS
// ==========================================
const MAP_CONFIGS = [
    {
        id: 0, name: 'Bamboo Pass', desc: 'Classic straight-forward layout',
        path: [
            [0,1],[1,1],[2,1],[2,2],[2,3],[2,4],[3,4],[4,4],[5,4],[6,4],
            [6,5],[6,6],[6,7],[7,7],[8,7],[9,7],[10,7],[10,8],[10,9],[10,10],
            [9,10],[8,10],[7,10],[7,11],[7,12]
        ]
    },
    {
        id: 1, name: 'Serpent Valley', desc: 'S-curve path — hard to cover all segments',
        path: [
            [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],
            [8,3],[8,4],[8,5],[8,6],[8,7],
            [7,7],[6,7],[5,7],[4,7],[3,7],[2,7],
            [2,8],[2,9],[2,10],[2,11],
            [3,11],[4,11],[5,11],[6,11],[7,11],[8,11],[9,11],[10,11],[11,11],[12,11],[13,11]
        ]
    },
    {
        id: 2, name: 'Twin Forks', desc: 'Two routes converging at the Core',
        gridSize: 15,
        paths: [
            // Fork A — top entry: enters top-left, zigzags through upper half, ends at core
            [
                [0,0],[1,0],[2,0],[3,0],[4,0],[5,0],
                [5,1],[5,2],[5,3],[5,4],
                [6,4],[7,4],[8,4],[9,4],
                [9,3],[9,2],[9,1],[9,0],
                [10,0],[11,0],[12,0],[13,0],[14,0],
                [14,1],[14,2],[14,3],[14,4],[14,5],[14,6],[14,7]
            ],
            // Fork B — bottom entry: mirror of A through lower half, ends at core
            [
                [0,14],[1,14],[2,14],[3,14],[4,14],[5,14],
                [5,13],[5,12],[5,11],[5,10],
                [6,10],[7,10],[8,10],[9,10],
                [9,11],[9,12],[9,13],[9,14],
                [10,14],[11,14],[12,14],[13,14],[14,14],
                [14,13],[14,12],[14,11],[14,10],[14,9],[14,8],[14,7]
            ]
        ],
        // Union of both forks (unique cells) for grid rendering; ends at core
        path: [
            [0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[5,1],[5,2],[5,3],[5,4],[6,4],[7,4],[8,4],[9,4],[9,3],[9,2],[9,1],[9,0],[10,0],[11,0],[12,0],[13,0],[14,0],[14,1],[14,2],[14,3],[14,4],[14,5],[14,6],
            [0,14],[1,14],[2,14],[3,14],[4,14],[5,14],[5,13],[5,12],[5,11],[5,10],[6,10],[7,10],[8,10],[9,10],[9,11],[9,12],[9,13],[9,14],[10,14],[11,14],[12,14],[13,14],[14,14],[14,13],[14,12],[14,11],[14,10],[14,9],[14,8],
            [14,7]
        ]
    },
    {
        id: 3, name: 'Seamless', desc: 'The map grows forever', isSeamless: true, gridSize: 7,
        path: [[0,7],[1,7],[2,7],[3,7],[4,7],[5,7],[6,7],[7,7]]
    }
];

// ==========================================
// DIFFICULTY SETTINGS
// ==========================================
const DIFFICULTY_SETTINGS = {
    easy:   { label: 'Easy',   hpMult: 0.75, startCredits: 350, costMult: 1.50,
              killCredits: (wave) => Math.floor(7 + Math.min(wave, 5) * 1.4) },
    normal: { label: 'Normal', hpMult: 1.00, startCredits: 250, costMult: 1.80,
              killCredits: (wave) => Math.floor(7 + Math.min(wave, 5) * 1.4) },
    hard:   { label: 'Hard',   hpMult: 1.25, startCredits: 200, costMult: 2.50,
              killCredits: (wave) => Math.floor(7 + Math.min(wave, 5) * 1.4) },
};

// Helper: returns the difficulty-adjusted cost for a tower
function getEffectiveCost(baseCost) {
    const diff = DIFFICULTY_SETTINGS[state.difficulty] || DIFFICULTY_SETTINGS.normal;
    return Math.ceil((baseCost * diff.costMult) / 5) * 5; // round to nearest 5g
}

// Base enemy HP for a wave (before per-type hpMult). Single source of truth —
// used by startWave() and by split-on-death child spawns in entities.js.
function getWaveHpBase(wave, diff) {
    return (20 + (wave * 15) + Math.pow(wave, 1.5)) * diff.hpMult;
}

// Combat tuning shared across towers and systems
const COMBAT_TUNING = {
    chainDmgMult: 0.75,             // chain hops deal 75% of base dmg (dango & kaminari)
    kaminariHopDelayMs: 55,         // kaminari cascade stagger between hops
    kaminariHopDelayUpgradedMs: 38, // faster stagger at upgrade tier 2
    trailInterval: 0.045,           // seconds between projectile trail dots
    trailLife: 0.25,                // seconds a trail dot lives
};

// ==========================================
// STATE & GLOBALS
// ==========================================
let state = {
    credits: 250, health: 100, wave: 0,
    isPlaying: false, selectedTower: null,
    hoverPos: { x: -1, z: -1 },
    hoverValid: false,
    difficulty: 'normal',
    currentMap: 0,
    enemiesKilled: 0,
    seamlessPath: null,
    seamlessGridSize: 7,
    seamlessGridWidth: 7,
    seamlessGridHeight: 7,
};

let screenShake = { intensity: 0, duration: 0, timer: 0 };
let lowHealthPulseTimer = 0;
let lowHealthPulseState = false;

let scene, camera, renderer, worldGroup, hoverMesh, coreMesh;
let grid = [];
let pathNodes = [];
let allPathNodes = []; // one entry per fork; length > 1 on multi-path maps

let entities = {
    towers: [],
    activeEnemies: [],
    activeProjectiles: [],
    activeParticles: [],
    activeTrails: [],
    activeCreditFloats: [],
    activeVFX: []
};

let waveData = {
    timer: 0, enemiesToSpawn: 0,
    spawnInterval: 0, spawnTimer: 0,
    enemyIdCounter: 0,
    waveClearedHandled: false,
    unlockModalOpen: false
};

const clock = new THREE.Clock();

// ==========================================
// OBJECT POOLING SYSTEM
// ==========================================
class ObjectPool {
    constructor(createFn, initialSize) {
        this.createFn = createFn;
        this.pool = [];
        for(let i=0; i<initialSize; i++) {
            const obj = this.createFn();
            const target = obj.mesh || obj.group;
            target.visible = false;
            this.pool.push(obj);
        }
    }
    // Optional preferFn: scan for a preferred pooled object (newest-released
    // first) before falling back to pop/create. Lets the enemy pool hand back
    // an object that still wears the right model so the rebuild can be skipped.
    get(preferFn) {
        let obj = null;
        if (preferFn) {
            for (let i = this.pool.length - 1; i >= 0; i--) {
                if (preferFn(this.pool[i])) {
                    obj = this.pool[i];
                    this.pool[i] = this.pool[this.pool.length - 1]; // swap-remove
                    this.pool.pop();
                    break;
                }
            }
        }
        if (!obj) obj = this.pool.length > 0 ? this.pool.pop() : this.createFn();
        const target = obj.mesh || obj.group;
        target.visible = true;
        obj.active = true;
        return obj;
    }
    release(obj) {
        obj.active = false;
        const target = obj.mesh || obj.group;
        target.visible = false;
        this.pool.push(obj);
    }
}

let enemyPool, projectilePool, particlePool, trailPool;
let floorPlane;
