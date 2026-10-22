const fs = require('fs');
const path = require('path');

const adminComponentsDir = path.join('c:/Work/technician_app/admin/src/components');
const files = fs.readdirSync(adminComponentsDir).filter(f => f.endsWith('.jsx') || f.endsWith('.tsx') || f.endsWith('.js'));

console.log('--- Admin Component Files & Sizes ---');
files.forEach(f => {
  const stat = fs.statSync(path.join(adminComponentsDir, f));
  console.log(`${f}: ${(stat.size / 1024).toFixed(1)} KB`);
});

// Extract exported components from AdminPagesModern.jsx
const content = fs.readFileSync(path.join(adminComponentsDir, 'AdminPagesModern.jsx'), 'utf8');
const exportRegex = /export\s+(?:function|const)\s+([A-Za-z0-9_]+)/g;
const exportsList = [];
let m;
while ((m = exportRegex.exec(content)) !== null) {
  exportsList.push(m[1]);
}
console.log('\n--- Exported Components in AdminPagesModern.jsx ---');
console.log(exportsList.join(', '));
