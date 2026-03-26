// ORV Game - Main Entry Point
// Initializes all systems, manages scenes, runs the game loop

(function() {
'use strict';

// ============================================================
// SCENE MANAGER
// ============================================================
const SceneManager = {
    current: 'loading',
    transitions: {},
    change(scene) {
        this.current = scene;
        document.querySelectorAll('.scene').forEach(el => el.classList.remove('active'));
        const el = document.getElementById(`scene-${scene}`);
        if (el) el.classList.add('active');
        EventSystem.emit(EventSystem.EVENTS.SCENE_CHANGE, { scene });
    }
};

// ============================================================
// GAME STATE
// ============================================================
window.GameState = {
    player: null,
    world: WorldSystem,
    paused: false,
    pauseReason: null,
    running: false,
    playtimeMs: 0,
    scene: 'loading',

    setPaused(v, reason) {
        this.paused = v;
        this.pauseReason = reason || null;
    },

    isPaused() {
        return this.paused || DialogueSystem.isActive() || StorySystem.isCutsceneActive();
    }
};

// ============================================================
// PLAYER ENTITY
// ============================================================
function createPlayer() {
    const cfg = GameConfig.player;
    const charDef = CharactersData.getCharacter('kim_dokja');
    const stats = StatsSystem.createStats({
        STR: cfg.startStats.STR, AGI: cfg.startStats.AGI,
        END: cfg.startStats.END, INT: cfg.startStats.INT,
        LCK: cfg.startStats.LCK, PER: cfg.startStats.PER
    });
    StatsSystem.compute(stats, 1);
    stats.HP = stats.maxHP;
    stats.MP = stats.maxMP;
    stats.SP = stats.maxSP;

    const player = {
        // Identity
        name: cfg.name,
        class: charDef?.class || 'reader',
        title: null,
        titles: [],
        // Position
        x: 200, y: 300,
        width: 36, height: 48,
        vx: 0, vy: 0,
        // Stats
        stats,
        level: 1,
        exp: 0,
        // State
        alive: true,
        isPlayer: true,
        facing: 1,
        moving: false,
        attacking: false,
        attackCooldown: 0,
        dodgeCooldown: 0,
        dodging: false,
        dodgeTimer: 0,
        invincibleTimer: 0,
        interactCooldown: 0,
        // Animation
        animator: AnimationSystem.createAnimator('player', 'idle'),
        // Physics
        physBody: null,
        // Combat
        statusEffects: [],
        buffs: [],
        resistances: {},
        // Reader-specific
        narrativeKnowledge: {},
        readScenarios: [],
        // Methods
        gainExp(amount) { LevelingSystem.gainExp(this, amount); },
        addTitle(title) {
            this.titles.push(title);
            this.title = title;
            EventSystem.emit(EventSystem.EVENTS.SYSTEM_MESSAGE, {
                text: `[Title Acquired] ${title}`,
                type: 'system', duration: 3000
            });
        }
    };

    // Create physics body
    player.physBody = PhysicsSystem.createBody({
        x: player.x, y: player.y,
        width: player.width, height: player.height,
        layer: PhysicsSystem.collisionLayers.PLAYER,
        mask: PhysicsSystem.collisionLayers.ENEMY | PhysicsSystem.collisionLayers.TERRAIN | PhysicsSystem.collisionLayers.NPC,
        solid: true, maxSpeed: 350,
        owner: player
    });

    return player;
}

// ============================================================
// GAME LOOP
// ============================================================
let lastTime = 0;
let animFrameId = null;
let fixedAccum = 0;
const FIXED_DT = 1/60;
const MAX_DT = 0.1;

function gameLoop(timestamp) {
    animFrameId = requestAnimationFrame(gameLoop);
    const raw = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    const dt = Math.min(raw, MAX_DT);

    if (GameState.running) {
        GameState.playtimeMs += dt * 1000;
        if (!GameState.isPaused()) {
            update(dt);
        } else if (DialogueSystem.isActive()) {
            DialogueSystem.update(dt);
        }
        render();
    }
}

function update(dt) {
    const player = GameState.player;
    if (!player) return;

    // --- Input → Player movement ---
    updatePlayerMovement(player, dt);

    // --- Player attack ---
    updatePlayerCombat(player, dt);

    // --- Stats regen ---
    StatsSystem.applyRegen(player.stats, dt);
    StatsSystem.clamp(player.stats);

    // --- Status effects ---
    CombatSystem.updateStatuses(player, dt);
    CombatSystem.updateBuffs(player, dt);

    // --- Invincibility frames ---
    if (player.invincibleTimer > 0) player.invincibleTimer -= dt;
    if (player.dodgeTimer > 0) {
        player.dodgeTimer -= dt;
        if (player.dodgeTimer <= 0) { player.dodging = false; player.invincibleTimer = 0; }
    }

    // --- Physics ---
    if (player.physBody) {
        player.physBody.x = player.x;
        player.physBody.y = player.y;
        player.physBody.vx = player.vx;
        player.physBody.vy = player.vy;
    }
    PhysicsSystem.update(dt);
    if (player.physBody) {
        player.x = player.physBody.x;
        player.y = player.physBody.y;
        player.vx = player.physBody.vx;
        player.vy = player.physBody.vy;
    }

    // --- World entities ---
    const enemies = WorldSystem.getEnemies();
    WorldSystem.update(dt, player);
    CompanionSystem.update(dt, player, enemies);

    // --- Skill cooldowns ---
    SkillSystem.update(dt);

    // --- Systems ---
    ScenarioSystem.update(dt);
    StorySystem.update(dt);

    // --- Camera ---
    CameraSystem.setTarget(player.x + player.width/2, player.y + player.height/2);
    CameraSystem.update(dt);

    // --- Particles ---
    ParticleSystem.update(dt);

    // --- Animation ---
    AnimationSystem.update(player.animator, dt);

    // --- HUD updates ---
    LevelingSystem.updatePlayerHUD(player);

    // --- Player death ---
    if (player.alive && player.stats.HP <= 0) {
        player.alive = false;
        handlePlayerDeath();
    }
}

function updatePlayerMovement(player, dt) {
    const move = InputSystem.getMovementVector();
    const speed = player.stats.SPEED + (player.dodging ? 200 : 0);

    // Step particles
    if (Math.abs(move.x) > 0.1 || Math.abs(move.y) > 0.1) {
        player.vx = move.x * speed;
        player.vy = move.y * speed;
        player.facing = move.x !== 0 ? Math.sign(move.x) : player.facing;
        player.animator.flipX = player.facing < 0;
        player.moving = true;
        if (Math.random() < 0.15) {
            ParticleSystem.emit('step_dust', player.x + player.width/2, player.y + player.height - 4);
        }
        AnimationSystem.play(player.animator, 'run');
    } else {
        player.vx *= 0.5;
        player.vy *= 0.5;
        player.moving = false;
        AnimationSystem.play(player.animator, 'idle');
    }

    // Dodge roll
    if (InputSystem.isActionDown('dodge') && player.dodgeCooldown <= 0) {
        player.dodging = true;
        player.dodgeTimer = 0.35;
        player.invincibleTimer = 0.3;
        player.dodgeCooldown = 1.2;
        player.vx = move.x !== 0 ? move.x * 500 : player.facing * 500;
        player.vy = move.y !== 0 ? move.y * 400 : 0;
        ParticleSystem.emit('step_dust', player.x + player.width/2, player.y + player.height);
        AudioSystem.playSFX('skill');
    }
    if (player.dodgeCooldown > 0) player.dodgeCooldown -= dt;
    if (player.attackCooldown > 0) player.attackCooldown -= dt;
    if (player.interactCooldown > 0) player.interactCooldown -= dt;
}

function updatePlayerCombat(player, dt) {
    // Basic attack
    if (InputSystem.isActionDown('attack') && player.attackCooldown <= 0 && !player.dodging) {
        performPlayerAttack(player);
    }

    // Skill hotkeys
    const slots = SkillSystem.getSkillSlots();
    if (InputSystem.isActionDown('skill1') && slots[0]) SkillSystem.useSkill(slots[0], player, getEnemiesInAttackRange(player));
    if (InputSystem.isActionDown('skill2') && slots[1]) SkillSystem.useSkill(slots[1], player, getEnemiesInAttackRange(player));
    if (InputSystem.isActionDown('skill3') && slots[2]) SkillSystem.useSkill(slots[2], player, getEnemiesInAttackRange(player));

    // Interact
    if (InputSystem.isActionDown('interact') && player.interactCooldown <= 0) {
        player.interactCooldown = 0.5;
        WorldSystem.interactWithNearest(player);
    }
}

function performPlayerAttack(player) {
    const range = 70;
    const targets = getEnemiesInAttackRange(player, range);
    player.attackCooldown = 0.5;
    AnimationSystem.play(player.animator, 'attack', true, () => AnimationSystem.play(player.animator, 'idle'));

    if (targets.length === 0) {
        AudioSystem.playSFX('miss');
        return;
    }

    targets.forEach(target => {
        const dmg = Math.floor(player.stats.ATK * (0.9 + Math.random() * 0.3));
        CombatSystem.applyDamage(target, dmg, 'physical', player);
    });

    ConstellationSystem.reactToAction('kill_count', targets.length);
    EventSystem.emit(EventSystem.EVENTS.PLAYER_ATTACK, { targets: targets.length });
}

function getEnemiesInAttackRange(player, range) {
    const r = range || 70;
    const cx = player.x + player.width/2 + player.facing * r * 0.3;
    const cy = player.y + player.height/2;
    return WorldSystem.getEnemiesInRadius(cx, cy, r).filter(e => e.alive);
}

// ============================================================
// RENDER
// ============================================================
let canvas = null;
let ctx = null;

function render() {
    if (!canvas || !ctx) return;
    const player = GameState.player;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = '#040408';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply camera
    CameraSystem.apply(ctx);

    // World (floor + entities)
    WorldSystem.draw(ctx, CameraSystem);

    // Draw player
    if (player && player.alive) {
        drawPlayer(ctx, player);
    }

    // Companions
    CompanionSystem.draw(ctx);

    // Particles
    ParticleSystem.draw(ctx);

    // Restore camera
    CameraSystem.restore(ctx);

    // Minimap
    Minimap.draw(player, WorldSystem);
}

function drawPlayer(ctx, player) {
    ctx.save();
    // Invincibility flash
    if (player.invincibleTimer > 0 && Math.floor(player.invincibleTimer * 10) % 2 === 0) {
        ctx.globalAlpha = 0.4;
    }
    // Dodge ghost trail
    if (player.dodging) {
        ctx.globalAlpha = 0.7;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#4a9eff';
    }
    AnimationSystem.draw(ctx, player.animator, player.x, player.y, player.width, player.height);

    // Aura for active buffs
    if (CombatSystem.hasBuff(player, 'omniscience')) {
        ctx.shadowBlur = 25;
        ctx.shadowColor = '#c8a951';
        ctx.strokeStyle = '#c8a95188';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(player.x + player.width/2, player.y + player.height/2, player.width * 0.7, 0, Math.PI*2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    ctx.restore();

    // Status icons above player
    if (player.statusEffects.length > 0) {
        player.statusEffects.forEach((s, i) => {
            const def = CombatSystem.getStatusDef(s.id);
            ctx.fillStyle = def.color || '#fff';
            ctx.font = '12px sans-serif';
            ctx.fillText(def.icon || '?', player.x + i * 13, player.y - 15);
        });
    }
}

// ============================================================
// PLAYER DEATH / GAME OVER
// ============================================================
function handlePlayerDeath() {
    AudioSystem.playSFX('death');
    AudioSystem.fadeOutMusic(2000);
    ParticleSystem.emit('death_enemy', GameState.player.x + 18, GameState.player.y + 24);
    CameraSystem.shake(15, 1.0);
    EventSystem.emit(EventSystem.EVENTS.PLAYER_DEATH, {});
    GameState.setPaused(true, 'death');

    setTimeout(() => {
        const go = document.getElementById('game-over');
        if (go) go.classList.add('show');
    }, 2000);
}

// ============================================================
// PAUSE MENU
// ============================================================
function togglePause() {
    if (GameState.pauseReason && GameState.pauseReason !== 'manual') return;
    if (GameState.paused) {
        GameState.setPaused(false, null);
        document.getElementById('pause-menu')?.classList.remove('show');
        AudioSystem.unmute();
    } else {
        GameState.setPaused(true, 'manual');
        document.getElementById('pause-menu')?.classList.add('show');
    }
}

// ============================================================
// SAVE / LOAD
// ============================================================
function buildSaveState() {
    const p = GameState.player;
    return {
        version: '1.0.0',
        timestamp: Date.now(),
        playtime: GameState.playtimeMs,
        playerName: p.name,
        level: p.level,
        location: WorldSystem.getCurrentMapId(),
        scenario: ScenarioSystem.getCurrent()?.id || '',
        player: {
            x: p.x, y: p.y, level: p.level, exp: p.exp,
            stats: p.stats, name: p.name, class: p.class,
            title: p.title, titles: p.titles
        },
        world: WorldSystem.serialize(),
        quests: QuestSystem.serialize(),
        inventory: InventorySystem.serialize(),
        skills: SkillSystem.serialize(),
        companions: CompanionSystem.serialize(),
        constellations: ConstellationSystem.serialize(),
        scenarios: ScenarioSystem.serialize(),
        flags: {}
    };
}

function loadSaveState(data) {
    if (!data) return;
    const player = GameState.player;

    if (data.player) {
        player.x = data.player.x || 200;
        player.y = data.player.y || 300;
        player.level = data.player.level || 1;
        player.exp = data.player.exp || 0;
        player.name = data.player.name || 'Kim Dokja';
        player.class = data.player.class || 'reader';
        player.title = data.player.title || null;
        player.titles = data.player.titles || [];
        if (data.player.stats) Object.assign(player.stats, data.player.stats);
        StatsSystem.compute(player.stats, player.level);
        StatsSystem.clamp(player.stats);
    }

    if (data.world) WorldSystem.deserialize(data.world);
    if (data.quests) QuestSystem.deserialize(data.quests);
    if (data.inventory) InventorySystem.deserialize(data.inventory);
    if (data.skills) SkillSystem.deserialize(data.skills);
    if (data.companions) CompanionSystem.deserialize(data.companions);
    if (data.constellations) ConstellationSystem.deserialize(data.constellations);
    if (data.scenarios) ScenarioSystem.deserialize(data.scenarios);

    GameState.playtimeMs = data.playtime || 0;
    CameraSystem.snap(player.x + player.width/2, player.y + player.height/2);
    LevelingSystem.updatePlayerHUD(player);
}

// ============================================================
// UI BINDINGS
// ============================================================
function bindUI() {
    // Main menu
    document.getElementById('btn-new-game')?.addEventListener('click', startNewGame);
    document.getElementById('btn-load-game')?.addEventListener('click', () => {
        document.getElementById('save-load-panel')?.classList.add('open');
        populateSaveSlots('load');
    });
    document.getElementById('btn-settings')?.addEventListener('click', () => {
        document.getElementById('settings-panel')?.classList.add('open');
    });

    // Pause menu
    document.getElementById('pause-resume')?.addEventListener('click', togglePause);
    document.getElementById('pause-save')?.addEventListener('click', () => {
        document.getElementById('save-load-panel')?.classList.add('open');
        populateSaveSlots('save');
    });
    document.getElementById('pause-load')?.addEventListener('click', () => {
        document.getElementById('save-load-panel')?.classList.add('open');
        populateSaveSlots('load');
    });
    document.getElementById('pause-settings')?.addEventListener('click', () => {
        document.getElementById('settings-panel')?.classList.add('open');
    });
    document.getElementById('pause-menu-main')?.addEventListener('click', () => {
        location.reload();
    });

    // Close panels
    document.querySelectorAll('.panel-close').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.panel')?.classList.remove('open');
        });
    });

    // Pause event
    EventSystem.on(EventSystem.EVENTS.GAME_PAUSE, togglePause);

    // Player interact event
    EventSystem.on(EventSystem.EVENTS.PLAYER_INTERACT, () => {
        if (GameState.player) WorldSystem.interactWithNearest(GameState.player);
    });

    // Game over buttons
    document.getElementById('game-over-retry')?.addEventListener('click', () => {
        const autoSave = SaveSystem.getAutosaveInfo();
        if (autoSave) SaveSystem.load('autosave');
        else startNewGame();
        document.getElementById('game-over')?.classList.remove('show');
        GameState.player.alive = true;
        GameState.player.stats.HP = GameState.player.stats.maxHP * 0.5;
        GameState.setPaused(false);
        AudioSystem.playMusic('exploration');
    });

    // Scene change (map transitions)
    EventSystem.on(EventSystem.EVENTS.SCENE_CHANGE, (data) => {
        if (data.targetMapId) {
            WorldSystem.loadMap(data.targetMapId);
            if (GameState.player && data.targetSpawn) {
                const map = WorldSystem.getCurrentMap();
                const spawn = map?.spawns?.[data.targetSpawn];
                if (spawn) { GameState.player.x = spawn.x; GameState.player.y = spawn.y; }
            }
        }
    });

    // Dialogue tap-to-advance
    document.getElementById('dialogue-panel')?.addEventListener('click', () => DialogueSystem.advance());
    document.getElementById('dialogue-continue')?.addEventListener('click', () => DialogueSystem.advance());

    // Settings
    bindSettings();

    // Inventory tabs
    document.querySelectorAll('.inventory-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.inventory-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            updateInventoryUI(tab.dataset.tab);
        });
    });
}

function populateSaveSlots(mode) {
    const container = document.getElementById('save-slots');
    if (!container) return;
    container.innerHTML = '';
    const slots = SaveSystem.getAllSlotInfo();
    slots.forEach((slot, i) => {
        const el = document.createElement('div');
        el.className = 'save-slot' + (slot ? ' occupied' : ' empty');
        el.innerHTML = slot
            ? `<div class="save-slot-title">Slot ${i+1} — Lv.${slot.level} ${slot.playerName}</div>
               <div class="save-slot-info">${slot.location} · ${SaveSystem.formatPlaytime(slot.playtime)}</div>
               <div class="save-slot-time">${slot.timestampStr}</div>`
            : `<div class="save-slot-title">Slot ${i+1} — Empty</div>`;
        el.addEventListener('click', () => {
            if (mode === 'save') {
                SaveSystem.save(i, buildSaveState());
                document.getElementById('save-load-panel')?.classList.remove('open');
            } else if (mode === 'load' && slot) {
                const data = SaveSystem.load(i);
                if (data) {
                    loadSaveState(data);
                    document.getElementById('save-load-panel')?.classList.remove('open');
                    if (!GameState.running) startGame();
                }
            }
        });
        container.appendChild(el);
    });
    // Title
    const title = document.getElementById('save-load-title');
    if (title) title.textContent = mode === 'save' ? 'Save Game' : 'Load Game';
}

function updateInventoryUI(tabType) {
    const grid = document.getElementById('inventory-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const items = InventorySystem.getInventoryByType(tabType);
    items.forEach(slot => {
        const def = ItemsData.getItem(slot.id);
        if (!def) return;
        const cell = document.createElement('div');
        cell.className = 'inventory-cell';
        const rColor = GameConfig.rarityColors?.[def.rarity] || '#888';
        cell.style.borderColor = rColor;
        cell.innerHTML = `
            <div class="item-icon" style="color:${rColor}">${def.icon || '▪'}</div>
            <div class="item-name">${def.name}</div>
            ${slot.quantity > 1 ? `<div class="item-qty">×${slot.quantity}</div>` : ''}
        `;
        cell.addEventListener('click', () => {
            showItemDetail(def, slot);
        });
        grid.appendChild(cell);
    });
}

function showItemDetail(def, slot) {
    const panel = document.getElementById('item-detail');
    if (!panel) return;
    const rColor = GameConfig.rarityColors?.[def.rarity] || '#888';
    panel.innerHTML = `
        <div style="color:${rColor};font-size:1.2em;font-weight:bold">${def.name}</div>
        <div style="color:${rColor};font-size:0.75em;letter-spacing:2px">${(def.rarity || 'common').toUpperCase()}</div>
        <div style="color:#aaa;margin-top:8px;font-size:0.9em">${def.description || ''}</div>
        ${def.stats ? `<div style="margin-top:8px;color:#88aaff;font-size:0.85em">${Object.entries(def.stats).map(([k,v]) => `${k}: +${v}`).join(' · ')}</div>` : ''}
        <div style="margin-top:12px;display:flex;gap:8px">
            ${def.usable ? `<button onclick="InventorySystem.useItem('${def.id}', GameState.player)" style="background:#0066cc;color:#fff;border:none;padding:6px 14px;cursor:pointer;font-family:Rajdhani">Use</button>` : ''}
            ${def.type === 'equipment' ? `<button onclick="InventorySystem.equip('${def.id}')" style="background:#004466;color:#fff;border:none;padding:6px 14px;cursor:pointer;font-family:Rajdhani">Equip</button>` : ''}
            <button onclick="InventorySystem.removeItem('${def.id}',1)" style="background:#330000;color:#fff;border:none;padding:6px 14px;cursor:pointer;font-family:Rajdhani">Discard</button>
        </div>
    `;
}

function bindSettings() {
    const savedSettings = SaveSystem.loadSettings();

    // Volume sliders
    ['master', 'music', 'sfx'].forEach(type => {
        const slider = document.getElementById(`volume-${type}`);
        if (!slider) return;
        if (savedSettings[`${type}Volume`] !== undefined) {
            slider.value = savedSettings[`${type}Volume`] * 100;
        }
        slider.addEventListener('input', () => {
            const v = slider.value / 100;
            if (type === 'master') AudioSystem.setMasterVolume(v);
            else if (type === 'music') AudioSystem.setMusicVolume(v);
            else AudioSystem.setSfxVolume(v);
            SaveSystem.saveSettings(AudioSystem.getSettings());
        });
    });

    // Graphics quality
    const qualitySelect = document.getElementById('graphics-quality');
    if (qualitySelect) {
        qualitySelect.value = savedSettings.quality || 'high';
        qualitySelect.addEventListener('change', () => {
            const q = qualitySelect.value;
            const quality = GameConfig.quality[q];
            ParticleSystem.setQuality(quality.particles ? 1 : 0.5);
            SaveSystem.saveSettings({ ...SaveSystem.loadSettings(), quality: q });
        });
    }
}

// ============================================================
// GAME START
// ============================================================
function startNewGame() {
    // Create player
    GameState.player = createPlayer();

    // Initialize all systems
    InventorySystem.init();
    SkillSystem.init();
    QuestSystem.init();
    CompanionSystem.init();
    ConstellationSystem.init();
    ScenarioSystem.init();

    // Give starting items
    InventorySystem.addItem('smartphone', 1);
    InventorySystem.addItem('subway_card', 1);
    InventorySystem.addItem('small_hp_potion', 3);
    InventorySystem.addItem('salary_mans_lunch', 2);

    // Learn starting skills
    SkillSystem.initStartingSkills(GameState.player.class);

    // Start in subway
    WorldSystem.loadMap(GameConfig.world.startLocation);
    GameState.player.x = 200;
    GameState.player.y = 300;
    CameraSystem.snap(GameState.player.x + 18, GameState.player.y + 24);

    startGame();

    // Intro cutscene + first scenario
    setTimeout(() => {
        StorySystem.playCutscene('intro_subway');
        setTimeout(() => ScenarioSystem.startScenario('scenario_01_three_ways'), 12000);
    }, 1000);

    // Start first quest
    setTimeout(() => QuestSystem.startQuest('mq_01'), 2000);
}

function startGame() {
    GameState.running = true;
    GameState.setPaused(false);

    // Switch to game scene
    document.getElementById('main-menu')?.classList.remove('active');
    document.getElementById('game-canvas')?.classList.add('active');
    document.getElementById('hud')?.classList.add('active');

    // Start autosave
    SaveSystem.setStateProvider(buildSaveState);
    SaveSystem.setStateLoader(loadSaveState);
    SaveSystem.startAutosave();

    AudioSystem.resume();
    AudioSystem.playMusic('exploration');

    LevelingSystem.updatePlayerHUD(GameState.player);
}

// ============================================================
// INITIALIZATION
// ============================================================
async function init() {
    // Get canvas
    canvas = document.getElementById('game-canvas');
    if (!canvas) { console.error('No game canvas!'); return; }
    ctx = canvas.getContext('2d');

    // Resize canvas
    function resizeCanvas() {
        const container = canvas.parentElement || document.body;
        const aspectW = 800, aspectH = 600;
        const scaleX = window.innerWidth / aspectW;
        const scaleY = window.innerHeight / aspectH;
        const scale = Math.min(scaleX, scaleY);
        canvas.style.width = `${aspectW * scale}px`;
        canvas.style.height = `${aspectH * scale}px`;
        canvas.width = aspectW;
        canvas.height = aspectH;
        CameraSystem.resize(canvas.width, canvas.height);
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Initialize engine systems
    EventSystem;  // Already initialized
    AudioSystem.init();
    AudioSystem.bindEvents();
    AudioSystem.preloadSFX();
    CameraSystem.init(canvas.width, canvas.height);
    InputSystem.init(canvas);
    InputSystem.detectMobile();
    Minimap.init();
    DialogueSystem.initUI();
    StorySystem.init();
    StorySystem.initNotifications();

    // Loading screen progress
    const progressBar = document.getElementById('loading-fill');
    const loadingText = document.getElementById('loading-text');
    let progress = 0;

    function tick(p, msg) {
        progress = p;
        if (progressBar) progressBar.style.width = `${p}%`;
        if (loadingText) loadingText.textContent = msg;
    }

    tick(10, 'Initializing game engine...');
    await sleep(100);
    tick(25, 'Loading scenario data...');
    await sleep(100);
    tick(40, 'Preparing world systems...');
    await sleep(100);
    tick(60, 'Loading character data...');
    await sleep(100);
    tick(75, 'Compiling skill trees...');
    await sleep(100);
    tick(90, 'Awaiting the dokkaebi...');
    await sleep(200);
    tick(100, 'Ready.');
    await sleep(300);

    // Show main menu
    document.getElementById('loading-screen')?.classList.remove('active');
    document.getElementById('main-menu')?.classList.add('active');

    // Animate menu canvas
    startMenuAnimation();

    // Start game loop
    lastTime = performance.now();
    gameLoop(lastTime);

    // Bind all UI
    bindUI();

    // Check for autosave
    const autoSave = SaveSystem.getAutosaveInfo();
    const continueBtn = document.getElementById('btn-continue');
    if (continueBtn) {
        if (autoSave) {
            continueBtn.style.display = 'block';
            continueBtn.addEventListener('click', () => {
                const data = SaveSystem.load('autosave');
                if (data) {
                    GameState.player = createPlayer();
                    loadSaveState(data);
                    startGame();
                }
            });
        } else {
            continueBtn.style.display = 'none';
        }
    }

    console.log('[ORV Game] Initialized successfully. Three Ways to Survive in a Ruined World awaits.');
}

// ============================================================
// MENU ANIMATION
// ============================================================
function startMenuAnimation() {
    const menuCanvas = document.getElementById('menu-canvas');
    if (!menuCanvas) return;
    const mCtx = menuCanvas.getContext('2d');
    const W = menuCanvas.width = menuCanvas.offsetWidth || 800;
    const H = menuCanvas.height = menuCanvas.offsetHeight || 600;

    const stars = Array.from({length: 120}, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 2 + 0.5, speed: Math.random() * 20 + 5,
        alpha: Math.random()
    }));

    const particles = [];
    for (let i = 0; i < 30; i++) {
        particles.push({
            x: Math.random() * W, y: Math.random() * H,
            vx: (Math.random()-0.5) * 0.5, vy: (Math.random()-0.5) * 0.5,
            size: Math.random() * 3 + 1,
            color: ['#4a9eff','#c8a951','#aa66ff'][Math.floor(Math.random()*3)],
            alpha: Math.random()
        });
    }

    function drawMenu(ts) {
        requestAnimationFrame(drawMenu);
        mCtx.fillStyle = '#040408';
        mCtx.fillRect(0, 0, W, H);

        // Stars
        stars.forEach(s => {
            s.alpha = 0.3 + Math.sin(ts/1000 * s.speed * 0.1) * 0.4;
            mCtx.beginPath();
            mCtx.arc(s.x, s.y, s.r, 0, Math.PI*2);
            mCtx.fillStyle = `rgba(255,255,255,${s.alpha})`;
            mCtx.fill();
        });

        // Floating particles
        particles.forEach(p => {
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
            if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
            p.alpha = 0.3 + Math.sin(ts/800) * 0.3;
            mCtx.shadowBlur = 6;
            mCtx.shadowColor = p.color;
            mCtx.beginPath();
            mCtx.arc(p.x, p.y, p.size, 0, Math.PI*2);
            mCtx.fillStyle = p.color + Math.floor(p.alpha*255).toString(16).padStart(2,'0');
            mCtx.fill();
            mCtx.shadowBlur = 0;
        });

        // Subtle grid
        mCtx.strokeStyle = '#4a9eff08';
        mCtx.lineWidth = 1;
        for (let x = 0; x < W; x += 60) { mCtx.beginPath(); mCtx.moveTo(x,0); mCtx.lineTo(x,H); mCtx.stroke(); }
        for (let y = 0; y < H; y += 60) { mCtx.beginPath(); mCtx.moveTo(0,y); mCtx.lineTo(W,y); mCtx.stroke(); }
    }
    drawMenu(0);
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Boot when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Handle audio context resume on first user interaction
document.addEventListener('click', () => AudioSystem.resume(), { once: true });
document.addEventListener('touchstart', () => AudioSystem.resume(), { once: true });

})();
