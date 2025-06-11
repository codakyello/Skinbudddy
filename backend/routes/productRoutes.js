const express = require("express");
const {
  createProduct,
  getAllProducts,
} = require("../controllers/productController");
const { getBrandProducts } = require("../controllers/brandController");
const router = express.Router();

router.route("/").get(getAllProducts).post(createProduct);

module.exports = router;
