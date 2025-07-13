// models/User.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  id: String,
  username: String,
  email: { type: String, unique: true, sparse: true },
  mobile: { type: String, unique: true, sparse: true },
  password: String,
  role: { type: String, default: "user" },
  referrals: { type: Number, default: 0 },
  points: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  wallet: { type: Array, default: [] },
});

module.exports = mongoose.model("User", userSchema);
