const Products = require("../models/productModel");
const APIFEATURES = require("../utils/apiFeatures");
const { catchAsync, sendSuccessResponseData } = require("../utils/helpers");

module.exports.createProduct = catchAsync(async (req, res) => {
  const product = await Products.create(req.body);
  res.status(201).json({
    status: "success",
    data: {
      product,
    },
  });
});

module.exports.getAllProducts = catchAsync(async (req, res) => {
  const apiFeatures = new APIFEATURES(Products, req.query)
    .filter()
    .sort()
    .paginate()
    .limitFields();

  const totalCount = await Products.countDocuments();

  const products = await apiFeatures.query;

  sendSuccessResponseData(res, "products", products, totalCount);
});

module.exports.updateProduct = catchAsync(async (req, res) => {
  const { stock, ...updates } = req.body; // Extract stock separately from other updates

  const product = await Products.findById(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found" });

  // If updating stock, track when an out-of-stock product is restocked
  if (stock !== undefined) {
    if (product.stock < 1 && stock > 0) {
      product.lastRestockedAt = new Date();
    }
    product.stock = stock;
  }

  // Update other fields dynamically
  Object.assign(product, updates);

  await product.save(); // Save changes

  res.status(200).json({ message: "Product updated", product });
});
