// ============================================
// ADVANCED CIRCUIT BUILDER
// Drag nodes, connect wires, live simulation
// ============================================

const BuilderAdvanced = {
  nodes: [],
  wires: [],
  nextNodeId: 1,
  nextWireId: 1,
  dragging: null,
  draggingWire: null,
  selectedPort: null,
  svg: null,

  // ============ INIT ============
  init() {
    const svg = document.getElementById('builderCanvas');
    if (!svg) return;
    this.svg = svg;

    // Palette drag
    document.querySelectorAll('.palette-item').forEach(item => {
      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('type', item.dataset.type);
        e.dataTransfer.effectAllowed = 'copy';
      });
      item.addEventListener('click', () => {
        const position = this.findOpenPosition();
        if (!position) {
          this.toast('Canvas is full. Move or delete a node first.');
          return;
        }
        this.addNode(item.dataset.type, position.x, position.y);
      });
    });

    // Drop on canvas
    svg.addEventListener('dragover', e => e.preventDefault());
    svg.addEventListener('drop', e => {
      e.preventDefault();
      const type = e.dataTransfer.getData('type');
      if (!type) return;
      const pt = this.getSVGPoint(e);
      this.addNode(type, pt.x - 45, pt.y - 30);
    });

    // Mouse events
    svg.addEventListener('pointerdown', e => {
      this.onMouseDown(e);
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', e => this.onMouseMove(e));
    svg.addEventListener('pointerup', e => this.onMouseUp(e));
    document.addEventListener('pointerup', () => this.onGlobalMouseUp());

    // Buttons
    const bindClick = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };
    bindClick('btnClear', () => this.clear());
    bindClick('btnSave', () => this.saveCircuit());
    bindClick('btnLoad', () => this.loadCircuit());
    bindClick('btnSimulate', () => this.simulate());

    // Keyboard
    document.addEventListener('keydown', e => {
      if ((e.key === 'Delete' || e.key === 'Backspace') &&
          this.selectedPort?.type === 'node') {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        this.deleteNode(this.selectedPort.id);
      }
    });

    this.render();
  },

  // ============ COORDINATES ============
  getSVGPoint(e) {
    const point = this.svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const transformed = point.matrixTransform(this.svg.getScreenCTM().inverse());
    return { x: transformed.x, y: transformed.y };
  },

  // ============ NODES ============
  addNode(type, x, y) {
    // Snap to grid
    x = Math.round(x / 20) * 20;
    y = Math.round(y / 20) * 20;

    // Clamp inside canvas
    x = Math.max(0, Math.min(810, x));
    y = Math.max(0, Math.min(540, y));

    const isInput = type === 'INPUT';
    const isOutput = type === 'OUTPUT';
    const isNot = type === 'NOT';

    // Auto-label inputs: A, B, C, D...
    let label = '';
    if (isInput) {
      const usedLabels = new Set(
        this.nodes.filter(n => n.type === 'INPUT').map(n => n.label)
      );
      let index = 0;
      while (usedLabels.has(String.fromCharCode(65 + index))) index++;
      label = String.fromCharCode(65 + index);
    }

    const node = {
      id: this.nextNodeId++,
      type,
      x, y,
      value: 0,
      output: 0,
      label,
      inputs: isInput ? [] : (isNot ? [null] : [null, null])
    };

    this.nodes.push(node);
    this.render();
    this.simulate();
  },

  findOpenPosition() {
    for (let row = 0; row < 7; row++) {
      for (let column = 0; column < 7; column++) {
        const position = { x: 30 + column * 120, y: 30 + row * 80 };
        const occupied = this.nodes.some(node =>
          position.x < node.x + 100 && position.x + 100 > node.x &&
          position.y < node.y + 70 && position.y + 70 > node.y
        );
        if (!occupied) return position;
      }
    }
    return null;
  },

  deleteNode(id) {
    this.nodes = this.nodes.filter(n => n.id !== id);
    this.wires = this.wires.filter(w => w.fromNode !== id && w.toNode !== id);
    this.selectedPort = null;
    this.render();
    this.simulate();
  },

  clear() {
    if (this.nodes.length && !confirm('Clear all nodes and wires?')) return;
    this.nodes = [];
    this.wires = [];
    this.selectedPort = null;
    this.nextNodeId = 1;
    this.nextWireId = 1;
    this.render();
  },

  // ============ PORTS ============
  getNodePorts(node) {
    const ports = [];
    const isInput = node.type === 'INPUT';
    const isOutput = node.type === 'OUTPUT';
    const isNot = node.type === 'NOT';

    // Output port (right side)
    if (!isOutput) {
      ports.push({
        type: 'output',
        x: node.x + 90,
        y: node.y + 30,
        nodeId: node.id,
        index: 0
      });
    }

    // Input ports (left side)
    if (!isInput) {
      const count = isNot ? 1 : 2;
      for (let i = 0; i < count; i++) {
        const y = count === 1 ? node.y + 30 : node.y + 20 + i * 20;
        ports.push({
          type: 'input',
          x: node.x,
          y,
          nodeId: node.id,
          index: i
        });
      }
    }

    return ports;
  },

  // ============ WIRES ============
  startWire(port) {
    this.draggingWire = {
      from: port,
      x: port.x,
      y: port.y
    };
  },

  finishWire(targetPort) {
    const from = this.draggingWire.from;

    if (from.type === targetPort.type) {
      this.draggingWire = null;
      this.render();
      return;
    }

    const out = from.type === 'output' ? from : targetPort;
    const inp = from.type === 'input' ? from : targetPort;

    if (out.nodeId === inp.nodeId) {
      this.draggingWire = null;
      this.render();
      return;
    }

    if (this.createsCycle(out.nodeId, inp.nodeId, inp.index)) {
      this.draggingWire = null;
      this.render();
      this.toast('Feedback loops are not supported');
      return;
    }

    const exists = this.wires.some(w =>
      w.fromNode === out.nodeId && w.fromPort === out.index &&
      w.toNode === inp.nodeId && w.toPort === inp.index
    );
    if (exists) {
      this.draggingWire = null;
      this.render();
      return;
    }

    // Remove existing wire going to same input
    this.wires = this.wires.filter(w =>
      !(w.toNode === inp.nodeId && w.toPort === inp.index)
    );

    this.wires.push({
      id: this.nextWireId++,
      fromNode: out.nodeId,
      fromPort: out.index,
      toNode: inp.nodeId,
      toPort: inp.index
    });

    this.draggingWire = null;
    this.render();
    this.simulate();
  },

  createsCycle(fromNodeId, toNodeId, toPort) {
    const pending = [toNodeId];
    const visited = new Set();

    while (pending.length) {
      const nodeId = pending.pop();
      if (nodeId === fromNodeId) return true;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      this.wires.forEach(wire => {
        const replacedInput = wire.toNode === toNodeId && wire.toPort === toPort;
        if (wire.fromNode === nodeId && !replacedInput) pending.push(wire.toNode);
      });
    }

    return false;
  },

  // ============ MOUSE EVENTS ============
  onMouseDown(e) {
    if (e.button !== 0) return;
    const pt = this.getSVGPoint(e);

    // Clicked on a port: either end can begin a connection.
    const port = this.findPortAt(pt.x, pt.y);
    if (port) {
      this.startWire(port);
      this.render();
      return;
    }

    // Clicked on node?
    const nodeEl = e.target.closest('[data-node]');
    if (nodeEl) {
      const id = Number(nodeEl.dataset.node);
      const node = this.nodes.find(n => n.id === id);
      if (!node) return;

      this.selectedPort = { type: 'node', id };
      this.dragging = {
        id,
        offsetX: pt.x - node.x,
        offsetY: pt.y - node.y,
        moved: false
      };
      this.render();
      return;
    }

    // Empty space
    this.selectedPort = null;
    this.render();
  },

  onMouseMove(e) {
    if (!this.dragging && !this.draggingWire) return;
    const pt = this.getSVGPoint(e);

    if (this.dragging) {
      const node = this.nodes.find(n => n.id === this.dragging.id);
      if (!node) return;
      this.dragging.moved = true;
      node.x = Math.max(0, Math.min(810,
        Math.round((pt.x - this.dragging.offsetX) / 10) * 10));
      node.y = Math.max(0, Math.min(540,
        Math.round((pt.y - this.dragging.offsetY) / 10) * 10));
      this.render();
    }

    if (this.draggingWire) {
      this.draggingWire.x = pt.x;
      this.draggingWire.y = pt.y;
      this.render();
    }
  },

  onMouseUp(e) {
    if (this.draggingWire) {
      const pt = this.getSVGPoint(e);
      const port = this.findPortAt(pt.x, pt.y);
      if (port) {
        this.finishWire(port);
      } else {
        this.draggingWire = null;
        this.render();
      }
    }

    // Click without move on INPUT → toggle
    if (this.dragging && !this.dragging.moved) {
      const node = this.nodes.find(n => n.id === this.dragging.id);
      if (node && node.type === 'INPUT') {
        node.value = node.value ? 0 : 1;
        this.render();
        this.simulate();
      }
    }

    this.dragging = null;
  },

  onGlobalMouseUp() {
    this.dragging = null;
  },

  findPortAt(x, y) {
    const threshold = 16;
    for (const node of this.nodes) {
      for (const port of this.getNodePorts(node)) {
        const dx = x - port.x;
        const dy = y - port.y;
        if (Math.sqrt(dx * dx + dy * dy) < threshold) return port;
      }
    }
    return null;
  },

  // ============ RENDER ============
  render() {
    if (!this.svg) return;
    const svg = this.svg;

    let html = `
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10"
          refX="8" refY="3" orient="auto">
          <polygon points="0 0, 10 3, 0 6" fill="var(--primary)"/>
        </marker>
        <marker id="arrow-green" markerWidth="10" markerHeight="10"
          refX="8" refY="3" orient="auto">
          <polygon points="0 0, 10 3, 0 6" fill="var(--success)"/>
        </marker>
      </defs>
    `;

    // Wires
    this.wires.forEach(w => {
      const fromNode = this.nodes.find(n => n.id === w.fromNode);
      const toNode = this.nodes.find(n => n.id === w.toNode);
      if (!fromNode || !toNode) return;

      const fromPorts = this.getNodePorts(fromNode);
      const toPorts = this.getNodePorts(toNode);
      const fromPort = fromPorts.find(p => p.type === 'output' && p.index === w.fromPort);
      const toPort = toPorts.find(p => p.type === 'input' && p.index === w.toPort);
      if (!fromPort || !toPort) return;

      const active = fromNode.output === 1;
      const path = this.bezierPath(fromPort.x, fromPort.y, toPort.x, toPort.y);

      html += `<path d="${path}"
        class="wire ${active ? 'active wire-animated' : ''}"
        fill="none" stroke-width="3"
        stroke="${active ? 'var(--success)' : '#374151'}"
        marker-end="url(#${active ? 'arrow-green' : 'arrow'})"/>`;
    });

    // Dragging wire
    if (this.draggingWire) {
      const from = this.draggingWire.from;
      const path = this.bezierPath(from.x, from.y, this.draggingWire.x, this.draggingWire.y);
      html += `<path d="${path}" fill="none" stroke="var(--primary)"
        stroke-width="2" stroke-dasharray="6 4" opacity="0.7"
        marker-end="url(#arrow)"/>`;
    }

    // Nodes
    this.nodes.forEach(node => {
      html += this.renderNode(node);
    });

    svg.innerHTML = html;

    // Update panels
    this.updateExpression();
    this.updateTruthTable();
  },

  bezierPath(x1, y1, x2, y2) {
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  },

  gateNodeMarkup(node, borderColor, selected) {
    const { x, y, type } = node;
    const strokeWidth = selected ? 3 : 2;
    const inverted = ['NAND', 'NOR', 'XNOR'].includes(type);
    const base = type === 'NAND' ? 'AND' : type === 'NOR' ? 'OR' : type === 'XNOR' ? 'XOR' : type;
    let body = '';
    let extra = '';

    if (base === 'NOT') {
      body = `<path d="M ${x} ${y} L ${x} ${y + 60} L ${x + 66} ${y + 30} Z"/>`;
      extra = `<circle cx="${x + 76}" cy="${y + 30}" r="8"/>`;
    } else if (base === 'AND') {
      body = `<path d="M ${x} ${y} H ${x + 40} C ${x + 66} ${y}, ${x + 78} ${y + 12}, ${x + 78} ${y + 30} C ${x + 78} ${y + 48}, ${x + 66} ${y + 60}, ${x + 40} ${y + 60} H ${x} Z"/>`;
    } else {
      body = `<path d="M ${x} ${y} C ${x + 28} ${y + 3}, ${x + 60} ${y + 10}, ${x + 78} ${y + 30} C ${x + 60} ${y + 50}, ${x + 28} ${y + 57}, ${x} ${y + 60} C ${x + 10} ${y + 44}, ${x + 10} ${y + 16}, ${x} ${y} Z"/>`;
      if (base === 'XOR') extra = `<path d="M ${x - 8} ${y} C ${x + 2} ${y + 16}, ${x + 2} ${y + 44}, ${x - 8} ${y + 60}" fill="none"/>`;
    }
    if (inverted) extra += `<circle cx="${x + 84}" cy="${y + 30}" r="6"/>`;

    return `<g class="builder-gate-symbol" fill="#fffdf7" stroke="#101513" stroke-width="${strokeWidth}" stroke-linejoin="round">${body}${extra}</g><text x="${x + 40}" y="${y + 35}" class="builder-gate-label">${type}</text>`;
  },

  renderNode(node) {
    const isInput = node.type === 'INPUT';
    const isOutput = node.type === 'OUTPUT';
    const selected = this.selectedPort?.type === 'node' && this.selectedPort.id === node.id;
    const borderColor = selected ? 'var(--secondary)' : 'var(--primary)';

    let html = `<g data-node="${node.id}" style="cursor:move">`;

    if (isInput) {
      const on = node.value === 1;
      html += `
        <rect x="${node.x}" y="${node.y}" width="90" height="60" rx="12"
          fill="${on ? 'rgba(0,217,255,.18)' : 'var(--surface-2)'}"
          stroke="${on ? 'var(--primary)' : borderColor}"
          stroke-width="${selected ? 3 : 2}"
          style="cursor:pointer;transition:fill .2s,stroke .2s"/>
        <text x="${node.x + 45}" y="${node.y + 32}" class="gate-text"
          fill="${on ? 'var(--primary)' : 'var(--text-dim)'}"
          style="font-size:22px;pointer-events:none;user-select:none">${node.value}</text>
        <text x="${node.x + 45}" y="${node.y + 50}" class="gate-text"
          fill="var(--text-dim)"
          style="font-size:11px;pointer-events:none;user-select:none">
          ${node.label || 'IN'}
        </text>`;
    } else if (isOutput) {
      const on = node.value === 1;
      html += `
        <rect x="${node.x}" y="${node.y}" width="90" height="60" rx="12"
          fill="${on ? 'rgba(16,185,129,.18)' : 'var(--surface-2)'}"
          stroke="${on ? 'var(--success)' : borderColor}"
          stroke-width="${selected ? 3 : 2}"/>
        <text x="${node.x + 45}" y="${node.y + 30}" class="gate-text"
          fill="${on ? 'var(--success)' : 'var(--text-dim)'}"
          style="font-size:14px;pointer-events:none;user-select:none">OUT</text>
        <text x="${node.x + 45}" y="${node.y + 50}" class="gate-text"
          fill="${on ? 'var(--success)' : 'var(--text-dim)'}"
          style="font-size:16px;pointer-events:none;user-select:none">${node.value}</text>`;
    } else {
      html += this.gateNodeMarkup(node, borderColor, selected);
    }

    // Ports
    const ports = this.getNodePorts(node);
    ports.forEach(p => {
      const isHovered = this.draggingWire &&
        Math.hypot(this.draggingWire.x - p.x, this.draggingWire.y - p.y) < 16;
      html += `
        <circle cx="${p.x}" cy="${p.y}" r="${isHovered ? 9 : 6}"
          fill="${p.type === 'output' ? 'var(--primary)' : 'var(--secondary)'}"
          stroke="var(--bg)" stroke-width="2"
          style="cursor:crosshair;transition:r .15s"/>`;
    });

    html += '</g>';
    return html;
  },

  // ============ SIMULATION ============
  simulate() {
    const MAX_ITER = this.nodes.length + 1;
    let stable = false;

    for (let iter = 0; iter < MAX_ITER && !stable; iter++) {
      const before = this.nodes.map(n => n.output).join(',');

      this.nodes.forEach(node => {
        let val = 0;

        if (node.type === 'INPUT') {
          val = node.value;
        } else if (node.type === 'OUTPUT') {
          const wire = this.wires.find(w => w.toNode === node.id);
          const src = wire ? this.nodes.find(n => n.id === wire.fromNode) : null;
          val = src ? src.output : 0;
        } else {
          const inputs = [];
          const numIn = node.type === 'NOT' ? 1 : 2;
          for (let i = 0; i < numIn; i++) {
            const wire = this.wires.find(w =>
              w.toNode === node.id && w.toPort === i
            );
            const src = wire ? this.nodes.find(n => n.id === wire.fromNode) : null;
            inputs.push(src ? src.output : 0);
          }

          if (node.type === 'NOT') val = inputs[0] ? 0 : 1;
          else if (node.type === 'AND') val = inputs[0] & inputs[1];
          else if (node.type === 'OR') val = inputs[0] | inputs[1];
          else if (node.type === 'NAND') val = (inputs[0] & inputs[1]) ? 0 : 1;
          else if (node.type === 'NOR') val = (inputs[0] | inputs[1]) ? 0 : 1;
          else if (node.type === 'XOR') val = inputs[0] ^ inputs[1];
          else if (node.type === 'XNOR') val = (inputs[0] ^ inputs[1]) ? 0 : 1;
        }

        node.output = val;
        if (node.type === 'OUTPUT') node.value = val;
      });

      const after = this.nodes.map(n => n.output).join(',');
      stable = before === after;
    }

    this.render();
  },

  // ============ EXPRESSION ============
  updateExpression() {
    const exprEl = document.getElementById('builderExpr');
    if (!exprEl) return;

    const outputNode = this.nodes.find(n => n.type === 'OUTPUT');
    if (!outputNode) {
      exprEl.textContent = '—';
      return;
    }

    const expr = this.traceExpression(outputNode.id, {}, 0);
    exprEl.textContent = 'Y = ' + (expr || '—');
  },

  traceExpression(nodeId, memo, depth) {
    if (depth > 20) return '?';
    if (memo[nodeId] !== undefined) return memo[nodeId];

    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return '0';

    if (node.type === 'INPUT') {
      memo[nodeId] = node.label || 'A';
      return memo[nodeId];
    }

    if (node.type === 'OUTPUT') {
      const wire = this.wires.find(w => w.toNode === nodeId);
      return wire ? this.traceExpression(wire.fromNode, memo, depth + 1) : '0';
    }

    const inputs = [];
    const numIn = node.type === 'NOT' ? 1 : 2;
    for (let i = 0; i < numIn; i++) {
      const wire = this.wires.find(w => w.toNode === nodeId && w.toPort === i);
      inputs.push(wire ? this.traceExpression(wire.fromNode, memo, depth + 1) : '0');
    }

    if (node.type === 'NOT') {
      memo[nodeId] = `${inputs[0]}̄`;
      return memo[nodeId];
    }

    const symMap = {
      AND: ' · ',
      OR: ' + ',
      NAND: ' ↑ ',
      NOR: ' ↓ ',
      XOR: ' ⊕ ',
      XNOR: ' ⊙ '
    };
    const sym = symMap[node.type] || ' ? ';
    memo[nodeId] = `(${inputs[0]}${sym}${inputs[1]})`;
    return memo[nodeId];
  },

  // ============ TRUTH TABLE ============
  updateTruthTable() {
    const container = document.getElementById('builderTruth');
    if (!container) return;

    const inputNodes = this.nodes.filter(n => n.type === 'INPUT');
    const outputNode = this.nodes.find(n => n.type === 'OUTPUT');

    if (!inputNodes.length || !outputNode) {
      container.innerHTML = '<div style="padding:20px;color:var(--text-dim)">Build a circuit to generate table</div>';
      return;
    }

    if (inputNodes.length > 6) {
      container.innerHTML = '<div style="padding:20px;color:var(--warning)">Too many inputs (max 6)</div>';
      return;
    }

    const total = 1 << inputNodes.length;
    const rows = [];
    const originalState = this.nodes.map(n => ({
      value: n.value,
      output: n.output
    }));

    for (let i = 0; i < total; i++) {
      inputNodes.forEach((n, k) => {
        n.value = (i >> (inputNodes.length - 1 - k)) & 1;
      });

      // Simulate
      this.nodes.forEach(n => {
        if (n.type === 'INPUT') n.output = n.value;
      });

      for (let iter = 0; iter <= this.nodes.length; iter++) {
        const before = this.nodes.map(n => n.output).join(',');
        this.nodes.forEach(node => {
          if (node.type === 'INPUT') return;
          let val = 0;
          if (node.type === 'OUTPUT') {
            const wire = this.wires.find(w => w.toNode === node.id);
            const src = wire ? this.nodes.find(n => n.id === wire.fromNode) : null;
            val = src ? src.output : 0;
          } else {
            const inputs = [];
            const numIn = node.type === 'NOT' ? 1 : 2;
            for (let k = 0; k < numIn; k++) {
              const wire = this.wires.find(w => w.toNode === node.id && w.toPort === k);
              const src = wire ? this.nodes.find(n => n.id === wire.fromNode) : null;
              inputs.push(src ? src.output : 0);
            }
            if (node.type === 'NOT') val = inputs[0] ? 0 : 1;
            else if (node.type === 'AND') val = inputs[0] & inputs[1];
            else if (node.type === 'OR') val = inputs[0] | inputs[1];
            else if (node.type === 'NAND') val = (inputs[0] & inputs[1]) ? 0 : 1;
            else if (node.type === 'NOR') val = (inputs[0] | inputs[1]) ? 0 : 1;
            else if (node.type === 'XOR') val = inputs[0] ^ inputs[1];
            else if (node.type === 'XNOR') val = (inputs[0] ^ inputs[1]) ? 0 : 1;
          }
          node.output = val;
        });
        const after = this.nodes.map(n => n.output).join(',');
        if (before === after) break;
      }

      const out = this.nodes.find(n => n.id === outputNode.id).output;
      rows.push({
        inputs: inputNodes.map(n => n.value),
        output: out
      });
    }

    // Truth-table evaluation must not trigger another render cycle.
    this.nodes.forEach((n, index) => {
      n.value = originalState[index].value;
      n.output = originalState[index].output;
    });

    const names = inputNodes.map(n => n.label || '?');
    container.innerHTML = `
      <table class="truth-table">
        <thead><tr>
          ${names.map(n => `<th>${n}</th>`).join('')}
          <th>OUT</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              ${r.inputs.map(v => `<td>${v}</td>`).join('')}
              <td class="output-cell ${r.output ? 'high' : 'low'}">${r.output}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  },

  // ============ SAVE / LOAD ============
  saveCircuit() {
    const data = {
      nodes: this.nodes,
      wires: this.wires,
      nextNodeId: this.nextNodeId,
      nextWireId: this.nextWireId
    };

    try {
      localStorage.setItem('logiclab_x_circuit', JSON.stringify(data));

      // Update counter
      const s = Storage.load();
      Storage.update({ circuitsBuilt: (s.circuitsBuilt || 0) + 1 });

      if (typeof confettiBurst === 'function') confettiBurst();
      this.toast('✅ Circuit saved!');

      // Refresh dashboard
      if (typeof updateDashboardStats === 'function') {
        updateDashboardStats();
      }
    } catch (e) {
      console.error(e);
      this.toast('❌ Failed to save');
    }
  },

  loadCircuit() {
    try {
      const raw = localStorage.getItem('logiclab_x_circuit');
      if (!raw) {
        this.toast('⚠ No saved circuit found');
        return;
      }
      const data = JSON.parse(raw);
      this.nodes = data.nodes || [];
      this.wires = data.wires || [];
      this.nextNodeId = data.nextNodeId || 1;
      this.nextWireId = data.nextWireId || 1;
      this.selectedPort = null;
      this.render();
      this.simulate();
      this.toast('📂 Circuit loaded');
    } catch (e) {
      console.error(e);
      this.toast('❌ Failed to load circuit');
    }
  },

  // ============ TOAST ============
  toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);

    setTimeout(() => {
      t.style.transition = 'opacity .3s, transform .3s';
      t.style.opacity = '0';
      t.style.transform = 'translateX(40px) scale(.9)';
      setTimeout(() => t.remove(), 300);
    }, 2200);
  }
};

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
  const tryInit = () => {
    const canvas = document.getElementById('builderCanvas');
    if (canvas) {
      BuilderAdvanced.init();
    } else {
      setTimeout(tryInit, 200);
    }
  };
  setTimeout(tryInit, 300);
});
