const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require('http');
const socketIo = require('socket.io');
const authRoutes = require("./routes/auth");
const quizRoutes = require("./routes/quiz");
const systemConfigRoutes = require('./routes/systemConfigRoutes');
const quizController = require('./controllers/quizLiveController');
dotenv.config();

const app = express();

// Configure allowed origins
const allowedOrigins = [
  "http://localhost:5173",
  "https://quizcha.wsevolves.com",
  "https://apiquizcha.wsevolves.com"
].filter(Boolean);

console.log('Allowed CORS origins:', allowedOrigins);

// Enhanced CORS configuration
app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create HTTP server
const server = http.createServer(app);

// Socket.IO configuration
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

// Database connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));



// Initialize routes
app.use("/api/auth", authRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/system-config", systemConfigRoutes);

// Initialize quiz controller
quizController.initialize(io);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Process event handlers
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});