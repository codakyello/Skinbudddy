const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      unique: true,
      required: [true, "Product name is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Product description is required"],
    },
    tags: {
      type: String,
    },

    category: {
      type: [String], // Defines an array of strings
      required: true,
      enum: [
        "Moisturizer",
        "Sunscreen",
        "Serum",
        "Cleanser",
        "Makeup",
        "Other",
      ],
    },

    brand: {
      type: String,
      required: true,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    images: {
      type: [String],
      validate: {
        validator: function (value) {
          return value.length > 0;
        },
        message: "At least one image is required",
      },
    },
    ratings: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    reviews: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        comment: String,
        rating: { type: Number, min: 1, max: 5 },
      },
    ],
    sizes: [
      {
        size: { type: String },
        price: {
          type: Number,
          required: [true, "Product price is required"],
          min: [0, "Price cannot be negative"],
        },
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    }, // The products that were created in the last 14 days are "New Arrivals"
    totalSold: {
      type: Number,
    },
    discount: {
      type: Number,
      min: 0,
    },
    lastRestockedAt: Date, // The products that are restocked in the last 14 days
  },

  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
