function printMountedRoutes(app) {
  const routes = [];

  function getPathFromRegexp(regexp) {
    if (!regexp) return '';
    let src = regexp.source;

    // Remove start anchor
    if (src.startsWith('^')) {
      src = src.slice(1);
    }
    
    // Remove lookaheads and optional trailing slashes commonly added by Express
    src = src.replace(/\\\/\?\(\?=\\\/\|\$\)/g, '');
    src = src.replace(/\?\(\?=\\\/\|\$\)/g, '');
    src = src.replace(/\(\?=\\\/\|\$\)/g, '');
    
    if (src.endsWith('\\/?')) {
      src = src.slice(0, -3);
    }
    if (src.endsWith('/?')) {
      src = src.slice(0, -2);
    }
    
    // Unescape
    src = src.replace(/\\(.)/g, '$1');
    
    // Filter out regex wildcard patterns
    if (src === '.*' || src === '.*?' || src.includes('(?:') || src.includes('([^/]+?)')) {
      return '';
    }
    
    return src;
  }

  function traverse(stack, prefix = '') {
    if (!stack) return;
    
    stack.forEach((layer) => {
      if (layer.route) {
        // This is a direct route handler
        const path = layer.route.path;
        const methods = Object.keys(layer.route.methods)
          .map((m) => m.toUpperCase())
          .join(', ');
        
        const fullPath = `${prefix}${path}`.replace(/\/+/g, '/');
        routes.push({ methods, path: fullPath });
      } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        // This is a sub-router
        const routePrefix = getPathFromRegexp(layer.regexp);
        traverse(layer.handle.stack, `${prefix}${routePrefix}`);
      }
    });
  }

  if (app._router && app._router.stack) {
    traverse(app._router.stack);
  }

  // Remove duplicates and sort
  const uniqueRoutes = [];
  const seen = new Set();
  
  routes.forEach((r) => {
    const key = `${r.methods} ${r.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRoutes.push(r);
    }
  });

  uniqueRoutes.sort((a, b) => a.path.localeCompare(b.path) || a.methods.localeCompare(b.methods));

  console.log('\n=================== MOUNTED ROUTES ===================');
  uniqueRoutes.forEach((r) => {
    console.log(`  [${r.methods.padEnd(7)}] ${r.path}`);
  });
  console.log('======================================================\n');
}

module.exports = { printMountedRoutes };
