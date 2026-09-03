/* Liquid-glass particle system (mouse + touch interactive) */
(function () {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let width, height, particles;

  // Pointer state (mouse & touch)
  const pointer = { x: -9999, y: -9999, vx: 0, vy: 0, active: false };
  window.__particlesPointer = pointer;
  let prevPointer = { x: pointer.x, y: pointer.y };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function createParticles(count) {
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: 2 + Math.random() * 3,
        hue: 180 + Math.random() * 140,
        alpha: 0.35 + Math.random() * 0.45,
      });
    }
    return arr;
  }

  // Pointer helpers
  function onPointerMove(x, y) {
    const nx = Math.max(0, Math.min(width, x));
    const ny = Math.max(0, Math.min(height, y));
    pointer.vx = nx - pointer.x;
    pointer.vy = ny - pointer.y;
    pointer.x = nx;
    pointer.y = ny;
    pointer.active = true;
  }
  function onPointerUp() {
    pointer.active = false;
    pointer.x = -9999;
    pointer.y = -9999;
    pointer.vx = 0;
    pointer.vy = 0;
  }

  // Unified pointer events (mouse + touch on iOS/Android)
  window.addEventListener('pointermove', (e) => onPointerMove(e.clientX, e.clientY), { passive: true });
  window.addEventListener('pointerdown', (e) => onPointerMove(e.clientX, e.clientY), { passive: true });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerUp, { passive: true });
  window.addEventListener('pointerleave', onPointerUp, { passive: true });

  // Mouse fallback (older browsers)
  window.addEventListener('mousemove', (e) => onPointerMove(e.clientX, e.clientY), { passive: true });
  window.addEventListener('mousedown', (e) => onPointerMove(e.clientX, e.clientY), { passive: true });
  window.addEventListener('mouseup', onPointerUp, { passive: true });
  window.addEventListener('mouseleave', onPointerUp, { passive: true });

  // Touch fallback (older iOS/WebKit)
  window.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (t) onPointerMove(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (t) onPointerMove(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener('touchend', onPointerUp, { passive: true });
  window.addEventListener('touchcancel', onPointerUp, { passive: true });

  function draw() {
    ctx.clearRect(0, 0, width, height);

    // Draw filaments between nearby particles
    for (let i = 0; i < particles.length; i++) {
      const pi = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const pj = particles[j];
        const dx = pi.x - pj.x;
        const dy = pi.y - pj.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 140) {
          const alpha = (1 - dist / 140) * 0.18;
          ctx.strokeStyle = `rgba(180, 220, 255, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pi.x, pi.y);
          ctx.lineTo(pj.x, pj.y);
          ctx.stroke();
        }
      }
    }

    // Draw particles
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 90%, 70%, ${p.alpha})`;
      ctx.fill();
    }
  }

  function update() {
    const influenceR = 180;          // radius of pointer influence
    const influenceR2 = influenceR * influenceR;
    const repelStrength = 0.06;      // push away from pointer
    const attractStrength = 0.015;   // subtle attraction to pointer movement
    const friction = 0.995;

    for (const p of particles) {
      // Pointer interaction
      if (pointer.active) {
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < influenceR2 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const factor = 1 - d / influenceR; // 0..1
          // Repel
          p.vx += (dx / d) * factor * repelStrength;
          p.vy += (dy / d) * factor * repelStrength;
          // Attract along pointer movement (creates elastic trailing feel)
          p.vx += pointer.vx * factor * attractStrength;
          p.vy += pointer.vy * factor * attractStrength;
        }
      }

      p.vx *= friction;
      p.vy *= friction;
      p.x += p.vx;
      p.y += p.vy;

      // Wrap around edges
      if (p.x < -10) p.x = width + 10;
      if (p.x > width + 10) p.x = -10;
      if (p.y < -10) p.y = height + 10;
      if (p.y > height + 10) p.y = -10;
    }
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  resize();
  particles = createParticles(Math.min(120, Math.floor((width * height) / 12000)));
  window.addEventListener('resize', () => {
    resize();
    particles = createParticles(Math.min(120, Math.floor((width * height) / 12000)));
  });
  loop();
})();
