// ============================================================
//  MODELS.JS  ·  Artisanal Zen Bento Edition 🍱
// ============================================================
//  Plug-and-play visual module.  Drop this file in, done.
//
//  Design Philosophy: "Apple-Minimalism meets Crossy Road"
//   - Matte, tactile materials (silicone, ceramic, wood)
//   - Voxel-based, blocky silhouettes
//   - Zero extraneous detail
//
//  Tower themes:
//    "pulse"   → 🍵 Matcha Berry Mochi (Pink block + matcha leaf)
//    "beam"    → ✨ Konpeito Star (Frosted glass + glowing cube)
//    "freeze"  → 🍧 Kakigori (Ceramic cup + blocky shaved ice)
//    "missile" → 🍙 Onigiri Rocket (Rice triangle + sleek jetpack)
//
//  Enemy themes:
//    Normal → Dust Bunnies (Matte grey cubes + pixel eyes)
//    Boss   → Obsidian Drive (Massive black block + scanner light)
//
//  Load order: 3rd — needs config.js (TILE_SIZE, clock) & assets.js.
//  Defines the global MODELS object (tower/enemy builders + per-frame
//  animators). Consumes allPathNodes (map.js) at runtime for idle gazing.
// ============================================================

const MODELS = (() => {
  'use strict';

  // ──────────────────────────────────────────────────────────
  //  PALETTE (Cozy, Muted, Premium)
  // ──────────────────────────────────────────────────────────
  const P = {
    // Materials
    obsidian   : 0x1C1C1E, // Apple dark mode
    dustGrey   : 0x6E6E73,
    ceramic    : 0x2C2C2E,
    wood       : 0xD4B08C,
    
    // Bento Colours
    mochiPink  : 0xFFD1DC,
    dangoPink  : 0xFF9EB5,
    rocketSlate : 0x1E2433,
    rocketOrange: 0xFF5E00,
    rocketSilver: 0x8E9BA8,
    matcha     : 0x8DA378,
    riceWhite  : 0xF5F5F7,
    nori       : 0x2A2A2A,
    frostBlue  : 0xB5D8F7,
    syrupRed   : 0xE35252,
    taiyakiBrown: 0xC68642,
    taiyakiGold : 0xFFD700,
    venomGreen  : 0x6BCB77,
    slimeDark   : 0x4A8C52,
    mitarashi   : 0x6B3A2A,
    
    // Face & Accents
    eyeDark    : 0x1D1D1F,
    blush      : 0xFFB6C1,
    
    // Glows
    glowYellow : 0xFFE873,
    glowOrange : 0xFF8C42,
    glowRed    : 0xFF3B30,
    glowCyan   : 0x5AC8FA,
    phantomCyan  : 0x00D4FF,
    wraithGold   : 0xC8A84B,
    spaceGray    : 0x555557,
    pearlWhite   : 0xFAFAFA,
    crystalPurple: 0xC084FC,
    voidBlack    : 0x1A0A2E
  };

  // ──────────────────────────────────────────────────────────
  //  GEOMETRY SHORTCUTS (Block-heavy)
  // ──────────────────────────────────────────────────────────
  const G = {
    box    : (w, h, d)       => new THREE.BoxGeometry(w, h, d),
    cyl    : (rt, rb, h, s=8)=> new THREE.CylinderGeometry(rt, rb, h, s),
    // A 3-sided cylinder makes a perfect flat triangle (Onigiri)
    prism  : (r, depth)      => new THREE.CylinderGeometry(r, r, depth, 3),
    sphere : (r, s=8)        => new THREE.SphereGeometry(r, s, s),
  };

  // ──────────────────────────────────────────────────────────
  //  MATERIAL SHORTCUTS
  // ──────────────────────────────────────────────────────────
  // Standard Matte (Silicone/Ceramic feel)
  function std(color, opts={}) {
    return new THREE.MeshStandardMaterial({ 
      color, 
      roughness: 0.85, 
      metalness: 0.05, 
      ...opts 
    });
  }
  // Emissive (Status lights, lasers)
  function glow(color, intensity=1) {
    return new THREE.MeshStandardMaterial({ 
      color, 
      emissive: color, 
      emissiveIntensity: intensity, 
      roughness: 0.5 
    });
  }
  // Frosted Glass (Premium candy feel)
  function glass(color) {
    const mat = new THREE.MeshPhysicalMaterial({
      color,
      opacity: 1,
      transparent: true,
      roughness: 0.25    // frosted
    });

    // Some bundled Three.js builds do not expose newer physical props.
    if ('transmission' in mat) mat.transmission = 0.8;
    if ('ior' in mat) mat.ior = 1.5;
    if ('thickness' in mat) mat.thickness = 0.5;

    return mat;
  }

  // ──────────────────────────────────────────────────────────
  //  MESH HELPER
  // ──────────────────────────────────────────────────────────
  function mk(geo, mat, {
    x=0,y=0,z=0,
    rx=0,ry=0,rz=0,
    sx=1,sy=1,sz=1,
    shadow=true,
  }={}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.scale.set(sx, sy, sz);
    if (shadow) m.castShadow = true;
    return m;
  }

  // ──────────────────────────────────────────────────────────
  //  VOXEL FACE STAMP
  //  Crossy-road style flat eyes and horizontal pill blush
  // ──────────────────────────────────────────────────────────
  function stampFace(group, fx, fy, fz, r, eyeColor = null) {
    const E = r; 
    const eyeMat = std(eyeColor !== null ? eyeColor : P.eyeDark);
    const blMat  = std(P.blush, { transparent:true, opacity:0.6 });

    // Block eyes
    const eyeL = mk(G.box(E*.15, E*.15, E*.05), eyeMat, { x:fx-E*.25, y:fy, z:fz });
    const eyeR = mk(G.box(E*.15, E*.15, E*.05), eyeMat, { x:fx+E*.25, y:fy, z:fz });
    
    // Minimalist wide blush blocks
    const blL = mk(G.box(E*.25, E*.1, E*.05), blMat, { x:fx-E*.35, y:fy-E*.15, z:fz-E*.01 });
    const blR = mk(G.box(E*.25, E*.1, E*.05), blMat, { x:fx+E*.35, y:fy-E*.15, z:fz-E*.01 });

    group.add(eyeL, eyeR, blL, blR);
  }

  // ──────────────────────────────────────────────────────────
  //  ENEMY FACE STAMP — tilted angry eyes + eyebrows (Mochi / Oni)
  // ──────────────────────────────────────────────────────────
  function stampEnemyFace(group, fx, fy, fz, r, rx = -0.3, { eyeScale = 1.0, browScale = 1.0, browAngle = 0.35 } = {}) {
    const E = r;
    const es = eyeScale;
    const eyeMat  = std(P.eyeDark);
    const browMat = std(P.eyeDark);
    const bw = E*.25 * browScale, bh = E*.08 * browScale;
    group.add(
      mk(G.box(E*.18*es, E*.18*es, E*.05), eyeMat,  { x: fx-E*.36, y: fy-E*.08,       z: fz+E*.06,  rx }),
      mk(G.box(E*.18*es, E*.18*es, E*.05), eyeMat,  { x: fx+E*.36, y: fy-E*.08,       z: fz+E*.06,  rx }),
      mk(G.box(bw, bh, E*.08),             browMat, { x: fx-E*.36, y: fy+E*.20*es,    z: fz+E*.02, rx, rz: -browAngle }),
      mk(G.box(bw, bh, E*.08),             browMat, { x: fx+E*.36, y: fy+E*.20*es,    z: fz+E*.02, rx, rz:  browAngle }),
    );
  }

  // ──────────────────────────────────────────────────────────
  //  VOXEL ENEMY FACE — white sclera block + dark pupil block
  // ──────────────────────────────────────────────────────────
  function voxelFace(group, fx, fy, fz, r) {
    const E = r;
    const scleraMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 1.0, metalness: 0 });
    const pupilMat  = std(P.eyeDark);
    group.add(
      mk(G.box(E*.20, E*.20, E*.06), scleraMat, { x: fx-E*.24, y: fy,        z: fz }),
      mk(G.box(E*.20, E*.20, E*.06), scleraMat, { x: fx+E*.24, y: fy,        z: fz }),
      mk(G.box(E*.10, E*.10, E*.07), pupilMat,  { x: fx-E*.22, y: fy-E*.04,  z: fz+E*.015 }),
      mk(G.box(E*.10, E*.10, E*.07), pupilMat,  { x: fx+E*.22, y: fy-E*.04,  z: fz+E*.015 }),
    );
  }

  // ──────────────────────────────────────────────────────────
  //  APPLY ENEMY STYLE — Strict Voxel Edition
  //  All BoxGeometry. Dominant core mass. Minimal arm stubs. No legs.
  // ──────────────────────────────────────────────────────────
  // ============================================================
//  REFACTORED: applyEnemyStyle Factory Pattern
//  This code replaces lines 187–1037 in models.js
// ============================================================

// ──────────────────────────────────────────────────────────
//  SHARED PART BUILDERS (Module Scope)
//  Extracted from the monolithic function for reuse
// ──────────────────────────────────────────────────────────

function addArms(g, mat, bw, bh, by, s) {
  const aw = s*.24, ah = s*.12, ad = s*.12;
  g.add(mk(G.box(aw, ah, ad), mat, { x: -(bw*.5 + aw*.5), y: by + bh*.55 }));
  g.add(mk(G.box(aw, ah, ad), mat, { x:  (bw*.5 + aw*.5), y: by + bh*.55 }));
}

// ──────────────────────────────────────────────────────────
//  ENEMY_BUILDERS FACTORY OBJECT
//  Each builder: (enemy, s, body, g) => void
// ──────────────────────────────────────────────────────────

const ENEMY_BUILDERS = {

  oni: (enemy, s, body, g) => {
    const os = s * 1.5;
    body.geometry = G.sphere(os * 0.78, 10);
    body.material = std(0xFFB7C5);
    body.scale.set(1, 0.78, 1);
    body.position.set(0, os * 0.60, 0);
    g.add(mk(G.sphere(os*0.38, 8), std(0xFFE4EE), { y: os*0.88, shadow: false }));
    stampEnemyFace(g, 0, os*0.95, os*0.46, os*0.6, -1.25, { eyeScale: 1.55, browScale: 2.6, browAngle: 0.74 });
  },

  mochi: (enemy, s, body, g) => {
    body.geometry = G.sphere(s * 0.78, 10);
    body.material = std(P.mochiPink);
    body.scale.set(1, 0.78, 1);
    body.position.set(0, s * 0.60, 0);
    g.add(mk(G.sphere(s*0.38, 8), std(0xFFE4EE), { y: s*0.88, shadow: false }));
    stampEnemyFace(g, 0, s*0.95, s*0.46, s*0.6, -1.25, { eyeScale: 1.55, browScale: 2.6, browAngle: 0.74 });
  },

  takoyaki: (enemy, s, body, g) => {
    const col   = 0x1A0A00;
    const shiny = new THREE.MeshPhysicalMaterial({
      color: col, roughness: 0.18, metalness: 0.35,
      clearcoat: 0.75, clearcoatRoughness: 0.25,
    });
    const matte = std(col, { roughness: 0.65 });

    body.geometry = G.sphere(s * 0.50, 12);
    body.material = shiny;
    body.position.set(0, s * 0.48, s * 0.26);

    g.add(mk(G.sphere(s * 0.19, 8), shiny, { y: s * 0.44, z: -s * 0.20 }));
    g.add(mk(G.sphere(s * 0.30, 10), shiny, { y: s * 0.46, z: -s * 0.60 }));

    [-1, 1].forEach(sx => {
      g.add(mk(G.cyl(s*.016, s*.022, s*.38, 4), matte, { x: sx*s*.16, y: s*.72, z: -s*.76, rx: 0.55, rz: sx*-0.28 }));
      g.add(mk(G.sphere(s*.040, 5), matte, { x: sx*s*.26, y: s*.96, z: -s*.94 }));
    });

    [{ lz: -s*.36, lrx: -0.16 }, { lz: -s*.18, lrx: 0 }, { lz: s*.02, lrx: 0.16 }]
      .forEach(({ lz, lrx }) => [-1, 1].forEach(sx =>
        g.add(mk(G.cyl(s*.013, s*.017, s*.34, 4), matte, { x: sx*s*.28, y: s*.16, z: lz, rx: lrx, rz: sx*-0.62 }))
      ));

    stampFace(g, 0, s * 0.46, -s * 0.86, s * 0.30);
  },

  onigiri: (enemy, s, body, g) => {
    const armor = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.2 });
    const shell = new THREE.MeshStandardMaterial({ color: 0x4A0000, roughness: 0.2, metalness: 0.3 });
    const spotMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.8 });

    body.geometry = G.sphere(s * 0.60, 12, 10);
    body.material = shell;
    body.scale.set(1, 0.7, 1.2);
    body.position.set(0, s * 0.40, s * 0.20);
    
    const spotGeom = G.sphere(s * 0.15, 6);
    [
      { x:  s*.25, y: s*.72, z:  s*.0 },
      { x: -s*.25, y: s*.72, z:  s*.0 },
      { x:  s*.18, y: s*.65, z:  s*.45 },
      { x: -s*.18, y: s*.65, z:  s*.45 },
      { x:  s*.35, y: s*.55, z:  s*.25 },
      { x: -s*.35, y: s*.55, z:  s*.25 }
    ].forEach(sp => g.add(mk(spotGeom, spotMat, sp)));

    g.add(mk(G.box(s*.03, s*.20, s*.90), armor, { y: s*.72, z: s*.20, rx: -0.1 }));
    g.add(mk(G.sphere(s * 0.40, 10), armor, { y: s * 0.36, z: -s * 0.25 }));
    g.add(mk(G.sphere(s * 0.28, 8), armor, { y: s * 0.32, z: -s * 0.60 }));
    stampFace(g, 0, s * 0.36, -s * 0.88, s * 0.28);

    g.add(mk(G.cyl(s*.02, s*.06, s*.15, 4), armor, { x: -s*.10, y: s*.25, z: -s*.80, rx: 1.5, ry: 0.4 }));
    g.add(mk(G.cyl(s*.02, s*.06, s*.15, 4), armor, { x:  s*.10, y: s*.25, z: -s*.80, rx: 1.5, ry: -0.4 }));

    [{ lz: -s*.10, rx: 0 }, { lz: s*.10, rx: 0 }, { lz: s*.30, rx: -0.2 }]
      .forEach(({ lz, rx }) => [-1, 1].forEach(sx =>
        g.add(mk(G.cyl(s*.02, s*.02, s*.40, 4), armor, { x: sx*s*.40, y: s*.18, z: lz, rz: sx*-0.6, rx: rx }))
      ));
  },

  gyoza: (enemy, s, body, g) => {
    const shellMat  = std(0xE8450A, { roughness: 0.5 });
    const underMat  = std(0xFCE4D6, { roughness: 0.8 }); 
    const clawMat   = std(0xD63D04, { roughness: 0.4 });
    const eyeWhite  = std(0xFFFFFF, { roughness: 1.0 });
    const eyeDark   = std(P.eyeDark);

    body.geometry = G.sphere(s * 0.45, 16, 12);
    body.material = shellMat;
    body.scale.set(1.5, 0.6, 1.0);
    body.position.set(0, s * 0.35, 0);
    enemy.baseHeight = s * 0.05;

    g.add(mk(G.sphere(s * 0.40, 12), underMat, { y: s * 0.28, sx: 1.4, sy: 0.4, sz: 0.9 }));

    [-1, 1].forEach(sx => {
      g.add(mk(G.cyl(s*.025, s*.025, s*.20, 6), shellMat, { x: sx*s*.15, y: s*.55, z: -s*.35, rx: 0.2, rz: sx*-0.2 }));
      g.add(mk(G.sphere(s*.09, 8), eyeWhite, { x: sx*s*.18, y: s*.65, z: -s*.40 }));
      g.add(mk(G.sphere(s*.04, 6), eyeDark,  { x: sx*s*.18, y: s*.67, z: -s*.46 }));
    });

    enemy.legs = [];
    const legAngles = [0.1, 0.4, 0.7, 1.0];
    const legZ = [-s*.20, -s*.05, s*.10, s*.25];
    [-1, 1].forEach(sx => legAngles.forEach((angle, i) => {
      const legGroup = new THREE.Group();
      legGroup.position.set(sx * s*.40, s*.25, legZ[i]);
      legGroup.rotation.y = sx * -0.2; 
      legGroup.rotation.z = sx * (Math.PI/2 - 0.4);
      legGroup.add(mk(G.cyl(s*.035, s*.01, s*.40, 5), shellMat, { y: -s*.20, rx: 0.1 }));
      legGroup.userData.baseRz = legGroup.rotation.z;
      g.add(legGroup);
      enemy.legs.push(legGroup);
    }));

    enemy.claws = [];
    [-1, 1].forEach(sx => {
      const clawRoot = new THREE.Group();
      clawRoot.position.set(sx * s*.35, s*.30, -s*.40);
      clawRoot.rotation.x = -0.4;
      clawRoot.rotation.z = sx * 0.5;
      clawRoot.add(mk(G.cyl(s*.04, s*.03, s*.35, 6), shellMat, { y: s*.10, rz: sx*-0.6 }));
      
      const clawScale = sx === 1 ? 1.5 : 1.0;
      clawRoot.add(mk(G.sphere(s*.14 * clawScale, 10), clawMat, { x: sx*s*.15, y: s*.25, z: -s*.10, sx: 1, sy: 1.2, sz: 1 }));
      
      const fU = mk(G.cyl(s*.035*clawScale, s*.01, s*.25*clawScale, 5), clawMat, { x: sx*s*.15, y: s*.25 + s*.15*clawScale, z: -s*.10 - s*.05*clawScale, rx: -0.4 });
      const fL = mk(G.cyl(s*.025*clawScale, s*.01, s*.20*clawScale, 5), clawMat, { x: sx*s*.15, y: s*.25 + s*.15*clawScale, z: -s*.10 + s*.05*clawScale, rx:  0.4 });
      clawRoot.add(fU, fL);
      clawRoot.userData.fingerU = fU;
      clawRoot.userData.fingerL = fL;
      clawRoot.userData.baseRx = -0.4;
      g.add(clawRoot);
      enemy.claws.push(clawRoot);
    });
  },

  tarabagani: (enemy, s, body, g) => {
    const shellMat = std(0x8B1A1A, { roughness: 0.4 });
    const underMat = std(0xC44B4B, { roughness: 0.8 });
    const clawMat  = std(0x6B0F0F, { roughness: 0.3 });
    const eyeWhite = std(0xFFFFFF, { roughness: 1.0 });
    const eyeDark  = std(P.eyeDark);
    const spikeMat = std(0x6B0F0F, { roughness: 0.5 });

    body.geometry = G.sphere(s * 0.55, 16, 12);
    body.material = shellMat;
    body.scale.set(1.6, 0.55, 1.0);
    body.position.set(0, s * 0.38, 0);
    enemy.baseHeight = s * 0.05;

    g.add(mk(G.sphere(s * 0.50, 12), underMat, { y: s * 0.30, sx: 1.5, sy: 0.35, sz: 0.9 }));

    [-2, -1, 0, 1, 2].forEach(i => {
      g.add(mk(G.cyl(0, s * 0.06, s * 0.20, 5), spikeMat, {
        x: i * s * 0.22, y: s * 0.44, z: s * 0.38, rx: -0.6
      }));
    });

    [-1, 1].forEach(sx => {
      g.add(mk(G.cyl(s*.032, s*.032, s*.22, 6), shellMat, { x: sx*s*.18, y: s*.60, z: -s*.42, rx: 0.2, rz: sx*-0.2 }));
      g.add(mk(G.sphere(s*.10, 8), eyeWhite, { x: sx*s*.21, y: s*.72, z: -s*.47 }));
      g.add(mk(G.sphere(s*.045, 6), eyeDark,  { x: sx*s*.21, y: s*.74, z: -s*.53 }));
    });

    enemy.legs = [];
    const legZ_tb = [-s*.22, -s*.05, s*.12, s*.28];
    [-1, 1].forEach(sx => legZ_tb.forEach((lz, i) => {
      const legGroup = new THREE.Group();
      legGroup.position.set(sx * s*.48, s*.28, lz);
      legGroup.rotation.y = sx * -0.2;
      legGroup.rotation.z = sx * (Math.PI/2 - 0.4);
      legGroup.add(mk(G.cyl(s*.05, s*.015, s*.48, 5), shellMat, { y: -s*.24, rx: 0.1 }));
      legGroup.userData.baseRz = legGroup.rotation.z;
      g.add(legGroup);
      enemy.legs.push(legGroup);
    }));

    enemy.claws = [];
    [-1, 1].forEach(sx => {
      const clawRoot = new THREE.Group();
      clawRoot.position.set(sx * s*.42, s*.32, -s*.46);
      clawRoot.rotation.x = -0.4;
      clawRoot.rotation.z = sx * 0.5;
      clawRoot.add(mk(G.cyl(s*.055, s*.04, s*.42, 6), shellMat, { y: s*.12, rz: sx*-0.6 }));
      clawRoot.add(mk(G.sphere(s*.18, 10), clawMat, { x: sx*s*.18, y: s*.30, z: -s*.12, sx: 1, sy: 1.2, sz: 1 }));

      const fU = mk(G.cyl(s*.05, s*.015, s*.32, 5), clawMat, { x: sx*s*.18, y: s*.30 + s*.19, z: -s*.12 - s*.07, rx: -0.4 });
      const fL = mk(G.cyl(s*.04, s*.015, s*.28, 5), clawMat, { x: sx*s*.18, y: s*.30 + s*.19, z: -s*.12 + s*.07, rx:  0.4 });

      clawRoot.add(fU, fL);
      clawRoot.userData.fingerU = fU;
      clawRoot.userData.fingerL = fL;
      clawRoot.userData.baseRx = -0.4;
      g.add(clawRoot);
      enemy.claws.push(clawRoot);
    });
  },

  tamagoyaki: (enemy, s, body, g) => {
    const bodyMat = std(0xD84315, { roughness: 0.6 });
    const legMat  = std(0xFF8F00, { roughness: 0.8 });
    const darkMat = std(0x111111);

    const numSegments = 7;
    const segZ = s * 0.35;

    enemy.centipedeSegments = [];
    enemy.modelScale = s;

    body.geometry = G.sphere(s * 0.30, 10);
    body.material = bodyMat;
    body.position.set(0, s * 0.25, 0);

    for (let i = -3; i <= 3; i++) {
      let cz = i * segZ;
      let cy = s * 0.25;

      let segMesh;
      if (i === 0) {
          segMesh = body;
      } else {
          segMesh = mk(G.sphere(s * 0.30, 8), bodyMat, { x: 0, y: cy, z: cz });
          g.add(segMesh);
      }

      const leftLeg  = mk(G.cyl(s*0.02, s*0.02, s*0.4, 4), legMat, { x: -s*0.25, y: s*0.12, z: cz, rz:  1.2 });
      const rightLeg = mk(G.cyl(s*0.02, s*0.02, s*0.4, 4), legMat, { x:  s*0.25, y: s*0.12, z: cz, rz: -1.2 });
      g.add(leftLeg);
      g.add(rightLeg);

      enemy.centipedeSegments.push({ seg: segMesh, legs: [leftLeg, rightLeg] });

      if (i === -3) {
          const hz = cz;
          g.add(mk(G.sphere(s * 0.08, 6), darkMat, { x: -s*0.12, y: s*0.35, z: hz - s*0.22 }));
          g.add(mk(G.sphere(s * 0.08, 6), darkMat, { x:  s*0.12, y: s*0.35, z: hz - s*0.22 }));
          g.add(mk(G.cyl(s*0.015, s*0.015, s*0.4, 4), darkMat, { x: -s*0.12, y: s*0.45, z: hz - s*0.25, rx: 0.8, rz: 0.5 }));
          g.add(mk(G.cyl(s*0.015, s*0.015, s*0.4, 4), darkMat, { x:  s*0.12, y: s*0.45, z: hz - s*0.25, rx: 0.8, rz: -0.5 }));
          g.add(mk(G.cyl(s*.02, s*.05, s*.15, 4), darkMat, { x: -s*.10, y: s*.2, z: hz - s*.28, rx: 1.5, ry: 0.4 }));
          g.add(mk(G.cyl(s*.02, s*.05, s*.15, 4), darkMat, { x:  s*.10, y: s*.2, z: hz - s*.28, rx: 1.5, ry: -0.4 }));
      }
      
      if (i === 3) {
          const tz = cz;
          g.add(mk(G.cyl(s*0.015, s*0.015, s*0.3, 4), darkMat, { x: -s*0.08, y: s*0.25, z: tz + s*0.2, rx: -0.5, rz: -0.3 }));
          g.add(mk(G.cyl(s*0.015, s*0.015, s*0.3, 4), darkMat, { x:  s*0.08, y: s*0.25, z: tz + s*0.2, rx: -0.5, rz: 0.3 }));
      }
    }
  },

  kurage: (enemy, s, body, g) => {
    const skinMat  = std(0x4CAF50, { roughness: 0.7 });
    const bellyMat = std(0xC8E6C9, { roughness: 0.8 });
    const spotMat  = std(0x1B5E20, { roughness: 0.7 });
    const eyeWhite = std(0xFFFFFF, { roughness: 1.0 });
    const eyeDark  = std(P.eyeDark);

    enemy.baseHeight = s * 0.011;

    body.geometry = G.sphere(s * 0.42, 10);
    body.material = skinMat;
    body.scale.set(0.75, 0.55, 1.35);
    body.position.set(0, s * 0.22, 0);

    g.add(mk(G.sphere(s * 0.32, 8), bellyMat, { y: s * 0.18, sx: 0.55, sy: 0.40, sz: 1.10 }));

    [{ x:  s*.15, z: -s*.20 }, { x: -s*.18, z:  s*.05 }, { x:  s*.12, z:  s*.28 }]
      .forEach(p => g.add(mk(G.sphere(s * 0.09, 6), spotMat, { x: p.x, y: s * 0.43, z: p.z })));

    g.add(mk(G.sphere(s * 0.30, 8), skinMat, { y: s * 0.26, z: -s * 0.62, sx: 1, sy: 0.75, sz: 1.15 }));

    g.add(mk(G.sphere(s * 0.15, 7), eyeWhite, { x: -s*.14, y: s * 0.38, z: -s * 0.78 }));
    g.add(mk(G.sphere(s * 0.15, 7), eyeWhite, { x:  s*.14, y: s * 0.38, z: -s * 0.78 }));
    g.add(mk(G.sphere(s * 0.08, 6), eyeDark,  { x: -s*.14, y: s * 0.39, z: -s * 0.88 }));
    g.add(mk(G.sphere(s * 0.08, 6), eyeDark,  { x:  s*.14, y: s * 0.39, z: -s * 0.88 }));

    enemy.legs = [];
    [{ sx:-1, lz:-s*.28 }, { sx: 1, lz:-s*.28 }, { sx:-1, lz: s*.22 }, { sx: 1, lz: s*.22 }]
      .forEach(({ sx, lz }) => {
        const baseRz = sx * 0.85;
        const leg = mk(G.cyl(s*.065, s*.065, s*.40, 5), skinMat, { x: sx*s*.43, y: s*.14, z: lz, rx: 0, rz: baseRz });
        leg.userData.baseRz = baseRz;
        g.add(leg);
        enemy.legs.push(leg);
      });

    [{ sx:-1, lz:-s*.28 }, { sx: 1, lz:-s*.28 }, { sx:-1, lz: s*.22 }, { sx: 1, lz: s*.22 }]
      .forEach(({ sx, lz }) => {
        [-1, 0, 1].forEach(toe =>
          g.add(mk(G.sphere(s*.04, 4), skinMat, { x: sx*s*.28 + toe*s*.06, y: s*.01, z: lz + toe*s*.04 }))
        );
      });

    g.add(mk(G.cyl(s*.07, s*.03, s*.50, 5), skinMat, { x: 0, y: s * 0.12, z:  s * 0.62, rx: -0.5 }));
    g.add(mk(G.cyl(s*.03, s*.01, s*.30, 5), skinMat, { x: 0, y: s * 0.08, z:  s * 0.88, rx: -0.9 }));
  },

  warabi: (enemy, s, body, g) => {
    const furMat  = std(0x7D736A, { roughness: 0.9 });
    const skinMat = std(0xE2B4B4, { roughness: 0.6 });
    const eyeMat  = std(0x111111);

    enemy.baseHeight = s * 0.095;

    body.geometry = G.sphere(s * 0.45, 12, 10);
    body.material = furMat;
    body.scale.set(0.8, 0.7, 1.3);
    body.position.set(0, s * 0.22, 0);

    g.add(mk(G.sphere(s * 0.28, 10), furMat, { y: s * 0.22, z: -s * 0.55, sx: 0.8, sy: 0.8, sz: 1.2 }));
    g.add(mk(G.sphere(s * 0.06, 6), skinMat, { y: s * 0.18, z: -s * 0.85 }));

    g.add(mk(G.cyl(s * 0.14, s * 0.14, s * 0.04, 8), furMat, { x: -s * 0.2, y: s * 0.42, z: -s * 0.45, rx: 1.2, rz: 0.2 }));
    g.add(mk(G.cyl(s * 0.14, s * 0.14, s * 0.04, 8), furMat, { x:  s * 0.2, y: s * 0.42, z: -s * 0.45, rx: 1.2, rz: -0.2 }));

    g.add(mk(G.sphere(s * 0.05, 6), eyeMat, { x: -s * 0.15, y: s * 0.30, z: -s * 0.65 }));
    g.add(mk(G.sphere(s * 0.05, 6), eyeMat, { x:  s * 0.15, y: s * 0.30, z: -s * 0.65 }));

    g.add(mk(G.cyl(s * 0.04, s * 0.01, s * 0.8, 5), skinMat, { y: s * 0.10, z: s * 0.8, rx: -1.4 }));

    [{ x:-s*.2, z:-s*.2 }, { x: s*.2, z:-s*.2 }, { x:-s*.2, z: s*.3 }, { x: s*.2, z: s*.3 }]
      .forEach(p => g.add(mk(G.sphere(s*.08, 6), skinMat, { x: p.x, y: s*.05, z: p.z, sz: 1.5 })));
  },

  nerikiri: (enemy, s, body, g) => {
    const exoMat  = std(0x7CB342, { roughness: 0.3, metalness: 0.1 });
    const darkMat = std(0x33691E, { roughness: 0.5 });
    const eyeMat  = std(0x000000, { roughness: 0.1, metalness: 0.8 });

    body.geometry = G.sphere(s * 0.35, 10);
    body.material = exoMat;
    body.scale.set(0.6, 0.6, 1.8);
    body.position.set(0, s * 0.45, s * 0.3);

    g.add(mk(G.sphere(s * 0.32, 8), darkMat, { y: s * 0.5, z: -s * 0.2, sx: 0.8, sy: 0.9, sz: 1.1 }));
    g.add(mk(G.sphere(s * 0.25, 8), exoMat, { y: s * 0.45, z: -s * 0.55, sx: 0.7, sy: 1.2, sz: 0.8, rx: 0.2 }));

    g.add(mk(G.sphere(s * 0.1, 8), eyeMat, { x: -s * 0.15, y: s * 0.55, z: -s * 0.6 }));
    g.add(mk(G.sphere(s * 0.1, 8), eyeMat, { x:  s * 0.15, y: s * 0.55, z: -s * 0.6 }));

    g.add(mk(G.cyl(s * 0.01, s * 0.01, s * 0.6, 4), darkMat, { x: -s * 0.1, y: s * 0.8, z: -s * 0.75, rx: 0.5, rz: 0.3 }));
    g.add(mk(G.cyl(s * 0.01, s * 0.01, s * 0.6, 4), darkMat, { x:  s * 0.1, y: s * 0.8, z: -s * 0.75, rx: 0.5, rz: -0.3 }));

    g.add(mk(G.cyl(s * 0.06, s * 0.04, s * 0.7, 5), exoMat, { x: -s * 0.25, y: s * 0.65, z:  s * 0.1, rx: 0.8, rz: 0.1 }));
    g.add(mk(G.cyl(s * 0.06, s * 0.04, s * 0.7, 5), exoMat, { x:  s * 0.25, y: s * 0.65, z:  s * 0.1, rx: 0.8, rz: -0.1 }));
    g.add(mk(G.cyl(s * 0.03, s * 0.01, s * 0.8, 4), darkMat, { x: -s * 0.28, y: s * 0.45, z:  s * 0.35, rx: -0.2 }));
    g.add(mk(G.cyl(s * 0.03, s * 0.01, s * 0.8, 4), darkMat, { x:  s * 0.28, y: s * 0.45, z:  s * 0.35, rx: -0.2 }));

    [{ x:-s*.2, z:-s*.2 }, { x: s*.2, z:-s*.2 }, { x:-s*.25, z: 0 }, { x: s*.25, z: 0 }]
      .forEach(p => g.add(mk(G.cyl(s*.02, s*.01, s*.4, 4), darkMat, { x: p.x, y: s*.2, z: p.z, rx: -0.4, rz: Math.sign(p.x)*0.3 })));
  },

  kuronyudo: (enemy, s, body, g) => {
    const bodyColor = std(0xFFFFFF, { roughness: 0.95 });
    const shade     = std(0xE0E0E0, { roughness: 0.95 });
    const orange    = std(0xFF8800, { roughness: 0.95 });
    const dark      = std(P.eyeDark);

    const bw = s*1.40, bh = s*0.80, bd = s*1.10;
    body.geometry = G.box(bw, bh, bd);
    body.material = bodyColor;
    body.position.set(0, bh*.5, 0);

    const hw = s*0.72, hh = s*0.58, hd = s*0.66;
    const hcy = bh + hh*.5, hcz = s*0.26;
    g.add(mk(G.box(hw, hh, hd), bodyColor, { y: hcy, z: hcz }));

    const bkz = hcz + hd*.5 + s*0.09;
    g.add(mk(G.box(s*0.30, s*0.14, s*0.18), orange, { y: hcy,          z: bkz }));
    g.add(mk(G.box(s*0.26, s*0.10, s*0.14), orange, { y: hcy - s*0.12, z: bkz - s*0.02 }));

    g.add(mk(G.box(s*0.36, s*0.28, s*0.20), shade,     { y: bh + s*0.14, z: -bd*.5 - s*0.10 }));
    g.add(mk(G.box(s*0.28, s*0.22, s*0.16), bodyColor, { y: bh + s*0.39, z: -bd*.5 - s*0.18 }));

    [-1, 1].forEach(sx =>
      g.add(mk(G.box(s*0.14, s*0.40, s*0.56), shade, { x: sx*(bw*.5 + s*0.07), y: bh*.52 }))
    );

    const efz = hcz + hd*.5 + s*0.01;
    g.add(mk(G.box(s*0.13, s*0.14, s*0.06), dark, { x: -s*0.16, y: hcy + s*0.06, z: efz }));
    g.add(mk(G.box(s*0.13, s*0.14, s*0.06), dark, { x:  s*0.16, y: hcy + s*0.06, z: efz }));

    g.add(mk(G.box(s*0.24, s*0.08, s*0.07), dark, { x: -s*0.16, y: hcy + s*0.19, z: efz + s*0.01, rz: -0.45 }));
    g.add(mk(G.box(s*0.24, s*0.08, s*0.07), dark, { x:  s*0.16, y: hcy + s*0.19, z: efz + s*0.01, rz:  0.45 }));
  },

  daigamo: (enemy, s, body, g) => {
    const bodyColor = std(0x2C3E50, { roughness: 0.95 });
    const shade     = std(0x1A252F, { roughness: 0.95 });
    const orange    = std(0xFF8800, { roughness: 0.95 });
    const dark      = std(P.eyeDark);

    const bw = s*1.65, bh = s*0.95, bd = s*1.30;
    body.geometry = G.box(bw, bh, bd);
    body.material = bodyColor;
    body.position.set(0, bh*.5, 0);

    const hw = s*0.88, hh = s*0.72, hd = s*0.80;
    const hcy = bh + hh*.5, hcz = s*0.28;
    g.add(mk(G.box(hw, hh, hd), bodyColor, { y: hcy, z: hcz }));

    const bkz = hcz + hd*.5 + s*0.10;
    g.add(mk(G.box(s*0.38, s*0.18, s*0.22), orange, { y: hcy,          z: bkz }));
    g.add(mk(G.box(s*0.32, s*0.13, s*0.17), orange, { y: hcy - s*0.15, z: bkz - s*0.02 }));

    g.add(mk(G.box(s*0.46, s*0.34, s*0.24), shade,     { y: bh + s*0.17, z: -bd*.5 - s*0.12 }));
    g.add(mk(G.box(s*0.36, s*0.28, s*0.20), bodyColor, { y: bh + s*0.48, z: -bd*.5 - s*0.22 }));

    [-1, 1].forEach(sx =>
      g.add(mk(G.box(s*0.17, s*0.50, s*0.68), shade, { x: sx*(bw*.5 + s*0.085), y: bh*.52 }))
    );

    const efz_dg = hcz + hd*.5 + s*0.01;
    g.add(mk(G.box(s*0.17, s*0.18, s*0.07), dark, { x: -s*0.20, y: hcy + s*0.07, z: efz_dg }));
    g.add(mk(G.box(s*0.17, s*0.18, s*0.07), dark, { x:  s*0.20, y: hcy + s*0.07, z: efz_dg }));

    g.add(mk(G.box(s*0.34, s*0.14, s*0.09), dark, { x: -s*0.20, y: hcy + s*0.26, z: efz_dg + s*0.01, rz: -0.65 }));
    g.add(mk(G.box(s*0.34, s*0.14, s*0.09), dark, { x:  s*0.20, y: hcy + s*0.26, z: efz_dg + s*0.01, rz:  0.65 }));
  },

  yamata: (enemy, s, body, g) => {
    const armorMat = std(0x2D1B69, { roughness: 0.4, metalness: 0.2 });
    const scaleMat = std(0x4A2C8C, { roughness: 0.5 });
    const goldMat  = std(0xB8860B, { roughness: 0.3, metalness: 0.6 });
    const eyeGlow  = glow(0xFF6600, 2.0);

    const segZ_ym = s * 0.55;
    enemy.centipedeSegments = [];
    enemy.modelScale = s;

    body.geometry = G.sphere(s * 0.40, 10);
    body.material = armorMat;
    body.position.set(0, s * 0.40, 0);
    enemy.baseHeight = 0;

    for (let i = -4; i <= 3; i++) {
      const cz = i * segZ_ym;
      const cy = s * 0.40;
      let segMesh;

      if (i === 0) {
        segMesh = body;
      } else {
        segMesh = mk(G.sphere(s * 0.40, 8), armorMat, { y: cy, z: cz });
        g.add(segMesh);
      }

      g.add(mk(G.cyl(0, s*0.055, s*0.20, 4), goldMat, { y: cy + s*0.42, z: cz }));

      const leftLeg  = mk(G.cyl(s*0.028, s*0.028, s*0.50, 5), scaleMat, { x: -s*0.35, y: cy - s*0.18, z: cz, rz:  1.2 });
      const rightLeg = mk(G.cyl(s*0.028, s*0.028, s*0.50, 5), scaleMat, { x:  s*0.35, y: cy - s*0.18, z: cz, rz: -1.2 });
      g.add(leftLeg, rightLeg);
      enemy.centipedeSegments.push({ seg: segMesh, legs: [leftLeg, rightLeg] });

      if (i === -4) {
        g.add(mk(G.box(s*0.55, s*0.35, s*0.60), armorMat, { y: cy - s*0.03, z: cz - s*0.60 }));
        g.add(mk(G.box(s*0.48, s*0.16, s*0.50), scaleMat, { y: cy - s*0.22, z: cz - s*0.65 }));
        [-1, 1].forEach(sx => {
          g.add(mk(G.cyl(0, s*0.07, s*0.52, 5), goldMat, { x: sx*s*0.22, y: cy + s*0.35, z: cz, rx: 0.5, rz: sx*0.45 }));
        });
        g.add(mk(G.sphere(s*0.13, 7), eyeGlow, { x: -s*0.22, y: cy + s*0.08, z: cz - s*0.42 }));
        g.add(mk(G.sphere(s*0.13, 7), eyeGlow, { x:  s*0.22, y: cy + s*0.08, z: cz - s*0.42 }));
        [-1, 1].forEach(sx => {
          g.add(mk(G.cyl(s*0.012, s*0.012, s*0.55, 4), goldMat, { x: sx*s*0.20, y: cy - s*0.05, z: cz - s*0.72, rx: 0.3, rz: sx*0.2 }));
        });
      }

      if (i === 3) {
        g.add(mk(G.cyl(0, s*0.08, s*0.35, 5), scaleMat, { y: cy, z: cz + s*0.42, rx: -0.3 }));
      }
    }
  },

  oodako: (enemy, s, body, g) => {
    const bodyMat  = std(0xD96A8C, { roughness: 0.6 });
    const tentMat  = std(0xC25878, { roughness: 0.7 });
    const suckMat  = std(0xFFD4E8, { roughness: 0.9 });
    const eyeWhite = std(0xFFFFFF, { roughness: 1.0 });
    const eyeDark  = std(P.eyeDark);

    body.geometry = G.sphere(s * 0.60, 14);
    body.material = bodyMat;
    body.scale.set(1.1, 0.80, 1.1);
    body.position.set(0, s * 0.55, 0);
    enemy.baseHeight = 0;

    g.add(mk(G.sphere(s*0.40, 10), bodyMat, { y: s*0.95, sx: 0.85, sy: 1.0, sz: 0.85 }));

    [-1, 1].forEach(sx => {
      g.add(mk(G.sphere(s*0.22, 8), eyeWhite, { x: sx*s*0.35, y: s*0.62, z: -s*0.50 }));
      g.add(mk(G.sphere(s*0.12, 6), eyeDark,  { x: sx*s*0.35, y: s*0.62, z: -s*0.63 }));
    });

    enemy.tentacles = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const tx = Math.sin(angle) * s * 0.42;
      const tz = Math.cos(angle) * s * 0.42;
      const tentGroup = new THREE.Group();
      tentGroup.position.set(tx, s * 0.25, tz);
      const upper = mk(G.cyl(s*0.10, s*0.07, s*0.65, 7), tentMat, { y: -s*0.32 });
      const lower = mk(G.cyl(s*0.07, s*0.03, s*0.55, 6), tentMat, { y: -s*0.80, rx: 0.5 });
      for (let j = 0; j < 3; j++) {
        upper.add(mk(G.sphere(s*0.04, 5), suckMat, { y: -s*0.10 - j*s*0.18, z: s*0.09 }));
      }
      tentGroup.add(upper, lower);
      tentGroup.userData.phase = (i / 8) * Math.PI * 2;
      g.add(tentGroup);
      enemy.tentacles.push(tentGroup);
    }
  },

  gashadokuro: (enemy, s, body, g) => {
    const boneMat   = std(0xEDE8D0, { roughness: 0.9 });
    const shadowMat = std(0xC4BCAA, { roughness: 0.9 });
    const darkMat_g = std(0x0A0A0A);
    const eyeGlow_g = glow(0x00FF80, 1.5);

    body.geometry = G.box(s*0.88, s*0.80, s*0.78);
    body.material = boneMat;
    body.position.set(0, s*1.80, 0);
    enemy.baseHeight = 0;

    [-1, 1].forEach(sx => {
      g.add(mk(G.box(s*0.22, s*0.20, s*0.10), darkMat_g, { x: sx*s*0.22, y: s*1.84, z: -s*0.40 }));
      g.add(mk(G.sphere(s*0.08, 6), eyeGlow_g, { x: sx*s*0.22, y: s*1.84, z: -s*0.42 }));
    });
    g.add(mk(G.box(s*0.14, s*0.10, s*0.10), darkMat_g, { y: s*1.70, z: -s*0.40 }));
    [-2, -1, 0, 1, 2].forEach(ti => {
      g.add(mk(G.box(s*0.09, s*0.13, s*0.08), boneMat, { x: ti*s*0.12, y: s*1.46, z: -s*0.40 }));
    });
    g.add(mk(G.box(s*0.24, s*0.22, s*0.24), shadowMat, { y: s*1.38 }));
    g.add(mk(G.box(s*0.70, s*0.55, s*0.50), boneMat, { y: s*1.00 }));
    for (let ri = 0; ri < 4; ri++) {
      const ry = s*1.15 - ri * s*0.13;
      [-1, 1].forEach(sx => {
        g.add(mk(G.box(s*0.18, s*0.07, s*0.40), shadowMat, { x: sx*s*0.44, y: ry, rz: sx*0.3 }));
      });
    }
    for (let si = 0; si < 4; si++) {
      g.add(mk(G.box(s*0.10, s*0.12, s*0.10), boneMat, { y: s*1.15 - si*s*0.13 }));
    }
    g.add(mk(G.box(s*0.64, s*0.28, s*0.42), boneMat, { y: s*0.62 }));
    [-1, 1].forEach(sx => {
      g.add(mk(G.cyl(s*0.09, s*0.07, s*0.40, 6), boneMat,   { x: sx*s*0.22, y: s*0.38, rx: 0.1 }));
      g.add(mk(G.cyl(s*0.07, s*0.05, s*0.38, 6), shadowMat, { x: sx*s*0.22, y: s*0.10 }));
      g.add(mk(G.box(s*0.22, s*0.10, s*0.30), boneMat,      { x: sx*s*0.22, y: s*0.05, z: -s*0.06 }));
      g.add(mk(G.cyl(s*0.07, s*0.06, s*0.52, 6), boneMat,   { x: sx*s*0.46, y: s*1.02, rz: sx*0.3 }));
    });
  },

  bakedanuki: (enemy, s, body, g) => {
    const bodyMat_bd = std(0x8B5E3C, { roughness: 0.8 });
    const bellyMat   = std(0xDEB887, { roughness: 0.9 });
    const darkMat_bd = std(0x2C1A0E, { roughness: 0.8 });
    const hatDark    = std(0x5C4A1E, { roughness: 0.7 });
    const hatGold    = std(0xD4A847, { roughness: 0.6 });
    const eyeWhite_bd= std(0xFFFFFF, { roughness: 1.0 });
    const eyeDark_bd = std(P.eyeDark);
    const noseMat    = std(0x1A0A0A);

    body.geometry = G.sphere(s * 0.55, 12);
    body.material = bodyMat_bd;
    body.scale.set(1.0, 0.90, 1.0);
    body.position.set(0, s * 0.52, 0);
    enemy.baseHeight = 0;

    g.add(mk(G.sphere(s*0.42, 10), bellyMat, { y: s*0.48, sx: 0.88, sy: 0.70, sz: 0.75 }));
    g.add(mk(G.sphere(s*0.42, 10), bodyMat_bd, { y: s*0.98, sx: 1.0, sy: 0.90, sz: 0.95 }));
    g.add(mk(G.box(s*0.68, s*0.22, s*0.12), darkMat_bd, { y: s*1.02, z: -s*0.38 }));
    [-1, 1].forEach(sx => {
      g.add(mk(G.sphere(s*0.11, 7), eyeWhite_bd, { x: sx*s*0.18, y: s*1.04, z: -s*0.42 }));
      g.add(mk(G.sphere(s*0.06, 6), eyeDark_bd,  { x: sx*s*0.18, y: s*1.04, z: -s*0.48 }));
    });
    g.add(mk(G.sphere(s*0.06, 6), noseMat, { y: s*0.94, z: -s*0.44 }));
    [-1, 1].forEach(sx => {
      g.add(mk(G.sphere(s*0.16, 7), bodyMat_bd, { x: sx*s*0.32, y: s*1.30 }));
      g.add(mk(G.sphere(s*0.09, 6), bellyMat,   { x: sx*s*0.32, y: s*1.30, z: -s*0.08 }));
    });
    [-1, 1].forEach(sx => {
      g.add(mk(G.sphere(s*0.18, 7), bodyMat_bd, { x: sx*s*0.60, y: s*0.72, z: -s*0.08, sx: 0.8, sy: 0.9, sz: 1.1 }));
    });
    g.add(mk(G.sphere(s*0.28, 9), bellyMat,                             { y: s*0.44, z: s*0.58, sx: 1.0, sy: 0.85, sz: 0.90 }));
    g.add(mk(G.sphere(s*0.20, 8), std(0xFFFFFF, { roughness: 0.9 }),    { y: s*0.46, z: s*0.66, sx: 0.85, sy: 0.75, sz: 0.80 }));
    g.add(mk(G.cyl(s*0.52, s*0.52, s*0.08, 12), hatGold, { y: s*1.44 }));
    g.add(mk(G.cyl(s*0.08, s*0.28, s*0.32, 10), hatDark, { y: s*1.59 }));
    g.add(mk(G.cyl(0, s*0.08, s*0.06, 8),        hatGold, { y: s*1.76 }));
  },

  raiju: (enemy, s, body, g) => {
    const bodyMat_rj  = std(0x1A3A5C, { roughness: 0.6, metalness: 0.2 });
    const accentMat_rj= std(0xB0C8E8, { roughness: 0.7 });
    const spikeMat_rj = glow(0xFFE000, 1.2);
    const eyeGlow_rj  = glow(0xFFFF00, 2.0);
    const darkMat_rj  = std(0x0A1628);

    body.geometry = G.box(s*0.72, s*0.55, s*1.10);
    body.material = bodyMat_rj;
    body.position.set(0, s*0.50, 0);
    enemy.baseHeight = s * 0.05;

    const hy_rj = s*0.62, hz_rj = -s*0.72;
    g.add(mk(G.box(s*0.60, s*0.52, s*0.60), bodyMat_rj,  { y: hy_rj, z: hz_rj }));
    g.add(mk(G.box(s*0.34, s*0.26, s*0.28), accentMat_rj,{ y: hy_rj - s*0.08, z: hz_rj - s*0.42 }));
    g.add(mk(G.box(s*0.14, s*0.10, s*0.08), darkMat_rj,  { y: hy_rj - s*0.10, z: hz_rj - s*0.57 }));
    [-1, 1].forEach(sx => {
      g.add(mk(G.box(s*0.10, s*0.12, s*0.07), eyeGlow_rj, { x: sx*s*0.18, y: hy_rj + s*0.06, z: hz_rj - s*0.31 }));
    });
    [-1, 1].forEach(sx => {
      g.add(mk(G.cyl(0, s*0.10, s*0.32, 4), bodyMat_rj, { x: sx*s*0.22, y: hy_rj + s*0.42, z: hz_rj + s*0.10, rx: 0.2, rz: sx*0.25 }));
    });
    for (let i = 0; i < 5; i++) {
      const spikeZ = s*0.28 - i * s*0.24;
      g.add(mk(G.cyl(0, s*0.055, s*0.30, 4), spikeMat_rj, { y: s*0.80, z: spikeZ, rx: i%2 === 0 ? -0.3 : 0.1 }));
    }
    enemy.legs = [];
    [{ x: -s*0.28, z: -s*0.34 }, { x: s*0.28, z: -s*0.34 },
     { x: -s*0.28, z:  s*0.34 }, { x: s*0.28, z:  s*0.34 }].forEach(pos => {
      const legGroup = new THREE.Group();
      legGroup.position.set(pos.x, s*0.22, pos.z);
      legGroup.add(mk(G.cyl(s*0.07, s*0.06, s*0.12, 6), bodyMat_rj,   { y: -s*0.06 }));
      legGroup.add(mk(G.cyl(s*0.06, s*0.05, s*0.12, 6), accentMat_rj, { y: -s*0.18 }));
      legGroup.add(mk(G.box(s*0.15, s*0.06, s*0.20), bodyMat_rj,      { y: -s*0.24, z: -s*0.03 }));
      legGroup.userData.baseRz = 0;
      g.add(legGroup);
      enemy.legs.push(legGroup);
    });
    g.add(mk(G.cyl(s*0.06, s*0.12, s*0.44, 5), bodyMat_rj,  { y: s*0.52, z: s*0.68, rx: -0.7 }));
    g.add(mk(G.cyl(0, s*0.06, s*0.28, 4),       spikeMat_rj, { y: s*0.70, z: s*0.88, rx: -0.5 }));
  },

  ohagi: (enemy, s, body, g) => {
    const bs = s*.82;
    body.geometry = G.box(bs, bs*.85, bs);
    body.material = std(0xC8507A);
    body.position.set(0, bs*.42, 0);

    stampEnemyFace(g, 0, bs*.42, bs*.50, s*.55, -0.3, { eyeScale: 1.2, browScale: 2.5, browAngle: 0.75 });

    const subMat = std(0xA83565);
    g.add(mk(G.box(bs*.78, bs*.72, bs*.78), subMat, { x:-bs*.74, y: bs*.36 }));
    g.add(mk(G.box(bs*.78, bs*.72, bs*.78), subMat, { x: bs*.74, y: bs*.36 }));

    const topMat = std(0xFFFFFF);
    g.add(mk(G.box(s*.22, s*.14, s*.22), topMat, { y: bs*.85 + s*.07 }));
    g.add(mk(G.box(s*.14, s*.11, s*.14), topMat, { x: s*.28,  y: bs*.82 + s*.055 }));
    g.add(mk(G.box(s*.14, s*.11, s*.14), topMat, { x:-s*.26,  y: bs*.83 + s*.055 }));
  },

  default: (enemy, s, body, g) => {
    const bs = s*.80;
    body.geometry = G.box(bs, bs, bs);
    body.material = std(P.dustGrey);
    body.position.set(0, bs*.5, 0);
    voxelFace(g, 0, bs*.64, bs*.52, s*.44);
  }

};

// ──────────────────────────────────────────────────────────
//  REFACTORED applyEnemyStyle
//  Thin controller that handles setup and delegates to builders
// ──────────────────────────────────────────────────────────

function applyEnemyStyle(enemy, scaleStr, startY, type) {
  // Fast path: this pooled enemy still wears exactly this model — skip the
  // full dispose/rebuild (18-30 geometries+materials for big enemies!) and
  // reset only the material state mutated during its previous life. All part
  // refs (tentacles/legs/claws/segments), baseHeight and body transforms are
  // valid outputs of the identical still-attached model and must be preserved.
  if (enemy.builtType === type && enemy.builtScaleStr === scaleStr) {
    const m = enemy.body.material;
    if (m.color)    m.color.setHex(COLORS.enemyBase);          // poison/freeze tint
    if (m.emissive) { m.emissive.setHex(0x000000); m.emissiveIntensity = 0; } // hit flash
    return;
  }

  const s = scaleStr * 0.48;
  const body = enemy.body;

  // Cleanup old geometry
  const oldGeo = body.geometry;
  if (oldGeo && oldGeo !== ASSETS.geo.box) oldGeo.dispose();
  const stale = enemy.visualGroup.children.filter(c => c !== body);
  stale.forEach(c => {
    c.traverse(n => { n.geometry?.dispose(); n.material?.dispose(); });
    enemy.visualGroup.remove(c);
  });

  const g = enemy.visualGroup;

  // Reset properties
  enemy.scanner             = null;
  enemy.baseHeight          = 0;
  enemy.legs                = null;
  enemy.claws               = null;
  enemy.centipedeSegments   = null;
  enemy.tentacles           = null;
  enemy.modelScale          = 0;
  body.scale.set(1, 1, 1);
  body.rotation.set(0, 0, 0);

  // Delegate to appropriate builder
  const builder = ENEMY_BUILDERS[type] || ENEMY_BUILDERS.default;
  builder(enemy, s, body, g);

  // Memo only after a successful build — a builder throw leaves it unset so
  // the next reuse rebuilds instead of skipping onto a half-built model.
  enemy.builtType = type;
  enemy.builtScaleStr = scaleStr;
}

  // ──────────────────────────────────────────────────────────
  //  BUILD TOWER HEAD
  // ──────────────────────────────────────────────────────────
  function buildTowerHead(id, accentMat, T) {
    const builders = { pulse, beam, freeze, missile, sniper, dango, venom, yuzu, kaminari };
    return builders[id]?.(T) ?? null;
  }

  // ============================================================
  //  🍵  PULSE TOWER  →  Matcha Berry Mochi
  // ============================================================
  function pulse(T) {
    const g = new THREE.Group();

    // Soft, squashed cubic mochi block
    const mochiMat = std(P.mochiPink);
    const body = mk(G.box(T*.6, T*.45, T*.6), mochiMat, { y: T*.45 });
    g.add(body);

    stampFace(g, 0, T*.45, T*.3, T*.7);

    // Minimalist single matcha leaf garnish (offset angle)
    const leafMat = std(P.matcha);
    const leaf = mk(G.box(T*.3, T*.06, T*.2), leafMat, { 
      x: T*.15, y: T*.7, z: -T*.1, 
      ry: -0.4, rz: 0.1 
    });
    g.add(leaf);

    return g;
  }

  // ============================================================
  //  ✨  BEAM TOWER  →  Konpeito Star
  // ============================================================
  function beam(T) {
    const g = new THREE.Group();

    // Central Frosted Candy Box
    const candyMat = glass(P.mochiPink);
    g.add(mk(G.box(T*.4, T*.4, T*.4), candyMat, { y: T*.5 }));

    // The spikes (intersecting boxes to form the star candy)
    const spikeGeo = G.box(T*.55, T*.2, T*.2);
    g.add(mk(spikeGeo, candyMat, { y: T*.5 }));                   // X axis
    g.add(mk(spikeGeo, candyMat, { y: T*.5, ry: Math.PI*.5 }));   // Z axis
    g.add(mk(spikeGeo, candyMat, { y: T*.5, rz: Math.PI*.5 }));   // Y axis

    stampFace(g, 0, T*.5, T*.28, T*.7);

    // Floating Minimalist Halo
    const haloMat = std(P.frostBlue);
    const halo = new THREE.Group();
    halo.add(mk(G.box(T*.4, T*.04, T*.04), haloMat, { z: -T*.2 }));
    halo.add(mk(G.box(T*.4, T*.04, T*.04), haloMat, { z:  T*.2 }));
    halo.add(mk(G.box(T*.04, T*.04, T*.4), haloMat, { x: -T*.2 }));
    halo.add(mk(G.box(T*.04, T*.04, T*.4), haloMat, { x:  T*.2 }));
    halo.position.set(0, T*.9, 0);
    g.add(halo);

    // Dowel Wand with Glowing Voxel Core
    const wandGroup = new THREE.Group();
    wandGroup.add(mk(G.cyl(T*.02, T*.02, T*.5, 6), std(P.wood), { y: T*.25 }));
    wandGroup.add(mk(G.box(T*.12, T*.12, T*.12), glow(P.phantomCyan, 2.0), { y: T*.5 }));

    // Invisible anchor at the glowing cube — used as the laser origin
    const wandTip = new THREE.Object3D();
    wandTip.position.set(0, T*.5, 0);
    wandGroup.add(wandTip);
    g.userData.wandTip = wandTip;

    wandGroup.position.set(T*.3, T*.3, T*.1);
    wandGroup.rotation.z = -0.3;
    wandGroup.rotation.x = 0.2;
    g.add(wandGroup);

    return g;
  }

  // ============================================================
  //  🍧  FREEZE TOWER  →  Kakigori (Shaved Ice)
  // ============================================================
  function freeze(T) {
    const g = new THREE.Group();

    // Blocky Stepped Ice Mountain
    const iceMat = std(P.riceWhite);
    g.add(mk(G.box(T*.5, T*.15, T*.5), iceMat, { y: T*.425 })); // Base
    g.add(mk(G.box(T*.35, T*.15, T*.35), iceMat, { y: T*.575 })); // Mid
    g.add(mk(G.box(T*.2, T*.15, T*.2), iceMat, { y: T*.725 })); // Top

    stampFace(g, 0, T*.425, T*.25, T*.65);

    // Single precise voxel drip of Red Syrup
    const syrupMat = std(P.syrupRed);
    g.add(mk(G.box(T*.1, T*.05, T*.1), syrupMat, { y: T*.825 })); // Top dot
    g.add(mk(G.box(T*.12, T*.15, T*.12), syrupMat, { x: T*.05, y: T*.65, z: T*.15 })); // Drip mid
    g.add(mk(G.box(T*.08, T*.1, T*.15), syrupMat, { x: T*.05, y: T*.5, z: T*.2 })); // Drip bottom

    return g;
  }

  // ============================================================
  //  🍙  MISSILE TOWER  →  Onigiri Rocket
  // ============================================================
  function missile(T) {
    const g = new THREE.Group();

    // Glossy polycarbonate body — clearcoat gives the Apple premium sheen
    const glossMat = new THREE.MeshPhysicalMaterial({
      color: P.pearlWhite, metalness: 0.08, roughness: 0.12,
      clearcoat: 1.0, clearcoatRoughness: 0.08
    });
    g.add(mk(G.cyl(T*.28, T*.28, T*.56, 24), glossMat, { y: T*.48 }));

    // Rounded bottom sphere cap — fakes CapsuleGeometry (unavailable in r128)
    g.add(mk(G.sphere(T*.28, 16), glossMat, { y: T*.20 }));

    // Anodized Space Gray aluminum nose cone
    const anoMat = new THREE.MeshStandardMaterial({
      color: P.spaceGray, metalness: 0.72, roughness: 0.38
    });
    g.add(mk(G.cyl(0, T*.28, T*.30, 24), anoMat, { y: T*.91 }));

    // Soft mochi-pink fins (kawaii accent)
    g.add(mk(G.box(T*.12, T*.18, T*.07), std(P.mochiPink), { x: -T*.30, y: T*.25 }));
    g.add(mk(G.box(T*.12, T*.18, T*.07), std(P.mochiPink), { x:  T*.30, y: T*.25 }));

    // Kawaii face on the cylinder front
    stampFace(g, 0, T*.48, T*.29, T*.72);

    // Cyan "clean energy" exhaust — Siri-blue instead of orange fire
    const cyanMat = new THREE.MeshStandardMaterial({
      color: P.phantomCyan, emissive: P.phantomCyan, emissiveIntensity: 1.4,
      transparent: true, opacity: 0.88
    });
    g.add(mk(G.cyl(T*.10, T*.14, T*.08, 24), cyanMat, { y: T*.17 }));

    return g;
  }
  
  // ============================================================
  //  🐟  SNIPER TOWER  →  Taiyaki Archer (Fish Waffle)
  // ============================================================
  function sniper(T) {
    const g = new THREE.Group();

    // Taiyaki fish body — flat wide biscuit shape
    const bodyMat = std(P.taiyakiBrown);
    g.add(mk(G.box(T*.72, T*.22, T*.44), bodyMat, { y: T*.38 }));

    // Tail fin — angled wedge at the back
    const tail = mk(G.box(T*.22, T*.15, T*.28), bodyMat, { x: -T*.42, y: T*.37, rz: 0.25 });
    g.add(tail);

    // Fish head bump
    g.add(mk(G.box(T*.22, T*.28, T*.32), bodyMat, { x: T*.38, y: T*.40 }));

    // Golden custard filling peek (top sliver)
    const fillMat = std(P.taiyakiGold);
    g.add(mk(G.box(T*.52, T*.07, T*.32), fillMat, { y: T*.51 }));

    stampFace(g, T*.3, T*.40, T*.23, T*.5);

    // Scope barrel (ceramic dark cylinder)
    const scopeMat = std(P.ceramic);
    g.add(mk(G.cyl(T*.03, T*.03, T*.32, 6), scopeMat, { x: T*.08, y: T*.72 }));
    // Crosshair rings on top of scope
    g.add(mk(G.box(T*.18, T*.04, T*.04), scopeMat, { x: T*.08, y: T*.9 }));
    g.add(mk(G.box(T*.04, T*.04, T*.18), scopeMat, { x: T*.08, y: T*.9 }));

    return g;
  }

  // ============================================================
  //  🍡  DANGO TOWER  →  Mitarashi Chain (Skewered Rice Balls)
  // ============================================================
  function dango(T) {
    const g = new THREE.Group();

    // Wooden skewer
    g.add(mk(G.cyl(T*.03, T*.03, T*.9, 6), std(P.wood), { y: T*.55 }));

    // Three stacked dango balls — matcha, white, pink (Hanami Dango order: pink top, white middle, green bottom)
    const ballR = T*.145;
    const pinkMat  = std(P.dangoPink);
    const whiteMat = std(P.riceWhite);
    const grMat    = std(P.matcha);

    const ballBot = new THREE.Mesh(G.sphere(ballR, 8), grMat);
    ballBot.position.set(0, T*.3, 0);
    ballBot.castShadow = true;

    const ballMid = new THREE.Mesh(G.sphere(ballR, 8), whiteMat);
    ballMid.position.set(0, T*.55, 0);
    ballMid.castShadow = true;

    const ballTop = new THREE.Mesh(G.sphere(ballR, 8), pinkMat);
    ballTop.position.set(0, T*.8, 0);
    ballTop.castShadow = true;

    g.add(ballBot, ballMid, ballTop);

    stampFace(g, 0, T*.55, T*.145, T*.4);

    // Mitarashi sauce drizzle across top ball (dark amber lines)
    const sauceMat = std(P.mitarashi);
    g.add(mk(G.box(T*.06, T*.03, T*.2), sauceMat, { y: T*.84, rz: 0.3 }));
    g.add(mk(G.box(T*.18, T*.03, T*.05), sauceMat, { y: T*.84, rz: -0.2 }));

    return g;
  }

  // ============================================================
  //  🟢  VENOM TOWER  →  Natto Slime (Fermented Bean Blob)
  // ============================================================
  function venom(T) {
    const g = new THREE.Group();

    // Blobby slime body — main mass + uneven side drips
    const slimeMat = std(P.venomGreen);
    g.add(mk(G.box(T*.52, T*.42, T*.52), slimeMat, { y: T*.34 }));

    // Side drips — give it that wobbly uneven feel
    g.add(mk(G.box(T*.28, T*.16, T*.28), slimeMat, { x:  T*.16, y: T*.16, z:  T*.12 }));
    g.add(mk(G.box(T*.24, T*.13, T*.24), slimeMat, { x: -T*.14, y: T*.14, z: -T*.12 }));
    g.add(mk(G.box(T*.18, T*.1,  T*.2 ), slimeMat, { x:  T*.05, y: T*.11, z:  T*.22 }));

    stampFace(g, 0, T*.42, T*.27, T*.65);

    // Floating poison bubble on top (frosted glass orb)
    const bubbleMat = new THREE.MeshPhysicalMaterial({
      color: 0xA8FF78, transmission: 0.65, opacity: 0.9,
      transparent: true, roughness: 0.2, ior: 1.3
    });
    const bubble = new THREE.Mesh(G.sphere(T*.13, 8), bubbleMat);
    bubble.position.set(T*.1, T*.74, T*.04);
    g.add(bubble);

    // Dark natto bean speckles scattered across the surface
    const beanMat = std(P.slimeDark);
    g.add(mk(G.box(T*.07, T*.07, T*.07), beanMat, { x:  T*.14, y: T*.54, z:  T*.2 }));
    g.add(mk(G.box(T*.07, T*.07, T*.07), beanMat, { x: -T*.16, y: T*.57, z:  T*.14 }));
    g.add(mk(G.box(T*.07, T*.07, T*.07), beanMat, { x:  T*.04, y: T*.5,  z: -T*.2 }));

    return g;
  }

  // ============================================================
  //  🍋  YUZU TOWER  →  Citrus Burst Nova
  // ============================================================
  function yuzu(T) {
    const g = new THREE.Group();

    // Bright golden-yellow yuzu citrus sphere
    const yuzuMat = std(0xFFD166, { roughness: 0.55 });
    g.add(mk(G.sphere(T*.38, 14), yuzuMat, { y: T*.40 }));

    // Lighter highlight at the top (the pale navel end of a yuzu)
    g.add(mk(G.sphere(T*.17, 8), std(0xFFEE9E), { y: T*.68 }));

    // Kawaii face on the front
    stampFace(g, 0, T*.42, T*.38, T*.58);

    // Matcha green leaf
    const leafMat = std(P.matcha);
    const leaf = mk(G.box(T*.26, T*.05, T*.16), leafMat, { x: T*.10, y: T*.77, z: -T*.08, ry: 0.4, rz: 0.12 });
    g.add(leaf);

    // Leaf stem
    g.add(mk(G.cyl(T*.025, T*.025, T*.10, 5), leafMat, { y: T*.71, rz: 0.25 }));

    // Orange-peel texture bumps on visible surface
    const bumpMat = std(0xFFA825);
    [
      { x:  T*.26, y: T*.32, z:  T*.25 },
      { x: -T*.28, y: T*.40, z:  T*.22 },
      { x:  T*.10, y: T*.20, z:  T*.34 },
    ].forEach(pos => g.add(mk(G.sphere(T*.04, 4), bumpMat, pos)));

    return g;
  }

  // ============================================================
  //  ⚡  KAMINARI TOWER  →  Thunder Storm Onigiri
  // ============================================================
  function kaminari(T) {
    const g = new THREE.Group();

    // Dark storm-cloud cylinder body
    const stormMat = std(0x2D1B69, { roughness: 0.28, metalness: 0.24 });
    g.add(mk(G.cyl(T*.36, T*.40, T*.36, 10), stormMat, { y: T*.30 }));

    // Flattened sphere cap on top — cumulonimbus puff
    const cap = mk(G.sphere(T*.40, 12), stormMat, { y: T*.48 });
    cap.scale.y = 0.42;
    g.add(cap);

    // Kawaii face on the cylinder front (white eyes for storm look)
    stampFace(g, 0, T*.28, T*.39, T*.64, 0xffffff);

    // Purple lightning bolt (two offset boxes forming a zigzag)
    const boltMat = glow(0x8B5CF6, 2.6);
    g.add(mk(G.box(T*.06, T*.26, T*.06), boltMat, { x:  T*.10, y: T*.60, rz:  0.50 }));
    g.add(mk(G.box(T*.06, T*.20, T*.06), boltMat, { x: -T*.04, y: T*.32, rz: -0.45 }));

    // Electric violet glow ring at the base
    const glowRing = mk(G.cyl(T*.42, T*.42, T*.04, 10), glow(0x8B5CF6, 1.6), { y: T*.13 });
    g.add(glowRing);
    g.userData.glowRing = glowRing;

    // Floating static spark dots around the cloud cap
    const sparkMat = glow(P.glowYellow, 2.4);
    const sparkBasePositions = [
      { x:  T*.30, y: T*.56, z:  T*.18 },
      { x: -T*.26, y: T*.60, z:  T*.20 },
      { x:  T*.16, y: T*.62, z: -T*.26 },
    ];
    const sparks = sparkBasePositions.map(pos => {
      const s = mk(G.sphere(T*.05, 5), sparkMat, pos);
      g.add(s);
      return s;
    });
    g.userData.sparks = sparks;
    g.userData.sparkBasePositions = sparkBasePositions;

    return g;
  }

  // ──────────────────────────────────────────────────────────
  //  ANIMATION & COMBAT HOOKS
  // ──────────────────────────────────────────────────────────

  function animateEnemy(enemy, dt) {
    if (enemy.speed > 0) {
      const type = enemy.enemyType;
      const d = enemy.distanceTraveled;
      
      let hopY = 0;
      let rotZ = 0;
      let rotX = 0;
      let rotY = 0;
      let offsetZ = 0; // Local z offset, forward is negative

      if (type === 'kurage') {
        // Gecko: low crawl — body sways gently, legs stride fore-aft in diagonal gait
        hopY = 0;
        // Subtle body rock so the whole animal feels alive
        rotX = Math.sin(d * 9) * 0.022;
        rotZ = Math.sin(d * 9) * 0.022;
        if (enemy.legs) {
          // FL+BR share phase 0; FR+BL share phase π — classic diagonal crawl (trot)
          const phases = [0, Math.PI, Math.PI, 0];
          enemy.legs.forEach((leg, i) => {
            const phase = d * 9 + phases[i];
            // Primary stride: Y rotation sweeps the outward leg forward and back
            // This is the motion that actually looks like walking on a lizard
            leg.rotation.y = Math.sin(phase) * 0.60;
            // Foot lift during the forward half of the stride (swing phase)
            leg.rotation.x = Math.max(0, Math.sin(phase)) * 0.30;
            // Keep the outward-downward lean constant
            leg.rotation.z = leg.userData.baseRz;
          });
        }
      } else if (type === 'gyoza') {
        // Crab: sideways walk, scuttling legs, snapping claws
        hopY = Math.abs(Math.sin(d * 10)) * 0.04;
        rotY = -Math.PI / 2; // Walk sideways!

        if (enemy.legs) {
          enemy.legs.forEach((leg, i) => {
            const phase = d * 18 + (i % 2 === 0 ? 0 : Math.PI);
            leg.rotation.z = leg.userData.baseRz + Math.sin(phase) * 0.3;
            leg.rotation.x = Math.cos(phase) * 0.2;
          });
        }

        if (enemy.claws) {
          enemy.claws.forEach((claw, ci) => {
            const phase = d * 3 + ci * Math.PI;
            const snap = Math.max(0, Math.sin(phase));
            claw.rotation.x = claw.userData.baseRx - snap * 0.2;
            if (claw.userData.fingerU) claw.userData.fingerU.rotation.x = -0.4 + snap * 0.3;
            if (claw.userData.fingerL) claw.userData.fingerL.rotation.x =  0.4 - snap * 0.3;
          });
        }
      } else if (type === 'tarabagani') {
        // King Crab: same sideways scuttle as gyoza, heavier slower rhythm
        hopY = Math.abs(Math.sin(d * 7)) * 0.05;
        rotY = -Math.PI / 2;

        if (enemy.legs) {
          enemy.legs.forEach((leg, i) => {
            const phase = d * 12 + (i % 2 === 0 ? 0 : Math.PI);
            leg.rotation.z = leg.userData.baseRz + Math.sin(phase) * 0.3;
            leg.rotation.x = Math.cos(phase) * 0.2;
          });
        }

        if (enemy.claws) {
          enemy.claws.forEach((claw, ci) => {
            const phase = d * 2 + ci * Math.PI;
            const snap = Math.max(0, Math.sin(phase));
            claw.rotation.x = claw.userData.baseRx - snap * 0.25;
            if (claw.userData.fingerU) claw.userData.fingerU.rotation.x = -0.4 + snap * 0.35;
            if (claw.userData.fingerL) claw.userData.fingerL.rotation.x =  0.4 - snap * 0.35;
          });
        }
      } else if (type === 'warabi') {
        // Rat: quick scurry that touches ground — bounces up then lands
        hopY = Math.max(0, Math.sin(d * 14)) * 0.06;
        rotZ = Math.sin(d * 14) * 0.08;
        rotY = Math.sin(d * 7) * 0.06;
      } else if (type === 'tamagoyaki' || type === 'yamata') {
        // Centipede / dragon centipede: per-segment lateral slither
        hopY = 0;
        if (enemy.centipedeSegments) {
          const freq   = type === 'yamata' ? 3.0 : 5.0;
          const amp    = enemy.modelScale * (type === 'yamata' ? 0.30 : 0.20);
          const legOff = enemy.modelScale * (type === 'yamata' ? 0.35 : 0.25);
          enemy.centipedeSegments.forEach((info, i) => {
            const xOff = Math.sin(d * freq + i * 1.0) * amp;
            info.seg.position.x = xOff;
            info.legs[0].position.x = -legOff + xOff;
            info.legs[1].position.x =  legOff + xOff;
          });
        }
      } else if (type === 'nerikiri') {
        // Grasshopper: spot to spot hopping using engine speed phasing.
        const cycleDist = 2.5; 
        
        // Since distanceTraveled pauses during the sit phase, 
        // jumpProgress gracefully scales from 0 to 1 during the move.
        const jumpProgress = (d % cycleDist) / cycleDist; 
        
        // Completely remove the offsetZ compensations
        offsetZ = 0; 
        
        // High jump naturally tied to the physical burst frame
        hopY = Math.sin(jumpProgress * Math.PI) * (1.2 * (enemy.mesh.scale.x || 1));
        rotX = -Math.sin(jumpProgress * Math.PI) * 0.3;
      } else if (type === 'daigamo') {
        // Colossal duck: slow lumbering waddle — heavy body drop, side-to-side rock
        hopY = Math.abs(Math.sin(d * 4.5)) * 0.12;
        rotZ = Math.sin(d * 4.5) * 0.08;
        rotX = Math.sin(d * 9) * 0.03;
      } else if (type === 'oodako') {
        // Giant octopus: body bobs gently, tentacles ripple in a wave
        rotY = Math.PI; // model authored facing -Z — flip to face travel direction
        hopY = Math.sin(d * 4) * 0.06 + 0.04;
        rotX = Math.sin(d * 3.5) * 0.04;
        if (enemy.tentacles) {
          enemy.tentacles.forEach(tent => {
            const phase = d * 5 + tent.userData.phase;
            tent.rotation.x = Math.sin(phase) * 0.35;
            tent.rotation.z = Math.cos(phase) * 0.25;
          });
        }
      } else if (type === 'gashadokuro') {
        // Skeleton: stiff heavy stomp with slight sway
        rotY = Math.PI; // model authored facing -Z — flip to face travel direction
        hopY = Math.abs(Math.sin(d * 5)) * 0.07;
        rotZ = Math.sin(d * 5) * 0.04;
        rotX = Math.sin(d * 10) * 0.02;
      } else if (type === 'bakedanuki') {
        // Tanuki: waddling bounce, belly swaying side to side
        rotY = Math.PI; // model authored facing -Z — flip to face travel direction
        hopY = Math.abs(Math.sin(d * 6)) * 0.09;
        rotZ = Math.sin(d * 6) * 0.10;
        rotX = Math.sin(d * 12) * 0.03;
      } else if (type === 'raiju') {
        // Thunder wolf: fast gallop with high bounce and leg stride
        hopY = Math.abs(Math.sin(d * 11)) * 0.10;
        rotX = Math.sin(d * 11) * 0.08;
        rotZ = Math.sin(d * 5.5) * 0.05;
        if (enemy.legs) {
          enemy.legs.forEach((leg, i) => {
            const phase = d * 11 + (i >= 2 ? Math.PI : 0);
            leg.rotation.x = Math.sin(phase) * 0.5;
          });
        }
      } else {
        // Default hop
        const lowHopTypes = ['mochi', 'takoyaki', 'onigiri', 'oni'];
        const animScale = lowHopTypes.includes(type) ? 0.25 : 1.0;
        hopY = Math.abs(Math.sin(d * 8 * animScale)) * 0.3 * animScale;
        rotZ = Math.sin(d * 4 * animScale) * 0.05;
      }

      enemy.visualGroup.position.set(0, (enemy.baseHeight || 0) + hopY, offsetZ);
      enemy.visualGroup.rotation.set(rotX, rotY, rotZ);
    }

    // Hit flash decay
    if (enemy.flashTimer > 0) {
      enemy.flashTimer -= dt;
      if (enemy.flashTimer <= 0) {
        enemy.flashTimer = 0;
        if (enemy.body?.material) {
          enemy.body.material.emissiveIntensity = 0;
        }
      }
    }

    // Boss scanner light pulsing
    if (enemy.scanner) {
      const time = clock.elapsedTime * 5; // engine clock — consistent time source
      enemy.scanner.material.emissiveIntensity = 1 + Math.sin(time) * 0.8;
    }
  }

  function addUpgradeVisual(tower, level, T) {
    // Scale the tower up on each upgrade tier — no color mutation so placed
    // towers always match their sidebar icons.
    const scale = level >= 2 ? 1.25 : 1.12;
    tower.group.scale.setScalar(scale);
  }

  function animateTowerIdle(tower, dt) {
    if (!tower.head) return;
    const time = clock.elapsedTime * 2; // engine clock — consistent time source

    // Per-tower head animations
    if (tower.data.id === 'beam') {
      if (tower.attackPoseTimer === undefined) tower.attackPoseTimer = 0;
      if (tower.attackPoseTimer > 0) tower.attackPoseTimer = Math.max(0, tower.attackPoseTimer - dt);

      const isFiring = tower.beamActiveTimer > 0 || tower.attackPoseTimer > 0;
      const targetY = isFiring ? -0.08 : Math.sin(time * 1.5) * 0.05;
      tower.head.position.y += (targetY - tower.head.position.y) * Math.min(1, dt * 14);

      if (!isFiring) {
        tower.head.rotation.y += dt * 0.5;
      }
      tower.head.scale.x += (1 - tower.head.scale.x) * Math.min(1, dt * 3);
      tower.head.scale.y += (1 - tower.head.scale.y) * Math.min(1, dt * 3);
      tower.head.scale.z += (1 - tower.head.scale.z) * Math.min(1, dt * 3);
    } else if (tower.data.id === 'dango') {
      tower.head.rotation.z = Math.sin(time * 1.2) * 0.06;
      tower.head.position.y = Math.sin(time * 0.8) * 0.025;
    } else if (tower.data.id === 'venom') {
      const pulse = 1 + Math.sin(time * 1.4) * 0.04;
      tower.head.scale.set(pulse, 1 / pulse, pulse);
    } else if (tower.data.id === 'yuzu') {
      tower.head.position.y = Math.sin(time) * 0.03;
      // Frame-driven squash recovery: starts popping back up immediately after
      // firing instead of holding the squat for the full generic 120ms hold.
      tower.head.scale.x += (1 - tower.head.scale.x) * Math.min(1, dt * 16);
      tower.head.scale.y += (1 - tower.head.scale.y) * Math.min(1, dt * 16);
      tower.head.scale.z += (1 - tower.head.scale.z) * Math.min(1, dt * 16);
    } else if (tower.data.id === 'kaminari') {
      // Gentle cloud hover
      tower.head.position.y = Math.sin(time * 1.1) * 0.04;

      // Fire discharge timer (advances only while playing → pause-safe). Replaces
      // the old setInterval/setTimeout-based kaminariFireAnim.
      const FIRE_DUR = 300; // ms
      let firing = false, fireMs = 0;
      if (tower.fireFxTimer != null) {
        tower.fireFxTimer += dt * 1000;
        fireMs = tower.fireFxTimer;
        firing = fireMs < FIRE_DUR;
        if (!firing) tower.fireFxTimer = null;
      }

      // Squash & stretch recovery toward neutral (squash is set on fire). Always
      // lerps toward 1, so it is a no-op once recovered.
      tower.head.scale.x += (1 - tower.head.scale.x) * Math.min(1, dt * 12);
      tower.head.scale.y += (1 - tower.head.scale.y) * Math.min(1, dt * 12);
      tower.head.scale.z += (1 - tower.head.scale.z) * Math.min(1, dt * 12);

      // Floating spark orbit (+ discharge burst when firing)
      const sparks  = tower.head.userData?.sparks;
      const basePos = tower.head.userData?.sparkBasePositions;
      if (sparks && basePos) {
        sparks.forEach((spark, i) => {
          const b = basePos[i];
          let px = b.x + Math.sin(time * 1.8 + i * 2.1) * 0.07;
          let py = b.y + Math.sin(time * 2.4 + i * 1.7) * 0.06;
          let pz = b.z + Math.cos(time * 1.5 + i * 2.4) * 0.07;
          // Discharge: each spark flies outward then snaps back (staggered per spark)
          if (firing) {
            const localT = fireMs - i * 22;
            if (localT > 0 && localT < 85) {
              const len = Math.hypot(b.x, b.z) || 1;
              px = b.x + (b.x / len) * 0.45;
              py = b.y + 0.10;
              pz = b.z + (b.z / len) * 0.45;
            }
          }
          spark.position.set(px, py, pz);
        });
        // Glow ring: Tesla-coil discharge surge when firing, gentle pulse otherwise
        const ring = tower.head.userData.glowRing;
        if (ring?.material) {
          if (firing) {
            const p = fireMs / 260;
            ring.material.emissiveIntensity = p >= 1 ? 1.6 : 7.0 * Math.pow(1 - p, 1.5) + 1.6;
          } else {
            ring.material.emissiveIntensity = 1.6 + Math.sin(time * 2.8) * 0.5;
          }
        }
      }
    } else {
      tower.head.position.y = Math.sin(time) * 0.03;
    }

    if (tower.isIdle && tower.data.id !== 'beam') {
      if (tower.eyeCheckTimer === undefined) tower.eyeCheckTimer = 0;
      tower.eyeCheckTimer += dt;
      
      const ry = tower.head.rotation.y;
      const hX = Math.sin(ry);
      const hZ = Math.cos(ry);
      
      let spawnX = 0, spawnZ = 0;
      let bestDist = Infinity;
      if (typeof allPathNodes !== 'undefined') {
        for (const pNodes of allPathNodes) {
          if (pNodes.length > 0) {
            const sn = pNodes[0];
            const d2 = (sn.x - tower.pos.x)**2 + (sn.z - tower.pos.z)**2;
            if (d2 < bestDist) {
              bestDist = d2;
              spawnX = sn.x;
              spawnZ = sn.z;
            }
          }
        }
      }

      // Add a persistent random offset for each tower so they don't look identically uniform
      if (tower.idleLookOffsetX === undefined) {
        tower.idleLookOffsetX = (Math.random() - 0.5) * 16;
        tower.idleLookOffsetZ = (Math.random() - 0.5) * 16;
      }

      const dx = (spawnX + tower.idleLookOffsetX) - tower.pos.x;
      const dz = (spawnZ + tower.idleLookOffsetZ) - tower.pos.z;
      const dist = Math.sqrt(dx*dx + dz*dz) || 1;
      const toTargetX = dx / dist;
      const toTargetZ = dz / dist;
      
      const isVisible = (hX * toTargetX + hZ * toTargetZ) > 0.7;

      if (tower.eyeCheckTimer >= 1.0) {
        tower.eyeCheckTimer = 0;
        if (!isVisible && !tower.isSearchingForCamera) {
          if (Math.random() < 0.70) {
            tower.isSearchingForCamera = true;
            // set a longer random duration for the spin (up to 4 seconds)
            tower.searchSpinDuration = Math.random() * 3.0 + 1.0; 
            
            const turnDir = Math.sign(hZ * toTargetX - hX * toTargetZ) || 1;
            tower.searchSpinSpeed = turnDir * (0.05 + Math.random() * 0.1);
          }
        }
      }

      if (tower.isSearchingForCamera) {
        tower.head.rotation.y += tower.searchSpinSpeed * dt;
        tower.searchSpinDuration -= dt;
        if (tower.searchSpinDuration <= 0) {
          tower.isSearchingForCamera = false;
        }
      }
    } else {
       tower.isSearchingForCamera = false;
    }

    // Idle sway: gentle full-tower wobble when no enemies are in range.
    // Uses tower.isIdle flag set by main.js. Smoothly interpolates the
    // group's Z rotation toward the target sway angle.
    const swayPhase = time * 0.65 + (tower.pos.x + tower.pos.z) * 0.5; // offset by position so towers don't sync
    const targetZ = tower.isIdle ? Math.sin(swayPhase) * 0.09 : 0;
    // Fast snap for non-idle (0), instant tracking for idle sway so no sluggish start/stop
    const lerpSpeed = tower.isIdle ? 15 : 15; 
    tower.group.rotation.z += (targetZ - tower.group.rotation.z) * Math.min(1, dt * lerpSpeed);
  }

  // ─── KAMINARI FIRE ANIMATION ───────────────────────────────────────────────
  // Called at shoot time. Sets the squash pose and starts a fire-FX timer; the
  // discharge (glow surge + spark burst + squash recovery) is driven per-frame in
  // animateTowerIdle so it is pause-aware and leaves no orphan setInterval/setTimeout.
  function kaminariFireAnim(tower) {
    if (!tower.head) return;
    tower.head.scale.set(1.18, 0.65, 1.18); // dramatic squash & stretch
    tower.fireFxTimer = 0;                   // ms; advanced in animateTowerIdle
  }

  function aimTower(tower, targetPos, dt) {
    if (!tower.head) return;

    // Compute horizontal bearing directly — avoids Euler decomposition issues
    // that arise from dummy.lookAt when there is a height difference between
    // tower.pos.y and the enemy's y.  atan2(dx, dz) gives the exact rotation.y
    // needed to point a +Z-facing model at the target in the XZ plane.
    const dx = targetPos.x - tower.pos.x;
    const dz = targetPos.z - tower.pos.z;
    const targetAngle = Math.atan2(dx, dz);

    if (tower.data.id === 'beam') {
      let delta = targetAngle - tower.head.rotation.y;
      while (delta >  Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const step = tower.data.turnSpeed * dt;
      tower.head.rotation.y += Math.abs(delta) <= step ? delta : Math.sign(delta) * step;
      return;
    }

    // Smooth turning: find shortest angular path, clamp by turn speed
    let diff = targetAngle - tower.head.rotation.y;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const maxTurn = (tower.data.turnSpeed ?? 4.0) * dt;
    tower.head.rotation.y += Math.max(-maxTurn, Math.min(maxTurn, diff));
  }

  function triggerTowerFire(tower) {
    if (!tower.head) return;

    // Beam fires continuously, so repeated squash causes visible laser bobbing.
    // Kaminari runs its own frame-driven squash/recovery in animateTowerIdle.
    if (tower.data?.id === 'beam' || tower.data?.id === 'kaminari') return;
    
    // Blocky squash and stretch
    tower.head.scale.set(1.1, 0.75, 1.1);

    // Yuzu recovers frame-by-frame in animateTowerIdle — no hold, pops up sooner.
    if (tower.data?.id === 'yuzu') return;

    setTimeout(() => {
      if (tower.head) tower.head.scale.set(1, 1, 1);
    }, 120);
  }
  
  function buildMiniMissile() {
    const g = new THREE.Group();

    // Glossy polycarbonate body matching the tower
    const glossMat = new THREE.MeshPhysicalMaterial({
      color: P.pearlWhite, metalness: 0.08, roughness: 0.12,
      clearcoat: 1.0, clearcoatRoughness: 0.08
    });
    g.add(mk(G.cyl(0.10, 0.10, 0.30, 20), glossMat, { y: 0 }));

    // Rounded bottom sphere cap — capsule tail
    g.add(mk(G.sphere(0.10, 12), glossMat, { y: -0.15 }));

    // Space Gray anodized nose cone — top of body at y=0.15, cone base there
    const anoMat = new THREE.MeshStandardMaterial({
      color: P.spaceGray, metalness: 0.72, roughness: 0.38
    });
    g.add(mk(G.cyl(0, 0.10, 0.20, 20), anoMat, { y: 0.25 }));

    // Tiny mochi-pink fins at the tail
    g.add(mk(G.box(0.055, 0.09, 0.04), std(P.mochiPink), { x: -0.13, y: -0.10 }));
    g.add(mk(G.box(0.055, 0.09, 0.04), std(P.mochiPink), { x:  0.13, y: -0.10 }));

    // Cyan clean-energy exhaust
    const cyanMat = new THREE.MeshStandardMaterial({
      color: P.phantomCyan, emissive: P.phantomCyan, emissiveIntensity: 2.0,
      transparent: true, opacity: 0.90
    });
    g.add(mk(G.cyl(0.05, 0.08, 0.09, 16), cyanMat, { y: -0.25 }));

    // lookAt points the Z-axis — rotate inner group so missile points forward
    const wrapper = new THREE.Group();
    g.rotation.x = Math.PI / 2;
    wrapper.add(g);

    return wrapper;
  }

  // ──────────────────────────────────────────────────────────
  //  PUBLIC API
  // ──────────────────────────────────────────────────────────
  return {
    buildTowerHead,
    applyEnemyStyle,
    animateEnemy,
    animateTowerIdle,
    aimTower,
    triggerTowerFire,
    kaminariFireAnim,
    buildMiniMissile,
    addUpgradeVisual
  };

})();


;