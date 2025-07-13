const mongoose = require('mongoose');

const SystemConfigSchema = new mongoose.Schema({
  date: { type: String, required: true },
  termconditions: { type: String, required: true },
  settings: {
    correctAnswerBase: Number,
    fastAnswerBonus: Number,
    incorrectAnswerPenalty: Number,
    timeoutPenalty: Number,
    referralBonus: Number,
    initialPoints: Number,
    minWithdrawalLimit: Number,
  },
  quizRules: {
    answerTimeLimit: Number,
    fastAnswerThreshold: Number,
    liveQuizTotalDuration: Number,
  }
});

module.exports = mongoose.model('SystemConfig', SystemConfigSchema);