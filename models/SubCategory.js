const mongoose = require('mongoose');

const bookingQuestionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['text', 'select', 'multiselect', 'number', 'image', 'boolean', 'date'],
      default: 'text',
    },
    options: { type: [String], default: [] },      // for select / multiselect
    required: { type: Boolean, default: false },
    placeholder: { type: String, default: '', trim: true },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

const packageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    price: { type: Number, required: true, default: 0 },
    originalPrice: { type: Number, default: null },
    duration: { type: String, default: '', trim: true },
    includes: { type: [String], default: [] },
    isPopular: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const subCategorySchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, default: '', trim: true },
    icon: { type: String, default: '', trim: true },
    image: { type: String, default: '', trim: true },
    bookingQuestions: { type: [bookingQuestionSchema], default: [] },
    packages: { type: [packageSchema], default: [] },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

subCategorySchema.index({ categoryId: 1, isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('SubCategory', subCategorySchema);
