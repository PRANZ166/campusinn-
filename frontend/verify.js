/**
 * Campus Inn+ — Frontend Build & Asset Verification Suite
 * Validates file structure, script syntax, stylesheet references,
 * asset links, and HTTP routing across all portal pages.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const FRONTEND_DIR = path.resolve(__dirname);

console.log('==================================================');
console.log('CAMPUS INN+ FRONTEND VERIFICATION SUITE');
console.log('==================================================\n');

// 1. Syntax Check on all JS client files
const jsFiles = ['api.js', 'shared.js', 'mock-data.js'];
let jsPass = true;

console.log('[1/4] Checking JavaScript client syntax...');
jsFiles.forEach(file => {
  const filePath = path.join(FRONTEND_DIR, 'js', file);
  if (!fs.existsSync(filePath)) {
    console.error(`  [FAIL] Missing JS file: js/${file}`);
    jsPass = false;
    return;
  }
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    new Function(code);
    console.log(`  [PASS] js/${file} parsed without syntax errors`);
  } catch (err) {
    console.error(`  [FAIL] Syntax error in js/${file}: ${err.message}`);
    jsPass = false;
  }
});

// 2. Stylesheet check
console.log('\n[2/4] Checking stylesheet assets...');
const cssPath = path.join(FRONTEND_DIR, 'css', 'theme.css');
if (fs.existsSync(cssPath) && fs.statSync(cssPath).size > 0) {
  console.log(`  [PASS] css/theme.css present (${(fs.statSync(cssPath).size / 1024).toFixed(1)} KB)`);
} else {
  console.error(`  [FAIL] Missing or empty css/theme.css`);
  jsPass = false;
}

// 3. Portal Pages Integrity & Asset Linking
console.log('\n[3/4] Verifying all 13 HTML pages and links...');
const pages = [
  { file: 'index.html', title: 'Public Home' },
  { file: 'login.html', title: 'Unified Portal Login' },
  { file: 'student.html', title: 'Student Career & Placement Portal' },
  { file: 'placement.html', title: 'Placement Officer Portal' },
  { file: 'faculty.html', title: 'Faculty Portal' },
  { file: 'coordinator.html', title: 'Campus Coordinator Hub' },
  { file: 'company.html', title: 'Recruiter ATS & Talent Gateway' },
  { file: 'admin.html', title: 'Enterprise Admin Console' },
  { file: 'events.html', title: 'Campus Events & Hackathons Hub' },
  { file: 'about.html', title: 'Institutional Ecosystem & About' },
  { file: 'companies.html', title: 'Corporate Partners Directory' },
  { file: 'hiring-builder.html', title: 'HR Hiring Requirement Builder' },
  { file: 'hr-register.html', title: 'Company HR Registration' },
];

let pagesPass = true;
pages.forEach(p => {
  const filePath = path.join(FRONTEND_DIR, p.file);
  if (!fs.existsSync(filePath)) {
    console.error(`  [FAIL] Missing page: ${p.file}`);
    pagesPass = false;
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const hasTheme = content.includes('css/theme.css');
  const hasApi = content.includes('js/api.js');
  const hasShared = content.includes('js/shared.js');
  const hasTailwind = content.includes('cdn.tailwindcss.com');
  const hasFonts = content.includes('fonts.googleapis.com');

  if (hasTheme && hasApi && hasShared && hasTailwind && hasFonts) {
    console.log(`  [PASS] ${p.file.padEnd(20)} -> ${p.title} (All core scripts & styles verified)`);
  } else {
    console.warn(`  [WARN] ${p.file.padEnd(20)} -> partial links (theme:${hasTheme}, api:${hasApi}, shared:${hasShared})`);
  }
});

// 4. Test HTTP Server Serving
console.log('\n[4/4] Testing HTTP Serving & Portability on port 5599...');
const PORT = 5599;
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(FRONTEND_DIR, reqPath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } else {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    }
  });
});

server.listen(PORT, async () => {
  let httpPass = true;

  for (const p of pages) {
    await new Promise((resolve) => {
      http.get(`http://localhost:${PORT}/${p.file}`, (res) => {
        if (res.statusCode === 200) {
          console.log(`  [HTTP 200] /${p.file}`);
        } else {
          console.error(`  [HTTP ${res.statusCode}] /${p.file}`);
          httpPass = false;
        }
        resolve();
      }).on('error', (err) => {
        console.error(`  [HTTP ERR] /${p.file}: ${err.message}`);
        httpPass = false;
        resolve();
      });
    });
  }

  const staticAssets = ['assets/campus_inn_logo.svg', 'assets/logo.svg', 'css/theme.css'];
  for (const asset of staticAssets) {
    await new Promise((resolve) => {
      http.get(`http://localhost:${PORT}/${asset}`, (res) => {
        if (res.statusCode === 200) {
          console.log(`  [HTTP 200] /${asset}`);
        } else {
          console.error(`  [HTTP ${res.statusCode}] /${asset}`);
          httpPass = false;
        }
        resolve();
      }).on('error', (err) => {
        console.error(`  [HTTP ERR] /${asset}: ${err.message}`);
        httpPass = false;
        resolve();
      });
    });
  }

  server.close(() => {
    console.log('\n==================================================');
    if (jsPass && pagesPass && httpPass) {
      console.log('FRONTEND VERIFICATION COMPLETE: ALL 13 PAGES READY');
      console.log('==================================================');
      process.exit(0);
    } else {
      console.error('FRONTEND VERIFICATION ENCOUNTERED ISSUES');
      console.log('==================================================');
      process.exit(1);
    }
  });
});
