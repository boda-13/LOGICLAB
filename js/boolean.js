const LAWS = [
  { name: 'Identity', items: ['A + 0 = A', 'A · 1 = A'] },
  { name: 'Null', items: ['A + 1 = 1', 'A · 0 = 0'] },
  { name: 'Idempotent', items: ['A + A = A', 'A · A = A'] },
  { name: 'Inverse', items: ['A + Ā = 1', 'A · Ā = 0'] },
  { name: 'Double Negation', items: ['A̿ = A'] },
  { name: 'Commutative', items: ['A + B = B + A', 'A · B = B · A'] },
  { name: 'Associative', items: ['(A+B)+C = A+(B+C)', '(A·B)·C = A·(B·C)'] },
  { name: 'Distributive', items: ['A·(B+C) = AB + AC', 'A+(B·C) = (A+B)(A+C)'] },
  { name: 'Absorption', items: ['A + AB = A', 'A(A+B) = A'] },
  { name: 'De Morgan', items: ['(A·B)̄ = Ā + B̄', '(A+B)̄ = Ā · B̄'] }
];

function renderLaws() {
  const grid = document.getElementById('lawsGrid');
  if (!grid) return;
  grid.innerHTML = LAWS.map(l => `
    <div class="law-card">
      <h4>${l.name}</h4>
      ${l.items.map(i => `<code>${i}</code>`).join('')}
    </div>
  `).join('');
}

// ============ QUINE-MCCLUSKEY SIMPLIFIER ============
function simplifyExpression(input) {
  const variables = ['A', 'B', 'C', 'D'];
  const evaluate = exprToFn(input, variables);
  const minterms = [];

  for (let value = 0; value < 1 << variables.length; value++) {
    const values = variables.map((_, index) =>
      (value >> (variables.length - index - 1)) & 1
    );
    if (evaluate(...values)) minterms.push(value);
  }

  if (minterms.length === 0) return '0';
  if (minterms.length === 1 << variables.length) return '1';

  let current = minterms.map(value => ({
    pattern: value.toString(2).padStart(variables.length, '0'),
    minterms: [value]
  }));
  const primeImplicants = [];

  while (current.length) {
    const combined = new Set();
    const next = new Map();

    for (let leftIndex = 0; leftIndex < current.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < current.length; rightIndex++) {
        const left = current[leftIndex];
        const right = current[rightIndex];
        let differingIndex = -1;
        let canCombine = true;

        for (let index = 0; index < variables.length; index++) {
          if (left.pattern[index] === right.pattern[index]) continue;
          if (left.pattern[index] === '-' || right.pattern[index] === '-' || differingIndex !== -1) {
            canCombine = false;
            break;
          }
          differingIndex = index;
        }

        if (!canCombine || differingIndex === -1) continue;
        combined.add(leftIndex);
        combined.add(rightIndex);
        const pattern = left.pattern.slice(0, differingIndex) + '-' + left.pattern.slice(differingIndex + 1);
        const covered = [...new Set([...left.minterms, ...right.minterms])].sort((a, b) => a - b);
        next.set(pattern, { pattern, minterms: covered });
      }
    }

    current.forEach((implicant, index) => {
      if (!combined.has(index)) primeImplicants.push(implicant);
    });
    current = [...next.values()];
  }

  const candidates = [...new Map(primeImplicants.map(implicant => [
    implicant.pattern,
    { ...implicant, minterms: implicant.minterms.filter(value => minterms.includes(value)) }
  ])).values()].filter(implicant => implicant.minterms.length);
  let best = null;

  for (let mask = 1; mask < 1 << candidates.length; mask++) {
    const selected = candidates.filter((_, index) => mask & (1 << index));
    const covered = new Set(selected.flatMap(implicant => implicant.minterms));
    if (minterms.some(value => !covered.has(value))) continue;

    const literalCount = selected.reduce((total, implicant) =>
      total + [...implicant.pattern].filter(bit => bit !== '-').length, 0
    );
    const score = [selected.length, literalCount];
    if (!best || score[0] < best.score[0] ||
        (score[0] === best.score[0] && score[1] < best.score[1])) {
      best = { selected, score };
    }
  }

  return best.selected.map(implicant => {
    const literals = [...implicant.pattern].flatMap((bit, index) => {
      if (bit === '-') return [];
      return [bit === '1' ? variables[index] : `~${variables[index]}`];
    });
    return literals.length ? literals.join(' · ') : '1';
  }).join(' + ');
}

document.addEventListener('DOMContentLoaded', () => {
  renderLaws();

  const btn = document.getElementById('btnSimplify');
  if (btn) {
    btn.addEventListener('click', () => {
      const val = document.getElementById('boolInput').value;
      const result = document.getElementById('simplifyResult');
      try {
        result.textContent = val + '  ⇒  ' + simplifyExpression(val);
      } catch (error) {
        result.textContent = `Invalid expression: ${error.message}`;
      }
    });
  }
});