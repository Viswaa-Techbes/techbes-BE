const Material = require('../../models/Material');

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

    const filter = { status: 'active' };

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
 * ADMIN: List all products (with search, status & category filters)
 */
async function listProductsAdmin(req, res, next) {
  try {
    const { search, status, category, brand, page = 1, limit = 100 } = req.query;
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }
    if (category && category !== 'all') {
      filter.category = { $regex: new RegExp(category, 'i') };
    }
    if (brand && brand !== 'all') {
      filter.brand = { $regex: new RegExp(brand, 'i') };
    }
    if (search) {
      const escaped = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escaped, 'i');
      filter.$or = [
        { name: searchRegex },
        { brand: searchRegex },
        { modelNumber: searchRegex },
        { sku: searchRegex },
        { variant: searchRegex },
        { category: searchRegex },
      ];
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
    const [data, totalCount] = await Promise.all([
      Material.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Math.max(1, parseInt(limit, 10)))
        .lean(),
      Material.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      totalCount,
      count: data.length,
      data,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * ADMIN: Create new product
 */
async function createProductAdmin(req, res, next) {
  try {
    const {
      name,
      brand,
      category,
      subcategory,
      modelNumber,
      sku,
      variant,
      specifications,
      price,
      basePrice,
      gstRate,
      isTaxInclusive,
      stock,
      minStock,
      unit,
      image,
      description,
      status,
      variants,
    } = req.body;

    // 1. Validation
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Product name is required' });
    }

    const effectivePrice = Math.max(0, Number(basePrice ?? price ?? 0));
    const effectiveGstRate = typeof gstRate === 'number' ? Math.max(0, Math.min(100, gstRate)) : 18;
    const effectiveStock = Math.max(0, parseInt(stock, 10) || 0);
    const effectiveMinStock = Math.max(0, parseInt(minStock, 10) || 0);

    // 2. Validate SKU uniqueness if provided
    const cleanSku = String(sku || '').trim().toUpperCase();
    if (cleanSku) {
      const existingSku = await Material.findOne({ sku: cleanSku }).lean();
      if (existingSku) {
        return res.status(400).json({ success: false, message: `A product with SKU "${cleanSku}" already exists` });
      }
    }

    // 3. Create product
    const product = new Material({
      name: String(name).trim(),
      brand: String(brand || '').trim(),
      category: String(category || 'General').trim(),
      subcategory: String(subcategory || '').trim(),
      modelNumber: String(modelNumber || '').trim(),
      sku: cleanSku,
      variant: String(variant || '').trim(),
      specifications: String(specifications || '').trim(),
      basePrice: effectivePrice,
      price: effectivePrice,
      gstRate: effectiveGstRate,
      isTaxInclusive: Boolean(isTaxInclusive),
      stock: effectiveStock,
      minStock: effectiveMinStock,
      unit: String(unit || 'each').trim(),
      image: String(image || '').trim(),
      description: String(description || '').trim(),
      status: status === 'inactive' ? 'inactive' : 'active',
      variants: Array.isArray(variants) ? variants : [],
    });

    await product.save();

    return res.status(201).json({
      success: true,
      message: 'Product created successfully in inventory',
      data: product,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * ADMIN: Update product
 */
async function updateProductAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const product = await Material.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const {
      name,
      brand,
      category,
      subcategory,
      modelNumber,
      sku,
      variant,
      specifications,
      price,
      basePrice,
      gstRate,
      isTaxInclusive,
      stock,
      minStock,
      unit,
      image,
      description,
      status,
      variants,
    } = req.body;

    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({ success: false, message: 'Product name cannot be empty' });
      }
      product.name = String(name).trim();
    }

    if (brand !== undefined) product.brand = String(brand).trim();
    if (category !== undefined) product.category = String(category).trim();
    if (subcategory !== undefined) product.subcategory = String(subcategory).trim();
    if (modelNumber !== undefined) product.modelNumber = String(modelNumber).trim();
    if (variant !== undefined) product.variant = String(variant).trim();
    if (specifications !== undefined) product.specifications = String(specifications).trim();
    if (unit !== undefined) product.unit = String(unit).trim();
    if (image !== undefined) product.image = String(image).trim();
    if (description !== undefined) product.description = String(description).trim();
    if (status !== undefined) product.status = status === 'inactive' ? 'inactive' : 'active';
    if (isTaxInclusive !== undefined) product.isTaxInclusive = Boolean(isTaxInclusive);
    if (Array.isArray(variants)) product.variants = variants;

    if (basePrice !== undefined || price !== undefined) {
      const p = Math.max(0, Number(basePrice ?? price ?? 0));
      product.basePrice = p;
      product.price = p;
    }

    if (gstRate !== undefined) {
      product.gstRate = Math.max(0, Math.min(100, Number(gstRate) || 0));
    }

    if (stock !== undefined) {
      product.stock = Math.max(0, parseInt(stock, 10) || 0);
    }

    if (minStock !== undefined) {
      product.minStock = Math.max(0, parseInt(minStock, 10) || 0);
    }

    // Check SKU if modified
    if (sku !== undefined) {
      const cleanSku = String(sku || '').trim().toUpperCase();
      if (cleanSku && cleanSku !== product.sku) {
        const existing = await Material.findOne({ sku: cleanSku, _id: { $ne: id } }).lean();
        if (existing) {
          return res.status(400).json({ success: false, message: `A product with SKU "${cleanSku}" already exists` });
        }
      }
      product.sku = cleanSku;
    }

    await product.save();

    return res.json({
      success: true,
      message: 'Product updated successfully',
      data: product,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * ADMIN: Toggle active / inactive status
 */
async function toggleStatusAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const product = await Material.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    product.status = product.status === 'active' ? 'inactive' : 'active';
    await product.save();

    return res.json({
      success: true,
      message: `Product is now ${product.status}`,
      data: product,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * ADMIN: Safe Deactivation (Soft delete)
 */
async function deleteProductAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const product = await Material.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Soft delete to protect historical orders and quotation references
    product.status = 'inactive';
    await product.save();

    return res.json({
      success: true,
      message: 'Product has been deactivated safely',
      data: product,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  searchInventory,
  getProductById,
  calculateGst,
  listProductsAdmin,
  createProductAdmin,
  updateProductAdmin,
  toggleStatusAdmin,
  deleteProductAdmin,
};
