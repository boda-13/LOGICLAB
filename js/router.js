const Router = {
  current: 'dashboard',

  PAGES: ['dashboard', 'simulator', 'builder', 'truth', 'boolean'],

  TITLES: {
    dashboard: 'Dashboard',
    simulator: 'Simulator',
    builder: 'Circuit Builder',
    truth: 'Truth Tables',
    boolean: 'Boolean Algebra'
  },

  init() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        this.go(item.dataset.page);
      });
    });

    const hash = window.location.hash.replace('#', '');
    if (hash && this.PAGES.includes(hash)) {
      this.go(hash, false);
    }

    window.addEventListener('hashchange', () => {
      const page = window.location.hash.replace('#', '');
      if (this.PAGES.includes(page) && page !== this.current) {
        this.go(page, false);
      }
    });
  },

  go(page, updateHash = true) {
    if (!this.PAGES.includes(page)) return;

    this.current = page;

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`page-${page}`);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(item => {
      const isActive = item.dataset.page === page;
      item.classList.toggle('active', isActive);
      if (isActive) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });

    const bc = document.getElementById('breadcrumbs');
    if (bc) bc.textContent = this.TITLES[page] || page;

    if (updateHash && window.location.hash !== `#${page}`) window.location.hash = page;

    if (window.innerWidth <= 768) {
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('menuToggle')?.setAttribute('aria-expanded', 'false');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};
