const express = require("express");
const {
  getAllAnnouncements,
  createAnnouncement,
  getAnnouncement,
  updateAnnouncement,
  deleteAnnoucement,
} = require("../controllers/announcementController");

const authController = require("../controllers/authController");

const router = express.Router();

router.route("/").get(getAllAnnouncements).post(createAnnouncement);

router
  .route("/:id")
  .get(getAnnouncement)
  .patch(
    authController.authenticate,
    authController.authorize("admin"),
    updateAnnouncement
  )
  .delete(
    authController.authenticate,
    authController.authorize("admin"),
    deleteAnnoucement
  );

module.exports = router;
