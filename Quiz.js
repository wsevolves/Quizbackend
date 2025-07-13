const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
    id: { type: String, required: true }, // Format: q1, q2, etc.
    text: { type: String, required: true },
    options: { type: [String], required: true },
    correctAnswer: { type: String, required: true }
});

const QuizSchema = new mongoose.Schema({
    title: { type: String, required: true },
    timeLimitPerQuestion: { type: Number, required: true },
    questions: { type: [QuestionSchema], required: true },
    date: { type: String, required: true }, 
    time: { type: String, required: true }, 
    isLive: { type: Boolean, default: false },
    currentQuestionIndex: { type: Number, default: -1 },
    completed: { type: Boolean, default: false },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]

});

QuizSchema.index({ date: 1, time: 1 });
QuizSchema.index({ isLive: 1 });
QuizSchema.index({ completed: 1 });

module.exports = mongoose.model('Quiz', QuizSchema);