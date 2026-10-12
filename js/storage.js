const Storage = {
  KEY: 'logiclab_x_state',

  default: {
    circuitsBuilt: 0,
    lastPlayed: null,
    theme: 'dark'
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      return raw ? { ...this.default, ...JSON.parse(raw) } : { ...this.default };
    } catch {
      return { ...this.default };
    }
  },

  save(state) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Storage save failed:', e);
    }
  },

  update(patch) {
    const s = this.load();
    const next = { ...s, ...patch };
    this.save(next);
    return next;
  },

  reset() {
    localStorage.removeItem(this.KEY);
    localStorage.removeItem('logiclab_x_circuit');
    return { ...this.default };
  }
};