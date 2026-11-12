const Material = require('../../models/Material');
const inventoryService = require('../../services/inventoryService');
const { InventoryError } = inventoryService;

function getAuditMeta(req) {
  return {
    ipAddress: req.ip || '',
    userAgent: req.get('user-agent') || '',
  };
}

function handleError(err, res, next) {
  if (err instanceof InventoryError || err?.name === 'InventoryError') {
    return res.status(err.statusCode || 400).json({
      success: false,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }
  return next(err);
}

/**
 * Utility function to round currency amounts to 2 decimal places
 */
function roundCurrency(amount) {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

/**
 * Public Real-Time Product Autocomplete / Search
 * Searches active products across name, brand, modelNumber, sku, variant, and category
 */
async function searchInventory(req, res, next) {
  try {
    const rawQuery = String(req.query.q || req.query.search || '').trim();
    const category = String(req.query.category || '').trim();

    const filter = { status: 'active', isArchived: { $ne: true } };

    if (category) {
      // Map category aliases if needed
      if (category.toLowerCase().includes('cctv')) {
        filter.category = { $regex: /cctv/i };
      } else if (category.toLowerCase().includes('network')) {
        filter.category = { $regex: /network/i };
      } else {
        filter.category = { $regex: new RegExp(category, 'i') };
      }
    }

    if (rawQuery) {
      const escaped = rawQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escaped, 'i');
      filter.$or = [
        { name: searchRegex },
        { brand: searchRegex },
        { modelNumber: searchRegex },
        { sku: searchRegex },
        { variant: searchRegex },
        { category: searchRegex },
        { description: searchRegex },
        { 'variants.name': searchRegex },
        { 'variants.sku': searchRegex },
      ];
    }

    const items = await Material.find(filter)
      .sort({ sortOrder: 1, name: 1 })
      .limit(30)
      .lean();

    // Format output with authoritative fields
    const formatted = [];
    for (const item of items) {
      const basePrice = typeof item.basePrice === 'number' ? item.basePrice : (item.price || 0);
      const gstRate = typeof item.gstRate === 'number' ? item.gstRate : 18;
      const isTaxInclusive = Boolean(item.isTaxInclusive);

      formatted.push({
        _id: item._id,
        id: item._id,
        name: item.name,
        brand: item.brand || '',
        category: item.category || 'General',
        subcategory: item.subcategory || '',
        modelNumber: item.modelNumber || '',
        sku: item.sku || '',
        variant: item.variant || '',
        specifications: item.specifications || '',
        basePrice,
        price: basePrice,
        gstRate,
        isTaxInclusive,
        stock: typeof item.stock === 'number' ? item.stock : 0,
        unit: item.unit || 'each',
        image: item.image || '',
        description: item.description || '',
        variants: Array.isArray(item.variants) ? item.variants : [],
      });
    }

    return res.json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Authoritative Product Details by ID
 */
async function getProductById(req, res, next) {
  try {
    const { id } = req.params;
    const filter = { _id: id };
    // Non-admin can only see active products
    if (req.user?.role !== 'admin') {
      filter.status = 'active';
      filter.isArchived = { $ne: true };
    }

    const item = await Material.findOne(filter).lean();
    if (!item) {
      return res.status(404).json({ success: false, message: 'Product not found or inactive' });
    }

    const basePrice = typeof item.basePrice === 'number' ? item.basePrice : (item.price || 0);
    const gstRate = typeof item.gstRate === 'number' ? item.gstRate : 18;

    return res.json({
      success: true,
      data: {
        _id: item._id,
        id: item._id,
        name: item.name,
        brand: item.brand || '',
        category: item.category || 'General',
        subcategory: item.subcategory || '',
        modelNumber: item.modelNumber || '',
        sku: item.sku || '',
        variant: item.variant || '',
        specifications: item.specifications || '',
        basePrice,
        price: basePrice,
        gstRate,
        isTaxInclusive: Boolean(item.isTaxInclusive),
        stock: typeof item.stock === 'number' ? item.stock : 0,
        unit: item.unit || 'each',
        image: item.image || '',
        description: item.description || '',
        variants: item.variants || [],
        status: item.status,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Authoritative GST and Price Calculation API
 * Validates product IDs and calculates taxable amount, GST, and totals
 */
async function calculateGst(req, res, next) {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Items array is required' });
    }

    let subtotal = 0; // Total taxable amount
    let totalGst = 0;
    const processedItems = [];

    for (const item of items) {
      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      let authoritativeProduct = null;

      if (item.productId) {
        authoritativeProduct = await Material.findById(item.productId).lean();
      }

      let basePrice = 0;
      let gstRate = 18;
      let isTaxInclusive = false;
      let productName = String(item.productName || item.name || '').trim();
      let brand = '';
      let sku = '';
      let variantName = String(item.variant || '').trim();

      if (authoritativeProduct) {
        basePrice = typeof authoritativeProduct.basePrice === 'number'
          ? authoritativeProduct.basePrice
          : (authoritativeProduct.price || 0);
        gstRate = typeof authoritativeProduct.gstRate === 'number'
          ? authoritativeProduct.gstRate
          : 18;
        isTaxInclusive = Boolean(authoritativeProduct.isTaxInclusive);
        productName = authoritativeProduct.name;
        brand = authoritativeProduct.brand || '';
        sku = authoritativeProduct.sku || '';

        // Check if a specific sub-variant was selected
        if (variantName && Array.isArray(authoritativeProduct.variants)) {
          const matchedVariant = authoritativeProduct.variants.find(
            (v) => v.name === variantName || v.sku === variantName
          );
          if (matchedVariant && typeof matchedVariant.price === 'number') {
            basePrice = matchedVariant.price;
            sku = matchedVariant.sku || sku;
          }
        }
      } else {
        // Fallback for custom line items without registered inventory product
        basePrice = Math.max(0, Number(item.unitPrice || item.basePrice || 0));
        gstRate = typeof item.gstRate === 'number' ? item.gstRate : 18;
      }

      let taxableAmount = 0;
      let gstAmount = 0;
      let lineTotal = 0;

      if (isTaxInclusive) {
        // If price already includes GST:
        lineTotal = roundCurrency(basePrice * qty);
        taxableAmount = roundCurrency(lineTotal / (1 + gstRate / 100));
        gstAmount = roundCurrency(lineTotal - taxableAmount);
      } else {
        // Standard Tax-Exclusive pricing:
        // Taxable amount = Base price × Quantity
        // GST amount = Taxable amount × GST rate ÷ 100
        // Total including GST = Taxable amount + GST amount
        taxableAmount = roundCurrency(basePrice * qty);
        gstAmount = roundCurrency((taxableAmount * gstRate) / 100);
        lineTotal = roundCurrency(taxableAmount + gstAmount);
      }

      subtotal += taxableAmount;
      totalGst += gstAmount;

      // Intra-state breakdown: CGST (half) + SGST (half)
      const halfRate = gstRate / 2;
      const cgstAmount = roundCurrency(gstAmount / 2);
      const sgstAmount = roundCurrency(gstAmount - cgstAmount);

      processedItems.push({
        productId: authoritativeProduct?._id || item.productId || null,
        productName,
        brand,
        sku,
        variant: variantName,
        quantity: qty,
        unitBasePrice: basePrice,
        gstRate,
        isTaxInclusive,
        taxableAmount,
        gstAmount,
        cgstRate: halfRate,
        cgstAmount,
        sgstRate: halfRate,
        sgstAmount,
        lineTotal,
      });
    }

    subtotal = roundCurrency(subtotal);
    totalGst = roundCurrency(totalGst);
    const finalAmount = roundCurrency(subtotal + totalGst);

    const halfTotalGst = roundCurrency(totalGst / 2);
    const sgstTotal = roundCurrency(totalGst - halfTotalGst);

    return res.json({
      success: true,
      data: {
        items: processedItems,
        subtotal, // Taxable amount
        totalGst,
        cgstTotal: halfTotalGst,
        sgstTotal,
        finalAmount, // Total including GST
        currency: 'INR',
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * ADMIN: Inventory Dashboard Summary (metrics, alerts, recent items & transactions)
 */
async function getDashboardAdmin(req, res, next) {
  try {
    const data = await inventoryService.getDashboardSummary({
      limit: req.query.limit || 6,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(err, res, next);
  }
}

/**
 * ADMIN: List all products (with search, status, stockHealth, itemType & category filters)
 */
async function listProductsAdmin(req, res, next) {
  try {
    const {
      search,
      q,
      status,
      category,
      subcategory,
      itemType,
      stockHealth,
      includeArchived,
      page = 1,
      limit = 200,
      sortBy,
      sortOrder,
    } = req.query;

    const result = await inventoryService.listInventory({
      search: search || q || '',
      status: status || '',
      category: category || '',
      subcategory: subcategory || '',
      itemType: itemType || '',
      stockHealth: stockHealth || '',
      includeArchived: includeArchived === 'true' || includeArchived === true,
      page,
      limit,
      sortBy,
      sortOrder,
    });

    return res.json({
      success: true,
      totalCount: result.total,
      count: result.items.length,
      page: result.page,
      limit: result.limit,
      data: result.items,
    });
  } catch (err) {
    return handleError(err, res, next);
  }
}

/**
 * ADMIN: Detailed product view with stock transactions & reference counts
 */
async function getItemDetailsAdmin(req, res, next) {
  try {
    const data = await inventoryService.getItemDetails(req.params.id);
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(err, res, next);
  }
}

/**
 * ADMIN: Create new inventory item
 */
async function createProductAdmin(req, res, next) {
  try {
    const item = await inventoryService.createInventoryItem(
      req.body,
      req.authUser || req.user,
      getAuditMeta(req)
    );
    return res.status(201).json({
      success: true,
      message: 'Inventory item created successfully',
      data: item,
    });
  } catch (err) {
    return handleError(err, res, next);
  }
}

/**
 * ADMIN: Update inventory item
 */
async function updateProductAdmin(req, res, next) {
  try {
    const item = await inventoryService.updateInventoryItem(
      req.params.id,
      req.body,
      req.authUser || req.user,
      getAuditMeta(req)
    );
    return res.json({
      success: true,
      message: 'Inventory item updated successfully',
      data: item,
    });
  } catch (err) {
    return handleError(err, res, next);
  }
}

/**
 * ADMIN: Dynamic Pricing update for an inventory item
 */
async function updatePricingAdmin(req, res, next) {
  try {
    const item = await inventoryService.updateItemPricing(
      req.params.id,
      req.body,
      req.authUser || req.user,
      getAuditMeta(req)
    );
    return res.json({
      success: true,
      message: 'Item pricing updated successfully',
      data: item,
    });
  } catch (err) {
    return handleError(err, res, next);
  }
}

/**
 * ADMIN: Toggle active / inactive status
 */
async function toggleStatusAdmin(req, res, next) {
  try {
    const item = await inventoryService.toggleItemStatus(
      req.params.id,
      req.body || {},
      req.authUser || req.user,
      getAuditMeta(req)
    );
    return res.json({
      success: true,
      message: `Inventory item is now ${item.status}`,
      data: item,
    });
  } catch (err) {
    return handleError(err, res, next);
  }
}

/**
 * ADMIN: Safe Delete (only when unreferenced & 0 stock) or Archive/Deactivate
 */
async function deleteProductAdmin(req, res, next) {
  try {
    const mode = req.query.mode || req.body?.mode || 'auto';
    const reason = req.query.reason || req.body?.reason || '';
    const result = await inventoryService.safeDeleteOrArchiveItem(
      req.params.id,
      { mode, reason },
      req.authUser || req.user,
      getAuditMeta(req)
    );
    return res.json({
      success: true,
      action: result.action,
      message: result.reason,
      data: result.data,
    });
  } catch (err) {
    return handleError(err, res, next);
  }
}

/**
 * ADMIN: Adjust Stock with mandatory transaction log
 */
async function adjustStockAdmin(req, res, next) {
  try {
    const result = await inventoryService.adjustStock(
      req.params.id,
      req.body,
      req.authUser || req.user,
      getAuditMeta(req)
    );
    return res.json({
      success: true,
      message: 'Stock updated and transaction logged successfully',
      data: result.item,
      transaction: result.transaction,
    });
  } catch (err) {
    return handleError(err, res, next);
  }
}

/**
 * ADMIN: Stock Movement History
 */
async function getStockHistoryAdmin(req, res, next) {
  try {
    const result = await inventoryService.getStockHistory({
      materialId: req.query.materialId || '',
      transactionType: req.query.transactionType || '',
      search: req.query.search || '',
      startDate: req.query.startDate || '',
      endDate: req.query.endDate || '',
      page: req.query.page || 1,
      limit: req.query.limit || 50,
    });
    return res.json({
      success: true,
      totalCount: result.total,
      page: result.page,
      limit: result.limit,
      data: result.transactions,
    });
  } catch (err) {
    return handleError(err, res, next);
  }
}

/**
 * ADMIN: Low-Stock & Out-of-Stock Alerts
 */
async function getLowStockAlertsAdmin(req, res, next) {
  try {
    const includeOutOfStock = req.query.includeOutOfStock !== 'false';
    const data = await inventoryService.getLowStockAlerts({ includeOutOfStock });
    return res.json({ success: true, count: data.length, data });
  } catch (err) {
    return handleError(err, res, next);
  }
}

/**
 * ADMIN: Validate stock before quotation or job material allocation
 */
async function validateStockAdmin(req, res, next) {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const data = await inventoryService.validateStockAvailability(items);
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(err, res, next);
  }
}

/**
 * ADMIN: Allocate stock for a job or quotation with atomic transaction logging
 */
async function allocateStockAdmin(req, res, next) {
  try {
    const { referenceType = 'job', referenceId = '', referenceObjectId = null, items = [], reason = '' } =
      req.body || {};
    const data = await inventoryService.allocateStockForReference({
      referenceType,
      referenceId,
      referenceObjectId,
      items,
      reason,
      adminUser: req.user,
    });
    return res.json({
      success: true,
      message: 'Stock allocated successfully',
      data,
    });
  } catch (err) {
    return handleError(err, res, next);
  }
}

/**
 * ADMIN: Dynamic Pricing Config Rules CRUD
 */
async function listPricingConfigsAdmin(req, res, next) {
  try {
    const data = await inventoryService.listPricingConfigs({
      serviceCategory: req.query.serviceCategory || req.query.category || '',
      chargeType: req.query.chargeType || '',
      status: req.query.status || 'all',
    });
    return res.json({ success: true, count: data.length, data });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function createPricingConfigAdmin(req, res, next) {
  try {
    const data = await inventoryService.createPricingConfig(
      req.body,
      req.user,
      getAuditMeta(req)
    );
    return res.status(201).json({
      success: true,
      message: 'Pricing rule created successfully',
      data,
    });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function updatePricingConfigAdmin(req, res, next) {
  try {
    const data = await inventoryService.updatePricingConfig(
      req.params.id,
      req.body,
      req.user,
      getAuditMeta(req)
    );
    return res.json({
      success: true,
      message: 'Pricing rule updated successfully',
      data,
    });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function deletePricingConfigAdmin(req, res, next) {
  try {
    const data = await inventoryService.deletePricingConfig(
      req.params.id,
      req.user,
      getAuditMeta(req)
    );
    return res.json({
      success: true,
      message: 'Pricing rule deleted successfully',
      data,
    });
  } catch (err) {
    return handleError(err, res, next);
  }
}

/**
 * ADMIN: Backend Dynamic Quotation Price Calculator
 */
async function calculateDynamicQuoteAdmin(req, res, next) {
  try {
    const data = await inventoryService.calculateDynamicQuotePricing({
      ...req.body,
      allowPriceOverride: Boolean(req.body?.allowPriceOverride),
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(err, res, next);
  }
}

/**
 * AI QUOTATION CONTROLLED TOOL ENDPOINTS
 */
async function aiSearchInventory(req, res, next) {
  try {
    const data = await inventoryService.searchForAiQuotation({
      query: req.query.q || req.query.query || '',
      serviceCategory: req.query.serviceCategory || req.query.category || '',
      itemType: req.query.itemType || '',
      onlyInStock: req.query.onlyInStock === 'true',
      limit: req.query.limit || 15,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function aiGetCompatibleMaterials(req, res, next) {
  try {
    const data = await inventoryService.getCompatibleMaterials(req.params.id);
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function aiPrepareQuotation(req, res, next) {
  try {
    const data = await inventoryService.prepareAiQuotationDraft(req.body || {});
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = {
  searchInventory,
  getProductById,
  calculateGst,
  getDashboardAdmin,
  listProductsAdmin,
  getItemDetailsAdmin,
  createProductAdmin,
  updateProductAdmin,
  updatePricingAdmin,
  toggleStatusAdmin,
  deleteProductAdmin,
  adjustStockAdmin,
  getStockHistoryAdmin,
  getLowStockAlertsAdmin,
  validateStockAdmin,
  allocateStockAdmin,
  listPricingConfigsAdmin,
  createPricingConfigAdmin,
  updatePricingConfigAdmin,
  deletePricingConfigAdmin,
  calculateDynamicQuoteAdmin,
  aiSearchInventory,
  aiGetCompatibleMaterials,
  aiPrepareQuotation,
};
