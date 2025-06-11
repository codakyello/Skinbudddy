const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

router.post("/signup", authController.adminSignUp);

router.post("/login", authController.adminLogin);

module.exports = router;
