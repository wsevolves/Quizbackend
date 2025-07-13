// routes/authRoutes.js
const express = require("express");
const router = express.Router();
const {
  register,
  loginWithEmail,
  loginWithMobile,
  getAllUsers,
  updateUserPointsAndWallet,
  getUserById,
} = require("../controllers/authController");

router.post("/register", register);
router.post("/login/email", loginWithEmail);
router.post("/login/mobile", loginWithMobile);
router.get("/users", getAllUsers);
router.put("/user/:userId/points", updateUserPointsAndWallet);
router.get("/user/:_id", getUserById);



module.exports = router;
