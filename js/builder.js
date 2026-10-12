const Builder = {
  nodes: [],
  nextId: 1,
  selected: null,
  output: 0,

  init() {
    const canvas = document.getElementById('builderCanvas');
    const palette = document.getElementById('palette');
    if (!canvas || !palette) return;

    // Drag from palette
    palette.querySelectorAll('.palette-item').forEach(item => {
      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('type', item.dataset.type);
      });
    });

    canvas.addEventListener('dragover', e => e.preventDefault());
    canvas.addEventListener('drop', e => {
      e.preventDefault();
      const type = e.dataTransfer.getData('type');
      if (!type) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.addNode(type, x - 40, y - 25);
    });

    // Click on node = toggle input value or delete
    canvas.addEventListener('click', e => {
      const node = e.target.closest('[data-node]');
      if (!node) return;
      const id = Number(node.dataset.node);
      const n = this.nodes.find(x => x.id === id);
      if (!n) return;

      if (n.type === 'INPUT') {
        n.value = n.value ? 0 : 1;
        this.simulate();
      }
    });

    // Buttons
    document.getElementById('btnClear')?.addEventListener('click', () => {
      this.nodes = [];
      this.render();
    });
    document.getElementById('btnSave')?.addEventListener('click', () => {
      Storage.update({ circuitsBuilt: (Storage.load().circuitsBuilt || 0) + 1 });
      XP.add(30, 'Circuit saved');
      alert('✅ Circuit saved! +30 XP');
      this.updateDashboardStats();
    });
    document.getElementById('btnSimulate')?.addEventListener('click', () => {
      this.simulate();
    });
  },

  addNode(type, x, y) {
    const isInput = type === 'INPUT';
    const isOutput = type === 'OUTPUT';
    const n = {
      id: this.nextId++,
      type,
      x, y,
      value: 0,
      inputs: isInput ? [] : (type === 'NOT' ? [null] : [null, null]),
      output: 0,
      parents: []
    };
    this.nodes.push(n);
    this.render();
  },

  render() {
    const svg = document.getElementById('builderCanvas');
    if (!svg) return;

    let html = '';

    // Draw nodes
    this.nodes.forEach(n => {
      const color = n.type === 'INPUT'
        ? (n.value ? 'var(--primary)' : '#374151')
        : n.type === 'OUTPUT'
        ? (n.value ? 'var(--success)' : '#374151')
        : 'var(--primary)';

      if (n.type === 'INPUT' || n.type === 'OUTPUT') {
        html += `
          <g data-node="${n.id}" style="cursor:pointer">
            <circle cx="${n.x + 40}" cy="${n.y + 30}" r="26"
              fill="${n.value ? 'rgba(0,217,255,.2)' : 'var(--surface-2)'}"
              stroke="${color}" stroke-width="2"/>
            <text x="${n.x + 40}" y="${n.y + 36}" class="gate-text"
              fill="${color}">${n.value}</text>
            <text x="${n.x + 40}" y="${n.y + 76}" class="gate-text"
              fill="var(--text-dim)" font-size="11">${n.type}</text>
          </g>`;
      } else {
        html += `
          <g data-node="${n.id}">
            <rect x="${n.x}" y="${n.y}" width="80" height="60" rx="12"
              class="gate-body"/>
            <text x="${n.x + 40}" y="${n.y + 36}" class="gate-text">${n.type}</text>
          </g>`;
      }
    });

    svg.innerHTML = html;
  },

  simulate() {
    // Simple propagation: just compute each gate based on inputs
    // (For simplicity, assuming single-gate circuits)
    const nodes = this.nodes;
    let lastOut = 0;

    nodes.forEach(n => {
      if (n.type === 'INPUT') {
        n.output = n.value;
      } else if (n.type === 'OUTPUT') {
        n.value = lastOut;
      } else {
        const inputs = n.inputs.map(i => i == null ? 0 : i);
        if (n.type === 'NOT') {
          n.output = inputs[0] ? 0 : 1;
        } else {
          n.output = GATES[n.type](inputs[0], inputs[1]);
        }
        lastOut = n.output;
      }
    });

    this.render();
    this.updateExpr();
  },

  updateExpr() {
    const inputs = this.nodes.filter(n => n.type === 'INPUT');
    const gates = this.nodes.filter(n =>
      !['INPUT','OUTPUT'].includes(n.type)
    );
    if (!gates.length) {
      document.getElementById('builderExpr').textContent = '—';
      return;
    }
    const names = inputs.map((_, i) => String.fromCharCode(65 + i));
    const g = gates[0];
    let expr = '';
    if (g.type === 'NOT') expr = `${names[0]}̄`;
    else expr = `(${names[0]} ${g.type} ${names[1] || '?'})`;
    document.getElementById('builderExpr').textContent = 'Y = ' + expr;
  },

  updateDashboardStats() {
    const s = Storage.load();
    const el = document.getElementById('statCircuits');
    if (el) el.textContent = s.circuitsBuilt || 0;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  Builder.init();
  Builder.updateDashboardStats();
});