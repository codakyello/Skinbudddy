const Announcement = require("../models/announcementModel");
const { catchAsync, sendSuccessResponseData } = require("../utils/helpers");
const AppError = require("../utils/appError");

module.exports.getAllAnnouncements = catchAsync(async (_, res) => {
  const announcements = await Announcement.find();

  sendSuccessResponseData(res, "announcements", announcements);
});

module.exports.createAnnouncement = catchAsync(async (req, res) => {
  const announcement = await Announcement.create(req.body);

  sendSuccessResponseData(res, "announcement", announcement);
});

module.exports.updateAnnouncement = catchAsync(async (req, res, next) => {
  const { announcement } = req.body;

  if (!announcement || announcement.trim() === "") {
    return next(new AppError("Announcement cannot be empty", 400));
  }

  const newAnnouncement = await Announcement.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  if (!newAnnouncement) {
    return next(new AppError("Announcement with this ID cannot be found", 404));
  }

  sendSuccessResponseData(res, "annoucement", newAnnouncement);
});

module.exports.getAnnouncement = catchAsync(async (req, res) => {
  const annoucement = await Announcement.findById(req.params.id);

  if (!annoucement)
    throw new AppError("No Annoucement found with that ID", 404);

  sendSuccessResponseData(res, "annoucement", annoucement);
});

module.exports.deleteAnnoucement = catchAsync(async (req, res) => {
  const annoucement = await Announcement.findByIdAndDelete(req.params.id);

  if (!annoucement)
    throw new AppError("No Annoucement found with that ID", 404);

  sendSuccessResponseData(res, "annoucement", annoucement);
});
