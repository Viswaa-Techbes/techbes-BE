const fs = require('fs');
const path = require('path');

const mainAppDir = 'c:/Work/technician_app/main_app';

function getFiles(dir, exts = ['.ts', '.tsx', '.js', '.jsx']) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', '.git'].includes(entry.name)) {
        files = files.concat(getFiles(fullPath, exts));
      }
    } else if (exts.includes(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

const allFiles = getFiles(mainAppDir);
const mainAppApis = {};

allFiles.forEach(filePath => {
  const relPath = path.relative(mainAppDir, filePath).replace(/\\/g, '/');
  const content = fs.readFileSync(filePath, 'utf8');
  const apiCalls = new Set();

  // match fetch('/api/...') or apiClient('/...') or api.get('/...')
  const fetchRegex = /fetch\(\s*[`'"]([^`'"]+)[`'"]/g;
  let m;
  while ((m = fetchRegex.exec(content)) !== null) {
    if (m[1].startsWith('/api') || m[1].startsWith('/leads')) {
      apiCalls.add(m[1].split('?')[0]);
    }
  }

  const templateRegex = /fetch\(\s*`([^`$]+)/g;
  while ((m = templateRegex.exec(content)) !== null) {
    if (m[1].startsWith('/api') || m[1].startsWith('/leads')) {
      apiCalls.add(m[1]);
    }
  }

  // Also check apiClient or axios or similar wrappers
  const clientRegex = /(?:apiClient|api|http)\.(?:get|post|put|delete|patch)\(\s*[`'"]([^`'"]+)[`'"]/g;
  while ((m = clientRegex.exec(content)) !== null) {
    apiCalls.add(m[1].split('?')[0]);
  }

  if (apiCalls.size > 0) {
    mainAppApis[relPath] = Array.from(apiCalls);
  }
});

console.log(`Found ${Object.keys(mainAppApis).length} files making API calls in Main App:`);
console.log(JSON.stringify(mainAppApis, null, 2));

fs.writeFileSync(
  'c:/Work/technician_app/BE/scratch/main_app_frontend_apis.json',
  JSON.stringify(mainAppApis, null, 2)
);
