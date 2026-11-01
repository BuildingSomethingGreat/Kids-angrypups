/*
 * Angry Pups — screens, HUD, Force Lab panel, lab reports and saved progress.
 */
(function (root) {
  'use strict';

  var AP = root.AP;
  var G = AP.Game, Audio = AP.Audio, LEVELS = AP.LEVELS, BALLS = AP.BALLS, ATLAS = AP.ATLAS, PHYS = AP.PHYS;
  var STORE_KEY = 'angrypups.v1';

  function $(id) { return document.getElementById(id); }

  // ---------- saved progress
  var save = (function () {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  })();
  save.unlocked = save.unlocked || 1;
  save.best = save.best || {};
  function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(save)); } catch (e) { /* private mode */ } }

  // ---------- sprite helper (CSS background from the atlas)
  function sprite(key, h) {
    var f = ATLAS.frames[key], sc = h / f.h;
    var el = document.createElement('span');
    el.className = 'sprite';
    el.style.width = Math.round(f.w * sc) + 'px';
    el.style.height = h + 'px';
    el.style.backgroundImage = 'url(assets/sprites/atlas.webp)';
    el.style.backgroundSize = (ATLAS.w * sc) + 'px ' + (ATLAS.h * sc) + 'px';
    el.style.backgroundPosition = (-f.x * sc) + 'px ' + (-f.y * sc) + 'px';
    return el;
  }
  function spriteHTML(key, h) { return sprite(key, h).outerHTML; }
  function starSVG(on) { return '<svg class="' + (on ? 'on' : '') + '"><use href="#i-star"/></svg>'; }
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

  // ---------- screens
  var current = null;
  function show(name) {
    var next = $('screen-' + name);
    if (current === next) return;
    var prev = current;
    current = next;
    next.classList.add('is-active');
    requestAnimationFrame(function () { requestAnimationFrame(function () { next.classList.add('is-visible'); }); });
    if (prev) {
      prev.classList.remove('is-visible');
      setTimeout(function () { if (current !== prev) prev.classList.remove('is-active'); }, 450);
    }
    var vid = $('title-video');
    if (name === 'title') { pickVideo(); vid.play().catch(function () {}); } else { setTimeout(function () { if (current !== $('screen-title')) vid.pause(); }, 500); }
  }

  // ---------- title video (portrait & landscape cuts)
  var videoOrient = null;
  function pickVideo() {
    var portrait = root.innerHeight > root.innerWidth;
    var o = portrait ? 'portrait' : 'landscape';
    if (o === videoOrient) return;
    videoOrient = o;
    var v = $('title-video');
    v.poster = 'assets/video/poster-' + o + '.webp';
    v.style.backgroundImage = 'url(assets/video/poster-' + o + '.webp)';
    v.src = 'assets/video/title-' + o + '.mp4';
    v.load();
    if (current === $('screen-title')) v.play().catch(function () {});
  }
  root.addEventListener('resize', function () { if (current === $('screen-title')) pickVideo(); });

  // ---------- sound toggle
  Audio.muted = !!save.muted;
  function syncSound() {
    document.querySelectorAll('.btn-sound use').forEach(function (u) { u.setAttribute('href', Audio.muted ? '#i-mute' : '#i-sound'); });
  }
  function toggleSound() {
    Audio.unlock();
    Audio.setMuted(!Audio.muted);
    save.muted = Audio.muted; persist();
    syncSound();
    Audio.play('click');
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('.btn-sound')) toggleSound();
  });

  // ---------- modal
  var modalOnClose = null;
  function openModal(html, opts) {
    opts = opts || {};
    $('modal-content').innerHTML = html;
    var card = document.querySelector('.modal-card');
    card.classList.toggle('wide', !!opts.wide);
    card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    $('modal').classList.add('show');
    $('modal').setAttribute('aria-hidden', 'false');
    modalOnClose = opts.onClose || null;
    card.scrollTop = 0;
    var first = card.querySelector('[data-focus]');
    if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 50);
  }
  function closeModal() {
    $('modal').classList.remove('show');
    $('modal').setAttribute('aria-hidden', 'true');
    var cb = modalOnClose; modalOnClose = null;
    if (cb) cb();
  }
  function modalOpen() { return $('modal').classList.contains('show'); }

  $('modal').addEventListener('click', function (e) {
    var act = e.target.closest('[data-act]');
    if (!act) return;
    Audio.play('click');
    actions[act.getAttribute('data-act')](act.getAttribute('data-arg'));
  });

  // ---------- level select
  function renderLevels() {
    var grid = $('level-grid');
    grid.innerHTML = '';
    LEVELS.forEach(function (lv, i) {
      var locked = lv.id > save.unlocked;
      var best = save.best[lv.id] || { stars: 0 };
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'level-card' + (locked ? ' locked' : '');
      btn.style.animationDelay = (i * 0.06) + 's';
      var pupKey = ['biscuit_angry', 'marsh_angry', 'marsh_helmet', 'biscuit_angry', 'biscuit_helmet'][i];
      btn.innerHTML =
        '<div class="thumb"><span class="num">' + lv.id + '</span>' + spriteHTML(pupKey, 86) +
        (locked ? '<span class="lock"><svg><use href="#i-lock"/></svg></span>' : '') + '</div>' +
        '<div class="info"><div class="name">' + lv.name + '</div><div class="concept">' + lv.concept + '</div>' +
        '<div class="stars">' + starSVG(best.stars >= 1) + starSVG(best.stars >= 2) + starSVG(best.stars >= 3) + '</div></div>';
      btn.setAttribute('aria-label', 'Level ' + lv.id + ': ' + lv.name + (locked ? ' (locked)' : ''));
      btn.addEventListener('click', function () {
        if (locked) { Audio.play('thud', { amount: 0.2 }); btn.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 250 }); return; }
        Audio.play('click');
        startLevel(i);
      });
      grid.appendChild(btn);
    });
  }

  // ---------- gameplay
  var levelIndex = 0;
  var hud = { score: 0, shownScore: 0, pups: -1 };
  var missTip = 0;

  function ballLine(lv) {
    return lv.balls.map(function (k) { return spriteHTML(BALLS[k].sprite, k === 's' ? 22 : k === 'm' ? 28 : 34); }).join('');
  }

  function startLevel(i) {
    levelIndex = i;
    var lv = LEVELS[i];
    closeModal();
    show('play');
    G.startLevel(lv);
    Audio.musicLevel(1);
    $('hud-num').textContent = lv.id;
    $('hud-name').textContent = lv.name;
    hud.shownScore = 0; hud.pups = -1;
    missTip = 0;
    buildTray();
    updateHUD(true);
    setTimeout(function () {
      openModal(
        '<div class="m-ribbon"><div class="m-kicker">Level ' + lv.id + ' · ' + lv.concept + '</div><h3 class="m-title">' + lv.name + '</h3></div>' +
        '<div class="m-body">' +
        '<div class="formulas">' + [].concat(lv.formula).map(function (f) { return '<span class="formula">' + f + '</span>'; }).join('') + '</div>' +
        '<p class="m-goal">' + lv.goal + '</p>' +
        '<p class="m-tip">' + lv.tip + '</p>' +
        '<div class="m-balls">Your foam balls: ' + ballLine(lv) + '</div>' +
        '<div class="m-actions"><button class="btn" data-act="go" data-focus type="button"><svg><use href="#i-play"/></svg>Let\'s go!</button></div>' +
        '</div>'
      );
    }, 650);
  }

  function buildTray() {
    var tray = $('tray');
    tray.innerHTML = '';
    var lv = LEVELS[levelIndex];
    ['s', 'm', 'l'].forEach(function (k) {
      if (lv.balls.indexOf(k) < 0) return;
      var B = BALLS[k];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ball-btn';
      b.dataset.ball = k;
      b.appendChild(sprite(B.sprite, k === 's' ? 30 : k === 'm' ? 38 : 46));
      b.insertAdjacentHTML('beforeend', '<span class="lbl">' + B.name + ' · ' + B.m + ' kg</span><span class="cnt">0</span>');
      b.setAttribute('aria-label', B.label + ' foam ball ' + B.name + ', mass ' + B.m + ' kilograms');
      b.addEventListener('click', function () { G.selectBall(k); updateTray(); });
      tray.appendChild(b);
    });
    updateTray();
  }

  function updateTray() {
    var sim = G.sim;
    if (!sim) return;
    var ready = sim.state === 'ready';
    $('tray').classList.toggle('locked', !ready);
    $('tray').querySelectorAll('.ball-btn').forEach(function (b) {
      var k = b.dataset.ball, n = sim.ammo[k] || 0;
      b.querySelector('.cnt').textContent = n;
      b.classList.toggle('empty', n === 0);
      b.classList.toggle('selected', sim.loaded === k && (n > 0 || !ready));
      b.disabled = n === 0 || !ready;
    });
  }

  var labTimer = 0;
  function updateLab() {
    var info = G.labInfo();
    if (!info) return;
    var B = BALLS[info.type];
    var v = info.vMeasured !== undefined ? info.vMeasured : info.v;
    var p = info.pMeasured !== undefined ? info.pMeasured : info.p;
    var approx = info.vMeasured === undefined && info.x > 0;
    $('lab-ball').textContent = B.name + ' · m = ' + B.m.toFixed(1) + ' kg';
    $('lab-x').textContent = 'x = ' + info.x.toFixed(2) + ' m';
    $('lab-f').textContent = 'F = k·x = ' + Math.round(info.F) + ' N';
    $('lab-a').textContent = 'a = F/m = ' + Math.round(info.a) + ' m/s²';
    $('lab-v').textContent = 'v ' + (approx ? '≈ ' : '= ') + v.toFixed(1) + ' m/s';
    $('lab-p').textContent = 'p = ' + p.toFixed(1) + ' kg·m/s';
    $('lab-j').textContent = info.impulse ? 'J = ' + info.impulse.toFixed(1) + ' N·s' : 'J = –';
  }

  function updateHUD(force) {
    var sim = G.sim;
    if (!sim) return;
    var pups = sim.pupsAlive();
    if (pups !== hud.pups) {
      if (hud.pups >= 0) { var chip = $('hud-pups').parentNode; chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump'); }
      hud.pups = pups;
      $('hud-pups').textContent = pups;
    }
    var target = sim.score;
    if (force) hud.shownScore = target;
    hud.shownScore += (target - hud.shownScore) * 0.18;
    if (Math.abs(target - hud.shownScore) < 1) hud.shownScore = target;
    $('hud-score').textContent = fmt(hud.shownScore);
  }

  function uiTick(now) {
    if (current === $('screen-play') && G.sim) {
      updateHUD(false);
      if (now - labTimer > 66) { labTimer = now; updateLab(); updateTray(); }
    }
    requestAnimationFrame(uiTick);
  }

  var toastTimer = 0;
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 1800);
  }

  // ---------- game events
  var cheers = ['Pup down!', 'Bonk!', 'Foam-tastic!', 'Direct hit!', 'Science wins!'];
  G.on('toast', toast);
  G.on('ammo', updateTray);
  G.on('pupKO', function () { if (G.sim.pupsAlive() > 0) toast(cheers[Math.floor(Math.random() * cheers.length)], 1300); });
  G.on('launch', function (e) {
    var row = document.querySelector('#lab-v').parentNode;
    row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
    void e;
  });
  G.on('release', function () { missTip = G.sim.score; });
  G.on('ready', function () {
    // Gentle coaching when a shot did nothing.
    if (G.sim.score === missTip && G.lastShot) {
      var lv = LEVELS[levelIndex];
      var pull = G.lastShot.x / PHYS.maxPull;
      if (pull < 0.55) toast('Pull back farther for more force!', 2400);
      else if (lv.id === 2) toast('Try a different mass: Zip is fast, Chonk is strong', 2600);
      else toast('Watch the dots and adjust your angle', 2200);
    }
  });
  G.on('won', function () { setTimeout(showWin, 1100); });
  G.on('lost', function () { setTimeout(showLose, 900); });

  function starsFor(lv, score) { return 1 + (score >= lv.stars[0] ? 1 : 0) + (score >= lv.stars[1] ? 1 : 0); }

  function showWin() {
    if (!G.sim || G.sim.state !== 'won') return;
    var lv = LEVELS[levelIndex], sim = G.sim, st = sim.stats;
    var stars = starsFor(lv, sim.score);
    var prev = save.best[lv.id] || { stars: 0, score: 0 };
    save.best[lv.id] = { stars: Math.max(prev.stars, stars), score: Math.max(prev.score || 0, sim.score) };
    save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, lv.id + 1));
    persist();
    Audio.musicLevel(0.35);
    Audio.play('win');
    [0, 1, 2].forEach(function (i) { if (i < stars) setTimeout(function () { Audio.play('star', { amount: i }); }, 300 + i * 250); });
    var last = levelIndex === LEVELS.length - 1;
    var bestImpact = st.maxImpulse;
    openModal(
      '<div class="win-layout"><div class="m-ribbon win-ribbon">' +
      '<div class="win-stars">' + starSVG(stars >= 1) + starSVG(stars >= 2) + starSVG(stars >= 3) + '</div>' +
      '<div class="win-score"><span id="win-score">0</span><small>' + (last ? 'FORTRESS CLEARED!' : 'LEVEL ' + lv.id + ' CLEARED') + (sim.ammoLeft() ? ' · +' + fmt(sim.ammoLeft() * AP.SCORE.ballLeft) + ' ball bonus' : '') + '</small></div>' +
      '</div>' +
      '<div class="m-body">' +
      '<div class="m-kicker report-kicker">Lab report</div>' +
      '<div class="report">' +
      cell('Shots fired', st.shots, sim.ammoLeft() + ' ball' + (sim.ammoLeft() === 1 ? '' : 's') + ' left') +
      cell('Strongest pull', Math.round(st.maxForce) + ' N', 'F = k·x') +
      cell('Fastest launch', st.maxSpeed.toFixed(1) + ' m/s', 'launch speed v') +
      cell('Most momentum', st.maxMomentum.toFixed(1), 'kg·m/s · p = m·v') +
      cell('Hardest hit', bestImpact.toFixed(1) + ' N·s', 'impulse J') +
      cell('Knocked out', st.pupsKO + ' pup' + (st.pupsKO === 1 ? '' : 's'), st.blocksBroken + ' foam broken') +
      '</div>' +
      '<p class="learned"><b>What we learned</b>' + lv.learned + '</p>' +
      '<div class="m-actions">' +
      '<button class="btn ghost small" data-act="levels" type="button" aria-label="Levels"><svg><use href="#i-home"/></svg></button>' +
      '<button class="btn alt" data-act="replay" type="button"><svg><use href="#i-restart"/></svg>Replay</button>' +
      (last
        ? '<button class="btn" data-act="finale" data-focus type="button">Finish<svg><use href="#i-next"/></svg></button>'
        : '<button class="btn" data-act="next" data-focus type="button">Next<svg><use href="#i-next"/></svg></button>') +
      '</div></div></div>',
      { wide: true }
    );
    countUp($('win-score'), sim.score, 900);
  }

  function cell(label, value, sub) {
    return '<div class="cell"><span>' + label + '</span><b>' + value + '</b><i>' + sub + '</i></div>';
  }

  function countUp(el, to, ms) {
    var t0 = performance.now();
    (function tick(now) {
      var k = Math.min(1, (now - t0) / ms);
      el.textContent = fmt(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
    })(t0);
  }

  var loseHints = {
    1: 'Stretch the band farther. More stretch means more force (F = k·x).',
    2: 'Use light Zip to lob over the wall, and heavy Chonk to shove the tower.',
    3: 'Keep hitting the same taped wall. The impulses add up!',
    4: 'Aim high on the tower so it tips over. Torque!',
    5: 'Take out the outpost pup first, then pound the helmet bosses with Chonk.',
  };

  function showLose() {
    if (!G.sim || G.sim.state !== 'lost') return;
    var lv = LEVELS[levelIndex];
    Audio.musicLevel(0.35);
    Audio.play('lose');
    openModal(
      '<div class="m-ribbon"><div class="m-kicker">Level ' + lv.id + ' · out of foam balls</div><h3 class="m-title">The pups held the fort!</h3></div>' +
      '<div class="m-body">' +
      '<div class="lose-pup">' + spriteHTML('biscuit_angry', 110) + spriteHTML('marsh_angry', 110) + '</div>' +
      '<p class="learned"><b>Lab tip</b>' + loseHints[lv.id] + '</p>' +
      '<div class="m-actions">' +
      '<button class="btn ghost small" data-act="levels" type="button" aria-label="Levels"><svg><use href="#i-home"/></svg></button>' +
      '<button class="btn" data-act="replay" data-focus type="button"><svg><use href="#i-restart"/></svg>Try again</button>' +
      '</div></div>'
    );
  }

  function pause() {
    if (!G.running || modalOpen()) return;
    G.paused = true;
    Audio.musicLevel(0.4);
    Audio.play('click');
    openModal(
      '<div class="m-ribbon"><div class="m-kicker">Level ' + LEVELS[levelIndex].id + '</div><h3 class="m-title">Paused</h3></div>' +
      '<div class="m-body"><div class="m-actions" style="flex-direction:column;margin-top:0">' +
      '<button class="btn" data-act="resume" data-focus type="button"><svg><use href="#i-play"/></svg>Resume</button>' +
      '<button class="btn alt" data-act="replay" type="button"><svg><use href="#i-restart"/></svg>Restart level</button>' +
      '<button class="btn ghost" data-act="science" type="button"><svg><use href="#i-flask"/></svg>The Science</button>' +
      '<div style="display:flex;gap:10px"><button class="btn ghost" data-act="levels" type="button"><svg><use href="#i-home"/></svg>Levels</button>' +
      '<button class="btn ghost btn-sound" type="button" aria-label="Sound on or off"><svg><use href="' + (Audio.muted ? '#i-mute' : '#i-sound') + '"/></svg></button></div>' +
      '</div></div>',
      { onClose: function () { G.paused = false; Audio.musicLevel(1); } }
    );
  }

  function scienceHTML(fromPause) {
    return '<div class="m-ribbon"><div class="m-kicker">How the game uses real physics</div><h3 class="m-title">The Science of Angry Pups</h3></div>' +
      '<div class="m-body"><div class="science-grid">' +
      sci(1, 'Spring force', 'F = k × x', 'Our pink and purple slingshot\'s rubber bands act like a spring. The farther you pull (x), the bigger the force (F). In the game, k = 100 N/m, so a 2 m stretch pushes with 200 N.') +
      sci(2, 'Newton\'s 2nd law', 'a = F ÷ m', 'The same push speeds up a light ball more than a heavy one. Zip (0.5 kg) gets twice the acceleration of Bop (1 kg).') +
      sci(3, 'Energy becomes speed', '½kx² = ½mv²', 'The stretched band stores energy. When you let go, it turns into motion. Every ball gets the same energy from the same pull, but light balls go faster.') +
      sci(4, 'Momentum & impulse', 'p = m × v   J = F × Δt', 'A heavy ball keeps more "oomph" (momentum). When it hits, it delivers an impulse. Bigger impulses do more damage, and tough foam needs several.') +
      sci(5, 'Gravity', 'g = 9.8 m/s²', 'Gravity pulls every ball down at the same rate, so they fly in a curved path called a parabola. The dotted line shows where it starts to go.') +
      '</div>' +
      '<div class="try"><b>Try it with the real slingshot</b>Pull the pouch back 5, 10 and 15 cm and measure how far the foam ball flies each time. Then try a bigger ball with the same pull. Does it match the game?</div>' +
      '<div class="m-actions"><button class="btn" data-act="' + (fromPause ? 'resume' : 'close') + '" data-focus type="button">Got it!</button></div>' +
      '</div>';
  }
  function sci(n, title, f, text) {
    return '<div class="sci"><span class="n">' + n + '</span><h4>' + title + '<em>' + f + '</em></h4><p>' + text + '</p></div>';
  }

  var actions = {
    go: function () { Audio.unlock(); Audio.startMusic(); closeModal(); G.beginPlay(); maybeRotateTip(); },
    resume: function () { closeModal(); },
    replay: function () { G.paused = false; startLevel(levelIndex); },
    next: function () { G.paused = false; startLevel(Math.min(LEVELS.length - 1, levelIndex + 1)); },
    levels: function () { closeModal(); G.stop(); renderLevels(); show('levels'); },
    science: function () { openModal(scienceHTML(true), { wide: true, onClose: function () { G.paused = false; Audio.musicLevel(1); } }); },
    close: function () { closeModal(); },
    finale: function () {
      openModal(
        '<div class="m-ribbon" style="text-align:center"><div class="m-kicker">All 5 experiments complete</div><h3 class="m-title">Force &amp; Motion Champion!</h3></div>' +
        '<div class="m-body" style="text-align:center">' +
        '<div class="lose-pup">' + spriteHTML('biscuit_ko', 110) + spriteHTML('marsh_ko', 110) + '</div>' +
        '<p class="learned" style="text-align:left"><b>You proved it</b>More stretch means more force. Lighter balls fly faster, heavier balls carry more momentum, and big impulses break tough things. That is real physics!</p>' +
        '<div class="m-actions"><button class="btn alt" data-act="levels" type="button"><svg><use href="#i-home"/></svg>Levels</button><button class="btn" data-act="title" data-focus type="button">Title</button></div>' +
        '</div>'
      );
    },
    title: function () { closeModal(); G.stop(); show('title'); },
  };

  var rotateTimer = 0;
  function maybeRotateTip() {
    var tip = $('rotate-tip');
    if (root.innerHeight <= root.innerWidth || save.rotateTipSeen > 2) return;
    save.rotateTipSeen = (save.rotateTipSeen || 0) + 1; persist();
    tip.classList.add('show');
    clearTimeout(rotateTimer);
    rotateTimer = setTimeout(function () { tip.classList.remove('show'); }, 4200);
  }

  // ---------- wiring
  $('btn-play').addEventListener('click', function () {
    Audio.unlock();
    Audio.startMusic();
    Audio.play('click');
    if (matchMedia('(pointer: coarse)').matches && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(function () {});
    }
    var fresh = save.unlocked === 1 && !save.best[1];
    if (fresh) startLevel(0);
    else { renderLevels(); show('levels'); }
  });
  $('btn-science').addEventListener('click', function () { Audio.unlock(); Audio.startMusic(); Audio.play('click'); openModal(scienceHTML(false), { wide: true }); });
  $('btn-levels-back').addEventListener('click', function () { Audio.play('click'); show('title'); });
  $('btn-pause').addEventListener('click', pause);
  $('lab-toggle').addEventListener('click', function () {
    var lab = $('lab');
    lab.classList.toggle('collapsed');
    save.labCollapsed = lab.classList.contains('collapsed'); persist();
    Audio.play('click');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (modalOpen() && G.paused) closeModal();
      else if (current === $('screen-play')) pause();
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && current === $('screen-play') && G.running && G.inputEnabled) pause();
    // Never keep playing sound in a background tab.
    if (Audio.ctx) { if (document.hidden) Audio.ctx.suspend(); else Audio.ctx.resume(); }
  });
  document.addEventListener('contextmenu', function (e) { if (e.target.id === 'game') e.preventDefault(); });

  // HUD pup icon
  $('hud-pups').parentNode.querySelector('.pup-icon').replaceWith(sprite('biscuit_angry', 30));

  var shortScreen = Math.min(root.innerWidth, root.innerHeight) < 430;
  if (save.labCollapsed === true || (save.labCollapsed === undefined && shortScreen && root.innerHeight < root.innerWidth)) $('lab').classList.add('collapsed');
  $('lab-v').parentNode.classList.add('keep');

  syncSound();
  G.init($('game'));

  var fontsReady = document.fonts && document.fonts.load
    ? Promise.all([document.fonts.load('20px "Lilita One"'), document.fonts.load('700 14px Nunito')]).catch(function () {})
    : Promise.resolve();
  var timeout = new Promise(function (r) { setTimeout(r, 4000); });
  Promise.all([G.load(), Promise.race([fontsReady, timeout])]).then(function () {
    pickVideo();
    show('title');
    $('loading').classList.add('done');
    requestAnimationFrame(uiTick);
    // Deep link for testing / sharing a level: index.html#level=3
    var m = /level=(\d)/.exec(location.hash);
    if (m && LEVELS[m[1] - 1]) { Audio.unlock(); startLevel(Number(m[1]) - 1); }
  }).catch(function (err) {
    $('loading').querySelector('p').textContent = 'Could not load the game: ' + err.message;
  });
})(window);
