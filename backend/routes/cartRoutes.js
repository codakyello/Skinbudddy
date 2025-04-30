const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cartController");

router.route("/").get(getAllCarts).post(cartController.createCart);

router
  .route("/:id")
  .patch(cartController.updateCart)
  .delete(cartController.deleteCart);

module.exports = router;
