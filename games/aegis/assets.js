// ============================================================================
// ASSETS.JS — shared geometries & materials, created once and never disposed.
// Load order: 2nd — needs config.js (TILE_SIZE, COLORS, TOWER_TYPES).
// Defines: ASSETS (geo/mat), TOWER_MATS (one accent material per tower type).
// ============================================================================
// Rotate a geometry to lie flat on the ground (face up toward the camera)
function flatGeo(g) {
    g.rotateX(-Math.PI / 2);
    return g;
}

const ASSETS = {
    geo: {
        box: new THREE.BoxGeometry(1, 1, 1),
        tile: new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE * 0.5, TILE_SIZE),
        octahedron: new THREE.OctahedronGeometry(1),
        // Shared by every pooled trail dot — never disposed
        trailDot: new THREE.SphereGeometry(0.08, 4, 4),
        // Unit-length beam for sniper shots — scaled to span per shot, never disposed
        unitBeam: (() => {
            const g = new THREE.CylinderGeometry(0.05, 0.05, 1, 6);
            g.rotateX(Math.PI / 2);
            return g;
        })(),
        // Ground-effect quads, pre-rotated flat. Shared by every effect instance
        // (meshes scale them per use) — never disposed. Building + GPU-uploading
        // these per shot/per kill was a constant churn source.
        yuzuDisc:      flatGeo(new THREE.CircleGeometry(1, 52)),          // unit radius — scaled per cast
        yuzuRing:      flatGeo(new THREE.RingGeometry(0.91, 1.0, 52)),
        shockwaveRing: flatGeo(new THREE.RingGeometry(0.1, 0.4, 24)),
        splashRing:    flatGeo(new THREE.RingGeometry(0.94, 1.0, 40)),
        electricRing:  flatGeo(new THREE.RingGeometry(0.05, 0.22, 16)),   // kaminari chain-impact flash
        // Unit spark ray along +Z — positioned/rotated per ray (length is fixed)
        sparkRay: new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0.85)
        ]),
        // Unit-length thick chain line for dango hops — scaled to span per hop
        unitChainCyl: (() => {
            const g = new THREE.CylinderGeometry(0.12, 0.12, 1, 6);
            g.rotateX(Math.PI / 2);
            return g;
        })()
    },
    mat: {
        grass1: new THREE.MeshLambertMaterial({ color: COLORS.grass1 }),
        grass2: new THREE.MeshLambertMaterial({ color: COLORS.grass2 }),
        path: new THREE.MeshLambertMaterial({ color: COLORS.path }),
        enemy: new THREE.MeshLambertMaterial({ color: COLORS.enemyBase }),
        enemyEye: new THREE.MeshBasicMaterial({ color: 0xffffff }),
        enemyPupil: new THREE.MeshBasicMaterial({ color: 0x000000 }),
        towerBase: new THREE.MeshLambertMaterial({ color: 0x555555 }),
        towerGun: new THREE.MeshLambertMaterial({ color: 0x222222 }),
        projectile: new THREE.MeshBasicMaterial({ color: 0xffffff }),
        laser: new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 3 })
    }
};

const TOWER_MATS = {};
Object.values(TOWER_TYPES).forEach(t => {
    TOWER_MATS[t.id] = new THREE.MeshLambertMaterial({ color: t.color });
});