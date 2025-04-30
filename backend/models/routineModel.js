const mongoose = require("mongoose");

const routineSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  routine: [
    {
      day: {
        type: String,
        enum: [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ],
        required: true,
      },
      timeOfDay: {
        type: String,
        enum: ["morning", "afternoon", "night"],
        required: true,
      },
      products: [
        { productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" } },
      ],
    },
  ],
});

const Routine = mongoose.model("Routine", routineSchema);
module.exports = Routine;
