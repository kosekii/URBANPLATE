const mongoose = require('mongoose');

// Matches the shape of the standard NYC restaurants dataset
// (address, borough, cuisine, grades[], name, restaurant_id).
const gradeSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now },
    grade: { type: String, trim: true },
    score: { type: Number, default: 0 },
  },
  { _id: false }
);

const restaurantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    borough: { type: String, required: true, trim: true },
    cuisine: { type: String, required: true, trim: true },
    address: {
      building: { type: String, trim: true, default: '' },
      street: { type: String, trim: true, default: '' },
      zipcode: { type: String, trim: true, default: '' },
      coord: { type: [Number], default: undefined },
    },
    grades: { type: [gradeSchema], default: [] },
    restaurant_id: { type: String },
  },
  { collection: process.env.COLLECTION || 'restaurants' }
);

restaurantSchema.index({ name: 1 });
restaurantSchema.index({ cuisine: 1 });
restaurantSchema.index({ borough: 1 });

module.exports = mongoose.model('Restaurant', restaurantSchema);
