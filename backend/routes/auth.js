const express = require("express")
const jwt = require("jsonwebtoken")
const User = require('../models/user');
const auth = require("../middleware/auth")

const router = express.Router()

// Register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body

    // Check if user already exists
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" })
    }

    // Create new user
    const user = new User({ name, email, password })
    await user.save()

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || "your-secret-key", { expiresIn: "7d" })

    res.status(201).json({
      message: "User created successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        videosProcessed: user.videosProcessed,
        clipsGenerated: user.clipsGenerated,
      },
    })
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body

    // Find user by email
    const user = await User.findOne({ email })
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" })
    }

    // Check password
    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" })
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || "your-secret-key", { expiresIn: "7d" })

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        videosProcessed: user.videosProcessed,
        clipsGenerated: user.clipsGenerated,
      },
    })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Verify token
router.get("/verify", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password")
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        videosProcessed: user.videosProcessed,
        clipsGenerated: user.clipsGenerated,
      },
    })
  } catch (error) {
    console.error("Token verification error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router
