const mongoose = require("mongoose");

const CartSchema = new mongoose.Schema({
  // when naming ask will you ever populate the field, if yes name it without Id
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  quantity: {
    type: Number,
    min: 1,
    default: 1,
  },
  addToRoutine: { type: Boolean, default: true },
});

module.exports = mongoose.model("Cart", CartSchema);
