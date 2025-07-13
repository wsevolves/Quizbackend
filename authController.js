// controllers/authController.js
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

// Helper: Validate email format
const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Helper: Validate mobile number (simple pattern)
const isValidMobile = (mobile) =>
  /^[6-9]\d{9}$/.test(mobile);

// Helper: Validate password strength (min 6 chars)
const isValidPassword = (password) =>
  typeof password === "string" && password.length >= 6;

// ========== REGISTER ==========
exports.register = async (req, res) => {
  const { username, email, mobile, password, referralCode } = req.body;

  if (!username || !email || !mobile || !password) {
    return res.status(400).json({ error: "All fields are required." });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  if (!isValidMobile(mobile)) {
    return res.status(400).json({ error: "Invalid mobile number format." });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  try {
    const existingUser = await User.findOne({ $or: [{ email }, { mobile }] });
    if (existingUser) {
      return res.status(400).json({ error: "User with this email or mobile already exists." });
    }

    let referrer = null;
    if (referralCode) {
      referrer = await User.findOne({ id: referralCode });
      if (!referrer) {
        return res.status(400).json({ error: "Invalid referral code." });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date();
    const baseBonus = 100;
    const referralBonus = 50;

    const totalPoints = baseBonus + (referrer ? referralBonus : 0);

    const walletEntries = [
      {
        type: "credit",
        amount: baseBonus,
        reason: "Registration Bonus",
        date: now.toISOString(),
      }
    ];

    if (referrer) {
      walletEntries.push({
        type: "credit",
        amount: referralBonus,
        reason: "Referral Signup Bonus",
        date: now.toISOString(),
      });
    }

    const newUser = new User({
      id: Date.now().toString(),
      username,
      email,
      mobile,
      password: hashedPassword,
      role: username.toLowerCase() === "admin" ? "admin" : "user",
      referrals: 0,
      points: totalPoints,
      createdAt: now.toISOString(),
      wallet: walletEntries,
    });

    await newUser.save();

    // Update referrer if exists (best-effort basis)
    if (referrer) {
      try {
        referrer.points += referralBonus;
        referrer.referrals += 1;
        referrer.wallet.push({
          type: "credit",
          amount: referralBonus,
          reason: "Referral Bonus",
          date: now.toISOString(),
        });
        await referrer.save();
      } catch (err) {
        console.error("Failed to update referrer:", err);
        // Compensation logic: Deduct bonus from new user
        newUser.points -= referralBonus;
        newUser.wallet = newUser.wallet.filter(
          entry => !(entry.amount === referralBonus && entry.reason === "Referral Signup Bonus")
        );
        await newUser.save();
      }
    }

    const userResponse = newUser.toObject();
    delete userResponse.password;

    res.status(201).json({
      message: "User registered successfully." + (referrer ? " Referral applied." : ""),
      user: userResponse,
    });

  } catch (err) {
    res.status(500).json({
      error: "User registration failed.",
      details: err.message || err
    });
  }
};


// ========== EMAIL + PASSWORD LOGIN ==========
exports.loginWithEmail = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const userResponse = user.toObject();
    delete userResponse.password;

    return res.json({ token, user: userResponse });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Login failed.", details: err.message || err });
  }
};

// ========== MOBILE LOGIN (OTP MOCK) ==========
exports.loginWithMobile = async (req, res) => {
  const { mobile } = req.body;

  if (!mobile) {
    return res.status(400).json({ error: "Mobile number is required." });
  }

  if (!isValidMobile(mobile)) {
    return res.status(400).json({ error: "Invalid mobile number format." });
  }

  try {
    let user = await User.findOne({ mobile });

    if (!user) {
      user = new User({
        id: Date.now().toString(),
        username: mobile,
        email: "",
        mobile,
        password: "",
        role: "user",
        referrals: 0,
        points: 0,
        createdAt: new Date().toISOString(),
        wallet: []
      });

      await user.save();
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const userResponse = user.toObject();
    delete userResponse.password;

    return res.json({ token, user: userResponse });
  } catch (err) {
    console.error("Mobile login error:", err);
    return res.status(500).json({ error: "Mobile login failed.", details: err.message || err });
  }
};

exports.getAllUsers = async (req, res) => {
  try {


    const users = await User.find({}, { password: 0 }); // Exclude passwords
    const userCount = users.length;

    const response = {
      success: true,
      count: userCount,
      users: users.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        points: user.points,
        referrals: user.referrals,
        createdAt: user.createdAt,
        wallet: user.wallet
      }))
    };

    res.status(200).json(response);
  } catch (err) {
    console.error("Get users error:", err);
    res.status(500).json({
      error: "Failed to fetch users",
      details: err.message
    });
  }
};


exports.updateUserPointsAndWallet = async (req, res) => {
  console.log("BODY RECEIVED:", req.body);

  const { userId } = req.params;
  const { pointsChange, reason, type = "credit" } = req.body;

  if (!userId || typeof pointsChange !== "number" || !reason) {
    return res.status(400).json({ error: "userId, pointsChange (number), and reason are required." });
  }

  try {
    const user = await User.findOne({ id: userId }); // Changed to find by id field
    if (!user) return res.status(404).json({ error: "User not found." });

    // Adjust points
    if (type === "credit") {
      user.points += pointsChange;
    } else if (type === "debit") {
      user.points = Math.max(user.points - pointsChange, 0);
    }

    // Add to wallet
    user.wallet.push({
      type,
      amount: Math.abs(pointsChange),
      reason,
      date: new Date().toISOString(),
    });

    await user.save();

    const updatedUser = user.toObject();
    delete updatedUser.password;

    return res.status(200).json({
      message: "User points and wallet updated successfully.",
      user: updatedUser,
    });
  } catch (err) {
    console.error("Update points error:", err);
    res.status(500).json({ error: "Failed to update points.", details: err.message });
  }
};

// ========== GET USER BY ID ==========
exports.getUserById = async (req, res) => {
  const { _id } = req.params; // Changed from 'id' to '_id' to match route parameter

  if (!_id) {
    return res.status(400).json({ error: "User ID is required." });
  }

  try {
    // Check if the ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      return res.status(400).json({ error: "Invalid user ID format." });
    }

    const user = await User.findById(_id).select('-password'); // Exclude password

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        id: user.id,
        username: user.username,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        referrals: user.referrals,
        points: user.points,
        createdAt: user.createdAt,
        wallet: user.wallet
      }
    });
  } catch (err) {
    console.error("Get user by ID error:", err);
    res.status(500).json({
      error: "Failed to fetch user",
      details: err.message
    });
  }
};

