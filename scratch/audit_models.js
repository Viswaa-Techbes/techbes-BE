const fs = require('fs');
const path = require('path');

const rootDir = 'c:/Work/technician_app';
const modelsDir = path.join(rootDir, 'BE', 'models');

const modelFiles = fs.readdirSync(modelsDir).filter(f => f.endsWith('.js'));
const catalog = [];

modelFiles.forEach(file => {
  const filePath = path.join(modelsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const modelName = file.replace('.js', '');

  // Extract collection name if specified or model registration
  const modelMatch = content.match(/mongoose\.model\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)(?:,\s*['"]([^'"]+)['"])?\s*\)/);
  const registeredName = modelMatch ? modelMatch[1] : modelName;
  const collectionName = (modelMatch && modelMatch[3]) ? modelMatch[3] : (registeredName.toLowerCase() + 's');

  // Extract enum values
  const enumMatches = [];
  const enumRegex = /enum:\s*(\[[^\]]+\]|\w+)/g;
  let em;
  while ((em = enumRegex.exec(content)) !== null) {
    enumMatches.push(em[1].replace(/\s+/g, ' '));
  }

  // Extract references (ref: 'ModelName')
  const refMatches = [];
  const refRegex = /ref:\s*['"]([^'"]+)['"]/g;
  let rm;
  while ((rm = refRegex.exec(content)) !== null) {
    if (!refMatches.includes(rm[1])) {
      refMatches.push(rm[1]);
    }
  }

  // Extract indexes
  const indexMatches = [];
  const indexRegex = /\.index\(\s*(\{[^}]+\})(?:,\s*(\{[^}]+\}))?\s*\)/g;
  let im;
  while ((im = indexRegex.exec(content)) !== null) {
    indexMatches.push({
      fields: im[1].replace(/\s+/g, ' '),
      options: im[2] ? im[2].replace(/\s+/g, ' ') : null
    });
  }

  // Extract primary top-level fields
  const fieldList = [];
  const fieldRegex = /^\s{4}([a-zA-Z0-9_]+):\s*\{/gm;
  let fm;
  while ((fm = fieldRegex.exec(content)) !== null) {
    if (!fieldList.includes(fm[1])) {
      fieldList.push(fm[1]);
    }
  }

  catalog.push({
    file,
    modelName: registeredName,
    collectionName,
    references: refMatches,
    enums: enumMatches,
    indexes: indexMatches,
    fields: fieldList,
    sizeBytes: fs.statSync(filePath).size,
  });
});

console.log(`Analyzed ${catalog.length} Mongoose models.`);
fs.writeFileSync(
  path.join(rootDir, 'BE', 'scratch', 'db_schema_catalog.json'),
  JSON.stringify(catalog, null, 2)
);
console.log('Saved BE/scratch/db_schema_catalog.json');
