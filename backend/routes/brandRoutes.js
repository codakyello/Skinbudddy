const express = require("express");
const {
  getAllBrands,
  createBrand,
  updateBrand,
  getBrand,
} = require("../controllers/brandController");
const { authorize, authenticate } = require("../controllers/authController");
const router = express.Router();

router
  .route("/")
  .get(getAllBrands)
  .post(authenticate, authorize("admin"), createBrand);

router
  .route("/:id")
  .get(getBrand)
  .patch(authenticate, authorize("admin"), updateBrand);

module.exports = router;
