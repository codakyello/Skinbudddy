const express = require("express");
const globalErrorHandler = require("./controllers/errorController");
const bodyParser = require("body-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const hpp = require("hpp");
const mongoSanitize = require("express-mongo-sanitize");
const helmet = require("helmet");

// const morgan = require("morgan");
// const AppError = require("./utils/appError");
// const globalErrorHandler = require("./controllers/errorController");
const userRoute = require("./routes/userRoutes");
const productRoute = require("./routes/productRoutes");
const announcementRoute = require("./routes/announcementRoutes");

const app = express();
app.use(
  cors({
    origin: ["http://localhost:3000", "https://skin-buddy.vercel.app"],
    credentials: true, // if you're using cookies or sessions
  })
);

app.use(helmet());

app.use(cookieParser());

app.use(express.json());

app.use(bodyParser.json({ limit: "10kb" }));

app.use(mongoSanitize());

app.use(
  hpp({
    whitelist: [],
  })
);

app.use(express.static(`${__dirname}/public`));

app.use("/api/v1/users", userRoute);
app.use("/api/v1/products", productRoute);
app.use("/api/v1/announcements", announcementRoute);

app.get("/", (req, res) => {
  res.send("Skin Buddy");
});

app.use("*", (req, res) => {
  res.status(404).json({
    status: "fail",
    message: `Can't find ${req.originalUrl} on this server!`,
  });
});

app.use(globalErrorHandler);
module.exports = app;
