const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      if (f !== 'node_modules') {
        walkDir(dirPath, callback);
      }
    } else {
      if (dirPath.endsWith('.js')) {
        callback(path.join(dir, f));
      }
    }
  });
}

let allErrors = [];

walkDir(__dirname, (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
  let match;
  while ((match = requireRegex.exec(content)) !== null) {
    const importPath = match[1];
    
    // Check if it's a relative path
    if (importPath.startsWith('.')) {
      const resolvedPath = path.resolve(path.dirname(filePath), importPath);
      // It can be resolvedPath.js, resolvedPath/index.js, or just resolvedPath
      if (!fs.existsSync(resolvedPath) && !fs.existsSync(resolvedPath + '.js') && !fs.existsSync(path.join(resolvedPath, 'index.js'))) {
        allErrors.push({ file: filePath, importPath });
      }
    } else {
      // Check if it's a built-in module or node_modules
      const packageJsonPath = path.join(__dirname, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const deps = Object.keys(pkg.dependencies || {});
      const devDeps = Object.keys(pkg.devDependencies || {});
      const allDeps = [...deps, ...devDeps];
      
      const isBuiltin = ['fs', 'path', 'crypto', 'http', 'https', 'dns', 'util', 'events', 'stream', 'url', 'os', 'child_process', 'timers', 'assert'].includes(importPath);
      
      if (!isBuiltin) {
        const moduleName = importPath.split('/')[0] + (importPath.startsWith('@') ? '/' + importPath.split('/')[1] : '');
        if (!allDeps.includes(moduleName)) {
           // Might be globally installed or implicit, but let's log it
           allErrors.push({ file: filePath, importPath: importPath + " (Missing from package.json)"});
        }
      }
    }
  }
});

fs.writeFileSync(path.join(__dirname, 'require_errors.json'), JSON.stringify(allErrors, null, 2));
console.log("Done");
