const fs = require('fs');
const path = require('path');

const adminComponentsDir = path.join('c:/Work/technician_app/admin/src/components');
const files = fs.readdirSync(adminComponentsDir).filter(f => f.endsWith('.jsx') || f.endsWith('.tsx') || f.endsWith('.js'));

const componentApis = {};

files.forEach(f => {
  const content = fs.readFileSync(path.join(adminComponentsDir, f), 'utf8');
  const apiCalls = new Set();
  
  // match apiFetch('/api/v2/...') or fetch('/api/...')
  const apiRegex = /(?:apiFetch|fetch|fetchBackend)\(\s*[`'"]([^`'"]+)[`'"]/g;
  let m;
  while ((m = apiRegex.exec(content)) !== null) {
    apiCalls.add(m[1].split('?')[0]); // strip query params
  }

  // template literals
  const templateRegex = /(?:apiFetch|fetch|fetchBackend)\(\s*`([^`$]+)/g;
  while ((m = templateRegex.exec(content)) !== null) {
    apiCalls.add(m[1]);
  }

  componentApis[f] = Array.from(apiCalls);
});

console.log(JSON.stringify(componentApis, null, 2));
fs.writeFileSync(
  'c:/Work/technician_app/BE/scratch/admin_frontend_apis.json',
  JSON.stringify(componentApis, null, 2)
);
