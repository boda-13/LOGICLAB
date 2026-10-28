document.addEventListener('DOMContentLoaded', () => {
  // Sidebar toggle
  const toggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  if (toggle && sidebar) {
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      toggle.setAttribute('aria-expanded', sidebar.classList.contains('open'));
    });
  }

  // Init router
  Router.init();

  // Update dashboard stats
  updateDashboardStats();

  document.getElementById('openSavedCircuit')?.addEventListener('click', () => {
    Router.go('builder');
    if (window.BuilderAdvanced) BuilderAdvanced.loadCircuit();
  });

  // Reveal animations
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('fade-in');
    });
  }, { threshold: 0.05 });

  document.querySelectorAll('.stat-card, .quick-card, .panel, .law-card')
    .forEach(el => observer.observe(el));

  console.log('%c⚡ LogicLab X', 'color:#5f9133;font-size:26px;font-weight:bold');
  console.log('%cDigital Logic Suite Ready', 'color:#c98225;font-size:12px');
});

function updateDashboardStats() {
  const s = Storage.load();
  const count = document.getElementById('statCircuits');
  if (count) count.textContent = s.circuitsBuilt || 0;

  const title = document.getElementById('savedCircuitTitle');
  const meta = document.getElementById('savedCircuitMeta');
  const openButton = document.getElementById('openSavedCircuit');
  if (!title || !meta || !openButton) return;

  let circuit = null;
  try {
    circuit = JSON.parse(localStorage.getItem('logiclab_x_circuit') || 'null');
  } catch {
    title.textContent = 'Saved circuit could not be read';
    meta.textContent = 'Open the builder to create and save a new circuit.';
    openButton.hidden = true;
    return;
  }

  if (!circuit || !Array.isArray(circuit.nodes)) {
    title.textContent = 'No saved circuit yet';
    meta.textContent = 'Create a circuit and save it to keep it here.';
    openButton.hidden = true;
    return;
  }

  const nodeCount = circuit.nodes.length;
  const wireCount = Array.isArray(circuit.wires) ? circuit.wires.length : 0;
  title.textContent = nodeCount ? 'Your saved circuit is ready' : 'Saved workspace is empty';
  meta.textContent = `${nodeCount} ${nodeCount === 1 ? 'node' : 'nodes'} · ${wireCount} ${wireCount === 1 ? 'connection' : 'connections'}`;
  openButton.hidden = false;
}