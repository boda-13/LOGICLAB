const GATES = {
  AND:  (a,b) => a & b,
  OR:   (a,b) => a | b,
  NOT:  (a)   => a ? 0 : 1,
  NAND: (a,b) => (a & b) ? 0 : 1,
  NOR:  (a,b) => (a | b) ? 0 : 1,
  XOR:  (a,b) => a ^ b,
  XNOR: (a,b) => (a ^ b) ? 0 : 1
};

const EXPRESSIONS = {
  AND:'Y = A · B',
  OR:'Y = A + B',
  NOT:'Y = Ā',
  NAND:'Y = (A · B)̄',
  NOR:'Y = (A + B)̄',
  XOR:'Y = A ⊕ B',
  XNOR:'Y = (A ⊕ B)̄'
};

const SimState = { gate: 'AND', A: 0, B: 0, output: 0 };

function simCompute() {
  SimState.output = SimState.gate === 'NOT'
    ? GATES.NOT(SimState.A)
    : GATES[SimState.gate](SimState.A, SimState.B);
  return SimState.output;
}

function simRender() {
  simCompute();

  // Gate buttons
  document.querySelectorAll('#gateSelector .gate-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.gate === SimState.gate);
  });

  // Expression
  const exprEl = document.getElementById('expression');
  if (exprEl) exprEl.textContent = EXPRESSIONS[SimState.gate];

  // Output
  const display = document.getElementById('outputDisplay');
  const value = document.getElementById('outputValue');
  const label = document.getElementById('outputState');
  if (display) {
    value.textContent = SimState.output;
    display.classList.toggle('high', SimState.output === 1);
    display.classList.toggle('low', SimState.output === 0);
    label.textContent = SimState.output === 1 ? 'HIGH' : 'LOW';
  }

  // Input toggles
  const inputBRow = document.getElementById('inputBRow');
  if (inputBRow) {
    const isNot = SimState.gate === 'NOT';
    inputBRow.style.opacity = isNot ? '0.3' : '1';
    inputBRow.style.pointerEvents = isNot ? 'none' : 'auto';
    inputBRow.querySelectorAll('button').forEach(button => {
      button.disabled = isNot;
    });
  }

  document.querySelectorAll('.toggle').forEach(t => {
    const name = t.dataset.input;
    t.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.value) === SimState[name]);
    });
  });

  simRenderCircuit();
  if (typeof renderTruthTable === 'function') {
    renderTruthTable(SimState.gate, SimState.A, SimState.B);
  }
}

function gateGraphic(type, x, y, width, height) {
  const midY = y + height / 2;
  const inverted = ['NAND', 'NOR', 'XNOR'].includes(type);
  const baseType = type === 'NAND' ? 'AND' : type === 'NOR' ? 'OR' : type === 'XNOR' ? 'XOR' : type;
  const stroke = '#101513';
  const fill = '#fffdf7';
  let shape = '';
  let extra = '';
  let outX = x + width;

  if (baseType === 'NOT') {
    const tip = x + width - 24;
    shape = `<path d="M ${x} ${y} L ${x} ${y + height} L ${tip} ${midY} Z"/>`;
    extra = `<circle cx="${tip + 10}" cy="${midY}" r="10"/>`;
    outX = tip + 20;
  } else if (baseType === 'AND') {
    const flat = x + width * .52;
    shape = `<path d="M ${x} ${y} H ${flat} C ${x + width * .88} ${y}, ${x + width} ${y + height * .24}, ${x + width} ${midY} C ${x + width} ${y + height * .76}, ${x + width * .88} ${y + height}, ${flat} ${y + height} H ${x} Z"/>`;
  } else {
    const end = x + width;
    shape = `<path d="M ${x} ${y} C ${x + width * .34} ${y + height * .05}, ${x + width * .72} ${y + height * .15}, ${end} ${midY} C ${x + width * .72} ${y + height * .85}, ${x + width * .34} ${y + height * .95}, ${x} ${y + height} C ${x + width * .14} ${y + height * .7}, ${x + width * .14} ${y + height * .3}, ${x} ${y} Z"/>`;
    if (baseType === 'XOR') {
      extra = `<path class="xor-line" d="M ${x - 12} ${y} C ${x + width * .02} ${y + height * .3}, ${x + width * .02} ${y + height * .7}, ${x - 12} ${y + height}"/>`;
    }
  }

  if (inverted) {
    const bubbleX = outX + 11;
    extra += `<circle cx="${bubbleX}" cy="${midY}" r="10"/>`;
    outX = bubbleX + 10;
  }

  return {
    outX,
    markup: `<g class="logic-gate-symbol" fill="${fill}" stroke="${stroke}" stroke-width="5" stroke-linejoin="round">${shape}${extra}</g><text x="${x + width * .52}" y="${midY + 7}" class="gate-label">${type}</text>`
  };
}

function simRenderCircuit() {
  const svg = document.getElementById('circuitSvg');
  if (!svg) return;

  const isNot = SimState.gate === 'NOT';
  const aOn = SimState.A === 1;
  const bOn = SimState.B === 1;
  const outOn = SimState.output === 1;
  const aY = isNot ? 120 : 80;
  const gate = gateGraphic(SimState.gate, 260, 55, 150, 130);

  svg.innerHTML = `
    <circle cx="55" cy="${aY}" r="10" fill="${aOn ? 'var(--primary)' : '#374151'}"/>
    <text x="55" y="48" class="gate-text">A = ${SimState.A}</text>
    <path d="M 75 ${aY} L 260 ${aY}" class="wire ${aOn ? 'active wire-animated' : ''}"/>

    ${!isNot ? `
      <circle cx="55" cy="160" r="10" fill="${bOn ? 'var(--primary)' : '#374151'}"/>
      <text x="55" y="224" class="gate-text">B = ${SimState.B}</text>
      <path d="M 75 160 L 260 160" class="wire ${bOn ? 'active wire-animated' : ''}"/>
    ` : ''}

    ${gate.markup}

    <path d="M ${gate.outX} 120 L 590 120" class="wire ${outOn ? 'out-active wire-animated' : ''}"/>
    <circle cx="620" cy="120" r="18" class="led ${outOn ? 'on' : ''}"/>
    <text x="620" y="170" class="gate-text">OUT = ${SimState.output}</text>
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#gateSelector .gate-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      SimState.gate = btn.dataset.gate;
      simRender();
    });
  });

  document.querySelectorAll('.toggle').forEach(t => {
    t.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        SimState[t.dataset.input] = Number(b.dataset.value);
        simRender();
      });
    });
  });

  simRender();
});
