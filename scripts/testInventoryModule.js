/**
 * Isolated Integration & Unit Test Suite for TechBes Dynamic Inventory Module
 * Does NOT connect to production MongoDB (promoDB). Runs against real Express app,
 * real Mongoose schema validators, and a deterministic in-memory store.
 */

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'techbes_test_jwt_secret_isolated_12345';
process.env.NODE_ENV = 'test';

const Material = require('../models/Material');
const InventoryTransaction = require('../models/InventoryTransaction');
const PricingConfig = require('../models/PricingConfig');
const QuoteRequest = require('../models/QuoteRequest');
const Job = require('../models/Job');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');

// CCTV models used by cctvPricingService test
const CctvPricingConfig = require('../models/CctvPricingConfig');
const CctvCablePricing = require('../models/CctvCablePricing');
const CctvInstallationCharge = require('../models/CctvInstallationCharge');
const CctvAccessory = require('../models/CctvAccessory');
const CctvModel = require('../models/CctvModel');
const CctvSdCard = require('../models/CctvSdCard');
const CctvHdd = require('../models/CctvHdd');
const CctvRack = require('../models/CctvRack');

function getFieldValue(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    if (Array.isArray(acc)) return acc.map((x) => (x ? x[key] : undefined));
    return acc[key];
  }, obj);
}

function matchesExpr(doc, expr) {
  if (!expr) return true;
  if (expr.$lte) {
    const [a, b] = expr.$lte;
    const va = typeof a === 'string' && a.startsWith('$') ? doc[a.slice(1)] : a;
    const vb = typeof b === 'string' && b.startsWith('$') ? doc[b.slice(1)] : b;
    return Number(va) <= Number(vb);
  }
  if (expr.$gt) {
    const [a, b] = expr.$gt;
    const va = typeof a === 'string' && a.startsWith('$') ? doc[a.slice(1)] : a;
    const vb = typeof b === 'string' && b.startsWith('$') ? doc[b.slice(1)] : b;
    return Number(va) > Number(vb);
  }
  return true;
}

function matchCondition(val, cond) {
  if (cond instanceof RegExp) {
    if (Array.isArray(val)) return val.some((v) => cond.test(String(v || '')));
    return cond.test(String(val || ''));
  }
  if (cond && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof mongoose.Types.ObjectId) && !(cond instanceof Date)) {
    if ('$regex' in cond) {
      const rx = cond.$regex instanceof RegExp ? cond.$regex : new RegExp(cond.$regex, cond.$options || '');
      return matchCondition(val, rx);
    }
    if ('$ne' in cond) {
      return String(val) !== String(cond.$ne);
    }
    if ('$in' in cond) {
      const list = cond.$in.map((x) => String(x));
      if (Array.isArray(val)) return val.some((v) => list.includes(String(v)));
      return list.includes(String(val));
    }
    if ('$gt' in cond || '$gte' in cond || '$lt' in cond || '$lte' in cond) {
      const numVal = val instanceof Date ? val.getTime() : Number(val);
      if ('$gt' in cond && !(numVal > Number(cond.$gt))) return false;
      if ('$gte' in cond && !(numVal >= Number(cond.$gte))) return false;
      if ('$lt' in cond && !(numVal < Number(cond.$lt))) return false;
      if ('$lte' in cond && !(numVal <= Number(cond.$lte))) return false;
      return true;
    }
  }
  if (Array.isArray(val)) {
    return val.some((v) => String(v) === String(cond));
  }
  return String(val) === String(cond);
}

function matchesQuery(doc, query = {}) {
  for (const [key, cond] of Object.entries(query)) {
    if (key === '$and') {
      if (!cond.every((sub) => matchesQuery(doc, sub))) return false;
    } else if (key === '$or') {
      if (!cond.some((sub) => matchesQuery(doc, sub))) return false;
    } else if (key === '$expr') {
      if (!matchesExpr(doc, cond)) return false;
    } else {
      const val = getFieldValue(doc, key);
      if (!matchCondition(val, cond)) return false;
    }
  }
  return true;
}

function makeQuery(rows, isSingle = false) {
  let result = rows;
  let sortSpec = null;
  let skipNum = 0;
  let limitNum = null;

  const q = {
    sort(spec) {
      sortSpec = spec;
      return q;
    },
    skip(n) {
      skipNum = n || 0;
      return q;
    },
    limit(n) {
      limitNum = n;
      return q;
    },
    select() {
      return q;
    },
    populate() {
      return q;
    },
    lean() {
      return q;
    },
    exec() {
      let out = [...result];
      if (sortSpec) {
        const entries = Object.entries(sortSpec);
        out.sort((a, b) => {
          for (const [k, dir] of entries) {
            const va = a[k] ?? 0;
            const vb = b[k] ?? 0;
            if (va < vb) return dir >= 0 ? -1 : 1;
            if (va > vb) return dir >= 0 ? 1 : -1;
          }
          return 0;
        });
      }
      if (skipNum) out = out.slice(skipNum);
      if (limitNum !== null) out = out.slice(0, limitNum);
      if (isSingle) return Promise.resolve(out[0] || null);
      return Promise.resolve(out);
    },
    then(resolve, reject) {
      return q.exec().then(resolve, reject);
    },
  };
  return q;
}

function attachInMemoryStore(Model, store) {
  const wrapDoc = (raw) => {
    const doc = { ...raw };
    doc.toObject = () => ({ ...doc });
    doc.save = async (opts = {}) => {
      if (opts?.validateBeforeSave !== false) {
        const realDoc = new Model(doc);
        const err = realDoc.validateSync();
        if (err) throw err;
      }
      const now = new Date();
      doc.updatedAt = now;
      const idx = store.findIndex((x) => String(x._id) === String(doc._id));
      if (idx >= 0) store[idx] = { ...doc };
      else store.push({ ...doc });
      return doc;
    };
    return doc;
  };

  Model.find = (query = {}) => makeQuery(store.filter((d) => matchesQuery(d, query)).map(wrapDoc), false);
  Model.findOne = (query = {}) => makeQuery(store.filter((d) => matchesQuery(d, query)).map(wrapDoc), true);
  Model.findById = (id) => makeQuery(store.filter((d) => String(d._id) === String(id)).map(wrapDoc), true);
  Model.countDocuments = async (query = {}) => store.filter((d) => matchesQuery(d, query)).length;
  Model.create = async (payload) => {
    const real = new Model(payload);
    const err = real.validateSync();
    if (err) throw err;
    const obj = real.toObject({ virtuals: true });
    const now = new Date();
    obj.createdAt = obj.createdAt || now;
    obj.updatedAt = now;
    store.push(obj);
    return wrapDoc(obj);
  };
  Model.findByIdAndUpdate = (id, update = {}, opts = {}) =>
    Model.findOneAndUpdate({ _id: id }, update, opts);
  Model.findOneAndUpdate = (filter = {}, update = {}, opts = {}) => {
    const idx = store.findIndex((d) => matchesQuery(d, filter));
    const single = () => {
      if (idx < 0) return null;
      const next = { ...store[idx] };
      if (update.$set) Object.assign(next, update.$set);
      if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          next[k] = Number(next[k] || 0) + Number(v);
        }
      }
      next.updatedAt = new Date();
      const real = new Model(next);
      const err = real.validateSync();
      if (err) throw err;
      store[idx] = next;
      return wrapDoc(next);
    };
    return {
      lean() {
        return this;
      },
      select() {
        return this;
      },
      then(resolve, reject) {
        try {
          resolve(single());
        } catch (e) {
          reject(e);
        }
      },
    };
  };
  Model.findByIdAndDelete = (id) => {
    const idx = store.findIndex((d) => String(d._id) === String(id));
    const removed = idx >= 0 ? store.splice(idx, 1)[0] : null;
    return {
      lean() {
        return this;
      },
      then(resolve) {
        resolve(removed ? wrapDoc(removed) : null);
      },
    };
  };
}

async function runTests() {
  const stores = {
    materials: [],
    transactions: [],
    pricingConfigs: [],
    quotes: [],
    jobs: [],
    audits: [],
    users: [],
    cctvConfigs: [],
    cctvCables: [],
    cctvInstalls: [],
    cctvAccs: [],
    cctvModels: [],
    cctvSds: [],
    cctvHdds: [],
    cctvRacks: [],
  };

  attachInMemoryStore(Material, stores.materials);
  attachInMemoryStore(InventoryTransaction, stores.transactions);
  attachInMemoryStore(PricingConfig, stores.pricingConfigs);
  attachInMemoryStore(QuoteRequest, stores.quotes);
  attachInMemoryStore(Job, stores.jobs);
  attachInMemoryStore(AuditLog, stores.audits);
  attachInMemoryStore(User, stores.users);
  attachInMemoryStore(CctvPricingConfig, stores.cctvConfigs);
  attachInMemoryStore(CctvCablePricing, stores.cctvCables);
  attachInMemoryStore(CctvInstallationCharge, stores.cctvInstalls);
  attachInMemoryStore(CctvAccessory, stores.cctvAccs);
  attachInMemoryStore(CctvModel, stores.cctvModels);
  attachInMemoryStore(CctvSdCard, stores.cctvSds);
  attachInMemoryStore(CctvHdd, stores.cctvHdds);
  attachInMemoryStore(CctvRack, stores.cctvRacks);

  const adminId = new mongoose.Types.ObjectId();
  const techId = new mongoose.Types.ObjectId();
  const adminUser = {
    _id: adminId,
    name: 'Test Admin',
    email: 'admin@test.local',
    role: 'admin',
    sessionActive: true,
    lastSeen: new Date(),
  };
  const techUser = {
    _id: techId,
    name: 'Test Tech',
    email: 'tech@test.local',
    role: 'technician',
    sessionActive: true,
    lastSeen: new Date(),
  };
  stores.users.push(adminUser, techUser);

  const adminToken = jwt.sign(
    { sub: String(adminId), id: String(adminId), role: 'admin', email: 'admin@test.local', name: 'Test Admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  const techToken = jwt.sign(
    { sub: String(techId), id: String(techId), role: 'technician', email: 'tech@test.local', name: 'Test Tech' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Spin up minimal Express app with exact v2 routes + auth middleware + errorHandler
  const express = require('express');
  const adminRoutesV2 = require('../routes/v2/adminRoutesV2');
  const inventoryRoutesV2 = require('../routes/v2/inventoryRoutesV2');
  const errorHandler = require('../middlewares/errorHandler');

  const testApp = express();
  testApp.use(express.json());
  testApp.use('/api/v2/admin', adminRoutesV2);
  testApp.use('/api/v2/inventory', inventoryRoutesV2);
  testApp.use(errorHandler);

  const server = http.createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function api(path, { method = 'GET', token = adminToken, body, csrf = true } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    if (csrf) {
      headers['X-Requested-With'] = 'XMLHttpRequest';
      headers['X-CSRF-Protection'] = '1';
    }
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    return { status: res.status, json };
  }

  let passed = 0;
  function ok(label) {
    passed += 1;
    console.log(`  [PASS] ${label}`);
  }

  try {
    console.log('Running TechBes Dynamic Inventory Integration Suite...\n');

    // 1. Authorization & RBAC checks
    const unauth = await api('/api/v2/admin/inventory/dashboard', { token: null });
    assert.strictEqual(unauth.status, 401);
    ok('Unauthenticated admin dashboard request blocked (401)');

    const forbidden = await api('/api/v2/admin/inventory/dashboard', { token: techToken });
    assert.strictEqual(forbidden.status, 403);
    ok('Non-admin role blocked from admin inventory API (403)');

    // 2. Negative price & negative stock validation
    const badPrice = await api('/api/v2/admin/inventory/products', {
      method: 'POST',
      body: { name: 'Bad Cam', sellingPrice: -100, stock: 5 },
    });
    assert.strictEqual(badPrice.status, 400);
    ok('Negative sellingPrice rejected with 400');

    const badStock = await api('/api/v2/admin/inventory/products', {
      method: 'POST',
      body: { name: 'Bad Stock Cam', sellingPrice: 1000, stock: -2 },
    });
    assert.strictEqual(badStock.status, 400);
    ok('Negative initial stock rejected with 400');

    // 3. Create inventory item + auto initial_stock transaction
    const createRes1 = await api('/api/v2/admin/inventory/products', {
      method: 'POST',
      body: {
        name: 'Hikvision 2MP IP Dome Camera',
        sku: 'hik-2mp-dome',
        category: 'CCTV',
        subcategory: 'IP Cameras',
        itemType: 'product',
        brand: 'Hikvision',
        modelNumber: 'DS-2CD1123G0',
        specifications: '1080p, IR 30m, PoE, IP67',
        unit: 'Piece',
        purchasePrice: 1450,
        sellingPrice: 2200,
        stock: 12,
        minStock: 5,
        gstRate: 18,
        compatibleCategories: ['CCTV'],
      },
    });
    assert.strictEqual(createRes1.status, 201);
    assert.strictEqual(createRes1.json.data.sku, 'HIK-2MP-DOME');
    assert.strictEqual(createRes1.json.data.stockStatus, 'in_stock');
    const camId = createRes1.json.data._id;
    assert.strictEqual(stores.transactions.length, 1);
    assert.strictEqual(stores.transactions[0].transactionType, 'initial_stock');
    ok('Inventory item created with SKU normalization and automatic initial_stock transaction');

    // 4. Prevent duplicate SKU (case-insensitive)
    const dupSku = await api('/api/v2/admin/inventory/products', {
      method: 'POST',
      body: { name: 'Duplicate Cam', sku: 'HIK-2MP-DOME', sellingPrice: 1800, stock: 2 },
    });
    assert.strictEqual(dupSku.status, 409);
    ok('Duplicate SKU prevented with 409 Conflict');

    // 5. Create low-stock & out-of-stock & cable items
    const createCable = await api('/api/v2/admin/inventory/products', {
      method: 'POST',
      body: {
        name: 'D-Link Cat6 UTP Cable',
        sku: 'DLINK-CAT6-M',
        category: 'Networking',
        itemType: 'material',
        brand: 'D-Link',
        unit: 'Meter',
        purchasePrice: 18,
        sellingPrice: 32,
        stock: 4,
        minStock: 20,
        gstRate: 18,
        compatibleCategories: ['CCTV', 'Networking'],
      },
    });
    assert.strictEqual(createCable.status, 201);
    assert.strictEqual(createCable.json.data.stockStatus, 'low_stock');
    const cableId = createCable.json.data._id;

    const createBox = await api('/api/v2/admin/inventory/products', {
      method: 'POST',
      body: {
        name: 'Weatherproof Camera Junction Box',
        sku: 'CAM-BOX-PVC',
        category: 'CCTV',
        itemType: 'accessory',
        unit: 'Piece',
        purchasePrice: 35,
        sellingPrice: 80,
        stock: 0,
        minStock: 10,
        gstRate: 18,
      },
    });
    assert.strictEqual(createBox.status, 201);
    assert.strictEqual(createBox.json.data.stockStatus, 'out_of_stock');
    const boxId = createBox.json.data._id;
    ok('Low-stock and out-of-stock health states computed accurately');

    // 6. Search & category filtering
    const catFilter = await api('/api/v2/admin/inventory/products?category=Networking');
    assert.strictEqual(catFilter.status, 200);
    assert.strictEqual(catFilter.json.data.length, 1);
    assert.strictEqual(catFilter.json.data[0].sku, 'DLINK-CAT6-M');

    const specSearch = await api('/api/v2/admin/inventory/products?search=IP67');
    assert.strictEqual(specSearch.status, 200);
    assert.strictEqual(specSearch.json.data.length, 1);
    assert.strictEqual(specSearch.json.data[0].sku, 'HIK-2MP-DOME');
    ok('Search by specs and filtering by category verified');

    // 7. Stock adjustments & negative stock protection & movement history
    const missingReason = await api(`/api/v2/admin/inventory/products/${camId}/stock`, {
      method: 'POST',
      body: { transactionType: 'addition', quantity: 5, reason: '' },
    });
    assert.strictEqual(missingReason.status, 400);

    const negReduce = await api(`/api/v2/admin/inventory/products/${camId}/stock`, {
      method: 'POST',
      body: { transactionType: 'reduction', quantity: 50, reason: 'Excess reduction test' },
    });
    assert.strictEqual(negReduce.status, 400);

    const addStock = await api(`/api/v2/admin/inventory/products/${camId}/stock`, {
      method: 'POST',
      body: { transactionType: 'addition', quantity: 8, reason: 'Supplier restock PO-101', referenceType: 'purchase_order', referenceId: 'PO-101' },
    });
    assert.strictEqual(addStock.status, 200);
    assert.strictEqual(addStock.json.data.stock, 20);
    assert.strictEqual(addStock.json.transaction.previousQuantity, 12);
    assert.strictEqual(addStock.json.transaction.updatedQuantity, 20);
    assert.strictEqual(addStock.json.transaction.performedByName, 'Test Admin');

    const histRes = await api(`/api/v2/admin/inventory/stock/history?materialId=${camId}`);
    assert.strictEqual(histRes.status, 200);
    assert.strictEqual(histRes.json.data.length, 2);
    ok('Stock adjustments validated, negative stock prevented, and movement ledger recorded');

    // 8. Dynamic Pricing item update + PricingConfig CRUD + Quote Calculation
    const pricePatch = await api(`/api/v2/admin/inventory/products/${camId}/pricing`, {
      method: 'PATCH',
      body: { purchasePrice: 1500, sellingPrice: 2400, gstRate: 18, reason: 'Vendor revision' },
    });
    assert.strictEqual(pricePatch.status, 200);
    assert.strictEqual(pricePatch.json.data.sellingPrice, 2400);

    const createRule = await api('/api/v2/admin/inventory/pricing-rules', {
      method: 'POST',
      body: {
        name: 'Installation - Per Camera',
        code: 'CCTV-INST-CAM',
        serviceCategory: 'CCTV',
        chargeType: 'installation',
        pricingUnit: 'per_camera',
        unitLabel: 'Per Camera',
        rate: 450,
        costRate: 200,
        gstRate: 18,
      },
    });
    assert.strictEqual(createRule.status, 201);
    const ruleId = createRule.json.data._id;

    const calcQuote = await api('/api/v2/admin/inventory/calculate-quote', {
      method: 'POST',
      body: {
        serviceCategory: 'CCTV',
        items: [
          { productId: camId, quantity: 2 }, // 2 * 2400 = 4800
          { productId: cableId, quantity: 10 }, // 10 * 32 = 320, but stock is 4 -> insufficientStock!
        ],
        appliedRules: [{ ruleId, quantity: 2 }], // 2 * 450 = 900 labour
        customCharges: { miscCharge: 100 },
        discount: 0,
        allowPriceOverride: false,
      },
    });
    assert.strictEqual(calcQuote.status, 200);
    // Items 5120 + Labour 900 + Misc 100 = 6120 subtotal; 18% GST = 1101.60; Final = 7221.60
    assert.strictEqual(calcQuote.json.data.subtotal, 6120);
    assert.strictEqual(calcQuote.json.data.gstAmount, 1101.6);
    assert.strictEqual(calcQuote.json.data.finalAmount, 7221.6);
    assert.strictEqual(calcQuote.json.data.stockValidation.hasInsufficientStock, true);
    ok('Dynamic pricing rules, item price patch, GST calculation, and stock check verified');

    // 9. Dashboard KPIs & Low-stock alerts
    const dashRes = await api('/api/v2/admin/inventory/dashboard');
    assert.strictEqual(dashRes.status, 200);
    assert.strictEqual(dashRes.json.data.metrics.totalItems, 3);
    assert.strictEqual(dashRes.json.data.metrics.activeItems, 3);
    assert.strictEqual(dashRes.json.data.metrics.lowStockItems, 1);
    assert.strictEqual(dashRes.json.data.metrics.outOfStockItems, 1);
    assert.strictEqual(dashRes.json.data.metrics.totalInventoryCostValue, 20 * 1500 + 4 * 18);
    assert.ok(dashRes.json.data.recentlyAdded.length === 3);
    assert.ok(dashRes.json.data.recentlyUpdatedPricing.length === 3);
    ok('Dashboard KPIs, inventory valuation, recent additions & pricing updates verified');

    // 10. Stock validation & atomic allocation
    const allocFail = await api('/api/v2/admin/inventory/stock/allocate', {
      method: 'POST',
      body: { referenceType: 'job', referenceId: 'JOB-FAIL', items: [{ productId: boxId, quantity: 2 }] },
    });
    assert.strictEqual(allocFail.status, 400);

    const allocOk = await api('/api/v2/admin/inventory/stock/allocate', {
      method: 'POST',
      body: { referenceType: 'job', referenceId: 'JOB-101', items: [{ productId: camId, quantity: 3 }] },
    });
    assert.strictEqual(allocOk.status, 200);
    assert.strictEqual(allocOk.json.data[0].item.stock, 17);
    ok('Stock allocation validates availability and atomically logs job_allocation');

    // 11. Safe delete vs Archive
    // Quote references camId (stock 17) -> must archive on auto/delete
    stores.quotes.push({
      _id: new mongoose.Types.ObjectId(),
      requestId: 'QT-TEST-01',
      fullName: 'Test Customer',
      mobile: '9876543210',
      locality: 'Koramangala',
      address: '123 Test Main Rd, Koramangala, Bangalore',
      serviceCategory: 'CCTV',
      items: [{ productId: camId, productName: 'Cam', quantity: 2, unitPrice: 2400, lineTotal: 4800 }],
    });
    const archiveCam = await api(`/api/v2/admin/inventory/products/${camId}`, { method: 'DELETE' });
    assert.strictEqual(archiveCam.status, 200);
    assert.strictEqual(archiveCam.json.action, 'archived');
    assert.strictEqual(archiveCam.json.data.isArchived, true);

    // Zero-stock unreferenced item -> safe delete permanently removes
    const deleteBox = await api(`/api/v2/admin/inventory/products/${boxId}`, { method: 'DELETE' });
    assert.strictEqual(deleteBox.status, 200);
    assert.strictEqual(deleteBox.json.action, 'deleted');
    ok('Safe delete vs archive preserves referenced/stocked items and safely removes unreferenced 0-stock items');

    // 12. Restore item for AI & Quotation tests
    const restoreCam = await api(`/api/v2/admin/inventory/products/${camId}/status`, {
      method: 'PATCH',
      body: { restore: true },
    });
    assert.strictEqual(restoreCam.status, 200);
    assert.strictEqual(restoreCam.json.data.status, 'active');
    assert.strictEqual(restoreCam.json.data.isArchived, false);

    // 13. Controlled AI Quotation interface
    const aiSearch = await api('/api/v2/admin/inventory/ai/search?serviceCategory=CCTV&q=Camera');
    assert.strictEqual(aiSearch.status, 200);
    assert.strictEqual(aiSearch.json.data.items.length, 1);
    assert.strictEqual(aiSearch.json.data.pricingRules.length, 1);

    const aiDraft = await api('/api/v2/admin/inventory/ai/prepare-quote', {
      method: 'POST',
      body: {
        serviceCategory: 'CCTV',
        requestedItems: [
          { productId: camId, quantity: 2, unitPriceOverride: 1 }, // AI must NOT override catalog price!
          { name: 'Invented Hologram Camera', quantity: 1 }, // Must be rejected as unresolved
        ],
        appliedRules: [{ ruleId, quantity: 2 }],
      },
    });
    assert.strictEqual(aiDraft.status, 200);
    assert.strictEqual(aiDraft.json.data.verified, false);
    assert.strictEqual(aiDraft.json.data.unresolvedItems.length, 1);
    assert.strictEqual(aiDraft.json.data.quotation.items[0].unitPrice, 2400); // Catalog price enforced!
    assert.strictEqual(aiDraft.json.data.quotation.items[0].priceOverridden, false);
    ok('Controlled AI quotation interface retrieves verified inventory, blocks invented items & price overrides');

    // 14. Existing QuoteController priceQuotation compatibility
    const { priceQuotation } = require('../controllers/v2/quoteControllerV2');
    const quoteDocId = stores.quotes[0]._id;
    let quoteResPayload = null;
    await priceQuotation(
      {
        params: { id: String(quoteDocId) },
        user: { id: String(adminId), role: 'admin' },
        app: { get: () => null },
        body: {
          items: [
            { productId: camId, quantity: 2, unitPrice: 2300 },
            { productId: cableId, quantity: 10 }, // uses catalog price 32 & flags insufficient stock (avail 4)
          ],
          pricingBreakdown: { labourCharge: 500 },
          gstRate: 18,
        },
      },
      {
        status: () => ({ json: (p) => { quoteResPayload = p; } }),
        json: (p) => { quoteResPayload = p; },
      },
      (err) => { if (err) throw err; }
    );
    assert.strictEqual(quoteResPayload.success, true);
    assert.strictEqual(quoteResPayload.data.subtotal, 2 * 2300 + 10 * 32 + 500);
    assert.strictEqual(quoteResPayload.stockValidation.valid, false);
    assert.strictEqual(quoteResPayload.stockValidation.insufficientItems.length, 1);
    ok('QuoteController priceQuotation preserves compatibility, uses catalog fallback, and reports stockValidation');

    // 15. Verify cctvPricingService uses DB CctvCablePricing rate instead of old hardcoded 50
    stores.cctvCables.push({ name: 'CAT6 Cable', price: 35, status: 'active' });
    stores.cctvConfigs.push({ baseCharge: 399, tax: { percentage: 18, status: 'active' }, status: 'active' });
    stores.cctvInstalls.push({ name: 'Camera Fitting', price: 300, status: 'active' });
    const cctvPricingService = require('../services/cctvPricingService');
    const est = await cctvPricingService.calculateCctvPrice({
      cameras: [],
      installationRequired: true,
      cableLength: 10,
      cableType: 'CAT6 Cable',
    });
    assert.strictEqual(est.cable.unitPrice, 35);
    assert.strictEqual(est.priceBreakdown.cableTotal, 350);
    ok('cctvPricingService honors DB CAT6 Cable price (no hardcoded 50 override)');

    console.log(`\nALL ${passed} INVENTORY MODULE ASSERTIONS PASSED!`);
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
