const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const adminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      validate: [validator.isEmail, "Please provide a valid email"],
      required: [true, "Please provide a valid email"],
      unique: true,
      sparse: true,
      lowerCase: true,
    },
    new: {
      type: Boolean,
      default: true,
      select: false,
    },
    authType: {
      type: String,
      enum: {
        values: ["credentials", "google", "twitter", "facebook"],
        message:
          "Authtype is either: credentials, google, twitter or facebook ",
      },
      required: [true, "Please provide an auth type"],
    },
    role: { type: String, default: "admin" },
    image: String,
    password: {
      type: String,
      minlength: [8, "Password must be at least 8 characters"],
    },

    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetTokenExpires: Date,
    latestTokenAssignedAt: Date,
    active: {
      type: Boolean,
      default: true,
      select: false,
    },
  },
  { timestamps: true }
);

adminSchema.pre(/^find/, function (next) {
  this.find({ active: { $ne: false } });
  next();
});

adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);

  this.confirmPassword = undefined;
  this.passwordChangedAt = new Date(Date.now() - 1000);
  next();
});

adminSchema.methods.checkLatestToken = function (JWT_TIMESTAMP) {
  const tokenAssignedAtTimeStamp = parseInt(
    (this.latestTokenAssignedAt.getTime() / 1000).toString(),
    10
  );

  return tokenAssignedAtTimeStamp == JWT_TIMESTAMP;
};

adminSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  console.log(candidatePassword);
  console.log(userPassword);
  return await bcrypt.compare(candidatePassword, userPassword);
};

adminSchema.methods.changePasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      (this.passwordChangedAt.getTime() / 1000).toString(),
      10
    );
    return changedTimestamp > JWTTimestamp;
  }

  return false;
};

adminSchema.methods.createPasswordResetToken = function () {
  // create a random token
  const resetToken = crypto.randomBytes(32 / 2).toString("hex");
  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.passwordResetTokenExpires = Date.now() + 10 * 60 * 1000;
  return resetToken;
};

adminSchema.methods.generateOtp = async function () {
  const otp = crypto.randomInt(100000, 999999).toString();
  this.otp = await bcrypt.hash(otp, 10);
  this.otpExpires = Date.now() + process.env.OTP_EXPIRES_IN * 60 * 1000;

  return otp;
};

adminSchema.methods.correctOTP = async function (otp) {
  return await bcrypt.compare(otp, this.otp);
};

// Create the User model
const Admin = mongoose.model("Admin", adminSchema);

module.exports = Admin;
