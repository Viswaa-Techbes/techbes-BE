const mongoose = require('mongoose');
const Service = require('./Service');

module.exports = mongoose.models.CctvCategory || mongoose.model('CctvCategory', Service.schema, 'services');
