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

  async function login(identifier, password) {
    if (!identifier || !identifier.trim()) throw new Error('Please enter your ID or college email.');
    if (!password || !password.trim()) throw new Error('Please enter your password.');

    if (typeof window.CampusInnAPI !== 'undefined') {
      const result = await window.CampusInnAPI.auth.login(identifier.trim(), password);
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

  /**
   * Protected portal route guard:
   * Redirects immediately to login.html if unauthenticated, preventing any dashboard flashing.
   */
  function requireAuth(allowedRoles) {
    const session = getSession();
    if (!session) {
      window.location.replace('login.html');
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
    if (typeof window.CampusInnAPI !== 'undefined') {
      window.CampusInnAPI.auth.me().then(res => {
        if (!res.data && res.status === 401) {
          clearSession();
          window.location.replace('login.html');
        }
      }).catch(() => {});
    }
    return true;
  }

  return { getSession, isAuthenticated, getRole, getUser, getRoleConfig,
           getDashboardUrl, login, registerStudent, logout, requireAuth, ROLES };
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

    // Clean extra "Campus Inn+" text beside logo in headers (Requirement 1 & 2)
    document.querySelectorAll('header a[data-path="home"], header a[href*="index.html"]').forEach(logo => {
      logo.href = 'index.html';
      const extraSpan = logo.querySelector('span');
      if (extraSpan && extraSpan.textContent.includes('Campus Inn')) {
        extraSpan.remove();
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
        el.textContent = user.name || user.identifier;
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
   5. MOBILE MENU
   ═══════════════════════════════════════════ */
const MobileMenu = (() => {
  let overlay, drawer, isOpen = false;

  function create() {
    if (document.getElementById('ci-mobile-menu-overlay')) return;

    overlay = document.createElement('div');
    overlay.id = 'ci-mobile-menu-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,.4)',
      zIndex: '998', opacity: '0', visibility: 'hidden',
      transition: 'opacity .3s ease, visibility .3s ease',
      backdropFilter: 'blur(4px)'
    });
    overlay.addEventListener('click', close);

    drawer = document.createElement('div');
    drawer.id = 'ci-mobile-drawer';
    const isDark = Theme.get() === 'dark';
    Object.assign(drawer.style, {
      position: 'fixed', top: '0', right: '0', bottom: '0',
      width: '280px', maxWidth: '85vw',
      background: isDark ? '#151c2c' : '#ffffff',
      zIndex: '999', transform: 'translateX(100%)',
      transition: 'transform .3s ease',
      boxShadow: '-4px 0 24px rgba(0,0,0,.12)',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto'
    });

    const isAuth = Auth.isAuthenticated();
    const user = Auth.getUser();

    drawer.innerHTML = `
      <div style="padding:16px 20px;display:flex;align-items:center;justify-content:space-between;
        border-bottom:1px solid ${isDark ? '#283044' : '#e2e8f0'}">
        <span style="font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.1rem;
          color:${isDark ? '#d3bbff' : '#5300b7'}">Campus Inn+</span>
        <button id="ci-mobile-close" style="background:none;border:none;cursor:pointer;padding:4px;
          color:${isDark ? '#ccc3d7' : '#4a4455'};display:flex">
          <span class="material-symbols-outlined" style="font-size:24px">close</span>
        </button>
      </div>
      ${isAuth && user ? `
        <div style="padding:16px 20px;background:${isDark ? '#1e293b' : '#f5f3ff'};
          border-bottom:1px solid ${isDark ? '#283044' : '#e2e8f0'}">
          <div style="font-weight:600;color:${isDark ? '#fff' : '#131b2e'};font-size:.9rem">
            ${user.name || user.identifier}
          </div>
          <div style="font-size:.75rem;color:${isDark ? '#d3bbff' : '#5300b7'};margin-top:2px">
            ${user.roleLabel}
          </div>
        </div>
      ` : ''}
      <nav style="padding:12px 16px;display:flex;flex-direction:column;gap:4px;flex:1">
        <a href="index.html" style="padding:10px 12px;border-radius:8px;text-decoration:none;
          font-size:.875rem;font-weight:500;color:${isDark ? '#eef0ff' : '#131b2e'};
          display:flex;align-items:center;gap:10px">
          <span class="material-symbols-outlined" style="font-size:20px">home</span> Home</a>
        <a href="events.html" style="padding:10px 12px;border-radius:8px;text-decoration:none;
          font-size:.875rem;font-weight:500;color:${isDark ? '#eef0ff' : '#131b2e'};
          display:flex;align-items:center;gap:10px">
          <span class="material-symbols-outlined" style="font-size:20px">celebration</span> Events</a>
        <a href="index.html#placements" style="padding:10px 12px;border-radius:8px;text-decoration:none;
          font-size:.875rem;font-weight:500;color:${isDark ? '#eef0ff' : '#131b2e'};
          display:flex;align-items:center;gap:10px">
          <span class="material-symbols-outlined" style="font-size:20px">work</span> Placements</a>
        ${isAuth ? `
          <a href="${Auth.getDashboardUrl()}" style="padding:10px 12px;border-radius:8px;text-decoration:none;
            font-size:.875rem;font-weight:600;color:#5300b7;background:${isDark ? '#250059' : '#ede9fe'};
            display:flex;align-items:center;gap:10px">
            <span class="material-symbols-outlined" style="font-size:20px">dashboard</span> My Dashboard</a>
        ` : ''}
        <div style="border-top:1px solid ${isDark ? '#283044' : '#e2e8f0'};margin:8px 0"></div>
        <div style="font-size:.6875rem;text-transform:uppercase;letter-spacing:.06em;font-weight:700;
          color:${isDark ? '#7b7486' : '#4a4455'};padding:4px 12px">Portals</div>
        <a href="student.html" style="padding:10px 12px;border-radius:8px;text-decoration:none;
          font-size:.875rem;font-weight:500;color:${isDark ? '#eef0ff' : '#131b2e'};
          display:flex;align-items:center;gap:10px">
          <span class="material-symbols-outlined" style="font-size:20px">school</span> Student Portal</a>
        <a href="admin.html" style="padding:10px 12px;border-radius:8px;text-decoration:none;
          font-size:.875rem;font-weight:500;color:${isDark ? '#eef0ff' : '#131b2e'};
          display:flex;align-items:center;gap:10px">
          <span class="material-symbols-outlined" style="font-size:20px">admin_panel_settings</span> Admin Console</a>
        <a href="company.html" style="padding:10px 12px;border-radius:8px;text-decoration:none;
          font-size:.875rem;font-weight:500;color:${isDark ? '#eef0ff' : '#131b2e'};
          display:flex;align-items:center;gap:10px">
          <span class="material-symbols-outlined" style="font-size:20px">apartment</span> Recruiter Hub</a>
      </nav>
      <div style="padding:16px 20px;border-top:1px solid ${isDark ? '#283044' : '#e2e8f0'}">
        ${isAuth ? `
          <button onclick="Auth.logout()" style="width:100%;padding:10px;border-radius:8px;
            background:${isDark ? '#1e293b' : '#fef2f2'};border:none;cursor:pointer;
            font-size:.875rem;font-weight:600;color:#ba1a1a;display:flex;align-items:center;
            justify-content:center;gap:8px">
            <span class="material-symbols-outlined" style="font-size:18px">logout</span> Sign Out</button>
        ` : `
          <a href="login.html" style="display:block;text-align:center;padding:10px;border-radius:8px;
            background:#5300b7;color:#fff;text-decoration:none;font-weight:600;font-size:.875rem">
            Sign In</a>
        `}
      </div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
    drawer.querySelector('#ci-mobile-close')?.addEventListener('click', close);
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
    overlay.style.opacity = '0'; overlay.style.visibility = 'hidden';
    drawer.style.transform = 'translateX(100%)';
  }

  function addHamburger() {
    const header = document.querySelector('header');
    if (!header) return;
    // Check if hamburger already exists
    if (header.querySelector('#ci-hamburger')) return;

    const btn = document.createElement('button');
    btn.id = 'ci-hamburger';
    btn.setAttribute('aria-label', 'Open menu');
    btn.className = 'lg:hidden';
    Object.assign(btn.style, {
      background: 'none', border: 'none', cursor: 'pointer', padding: '8px',
      display: 'none', alignItems: 'center', justifyContent: 'center',
      color: 'inherit', order: '99'
    });
    btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:24px">menu</span>';
    btn.addEventListener('click', open);

    // Insert into header actions area
    const actionsDiv = header.querySelector('.flex.items-center.gap-space-sm.shrink-0');
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
   9. PAGE INITIALIZATION
   ═══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Wire navigation links
  Nav.wireLinks();
  // Wire homepage placement apply workflow
  HomepageApply.init();
  // Add mobile hamburger
  MobileMenu.addHamburger();
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
});

window.CampusInn = {
  Auth,
  Theme,
  Nav,
  ProfileMenu,
  HomepageApply,
  Toast,
  MobileMenu,
  FormUtils,
  get API() { return window.CampusInnAPI; },
  get DevMock() { return window.CampusInnDevMock; }
};
