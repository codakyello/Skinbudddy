const crypto = require("crypto");
const User = require("../models/userModel");
const Admin = require("../models/adminModel.js");
const { catchAsync, sendSuccessResponseData } = require("../utils/helpers");
const AppError = require("../utils/appError");
const { verifyJwt } = require("../utils/jwt.js");
const Email = require("../utils/email");
const { createSendToken } = require("../utils/helpers");
const { FRONTEND_URL } = require("../utils/const.js");

exports.authenticate = catchAsync(async (req, _res, next) => {
  let token =
    (req.headers.authorization?.startsWith("Bearer") &&
      req.headers.authorization.split(" ")[1]) ||
    (req.headers.cookie?.startsWith("jwt") &&
    typeof req.headers.cookie === "string"
      ? req.headers.cookie.split("=")[1]
      : undefined);

  if (token === "null" || !token)
    throw new AppError("You are not logged in! Please log in", 401);

  const decoded = await verifyJwt(token);

  const freshUser =
    (await User.findById(decoded.id).select("+role")) ||
    (await Admin.findById(decoded.id).select("+role"));

  if (!freshUser)
    throw new AppError("The user belonging to this token does not exist.", 401);

  if (freshUser.changePasswordAfter(decoded.iat))
    throw new AppError(
      "User recently changed password! Please log in again",
      401
    );

  req.user = freshUser;

  next();
});

exports.authorize = (...roles) =>
  catchAsync(async (req, _res, next) => {
    if (!roles.includes(req.user.role))
      throw new AppError(
        "You do not have permission to perform this action",
        403
      );

    next();
  });

exports.sendVerifiedTokenResponse = (_req, res) => {
  console.log("successfully authenticated");
  res.status(200).json({
    status: "success",
    message: "Successfully authenticated",
  });
};

exports.authenicateAdmin = catchAsync(async (req, res) => {
  let token =
    (req.headers.authorization?.startsWith("Bearer") &&
      req.headers.authorization.split(" ")[1]) ||
    (req.headers.cookie?.startsWith("jwt") &&
    typeof req.headers.cookie === "string"
      ? req.headers.cookie.split("=")[1]
      : undefined);

  if (token === "null" || !token)
    throw new AppError("You are not logged in! Please log in", 401);

  const decoded = await verifyJwt(token);

  const freshUser = await Admin.findById(decoded.id);

  if (!freshUser)
    throw new AppError("The user belonging to this token does not exist.", 401);

  if (freshUser.changePasswordAfter(decoded.iat))
    throw new AppError(
      "User recently changed password! Please log in again",
      401
    );

  res.status(200).json({
    status: "success",
    message: "Admin successfully authenticated",
  });
});

exports.authenticateUser = catchAsync(async (req, res) => {
  let token =
    (req.headers.authorization?.startsWith("Bearer") &&
      req.headers.authorization.split(" ")[1]) ||
    (req.headers.cookie?.startsWith("jwt") &&
    typeof req.headers.cookie === "string"
      ? req.headers.cookie.split("=")[1]
      : undefined);

  if (token === "null" || !token)
    throw new AppError("You are not logged in! Please log in", 401);

  const decoded = await verifyJwt(token);

  const freshUser = await User.findById(decoded.id);

  if (!freshUser)
    throw new AppError("The user belonging to this token does not exist.", 401);

  if (freshUser.changePasswordAfter(decoded.iat))
    throw new AppError(
      "User recently changed password! Please log in again",
      401
    );

  res.status(200).json({
    status: "success",
    message: "User Successfully authenticated",
  });
});

exports.authorizeRootAdmin = catchAsync(async (req, _res, next) => {
  if (!req.user.isRoot)
    throw new AppError(
      "You do not have the priviledge as root admin to perform this action"
    );

  next();
});

exports.getUser = catchAsync(async (req, res) => {
  if (!req.body.email) throw new AppError("Please provide an email", 400);
  const user = await User.findOne({ email: req.body.email });
  if (!user) throw new AppError("User does not exist", 404);
  res.status(200).json({
    message: "success",
    data: { user },
  });
});

// Login is not compulsory
// if a user comes on our page and is not authenticated call this function to create a guest user
module.exports.generateGuestId = catchAsync(async (req, res) => {
  // Check if guest exists
  const { guestId } = req.body;

  const guest =
    (await User.findById(guestId)) ||
    (await new User().save({ validateBeforeSave: false }));

  res.status(200).json({
    status: "success",
    data: {
      user: guest,
    },
  });
});

module.exports.userSignIn = catchAsync(async function (req, res) {
  let user = await User.findOne({
    email: req.body.email,
    authType: "credentials",
  }).select("+new");

  if (user)
    throw new AppError(
      "You are already signed up with credentials. Please login with your credentials",
      400
    );

  user = await User.findOne({
    email: req.body.email,
  }).select("+new");

  if (!user) {
    user = await new User(req.body).save({
      validateBeforeSave: false,
    });
  }

  if (user.new) {
    new Email(user).sendWelcome().catch((e) => {
      console.log(e);
    });

    user.new = false;
  }

  await user.save({ validateBeforeSave: false });
  createSendToken(user, res);
});

exports.userLogin = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    throw new AppError("Please provide email and password", 400);

  let user = await User.findOne({ email, authType: { $ne: "credentials" } });
  if (user)
    throw new AppError(
      `You are already signed up with ${user.authType}. Please sign in with ${user.authType}`,
      400
    );

  user = await User.findOne({ email, authType: "credentials" }).select(
    "+password"
  );

  if (!user || !(await user.correctPassword(password, user.password)))
    throw new AppError("Incorrect email or password", 401);

  await user.save({ validateBeforeSave: false });

  createSendToken(user, res);
});

exports.userSignUp = catchAsync(async (req, res) => {
  // Check if the user already exists
  let user = await User.findOne({ email: req.body.email });

  if (user) {
    if (user.authType === "credentials") {
      throw new AppError("Account already registered. Please log in", 409);
    } else {
      throw new AppError(
        `Account already registered. Please sign in using ${user.authType}`,
        409
      );
    }
  }

  // Create a new user
  const newUser = await User.create({
    ...req.body,
    authType: req.body.authType,
  });

  createSendToken(newUser, res);
});

exports.adminSignUp = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  // if (!email) throw new AppError("Please provide an email address");

  const admin = await Admin.findOne({ email });
  if (admin) {
    if (admin.authType === "credentials") {
      throw new AppError(
        "Admin already exists. Please login with your credentials",
        400
      );
    } else {
      throw new AppError(
        `Admin already exists. Please sign in using ${admin.authType}`,
        400
      );
    }
  }

  const newAdmin = await Admin.create({
    ...req.body,
    authType: password ? "credentials" : req.body.authType,
  });
  createSendToken(newAdmin, res);
});

module.exports.adminSignIn = catchAsync(async function (req, res) {
  let admin = await Admin.findOne({
    email: req.body.email,
    authType: "credentials",
  });

  if (admin)
    throw new AppError(
      "You are already signed up with credentials. Please login with your credentials",
      400
    );

  admin = await Admin.findOne({
    email: req.body.email,
  });

  if (!admin)
    admin = await new Admin(req.body).save({
      validateBeforeSave: false,
    });

  createSendToken(admin, res);
});

exports.adminLogin = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    throw new AppError("Please provide email and password!", 400);

  const admin = await Admin.findOne({ email, authType: "credentials" }).select(
    "+password"
  );

  if (!admin || !(await admin.correctPassword(password, admin.password)))
    throw new AppError("Incorrect email or password", 401);

  const otp = await admin.generateOtp();
  console.log(otp);
  try {
    await new Email(admin).sendOTP(otp);
  } catch (e) {
    console.log(e);
    throw new AppError(
      "An error occurred while sending the OTP. Please try again later.",
      500
    );
  }
});

module.exports.verifyUserOTP = catchAsync(async (req, res) => {
  const { email, otp } = req.body;
  if (!email) throw new AppError("Include an email", 401);
  if (!otp) throw new AppError("Please provide your One time password", 401);

  const user = await User.findOne({ email }).select("+otpExpires +otp +new");

  if (!user) throw new AppError("User does not exist", 400);

  if (!user.otp)
    throw new AppError("No OTP found. Please request a new one!", 400);

  if (!(user.otpExpires.getTime() > Date.now()))
    throw new AppError("OTP has expired. Please request another one!", 400);

  if (!(await user.correctOTP(`${otp}`)))
    throw new AppError("Incorrect OTP.", 401);

  user.otp = undefined;
  user.otpExpires = undefined;

  // send welcome message if the user is new
  if (user.new) {
    new Email(user).sendWelcome().catch((e) => {
      console.log(e.message);
    });

    user.new = false;
  }

  await user.save({ validateBeforeSave: false });

  // create and send jwt
  await createSendToken(user, res);
});

module.exports.resendUserOTP = catchAsync(async (req, res) => {
  const { email } = req.body;

  if (!email) throw new AppError("Please provide an email", 400);

  let user = await User.findOne({ email, authType: "credentials" });

  if (!user) throw new AppError("No user with such email exists", 404);

  const otp = await user.generateOtp();

  try {
    await new Email(user).sendOTP(otp);
  } catch (e) {
    console.log(e);

    throw new AppError(
      "An error occurred while sending the OTP. Please try again later.",
      500
    );
  }

  await user.save({ validateBeforeSave: false });
  res.status(200).json({
    status: "success",
    message: "A one time otp has been sent to your email",
  });
});

module.exports.verityAdminOTP = catchAsync(async (req, res) => {
  const { email, otp } = req.body;
  if (!email) throw new AppError("Include an email", 401);
  if (!otp) throw new AppError("Please provide your One time password", 401);

  const user = await Admin.findOne({ email }).select("+otpExpires +otp");

  if (!user) throw new AppError("User does not exist", 400);

  if (!user.otp)
    throw new AppError("No OTP found. Please request a new one!", 400);

  if (!(user.otpExpires.getTime() > Date.now()))
    throw new AppError("OTP has expired. Please request another one!", 400);

  if (!(await user.correctOTP(`${otp}`)))
    throw new AppError("Incorrect password.", 401);

  user.otp = undefined;
  user.otpExpires = undefined;

  await user.save({ validateBeforeSave: false });

  // create and send jwt
  await createSendToken(user, res);
});

module.exports.forgotUserPassword = catchAsync(async function (req, res) {
  // find the userId based on email
  const { email } = req.body;
  if (!email) throw new AppError("Please provide an email", 400);

  const user = await User.findOne({ email });

  if (user && user.authType !== "credentials") {
    throw new AppError(
      `Your account is registered using ${user.authType}. Password reset is only available for accounts with 'credentials' authentication.`,
      400
    );
  }

  if (!user) throw new AppError("There is no user with email", 404);

  const resetToken = user.createPasswordResetToken();

  await user.save({ validateBeforeSave: false });

  const resetURL = `${FRONTEND_URL}/reset-password?token=${resetToken}`;

  console.log(user);

  await new Email(user).sendResetToken(resetURL);

  res.status(200).json({
    status: "success",
    message: "Reset token sent to your email!",
  });
});

module.exports.verifyResetToken = catchAsync(async (req, res) => {
  console.log("verify token");
  const token = req.query.token;
  if (!token) throw new AppError("No token found", 404);
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetTokenExpires: { $gt: Date.now() },
  });

  if (!user) throw new AppError("Token is invalid or has expired!", 404);

  sendSuccessResponseData(res, "user", {});
});

exports.resetUserPassword = catchAsync(async (req, res) => {
  const { password, confirmPassword } = req.body;
  const token = req.query.token;
  if (!token) throw new AppError("Please provide a token", 400);
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetTokenExpires: { $gt: Date.now() },
  });

  if (!user) throw new AppError("Token is invalid or has expired!", 400);

  if (!password) throw new AppError("Please provide your password", 400);

  if (!confirmPassword)
    throw new AppError("Please confirm your new password", 400);

  // if (!(await user.correctPassword(currPassword, user.password))) {
  //   throw new AppError("Password is incorrect", 400);
  // }
  if (await user.correctPassword(password, user.password)) {
    throw new AppError("New password cannot be the same as old password", 400);
  }

  user.password = password;
  user.confirmPassword = confirmPassword;
  user.passwordResetToken = undefined;
  user.passwordResetTokenExpires = undefined;
  await user.save({ validateBeforeSave: true });

  createSendToken(user, res);
});

module.exports.forgotAdminPassword = catchAsync(async function (req, res) {
  // find the userId based on email
  const { email } = req.body;
  if (!email) throw new AppError("Please provide an email", 400);

  const admin = await Admin.findOne({ email });

  if (admin && admin.authType !== "credentials") {
    throw new AppError(
      `Your account is registered using ${admin.authType}. Password reset is only available for accounts with 'credentials' authentication.`,
      400
    );
  }

  if (!admin) throw new AppError("There is no user with this email", 404);

  const resetToken = admin.createPasswordResetToken();

  await admin.save({ validateBeforeSave: false });

  // if user found
  // send them a reset token.
  const resetURL = `${req.protocol}://${req.get(
    "host"
  )}/api/v1/users/resetPassword/${resetToken}`;

  const message = `Forgot your password? Submit a PATCH request with your new password and passwordConfirm to: ${resetURL}.\nIf you didn't forget your password, please ignore this email!`;

  // try {
  //   await sendEmail({
  //     email: guest.email,
  //     subject: "Your password reset token (valid for 10 min)",
  //     message,
  //   });

  res.status(200).json({
    status: "success",
    message: "Token sent to email!",
  });
  // } catch (err) {
  //   console.log(err);
  //   guest.passwordResetToken = undefined;
  //   guest.passwordResetTokenExpires = undefined;
  //   await guest.save();

  //   throw new AppError(
  //     "There was an error sending the email. Try again later!",
  //     500
  //   );
  // }
});

exports.resetAdminPassword = catchAsync(async (req, res) => {
  const { password, confirmPassword } = req.body;
  const token = req.query.token;
  if (!token) throw new AppError("Please provide a token", 400);

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const admin = await Admin.findOne({
    passwordResetToken: hashedToken,
    passwordResetTokenExpires: { $gt: Date.now() },
  });

  if (!admin) throw new AppError("Token is invalid or has expired!", 400);

  if (!password) throw new AppError("Please provide your password", 400);

  if (!confirmPassword)
    throw new AppError("Please confirm your new password", 400);

  // if (!(await user.correctPassword(currPassword, user.password))) {
  //   throw new AppError("Password is incorrect", 400);
  // }
  if (await admin.correctPassword(password, admin.password)) {
    throw new AppError("New password cannot be the same as old password", 400);
  }

  admin.password = password;
  admin.confirmPassword = confirmPassword;
  admin.passwordResetToken = undefined;
  admin.passwordResetTokenExpires = undefined;
  await admin.save({ validateBeforeSave: true });

  createSendToken(admin, res);
});

exports.updateMyPassword = catchAsync(async (req, res) => {
  let user;
  if (req.user.role === "user") {
    user = await User.findById(req.user.id).select("+password");
  } else if (req.user.role === "admin") {
    user = await Admin.findById(req.user.id).select("+password");
  }

  if (user && user.authType !== "credentials") {
    throw new AppError(
      `Your account is registered using ${user.authType}. Update password is only available for accounts with 'credentials' authentication.`,
      400
    );
  }
  if (!user) throw new AppError("User not found", 404);

  const { currPassword, password, confirmPassword } = req.body;

  if (!currPassword)
    throw new AppError("Please provide your current password", 400);

  if (!password) throw new AppError("Please provide your new password", 400);

  if (!confirmPassword)
    throw new AppError("Please confirm your new password", 400);

  if (!(await user.correctPassword(currPassword, user.password))) {
    throw new AppError("Password is incorrect", 400);
  }
  if (await user.correctPassword(password, user.password)) {
    throw new AppError("New password cannot be the same as old password", 400);
  }
  user.password = password;
  user.confirmPassword = confirmPassword;
  await user.save({ validateBeforeSave: true });

  createSendToken(user, res);
});

exports.refreshToken = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id);
  createSendToken(user, res);
});
