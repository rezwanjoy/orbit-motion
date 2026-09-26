// Orbit Motion — animation engine.
// Plain classic scripts only (no type="module", no fetch/import) so the page
// still works when index.html is double-clicked and opened via file://.
// Stack: GSAP + ScrollTrigger (scroll choreography, pinning, snapping),
// Lenis (smooth-scroll physics), anime.js v4 (micro-interactions, springs,
// counters, staggers), Three.js r128 UMD (hero orbit scene).

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
const A = window.anime || null; // anime.js v4 UMD global: { animate, stagger, utils, ... }
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

if('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

gsap.registerPlugin(ScrollTrigger);

/* ============================================================
   Lenis smooth scroll, driven by GSAP's ticker so ScrollTrigger
   and Lenis share one clock (no double-driven scroll).
   ============================================================ */
let lenis = null;
if(window.Lenis && !reduceMotion && !isMobile()){
  lenis = new Lenis({
    duration: 0.9,
    easing: (t) => 1 - Math.pow(1 - t, 4),
    smoothWheel: true,
    wheelMultiplier: 0.9,
    touchMultiplier: 1.4,
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}
window.__om = { get lenis(){ return lenis; } }; // debug handle
function smoothScrollTo(target){
  if(lenis) lenis.scrollTo(target, { duration: 1.4 });
  else if(typeof target === 'number') window.scrollTo({ top: target, behavior: reduceMotion ? 'auto' : 'smooth' });
  else (typeof target === 'string' ? document.querySelector(target) : target)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
}
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const t = document.querySelector(a.getAttribute('href'));
    if(!t) return;
    e.preventDefault();
    smoothScrollTo(t);
  });
});

/* ============================================================
   Text splitting helpers
   ============================================================ */
function splitChars(el){
  const text = el.textContent;
  el.textContent = '';
  return Array.from(text).map(ch => {
    const s = document.createElement('span');
    s.className = 'ch';
    s.textContent = ch === ' ' ? ' ' : ch;
    el.appendChild(s);
    return s;
  });
}
// wraps each word (keeping <em> styling) as .w > span so it can rise out of a mask
function splitWords(el, innerClass){
  const out = [];
  const walk = (node, parentEm) => {
    Array.from(node.childNodes).forEach(child => {
      if(child.nodeType === 3){
        const parts = child.textContent.split(/(\s+)/);
        const frag = document.createDocumentFragment();
        parts.forEach(p => {
          if(!p) return;
          if(/^\s+$/.test(p)){ frag.appendChild(document.createTextNode(' ')); return; }
          const w = document.createElement('span'); w.className = 'w';
          const i = document.createElement('span'); if(innerClass) i.className = innerClass;
          i.textContent = p;
          if(parentEm){ const em = document.createElement('em'); em.appendChild(i); w.appendChild(em); }
          else w.appendChild(i);
          frag.appendChild(w); out.push(i);
        });
        node.replaceChild(frag, child);
      } else if(child.nodeType === 1){
        if(child.tagName === 'EM'){
          const tmp = document.createElement('span');
          tmp.textContent = child.textContent;
          node.replaceChild(tmp, child);
          walk(tmp, true);
          while(tmp.firstChild) node.insertBefore(tmp.firstChild, tmp);
          tmp.remove();
        } else walk(child, parentEm);
      }
    });
  };
  walk(el, false);
  return out;
}

const heroChars = Array.from(document.querySelectorAll('[data-split]')).map(splitChars);
const statementWords = (() => { const el = document.getElementById('statementText'); return el ? splitWords(el, 'sw') : []; })();
const revealWordGroups = Array.from(document.querySelectorAll('.split-words')).map(el => ({ el, words: splitWords(el) }));

/* ============================================================
   Custom cursor — lerped ring + contextual labels
   ============================================================ */
(function cursor(){
  const root = document.querySelector('.cursor');
  if(!root || !window.matchMedia('(pointer:fine)').matches) return;
  const dot = root.querySelector('.cursor-dot');
  const ring = root.querySelector('.cursor-ring');
  const label = root.querySelector('.cursor-label');
  let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
  window.addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });
  gsap.ticker.add(() => {
    rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
    dot.style.transform = `translate3d(${mx}px,${my}px,0)`;
    ring.style.transform = `translate3d(${rx}px,${ry}px,0)`;
  });
  document.addEventListener('mouseover', e => {
    const t = e.target.closest('[data-cursor], a, button, .cf-card, .deck');
    root.classList.toggle('is-hover', !!t);
    const txt = t?.closest('[data-cursor]')?.getAttribute('data-cursor') || (t?.classList.contains('cf-card') ? 'Drag' : t?.classList.contains('deck') ? 'Shuffle' : '');
    label.textContent = txt;
    root.classList.toggle('is-label', !!txt);
  });
})();

/* ============================================================
   Magnetic buttons — element + label follow the pointer at
   different strengths (layered depth), elastic snap-back,
   anime.js squash on click.
   ============================================================ */
(function magnetic(){
  if(reduceMotion || !window.matchMedia('(pointer:fine)').matches) return;
  document.querySelectorAll('.magnetic').forEach(el => {
    const inner = el.querySelector(':scope > span');
    const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
    const ixTo = inner && gsap.quickTo(inner, 'x', { duration: 0.5, ease: 'power3.out' });
    const iyTo = inner && gsap.quickTo(inner, 'y', { duration: 0.5, ease: 'power3.out' });
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      xTo(dx * 0.3); yTo(dy * 0.4);
      if(inner){ ixTo(dx * 0.15); iyTo(dy * 0.2); }
    });
    el.addEventListener('pointerleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, 0.35)' });
      if(inner) gsap.to(inner, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, 0.35)' });
    });
    if(A && inner) el.addEventListener('click', () => A.animate(inner, { scale: [1, 0.86, 1.06, 1], duration: 520, ease: 'outElastic(1, .5)' }));
  });
})();

/* ============================================================
   Mailto links — clipboard fallback + toast (a bare mailto: can
   silently do nothing when no mail app is configured)
   ============================================================ */
(function mailtoFallback(){
  let toastEl;
  function toast(msg){
    if(!toastEl){ toastEl = document.createElement('div'); toastEl.className = 'mail-toast'; document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.remove('is-visible'); void toastEl.offsetWidth; toastEl.classList.add('is-visible');
    clearTimeout(toastEl.__t); toastEl.__t = setTimeout(() => toastEl.classList.remove('is-visible'), 3200);
  }
  document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
    link.addEventListener('click', () => {
      const email = decodeURIComponent(link.href.replace('mailto:', '').split('?')[0]);
      if(navigator.clipboard && window.isSecureContext){
        navigator.clipboard.writeText(email).then(() => toast(`Copied ${email}. Your email app should also be opening`)).catch(() => toast(`Email us at ${email}`));
      } else toast(`Email us at ${email}`);
    });
  });
})();

/* ============================================================
   Videos — only play what's on screen (big perf win with 8 clips).
   Debounced + de-duped: a raw isIntersecting toggle firing play()/pause()
   on every scroll tick was measured re-issuing (and aborting) the same
   range request over and over during a fast flick through the work reel —
   real network + decoder churn, the main source of mobile jank here.
   On mobile we additionally cap it to one decoding video at a time.
   ============================================================ */
(function videoVisibility(){
  const vids = Array.from(document.querySelectorAll('video'));
  let current = null; // mobile: the single video allowed to play
  function safePlay(v){
    if(!v.paused && !v.ended) return;
    v.muted = true;
    const p = v.play();
    if(p) p.catch(() => {});
  }
  function safePause(v){ if(!v.paused) v.pause(); }
  const io = new IntersectionObserver(entries => {
    entries.forEach(({ target, isIntersecting }) => {
      clearTimeout(target.__vt);
      target.__vt = setTimeout(() => {
        if(isIntersecting){
          if(isMobile()){
            if(current && current !== target) safePause(current);
            current = target;
          }
          safePlay(target);
        } else {
          safePause(target);
          if(current === target) current = null;
        }
      }, isIntersecting ? 120 : 300); // enter needs a beat of dwell time; exit gets a grace period
    });
  }, { rootMargin: '100px' });
  vids.forEach(v => {
    if(isMobile() && v.closest('.hero-float')) return; // CSS hides these on mobile — don't even fetch metadata
    v.muted = true; v.removeAttribute('autoplay'); io.observe(v);
  });
})();

/* ============================================================
   HERO — Three.js orbit ring; scrolling flies the camera
   straight through the ring into the next section.
   ============================================================ */
const hero = { p: 0 }; // scroll progress written by ScrollTrigger, read by the render loop
(function heroScene(){
  const canvas = document.getElementById('hero-canvas');
  if(!canvas || !window.THREE) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 200);
  camera.position.set(0, 0, 11);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile(), alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile() ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);

  const tiltMatrix = new THREE.Matrix4().makeRotationZ(-0.34).multiply(new THREE.Matrix4().makeRotationX(1.12));
  const ringGroup = new THREE.Group();
  scene.add(ringGroup);
  // on phones the ring floats above the wordmark instead of beside it
  const baseX = () => isMobile() ? 0.2 : 1.9;
  const baseY = () => isMobile() ? 2.3 : 0.35;
  ringGroup.position.set(baseX(), baseY(), -1.5);
  if(isMobile()) ringGroup.scale.setScalar(0.62);

  const mkRing = (r, t, color, op) => new THREE.Mesh(
    new THREE.TorusGeometry(r, t, 12, 200).applyMatrix4(tiltMatrix),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op })
  );
  ringGroup.add(mkRing(2.3, 0.012, 0xcfd0da, 0.5), mkRing(2.18, 0.017, 0x9a7bf0, 0.75), mkRing(2.55, 0.006, 0x9a7bf0, 0.25));

  const flareTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(232,220,255,0.9)');
    g.addColorStop(0.4, 'rgba(185,139,255,0.35)'); g.addColorStop(1, 'rgba(185,139,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();
  const flarePos = new THREE.Vector3(2.24 * Math.cos(0.42), 2.24 * Math.sin(0.42), 0).applyMatrix4(tiltMatrix);
  const mkSprite = (s, op) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: op })); sp.scale.set(s, s, 1); sp.position.copy(flarePos); return sp; };
  const flare = mkSprite(1.5, 0.85), flareCore = mkSprite(0.4, 1);
  ringGroup.add(flare, flareCore);

  // orbiting "moons" — small glowing sprites riding the ring
  const moons = [0, 2.1, 4.2].map((phase, i) => { const m = mkSprite(i ? 0.22 : 0.3, 0.9); m.userData.phase = phase; ringGroup.add(m); return m; });

  function makeStars(count, radius, size){
    const pos = new Float32Array(count * 3);
    for(let i = 0; i < count; i++){
      const r = radius * (0.35 + Math.random() * 0.65), th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos[i*3] = r * Math.sin(ph) * Math.cos(th); pos[i*3+1] = r * Math.sin(ph) * Math.sin(th); pos[i*3+2] = r * Math.cos(ph) - 20;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size, sizeAttenuation: true, transparent: true, opacity: 0.9 }));
  }
  const stars = makeStars(isMobile() ? 550 : 1600, 50, 0.045); scene.add(stars);
  const starsNear = makeStars(isMobile() ? 90 : 260, 22, 0.08); starsNear.position.z = 14; scene.add(starsNear);

  let tx = 0, ty = 0, cx = 0, cy = 0, ps = 0;
  if(!reduceMotion) addEventListener('pointermove', e => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; }, { passive: true });
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

  let visible = true, rafId = null;
  const clock = new THREE.Clock();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if(visible && rafId === null){ clock.getDelta(); rafId = requestAnimationFrame(tick); } }).observe(canvas);

  function tick(){
    if(!visible){ rafId = null; return; }
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    ps += (hero.p - ps) * 0.12;
    const fly = ps * ps * ps; // ease-in: slow start, then rush through the ring
    if(!reduceMotion){
      ringGroup.rotation.y += dt * (0.18 + ps * 1.6);
      stars.rotation.y += dt * 0.006;
      cx += (tx - cx) * 0.04; cy += (ty - cy) * 0.04;
      moons.forEach((m, i) => {
        const a = t * (0.5 + i * 0.15) + m.userData.phase;
        m.position.set(2.18 * Math.cos(a), 2.18 * Math.sin(a), 0).applyMatrix4(tiltMatrix);
      });
      flareCore.scale.setScalar(0.5 * (1 + Math.sin(t * 1.6) * 0.1));
    }
    ringGroup.position.x = lerp(baseX(), 0, Math.min(1, ps * 1.6));
    ringGroup.position.y = lerp(baseY(), 0, Math.min(1, ps * 1.6));
    camera.position.set(cx * 1.4 * (1 - ps), -cy * 0.9 * (1 - ps), lerp(11, -7, fly));
    camera.lookAt(camera.position.x * 0.2, camera.position.y * 0.2, camera.position.z - 12);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);
})();

/* hero floating chips — one shared rAF lerp loop (not per-event tweens).
   Paused via IntersectionObserver: without this, backdrop-filter + transform
   on these chips kept ticking every frame for the whole page lifetime,
   long after the hero scrolled out of view — a steady background drain
   that showed up as sustained scroll jank, worst on mobile GPUs. */
(function heroFloat(){
  if(reduceMotion) return;
  const stage = document.querySelector('.hero-float');
  const items = Array.from(document.querySelectorAll('.hero-float [data-depth]')).map((el, i) => ({ el, d: parseFloat(el.dataset.depth), x: 0, y: 0, ph: i * 1.7, rot: el.classList.contains('float-card') ? 8 : 0 }));
  if(!stage || !items.length) return;
  let tx = 0, ty = 0, visible = true;
  addEventListener('pointermove', e => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; }, { passive: true });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: '50px' }).observe(stage);
  gsap.ticker.add(time => {
    if(!visible) return;
    items.forEach(it => {
      const bob = Math.sin(time * 0.9 + it.ph) * 8;
      it.x += (-tx * 50 * it.d - it.x) * 0.07;
      it.y += (-ty * 36 * it.d + bob - it.y) * 0.07;
      it.el.style.transform = `translate3d(${it.x.toFixed(1)}px,${it.y.toFixed(1)}px,0) rotate(${(it.rot + tx * 6 * it.d).toFixed(2)}deg)`;
    });
  });
})();

/* ============================================================
   Preloader → hero intro
   ============================================================ */
function heroIntro(){
  if(heroIntro.ran) return; heroIntro.ran = true;
  const chips = document.querySelectorAll('.hero-float > *');
  const pills = document.querySelectorAll('.hero-pills span');
  const others = document.querySelectorAll('.hero-kicker, .hero-actions, .scroll-cue');
  if(reduceMotion || !A) return;
  const { animate, stagger } = A;
  animate(heroChars[0], { translateY: ['110%', '0%'], rotate: [12, 0], duration: 1300, delay: stagger(70), ease: 'outExpo' });
  animate(heroChars[1], { translateY: ['110%', '0%'], opacity: [0, 1], duration: 1100, delay: stagger(40, { start: 300 }), ease: 'outExpo' });
  animate(others, { opacity: [0, 1], translateY: [24, 0], duration: 1000, delay: stagger(120, { start: 500 }), ease: 'outQuart' });
  animate(pills, { opacity: [0, 1], scale: [0.6, 1], duration: 800, delay: stagger(50, { start: 650, from: 'first' }), ease: 'outBack(2)' });
  // chips' transform is owned by the float loop, so only fade them here
  animate(chips, { opacity: [0, 1], duration: 1200, delay: stagger(110, { start: 400 }), ease: 'outQuart' });
}
(function preloader(){
  const loader = document.getElementById('loader');
  let finished = false;
  const done = () => {
    if(finished) return; finished = true;
    document.body.classList.remove('is-loading');
    if(loader) loader.style.display = 'none';
    lenis?.start();
    ScrollTrigger.refresh();
  };
  if(!loader || reduceMotion || !A){ done(); return; }
  lenis?.stop();
  // matches the CSS failsafe: never leave the page scroll-locked
  setTimeout(() => { if(!finished){ done(); heroIntro(); } }, 6000);

  // pre-hide hero pieces so the intro can reveal them
  heroChars.flat().forEach(c => c.style.transform = 'translateY(110%)');
  document.querySelectorAll('.hero-kicker, .hero-actions, .scroll-cue, .hero-pills span, .hero-float > *').forEach(el => el.style.opacity = 0);

  const { animate } = A;
  const ring = loader.querySelector('.loader-ring');
  const planet = loader.querySelector('.loader-planet');
  const num = document.getElementById('loaderNum');
  const len = ring.getTotalLength();
  ring.style.strokeDasharray = len; ring.style.strokeDashoffset = len;
  const state = { v: 0 };
  const DUR = 1700;
  animate(ring, { strokeDashoffset: [len, 0], duration: DUR, ease: 'inOutQuart' });
  animate(state, {
    v: 100, duration: DUR, ease: 'inOutQuart',
    onUpdate: () => {
      num.textContent = String(Math.round(state.v)).padStart(2, '0');
      const a = (state.v / 100) * Math.PI * 2 - Math.PI / 2, rot = -18 * Math.PI / 180;
      const x = 86 * Math.cos(a), y = 34 * Math.sin(a);
      planet.setAttribute('cx', 100 + x * Math.cos(rot) - y * Math.sin(rot));
      planet.setAttribute('cy', 60 + x * Math.sin(rot) + y * Math.cos(rot));
    },
    onComplete: () => {
      animate([loader.querySelector('.loader-orbit'), loader.querySelector('.loader-count')], { opacity: 0, scale: 0.9, duration: 400, ease: 'inQuad' });
      animate(loader.querySelector('.loader-curtain--top'), { translateY: '-100%', duration: 1000, delay: 250, ease: 'inOutExpo' });
      animate(loader.querySelector('.loader-curtain--bottom'), { translateY: '100%', duration: 1000, delay: 250, ease: 'inOutExpo', onComplete: done });
      setTimeout(heroIntro, 650);
    }
  });
})();

/* ============================================================
   Scroll choreography — created in document order so every pin
   spacer is measured correctly.
   ============================================================ */

// progress bar
gsap.to('#progressBar', { scaleX: 1, ease: 'none', scrollTrigger: { trigger: document.body, start: 0, end: 'max', scrub: 0.3 } });

// HERO pin: content peels away while the camera flies through the ring
(function heroScroll(){
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: '#hero', start: 'top top', end: '+=130%', pin: true, scrub: true,
      onUpdate: self => { hero.p = self.progress; },
    }
  });
  tl.to('#heroContent', { yPercent: -30, opacity: 0, ease: 'power2.in', duration: 0.45 }, 0)
    .to('.hero-float', { scale: 2.4, opacity: 0, ease: 'power2.in', duration: 0.6 }, 0)
    .to('.scroll-cue', { opacity: 0, duration: 0.15 }, 0)
    .to('.hero-vignette', { opacity: 0.2, duration: 0.6 }, 0.2)
    .to('#hero-canvas', { opacity: 0, duration: 0.2 }, 0.8);
})();

// STATEMENT: words ignite one by one; real work floats past at different depths
(function statementScroll(){
  if(!statementWords.length) return;
  if(reduceMotion){ statementWords.forEach(w => w.style.opacity = 1); return; }
  const tl = gsap.timeline({ scrollTrigger: { trigger: '#statement', start: 'top top', end: '+=170%', pin: true, scrub: 0.6 } });
  tl.to(statementWords, { opacity: 1, stagger: 0.12, ease: 'none', duration: 0.3 }, 0);
  document.querySelectorAll('.sm').forEach((fig, i) => {
    const s = parseFloat(fig.dataset.speed) || 1;
    tl.fromTo(fig,
      { y: () => innerHeight * 0.5 * s, rotation: (i % 2 ? 1 : -1) * 12 * s, scale: 0.8 },
      { y: () => -innerHeight * 0.55 * s, rotation: (i % 2 ? -1 : 1) * 6, scale: 1, ease: 'none', duration: tl.duration() || 2 }, 0);
  });
})();

// SERVICES: pinned orbit system, one continuous rotation, snaps to each discipline
(function servicesOrbit(){
  const rotor = document.getElementById('orbitRotor');
  const ringEl = document.querySelector('.orbit-ring--outer');
  const nodes = Array.from(document.querySelectorAll('.orbit-node'));
  const slides = Array.from(document.querySelectorAll('.core-slide'));
  const idxEl = document.getElementById('svcIdx');
  const prog = document.getElementById('coreProgress');
  if(!rotor || !nodes.length) return;
  const N = nodes.length, STEP = 360 / N;
  let R = 200, cur = 0;

  function render(f){ // f = fractional active index 0..N-1
    const rot = -f * STEP;
    rotor.style.transform = `rotate(${rot}deg)`;
    nodes.forEach((n, i) => {
      const a = (i * STEP - 90) * Math.PI / 180;
      const near = Math.max(0, 1 - Math.abs(i - f));
      n.style.transform = `translate(${(Math.cos(a) * R).toFixed(1)}px,${(Math.sin(a) * R).toFixed(1)}px) rotate(${-rot}deg) scale(${(1 + near * 0.35).toFixed(3)})`;
      n.classList.toggle('is-active', Math.round(f) === i);
    });
    slides.forEach((s, i) => {
      const d = i - f;
      s.style.opacity = Math.max(0, 1 - Math.abs(d) * 2.2).toFixed(3);
      s.style.transform = `translateY(${(d * 40).toFixed(1)}px) scale(${(1 - Math.min(1, Math.abs(d)) * 0.15).toFixed(3)})`;
    });
    const k = Math.round(f);
    if(idxEl) idxEl.textContent = String(k + 1).padStart(2, '0');
    if(prog) prog.style.strokeDashoffset = (295.3 * (1 - f / (N - 1))).toFixed(1);
  }
  function measure(){ R = ringEl.getBoundingClientRect().width / 2; render(cur); }
  measure();
  addEventListener('resize', measure);

  const st = ScrollTrigger.create({
    trigger: '#services', start: 'top top', end: () => '+=' + Math.round(innerHeight * 4.2), pin: true, scrub: 0.8,
    snap: reduceMotion ? false : { snapTo: 1 / (N - 1), duration: { min: 0.25, max: 0.6 }, delay: 0.05, ease: 'power2.inOut' },
    onUpdate: self => { cur = self.progress * (N - 1); render(cur); },
  });
  nodes.forEach((n, i) => n.addEventListener('click', () => smoothScrollTo(st.start + (st.end - st.start) * (i / (N - 1)))));
  if(A && !reduceMotion) nodes.forEach(n => n.addEventListener('mouseenter', () => A.animate(n.querySelector('svg'), { rotate: [0, -16, 6, 0], scale: [1, 1.2, 1], duration: 650, ease: 'outElastic(1, .6)' })));
})();

// WORK: pinned horizontal reel with depth — cards tilt toward the centre
(function workReel(){
  const track = document.getElementById('workTrack');
  const cards = Array.from(document.querySelectorAll('.work-card'));
  const ghost = document.getElementById('workGhost');
  const bar = document.getElementById('workBar');
  const idx = document.getElementById('workIdx');
  if(!track) return;
  const dist = () => Math.max(0, track.scrollWidth - innerWidth);

  function depth(){
    const vc = innerWidth / 2;
    let best = 0, bestD = 1e9;
    cards.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const d = (r.left + r.width / 2 - vc) / innerWidth; // -1..1ish
      if(Math.abs(d) < bestD){ bestD = Math.abs(d); best = i; }
      if(reduceMotion || isMobile()) return; // skip the per-card 3D tilt recompute on mobile — real cost next to 4 decoding videos in this section
      c.style.transform = `perspective(1400px) rotateY(${clamp(-d * 22, -24, 24).toFixed(2)}deg) scale(${(1 - Math.min(0.14, Math.abs(d) * 0.14)).toFixed(3)})`;
      const m = c.querySelector('.work-media');
      if(m) m.style.transform = `translateX(${(d * -8).toFixed(2)}%) scale(1.14)`;
    });
    if(idx) idx.textContent = String(best + 1).padStart(2, '0');
  }

  gsap.to(track, {
    x: () => -dist(), ease: 'none',
    scrollTrigger: {
      trigger: '#work', start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 0.8, invalidateOnRefresh: true,
      snap: reduceMotion ? false : {
        snapTo: (v) => { // snap so a card lands centred
          const d = dist(); if(!d) return v;
          const pts = cards.map(c => clamp((c.offsetLeft + c.offsetWidth / 2 - innerWidth / 2) / d, 0, 1));
          return pts.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
        },
        duration: { min: 0.2, max: 0.6 }, delay: 0.08, ease: 'power2.inOut',
      },
      onUpdate: self => {
        if(bar) bar.style.transform = `scaleX(${self.progress})`;
        if(ghost) ghost.style.transform = `translateX(${(-self.progress * 45).toFixed(2)}%)`;
        depth();
      },
      onRefresh: depth,
    }
  });
  depth();
})();

// LIVE SITES: 3D coverflow carousel — drag, arrows, dots, autoplay, per-site colour wash
(function coverflow(){
  const section = document.getElementById('sites');
  const cards = Array.from(document.querySelectorAll('.cf-card'));
  const dots = Array.from(document.querySelectorAll('#cfDots button'));
  const logos = Array.from(document.querySelectorAll('.site-logo'));
  const visit = document.getElementById('cfVisit');
  const stage = document.getElementById('coverflow');
  if(!cards.length) return;
  const N = cards.length;
  let idx = 0, drag = 0, timer = null, inView = false;

  const wrap = (o) => { let v = ((o % N) + N) % N; if(v > N / 2) v -= N; return v; };
  function pose(o){
    const ao = Math.abs(o), mob = isMobile();
    return {
      xPercent: o * (mob ? 78 : 62), z: -ao * (mob ? 260 : 380), rotationY: -o * 38, scale: 1 - Math.min(ao, 1.5) * 0.08,
      opacity: ao > 1.4 ? 0 : 1 - ao * 0.45, zIndex: 10 - Math.round(ao * 2), filter: `brightness(${(1 - Math.min(ao, 1) * 0.45).toFixed(2)})`,
    };
  }
  function layout(instant){
    cards.forEach((c, i) => {
      const p = pose(wrap(i - idx) + drag);
      if(instant) gsap.set(c, p); else gsap.to(c, { ...p, duration: 1.1, ease: 'expo.out', overwrite: true });
    });
  }
  function go(n){
    idx = ((n % N) + N) % N;
    const theme = cards[idx].dataset.theme;
    section.dataset.theme = theme;
    dots.forEach((d, i) => d.classList.toggle('is-active', i === idx));
    logos.forEach((l, i) => l.classList.toggle('is-active', i === idx));
    if(visit) visit.href = cards[idx].dataset.url;
    layout(false);
  }
  function restart(){ clearInterval(timer); if(inView && !reduceMotion) timer = setInterval(() => go(idx + 1), 4500); }

  gsap.set(cards, { transformPerspective: 1800 });
  layout(true);
  document.querySelectorAll('.cf-arrow').forEach(b => b.addEventListener('click', () => { go(idx + parseInt(b.dataset.dir, 10)); restart(); }));
  dots.forEach((d, i) => d.addEventListener('click', () => { go(i); restart(); }));

  // drag / swipe
  let down = false, sx = 0, moved = 0;
  stage.addEventListener('pointerdown', e => { down = true; sx = e.clientX; moved = 0; clearInterval(timer); });
  addEventListener('pointermove', e => {
    if(!down) return;
    moved = e.clientX - sx;
    drag = clamp(moved / (stage.clientWidth * 0.6), -1, 1);
    cards.forEach((c, i) => gsap.set(c, pose(wrap(i - idx) + drag)));
  });
  addEventListener('pointerup', () => {
    if(!down) return; down = false;
    const step = Math.abs(drag) > 0.18 ? (drag < 0 ? 1 : -1) : 0;
    drag = 0; go(idx + step); restart();
  });
  cards.forEach((c, i) => c.addEventListener('click', () => {
    if(Math.abs(moved) > 6) return;
    if(i === idx) window.open(c.dataset.url, '_blank', 'noopener');
    else { go(i); restart(); }
  }));
  addEventListener('resize', () => layout(true));

  // entrance: cards fly up out of the dark, then autoplay while visible
  let entered = false;
  new IntersectionObserver(([e]) => {
    inView = e.isIntersecting; restart();
    if(inView && !entered && A && !reduceMotion){
      entered = true;
      A.animate(stage, { translateY: [120, 0], opacity: [0, 1], rotateX: [18, 0], duration: 1400, ease: 'outExpo' });
      A.animate(document.querySelectorAll('.sites-controls > *'), { opacity: [0, 1], translateY: [20, 0], duration: 800, delay: A.stagger(80, { start: 400 }), ease: 'outQuart' });
    }
  }, { threshold: 0.25 }).observe(section);
})();

// PROCESS: pinned — a comet travels the path and lights each step
(function processComet(){
  const map = document.querySelector('.process-map');
  const path = document.getElementById('processPath');
  const drawn = document.getElementById('processDrawn');
  const comet = document.getElementById('comet');
  const nodes = Array.from(document.querySelectorAll('.p-node'));
  if(!map || !path) return;
  const len = path.getTotalLength();
  drawn.style.strokeDasharray = len; drawn.style.strokeDashoffset = len;
  let p = 0;

  function place(){
    if(isMobile()) return;
    const sx = map.clientWidth / 1000, sy = map.clientHeight / 300;
    nodes.forEach(n => {
      const pt = path.getPointAtLength(parseFloat(n.dataset.at) * len);
      n.style.transform = `translate(${(pt.x * sx).toFixed(1)}px,${(pt.y * sy).toFixed(1)}px)`;
    });
    render();
  }
  function render(){
    drawn.style.strokeDashoffset = (len * (1 - p)).toFixed(1);
    const sx = map.clientWidth / 1000, sy = map.clientHeight / 300;
    const pt = path.getPointAtLength(p * len);
    comet.style.transform = `translate(${(pt.x * sx).toFixed(1)}px,${(pt.y * sy).toFixed(1)}px)`;
    nodes.forEach(n => n.classList.toggle('is-lit', p >= parseFloat(n.dataset.at) - 0.015));
  }

  const mm = gsap.matchMedia();
  mm.add('(min-width: 761px)', () => {
      place();
      const st = ScrollTrigger.create({
        trigger: '#process', start: 'top top', end: '+=160%', pin: true, scrub: 0.6,
        snap: reduceMotion ? false : { snapTo: nodes.map(n => parseFloat(n.dataset.at)), duration: { min: 0.2, max: 0.5 }, delay: 0.08, ease: 'power2.inOut' },
        onUpdate: self => { p = self.progress; render(); },
      });
      addEventListener('resize', place);
      return () => { removeEventListener('resize', place); };
  });
  mm.add('(max-width: 760px)', () => {
    nodes.forEach(n => ScrollTrigger.create({ trigger: n, start: 'top 80%', onEnter: () => n.classList.add('is-lit') }));
  });
})();

// PACKAGE: shuffling deck (anime.js) + price drop counter
(function deck(){
  const deckEl = document.getElementById('deck');
  if(!deckEl) return;
  let order = Array.from(deckEl.querySelectorAll('.deck-card'));
  const slot = (k) => ({ translateY: k * 22, translateX: k * 10, rotate: [0, -6, 5][k], scale: 1 - k * 0.06, zIndex: 3 - k });
  const apply = (instant) => order.forEach((c, k) => {
    const s = slot(k); c.style.zIndex = s.zIndex;
    if(instant || !A || reduceMotion) c.style.transform = `translate(${s.translateX}px,${s.translateY}px) rotate(${s.rotate}deg) scale(${s.scale})`;
    else A.animate(c, { translateX: s.translateX, translateY: s.translateY, rotate: s.rotate, scale: s.scale, duration: 900, ease: 'outElastic(1, .7)' });
  });
  apply(true);
  let busy = false, timer = null;
  function shuffle(){
    if(busy) return; busy = true;
    const top = order[0];
    const finish = () => { order.push(order.shift()); apply(false); setTimeout(() => busy = false, 350); };
    if(!A || reduceMotion){ finish(); return; }
    A.animate(top, { translateX: [0, 360], translateY: [0, -40], rotate: [0, 24], duration: 380, ease: 'inQuad', onComplete: () => { top.style.zIndex = 0; finish(); } });
  }
  deckEl.addEventListener('click', () => { shuffle(); clearInterval(timer); });
  new IntersectionObserver(([e]) => { clearInterval(timer); if(e.isIntersecting && !reduceMotion) timer = setInterval(shuffle, 3200); }, { threshold: 0.4 }).observe(deckEl);
})();

(function priceDrop(){
  const card = document.getElementById('priceCard');
  const num = document.getElementById('priceNew');
  const strike = document.querySelector('#priceOld i');
  const badge = document.getElementById('pkgBadge');
  if(!card || !num) return;
  if(reduceMotion || !A){ num.textContent = '280'; if(strike) strike.style.transform = 'scaleX(1)'; return; }
  const { animate, utils } = A;
  utils.set(badge, { scale: 0, rotate: -20 });
  utils.set(card, { opacity: 0 });
  new IntersectionObserver(([e], io) => {
    if(!e.isIntersecting) return; io.disconnect();
    animate(card, { translateY: [60, 0], opacity: [0, 1], duration: 1100, ease: 'outExpo' });
    animate(strike, { scaleX: [0, 1], duration: 600, delay: 500, ease: 'inOutQuart' });
    const s = { v: 699 };
    animate(s, { v: 280, duration: 1800, delay: 700, ease: 'outExpo', onUpdate: () => { num.textContent = Math.round(s.v); } });
    animate(badge, { scale: [0, 1], rotate: [-20, 0], duration: 900, delay: 1600, ease: 'outElastic(1, .5)' });
    animate(card.querySelectorAll('.price-includes li'), { opacity: [0, 1], translateX: [-20, 0], duration: 700, delay: A.stagger(90, { start: 900 }), ease: 'outQuart' });
  }, { threshold: 0.35 }).observe(card);
})();

// masked word-rise for every .split-words heading
revealWordGroups.forEach(({ el, words }) => {
  if(reduceMotion || !words.length) return;
  gsap.set(words, { yPercent: 110 });
  ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true, onEnter: () => gsap.to(words, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.05 }) });
});

// site header hides on scroll down, returns on scroll up
(function headerHide(){
  const h = document.querySelector('.site-header');
  let last = 0;
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: self => {
    const y = self.scroll();
    if(Math.abs(y - last) < 6) return;
    gsap.to(h, { yPercent: y > last && y > 200 ? -110 : 0, duration: 0.5, ease: 'power3.out', overwrite: true });
    last = y;
  }});
})();

// dot nav active state
(function dotNav(){
  const links = document.querySelectorAll('.dot-nav a');
  links.forEach(link => {
    let s = document.getElementById(link.dataset.dot);
    if(!s) return;
    // pinned sections: measure the pin-spacer so the whole pinned duration counts
    if(s.parentElement.classList.contains('pin-spacer')) s = s.parentElement;
    ScrollTrigger.create({ trigger: s, start: 'top 50%', end: 'bottom 50%', onToggle: self => { if(self.isActive){ links.forEach(l => l.classList.remove('is-active')); link.classList.add('is-active'); } } });
  });
})();

// contact orbits breathe with scroll
gsap.fromTo('.contact-orbits', { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, ease: 'none', scrollTrigger: { trigger: '#contact', start: 'top bottom', end: 'top 20%', scrub: true } });

addEventListener('load', () => ScrollTrigger.refresh());
