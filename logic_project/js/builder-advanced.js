const BuilderAdvanced = {
  nodes: [],
  wires: [],
  nextNodeId: 1,
  nextWireId: 1,

  dragging: null,
  draggingWire: null,
  selectedNodeIds: new Set(),

  svg: null,
  _renderQueued: false,
  _simDirty: true,
  _panning: null,
  _indicatorTimer: null,
  _dirty: false,
  _history: {
    stack: [],
    index: -1,
    max: 50,
    suspend: false
  },

  _view: { x: 0, y: 0, w: 900, h: 600, minW: 300, maxW: 1800 },
  _autoSaveTimer: null,
  _autoSaveKey: 'logiclab_x_circuit_autosave',

  init() {
    const svg = document.getElementById('builderCanvas');
    if (!svg || svg.dataset.initialized) return;
    svg.dataset.initialized = '1';
    this.svg = svg;

    document.querySelectorAll('.palette-item').forEach(item => {
      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', item.dataset.type);
        e.dataTransfer.effectAllowed = 'copy';
      });
      item.addEventListener('click', () => {
        const pos = this.findOpenPosition();
        if (!pos) { this.toast('Canvas is full.'); return; }
        this.addNode(item.dataset.type, pos.x, pos.y);
      });
    });

    svg.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    svg.addEventListener('drop', e => {
      e.preventDefault();
      const type = e.dataTransfer.getData('text/plain');
      if (!type) return;
      const pt = this.getSVGPoint(e);
      this.addNode(type, pt.x - 45, pt.y - 30);
    });

    svg.addEventListener('pointerdown', e => this.onPointerDown(e));
    svg.addEventListener('pointermove', e => this.onPointerMove(e));
    svg.addEventListener('pointerup',   e => this.onPointerUp(e));
    window.addEventListener('pointerup', () => {
      if (this.dragging || this.draggingWire) {
        this.dragging = null;
        this.draggingWire = null;
        this.scheduleRender();
      }
    });

    svg.addEventListener('wheel', e => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.zoomAt(e.deltaY > 0 ? 1.12 : 0.89, e.clientX, e.clientY);
      } else {
        e.preventDefault();
        this._view.y += e.deltaY * (this._view.h / 600);
        this.applyViewBox();
      }
    }, { passive: false });

    svg.addEventListener('pointerdown', e => {
      if (e.button !== 1) return;
      e.preventDefault();
      this._panning = {
        startX: e.clientX,
        startY: e.clientY,
        viewX: this._view.x,
        viewY: this._view.y
      };
      svg.style.cursor = 'grabbing';
    });
    window.addEventListener('pointermove', e => {
      if (!this._panning) return;
      const rect = svg.getBoundingClientRect();
      const dx = (e.clientX - this._panning.startX) * (this._view.w / rect.width);
      const dy = (e.clientY - this._panning.startY) * (this._view.h / rect.height);
      this._view.x = this._panning.viewX - dx;
      this._view.y = this._panning.viewY - dy;
      this.applyViewBox();
    });
    window.addEventListener('pointerup', () => {
      if (this._panning) {
        this._panning = null;
        svg.style.cursor = '';
      }
    });

    const bind = (id, fn) =>
      document.getElementById(id)?.addEventListener('click', fn);
    bind('btnClear',    () => this.clear());
    bind('btnSave',     () => this.saveCircuit());
    bind('btnLoad',     () => this.loadCircuit());
    bind('btnSimulate', () => this.simulate(true));
    bind('btnUndo',     () => this.undo());
    bind('btnRedo',     () => this.redo());
    bind('btnZoomIn',   () => {
      const r = svg.getBoundingClientRect();
      this.zoomAt(0.8, r.left + r.width / 2, r.top + r.height / 2);
    });
    bind('btnZoomOut',  () => {
      const r = svg.getBoundingClientRect();
      this.zoomAt(1.25, r.left + r.width / 2, r.top + r.height / 2);
    });
    bind('btnZoomReset', () => this.resetView());

    document.addEventListener('keydown', e => {
      const tag = document.activeElement?.tagName;
      const editing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key === 'z' && !e.shiftKey && !editing) {
        e.preventDefault(); this.undo(); return;
      }
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey)) && !editing) {
        e.preventDefault(); this.redo(); return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !editing
          && this.selectedNodeIds.size) {
        e.preventDefault(); this.deleteNode(); return;
      }
      if (e.key === 'Escape') {
        this.selectedNodeIds.clear(); this.scheduleRender();
      }
      if (mod && e.key === 'a' && !editing) {
        e.preventDefault();
        this.nodes.forEach(n => this.selectedNodeIds.add(n.id));
        this.scheduleRender();
      }
    });

    this.startAutoSave();
    this.offerAutoSaveRestore();
    this.applyViewBox();
    this._snapshot();
    this.render();
    this.updateUndoRedoButtons();
  },

  getSVGPoint(e) {
    const pt = this.svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const t = pt.matrixTransform(this.svg.getScreenCTM().inverse());
    return { x: t.x, y: t.y };
  },

  addNode(type, x, y) {
    x = Math.max(0, Math.min(810, Math.round(x / 20) * 20));
    y = Math.max(0, Math.min(540, Math.round(y / 20) * 20));

    const isInput  = type === 'INPUT';
    const isOutput = type === 'OUTPUT';
    const isNot    = type === 'NOT';

    let label = '';
    if (isInput) {
      const used = new Set(this.nodes.filter(n => n.type === 'INPUT').map(n => n.label));
      let i = 0;
      while (used.has(String.fromCharCode(65 + i))) i++;
      label = String.fromCharCode(65 + i);
    }

    let inputs;
    if (isInput)       inputs = [];
    else if (isOutput) inputs = [null];
    else if (isNot)    inputs = [null];
    else               inputs = [null, null];

    this.nodes.push({
      id: this.nextNodeId++,
      type, x, y,
      value: 0,
      output: 0,
      label,
      inputs
    });

    this._snapshot();
    this._markDirty();
    this.simulate(true);
  },

  findOpenPosition() {
    for (let row = 0; row < 7; row++)
      for (let col = 0; col < 7; col++) {
        const pos = { x: 30 + col * 120, y: 30 + row * 80 };
        const busy = this.nodes.some(n =>
          pos.x < n.x + 100 && pos.x + 100 > n.x &&
          pos.y < n.y + 70  && pos.y + 70  > n.y
        );
        if (!busy) return pos;
      }
    return null;
  },

  deleteNode(id) {
    if (id === undefined) {
      if (!this.selectedNodeIds.size) return;
      this.nodes = this.nodes.filter(n => !this.selectedNodeIds.has(n.id));
      this.wires = this.wires.filter(w =>
        !this.selectedNodeIds.has(w.fromNode) && !this.selectedNodeIds.has(w.toNode)
      );
      this.selectedNodeIds.clear();
      this._snapshot();
      this._markDirty();
      this.simulate(true);
      return;
    }

    this.nodes = this.nodes.filter(n => n.id !== id);
    this.wires = this.wires.filter(w => w.fromNode !== id && w.toNode !== id);
    this.selectedNodeIds.delete(id);
    this._snapshot();
    this._markDirty();
    this.simulate(true);
  },

   clear() {
    if (!this.nodes.length) return; 
    
    this.nodes = [];
    this.wires = [];
    this.selectedNodeIds.clear();
    this.nextNodeId = 1;
    this.nextWireId = 1;
    this._snapshot();
    this._markDirty();
    this.simulate(true);
    
    this.toast('🗑️ تم مسح الكل');
  },
  getNodePorts(node) {
    const ports = [];
    const isInput  = node.type === 'INPUT';
    const isOutput = node.type === 'OUTPUT';
    const isNot    = node.type === 'NOT';
    if (!isOutput) {
      ports.push({
        type: 'output',
        x: node.x + 90,
        y: node.y + 30,
        nodeId: node.id,
        index: 0
      });
    }

    if (!isInput) {
      const count = (isNot || isOutput) ? 1 : 2;
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

  startWire(port) {
    if (port.type === 'input') {
      const occupied = this.wires.some(w =>
        w.toNode === port.nodeId && w.toPort === port.index
      );
      if (occupied) {
        this.toast('Input already connected. Drag it away first.');
        return;
      }
    }
    this.draggingWire = { from: port, x: port.x, y: port.y };
    this.scheduleRender();
  },

  finishWire(targetPort) {
    const from = this.draggingWire?.from;
    this.draggingWire = null;
    if (!from) { this.scheduleRender(); return; }

    if (from.type === targetPort.type) { this.scheduleRender(); return; }

    const out = from.type === 'output' ? from : targetPort;
    const inp = from.type === 'input'  ? from : targetPort;

    if (out.nodeId === inp.nodeId) { this.scheduleRender(); return; }

    if (this.createsCycle(out.nodeId, inp.nodeId, inp.index)) {
      this.toast('⛔ Feedback loops are not supported');
      this.scheduleRender();
      return;
    }

    const dup = this.wires.some(w =>
      w.fromNode === out.nodeId && w.fromPort === out.index &&
      w.toNode   === inp.nodeId && w.toPort   === inp.index
    );
    if (dup) { this.scheduleRender(); return; }

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

    this._snapshot();
    this._markDirty();
    this.simulate(true);
  },

  createsCycle(fromNodeId, toNodeId, toPort) {
    const stack = [toNodeId];
    const visited = new Set();

    while (stack.length) {
      const cur = stack.pop();
      if (cur === fromNodeId) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);

      this.wires.forEach(w => {
        const isReplaced = w.toNode === toNodeId && w.toPort === toPort;
        if (isReplaced) return;
        if (w.fromNode === cur) stack.push(w.toNode);
      });
    }
    return false;
  },

  onPointerDown(e) {
    if (e.button === 1) return; 
    if (e.button !== 0) return;

    const deleteBtn = e.target.closest('[data-delete]');
    if (deleteBtn) {
      e.stopPropagation(); 
      const id = Number(deleteBtn.dataset.delete);
      this.deleteNode(id);  
      this.toast('🗑️ تم حذف العنصر');
      return;
    }

    const pt = this.getSVGPoint(e);

    const port = this.findPortAt(pt.x, pt.y);
    if (port) { this.startWire(port); return; }

    const nodeEl = e.target.closest('[data-node]');
    if (nodeEl) {
      const id = Number(nodeEl.dataset.node);
      const node = this.nodes.find(n => n.id === id);
      if (!node) return;

      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        if (this.selectedNodeIds.has(id)) this.selectedNodeIds.delete(id);
        else this.selectedNodeIds.add(id);
        this.scheduleRender();
        return;
      }

      if (!this.selectedNodeIds.has(id)) {
        this.selectedNodeIds.clear();
        this.selectedNodeIds.add(id);
      }

      this.dragging = {
        ids: [...this.selectedNodeIds],
        primaryId: id,
        offsetX: pt.x - node.x,
        offsetY: pt.y - node.y,
        startX: pt.x,
        startY: pt.y,
        moved: false
      };
      this.scheduleRender();
      return;
    }

    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      this.selectedNodeIds.clear();
    }
    this.scheduleRender();
  },
  onPointerMove(e) {
    if (!this.dragging && !this.draggingWire) return;
    const pt = this.getSVGPoint(e);

    if (this.dragging) {
      const dist = Math.hypot(pt.x - this.dragging.startX, pt.y - this.dragging.startY);
      if (dist > 3) this.dragging.moved = true;
      if (!this.dragging.moved) return;

      const primary = this.nodes.find(n => n.id === this.dragging.primaryId);
      if (!primary) return;

      let newX = Math.round((pt.x - this.dragging.offsetX) / 10) * 10;
      let newY = Math.round((pt.y - this.dragging.offsetY) / 10) * 10;
      newX = Math.max(0, Math.min(810, newX));
      newY = Math.max(0, Math.min(540, newY));
      const dx = newX - primary.x;
      const dy = newY - primary.y;

      this.dragging.ids.forEach(id => {
        const n = this.nodes.find(x => x.id === id);
        if (!n) return;
        n.x = Math.max(0, Math.min(810, n.x + dx));
        n.y = Math.max(0, Math.min(540, n.y + dy));
      });
      this.scheduleRender();
    }

    if (this.draggingWire) {
      this.draggingWire.x = pt.x;
      this.draggingWire.y = pt.y;
      this.scheduleRender();
    }
  },

  onPointerUp(e) {
    const pt = this.getSVGPoint(e);

    if (this.draggingWire) {
      const port = this.findPortAt(pt.x, pt.y);
      if (port) this.finishWire(port);
      else { this.draggingWire = null; this.scheduleRender(); }
    }

    if (this.dragging && !this.dragging.moved) {
      if (this.dragging.ids.length === 1) {
        const node = this.nodes.find(n => n.id === this.dragging.primaryId);
        if (node?.type === 'INPUT') {
          node.value = node.value ? 0 : 1;
          this._snapshot();
          this._markDirty();
          this.dragging = null;
          this.simulate(true);
          return;
        }
      }
    }

    if (this.dragging?.moved) {
      this._snapshot();
      this._markDirty();
    }
    this.dragging = null;
  },

  findPortAt(x, y) {
    const thr = 14;
    for (const node of this.nodes) {
      for (const p of this.getNodePorts(node)) {
        if (Math.hypot(x - p.x, y - p.y) < thr) return p;
      }
    }
    return null;
  },

  scheduleRender() {
    if (this._renderQueued) return;
    this._renderQueued = true;
    requestAnimationFrame(() => {
      this._renderQueued = false;
      this.render();
    });
  },

  render() {
    if (!this.svg) return;
    const parts = [];

    parts.push(`
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10"
          refX="8" refY="3" orient="auto">
          <polygon points="0 0, 10 3, 0 6" fill="#5f9133"/>
        </marker>
        <marker id="arrow-green" markerWidth="10" markerHeight="10"
          refX="8" refY="3" orient="auto">
          <polygon points="0 0, 10 3, 0 6" fill="#2f8b5b"/>
        </marker>
      </defs>
    `);

    this.wires.forEach(w => {
      const fromNode = this.nodes.find(n => n.id === w.fromNode);
      const toNode   = this.nodes.find(n => n.id === w.toNode);
      if (!fromNode || !toNode) return;

      const fromPort = this.getNodePorts(fromNode)
        .find(p => p.type === 'output' && p.index === w.fromPort);
      const toPort = this.getNodePorts(toNode)
        .find(p => p.type === 'input' && p.index === w.toPort);
      if (!fromPort || !toPort) return;

      const active = fromNode.output === 1;
      const path = this.bezierPath(fromPort.x, fromPort.y, toPort.x, toPort.y);

      parts.push(`<path d="${path}"
        fill="none"
        stroke="${active ? '#2f8b5b' : '#99a391'}"
        stroke-width="3"
        class="wire ${active ? 'wire-animated' : ''}"
        marker-end="url(#${active ? 'arrow-green' : 'arrow'})"/>`);
    });

    if (this.draggingWire) {
      const f = this.draggingWire.from;
      const path = this.bezierPath(f.x, f.y, this.draggingWire.x, this.draggingWire.y);
      parts.push(`<path d="${path}" fill="none" stroke="#5f9133"
        stroke-width="2" stroke-dasharray="6 4" opacity="0.8"
        marker-end="url(#arrow)"/>`);
    }

    this.nodes.forEach(n => parts.push(this.renderNode(n)));

    this.svg.innerHTML = parts.join('');

    this.updateExpression();
    if (this._simDirty) this.updateTruthTable();
    this._simDirty = false;
  },

  bezierPath(x1, y1, x2, y2) {
    const dx = x2 - x1;

    if (dx > 20) {
      const curve = Math.max(40, Math.abs(dx) * 0.5);
      return `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
    }

    if (dx < -20) {
      const curve = Math.max(60, Math.abs(dx) * 0.7);
      const midY = (y1 + y2) / 2;
      return `M ${x1} ${y1} ` +
             `C ${x1 + curve} ${y1}, ${x1 + curve} ${midY}, ${(x1 + x2) / 2} ${midY} ` +
             `S ${x2 - curve} ${midY}, ${x2 - curve} ${y2} ` +
             `S ${x2 - curve} ${y2}, ${x2} ${y2}`;
    }

    const curve = Math.max(40, Math.abs(y2 - y1) * 0.5);
    return `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
  },

  gateNodeMarkup(node, selected) {
    const { x, y, type } = node;
    const sw = selected ? 3 : 2;
    const inverted = ['NAND', 'NOR', 'XNOR'].includes(type);
    const base = type === 'NAND' ? 'AND'
               : type === 'NOR'  ? 'OR'
               : type === 'XNOR' ? 'XOR' : type;

    let body = '', extra = '';

    if (base === 'NOT') {
      body  = `<path d="M ${x} ${y} L ${x} ${y + 60} L ${x + 66} ${y + 30} Z"/>`;
      extra = `<circle cx="${x + 76}" cy="${y + 30}" r="8"/>`;
    } else if (base === 'AND') {
      body = `<path d="M ${x} ${y} H ${x + 40} C ${x + 66} ${y}, ${x + 78} ${y + 12}, ${x + 78} ${y + 30} C ${x + 78} ${y + 48}, ${x + 66} ${y + 60}, ${x + 40} ${y + 60} H ${x} Z"/>`;
    } else {
      body = `<path d="M ${x} ${y} C ${x + 28} ${y + 3}, ${x + 60} ${y + 10}, ${x + 78} ${y + 30} C ${x + 60} ${y + 50}, ${x + 28} ${y + 57}, ${x} ${y + 60} C ${x + 10} ${y + 44}, ${x + 10} ${y + 16}, ${x} ${y} Z"/>`;
      if (base === 'XOR')
        extra = `<path d="M ${x - 8} ${y} C ${x + 2} ${y + 16}, ${x + 2} ${y + 44}, ${x - 8} ${y + 60}" fill="none"/>`;
    }
    if (inverted) extra += `<circle cx="${x + 84}" cy="${y + 30}" r="6"/>`;

    return `<g fill="#fffdf7" stroke="#101513" stroke-width="${sw}" stroke-linejoin="round">${body}${extra}</g>
      <text x="${x + 40}" y="${y + 35}" class="builder-gate-label">${type}</text>`;
  },

   renderNode(node) {
    const isInput  = node.type === 'INPUT';
    const isOutput = node.type === 'OUTPUT';
    const selected = this.selectedNodeIds.has(node.id);
    const stroke   = selected ? '#c98225' : '#5f9133';
    const sw       = selected ? 3 : 2;
    const parts    = [`<g data-node="${node.id}" style="cursor:move">`];

    if (isInput) {
      const on = node.value === 1;
      parts.push(`
        <rect x="${node.x}" y="${node.y}" width="90" height="60" rx="12"
          fill="${on ? 'rgba(95,145,51,.18)' : '#f3f0e5'}"
          stroke="${on ? '#5f9133' : stroke}" stroke-width="${sw}"/>
        <text x="${node.x + 45}" y="${node.y + 32}"
          fill="${on ? '#426d25' : '#687366'}"
          style="font:700 22px 'JetBrains Mono',monospace;text-anchor:middle;pointer-events:none">${node.value}</text>
        <text x="${node.x + 45}" y="${node.y + 50}"
          fill="#687366"
          style="font:600 11px 'JetBrains Mono',monospace;text-anchor:middle;pointer-events:none">${node.label || 'IN'}</text>`);
    } else if (isOutput) {
      const on = node.value === 1;
      parts.push(`
        <rect x="${node.x}" y="${node.y}" width="90" height="60" rx="12"
          fill="${on ? 'rgba(47,139,91,.18)' : '#f3f0e5'}"
          stroke="${on ? '#2f8b5b' : stroke}" stroke-width="${sw}"/>
        <text x="${node.x + 45}" y="${node.y + 30}"
          fill="${on ? '#2f8b5b' : '#687366'}"
          style="font:700 14px 'JetBrains Mono',monospace;text-anchor:middle;pointer-events:none">OUT</text>
        <text x="${node.x + 45}" y="${node.y + 50}"
          fill="${on ? '#2f8b5b' : '#687366'}"
          style="font:700 16px 'JetBrains Mono',monospace;text-anchor:middle;pointer-events:none">${node.value}</text>`);
    } else {
      parts.push(this.gateNodeMarkup(node, selected));
    }

    this.getNodePorts(node).forEach(p => {
      const hover = this.draggingWire &&
        Math.hypot(this.draggingWire.x - p.x, this.draggingWire.y - p.y) < 14;
      parts.push(`
        <circle cx="${p.x}" cy="${p.y}" r="${hover ? 9 : 6}"
          fill="${p.type === 'output' ? '#5f9133' : '#c98225'}"
          stroke="#fffefa" stroke-width="2"
          style="cursor:crosshair;transition:r .12s"/>`);
    });

    parts.push(`
      <g class="delete-btn" data-delete="${node.id}" style="cursor:pointer;">
        <circle cx="${node.x + 90}" cy="${node.y - 5}" r="12" 
          fill="#fffefa" stroke="#c8574d" stroke-width="2" 
          style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));"/>
        <text x="${node.x + 90}" y="${node.y + 0.5}" 
          fill="#c8574d" 
          style="font: 700 16px 'JetBrains Mono',monospace; text-anchor:middle; pointer-events:none;">×</text>
      </g>
    `);

    parts.push('</g>');
    return parts.join('');
  },
  simulate(forceRender = false) {
    const MAX = this.nodes.length + 1;
    let stable = false;

    for (let iter = 0; iter < MAX && !stable; iter++) {
      const before = this.nodes.map(n => n.output).join(',');
      this.nodes.forEach(node => {
        let val = 0;
        if (node.type === 'INPUT') {
          val = node.value;
        } else if (node.type === 'OUTPUT') {
          const w = this.wires.find(w => w.toNode === node.id && w.toPort === 0);
          const src = w ? this.nodes.find(n => n.id === w.fromNode) : null;
          val = src ? src.output : 0;
        } else {
          const ins = [];
          const n = node.type === 'NOT' ? 1 : 2;
          for (let i = 0; i < n; i++) {
            const w = this.wires.find(w => w.toNode === node.id && w.toPort === i);
            const src = w ? this.nodes.find(n2 => n2.id === w.fromNode) : null;
            ins.push(src ? src.output : 0);
          }
          switch (node.type) {
            case 'NOT':  val = ins[0] ? 0 : 1; break;
            case 'AND':  val = ins[0] & ins[1]; break;
            case 'OR':   val = ins[0] | ins[1]; break;
            case 'NAND': val = (ins[0] & ins[1]) ? 0 : 1; break;
            case 'NOR':  val = (ins[0] | ins[1]) ? 0 : 1; break;
            case 'XOR':  val = ins[0] ^ ins[1]; break;
            case 'XNOR': val = (ins[0] ^ ins[1]) ? 0 : 1; break;
          }
        }
        node.output = val;
        if (node.type === 'OUTPUT') node.value = val;
      });
      const after = this.nodes.map(n => n.output).join(',');
      stable = before === after;
    }

    this._simDirty = true;
    if (forceRender) this.render();
    else this.scheduleRender();
  },

  updateExpression() {
    const el = document.getElementById('builderExpr');
    if (!el) return;
    const out = this.nodes.find(n => n.type === 'OUTPUT');
    if (!out) { el.textContent = '—'; return; }
    const expr = this.traceExpression(out.id, new Set(), 0);
    el.textContent = 'Y = ' + (expr || '—');
  },

  traceExpression(nodeId, stack, depth) {
    if (depth > 30 || stack.has(nodeId)) return '?';
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return '0';

    if (node.type === 'INPUT') return node.label || 'A';

    if (node.type === 'OUTPUT') {
      const w = this.wires.find(w => w.toNode === nodeId && w.toPort === 0);
      if (!w) return '0';
      stack.add(nodeId);
      const r = this.traceExpression(w.fromNode, stack, depth + 1);
      stack.delete(nodeId);
      return r;
    }

    const ins = [];
    const n = node.type === 'NOT' ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const w = this.wires.find(w => w.toNode === nodeId && w.toPort === i);
      ins.push(w ? this.traceExpression(w.fromNode, stack, depth + 1) : '0');
    }

    if (node.type === 'NOT') return `(${ins[0]})'`;

    const sym = { AND: '·', OR: '+', NAND: '↑', NOR: '↓', XOR: '⊕', XNOR: '⊙' }[node.type] || '?';
    return `(${ins[0]} ${sym} ${ins[1]})`;
  },

  updateTruthTable() {
    const container = document.getElementById('builderTruth');
    if (!container) return;

    const inputs = this.nodes.filter(n => n.type === 'INPUT');
    const outNode = this.nodes.find(n => n.type === 'OUTPUT');

    if (!inputs.length || !outNode) {
      container.innerHTML = '<div style="padding:20px;color:var(--text-dim)">Build a circuit to generate table</div>';
      return;
    }
    if (inputs.length > 6) {
      container.innerHTML = '<div style="padding:20px;color:var(--warning)">Too many inputs (max 6)</div>';
      return;
    }

    const backup = this.nodes.map(n => ({ id: n.id, value: n.value, output: n.output }));
    const rows = [];
    const total = 1 << inputs.length;

    for (let i = 0; i < total; i++) {
      inputs.forEach((n, k) => {
        n.value = (i >> (inputs.length - 1 - k)) & 1;
      });

      const state = new Map();
      this.nodes.forEach(n => state.set(n.id, n.type === 'INPUT' ? n.value : 0));

      let stable = false;
      for (let iter = 0; iter <= this.nodes.length && !stable; iter++) {
        const before = [...state.values()].join(',');
        this.nodes.forEach(node => {
          if (node.type === 'INPUT') return;
          let val = 0;
          if (node.type === 'OUTPUT') {
            const w = this.wires.find(w => w.toNode === node.id && w.toPort === 0);
            val = w ? (state.get(w.fromNode) || 0) : 0;
          } else {
            const ins = [];
            const n = node.type === 'NOT' ? 1 : 2;
            for (let k = 0; k < n; k++) {
              const w = this.wires.find(w => w.toNode === node.id && w.toPort === k);
              ins.push(w ? (state.get(w.fromNode) || 0) : 0);
            }
            switch (node.type) {
              case 'NOT':  val = ins[0] ? 0 : 1; break;
              case 'AND':  val = ins[0] & ins[1]; break;
              case 'OR':   val = ins[0] | ins[1]; break;
              case 'NAND': val = (ins[0] & ins[1]) ? 0 : 1; break;
              case 'NOR':  val = (ins[0] | ins[1]) ? 0 : 1; break;
              case 'XOR':  val = ins[0] ^ ins[1]; break;
              case 'XNOR': val = (ins[0] ^ ins[1]) ? 0 : 1; break;
            }
          }
          state.set(node.id, val);
        });
        const after = [...state.values()].join(',');
        stable = before === after;
      }

      rows.push({
        inputs: inputs.map(n => n.value),
        output: state.get(outNode.id) || 0
      });
    }

    backup.forEach(b => {
      const n = this.nodes.find(x => x.id === b.id);
      if (n) { n.value = b.value; n.output = b.output; }
    });

    const names = inputs.map(n => n.label || '?');
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

  _snapshot() {
    if (this._history.suspend) return;
    const snap = {
      nodes: JSON.parse(JSON.stringify(this.nodes)),
      wires: JSON.parse(JSON.stringify(this.wires)),
      nextNodeId: this.nextNodeId,
      nextWireId: this.nextWireId
    };

    this._history.stack = this._history.stack.slice(0, this._history.index + 1);
    this._history.stack.push(snap);

    if (this._history.stack.length > this._history.max) {
      this._history.stack.shift();
    }
    this._history.index = this._history.stack.length - 1;
    this.updateUndoRedoButtons();
  },

  _canUndo() { return this._history.index > 0; },
  _canRedo() { return this._history.index < this._history.stack.length - 1; },

  undo() {
    if (!this._canUndo()) { this.toast('لا يوجد شيء للتراجع عنه'); return; }
    this._history.index--;
    this._restoreSnapshot(this._history.stack[this._history.index]);
    this.toast('↶ Undo');
  },

  redo() {
    if (!this._canRedo()) { this.toast('لا يوجد شيء لإعادته'); return; }
    this._history.index++;
    this._restoreSnapshot(this._history.stack[this._history.index]);
    this.toast('↷ Redo');
  },

  _restoreSnapshot(snap) {
    this._history.suspend = true;
    this.nodes = JSON.parse(JSON.stringify(snap.nodes));
    this.wires = JSON.parse(JSON.stringify(snap.wires));
    this.nextNodeId = snap.nextNodeId;
    this.nextWireId = snap.nextWireId;
    this.selectedNodeIds.clear();
    this._history.suspend = false;
    this._markDirty();
    this.simulate(true);
    this.updateUndoRedoButtons();
  },

  updateUndoRedoButtons() {
    const u = document.getElementById('btnUndo');
    const r = document.getElementById('btnRedo');
    if (u) u.disabled = !this._canUndo();
    if (r) r.disabled = !this._canRedo();
  },

  applyViewBox() {
    const v = this._view;
    this.svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  },

  zoomAt(factor, clientX, clientY) {
    const v = this._view;
    const newW = Math.max(v.minW, Math.min(v.maxW, v.w * factor));
    if (newW === v.w) return;

    const rect = this.svg.getBoundingClientRect();
    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top) / rect.height;

    const worldX = v.x + px * v.w;
    const worldY = v.y + py * v.h;

    v.w = newW;
    v.h = newW * (600 / 900);
    v.x = worldX - px * v.w;
    v.y = worldY - py * v.h;

    this.applyViewBox();
    this.updateZoomLabel();
  },

  resetView() {
    this._view = { x: 0, y: 0, w: 900, h: 600, minW: 300, maxW: 1800 };
    this.applyViewBox();
    this.updateZoomLabel();
  },

  updateZoomLabel() {
    const label = document.getElementById('zoomLabel');
    if (label) {
      const pct = Math.round((900 / this._view.w) * 100);
      label.textContent = `${pct}%`;
    }
  },

  startAutoSave() {
    if (this._autoSaveTimer) clearInterval(this._autoSaveTimer);
    this._autoSaveTimer = setInterval(() => {
      if (!this._dirty) return;
      if (!this.nodes.length) return;
      this._autoSave();
    }, 30000);

    window.addEventListener('beforeunload', () => {
      if (this._dirty && this.nodes.length) this._autoSave();
    });
  },

  _markDirty() { this._dirty = true; },

  _autoSave() {
    try {
      const data = {
        nodes: this.nodes,
        wires: this.wires,
        nextNodeId: this.nextNodeId,
        nextWireId: this.nextWireId,
        timestamp: Date.now()
      };
      localStorage.setItem(this._autoSaveKey, JSON.stringify(data));
      this._dirty = false;
      this._showAutoSaveIndicator();
    } catch (e) {
      console.warn('Auto-save failed:', e);
    }
  },

  _showAutoSaveIndicator() {
    const el = document.getElementById('autosaveIndicator');
    if (!el) return;
    el.textContent = '✓ محفوظ تلقائياً';
    el.classList.add('visible');
    clearTimeout(this._indicatorTimer);
    this._indicatorTimer = setTimeout(() => {
      el.classList.remove('visible');
    }, 2000);
  },

  offerAutoSaveRestore() {
    try {
      const raw = localStorage.getItem(this._autoSaveKey);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data.nodes?.length) return;

      const manual = localStorage.getItem('logiclab_x_circuit');
      if (manual) {
        const m = JSON.parse(manual);
        if (m.nodes?.length >= data.nodes.length) return;
      }

      const ago = Math.round((Date.now() - data.timestamp) / 60000);
      
      const modal = document.getElementById('restoreModal');
      const msg = document.getElementById('restoreModalMsg');
      const btnYes = document.getElementById('btnRestoreYes');
      const btnNo = document.getElementById('btnRestoreNo');

      if (!modal || !btnYes || !btnNo) {
        if (!confirm(`استعادة المسودة التلقائية من ${ago} دقيقة؟`)) return;
        this._loadAutoSaveData(data);
        return;
      }

      msg.textContent = `لقد وجدنا مسودة محفوظة تلقائياً منذ ${ago} دقيقة. هل تريد استعادتها؟`;
      modal.classList.remove('hidden');

      btnYes.onclick = () => {
        modal.classList.add('hidden');
        this._loadAutoSaveData(data);
      };

      btnNo.onclick = () => {
        modal.classList.add('hidden');
      };

    } catch (e) {}
  },

  _loadAutoSaveData(data) {
    this._history.suspend = true;
    this.nodes = data.nodes;
    this.wires = data.wires;
    this.nextNodeId = data.nextNodeId || 1;
    this.nextWireId = data.nextWireId || 1;
    this._history.suspend = false;
    this._snapshot();
    this._markDirty();
    this.simulate(true);
    this.toast('📂 تم استعادة المسودة');
  },
  saveCircuit() {
    const data = {
      nodes: this.nodes,
      wires: this.wires,
      nextNodeId: this.nextNodeId,
      nextWireId: this.nextWireId
    };
    try {
      localStorage.setItem('logiclab_x_circuit', JSON.stringify(data));
      localStorage.removeItem(this._autoSaveKey);
      this._dirty = false;

      const s = Storage.load();
      Storage.update({ circuitsBuilt: (s.circuitsBuilt || 0) + 1 });

      if (typeof confettiBurst === 'function') confettiBurst();
      this.toast('✅ Circuit saved!');
      if (typeof updateDashboardStats === 'function') updateDashboardStats();
    } catch (e) {
      console.error(e);
      this.toast('❌ Failed to save');
    }
  },

  loadCircuit() {
    try {
      const raw = localStorage.getItem('logiclab_x_circuit');
      if (!raw) { this.toast('⚠ No saved circuit found'); return; }
      const data = JSON.parse(raw);
      this.nodes = data.nodes || [];
      this.wires = data.wires || [];
      this.nextNodeId = data.nextNodeId || 1;
      this.nextWireId = data.nextWireId || 1;
      this.selectedNodeIds.clear();
      this._snapshot();
      this._markDirty();
      this.simulate(true);
      this.toast('📂 Circuit loaded');
    } catch (e) {
      console.error(e);
      this.toast('❌ Failed to load circuit');
    }
  },

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


document.addEventListener('DOMContentLoaded', () => {
  const tryInit = () => {
    if (document.getElementById('builderCanvas')) BuilderAdvanced.init();
    else setTimeout(tryInit, 200);
  };
  setTimeout(tryInit, 300);
});