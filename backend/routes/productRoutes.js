const express = require("express");
const {
  createProduct,
  getAllProducts,
} = require("../controllers/productController");
const router = express.Router();

router.route("/").get(getAllProducts).post(createProduct);

module.exports = router;
