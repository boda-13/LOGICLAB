function renderTruthTable(gate, curA, curB) {
  const tbody = document.querySelector('#truthTable tbody');
  if (!tbody) return;

  if (gate === 'NOT') {
    tbody.innerHTML = `
      <tr class="${curA === 0 ? 'active-row' : ''}">
        <td>0</td><td>—</td>
        <td class="output-cell high">1</td>
      </tr>
      <tr class="${curA === 1 ? 'active-row' : ''}">
        <td>1</td><td>—</td>
        <td class="output-cell low">0</td>
      </tr>`;
    return;
  }

  const rows = [[0, 0], [0, 1], [1, 0], [1, 1]];
  tbody.innerHTML = rows.map(([a, b]) => {
    const out = GATES[gate](a, b);
    const isActive = a === curA && b === curB;
    return `
      <tr class="${isActive ? 'active-row' : ''}">
        <td>${a}</td><td>${b}</td>
        <td class="output-cell ${out ? 'high' : 'low'}">${out}</td>
      </tr>`;
  }).join('');
}

// ============ TRUTH TABLE GENERATOR PAGE ============
let truthVars = 2;

function exprToFn(expr, varNames) {
  const tokens = [];
  let index = 0;

  while (index < expr.length) {
    if (/\s/.test(expr[index])) {
      index++;
      continue;
    }

    const match = expr.slice(index).match(/^(NAND|NOR|XNOR|AND|OR|XOR|NOT|[A-D]|[01]|[()+¬∑*^⊕↑↓⊙~!&|])/i);
    if (!match) throw new Error(`Unexpected character: ${expr[index]}`);

    const raw = match[0].toUpperCase();
    const aliases = {
      '·': 'AND', '*': 'AND', '&': 'AND',
      '+': 'OR', '|': 'OR',
      '^': 'XOR', '⊕': 'XOR',
      '↑': 'NAND', '↓': 'NOR',
      '⊙': 'XNOR',
      '~': 'NOT', '!': 'NOT', '¬': 'NOT'
    };
    tokens.push(aliases[raw] || raw);
    index += match[0].length;
  }

  const expanded = [];
  const endsValue = token => /^[A-D]$/.test(token) || /^[01]$/.test(token) || token === ')';
  const startsValue = token => /^[A-D]$/.test(token) || /^[01]$/.test(token) || token === '(' || token === 'NOT';
  tokens.forEach((token, tokenIndex) => {
    const previous = tokens[tokenIndex - 1];
    if (previous && endsValue(previous) && startsValue(token)) expanded.push('AND');
    expanded.push(token);
  });

  let position = 0;
  const parsePrimary = () => {
    const token = expanded[position++];
    if (token === '(') {
      const value = parseOr();
      if (expanded[position++] !== ')') throw new Error('Missing closing parenthesis');
      return value;
    }
    if (/^[A-D]$/.test(token || '')) {
      const variableIndex = varNames.indexOf(token);
      if (variableIndex < 0) throw new Error(`${token} is not selected as a variable`);
      return values => values[variableIndex];
    }
    if (/^[01]$/.test(token || '')) return () => Number(token);
    throw new Error('Expected a variable, 0, 1, or opening parenthesis');
  };
  const parseUnary = () => {
    if (expanded[position] === 'NOT') {
      position++;
      const value = parseUnary();
      return values => value(values) ? 0 : 1;
    }
    return parsePrimary();
  };
  const parseAnd = () => {
    let left = parseUnary();
    while (['AND', 'NAND'].includes(expanded[position])) {
      const operator = expanded[position];
      position++;
      const right = parseUnary();
      const previous = left;
      left = values => {
        const result = previous(values) && right(values);
        return operator === 'NAND' ? Number(!result) : Number(result);
      };
    }
    return left;
  };
  const parseXor = () => {
    let left = parseAnd();
    while (['XOR', 'XNOR'].includes(expanded[position])) {
      const operator = expanded[position];
      position++;
      const right = parseAnd();
      const previous = left;
      left = values => Number((previous(values) !== right(values)) !== (operator === 'XNOR'));
    }
    return left;
  };
  const parseOr = () => {
    let left = parseXor();
    while (['OR', 'NOR'].includes(expanded[position])) {
      const operator = expanded[position];
      position++;
      const right = parseXor();
      const previous = left;
      left = values => {
        const result = previous(values) || right(values);
        return operator === 'NOR' ? Number(!result) : Number(result);
      };
    }
    return left;
  };

  if (!expanded.length) throw new Error('Enter a Boolean expression');
  const evaluate = parseOr();
  if (position !== expanded.length) throw new Error(`Unexpected token: ${expanded[position]}`);
  return (...values) => evaluate(values);
}

function generateTruthTable() {
  const expr = document.getElementById('truthExpr').value.trim();
  const varNames = ['A', 'B', 'C', 'D'].slice(0, truthVars);
  const output = document.getElementById('truthOutput');
  let fn;
  try {
    fn = exprToFn(expr, varNames);
  } catch (error) {
    output.textContent = `Invalid expression: ${error.message}`;
    return;
  }
  const total = 1 << truthVars;

  let html = `<table class="truth-table"><thead><tr>
    ${varNames.map(v => `<th>${v}</th>`).join('')}
    <th>OUTPUT</th></tr></thead><tbody>`;

  for (let i = 0; i < total; i++) {
    const vals = varNames.map((_, k) => (i >> (truthVars - 1 - k)) & 1);
    const out = fn(...vals);
    html += `<tr>
      ${vals.map(v => `<td>${v}</td>`).join('')}
      <td class="output-cell ${out ? 'high' : 'low'}">${out}</td>
    </tr>`;
  }
  html += '</tbody></table>';
  output.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#varSelector .gate-btn').forEach(b => {
    b.addEventListener('click', () => {
      truthVars = Number(b.dataset.vars);
      document.querySelectorAll('#varSelector .gate-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      generateTruthTable();
    });
  });

  const gen = document.getElementById('btnGenTruth');
  if (gen) gen.addEventListener('click', generateTruthTable);

  const expression = document.getElementById('truthExpr');
  if (expression) {
    expression.addEventListener('keydown', event => {
      if (event.key === 'Enter') generateTruthTable();
    });
    generateTruthTable();
  }
});