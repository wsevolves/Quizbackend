const express = require('express');
const router = express.Router();
const Quiz = require('../models/Quiz');
const quizController = require('../controllers/quizLiveController');


// Create Quiz
router.post('/', async (req, res) => {
  try {
    const quiz = new Quiz({
      ...req.body,
      isLive: false,
      currentQuestionIndex: -1
    });
    await quiz.save();
    res.status(201).json(quiz);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get All Quizzes
router.get('/', async (req, res) => {
  try {
    const quizzes = await Quiz.find();
    res.json(quizzes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Quiz by ID
router.get('/:quizId', async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    res.json(quiz);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Quiz Title/Time
router.put('/:quizId', async (req, res) => {
  try {
    const { title, timeLimitPerQuestion, date, time } = req.body;

    const updatedQuiz = await Quiz.findByIdAndUpdate(
      req.params.quizId,
      {
        title,
        timeLimitPerQuestion,
        date,
        time,
        isLive: false,
        currentQuestionIndex: -1,
        completed: false,
        startedAt: null,
        endedAt: null,
        participants: null
      },
      { new: true }
    );

    res.json(updatedQuiz);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add a Question
router.post('/:quizId/questions', async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    // Get the next question number
    const nextQuestionNumber = quiz.questions.length + 1;

    // Add the new question with auto-generated ID
    quiz.questions.push({
      id: `q${nextQuestionNumber}`,
      ...req.body
    });

    await quiz.save();
    res.status(201).json(quiz);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});



//Edit a Specific Question
router.put('/:quizId/wholeques/:questionId', async (req, res) => {
  const { quizId, questionId } = req.params;
  const { text, options, correctAnswer } = req.body;

  try {
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const question = quiz.questions.id(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    // Update fields if provided
    if (text) question.text = text;
    if (options) question.options = options;
    if (correctAnswer) question.correctAnswer = correctAnswer;

    await quiz.save();

    res.status(200).json({ message: 'Question updated successfully', quiz });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Delete Quiz
router.delete('/:quizId', async (req, res) => {
  try {
    await Quiz.findByIdAndDelete(req.params.quizId);
    res.json({ message: 'Quiz deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Question
router.delete('/:quizId/questions/:questionId', async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    quiz.questions = quiz.questions.filter(q => q._id.toString() !== req.params.questionId);
    await quiz.save();
    res.json(quiz);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/quizzes', quizController.getAllQuizzes);
router.get('/quizzes/:id', quizController.getQuizById);
router.get('/users/:id', quizController.getUserById);







module.exports = router;


