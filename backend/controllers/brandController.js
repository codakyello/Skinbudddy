const { catchAsync, sendSuccessResponseData } = require("../utils/helpers");
const Brand = require("../models/brandModel");
const Product = require("../models/productModel");
const APIFEATURES = require("../utils/apiFeatures");

module.exports.getAllBrands = catchAsync(async (req, res) => {
  const brands = await Brand.find();

  sendSuccessResponseData(res, "brands", brands);
});

module.exports.createBrand = catchAsync(async (req, res) => {
  console.log(req.body);
  const newBrand = await Brand.create(req.body);

  sendSuccessResponseData(res, "brand", newBrand);
});

module.exports.updateBrand = catchAsync(async (req, res) => {
  const brand = await Brand.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!brand) throw new AppError("Brand not found", 404);

  sendSuccessResponseData(res, "brand", brand);
});

module.exports.getBrand = catchAsync(async (req, res) => {
  const brandName = req.params.id;

  const brand = await Brand.findOne({
    name: new RegExp(`^${brandName}$`, "i"),
  });

  if (!brand) throw new AppError("Brand not found", 404);

  const apiFeatures = new APIFEATURES(
    Product.find({ brand: brand._id }),
    req.query
  )
    .filter()
    .sort()
    .paginate()
    .limitFields();

  const products = await apiFeatures.query;

  const brandObj = brand.toObject();

  sendSuccessResponseData(res, "brand", { ...brandObj, products });
});
