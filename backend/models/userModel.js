const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const userSchema = new mongoose.Schema(
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
      default: "credentials",
    },
    role: { type: String, default: "user" },
    logo: String,
    image: String,
    password: {
      type: String,
      required: [true, "Please provide a password"],
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

userSchema.pre(/^find/, function (next) {
  this.find({ active: { $ne: false } });
  next();
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);

  this.confirmPassword = undefined;
  this.passwordChangedAt = new Date(Date.now() - 1000);
  next();
});

userSchema.methods.checkLatestToken = function (JWT_TIMESTAMP) {
  const tokenAssignedAtTimeStamp = parseInt(
    (this.latestTokenAssignedAt.getTime() / 1000).toString(),
    10
  );

  return tokenAssignedAtTimeStamp == JWT_TIMESTAMP;
};

userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  console.log(candidatePassword);
  console.log(userPassword);
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changePasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      (this.passwordChangedAt.getTime() / 1000).toString(),
      10
    );
    return changedTimestamp > JWTTimestamp;
  }

  return false;
};

userSchema.methods.createPasswordResetToken = function () {
  // create a random token
  const resetToken = crypto.randomBytes(32 / 2).toString("hex");
  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.passwordResetTokenExpires = Date.now() + 10 * 60 * 1000;
  return resetToken;
};

userSchema.methods.generateOtp = async function () {
  const otp = crypto.randomInt(100000, 999999).toString();
  this.otp = await bcrypt.hash(otp, 10);
  this.otpExpires = Date.now() + process.env.OTP_EXPIRES_IN * 60 * 1000;

  return otp;
};

userSchema.methods.correctOTP = async function (otp) {
  return await bcrypt.compare(otp, this.otp);
};

// Create the User model
const User = mongoose.model("User", userSchema);

module.exports = User;
