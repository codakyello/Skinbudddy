const express = require("express");
const {
  generateGuestId,
  userSignUp,
  userLogin,
  authenticateUser,
} = require("../controllers/authController");
const {
  getUserCarts,
  createUserCart,
  getUserCartSummary,
} = require("../controllers/userController");
const router = express.Router();

router.post("/signup", userSignUp);

router.post("/login", userLogin);

router.post("/generateGuestId", generateGuestId);

router.route("/:id/cart").get(getUserCarts).post(createUserCart);

router.route("/:id/cart-summary").get(getUserCartSummary);

router.route("/authenticateUser").get(authenticateUser);

module.exports = router;
