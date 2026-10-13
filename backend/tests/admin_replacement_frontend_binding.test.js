/**
 * Regression Test: Admin Replacement Frontend Module Integration
 * Verifies that CampusInn.Admin and CampusInnAPI.admin expose initiateAdminReplacement
 * and confirmAdminReplacement without throwing "Cannot read properties of undefined".
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');
const apiJsPath = path.join(rootDir, 'frontend', 'js', 'api.js');
const sharedJsPath = path.join(rootDir, 'frontend', 'js', 'shared.js');
const mockDataJsPath = path.join(rootDir, 'frontend', 'js', 'mock-data.js');

function setupBrowserEnvironment() {
  const storage = {};
  const mockStorage = {
    getItem: (k) => storage[k] || null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
  };

  const win = {
    location: { pathname: '/login.html', href: '', replace: jest.fn() },
    localStorage: mockStorage,
    sessionStorage: mockStorage
  };

  const doc = {
    documentElement: { classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn() } },
    querySelectorAll: jest.fn(() => []),
    querySelector: jest.fn(() => null),
    getElementById: jest.fn(() => null),
    createElement: jest.fn(() => ({
      style: {},
      classList: { add: jest.fn(), remove: jest.fn() },
      appendChild: jest.fn(),
      setAttribute: jest.fn(),
      querySelector: jest.fn(() => ({ style: {} })),
      remove: jest.fn()
    })),
    head: { appendChild: jest.fn() },
    body: { appendChild: jest.fn(), prepend: jest.fn(), style: {} },
    addEventListener: jest.fn()
  };

  return { win, doc, storage };
}

describe('Frontend Admin Replacement Module Integration & Regression Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Module Loading Order 1: api.js loads first, followed by shared.js', () => {
    const { win, doc } = setupBrowserEnvironment();
    global.window = win;
    global.document = doc;
    global.localStorage = win.localStorage;
    global.sessionStorage = win.sessionStorage;

    const mockDataCode = fs.readFileSync(mockDataJsPath, 'utf8');
    const apiCode = fs.readFileSync(apiJsPath, 'utf8');
    const sharedCode = fs.readFileSync(sharedJsPath, 'utf8');

    eval(mockDataCode);
    eval(apiCode);
    eval(sharedCode);

    // Verify window.CampusInnAPI.admin
    expect(global.window.CampusInnAPI).toBeDefined();
    expect(global.window.CampusInnAPI.admin).toBeDefined();
    expect(typeof global.window.CampusInnAPI.admin.initiateAdminReplacement).toBe('function');
    expect(typeof global.window.CampusInnAPI.admin.confirmAdminReplacement).toBe('function');
    expect(typeof global.window.CampusInnAPI.admin.getReplaceStatus).toBe('function');

    // Verify window.CampusInn
    expect(global.window.CampusInn).toBeDefined();
    expect(global.window.CampusInn.Admin).toBeDefined();
    expect(typeof global.window.CampusInn.Admin.initiateAdminReplacement).toBe('function');
    expect(typeof global.window.CampusInn.Admin.confirmAdminReplacement).toBe('function');
    expect(typeof global.window.CampusInn.Admin.getReplaceStatus).toBe('function');

    // Verify window.CampusInn.admin lowercase alias
    expect(global.window.CampusInn.admin).toBeDefined();
    expect(typeof global.window.CampusInn.admin.initiateAdminReplacement).toBe('function');
    expect(typeof global.window.CampusInn.admin.confirmAdminReplacement).toBe('function');

    // Verify window.CampusInn.Auth admin methods
    expect(typeof global.window.CampusInn.Auth.getAdminSetupStatus).toBe('function');
    expect(typeof global.window.CampusInn.Auth.bootstrapAdmin).toBe('function');
  });

  test('Module Loading Order 2: shared.js loads first, followed by api.js', () => {
    const { win, doc } = setupBrowserEnvironment();
    global.window = win;
    global.document = doc;
    global.localStorage = win.localStorage;
    global.sessionStorage = win.sessionStorage;

    const mockDataCode = fs.readFileSync(mockDataJsPath, 'utf8');
    const apiCode = fs.readFileSync(apiJsPath, 'utf8');
    const sharedCode = fs.readFileSync(sharedJsPath, 'utf8');

    eval(mockDataCode);
    eval(sharedCode);
    eval(apiCode);

    // Verify window.CampusInnAPI.admin
    expect(global.window.CampusInnAPI).toBeDefined();
    expect(global.window.CampusInnAPI.admin).toBeDefined();
    expect(typeof global.window.CampusInnAPI.admin.initiateAdminReplacement).toBe('function');
    expect(typeof global.window.CampusInnAPI.admin.confirmAdminReplacement).toBe('function');

    // Verify window.CampusInn.Admin dynamically resolves to API.admin
    expect(global.window.CampusInn.Admin).toBeDefined();
    expect(typeof global.window.CampusInn.Admin.initiateAdminReplacement).toBe('function');
    expect(typeof global.window.CampusInn.Admin.confirmAdminReplacement).toBe('function');
  });

  test('Calling initiateAdminReplacement directly through CampusInn.Admin does not throw undefined error', async () => {
    const { win, doc } = setupBrowserEnvironment();
    global.window = win;
    global.document = doc;
    global.localStorage = win.localStorage;
    global.sessionStorage = win.sessionStorage;

    const mockDataCode = fs.readFileSync(mockDataJsPath, 'utf8');
    const apiCode = fs.readFileSync(apiJsPath, 'utf8');
    const sharedCode = fs.readFileSync(sharedJsPath, 'utf8');

    eval(mockDataCode);
    eval(apiCode);
    eval(sharedCode);

    // Mock fetch for network call
    global.fetch = jest.fn().mockResolvedValue({
      status: 201,
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({
        success: true,
        message: 'Replacement administrator account created.',
        admin: { id: 'usr_newadmin', email: 'new.admin@campus.edu.in', username: 'newadmin' }
      })
    });

    const payload = {
      fullName: 'Dr. New Admin',
      username: 'newadmin',
      email: 'new.admin@campus.edu.in',
      password: 'AdminPassword123!',
      operatorSecret: 'SecretOperatorKey123'
    };

    // Should execute without throwing "Cannot read properties of undefined"
    const res = await global.window.CampusInn.Admin.initiateAdminReplacement(payload);
    expect(res).toBeDefined();
    expect(res.data).toBeDefined();
    expect(res.data.success).toBe(true);
    expect(res.data.admin.email).toBe('new.admin@campus.edu.in');
  });

  test('Calling confirmAdminReplacement directly through CampusInn.Admin executes successfully', async () => {
    const { win, doc } = setupBrowserEnvironment();
    global.window = win;
    global.document = doc;
    global.localStorage = win.localStorage;
    global.sessionStorage = win.sessionStorage;

    const mockDataCode = fs.readFileSync(mockDataJsPath, 'utf8');
    const apiCode = fs.readFileSync(apiJsPath, 'utf8');
    const sharedCode = fs.readFileSync(sharedJsPath, 'utf8');

    eval(mockDataCode);
    eval(apiCode);
    eval(sharedCode);

    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({
        success: true,
        message: 'Administrator replacement confirmed.',
        newAdmin: { id: 'usr_newadmin', email: 'new.admin@campus.edu.in', role: 'admin' },
        revokedAdmins: [{ id: 'usr_oldadmin', email: 'director@met.edu' }]
      })
    });

    const payload = {
      confirm: true,
      newAdminId: 'usr_newadmin',
      operatorSecret: 'SecretOperatorKey123'
    };

    const res = await global.window.CampusInn.Admin.confirmAdminReplacement(payload);
    expect(res).toBeDefined();
    expect(res.data).toBeDefined();
    expect(res.data.success).toBe(true);
    expect(res.data.revokedAdmins).toHaveLength(1);
  });
});
