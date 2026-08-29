const fs = require('fs');
const path = require('path');

const mainAppTsPath = path.join(__dirname, '../../main_app/node_modules/typescript');

function transpileFile(srcRelative, destRelative) {
  const srcPath = path.join(__dirname, srcRelative);
  const destPath = path.join(__dirname, destRelative);

  if (!fs.existsSync(srcPath)) {
    console.error(`❌ Source file not found: ${srcPath}`);
    return;
  }

  const code = fs.readFileSync(srcPath, 'utf8');
  let ts;
  try {
    ts = require(mainAppTsPath);
  } catch (err) {
    console.error(`❌ Failed to load typescript module from main_app/node_modules/typescript:`, err.message);
    process.exit(1);
  }

  console.log(`Transpiling ${srcRelative}...`);
  const result = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    }
  });

  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  fs.writeFileSync(destPath, result.outputText, 'utf8');
  console.log(`✅ Transpiled and wrote to: ${destPath}`);
}

transpileFile('../../main_app/lib/aeo-data.ts', '../data/aeoData.js');
transpileFile('../../main_app/lib/geo-data.ts', '../data/geoData.js');
