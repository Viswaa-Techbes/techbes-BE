const mongoose = require('mongoose');
const Material = require('../models/Material');
const InventoryTransaction = require('../models/InventoryTransaction');
const PricingConfig = require('../models/PricingConfig');
const QuoteRequest = require('../models/QuoteRequest');
const Job = require('../models/Job');
const { recordAudit } = require('./auditService');

class InventoryError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'InventoryError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function roundMoney(num) {
  return Math.round((Number(num) || 0) * 100) / 100;
}

function parseNonNegativeNumber(value, fieldName) {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new InventoryError(`${fieldName} must be a non-negative number.`, 400);
  }
  return num;
}

function parseGstRate(value, defaultValue = 18) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 100) {
    throw new InventoryError('GST rate must be between 0 and 100.', 400);
  }
  return num;
}

function normalizeSku(sku) {
  return String(sku || '').trim().toUpperCase();
}

function normalizeAdminActor(adminUser) {
  if (!adminUser) return { id: null, name: 'System', email: '' };
  return {
    id: adminUser._id || adminUser.id || null,
    name: adminUser.name || adminUser.email || 'Admin',
    email: adminUser.email || '',
  };
}

function getStockStatus(stock, minStock) {
  const s = Number(stock) || 0;
  const min = Number(minStock) || 0;
  if (s <= 0) return 'out_of_stock';
  if (min > 0 && s <= min) return 'low_stock';
  return 'in_stock';
}

function formatInventoryItem(doc) {
  if (!doc) return null;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const sellingPrice =
    obj.basePrice !== undefined && obj.basePrice !== null
      ? Number(obj.basePrice)
      : Number(obj.price || 0);
  const purchasePrice = Number(obj.purchasePrice || 0);
  const stock = Number(obj.stock || 0);
  const minStock = Number(obj.minStock || 0);
  const marginAmount = purchasePrice > 0 ? roundMoney(sellingPrice - purchasePrice) : null;
  const marginPercent =
    purchasePrice > 0 ? roundMoney(((sellingPrice - purchasePrice) / purchasePrice) * 100) : null;

  return {
    ...obj,
    sellingPrice,
    basePrice: sellingPrice,
    price: sellingPrice,
    purchasePrice,
    stock,
    minStock,
    stockStatus: getStockStatus(stock, minStock),
    inventoryCostValue: roundMoney(stock * purchasePrice),
    inventoryRetailValue: roundMoney(stock * sellingPrice),
    marginAmount,
    marginPercent,
  };
}

function buildSearchCondition(search) {
  const trimmed = String(search || '').trim();
  if (!trimmed) return null;
  const regex = new RegExp(escapeRegex(trimmed), 'i');
  return {
    $or: [
      { name: regex },
      { sku: regex },
      { brand: regex },
      { modelNumber: regex },
      { variant: regex },
      { category: regex },
      { subcategory: regex },
      { specifications: regex },
      { description: regex },
    ],
  };
}

async function ensureUniqueSku(sku, excludeId = null) {
  const normalized = normalizeSku(sku);
  if (!normalized) return;
  const query = {
    sku: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, 'i') },
  };
  if (excludeId && mongoose.Types.ObjectId.isValid(excludeId)) {
    query._id = { $ne: excludeId };
  }
  const duplicate = await Material.findOne(query).select('_id name sku').lean();
  if (duplicate) {
    throw new InventoryError(
      `SKU "${normalized}" already exists on inventory item "${duplicate.name}".`,
      409
    );
  }
}

async function ensureUniquePricingCode(code, excludeId = null) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return;
  const query = {
    code: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, 'i') },
  };
  if (excludeId && mongoose.Types.ObjectId.isValid(excludeId)) {
    query._id = { $ne: excludeId };
  }
  const duplicate = await PricingConfig.findOne(query).select('_id name code').lean();
  if (duplicate) {
    throw new InventoryError(
      `Pricing rule code "${normalized}" already exists on "${duplicate.name}".`,
      409
    );
  }
}

function calculateTaxLine({ unitPrice, quantity, gstRate = 18, isTaxInclusive = false }) {
  const price = Number(unitPrice) || 0;
  const qty = Number(quantity) || 0;
  const rate = Number(gstRate) >= 0 ? Number(gstRate) : 18;
  const gross = price * qty;

  if (isTaxInclusive) {
    const baseSubtotal = roundMoney(gross / (1 + rate / 100));
    const gstAmount = roundMoney(gross - baseSubtotal);
    return {
      unitPrice: roundMoney(price),
      taxableSubtotal: baseSubtotal,
      gstRate: rate,
      gstAmount,
      lineTotal: roundMoney(gross),
    };
  }

  const taxableSubtotal = roundMoney(gross);
  const gstAmount = roundMoney((taxableSubtotal * rate) / 100);
  return {
    unitPrice: roundMoney(price),
    taxableSubtotal,
    gstRate: rate,
    gstAmount,
    lineTotal: roundMoney(taxableSubtotal + gstAmount),
  };
}

async function recordStockTransaction({
  material,
  previousQuantity,
  updatedQuantity,
  transactionType,
  reason,
  referenceType = 'manual',
  referenceId = '',
  referenceObjectId = null,
  adminUser = null,
  metadata = {},
}) {
  const actor = normalizeAdminActor(adminUser);
  return InventoryTransaction.create({
    materialId: material._id,
    itemName: material.name,
    sku: material.sku || '',
    serviceCategory: material.category || 'General',
    unit: material.unit || 'Piece',
    previousQuantity,
    updatedQuantity,
    quantityChange: updatedQuantity - previousQuantity,
    transactionType,
    reason: String(reason || '').trim() || 'Stock update',
    referenceType,
    referenceId: referenceId ? String(referenceId) : '',
    referenceObjectId: mongoose.Types.ObjectId.isValid(referenceObjectId)
      ? referenceObjectId
      : null,
    performedBy: mongoose.Types.ObjectId.isValid(actor.id) ? actor.id : null,
    performedByName: actor.name,
    performedByEmail: actor.email,
    metadata,
  });
}

async function listInventory({
  search = '',
  category = '',
  subcategory = '',
  itemType = '',
  status = '',
  stockHealth = '',
  includeArchived = false,
  page = 1,
  limit = 200,
  sortBy = 'createdAt',
  sortOrder = 'desc',
} = {}) {
  const andConditions = [];

  if (status === 'archived') {
    andConditions.push({ isArchived: true });
  } else if (!includeArchived) {
    andConditions.push({ isArchived: { $ne: true } });
  }

  if (status && !['all', 'archived'].includes(status)) {
    andConditions.push({ status });
  }

  if (category && category.toLowerCase() !== 'all') {
    andConditions.push({ category: { $regex: new RegExp(`^${escapeRegex(category)}$`, 'i') } });
  }

  if (subcategory && subcategory.toLowerCase() !== 'all') {
    andConditions.push({ subcategory: { $regex: new RegExp(escapeRegex(subcategory), 'i') } });
  }

  if (itemType && itemType.toLowerCase() !== 'all') {
    andConditions.push({ itemType: itemType.toLowerCase() });
  }

  if (stockHealth === 'out_of_stock') {
    andConditions.push({ stock: { $lte: 0 } });
  } else if (stockHealth === 'low_stock') {
    andConditions.push({
      stock: { $gt: 0 },
      minStock: { $gt: 0 },
      $expr: { $lte: ['$stock', '$minStock'] },
    });
  } else if (stockHealth === 'needs_reorder') {
    andConditions.push({
      $or: [
        { stock: { $lte: 0 } },
        {
          minStock: { $gt: 0 },
          $expr: { $lte: ['$stock', '$minStock'] },
        },
      ],
    });
  } else if (stockHealth === 'in_stock') {
    andConditions.push({
      stock: { $gt: 0 },
      $or: [{ minStock: { $lte: 0 } }, { $expr: { $gt: ['$stock', '$minStock'] } }],
    });
  }

  const searchCond = buildSearchCondition(search);
  if (searchCond) andConditions.push(searchCond);

  const filter = andConditions.length > 0 ? { $and: andConditions } : {};
  const parsedLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const parsedPage = Math.max(Number(page) || 1, 1);

  const allowedSorts = new Set([
    'createdAt',
    'updatedAt',
    'lastPriceUpdatedAt',
    'name',
    'stock',
    'basePrice',
    'price',
    'purchasePrice',
    'category',
  ]);
  const sortField = allowedSorts.has(sortBy) ? sortBy : 'createdAt';
  const sortDir = sortOrder === 'asc' ? 1 : -1;

  const [docs, total] = await Promise.all([
    Material.find(filter)
      .sort({ [sortField]: sortDir, _id: -1 })
      .skip((parsedPage - 1) * parsedLimit)
      .limit(parsedLimit)
      .lean(),
    Material.countDocuments(filter),
  ]);

  return {
    items: docs.map(formatInventoryItem),
    total,
    page: parsedPage,
    limit: parsedLimit,
  };
}

async function getDashboardSummary({ limit = 6 } = {}) {
  const parsedLimit = Math.min(Math.max(Number(limit) || 6, 1), 25);

  const [allDocs, archivedCount, recentTransactions, activePricingCount] = await Promise.all([
    Material.find({ isArchived: { $ne: true } }).lean(),
    Material.countDocuments({ isArchived: true }),
    InventoryTransaction.find().sort({ createdAt: -1 }).limit(10).lean(),
    PricingConfig.countDocuments({ status: 'active' }),
  ]);

  const formatted = allDocs.map(formatInventoryItem);

  let activeItems = 0;
  let inactiveItems = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let totalCostValue = 0;
  let totalSellingValue = 0;
  let totalUnitsInStock = 0;
  let itemsWithCostData = 0;
  const categoryMap = new Map();

  for (const item of formatted) {
    if (item.status === 'active') activeItems += 1;
    else inactiveItems += 1;

    if (item.stockStatus === 'out_of_stock') outOfStockCount += 1;
    else if (item.stockStatus === 'low_stock') lowStockCount += 1;

    totalUnitsInStock += item.stock;
    totalSellingValue += item.inventoryRetailValue;
    if (item.purchasePrice > 0) {
      itemsWithCostData += 1;
      totalCostValue += item.inventoryCostValue;
    }

    const catName = item.category || 'General';
    if (!categoryMap.has(catName)) {
      categoryMap.set(catName, {
        category: catName,
        totalItems: 0,
        activeItems: 0,
        totalStock: 0,
        costValue: 0,
        sellingValue: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
      });
    }
    const catStats = categoryMap.get(catName);
    catStats.totalItems += 1;
    if (item.status === 'active') catStats.activeItems += 1;
    catStats.totalStock += item.stock;
    catStats.costValue = roundMoney(catStats.costValue + item.inventoryCostValue);
    catStats.sellingValue = roundMoney(catStats.sellingValue + item.inventoryRetailValue);
    if (item.stockStatus === 'low_stock') catStats.lowStockCount += 1;
    if (item.stockStatus === 'out_of_stock') catStats.outOfStockCount += 1;
  }

  const recentlyAdded = [...formatted]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, parsedLimit);

  const recentlyUpdatedPricing = [...formatted]
    .sort((a, b) => {
      const timeA = new Date(a.lastPriceUpdatedAt || a.updatedAt || 0).getTime();
      const timeB = new Date(b.lastPriceUpdatedAt || b.updatedAt || 0).getTime();
      return timeB - timeA;
    })
    .slice(0, parsedLimit);

  const lowStockItems = formatted
    .filter((i) => i.stockStatus === 'low_stock')
    .sort((a, b) => a.stock - b.stock);

  const outOfStockItems = formatted
    .filter((i) => i.stockStatus === 'out_of_stock')
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    metrics: {
      totalItems: formatted.length,
      activeItems,
      inactiveItems,
      archivedItems: archivedCount,
      lowStockItems: lowStockCount,
      outOfStockItems: outOfStockCount,
      totalUnitsInStock,
      totalInventoryCostValue: itemsWithCostData > 0 ? roundMoney(totalCostValue) : null,
      totalInventorySellingValue: roundMoney(totalSellingValue),
      itemsWithCostData,
      activePricingRules: activePricingCount,
    },
    categoryBreakdown: Array.from(categoryMap.values()).sort(
      (a, b) => b.totalItems - a.totalItems
    ),
    recentlyAdded,
    recentlyUpdatedPricing,
    lowStockAlerts: [...outOfStockItems, ...lowStockItems].slice(0, 15),
    recentTransactions,
  };
}

async function getItemDetails(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new InventoryError('Invalid inventory item ID.', 400);
  }
  const doc = await Material.findById(id).lean();
  if (!doc) {
    throw new InventoryError('Inventory item not found.', 404);
  }

  const [transactions, quoteRefCount, jobRefCount, linkedPricingRules] = await Promise.all([
    InventoryTransaction.find({ materialId: id }).sort({ createdAt: -1 }).limit(30).lean(),
    QuoteRequest.countDocuments({ 'items.productId': id }),
    Job.countDocuments({
      $or: [{ 'products.productId': id }, { 'cctvDetails.selectedMaterials._id': id }],
    }),
    PricingConfig.find({ materialId: id }).sort({ createdAt: -1 }).lean(),
  ]);

  const safeToDelete = quoteRefCount === 0 && jobRefCount === 0 && Number(doc.stock || 0) === 0;

  return {
    item: formatInventoryItem(doc),
    transactions,
    linkedPricingRules,
    references: {
      quoteCount: quoteRefCount,
      jobCount: jobRefCount,
      transactionCount: transactions.length,
      safeToDelete,
    },
  };
}

async function createInventoryItem(payload = {}, adminUser = null, auditMeta = {}) {
  const name = String(payload.name || '').trim();
  if (!name) {
    throw new InventoryError('Item Name is required.', 400);
  }

  const sku = normalizeSku(payload.sku);
  if (sku) {
    await ensureUniqueSku(sku);
  }

  const rawSelling =
    payload.sellingPrice !== undefined
      ? payload.sellingPrice
      : payload.basePrice !== undefined
      ? payload.basePrice
      : payload.price;
  const sellingPrice = parseNonNegativeNumber(rawSelling, 'Selling Price');
  const purchasePrice = parseNonNegativeNumber(payload.purchasePrice, 'Purchase Price') ?? 0;
  const stock = parseNonNegativeNumber(payload.stock, 'Available Stock') ?? 0;
  const minStock = parseNonNegativeNumber(payload.minStock, 'Minimum Stock Level') ?? 0;
  const gstRate = parseGstRate(payload.gstRate, 18);
  const warrantyMonths = parseNonNegativeNumber(payload.warrantyMonths, 'Warranty Months') ?? 0;

  if (sellingPrice === undefined) {
    throw new InventoryError('Selling Price is required and must be a non-negative number.', 400);
  }

  const actor = normalizeAdminActor(adminUser);
  const now = new Date();

  const created = await Material.create({
    name,
    brand: String(payload.brand || '').trim(),
    category: String(payload.category || 'General').trim() || 'General',
    subcategory: String(payload.subcategory || '').trim(),
    modelNumber: String(payload.modelNumber || '').trim(),
    sku,
    variant: String(payload.variant || '').trim(),
    specifications: String(payload.specifications || '').trim(),
    unit: String(payload.unit || 'Piece').trim() || 'Piece',
    itemType: payload.itemType || 'product',
    purchasePrice,
    basePrice: sellingPrice,
    price: sellingPrice,
    gstRate,
    isTaxInclusive: Boolean(payload.isTaxInclusive),
    hsnSacCode: String(payload.hsnSacCode || '').trim(),
    stock,
    minStock,
    compatibleCategories: Array.isArray(payload.compatibleCategories)
      ? payload.compatibleCategories.map((c) => String(c).trim()).filter(Boolean)
      : [],
    compatibleSkus: Array.isArray(payload.compatibleSkus)
      ? payload.compatibleSkus.map((s) => normalizeSku(s)).filter(Boolean)
      : [],
    supplier: String(payload.supplier || '').trim(),
    warrantyMonths,
    image: String(payload.image || '').trim(),
    description: String(payload.description || '').trim(),
    status: payload.status === 'inactive' ? 'inactive' : 'active',
    variants: Array.isArray(payload.variants) ? payload.variants : [],
    lastPriceUpdatedAt: now,
    lastPriceUpdatedBy: mongoose.Types.ObjectId.isValid(actor.id) ? actor.id : null,
    lastStockUpdatedAt: stock > 0 ? now : null,
    createdBy: mongoose.Types.ObjectId.isValid(actor.id) ? actor.id : null,
    updatedBy: mongoose.Types.ObjectId.isValid(actor.id) ? actor.id : null,
  });

  if (stock > 0) {
    await recordStockTransaction({
      material: created,
      previousQuantity: 0,
      updatedQuantity: stock,
      transactionType: 'initial_stock',
      reason: payload.stockReason || 'Initial stock recorded during item creation',
      referenceType: 'manual',
      adminUser,
    });
  }

  await recordAudit({
    action: 'INVENTORY_ITEM_CREATED',
    resourceType: 'Material',
    resourceId: String(created._id),
    userId: actor.id,
    details: { name: created.name, sku: created.sku, sellingPrice, purchasePrice, stock },
    ...auditMeta,
  });

  return formatInventoryItem(created);
}

async function updateInventoryItem(id, payload = {}, adminUser = null, auditMeta = {}) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new InventoryError('Invalid inventory item ID.', 400);
  }

  const existing = await Material.findById(id);
  if (!existing) {
    throw new InventoryError('Inventory item not found.', 404);
  }

  const actor = normalizeAdminActor(adminUser);
  const now = new Date();
  const updates = {
    updatedBy: mongoose.Types.ObjectId.isValid(actor.id) ? actor.id : existing.updatedBy,
  };

  if (payload.sku !== undefined) {
    const nextSku = normalizeSku(payload.sku);
    if (nextSku && nextSku !== normalizeSku(existing.sku)) {
      await ensureUniqueSku(nextSku, id);
    }
    updates.sku = nextSku;
  }

  const stringFields = [
    'name',
    'brand',
    'category',
    'subcategory',
    'modelNumber',
    'variant',
    'specifications',
    'unit',
    'hsnSacCode',
    'supplier',
    'image',
    'description',
  ];
  for (const field of stringFields) {
    if (payload[field] !== undefined) {
      const val = String(payload[field] || '').trim();
      if (field === 'name' && !val) {
        throw new InventoryError('Item Name cannot be empty.', 400);
      }
      updates[field] = val;
    }
  }

  if (payload.itemType !== undefined) updates.itemType = payload.itemType;
  if (payload.status !== undefined) {
    updates.status = payload.status === 'inactive' ? 'inactive' : 'active';
  }
  if (Array.isArray(payload.compatibleCategories)) {
    updates.compatibleCategories = payload.compatibleCategories
      .map((c) => String(c).trim())
      .filter(Boolean);
  }
  if (Array.isArray(payload.compatibleSkus)) {
    updates.compatibleSkus = payload.compatibleSkus.map((s) => normalizeSku(s)).filter(Boolean);
  }
  if (Array.isArray(payload.variants)) updates.variants = payload.variants;
  if (payload.warrantyMonths !== undefined) {
    updates.warrantyMonths = parseNonNegativeNumber(payload.warrantyMonths, 'Warranty Months') ?? 0;
  }

  let priceChanged = false;
  const rawSelling =
    payload.sellingPrice !== undefined
      ? payload.sellingPrice
      : payload.basePrice !== undefined
      ? payload.basePrice
      : payload.price;
  if (rawSelling !== undefined) {
    const nextSelling = parseNonNegativeNumber(rawSelling, 'Selling Price');
    if (nextSelling !== Number(existing.basePrice ?? existing.price ?? 0)) {
      priceChanged = true;
    }
    updates.basePrice = nextSelling;
    updates.price = nextSelling;
  }

  if (payload.purchasePrice !== undefined) {
    const nextPurchase = parseNonNegativeNumber(payload.purchasePrice, 'Purchase Price');
    if (nextPurchase !== Number(existing.purchasePrice || 0)) {
      priceChanged = true;
    }
    updates.purchasePrice = nextPurchase;
  }

  if (payload.gstRate !== undefined) {
    const nextGst = parseGstRate(payload.gstRate, existing.gstRate);
    if (nextGst !== Number(existing.gstRate || 0)) priceChanged = true;
    updates.gstRate = nextGst;
  }

  if (payload.isTaxInclusive !== undefined) {
    const nextTaxInc = Boolean(payload.isTaxInclusive);
    if (nextTaxInc !== Boolean(existing.isTaxInclusive)) priceChanged = true;
    updates.isTaxInclusive = nextTaxInc;
  }

  if (priceChanged) {
    updates.lastPriceUpdatedAt = now;
    updates.lastPriceUpdatedBy = mongoose.Types.ObjectId.isValid(actor.id) ? actor.id : null;
  }

  if (payload.minStock !== undefined) {
    updates.minStock = parseNonNegativeNumber(payload.minStock, 'Minimum Stock Level') ?? 0;
  }

  let stockDeltaInfo = null;
  if (payload.stock !== undefined) {
    const nextStock = parseNonNegativeNumber(payload.stock, 'Available Stock');
    const prevStock = Number(existing.stock || 0);
    if (nextStock !== prevStock) {
      stockDeltaInfo = { prevStock, nextStock };
      updates.stock = nextStock;
      updates.lastStockUpdatedAt = now;
    }
  }

  const updated = await Material.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (stockDeltaInfo) {
    await recordStockTransaction({
      material: updated,
      previousQuantity: stockDeltaInfo.prevStock,
      updatedQuantity: stockDeltaInfo.nextStock,
      transactionType:
        payload.stockAdjustmentType ||
        (stockDeltaInfo.nextStock > stockDeltaInfo.prevStock ? 'addition' : 'adjustment'),
      reason: payload.stockReason || 'Updated stock level via item edit',
      referenceType: 'manual',
      adminUser,
    });
  }

  await recordAudit({
    action: priceChanged ? 'INVENTORY_ITEM_PRICE_UPDATED' : 'INVENTORY_ITEM_UPDATED',
    resourceType: 'Material',
    resourceId: String(updated._id),
    userId: actor.id,
    details: {
      name: updated.name,
      sku: updated.sku,
      priceChanged,
      stockChanged: Boolean(stockDeltaInfo),
    },
    ...auditMeta,
  });

  return formatInventoryItem(updated);
}

async function updateItemPricing(id, payload = {}, adminUser = null, auditMeta = {}) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new InventoryError('Invalid inventory item ID.', 400);
  }
  const existing = await Material.findById(id);
  if (!existing) {
    throw new InventoryError('Inventory item not found.', 404);
  }

  const actor = normalizeAdminActor(adminUser);
  const updates = {
    lastPriceUpdatedAt: new Date(),
    lastPriceUpdatedBy: mongoose.Types.ObjectId.isValid(actor.id) ? actor.id : null,
    updatedBy: mongoose.Types.ObjectId.isValid(actor.id) ? actor.id : existing.updatedBy,
  };

  const rawSelling =
    payload.sellingPrice !== undefined
      ? payload.sellingPrice
      : payload.basePrice !== undefined
      ? payload.basePrice
      : payload.price;

  if (rawSelling !== undefined) {
    const selling = parseNonNegativeNumber(rawSelling, 'Selling Price');
    updates.basePrice = selling;
    updates.price = selling;
  }
  if (payload.purchasePrice !== undefined) {
    updates.purchasePrice = parseNonNegativeNumber(payload.purchasePrice, 'Purchase Price');
  }
  if (payload.gstRate !== undefined) {
    updates.gstRate = parseGstRate(payload.gstRate, existing.gstRate);
  }
  if (payload.isTaxInclusive !== undefined) {
    updates.isTaxInclusive = Boolean(payload.isTaxInclusive);
  }
  if (payload.hsnSacCode !== undefined) {
    updates.hsnSacCode = String(payload.hsnSacCode || '').trim();
  }

  const updated = await Material.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true }
  );

  await recordAudit({
    action: 'INVENTORY_PRICING_UPDATED',
    resourceType: 'Material',
    resourceId: String(updated._id),
    userId: actor.id,
    details: {
      name: updated.name,
      sku: updated.sku,
      previousSellingPrice: existing.basePrice ?? existing.price,
      newSellingPrice: updated.basePrice ?? updated.price,
      previousPurchasePrice: existing.purchasePrice,
      newPurchasePrice: updated.purchasePrice,
      reason: payload.reason || 'Dynamic pricing update',
    },
    ...auditMeta,
  });

  return formatInventoryItem(updated);
}

async function toggleItemStatus(id, { status, restore = false } = {}, adminUser = null, auditMeta = {}) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new InventoryError('Invalid inventory item ID.', 400);
  }
  const existing = await Material.findById(id);
  if (!existing) {
    throw new InventoryError('Inventory item not found.', 404);
  }

  const actor = normalizeAdminActor(adminUser);
  const nextStatus =
    status && ['active', 'inactive'].includes(status)
      ? status
      : existing.status === 'active'
      ? 'inactive'
      : 'active';

  const setFields = {
    status: nextStatus,
    updatedBy: mongoose.Types.ObjectId.isValid(actor.id) ? actor.id : existing.updatedBy,
  };
  if (restore || nextStatus === 'active') {
    setFields.isArchived = false;
    setFields.archivedAt = null;
    setFields.archivedBy = null;
  }

  const updated = await Material.findByIdAndUpdate(id, { $set: setFields }, { new: true });

  await recordAudit({
    action: 'INVENTORY_STATUS_TOGGLED',
    resourceType: 'Material',
    resourceId: String(updated._id),
    userId: actor.id,
    details: { name: updated.name, status: updated.status, isArchived: updated.isArchived },
    ...auditMeta,
  });

  return formatInventoryItem(updated);
}

async function safeDeleteOrArchiveItem(id, { mode = 'auto', reason = '' } = {}, adminUser = null, auditMeta = {}) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new InventoryError('Invalid inventory item ID.', 400);
  }
  const existing = await Material.findById(id).lean();
  if (!existing) {
    throw new InventoryError('Inventory item not found.', 404);
  }

  const [quoteRefs, jobRefs] = await Promise.all([
    QuoteRequest.countDocuments({ 'items.productId': id }),
    Job.countDocuments({
      $or: [{ 'products.productId': id }, { 'cctvDetails.selectedMaterials._id': id }],
    }),
  ]);

  const actor = normalizeAdminActor(adminUser);
  const hasReferences = quoteRefs > 0 || jobRefs > 0;
  const hasRemainingStock = Number(existing.stock || 0) > 0;

  if (mode === 'delete' && hasReferences) {
    throw new InventoryError(
      `Cannot permanently delete "${existing.name}" because it is referenced by ${quoteRefs} quotation(s) and ${jobRefs} job(s). Archive/deactivate instead.`,
      409
    );
  }

  if (mode === 'delete' && hasRemainingStock) {
    throw new InventoryError(
      `Cannot permanently delete "${existing.name}" while available stock is ${existing.stock}. Reduce stock to 0 or archive instead.`,
      409
    );
  }

  const shouldArchive = mode === 'archive' || hasReferences || hasRemainingStock;

  if (shouldArchive) {
    const archived = await Material.findByIdAndUpdate(
      id,
      {
        $set: {
          status: 'inactive',
          isArchived: true,
          archivedAt: new Date(),
          archivedBy: mongoose.Types.ObjectId.isValid(actor.id) ? actor.id : null,
          updatedBy: mongoose.Types.ObjectId.isValid(actor.id) ? actor.id : null,
        },
      },
      { new: true }
    );

    const archiveReason = hasReferences
      ? `Archived safely instead of deleting (referenced by ${quoteRefs} quote(s), ${jobRefs} job(s))`
      : hasRemainingStock
      ? `Archived safely instead of deleting (remaining stock: ${existing.stock})`
      : reason || 'Archived by admin';

    await recordAudit({
      action: 'INVENTORY_ITEM_ARCHIVED',
      resourceType: 'Material',
      resourceId: String(id),
      userId: actor.id,
      details: { name: existing.name, sku: existing.sku, reason: archiveReason },
      ...auditMeta,
    });

    return {
      action: 'archived',
      reason: archiveReason,
      data: formatInventoryItem(archived),
    };
  }

  await Material.findByIdAndDelete(id);
  await recordAudit({
    action: 'INVENTORY_ITEM_DELETED',
    resourceType: 'Material',
    resourceId: String(id),
    userId: actor.id,
    details: { name: existing.name, sku: existing.sku, reason: reason || 'Safe permanent delete' },
    ...auditMeta,
  });

  return {
    action: 'deleted',
    reason: 'Item had zero references and zero remaining stock; deleted permanently.',
    data: { _id: id, name: existing.name, sku: existing.sku },
  };
}

async function adjustStock(
  id,
  {
    transactionType = 'adjustment',
    quantity,
    newQuantity,
    reason,
    referenceType = 'manual',
    referenceId = '',
    referenceObjectId = null,
    allowNegative = false,
    metadata = {},
  } = {},
  adminUser = null,
  auditMeta = {}
) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new InventoryError('Invalid inventory item ID.', 400);
  }
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) {
    throw new InventoryError('A reason is required for every stock modification.', 400);
  }

  const existing = await Material.findById(id);
  if (!existing) {
    throw new InventoryError('Inventory item not found.', 404);
  }

  const prevQty = Number(existing.stock || 0);
  let targetQty;

  const isAdditive = ['addition', 'initial_stock', 'allocation_release', 'return'].includes(
    transactionType
  );
  const isDeductive = ['reduction', 'quote_allocation', 'job_allocation'].includes(
    transactionType
  );

  if (newQuantity !== undefined && newQuantity !== null && !isAdditive && !isDeductive) {
    const parsedTarget = Number(newQuantity);
    if (!Number.isFinite(parsedTarget) || (!allowNegative && parsedTarget < 0)) {
      throw new InventoryError('Updated stock quantity cannot be negative.', 400);
    }
    targetQty = parsedTarget;
  } else {
    const qtyNum = Number(quantity);
    if (!Number.isFinite(qtyNum) || (isAdditive && qtyNum <= 0) || (isDeductive && qtyNum <= 0)) {
      throw new InventoryError('Stock adjustment quantity must be a positive number.', 400);
    }
    if (isAdditive) {
      targetQty = prevQty + qtyNum;
    } else if (isDeductive) {
      targetQty = prevQty - qtyNum;
    } else if (newQuantity !== undefined && newQuantity !== null) {
      targetQty = Number(newQuantity);
    } else {
      targetQty = prevQty + qtyNum;
    }
  }

  if (!allowNegative && targetQty < 0) {
    throw new InventoryError(
      `Insufficient stock for "${existing.name}": available ${prevQty}, requested change would yield ${targetQty}.`,
      400
    );
  }

  if (targetQty === prevQty) {
    throw new InventoryError('New stock quantity is identical to the current quantity.', 400);
  }

  const actor = normalizeAdminActor(adminUser);
  const delta = targetQty - prevQty;

  const filter = { _id: id };
  if (!allowNegative && delta < 0) {
    filter.stock = { $gte: Math.abs(delta) };
  }

  const updated = await Material.findOneAndUpdate(
    filter,
    {
      $set: {
        stock: targetQty,
        lastStockUpdatedAt: new Date(),
        updatedBy: mongoose.Types.ObjectId.isValid(actor.id) ? actor.id : existing.updatedBy,
      },
    },
    { new: true, runValidators: true }
  );

  if (!updated) {
    throw new InventoryError(
      `Insufficient stock for "${existing.name}" due to concurrent update.`,
      409
    );
  }

  const transaction = await recordStockTransaction({
    material: updated,
    previousQuantity: prevQty,
    updatedQuantity: targetQty,
    transactionType,
    reason: cleanReason,
    referenceType,
    referenceId,
    referenceObjectId,
    adminUser,
    metadata,
  });

  await recordAudit({
    action: 'INVENTORY_STOCK_MODIFIED',
    resourceType: 'Material',
    resourceId: String(updated._id),
    userId: actor.id,
    details: {
      name: updated.name,
      sku: updated.sku,
      transactionType,
      previousQuantity: prevQty,
      updatedQuantity: targetQty,
      quantityChange: delta,
      reason: cleanReason,
    },
    ...auditMeta,
  });

  return {
    item: formatInventoryItem(updated),
    transaction,
  };
}

async function getStockHistory({
  materialId = '',
  transactionType = '',
  search = '',
  startDate = '',
  endDate = '',
  page = 1,
  limit = 50,
} = {}) {
  const filter = {};
  if (materialId && mongoose.Types.ObjectId.isValid(materialId)) {
    filter.materialId = materialId;
  }
  if (transactionType && transactionType !== 'all') {
    filter.transactionType = transactionType;
  }
  if (search) {
    const regex = new RegExp(escapeRegex(search.trim()), 'i');
    filter.$or = [
      { itemName: regex },
      { sku: regex },
      { reason: regex },
      { performedByName: regex },
      { referenceId: regex },
    ];
  }
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const parsedPage = Math.max(Number(page) || 1, 1);

  const [transactions, total] = await Promise.all([
    InventoryTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((parsedPage - 1) * parsedLimit)
      .limit(parsedLimit)
      .lean(),
    InventoryTransaction.countDocuments(filter),
  ]);

  return { transactions, total, page: parsedPage, limit: parsedLimit };
}

async function getLowStockAlerts({ includeOutOfStock = true } = {}) {
  const docs = await Material.find({
    isArchived: { $ne: true },
    status: 'active',
    $or: [
      ...(includeOutOfStock ? [{ stock: { $lte: 0 } }] : []),
      {
        minStock: { $gt: 0 },
        $expr: { $lte: ['$stock', '$minStock'] },
      },
    ],
  })
    .sort({ stock: 1, name: 1 })
    .lean();

  return docs.map(formatInventoryItem);
}

async function validateStockAvailability(requestedItems = []) {
  if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
    return { valid: true, insufficientItems: [], inactiveItems: [], notFoundItems: [], resolvedItems: [] };
  }

  const insufficientItems = [];
  const inactiveItems = [];
  const notFoundItems = [];
  const resolvedItems = [];

  for (const entry of requestedItems) {
    const qty = Number(entry.quantity || 1);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new InventoryError('Requested item quantity must be positive.', 400);
    }

    let mat = null;
    const lookupId = entry.productId || entry.materialId || entry._id;
    if (lookupId && mongoose.Types.ObjectId.isValid(lookupId)) {
      mat = await Material.findById(lookupId).lean();
    } else if (entry.sku) {
      mat = await Material.findOne({
        sku: { $regex: new RegExp(`^${escapeRegex(normalizeSku(entry.sku))}$`, 'i') },
      }).lean();
    }

    if (!mat) {
      notFoundItems.push({
        requestedName: entry.productName || entry.name || entry.sku || String(lookupId || 'Unknown'),
        sku: entry.sku || '',
        requestedQuantity: qty,
      });
      continue;
    }

    const formatted = formatInventoryItem(mat);
    const isInactive = formatted.isArchived || formatted.status !== 'active';
    const isServiceOrLabour = ['service', 'labour'].includes(formatted.itemType);
    const hasInsufficientStock = !isServiceOrLabour && formatted.stock < qty;

    if (isInactive) {
      inactiveItems.push({
        productId: formatted._id,
        name: formatted.name,
        sku: formatted.sku,
        status: formatted.status,
        isArchived: formatted.isArchived,
      });
    }

    if (hasInsufficientStock) {
      insufficientItems.push({
        productId: formatted._id,
        name: formatted.name,
        sku: formatted.sku,
        unit: formatted.unit,
        requestedQuantity: qty,
        availableStock: formatted.stock,
        shortfall: qty - formatted.stock,
      });
    }

    resolvedItems.push({
      item: formatted,
      requestedQuantity: qty,
      sufficient: !hasInsufficientStock && !isInactive,
    });
  }

  return {
    valid: insufficientItems.length === 0 && inactiveItems.length === 0 && notFoundItems.length === 0,
    insufficientItems,
    inactiveItems,
    notFoundItems,
    resolvedItems,
  };
}

async function allocateStockForReference({
  referenceType = 'job',
  referenceId = '',
  referenceObjectId = null,
  items = [],
  reason = '',
  adminUser = null,
} = {}) {
  const validation = await validateStockAvailability(items);
  if (!validation.valid) {
    throw new InventoryError('Stock validation failed before allocation.', 400, validation);
  }

  const transactionType = referenceType === 'quotation' ? 'quote_allocation' : 'job_allocation';
  const allocated = [];

  try {
    for (const entry of validation.resolvedItems) {
      if (['service', 'labour'].includes(entry.item.itemType)) continue;
      const result = await adjustStock(
        entry.item._id,
        {
          transactionType,
          quantity: entry.requestedQuantity,
          reason:
            reason ||
            `Allocated ${entry.requestedQuantity} ${entry.item.unit} for ${referenceType} ${referenceId || ''}`.trim(),
          referenceType,
          referenceId,
          referenceObjectId,
        },
        adminUser
      );
      allocated.push(result);
    }
  } catch (err) {
    // Compensate already allocated items on partial failure
    for (const prev of allocated) {
      try {
        await adjustStock(
          prev.item._id,
          {
            transactionType: 'allocation_release',
            quantity: Math.abs(prev.transaction.quantityChange),
            reason: `Rollback allocation due to failed batch (${referenceType} ${referenceId || ''})`.trim(),
            referenceType,
            referenceId,
            referenceObjectId,
          },
          adminUser
        );
      } catch (_) {
        // Best-effort rollback
      }
    }
    throw err;
  }

  return allocated;
}

// ─── DYNAMIC PRICING MANAGEMENT ────────────────────────────────────────────────

async function listPricingConfigs({ serviceCategory = '', chargeType = '', status = 'all' } = {}) {
  const filter = {};
  if (serviceCategory && serviceCategory.toLowerCase() !== 'all') {
    filter.serviceCategory = { $regex: new RegExp(`^${escapeRegex(serviceCategory)}$`, 'i') };
  }
  if (chargeType && chargeType !== 'all') {
    filter.chargeType = chargeType;
  }
  if (status && status !== 'all') {
    filter.status = status;
  }
  return PricingConfig.find(filter).sort({ serviceCategory: 1, sortOrder: 1, name: 1 }).lean();
}

async function createPricingConfig(payload = {}, adminUser = null, auditMeta = {}) {
  const name = String(payload.name || '').trim();
  const serviceCategory = String(payload.serviceCategory || '').trim();
  if (!name || !serviceCategory) {
    throw new InventoryError('Pricing rule name and serviceCategory are required.', 400);
  }
  const rate = parseNonNegativeNumber(payload.rate, 'Rate');
  if (rate === undefined) {
    throw new InventoryError('Rate is required and must be non-negative.', 400);
  }

  const code = payload.code ? String(payload.code).trim().toUpperCase() : undefined;
  if (code) await ensureUniquePricingCode(code);

  const actor = normalizeAdminActor(adminUser);
  const created = await PricingConfig.create({
    name,
    code,
    serviceCategory,
    subcategory: String(payload.subcategory || '').trim(),
    chargeType: payload.chargeType || 'service',
    pricingUnit: payload.pricingUnit || 'flat',
    unitLabel: String(payload.unitLabel || 'Unit').trim(),
    rate,
    costRate: parseNonNegativeNumber(payload.costRate, 'Cost Rate') ?? 0,
    minCharge: parseNonNegativeNumber(payload.minCharge, 'Minimum Charge') ?? 0,
    gstRate: parseGstRate(payload.gstRate, 18),
    isTaxInclusive: Boolean(payload.isTaxInclusive),
    hsnSacCode: String(payload.hsnSacCode || '').trim(),
    allowQuoteOverride: payload.allowQuoteOverride !== undefined ? Boolean(payload.allowQuoteOverride) : true,
    maxDiscountPercent: parseGstRate(payload.maxDiscountPercent, 25),
    materialId: mongoose.Types.ObjectId.isValid(payload.materialId) ? payload.materialId : null,
    description: String(payload.description || '').trim(),
    status: payload.status === 'inactive' ? 'inactive' : 'active',
    sortOrder: Number(payload.sortOrder || 0),
    updatedBy: mongoose.Types.ObjectId.isValid(actor.id) ? actor.id : null,
    updatedByName: actor.name,
    lastPriceUpdatedAt: new Date(),
  });

  await recordAudit({
    action: 'PRICING_CONFIG_CREATED',
    resourceType: 'PricingConfig',
    resourceId: String(created._id),
    userId: actor.id,
    details: { name: created.name, serviceCategory, chargeType: created.chargeType, rate },
    ...auditMeta,
  });

  return created.toObject();
}

async function updatePricingConfig(id, payload = {}, adminUser = null, auditMeta = {}) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new InventoryError('Invalid pricing configuration ID.', 400);
  }
  const existing = await PricingConfig.findById(id);
  if (!existing) {
    throw new InventoryError('Pricing configuration not found.', 404);
  }

  if (payload.code !== undefined && payload.code !== existing.code) {
    await ensureUniquePricingCode(payload.code, id);
  }

  const actor = normalizeAdminActor(adminUser);
  const updates = {
    updatedBy: mongoose.Types.ObjectId.isValid(actor.id) ? actor.id : existing.updatedBy,
    updatedByName: actor.name,
    lastPriceUpdatedAt: new Date(),
  };

  for (const field of ['name', 'code', 'serviceCategory', 'subcategory', 'unitLabel', 'hsnSacCode', 'description']) {
    if (payload[field] !== undefined) {
      updates[field] = String(payload[field] || '').trim();
      if (field === 'code' && updates[field]) updates[field] = updates[field].toUpperCase();
    }
  }
  if (payload.chargeType !== undefined) updates.chargeType = payload.chargeType;
  if (payload.pricingUnit !== undefined) updates.pricingUnit = payload.pricingUnit;
  if (payload.rate !== undefined) updates.rate = parseNonNegativeNumber(payload.rate, 'Rate');
  if (payload.costRate !== undefined) updates.costRate = parseNonNegativeNumber(payload.costRate, 'Cost Rate');
  if (payload.minCharge !== undefined) updates.minCharge = parseNonNegativeNumber(payload.minCharge, 'Minimum Charge');
  if (payload.gstRate !== undefined) updates.gstRate = parseGstRate(payload.gstRate, existing.gstRate);
  if (payload.isTaxInclusive !== undefined) updates.isTaxInclusive = Boolean(payload.isTaxInclusive);
  if (payload.allowQuoteOverride !== undefined) updates.allowQuoteOverride = Boolean(payload.allowQuoteOverride);
  if (payload.maxDiscountPercent !== undefined) {
    updates.maxDiscountPercent = parseGstRate(payload.maxDiscountPercent, existing.maxDiscountPercent);
  }
  if (payload.status !== undefined) updates.status = payload.status === 'inactive' ? 'inactive' : 'active';
  if (payload.sortOrder !== undefined) updates.sortOrder = Number(payload.sortOrder || 0);

  const updated = await PricingConfig.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true }
  ).lean();

  await recordAudit({
    action: 'PRICING_CONFIG_UPDATED',
    resourceType: 'PricingConfig',
    resourceId: String(id),
    userId: actor.id,
    details: { name: updated.name, previousRate: existing.rate, newRate: updated.rate },
    ...auditMeta,
  });

  return updated;
}

async function deletePricingConfig(id, adminUser = null, auditMeta = {}) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new InventoryError('Invalid pricing configuration ID.', 400);
  }
  const deleted = await PricingConfig.findByIdAndDelete(id).lean();
  if (!deleted) {
    throw new InventoryError('Pricing configuration not found.', 404);
  }
  const actor = normalizeAdminActor(adminUser);
  await recordAudit({
    action: 'PRICING_CONFIG_DELETED',
    resourceType: 'PricingConfig',
    resourceId: String(id),
    userId: actor.id,
    details: { name: deleted.name, serviceCategory: deleted.serviceCategory },
    ...auditMeta,
  });
  return deleted;
}

/**
 * Authoritative backend quotation calculator backed exclusively by Material & PricingConfig DB records.
 */
async function calculateDynamicQuotePricing({
  serviceCategory = 'General',
  items = [],
  appliedRules = [],
  customCharges = {},
  discount = 0,
  defaultGstRate = 18,
  allowPriceOverride = false,
} = {}) {
  const normalizedDiscount = parseNonNegativeNumber(discount, 'Discount') ?? 0;
  const globalGstRate = parseGstRate(defaultGstRate, 18);

  const resolvedLineItems = [];
  let itemsSubtotal = 0;
  let itemsGst = 0;
  let totalCost = 0;

  for (const reqItem of items) {
    const qty = Number(reqItem.quantity || 1);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new InventoryError('Item quantity must be a positive number.', 400);
    }

    let dbMat = null;
    const matId = reqItem.productId || reqItem.materialId || reqItem._id;
    if (matId && mongoose.Types.ObjectId.isValid(matId)) {
      dbMat = await Material.findById(matId).lean();
    } else if (reqItem.sku) {
      dbMat = await Material.findOne({
        sku: { $regex: new RegExp(`^${escapeRegex(normalizeSku(reqItem.sku))}$`, 'i') },
      }).lean();
    }

    if (!dbMat) {
      throw new InventoryError(
        `Inventory item "${reqItem.productName || reqItem.sku || matId}" does not exist in inventory.`,
        400
      );
    }

    const formatted = formatInventoryItem(dbMat);
    const hasOverride =
      allowPriceOverride &&
      reqItem.unitPriceOverride !== undefined &&
      reqItem.unitPriceOverride !== null &&
      reqItem.unitPriceOverride !== '';

    const unitPrice = hasOverride
      ? parseNonNegativeNumber(reqItem.unitPriceOverride, 'Override Unit Price')
      : formatted.sellingPrice;

    const lineCalc = calculateTaxLine({
      unitPrice,
      quantity: qty,
      gstRate: formatted.gstRate,
      isTaxInclusive: formatted.isTaxInclusive,
    });

    itemsSubtotal = roundMoney(itemsSubtotal + lineCalc.taxableSubtotal);
    itemsGst = roundMoney(itemsGst + lineCalc.gstAmount);
    totalCost = roundMoney(totalCost + formatted.purchasePrice * qty);

    const isServiceType = ['service', 'labour'].includes(formatted.itemType);
    const insufficientStock = !isServiceType && formatted.stock < qty;

    resolvedLineItems.push({
      productId: formatted._id,
      productName: formatted.name,
      brand: formatted.brand,
      sku: formatted.sku,
      variant: reqItem.variant || formatted.variant,
      unit: formatted.unit,
      itemType: formatted.itemType,
      quantity: qty,
      catalogUnitPrice: formatted.sellingPrice,
      unitPrice: lineCalc.unitPrice,
      priceOverridden: hasOverride,
      gstRate: lineCalc.gstRate,
      gstAmount: lineCalc.gstAmount,
      lineSubtotal: lineCalc.taxableSubtotal,
      lineTotal: lineCalc.lineTotal,
      availableStock: formatted.stock,
      insufficientStock,
    });
  }

  // Resolve dynamic PricingConfig rules if selected
  const resolvedRules = [];
  const chargeTotals = {
    labourCharge: parseNonNegativeNumber(customCharges.labourCharge, 'Labour Charge') ?? 0,
    serviceCharge: parseNonNegativeNumber(customCharges.serviceCharge, 'Service Charge') ?? 0,
    accessoriesCharge: parseNonNegativeNumber(customCharges.accessoriesCharge, 'Accessories Charge') ?? 0,
    miscCharge: parseNonNegativeNumber(customCharges.miscCharge, 'Miscellaneous Charge') ?? 0,
  };

  for (const ruleEntry of appliedRules) {
    const ruleId = ruleEntry.ruleId || ruleEntry._id;
    if (!ruleId || !mongoose.Types.ObjectId.isValid(ruleId)) continue;
    const rule = await PricingConfig.findOne({ _id: ruleId, status: 'active' }).lean();
    if (!rule) {
      throw new InventoryError(`Active pricing rule ${ruleId} was not found.`, 404);
    }

    const qty = Number(ruleEntry.quantity || 1);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new InventoryError('Pricing rule quantity must be positive.', 400);
    }

    const canOverride = allowPriceOverride && rule.allowQuoteOverride !== false;
    const appliedRate =
      canOverride && ruleEntry.rateOverride !== undefined && ruleEntry.rateOverride !== ''
        ? parseNonNegativeNumber(ruleEntry.rateOverride, 'Pricing Rule Rate Override')
        : rule.rate;

    const rawAmount = Math.max(roundMoney(appliedRate * qty), Number(rule.minCharge || 0));
    const bucket = ['labour', 'installation'].includes(rule.chargeType)
      ? 'labourCharge'
      : rule.chargeType === 'accessory'
      ? 'accessoriesCharge'
      : rule.chargeType === 'miscellaneous'
      ? 'miscCharge'
      : 'serviceCharge';

    chargeTotals[bucket] = roundMoney(chargeTotals[bucket] + rawAmount);
    totalCost = roundMoney(totalCost + Number(rule.costRate || 0) * qty);

    resolvedRules.push({
      ruleId: rule._id,
      name: rule.name,
      code: rule.code,
      chargeType: rule.chargeType,
      unitLabel: rule.unitLabel,
      quantity: qty,
      rate: appliedRate,
      amount: rawAmount,
    });
  }

  const extraChargesSubtotal = roundMoney(
    chargeTotals.labourCharge +
      chargeTotals.serviceCharge +
      chargeTotals.accessoriesCharge +
      chargeTotals.miscCharge
  );
  const extraChargesGst = roundMoney((extraChargesSubtotal * globalGstRate) / 100);

  const subtotalBeforeDiscount = roundMoney(itemsSubtotal + extraChargesSubtotal);
  const effectiveDiscount = Math.min(normalizedDiscount, subtotalBeforeDiscount);
  const taxableSubtotal = roundMoney(subtotalBeforeDiscount - effectiveDiscount);

  // Proportional GST adjustment if discount applied
  const rawTotalGst = roundMoney(itemsGst + extraChargesGst);
  const gstRatio = subtotalBeforeDiscount > 0 ? taxableSubtotal / subtotalBeforeDiscount : 1;
  const gstAmount = roundMoney(rawTotalGst * gstRatio);
  const finalAmount = roundMoney(taxableSubtotal + gstAmount);

  return {
    serviceCategory,
    items: resolvedLineItems,
    appliedPricingRules: resolvedRules,
    pricingBreakdown: {
      itemsSubtotal,
      ...chargeTotals,
      extraChargesSubtotal,
      discount: effectiveDiscount,
    },
    subtotal: taxableSubtotal,
    gstRate: globalGstRate,
    gstAmount,
    finalAmount,
    adminCostAnalysis: {
      totalCost,
      estimatedGrossMargin: roundMoney(taxableSubtotal - totalCost),
    },
    stockValidation: {
      hasInsufficientStock: resolvedLineItems.some((i) => i.insufficientStock),
      insufficientItems: resolvedLineItems.filter((i) => i.insufficientStock),
    },
  };
}

// ─── AI QUOTATION CONTROLLED SERVICE INTERFACE ─────────────────────────────────

async function searchForAiQuotation({
  query = '',
  serviceCategory = '',
  itemType = '',
  onlyInStock = false,
  limit = 15,
} = {}) {
  const andConditions = [{ status: 'active' }, { isArchived: { $ne: true } }];

  if (serviceCategory && serviceCategory.toLowerCase() !== 'all') {
    const catRegex = new RegExp(`^${escapeRegex(serviceCategory)}$`, 'i');
    andConditions.push({
      $or: [{ category: catRegex }, { compatibleCategories: catRegex }],
    });
  }
  if (itemType && itemType.toLowerCase() !== 'all') {
    andConditions.push({ itemType: itemType.toLowerCase() });
  }
  if (onlyInStock) {
    andConditions.push({
      $or: [{ stock: { $gt: 0 } }, { itemType: { $in: ['service', 'labour'] } }],
    });
  }
  const searchCond = buildSearchCondition(query);
  if (searchCond) andConditions.push(searchCond);

  const parsedLimit = Math.min(Math.max(Number(limit) || 15, 1), 50);

  const [materials, pricingRules] = await Promise.all([
    Material.find({ $and: andConditions })
      .sort({ stock: -1, sortOrder: 1, name: 1 })
      .limit(parsedLimit)
      .lean(),
    PricingConfig.find({
      status: 'active',
      ...(serviceCategory && serviceCategory.toLowerCase() !== 'all'
        ? {
            $or: [
              { serviceCategory: { $regex: new RegExp(`^${escapeRegex(serviceCategory)}$`, 'i') } },
              { serviceCategory: { $regex: /^global$/i } },
            ],
          }
        : {}),
    })
      .sort({ sortOrder: 1, name: 1 })
      .lean(),
  ]);

  return {
    items: materials.map((m) => {
      const f = formatInventoryItem(m);
      return {
        id: f._id,
        name: f.name,
        sku: f.sku,
        brand: f.brand,
        modelNumber: f.modelNumber,
        category: f.category,
        subcategory: f.subcategory,
        itemType: f.itemType,
        specifications: f.specifications,
        unit: f.unit,
        sellingPrice: f.sellingPrice,
        gstRate: f.gstRate,
        isTaxInclusive: f.isTaxInclusive,
        availableStock: f.stock,
        minStock: f.minStock,
        stockStatus: f.stockStatus,
        inStock: ['service', 'labour'].includes(f.itemType) || f.stock > 0,
        compatibleCategories: f.compatibleCategories,
        compatibleSkus: f.compatibleSkus,
      };
    }),
    pricingRules: pricingRules.map((r) => ({
      id: r._id,
      code: r.code,
      name: r.name,
      serviceCategory: r.serviceCategory,
      chargeType: r.chargeType,
      pricingUnit: r.pricingUnit,
      unitLabel: r.unitLabel,
      rate: r.rate,
      gstRate: r.gstRate,
    })),
  };
}

async function getCompatibleMaterials(itemId) {
  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    throw new InventoryError('Invalid inventory item ID.', 400);
  }
  const source = await Material.findById(itemId).lean();
  if (!source) {
    throw new InventoryError('Inventory item not found.', 404);
  }

  const orConditions = [];
  if (Array.isArray(source.compatibleSkus) && source.compatibleSkus.length > 0) {
    orConditions.push({ sku: { $in: source.compatibleSkus.map(normalizeSku) } });
  }
  if (Array.isArray(source.compatibleCategories) && source.compatibleCategories.length > 0) {
    orConditions.push({ category: { $in: source.compatibleCategories } });
  }
  if (source.category) {
    orConditions.push({ category: source.category });
  }

  const candidates = await Material.find({
    _id: { $ne: source._id },
    status: 'active',
    isArchived: { $ne: true },
    ...(orConditions.length > 0 ? { $or: orConditions } : {}),
  })
    .sort({ stock: -1, sortOrder: 1 })
    .limit(15)
    .lean();

  return {
    source: formatInventoryItem(source),
    compatibleItems: candidates.map(formatInventoryItem),
  };
}

async function prepareAiQuotationDraft({
  serviceCategory = 'General',
  requestedItems = [],
  appliedRules = [],
  customCharges = {},
  discount = 0,
} = {}) {
  const validRequests = [];
  const unresolvedItems = [];

  for (const reqItem of requestedItems) {
    let mat = null;
    const lookupId = reqItem.productId || reqItem.materialId || reqItem.id;
    if (lookupId && mongoose.Types.ObjectId.isValid(lookupId)) {
      mat = await Material.findOne({ _id: lookupId, status: 'active', isArchived: { $ne: true } }).lean();
    } else if (reqItem.sku) {
      mat = await Material.findOne({
        sku: { $regex: new RegExp(`^${escapeRegex(normalizeSku(reqItem.sku))}$`, 'i') },
        status: 'active',
        isArchived: { $ne: true },
      }).lean();
    } else if (reqItem.name) {
      mat = await Material.findOne({
        name: { $regex: new RegExp(`^${escapeRegex(String(reqItem.name).trim())}$`, 'i') },
        status: 'active',
        isArchived: { $ne: true },
      }).lean();
    }

    if (!mat) {
      const suggestions = reqItem.name || reqItem.sku
        ? (await searchForAiQuotation({ query: reqItem.name || reqItem.sku, serviceCategory, onlyInStock: true, limit: 3 })).items
        : [];
      unresolvedItems.push({
        requested: reqItem,
        reason: 'Not found in active catalog (AI cannot invent items)',
        suggestions,
      });
    } else {
      validRequests.push({
        productId: mat._id,
        quantity: Number(reqItem.quantity || 1),
        variant: reqItem.variant || mat.variant,
      });
    }
  }

  const calculation = await calculateDynamicQuotePricing({
    serviceCategory,
    items: validRequests,
    appliedRules,
    customCharges,
    discount,
    allowPriceOverride: false, // AI must NEVER override catalog pricing autonomously
  });

  // Suggest in-stock alternatives for insufficient stock items
  const alternativeSuggestions = {};
  for (const bad of calculation.stockValidation.insufficientItems) {
    const { compatibleItems } = await getCompatibleMaterials(bad.productId);
    alternativeSuggestions[String(bad.productId)] = compatibleItems.filter(
      (c) => c.stock >= bad.quantity || ['service', 'labour'].includes(c.itemType)
    );
  }

  return {
    verified: unresolvedItems.length === 0 && !calculation.stockValidation.hasInsufficientStock,
    unresolvedItems,
    alternativeSuggestions,
    quotation: calculation,
  };
}

module.exports = {
  InventoryError,
  formatInventoryItem,
  calculateTaxLine,
  listInventory,
  getDashboardSummary,
  getItemDetails,
  createInventoryItem,
  updateInventoryItem,
  updateItemPricing,
  toggleItemStatus,
  safeDeleteOrArchiveItem,
  adjustStock,
  getStockHistory,
  getLowStockAlerts,
  validateStockAvailability,
  allocateStockForReference,
  listPricingConfigs,
  createPricingConfig,
  updatePricingConfig,
  deletePricingConfig,
  calculateDynamicQuotePricing,
  searchForAiQuotation,
  getCompatibleMaterials,
  prepareAiQuotationDraft,
};
