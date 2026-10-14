/**
 * Campus Inn+ — Shared Application Module
 * Auth, Theme, Navigation, Toast, Form Validation
 * Preserves original Stitch design; adds frontend logic only.
 */

/* ═══════════════════════════════════════════
   1. TOAST NOTIFICATION SYSTEM
   ═══════════════════════════════════════════ */
const Toast = (() => {
  let container;
  function getContainer() {
    if (!container) {
      container = document.createElement('div');
      container.id = 'ci-toast-container';
      container.setAttribute('role', 'status');
      container.setAttribute('aria-live', 'polite');
      Object.assign(container.style, {
        position: 'fixed', bottom: '24px', right: '24px',
        zIndex: '9999', display: 'flex', flexDirection: 'column',
        gap: '8px', pointerEvents: 'none', maxWidth: '380px'
      });
      document.body.appendChild(container);
    }
    return container;
  }

  function show(message, type = 'info', duration = 4000) {
    const el = document.createElement('div');
    el.style.pointerEvents = 'auto';
    const colors = {
      success: { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46', icon: 'check_circle' },
      error:   { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', icon: 'error' },
      warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', icon: 'warning' },
      info:    { bg: '#ede9fe', border: '#ddd6fe', text: '#5b21b6', icon: 'info' }
    };
    const c = colors[type] || colors.info;
    el.className = 'ci-toast';
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;
        background:${c.bg};border:1px solid ${c.border};border-radius:12px;
        box-shadow:0 4px 12px rgba(0,0,0,.08);font-family:'Hanken Grotesk',sans-serif;
        font-size:14px;color:${c.text};transition:all .3s ease;transform:translateX(100%);opacity:0">
        <span class="material-symbols-outlined" style="font-size:20px">${c.icon}</span>
        <span style="flex:1;font-weight:500">${message}</span>
        <button onclick="this.closest('.ci-toast').remove()" style="background:none;border:none;cursor:pointer;color:${c.text};padding:2px;display:flex">
          <span class="material-symbols-outlined" style="font-size:18px">close</span>
        </button>
      </div>`;
    getContainer().appendChild(el);
    requestAnimationFrame(() => {
      const inner = el.querySelector('div');
      inner.style.transform = 'translateX(0)';
      inner.style.opacity = '1';
    });
    if (duration > 0) {
      setTimeout(() => {
        const inner = el.querySelector('div');
        if (inner) { inner.style.transform = 'translateX(100%)'; inner.style.opacity = '0'; }
        setTimeout(() => el.remove(), 300);
      }, duration);
    }
  }
  return { show, success: (m,d) => show(m,'success',d), error: (m,d) => show(m,'error',d),
           warning: (m,d) => show(m,'warning',d), info: (m,d) => show(m,'info',d) };
})();

/* ═══════════════════════════════════════════
   2. AUTHENTICATION MANAGER
   ═══════════════════════════════════════════ */
const Auth = (() => {
  const STORAGE_KEY = 'ci_auth';
  const ROLES = {
    student:     { label: 'Student',                dashboard: 'student.html',     icon: 'school' },
    faculty:     { label: 'Faculty',                 dashboard: 'faculty.html',     icon: 'badge' },
    admin:       { label: 'College Admin',           dashboard: 'admin.html',       icon: 'admin_panel_settings' },
    tpo:         { label: 'Placement Officer',       dashboard: 'placement.html',   icon: 'work' },
    coordinator: { label: 'Event / Club Coordinator',dashboard: 'coordinator.html', icon: 'celebration' },
    recruiter:   { label: 'Company / HR',            dashboard: 'company.html',     icon: 'apartment' }
  };

  function getSession() {
    try {
      const sess = JSON.parse(localStorage.getItem(STORAGE_KEY));
      // Automatically purge obsolete client-side mock sessions or hardcoded test identities
      if (sess && (sess.isMock || sess._source === 'DEV_MOCK' || !sess.id)) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('ci_token');
        return null;
      }
      return sess;
    } catch {
      return null;
    }
  }

  function setSession(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('ci_token');
  }
  function isAuthenticated() { return !!getSession(); }
  function getRole() { const s = getSession(); return s ? s.role : null; }
  function getUser() { return getSession(); }
  function getRoleConfig(role) { return ROLES[role] || null; }
  function getDashboardUrl() {
    const role = getRole();
    return role && ROLES[role] ? ROLES[role].dashboard : 'login.html';
  }

  async function login(identifier, password, role) {
    if (!identifier || !identifier.trim()) throw new Error('Please enter your ID or college email.');
    if (!password || !password.trim()) throw new Error('Please enter your password.');

    if (typeof window.CampusInnAPI !== 'undefined') {
      const result = await window.CampusInnAPI.auth.login(identifier.trim(), password, role);
      if (result.data) {
        setSession(result.data);
        if (result.token) {
          localStorage.setItem('ci_token', result.token);
        }
        return result.data;
      }
      if (result.error) {
        throw new Error(result.error);
      }
    }

    throw new Error('Authentication service unavailable.');
  }

  async function registerStudent(payload) {
    if (typeof window.CampusInnAPI !== 'undefined') {
      const result = await window.CampusInnAPI.auth.registerStudent(payload);
      if (result.data) {
        return result.data;
      }
      if (result.error) {
        throw new Error(result.error);
      }
    }
    throw new Error('Registration service unavailable.');
  }

  async function registerFaculty(payload) {
    if (typeof window.CampusInnAPI !== 'undefined') {
      const result = await window.CampusInnAPI.auth.registerFaculty(payload);
      if (result.data) {
        return result.data;
      }
      if (result.error) {
        throw new Error(result.error);
      }
    }
    throw new Error('Registration service unavailable.');
  }

  async function registerCoordinator(payload) {
    if (typeof window.CampusInnAPI !== 'undefined') {
      const result = await window.CampusInnAPI.auth.registerCoordinator(payload);
      if (result.data) {
        return result.data;
      }
      if (result.error) {
        throw new Error(result.error);
      }
    }
    throw new Error('Registration service unavailable.');
  }

  async function registerRecruiter(payload) {
    if (typeof window.CampusInnAPI !== 'undefined') {
      const result = await window.CampusInnAPI.auth.registerRecruiter(payload);
      if (result.data) {
        return result.data;
      }
      if (result.error) {
        throw new Error(result.error);
      }
    }
    throw new Error('Registration service unavailable.');
  }

  async function getAdminSetupStatus() {
    if (typeof window.CampusInnAPI !== 'undefined' && window.CampusInnAPI.auth) {
      return await window.CampusInnAPI.auth.getAdminSetupStatus();
    }
    throw new Error('Administrative status service unavailable.');
  }

  async function bootstrapAdmin(payload) {
    if (typeof window.CampusInnAPI !== 'undefined' && window.CampusInnAPI.auth) {
      return await window.CampusInnAPI.auth.bootstrapAdmin(payload);
    }
    throw new Error('Administrator bootstrap service unavailable.');
  }

  async function logout() {
    try {
      if (typeof window.CampusInnAPI !== 'undefined' && window.CampusInnAPI.auth) {
        await window.CampusInnAPI.auth.logout();
      }
    } catch (e) {
      console.warn('Backend logout failed:', e);
    } finally {
      clearSession();
      try {
        sessionStorage.clear();
        localStorage.removeItem('ci_student_profile');
        localStorage.removeItem('ci_cached_user');
      } catch (e) {}
      if (typeof ProfileMenu !== 'undefined' && ProfileMenu.close) {
        ProfileMenu.close();
      }
      if (typeof Nav !== 'undefined' && Nav.updateAuthUI) {
        Nav.updateAuthUI();
      }
      window.location.replace('login.html');
    }
  }

  function sanitizeRedirect(target, fallback = 'index.html') {
    if (!target || typeof target !== 'string') return fallback;
    const trimmed = target.trim();
    if (!trimmed || trimmed === 'login.html') return fallback;
    if (/^(javascript|data|vbscript):/i.test(trimmed)) return fallback;
    if (trimmed.startsWith('//')) return fallback;
    try {
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const parsed = new URL(trimmed, window.location.origin);
        if (parsed.origin !== window.location.origin) {
          return fallback;
        }
        return (parsed.pathname + parsed.search + parsed.hash) || fallback;
      }
    } catch (e) {
      return fallback;
    }
    return trimmed;
  }

  /**
   * Protected portal route guard:
   * Redirects immediately to login.html if unauthenticated, preventing any dashboard flashing.
   */
  function requireAuth(allowedRoles) {
    const session = getSession();
    const curFile = window.location.pathname.split('/').pop() || 'index.html';
    const redirectUrl = 'login.html?redirect=' + encodeURIComponent(curFile + window.location.search + window.location.hash);
    if (!session) {
      window.location.replace(redirectUrl);
      return false;
    }
    if (session.status && session.status !== 'active') {
      clearSession();
      window.location.replace('login.html?status=' + encodeURIComponent(session.status));
      return false;
    }
    if (allowedRoles && allowedRoles.length > 0) {
      if (!allowedRoles.includes(session.role)) {
        window.location.replace(getDashboardUrl());
        return false;
      }
    }
    // Asynchronously verify server session state
    // Only clear session on explicit 401 (unauthorized), NOT on server errors (500) or network failures
    if (typeof window.CampusInnAPI !== 'undefined' && window.CampusInnAPI.auth) {
      window.CampusInnAPI.auth.me().then(res => {
        if (!res.data && res.status === 401) {
          clearSession();
          window.location.replace(redirectUrl);
        }
      }).catch(() => {});
    }
    return true;
  }

  return { getSession, isAuthenticated, getRole, getUser, getRoleConfig,
           getDashboardUrl, login, registerStudent, registerFaculty, registerCoordinator, registerRecruiter,
           getAdminSetupStatus, bootstrapAdmin, logout, requireAuth, sanitizeRedirect, ROLES };
})();

/* ═══════════════════════════════════════════
   3. THEME MANAGER (Light / Dark)
   ═══════════════════════════════════════════ */
const Theme = (() => {
  const STORAGE_KEY = 'ci_theme';
  const DARK_CLASS = 'dark';

  function get() { return localStorage.getItem(STORAGE_KEY) || 'light'; }

  function apply(theme) {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add(DARK_CLASS);
    } else {
      root.classList.remove(DARK_CLASS);
    }
    localStorage.setItem(STORAGE_KEY, theme);
    // Update all theme toggle icons on the page
    document.querySelectorAll('[aria-label*="Theme"], [aria-label*="theme"]').forEach(btn => {
      const icon = btn.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = theme === 'dark' ? 'dark_mode' : 'light_mode';
    });
  }

  function toggle() {
    const current = get();
    const next = current === 'dark' ? 'light' : 'dark';
    apply(next);
    return next;
  }

  /** Initialize on page load — prevents flash of wrong theme */
  function init() {
    // Apply immediately (this runs before DOMContentLoaded)
    apply(get());
  }

  return { get, apply, toggle, init };
})();

// Apply theme immediately to prevent flash
Theme.init();

/* ═══════════════════════════════════════════
   4. NAVIGATION MANAGER
   ═══════════════════════════════════════════ */
const Nav = (() => {
  const PAGE_MAP = {
    'home':           'index.html',
    'events':         'events.html',
    'placements':     'index.html#placements',
    'companies':      'companies.html',
    'about':          'about.html',
    'login':          'login.html',
    'join-campus':    'login.html',
    'register-company': 'hr-register.html',
    'student-portal': 'student.html',
    'admin-portal':   'admin.html',
    'recruiter-portal':'company.html',
    'faculty-portal': 'faculty.html',
    'coordinator-portal': 'coordinator.html',
    'user-profile':   'student.html', // default, overridden by role
    'overview':       'placement.html',
    'drives':         'student.html',
    'students':       'student.html',
    'recruiters':     'placement.html',
    'interviews':     'student.html',
    'analytics':      'placement.html',
    'eligibility-criteria': 'placement.html',
    'broadcasts':     'placement.html',
    'help':           'index.html#faq',
    'contact':        'about.html#contact',
    'privacy':        'index.html#privacy',
    'terms':          'index.html#terms',
    'accessibility':  'index.html#accessibility',
    'logout':         '__logout__'
  };

  function resolveLogoHref() {
    return 'index.html';
  }

  function highlightActiveNav() {
    const pathname = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();

    let current = 'home';
    if (pathname.includes('events.html')) current = 'events';
    else if (pathname.includes('companies.html')) current = 'companies';
    else if (pathname.includes('about.html')) current = 'about';
    else if (hash.includes('placements')) current = 'placements';
    else if (pathname.includes('index.html') || pathname.endsWith('/')) current = 'home';

    const activeClasses = ['bg-secondary-container', 'text-on-secondary-fixed', 'font-bold', 'rounded-lg'];
    const defaultClasses = ['text-on-surface-variant'];

    document.querySelectorAll('nav a[data-path]').forEach(link => {
      const p = link.getAttribute('data-path');
      if (p === current) {
        link.classList.add(...activeClasses);
        link.classList.remove(...defaultClasses);
      } else if (['home', 'events', 'placements', 'companies', 'about'].includes(p)) {
        link.classList.remove(...activeClasses);
        link.classList.add(...defaultClasses);
      }
    });
  }

  function renderDevBanner() {
    const loc = window.location.pathname.toLowerCase();
    if (loc.endsWith('login.html')) return;
    const user = Auth.getUser();
    if (user && user.isMock && !document.getElementById('ci-dev-banner')) {
      const banner = document.createElement('div');
      banner.id = 'ci-dev-banner';
      banner.className = 'ci-dev-mock-banner';
      banner.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px">
          <span class="material-symbols-outlined" style="font-size:16px">science</span>
          <span><strong>[Dev Mock Data Active]:</strong> Operating with simulated development records for MET Bhujbal Knowledge City. Live API integrations are unconfigured.</span>
        </div>
        <button onclick="this.closest('#ci-dev-banner').remove()" style="background:none;border:none;cursor:pointer;color:inherit;font-size:16px;display:flex">
          <span class="material-symbols-outlined" style="font-size:16px">close</span>
        </button>
      `;
      document.body.prepend(banner);
    }
  }

  function wireLinks() {
    // Wire all data-path links
    document.querySelectorAll('[data-path]').forEach(el => {
      const path = el.getAttribute('data-path');
      if (path === 'user-profile' || el.id === 'ci-profile-btn' || el.closest('.ci-profile-menu-container')) {
        return;
      }
      if (path === 'logout') {
        el.addEventListener('click', e => { e.preventDefault(); Auth.logout(); });
        el.href = '#';
        return;
      }
      if (path === 'home') {
        el.href = 'index.html';
        return;
      }
      const target = PAGE_MAP[path];
      if (target) {
        el.href = target;
      }
    });

    // Ensure header logo links to index.html and resolves logo image
    document.querySelectorAll('header a[data-path="home"], header a[href*="index.html"]').forEach(logo => {
      logo.href = 'index.html';
      const img = logo.querySelector('img');
      if (img) {
        if (!img.getAttribute('src') || img.src.includes('googleusercontent.com') || img.getAttribute('src').startsWith('http')) {
          img.src = 'assets/campus_inn_logo.svg';
        }
        img.addEventListener('error', () => {
          img.src = 'assets/campus_inn_logo.svg';
        }, { once: true });
      }
    });

    // Also wire any portal logo to index.html (Requirement 2)
    document.querySelectorAll('a[data-path="overview"]').forEach(el => {
      if (el.closest('header') || el.closest('aside')) {
        el.href = 'index.html';
      }
    });

    highlightActiveNav();
    window.addEventListener('hashchange', highlightActiveNav);

    renderDevBanner();

    // Wire theme toggle buttons
    document.querySelectorAll('[aria-label*="Theme"], [aria-label*="theme"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        const next = Theme.toggle();
        Toast.info(next === 'dark' ? 'Dark mode enabled' : 'Light mode enabled', 2000);
      });
    });

    // Update auth-dependent UI & profile dropdown
    updateAuthUI();
  }

  function updateAuthUI() {
    const isAuth = Auth.isAuthenticated();
    const user = Auth.getUser();

    // Hide/show login/join buttons based on auth state
    document.querySelectorAll('[data-path="login"]').forEach(el => {
      el.style.display = isAuth ? 'none' : '';
    });
    document.querySelectorAll('[data-path="join-campus"]').forEach(el => {
      el.style.display = isAuth ? 'none' : '';
    });

    // Update user info in sidebars
    if (isAuth && user) {
      document.querySelectorAll('[data-bind="user-name"]').forEach(el => {
        el.textContent = user.fullName || user.name || user.email || user.identifier || 'User';
      });
      document.querySelectorAll('[data-bind="user-role"]').forEach(el => {
        el.textContent = user.roleLabel || '';
      });
    }

    // Initialize or refresh profile dropdown
    if (typeof ProfileMenu !== 'undefined') {
      ProfileMenu.init();
    }
  }

  return { wireLinks, resolveLogoHref, updateAuthUI };
})();

/* ═══════════════════════════════════════════
   4B. PROFILE DROPDOWN MENU MANAGER
   ═══════════════════════════════════════════ */
const ProfileMenu = (() => {
  let isOpen = false;

  function getUserInitials(user) {
    if (!user) return '';
    if (user.firstName && user.lastName) {
      return (user.firstName[0] + user.lastName[0]).toUpperCase();
    }
    if (user.name) {
      const parts = user.name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return parts[0].substring(0, 2).toUpperCase();
    }
    return 'U';
  }

  function getMenuItemsForRole(role) {
    switch (role) {
      case 'student':
        return [
          { label: 'My Profile', href: 'student.html#ci-profile-strip', icon: 'account_circle' },
          { label: 'My Courses', href: 'student.html#courses', icon: 'school' },
          { label: 'My Applications', href: 'student.html#applications', icon: 'send' },
          { label: 'My Interviews', href: 'student.html#interviews', icon: 'event_available' },
          { label: 'My Certificates', href: 'student.html#certificates', icon: 'workspace_premium' },
          { label: 'My Events', href: 'events.html#registered-events', icon: 'confirmation_number' },
          { label: 'My CV', href: 'student.html#cv-management', icon: 'description' },
          { label: 'Settings', href: 'student.html#settings', icon: 'settings' }
        ];
      case 'faculty':
        return [
          { label: 'My Profile', href: 'faculty.html', icon: 'badge' },
          { label: 'My Courses', href: 'faculty.html#classes', icon: 'menu_book' },
          { label: 'Student Mentoring', href: 'faculty.html#mentorship', icon: 'groups' },
          { label: 'Settings', href: 'faculty.html#settings', icon: 'settings' }
        ];
      case 'tpo':
        return [
          { label: 'Placement Console', href: 'placement.html', icon: 'dashboard' },
          { label: 'Placement Drives', href: 'placement.html#drives', icon: 'campaign' },
          { label: 'Candidate Roster', href: 'placement.html#students', icon: 'school' },
          { label: 'Corporate Partners', href: 'placement.html#recruiters', icon: 'business_center' },
          { label: 'Settings', href: 'placement.html#settings', icon: 'settings' }
        ];
      case 'admin':
        return [
          { label: 'Admin Console', href: 'admin.html', icon: 'admin_panel_settings' },
          { label: 'Institutional Nodes', href: 'admin.html#nodes', icon: 'domain' },
          { label: 'User Management', href: 'admin.html#users', icon: 'manage_accounts' },
          { label: 'Settings', href: 'admin.html#settings', icon: 'settings' }
        ];
      case 'coordinator':
        return [
          { label: 'Coordinator Hub', href: 'coordinator.html', icon: 'celebration' },
          { label: 'Campus Events', href: 'events.html', icon: 'event' },
          { label: 'Hackathons & Clubs', href: 'coordinator.html#hackathons', icon: 'code' },
          { label: 'Settings', href: 'coordinator.html#settings', icon: 'settings' }
        ];
      case 'recruiter':
        return [
          { label: 'Recruiter Hub', href: 'company.html', icon: 'apartment' },
          { label: 'Hiring Requirements', href: 'hiring-builder.html', icon: 'post_add' },
          { label: 'Candidate Shortlists', href: 'company.html#candidates', icon: 'groups' },
          { label: 'Settings', href: 'company.html#settings', icon: 'settings' }
        ];
      default:
        return [
          { label: 'Sign In', href: 'login.html', icon: 'login' },
          { label: 'Student Registration', href: 'login.html#register', icon: 'how_to_reg' },
          { label: 'Recruiter Registration', href: 'hr-register.html', icon: 'domain_add' }
        ];
    }
  }

  function getRoleDisplayName(role) {
    const roles = {
      student: 'Student',
      faculty: 'Faculty Member',
      tpo: 'Placement Officer',
      admin: 'College Administrator',
      coordinator: 'Event Coordinator',
      recruiter: 'Recruiter / HR'
    };
    return roles[role] || 'Campus Member';
  }

  function renderTriggerAvatar(user, isAuth) {
    if (!isAuth || !user) {
      return `
        <div class="w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant ring-1 ring-outline-variant flex items-center justify-center hover:bg-surface-variant hover:text-on-surface transition-colors select-none">
          <span class="material-symbols-outlined text-[20px]">account_circle</span>
        </div>`;
    }

    // Only render image if it is verified and NOT the unverified hardcoded Priya Sharma demo image
    const isDemoImage = user.avatar && user.avatar.includes('AB6AXuBg1uxJuVJyHsK3DwJ2Qd66x9DxnfKcgfQTCjBaxwwURgSpfol');
    if (user.avatar && !isDemoImage) {
      return `
        <img alt="${user.name || 'User Profile'}" class="w-8 h-8 rounded-full object-cover ring-2 ring-primary-fixed" src="${user.avatar}">`;
    }

    const initials = getUserInitials(user);
    return `
      <div class="w-8 h-8 rounded-full bg-primary-container text-on-primary ring-2 ring-primary-fixed flex items-center justify-center font-bold text-xs uppercase select-none shadow-sm">
        ${initials}
      </div>`;
  }

  function open(menuEl, btnEl) {
    if (!menuEl) return;
    isOpen = true;
    menuEl.classList.remove('hidden');
    if (btnEl) btnEl.setAttribute('aria-expanded', 'true');
    const firstItem = menuEl.querySelector('[role="menuitem"]');
    if (firstItem) {
      firstItem.setAttribute('tabindex', '0');
      firstItem.focus();
    }
  }

  function close(menuEl, btnEl) {
    if (!menuEl) menuEl = document.getElementById('ci-profile-dropdown');
    if (!btnEl) btnEl = document.getElementById('ci-profile-btn');
    if (!menuEl) return;
    isOpen = false;
    menuEl.classList.add('hidden');
    if (btnEl) {
      btnEl.setAttribute('aria-expanded', 'false');
    }
  }

  function toggle(menuEl, btnEl) {
    if (isOpen) {
      close(menuEl, btnEl);
    } else {
      open(menuEl, btnEl);
    }
  }

  function init() {
    let container = document.querySelector('.ci-profile-menu-container');
    const existingAnchor = document.querySelector('[data-path="user-profile"]');

    if (!container && existingAnchor) {
      container = document.createElement('div');
      container.className = 'relative shrink-0 ml-1 ci-profile-menu-container';
      existingAnchor.parentNode.insertBefore(container, existingAnchor);
      existingAnchor.remove();
    }

    if (!container) {
      const headerRight = document.querySelector('header .flex.items-center.gap-space-sm.shrink-0') ||
                          document.querySelector('header .flex.items-center.gap-space-sm');
      if (headerRight) {
        container = document.createElement('div');
        container.className = 'relative shrink-0 ml-1 ci-profile-menu-container';
        headerRight.appendChild(container);
      }
    }

    if (!container) return;

    const isAuth = Auth.isAuthenticated();
    const user = Auth.getUser();

    container.innerHTML = `
      <button id="ci-profile-btn" type="button" class="ci-profile-btn flex items-center justify-center rounded-full p-0.5 focus:outline-none focus:ring-2 focus:ring-primary transition-all cursor-pointer" aria-label="Account menu" aria-haspopup="menu" aria-expanded="false" aria-controls="ci-profile-dropdown">
        ${renderTriggerAvatar(user, isAuth)}
      </button>
      <div id="ci-profile-dropdown" role="menu" aria-labelledby="ci-profile-btn" class="ci-profile-dropdown hidden fixed sm:absolute right-4 sm:right-0 top-16 sm:top-[calc(100%+8px)] w-72 max-w-[calc(100vw-32px)] bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/30 py-2 z-[9999] overflow-hidden backdrop-blur-md">
      </div>
    `;

    const btn = container.querySelector('#ci-profile-btn');
    const dropdown = container.querySelector('#ci-profile-dropdown');

    let headerHtml = '';
    if (isAuth && user) {
      const initials = getUserInitials(user);
      const isDemoImage = user.avatar && user.avatar.includes('AB6AXuBg1uxJuVJyHsK3DwJ2Qd66x9DxnfKcgfQTCjBaxwwURgSpfol');
      const avatarHtml = (user.avatar && !isDemoImage)
        ? `<img alt="${user.name || 'Profile'}" class="w-10 h-10 rounded-full object-cover ring-2 ring-primary-fixed shrink-0" src="${user.avatar}">`
        : `<div class="w-10 h-10 rounded-full bg-primary-container text-on-primary ring-2 ring-primary-fixed flex items-center justify-center font-bold text-sm uppercase select-none shadow-sm shrink-0">${initials}</div>`;

      headerHtml = `
        <div class="ci-profile-header px-4 py-3 border-b border-surface-container-high/60 bg-surface-container-low/40 flex items-center gap-3 w-full">
          <div class="shrink-0">${avatarHtml}</div>
          <div class="min-w-0 flex-1 text-left">
            <div class="font-headline-sm text-sm font-bold text-on-surface truncate">${user.name || user.firstName || 'Campus User'}</div>
            <div class="font-body-sm text-xs text-on-surface-variant truncate">${user.email || ''}</div>
            <div class="mt-1">
              <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase bg-secondary-container text-on-secondary-fixed">
                ${user.roleLabel || getRoleDisplayName(user.role)}
              </span>
            </div>
          </div>
        </div>`;
    } else {
      headerHtml = `
        <div class="ci-profile-header px-4 py-3 border-b border-surface-container-high/60 bg-surface-container-low/40 flex items-center gap-3 w-full">
          <div class="w-10 h-10 rounded-full bg-surface-container text-on-surface-variant ring-1 ring-outline-variant flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-[24px]">account_circle</span>
          </div>
          <div class="min-w-0 flex-1 text-left">
            <div class="font-headline-sm text-sm font-bold text-on-surface">Guest Account</div>
            <div class="font-body-sm text-xs text-on-surface-variant">Sign in to access campus portal</div>
          </div>
        </div>`;
    }

    const items = getMenuItemsForRole(isAuth && user ? user.role : null);
    let itemsHtml = '<div class="ci-menu-items py-1 flex flex-col w-full">';
    items.forEach(item => {
      itemsHtml += `
        <a href="${item.href}" role="menuitem" tabindex="-1" class="ci-dropdown-item flex items-center gap-3 px-4 py-2.5 text-on-surface hover:bg-surface-container-high hover:text-primary transition-colors font-label-md text-sm w-full">
          <span class="material-symbols-outlined text-[20px] text-on-surface-variant shrink-0">${item.icon}</span>
          <span class="ci-dropdown-label flex-1 font-medium text-left truncate">${item.label}</span>
        </a>`;
    });

    if (isAuth) {
      itemsHtml += `
        <div class="ci-dropdown-divider border-t border-surface-container-high/60 my-1 w-full"></div>
        <button type="button" id="ci-menu-logout" role="menuitem" tabindex="-1" class="ci-dropdown-item ci-logout-btn w-full text-left flex items-center gap-3 px-4 py-2.5 text-error hover:bg-error-container/20 transition-colors font-label-md text-sm font-semibold cursor-pointer">
          <span class="material-symbols-outlined text-[20px] text-error shrink-0">logout</span>
          <span class="ci-dropdown-label flex-1 text-left">Log Out</span>
        </button>`;
    }
    itemsHtml += '</div>';

    dropdown.innerHTML = headerHtml + itemsHtml;

    btn.onclick = (e) => {
      e.stopPropagation();
      toggle(dropdown, btn);
    };

    const logoutBtn = dropdown.querySelector('#ci-menu-logout');
    if (logoutBtn) {
      logoutBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        close(dropdown, btn);
        Auth.logout();
      };
    }

    dropdown.querySelectorAll('a[role="menuitem"]').forEach(link => {
      link.onclick = () => {
        close(dropdown, btn);
      };
    });

    dropdown.onkeydown = (e) => {
      const menuItems = Array.from(dropdown.querySelectorAll('[role="menuitem"]'));
      const activeIdx = menuItems.indexOf(document.activeElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = (activeIdx + 1) % menuItems.length;
        menuItems[next].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = (activeIdx - 1 + menuItems.length) % menuItems.length;
        menuItems[prev].focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        menuItems[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        menuItems[menuItems.length - 1]?.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close(dropdown, btn);
        btn.focus();
      } else if (e.key === 'Tab') {
        close(dropdown, btn);
      }
    };
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      const container = document.querySelector('.ci-profile-menu-container');
      if (container && !container.contains(e.target)) {
        close();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        close();
        const btn = document.getElementById('ci-profile-btn');
        if (btn) btn.focus();
      }
    });
  }

  return { init, open, close, toggle };
})();

/* ═══════════════════════════════════════════
   5. MOBILE MENU & NAVIGATION DRAWER
   ═══════════════════════════════════════════ */
const MobileMenu = (() => {
  let overlay, drawer, isOpen = false;

  function create() {
    if (document.getElementById('ci-mobile-menu-overlay')) return;

    overlay = document.createElement('div');
    overlay.id = 'ci-mobile-menu-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,.5)',
      zIndex: '998', opacity: '0', visibility: 'hidden',
      transition: 'opacity .3s ease, visibility .3s ease',
      backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)'
    });
    overlay.addEventListener('click', close);

    drawer = document.createElement('div');
    drawer.id = 'ci-mobile-drawer';
    const isDark = Theme.get() === 'dark';
    Object.assign(drawer.style, {
      position: 'fixed', top: '0', right: '0', bottom: '0',
      width: '300px', maxWidth: '86vw',
      background: isDark ? '#151c2c' : '#ffffff',
      color: isDark ? '#f1f5f9' : '#131b2e',
      zIndex: '999', transform: 'translateX(100%)',
      transition: 'transform .3s cubic-bezier(0.16, 1, 0.3, 1)',
      boxShadow: '-4px 0 24px rgba(0,0,0,.2)',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto', WebkitOverflowScrolling: 'touch'
    });

    const isAuth = Auth.isAuthenticated();
    const user = Auth.getUser();

    drawer.innerHTML = `
      <div style="padding:16px 20px;display:flex;align-items:center;justify-content:space-between;
        border-bottom:1px solid ${isDark ? '#283044' : '#e2e8f0'}">
        <a href="index.html" style="text-decoration:none;display:flex;align-items:center;gap:8px">
          <img src="assets/campus_inn_logo.svg" alt="Campus Inn+ Logo" style="height:28px;width:auto" onerror="this.style.display='none'">
          <span style="font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.15rem;
            color:${isDark ? '#d3bbff' : '#5300b7'}">Campus Inn<span style="color:#6d28d9">+</span></span>
        </a>
        <button id="ci-mobile-close" aria-label="Close navigation" style="background:none;border:none;cursor:pointer;padding:8px;
          color:${isDark ? '#ccc3d7' : '#4a4455'};display:flex;border-radius:8px">
          <span class="material-symbols-outlined" style="font-size:24px">close</span>
        </button>
      </div>
      ${isAuth && user ? `
        <div style="padding:14px 20px;background:${isDark ? '#1e293b' : '#f5f3ff'};
          border-bottom:1px solid ${isDark ? '#283044' : '#e2e8f0'}">
          <div style="font-weight:600;color:${isDark ? '#fff' : '#131b2e'};font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${user.name || user.firstName || user.identifier}
          </div>
          <div style="font-size:.75rem;color:${isDark ? '#d3bbff' : '#5300b7'};margin-top:2px;font-weight:600">
            ${user.roleLabel || 'Campus Member'}
          </div>
        </div>
      ` : ''}
      <nav style="padding:12px 14px;display:flex;flex-direction:column;gap:4px;flex:1">
        <a href="index.html" class="ci-mob-link" style="padding:10px 14px;border-radius:10px;text-decoration:none;
          font-size:.875rem;font-weight:600;color:${isDark ? '#eef0ff' : '#131b2e'};
          display:flex;align-items:center;gap:12px;min-height:44px">
          <span class="material-symbols-outlined" style="font-size:22px">home</span> Home</a>
        <a href="events.html" class="ci-mob-link" style="padding:10px 14px;border-radius:10px;text-decoration:none;
          font-size:.875rem;font-weight:600;color:${isDark ? '#eef0ff' : '#131b2e'};
          display:flex;align-items:center;gap:12px;min-height:44px">
          <span class="material-symbols-outlined" style="font-size:22px">celebration</span> Events & Freshers</a>
        <a href="index.html#placements" class="ci-mob-link" style="padding:10px 14px;border-radius:10px;text-decoration:none;
          font-size:.875rem;font-weight:600;color:${isDark ? '#eef0ff' : '#131b2e'};
          display:flex;align-items:center;gap:12px;min-height:44px">
          <span class="material-symbols-outlined" style="font-size:22px">work</span> Placements</a>
        <a href="companies.html" class="ci-mob-link" style="padding:10px 14px;border-radius:10px;text-decoration:none;
          font-size:.875rem;font-weight:600;color:${isDark ? '#eef0ff' : '#131b2e'};
          display:flex;align-items:center;gap:12px;min-height:44px">
          <span class="material-symbols-outlined" style="font-size:22px">business</span> Corporate Directory</a>
        <a href="about.html" class="ci-mob-link" style="padding:10px 14px;border-radius:10px;text-decoration:none;
          font-size:.875rem;font-weight:600;color:${isDark ? '#eef0ff' : '#131b2e'};
          display:flex;align-items:center;gap:12px;min-height:44px">
          <span class="material-symbols-outlined" style="font-size:22px">info</span> About Ecosystem</a>
        ${isAuth ? `
          <a href="${Auth.getDashboardUrl()}" class="ci-mob-link" style="padding:10px 14px;border-radius:10px;text-decoration:none;
            font-size:.875rem;font-weight:700;color:#5300b7;background:${isDark ? '#250059' : '#ede9fe'};
            display:flex;align-items:center;gap:12px;min-height:44px">
            <span class="material-symbols-outlined" style="font-size:22px">dashboard</span> My Dashboard</a>
        ` : ''}
        <div style="border-top:1px solid ${isDark ? '#283044' : '#e2e8f0'};margin:8px 0"></div>
        <div style="font-size:.6875rem;text-transform:uppercase;letter-spacing:.08em;font-weight:700;
          color:${isDark ? '#94a3b8' : '#64748b'};padding:4px 14px">Institutional Portals</div>
        <a href="student.html" class="ci-mob-link" style="padding:10px 14px;border-radius:10px;text-decoration:none;
          font-size:.875rem;font-weight:500;color:${isDark ? '#eef0ff' : '#131b2e'};
          display:flex;align-items:center;gap:12px;min-height:44px">
          <span class="material-symbols-outlined" style="font-size:22px">school</span> Student Portal</a>
        <a href="faculty.html" class="ci-mob-link" style="padding:10px 14px;border-radius:10px;text-decoration:none;
          font-size:.875rem;font-weight:500;color:${isDark ? '#eef0ff' : '#131b2e'};
          display:flex;align-items:center;gap:12px;min-height:44px">
          <span class="material-symbols-outlined" style="font-size:22px">badge</span> Faculty Portal</a>
        <a href="placement.html" class="ci-mob-link" style="padding:10px 14px;border-radius:10px;text-decoration:none;
          font-size:.875rem;font-weight:500;color:${isDark ? '#eef0ff' : '#131b2e'};
          display:flex;align-items:center;gap:12px;min-height:44px">
          <span class="material-symbols-outlined" style="font-size:22px">work_history</span> Placement Officer</a>
        <a href="coordinator.html" class="ci-mob-link" style="padding:10px 14px;border-radius:10px;text-decoration:none;
          font-size:.875rem;font-weight:500;color:${isDark ? '#eef0ff' : '#131b2e'};
          display:flex;align-items:center;gap:12px;min-height:44px">
          <span class="material-symbols-outlined" style="font-size:22px">celebration</span> Coordinator Hub</a>
        <a href="admin.html" class="ci-mob-link" style="padding:10px 14px;border-radius:10px;text-decoration:none;
          font-size:.875rem;font-weight:500;color:${isDark ? '#eef0ff' : '#131b2e'};
          display:flex;align-items:center;gap:12px;min-height:44px">
          <span class="material-symbols-outlined" style="font-size:22px">admin_panel_settings</span> Admin Console</a>
        <a href="company.html" class="ci-mob-link" style="padding:10px 14px;border-radius:10px;text-decoration:none;
          font-size:.875rem;font-weight:500;color:${isDark ? '#eef0ff' : '#131b2e'};
          display:flex;align-items:center;gap:12px;min-height:44px">
          <span class="material-symbols-outlined" style="font-size:22px">apartment</span> Recruiter Hub</a>
      </nav>
      <div style="padding:16px 20px;border-top:1px solid ${isDark ? '#283044' : '#e2e8f0'}">
        ${isAuth ? `
          <button onclick="Auth.logout()" style="width:100%;padding:12px;border-radius:10px;
            background:${isDark ? '#1e293b' : '#fef2f2'};border:none;cursor:pointer;
            font-size:.875rem;font-weight:600;color:#ba1a1a;display:flex;align-items:center;
            justify-content:center;gap:8px;min-height:44px">
            <span class="material-symbols-outlined" style="font-size:20px">logout</span> Sign Out</button>
        ` : `
          <a href="login.html" class="ci-mob-link" style="display:flex;align-items:center;justify-content:center;
            padding:12px;border-radius:10px;background:#5300b7;color:#fff;text-decoration:none;font-weight:600;
            font-size:.875rem;min-height:44px">
            Sign In / Register</a>
        `}
      </div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
    drawer.querySelector('#ci-mobile-close')?.addEventListener('click', close);

    // Auto-close drawer on link navigation
    drawer.querySelectorAll('.ci-mob-link').forEach(link => {
      link.addEventListener('click', () => {
        close();
      });
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    });
  }

  function open() {
    create();
    isOpen = true;
    document.body.style.overflow = 'hidden';
    overlay.style.opacity = '1'; overlay.style.visibility = 'visible';
    drawer.style.transform = 'translateX(0)';
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    document.body.style.overflow = '';
    if (overlay) { overlay.style.opacity = '0'; overlay.style.visibility = 'hidden'; }
    if (drawer) { drawer.style.transform = 'translateX(100%)'; }
  }

  function addHamburger() {
    // If the page already has a portal sidebar, skip header hamburger for main site drawer
    if (document.querySelector('aside')) return;

    const header = document.querySelector('header');
    if (!header) return;
    if (header.querySelector('#ci-hamburger')) return;

    const btn = document.createElement('button');
    btn.id = 'ci-hamburger';
    btn.setAttribute('aria-label', 'Open navigation menu');
    btn.className = 'lg:hidden';
    Object.assign(btn.style, {
      background: 'none', border: 'none', cursor: 'pointer', padding: '8px',
      display: 'none', alignItems: 'center', justifyContent: 'center',
      color: 'inherit', order: '99', minHeight: '40px', minWidth: '40px'
    });
    btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:24px">menu</span>';
    btn.addEventListener('click', open);

    // Insert into header actions area
    const actionsDiv = header.querySelector('.flex.items-center.gap-space-sm.shrink-0') ||
                       header.querySelector('.flex.items-center.gap-space-sm');
    if (actionsDiv) {
      actionsDiv.prepend(btn);
    }

    // CSS to show hamburger on mobile
    if (!document.getElementById('ci-mobile-css')) {
      const style = document.createElement('style');
      style.id = 'ci-mobile-css';
      style.textContent = `
        @media (max-width: 1023px) {
          #ci-hamburger { display: flex !important; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  return { open, close, addHamburger };
})();

/* ═══════════════════════════════════════════
   5B. PORTAL SIDEBAR MANAGER (Auto Off-Canvas)
   ═══════════════════════════════════════════ */
const SidebarManager = (() => {
  let isSidebarOpen = false;
  let overlay = null;

  function getOverlay() {
    if (!overlay) {
      overlay = document.getElementById('ci-sidebar-backdrop');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'ci-sidebar-backdrop';
        overlay.addEventListener('click', close);
        document.body.appendChild(overlay);
      }
    }
    return overlay;
  }

  function open() {
    const aside = document.querySelector('aside');
    if (!aside) return;
    isSidebarOpen = true;
    aside.classList.add('ci-sidebar-open');
    getOverlay().classList.add('active');
    document.body.style.overflow = 'hidden';
    const toggleBtn = document.getElementById('ci-sidebar-toggle');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
  }

  function close() {
    const aside = document.querySelector('aside');
    if (!aside) return;
    isSidebarOpen = false;
    aside.classList.remove('ci-sidebar-open');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
    const toggleBtn = document.getElementById('ci-sidebar-toggle');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
  }

  function toggle() {
    if (isSidebarOpen) close();
    else open();
  }

  function init() {
    const aside = document.querySelector('aside');
    if (!aside) return;

    // Ensure portal sidebar class is set
    aside.classList.add('ci-portal-sidebar');

    // Create / find sidebar toggle button in header
    const header = document.querySelector('header');
    if (header && !document.getElementById('ci-sidebar-toggle')) {
      const toggleBtn = document.createElement('button');
      toggleBtn.id = 'ci-sidebar-toggle';
      toggleBtn.type = 'button';
      toggleBtn.className = 'lg:hidden p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors flex items-center justify-center cursor-pointer mr-2 shrink-0';
      toggleBtn.setAttribute('aria-label', 'Open navigation menu');
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.innerHTML = '<span class="material-symbols-outlined text-[24px]">menu</span>';
      toggleBtn.addEventListener('click', toggle);

      // Place at start of header
      const leftCluster = header.querySelector('.flex.items-center.gap-space-md') ||
                          header.querySelector('.flex.items-center.gap-space-sm') ||
                          header.firstElementChild;
      if (leftCluster) {
        leftCluster.prepend(toggleBtn);
      }
    }

    // Add close button to sidebar for mobile users
    const sidebarHeader = aside.querySelector('.h-16') || aside.firstElementChild;
    if (sidebarHeader && !sidebarHeader.querySelector('.ci-sidebar-close-btn')) {
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'ci-sidebar-close-btn lg:hidden ml-auto p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors flex items-center justify-center cursor-pointer';
      closeBtn.setAttribute('aria-label', 'Close sidebar');
      closeBtn.innerHTML = '<span class="material-symbols-outlined text-[20px]">close</span>';
      closeBtn.addEventListener('click', close);
      sidebarHeader.appendChild(closeBtn);
    }

    // Close drawer when clicking any link inside sidebar on mobile
    aside.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth < 1024) {
          close();
        }
      });
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isSidebarOpen) {
        close();
      }
    });

    // Auto close on window resize past 1024px
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 1024 && isSidebarOpen) {
        close();
      }
    });
  }

  return { init, open, close, toggle };
})();

/* ═══════════════════════════════════════════
   6. FORM VALIDATION UTILITIES
   ═══════════════════════════════════════════ */
const FormUtils = (() => {
  function showFieldError(input, message) {
    clearFieldError(input);
    input.style.borderColor = '#ef4444';
    input.style.boxShadow = '0 0 0 3px rgba(239,68,68,.15)';
    const err = document.createElement('span');
    err.className = 'ci-field-error';
    err.style.cssText = 'color:#ef4444;font-size:.75rem;font-weight:500;margin-top:4px;display:block;font-family:"Hanken Grotesk",sans-serif';
    err.textContent = message;
    input.parentElement.after(err);
  }

  function clearFieldError(input) {
    input.style.borderColor = '';
    input.style.boxShadow = '';
    const parent = input.closest('.flex.flex-col') || input.parentElement.parentElement;
    parent?.querySelectorAll('.ci-field-error').forEach(e => e.remove());
  }

  function clearAllErrors(form) {
    form.querySelectorAll('input, select, textarea').forEach(clearFieldError);
    form.querySelectorAll('.ci-field-error').forEach(e => e.remove());
  }

  function setButtonLoading(btn, loading, originalText) {
    if (loading) {
      btn.disabled = true;
      btn.dataset.originalText = btn.innerHTML;
      const spinner = `<svg style="animation:spin 1s linear infinite;width:20px;height:20px" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="31.4 31.4" stroke-dashoffset="0"/>
      </svg>`;
      btn.innerHTML = `<span style="display:flex;align-items:center;gap:8px;justify-content:center">${spinner} <span>Signing in...</span></span>`;
      btn.style.opacity = '.75';
      btn.style.cursor = 'wait';
    } else {
      btn.disabled = false;
      btn.innerHTML = originalText || btn.dataset.originalText || 'Submit';
      btn.style.opacity = '';
      btn.style.cursor = '';
    }
  }

  return { showFieldError, clearFieldError, clearAllErrors, setButtonLoading };
})();

/* ═══════════════════════════════════════════
   6B. STRICT PHONE NUMBER UTILITIES
   ═══════════════════════════════════════════ */
const PhoneUtils = (() => {
  const PHONE_REGEX = /^[0-9]{10}$/;

  function sanitize(value) {
    if (!value) return '';
    return String(value).replace(/[^0-9]/g, '').slice(0, 10);
  }

  function validate(value, required = true) {
    if (!value || String(value).trim() === '') {
      if (!required) return { valid: true, value: '' };
      return { valid: false, error: 'Phone number is required.' };
    }
    const clean = String(value).trim();
    if (/[^0-9]/.test(clean)) {
      return { valid: false, error: 'Phone number must contain digits only.' };
    }
    if (clean.length < 10) {
      return { valid: false, error: 'Phone number must be exactly 10 digits (entered ' + clean.length + ').' };
    }
    if (clean.length > 10) {
      return { valid: false, error: 'Phone number cannot exceed 10 digits.' };
    }
    return { valid: true, value: clean };
  }

  function bindInput(input, options = {}) {
    if (!input) return;
    const { required = true, getErrorTarget = null } = options;

    input.setAttribute('type', 'tel');
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('maxlength', '10');
    input.setAttribute('pattern', '[0-9]{10}');

    input.addEventListener('input', () => {
      const sanitized = sanitize(input.value);
      if (input.value !== sanitized) {
        input.value = sanitized;
      }
      if (input.value.length === 10) {
        FormUtils.clearFieldError(getErrorTarget ? getErrorTarget() : input);
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasteText = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      input.value = sanitize(pasteText);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    input.addEventListener('blur', () => {
      const res = validate(input.value, required);
      if (!res.valid) {
        FormUtils.showFieldError(getErrorTarget ? getErrorTarget() : input, res.error);
      } else {
        FormUtils.clearFieldError(getErrorTarget ? getErrorTarget() : input);
      }
    });
  }

  return { sanitize, validate, bindInput, PHONE_REGEX };
})();

/* ═══════════════════════════════════════════
   7. SPINNER ANIMATION CSS (injected once)
   ═══════════════════════════════════════════ */
(function injectGlobalCSS() {
  if (document.getElementById('ci-global-css')) return;
  const style = document.createElement('style');
  style.id = 'ci-global-css';
  style.textContent = `
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }

    /* Focus visible */
    :focus-visible {
      outline: 2px solid #6d28d9;
      outline-offset: 2px;
    }

    /* Skip link for accessibility */
    .ci-skip-link {
      position: absolute; top: -40px; left: 0; padding: 8px 16px;
      background: #6d28d9; color: #fff; z-index: 10000;
      font-family: 'Hanken Grotesk', sans-serif; font-weight: 600;
      text-decoration: none; border-radius: 0 0 8px 0;
    }
    .ci-skip-link:focus { top: 0; }
  `;
  document.head.appendChild(style);
})();

/* ═══════════════════════════════════════════
   8. HOMEPAGE PLACEMENT APPLY WORKFLOW
   ═══════════════════════════════════════════ */
const HomepageApply = (() => {
  const APPLIED_STORAGE_KEY = 'ci_applied_drives';
  const PENDING_STORAGE_KEY = 'ci_pending_apply';

  function getAppliedDrives() {
    try {
      return JSON.parse(localStorage.getItem(APPLIED_STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function markApplied(driveId) {
    const list = getAppliedDrives();
    if (!list.includes(driveId)) {
      list.push(driveId);
      localStorage.setItem(APPLIED_STORAGE_KEY, JSON.stringify(list));
    }
  }

  function updateButtonState(btn, state) {
    if (state === 'applied') {
      btn.disabled = true;
      btn.innerHTML = `<span style="display:flex;align-items:center;gap:6px;justify-content:center"><span class="material-symbols-outlined text-[18px]">check_circle</span><span>Applied ✓</span></span>`;
      btn.className = 'w-full py-2.5 bg-tertiary text-on-tertiary font-label-lg text-label-lg rounded-lg shadow-sm cursor-default';
    } else if (state === 'loading') {
      btn.disabled = true;
      btn.dataset.prevHtml = btn.innerHTML;
      const spinner = `<svg style="animation:spin 1s linear infinite;width:18px;height:18px" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="31.4 31.4" stroke-dashoffset="0"/>
      </svg>`;
      btn.innerHTML = `<span style="display:flex;align-items:center;gap:6px;justify-content:center">${spinner}<span>Applying...</span></span>`;
      btn.style.opacity = '0.85';
      btn.style.cursor = 'wait';
    } else {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.prevHtml || 'Apply Now';
      btn.style.opacity = '';
      btn.style.cursor = '';
    }
  }

  async function handleApplyClick(btn) {
    const driveId = btn.getAttribute('data-drive-id');
    const company = btn.getAttribute('data-company') || 'Campus Partner';
    const role = btn.getAttribute('data-role') || 'Placement Drive';

    if (!Auth.isAuthenticated()) {
      localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify({ driveId, company, role }));
      Toast.info('Please sign in to complete your placement application.');
      setTimeout(() => {
        window.location.href = `login.html?redirect=${encodeURIComponent('index.html#placements')}`;
      }, 600);
      return;
    }

    const user = Auth.getUser();
    if (user && user.role && user.role !== 'student') {
      Toast.warning('Direct placement applications are reserved for student accounts.');
      return;
    }

    updateButtonState(btn, 'loading');

    try {
      let result;
      if (typeof window.CampusInnAPI !== 'undefined' && window.CampusInnAPI.student?.apply) {
        result = await window.CampusInnAPI.student.apply(driveId, company, role);
      } else if (typeof window.CampusInnAPI !== 'undefined' && window.CampusInnAPI.placements?.apply) {
        result = await window.CampusInnAPI.placements.apply(driveId);
      }

      if (result && (result.data?.success || result.data?.status === 'Applied' || !result.error)) {
        markApplied(driveId);
        updateButtonState(btn, 'applied');
        Toast.success(`Successfully applied to ${company} for ${role}!`);
      } else {
        const errMsg = result?.data?.message || result?.error || 'Failed to submit application.';
        Toast.error(errMsg);
        updateButtonState(btn, 'reset');
      }
    } catch (err) {
      Toast.error(err.message || 'Error submitting application.');
      updateButtonState(btn, 'reset');
    }
  }

  function init() {
    const applyButtons = document.querySelectorAll('button[data-action="apply"], .ci-apply-btn');
    if (applyButtons.length === 0) return;

    const appliedList = getAppliedDrives();

    applyButtons.forEach(btn => {
      const driveId = btn.getAttribute('data-drive-id');
      if (driveId && appliedList.includes(driveId)) {
        updateButtonState(btn, 'applied');
      }

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        handleApplyClick(btn);
      });
    });

    // Handle resume of pending application after login
    if (Auth.isAuthenticated()) {
      try {
        const pendingRaw = localStorage.getItem(PENDING_STORAGE_KEY);
        if (pendingRaw) {
          localStorage.removeItem(PENDING_STORAGE_KEY);
          const pending = JSON.parse(pendingRaw);
          if (pending && pending.driveId) {
            const targetBtn = document.querySelector(`button[data-drive-id="${pending.driveId}"]`);
            if (targetBtn && !appliedList.includes(pending.driveId)) {
              Toast.info(`Resuming application for ${pending.company}...`);
              handleApplyClick(targetBtn);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to parse pending application:', e);
      }
    }
  }

  return { init, markApplied, getAppliedDrives };
})();

/* ═══════════════════════════════════════════
   9. NOTIFICATION CENTER MODULE
   ═══════════════════════════════════════════ */
const NotificationCenter = (() => {
  let isOpen = false;
  let activeDropdown = null;
  let cachedNotifications = [];
  let unreadCount = 0;

  function getIcon(type) {
    switch (type) {
      case 'event': return 'celebration';
      case 'placement': return 'work';
      case 'academic': return 'school';
      case 'alert': return 'warning';
      default: return 'notifications';
    }
  }

  function getIconBg(type) {
    switch (type) {
      case 'event': return 'bg-tertiary-fixed text-on-tertiary-fixed';
      case 'placement': return 'bg-primary-fixed text-on-primary-fixed';
      case 'academic': return 'bg-secondary-fixed text-on-secondary-fixed';
      case 'alert': return 'bg-error-container text-on-error-container';
      default: return 'bg-surface-container-high text-primary';
    }
  }

  function formatTime(isoString) {
    if (!isoString) return 'Recent';
    try {
      const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
      if (diff < 60) return 'Just now';
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
    } catch {
      return 'Recent';
    }
  }

  function updateBadgeUI(count) {
    unreadCount = count;
    document.querySelectorAll('.ci-notif-badge').forEach(badge => {
      if (count > 0) {
        badge.textContent = count > 9 ? '9+' : count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    });
    const pill = document.getElementById('ci-notif-count-pill');
    if (pill) {
      pill.textContent = count;
      pill.className = count > 0
        ? 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary text-white'
        : 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-container text-secondary';
    }
  }

  function renderList(notifications) {
    const listEl = document.getElementById('ci-notif-list');
    if (!listEl) return;

    if (!notifications || notifications.length === 0) {
      listEl.innerHTML = `
        <div class="p-8 text-center text-secondary">
          <span class="material-symbols-outlined text-4xl text-outline mb-1 select-none">notifications_off</span>
          <p class="font-semibold text-xs text-on-surface">All caught up!</p>
          <p class="text-[11px] mt-0.5 text-secondary">No unread notifications at this time.</p>
        </div>`;
      return;
    }

    listEl.innerHTML = notifications.map(n => `
      <div class="ci-notif-item p-3.5 hover:bg-surface-container-low transition-colors cursor-pointer flex items-start gap-3 ${n.isRead ? 'opacity-70' : 'bg-primary/5'}" data-id="${n.id}" data-link="${n.link || ''}">
        <div class="w-8 h-8 rounded-lg ${getIconBg(n.type)} flex items-center justify-center shrink-0 shadow-xs">
          <span class="material-symbols-outlined text-[18px]">${getIcon(n.type)}</span>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-1">
            <h4 class="text-xs font-semibold text-on-surface truncate">${escapeHtml(n.title)}</h4>
            ${!n.isRead ? '<span class="w-2 h-2 rounded-full bg-primary shrink-0" title="Unread"></span>' : ''}
          </div>
          <p class="text-[11px] text-secondary mt-0.5 line-clamp-2 leading-relaxed">${escapeHtml(n.message || '')}</p>
          <span class="text-[10px] text-outline mt-1 block font-medium">${formatTime(n.createdAt)}</span>
        </div>
      </div>
    `).join('');

    // Attach item click handlers
    listEl.querySelectorAll('.ci-notif-item').forEach(item => {
      item.addEventListener('click', async () => {
        const id = item.getAttribute('data-id');
        const link = item.getAttribute('data-link');

        if (window.CampusInnAPI && window.CampusInnAPI.notifications) {
          window.CampusInnAPI.notifications.markAsRead(id).catch(() => {});
        }

        const targetNotif = cachedNotifications.find(n => String(n.id) === String(id));
        if (targetNotif && !targetNotif.isRead) {
          targetNotif.isRead = true;
          updateBadgeUI(Math.max(0, unreadCount - 1));
          item.classList.add('opacity-70');
          item.classList.remove('bg-primary/5');
          item.querySelector('.bg-primary.rounded-full')?.remove();
        }

        close();
        if (link && link.trim() && link !== '#') {
          window.location.href = link;
        }
      });
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function fetchNotifications() {
    const listEl = document.getElementById('ci-notif-list');
    if (listEl) {
      listEl.innerHTML = `
        <div class="p-8 text-center text-secondary">
          <div class="inline-block animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full mb-2"></div>
          <p class="text-xs">Loading campus feeds...</p>
        </div>`;
    }

    try {
      if (!Auth.isAuthenticated()) {
        if (listEl) {
          listEl.innerHTML = `
            <div class="p-6 text-center text-secondary">
              <span class="material-symbols-outlined text-3xl text-primary mb-1">lock</span>
              <p class="text-xs font-semibold text-on-surface">Authentication Required</p>
              <p class="text-[11px] text-secondary mt-1">Sign in to view your notifications.</p>
              <a href="login.html" class="inline-block mt-3 px-4 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-container transition-colors">Sign In</a>
            </div>`;
        }
        return;
      }

      if (window.CampusInnAPI && window.CampusInnAPI.notifications) {
        const res = await window.CampusInnAPI.notifications.getAll();
        if (res.data && res.data.success) {
          cachedNotifications = res.data.notifications || [];
          updateBadgeUI(res.data.unreadCount || 0);
          renderList(cachedNotifications);
          return;
        }
      }

      renderList(cachedNotifications);
    } catch (err) {
      if (listEl) {
        listEl.innerHTML = `
          <div class="p-6 text-center text-error">
            <span class="material-symbols-outlined text-3xl mb-1">error</span>
            <p class="text-xs font-semibold">Failed to load notifications</p>
            <button id="ci-notif-retry-btn" class="mt-2 text-xs text-primary font-bold underline cursor-pointer">Retry</button>
          </div>`;
        document.getElementById('ci-notif-retry-btn')?.addEventListener('click', fetchNotifications);
      }
    }
  }

  function open(dropdownEl, buttonEl) {
    isOpen = true;
    activeDropdown = dropdownEl;
    dropdownEl.classList.remove('hidden');
    buttonEl?.setAttribute('aria-expanded', 'true');
    fetchNotifications();
  }

  function close() {
    isOpen = false;
    if (activeDropdown) {
      activeDropdown.classList.add('hidden');
    }
    document.querySelectorAll('button[aria-label*="Notification"]').forEach(btn => {
      btn.setAttribute('aria-expanded', 'false');
    });
  }

  function toggle(dropdownEl, buttonEl) {
    if (isOpen && activeDropdown === dropdownEl) {
      close();
    } else {
      open(dropdownEl, buttonEl);
    }
  }

  function init() {
    const bellButtons = document.querySelectorAll('button[aria-label="Notifications"], button[aria-label="View Notifications"]');
    if (bellButtons.length === 0) return;

    bellButtons.forEach(btn => {
      let badge = btn.querySelector('.ci-notif-badge');
      if (!badge) {
        btn.querySelector('span.rounded-full.bg-primary, span.rounded-full.bg-error')?.remove();
        badge = document.createElement('span');
        badge.className = 'ci-notif-badge absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-error text-white text-[10px] font-bold flex items-center justify-center leading-none hidden shadow-xs';
        btn.classList.add('relative');
        btn.appendChild(badge);
      }

      let parent = btn.parentElement;
      if (parent && !parent.classList.contains('relative')) {
        parent.classList.add('relative');
      }

      let dropdown = parent ? parent.querySelector('#ci-notification-dropdown') : null;
      if (!dropdown && parent) {
        dropdown = document.createElement('div');
        dropdown.id = 'ci-notification-dropdown';
        dropdown.className = 'ci-notif-dropdown hidden absolute right-0 top-[calc(100%+8px)] w-80 sm:w-96 max-w-[calc(100vw-24px)] bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/30 py-3 z-[9999] overflow-hidden backdrop-blur-md';
        dropdown.innerHTML = `
          <div class="flex items-center justify-between px-4 pb-2.5 border-b border-surface-container">
            <div class="flex items-center gap-2">
              <span class="font-headline-sm font-bold text-sm text-on-surface">Notifications</span>
              <span id="ci-notif-count-pill" class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">0</span>
            </div>
            <div class="flex items-center gap-2">
              <button id="ci-notif-refresh-btn" type="button" title="Refresh" class="text-secondary hover:text-on-surface p-1 rounded transition-colors flex items-center cursor-pointer">
                <span class="material-symbols-outlined text-[16px]">refresh</span>
              </button>
              <button id="ci-notif-mark-all-btn" type="button" class="text-xs text-primary font-semibold hover:underline cursor-pointer">Mark all read</button>
            </div>
          </div>
          <div id="ci-notif-list" class="max-h-80 overflow-y-auto divide-y divide-surface-container/50">
          </div>
        `;
        parent.appendChild(dropdown);

        dropdown.querySelector('#ci-notif-mark-all-btn')?.addEventListener('click', async () => {
          if (window.CampusInnAPI && window.CampusInnAPI.notifications) {
            await window.CampusInnAPI.notifications.markAllAsRead().catch(() => {});
          }
          cachedNotifications.forEach(n => { n.isRead = true; });
          updateBadgeUI(0);
          renderList(cachedNotifications);
          Toast.success('All notifications marked as read.');
        });

        dropdown.querySelector('#ci-notif-refresh-btn')?.addEventListener('click', () => {
          fetchNotifications();
        });
      }

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle(dropdown, btn);
      });
    });

    document.addEventListener('click', (e) => {
      if (isOpen && activeDropdown && !activeDropdown.contains(e.target)) {
        close();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    });

    if (Auth.isAuthenticated() && window.CampusInnAPI && window.CampusInnAPI.notifications) {
      window.CampusInnAPI.notifications.getAll().then(res => {
        if (res.data && res.data.success) {
          cachedNotifications = res.data.notifications || [];
          updateBadgeUI(res.data.unreadCount || 0);
        }
      }).catch(() => {});
    }
  }

  return { init, open, close, toggle, fetchNotifications };
})();

/* ═══════════════════════════════════════════
   10. GLOBAL CAMPUS SEARCH MODULE
   ═══════════════════════════════════════════ */
const GlobalSearch = (() => {
  let searchTimeout = null;

  function init() {
    const inputs = document.querySelectorAll('input[placeholder*="Search campus..."], input[placeholder*="Search"]');
    if (inputs.length === 0) return;

    inputs.forEach(input => {
      if (input.dataset.ciSearchAttached) return;
      input.dataset.ciSearchAttached = 'true';

      const parent = input.parentElement;
      if (!parent) return;

      if (!parent.classList.contains('relative') && !parent.classList.contains('ci-search-container')) {
        parent.classList.add('relative');
      }

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'ci-search-clear hidden absolute right-2 text-outline hover:text-on-surface p-0.5 rounded transition-colors cursor-pointer';
      clearBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">close</span>';
      parent.appendChild(clearBtn);

      let resultsDropdown = parent.querySelector('.ci-search-results-dropdown');
      if (!resultsDropdown) {
        resultsDropdown = document.createElement('div');
        resultsDropdown.className = 'ci-search-results-dropdown hidden absolute left-0 top-[calc(100%+8px)] w-80 sm:w-96 max-w-[calc(100vw-32px)] bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/30 py-2 z-[9999] overflow-hidden backdrop-blur-md max-h-96 overflow-y-auto';
        parent.appendChild(resultsDropdown);
      }

      function hideResults() {
        resultsDropdown.classList.add('hidden');
      }

      function showResults() {
        resultsDropdown.classList.remove('hidden');
      }

      clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.classList.add('hidden');
        hideResults();
        input.focus();
      });

      input.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (val) {
          clearBtn.classList.remove('hidden');
        } else {
          clearBtn.classList.add('hidden');
          hideResults();
          return;
        }

        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
          resultsDropdown.innerHTML = `
            <div class="p-6 text-center text-secondary text-xs">
              <div class="inline-block animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full mb-1.5"></div>
              <p>Searching campus records...</p>
            </div>`;
          showResults();

          try {
            if (window.CampusInnAPI && window.CampusInnAPI.search) {
              const res = await window.CampusInnAPI.search(val);
              if (res.data && res.data.success) {
                renderSearchResults(res.data.results, val, resultsDropdown);
                return;
              }
            }
            renderSearchResults([], val, resultsDropdown);
          } catch (err) {
            resultsDropdown.innerHTML = `
              <div class="p-4 text-center text-xs text-error">
                <span class="material-symbols-outlined text-lg mb-1">error</span>
                <p>Search service temporarily unavailable.</p>
              </div>`;
          }
        }, 250);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          hideResults();
        } else if (e.key === 'Enter') {
          const firstResult = resultsDropdown.querySelector('.ci-search-result-item');
          if (firstResult) {
            e.preventDefault();
            firstResult.click();
          }
        }
      });

      document.addEventListener('click', (e) => {
        if (!parent.contains(e.target)) {
          hideResults();
        }
      });
    });
  }

  function renderSearchResults(results, query, container) {
    if (!results || results.length === 0) {
      container.innerHTML = `
        <div class="p-6 text-center text-secondary text-xs">
          <span class="material-symbols-outlined text-2xl text-outline mb-1 select-none">search_off</span>
          <p class="font-semibold text-on-surface">No records found</p>
          <p class="text-[11px] text-secondary mt-0.5">No results matching "${escapeHtml(query)}"</p>
        </div>`;
      return;
    }

    const grouped = {};
    results.forEach(r => {
      const cat = r.category || 'General';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(r);
    });

    let html = '';
    for (const [category, items] of Object.entries(grouped)) {
      html += `
        <div class="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-primary bg-surface-container-low/50">
          ${escapeHtml(category)} (${items.length})
        </div>
        <div class="divide-y divide-surface-container/30">
          ${items.map(item => `
            <a href="${item.url || '#'}" class="ci-search-result-item block p-3 hover:bg-surface-container-low transition-colors text-left group">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-semibold text-on-surface group-hover:text-primary transition-colors truncate">
                  ${highlightQuery(item.title, query)}
                </span>
                ${item.badge ? `<span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-secondary-container text-on-secondary-fixed shrink-0">${escapeHtml(item.badge)}</span>` : ''}
              </div>
              ${item.description ? `<p class="text-[11px] text-secondary mt-0.5 line-clamp-1 leading-normal">${escapeHtml(item.description)}</p>` : ''}
            </a>
          `).join('')}
        </div>
      `;
    }

    container.innerHTML = html;
  }

  function highlightQuery(text, query) {
    if (!text) return '';
    if (!query) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(re, '<mark class="bg-primary/20 text-primary font-bold px-0.5 rounded">$1</mark>');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return { init };
})();

/* ═══════════════════════════════════════════
   10B. LIVE CAMPUS CLOCK (Asia/Kolkata)
   ═══════════════════════════════════════════ */
const LiveClock = (() => {
  let timer = null;

  function init() {
    if (document.getElementById('ci-live-clock')) return;

    const header = document.querySelector('header');
    if (!header) return;

    // Target the right-side actions cluster in header
    const rightCluster = header.querySelector('.flex.items-center.gap-space-sm.shrink-0') ||
                         header.querySelector('.flex.items-center.gap-space-sm') ||
                         header.querySelector('.ci-portal-header > div:last-child') ||
                         header.lastElementChild;
    if (!rightCluster) return;

    const clockEl = document.createElement('div');
    clockEl.id = 'ci-live-clock';
    clockEl.className = 'ci-live-clock flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container/60 border border-outline-variant/30 text-on-surface text-xs font-medium shrink-0 select-none transition-colors';
    clockEl.setAttribute('role', 'status');
    clockEl.setAttribute('aria-live', 'polite');
    clockEl.setAttribute('title', 'MET Campus Time (Asia/Kolkata, Nashik)');

    clockEl.innerHTML = `
      <span class="material-symbols-outlined text-[15px] text-primary shrink-0 select-none">schedule</span>
      <time id="ci-live-clock-time" class="font-mono font-bold tracking-tight text-on-surface text-[11px] sm:text-xs">--:-- --</time>
      <span id="ci-live-clock-date" class="ci-live-clock-date hidden lg:inline text-[11px] text-secondary border-l border-outline-variant/40 pl-1.5 font-sans whitespace-nowrap">-- --- ----</span>
    `;

    // Place before theme toggle or at beginning of actions
    const themeBtn = rightCluster.querySelector('[aria-label*="Theme"], [aria-label*="theme"], button:has(.material-symbols-outlined)');
    if (themeBtn && themeBtn.parentNode === rightCluster) {
      rightCluster.insertBefore(clockEl, themeBtn);
    } else {
      rightCluster.prepend(clockEl);
    }

    update();
    if (timer) clearInterval(timer);
    timer = setInterval(update, 1000);
    window.__campusInnClockTimer = timer;

    window.addEventListener('beforeunload', destroy);
  }

  function update() {
    const timeEl = document.getElementById('ci-live-clock-time');
    const dateEl = document.getElementById('ci-live-clock-date');
    if (!timeEl) return;

    const now = new Date();

    try {
      const timeFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
      const timeStr = timeFmt.format(now);
      timeEl.textContent = timeStr;
      timeEl.setAttribute('datetime', now.toISOString());

      let dateStr = '';
      if (dateEl) {
        const dateFmt = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
        dateStr = dateFmt.format(now);
        dateEl.textContent = dateStr;
      }
      timeEl.setAttribute('aria-label', `MET Campus Time: ${timeStr}${dateStr ? ' ' + dateStr : ''} (Asia/Kolkata)`);
    } catch (err) {
      timeEl.textContent = now.toLocaleTimeString();
    }
  }

  function destroy() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { init, update, destroy };
})();

/* ═══════════════════════════════════════════
   11. PAGE INITIALIZATION
   ═══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Wire navigation links
  Nav.wireLinks();
  // Wire homepage placement apply workflow
  HomepageApply.init();
  // Wire notification center
  NotificationCenter.init();
  // Wire campus global search
  GlobalSearch.init();
  // Add mobile hamburger
  MobileMenu.addHamburger();
  // Wire portal sidebar manager
  SidebarManager.init();
  // Mount live campus clock in header
  LiveClock.init();
  // Add skip-to-content link
  if (!document.querySelector('.ci-skip-link')) {
    const skip = document.createElement('a');
    skip.className = 'ci-skip-link';
    skip.href = '#main-content';
    skip.textContent = 'Skip to main content';
    document.body.prepend(skip);
  }
  // Mark main content
  const main = document.querySelector('main');
  if (main && !main.id) main.id = 'main-content';

  // Asynchronously verify active session against backend
  if (Auth.isAuthenticated() && window.CampusInnAPI && window.CampusInnAPI.auth) {
    window.CampusInnAPI.auth.me().then(res => {
      if (!res.data && res.status === 401) {
        Auth.clearSession();
        const page = window.location.pathname.split('/').pop() || 'index.html';
        if (page === 'index.html' || page === '' || ['student.html', 'faculty.html', 'admin.html', 'placement.html', 'coordinator.html', 'company.html'].includes(page)) {
          window.location.replace('login.html');
        }
      }
    }).catch(() => {});
  }
});

window.CampusInn = window.CampusInn || {};
Object.assign(window.CampusInn, {
  Auth,
  Theme,
  Nav,
  ProfileMenu,
  NotificationCenter,
  GlobalSearch,
  HomepageApply,
  Toast,
  MobileMenu,
  SidebarManager,
  FormUtils,
  PhoneUtils,
  LiveClock
});

if (!Object.getOwnPropertyDescriptor(window.CampusInn, 'Admin')) {
  Object.defineProperty(window.CampusInn, 'Admin', {
    get() {
      return (typeof window.CampusInnAPI !== 'undefined' && window.CampusInnAPI.admin)
        ? window.CampusInnAPI.admin
        : (this._admin || null);
    },
    set(v) { this._admin = v; },
    configurable: true,
    enumerable: true
  });
}

if (!Object.getOwnPropertyDescriptor(window.CampusInn, 'admin')) {
  Object.defineProperty(window.CampusInn, 'admin', {
    get() {
      return (typeof window.CampusInnAPI !== 'undefined' && window.CampusInnAPI.admin)
        ? window.CampusInnAPI.admin
        : (this._admin || null);
    },
    set(v) { this._admin = v; },
    configurable: true,
    enumerable: true
  });
}

if (!Object.getOwnPropertyDescriptor(window.CampusInn, 'API')) {
  Object.defineProperty(window.CampusInn, 'API', {
    get() {
      return (typeof window.CampusInnAPI !== 'undefined') ? window.CampusInnAPI : null;
    },
    configurable: true,
    enumerable: true
  });
}

if (!Object.getOwnPropertyDescriptor(window.CampusInn, 'DevMock')) {
  Object.defineProperty(window.CampusInn, 'DevMock', {
    get() {
      return (typeof window.CampusInnDevMock !== 'undefined') ? window.CampusInnDevMock : null;
    },
    configurable: true,
    enumerable: true
  });
}


