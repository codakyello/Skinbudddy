const Cart = require("../models/cartModel");
const AppError = require("../utils/appError");
const { catchAsync, sendSuccessResponseData } = require("../utils/helpers");

module.exports.getAllCart = catchAsync(async (req, res) => {});

// module.exports.createCart = catchAsync(async (req, res) => {
//   const newCart = await Cart.create({ ...req.body, user: req.user.id });
//   sendSuccessResponseData(res, "cart", newCart);
// });

module.exports.updateCart = catchAsync(async (req, res) => {
  const cart = await Cart.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!cart) throw new AppError("No cart with that ID exists");

  sendSuccessResponseData(res, "cart", cart);
});

module.exports.deleteCart = catchAsync(async (req, res) => {
  const cart = await Cart.findByIdAndDelete(req.params.id);

  if (!cart) throw new AppError("No cart with that ID exists");

  sendSuccessResponseData(res, "cart");
});
