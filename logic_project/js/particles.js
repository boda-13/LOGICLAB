(function initParticles() {
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const particles = [];
  const count = Math.min(50, Math.floor(window.innerWidth / 30));

  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      char: Math.random() > 0.5 ? '1' : '0',
      speed: 0.2 + Math.random() * 0.5,
      size: 10 + Math.random() * 12,
      alpha: 0.05 + Math.random() * 0.12
    });
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#00D9FF';
    particles.forEach(p => {
      ctx.globalAlpha = p.alpha;
      ctx.font = `${p.size}px 'JetBrains Mono', monospace`;
      ctx.fillText(p.char, p.x, p.y);
      p.y -= p.speed;
      if (p.y < -20) { p.y = h + 20; p.x = Math.random() * w; }
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  draw();
})();

function confettiBurst() {
  const colors = ['#00D9FF','#7C3AED','#10B981','#F59E0B','#EF4444'];
  for (let i = 0; i < 30; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * window.innerWidth + 'px';
    c.style.top = '-10px';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDelay = Math.random() * 0.3 + 's';
    c.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 2300);
  }
}