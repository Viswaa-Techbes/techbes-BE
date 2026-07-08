const mongoose = require('mongoose');
const ServiceSubcategory = require('./ServiceSubcategory');

module.exports = mongoose.models.CctvSubcategory || mongoose.model('CctvSubcategory', ServiceSubcategory.schema, 'servicesubcategories');
