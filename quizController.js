



const Quiz = require('../models/Quiz');

exports.createQuiz = async (req, res) => {
  try {
    const { title, timeLimitPerQuestion, questions, date, time } = req.body;

    // Basic validation
    if (!title || !timeLimitPerQuestion || !questions || !date || !time) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Add question IDs if not provided
    const questionsWithIds = questions.map((q, index) => ({
      id: q.id || `q${index + 1}`,
      text: q.text,
      options: q.options,
      correctAnswer: q.correctAnswer
    }));

    const quiz = new Quiz({
      title,
      timeLimitPerQuestion,
      questions: questionsWithIds,
      date,  // DD/MM/YYYY format
      time,  // HH:mm format
      isLive: false,
      currentQuestionIndex: -1
    });

    await quiz.save();
    res.status(201).json(quiz);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.startQuiz = async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    quiz.isLive = true;
    quiz.currentQuestionIndex = 0;
    quiz.startedAt = new Date();
    await quiz.save();

    res.json(quiz);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.nextQuestion = async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
    if (!quiz.isLive) return res.status(400).json({ message: 'Quiz is not active' });

    quiz.currentQuestionIndex++;
    if (quiz.currentQuestionIndex >= quiz.questions.length) {
      quiz.isLive = false;
      quiz.completed = true;
      quiz.endedAt = new Date();
    }

    await quiz.save();
    res.json(quiz);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.submitAnswer = async (req, res) => {
  try {
    const { answerIndex, userId } = req.body;
    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
    if (!quiz.isLive) return res.status(400).json({ message: 'Quiz not active' });
    if (quiz.currentQuestionIndex < 0) {
      return res.status(400).json({ message: 'No active question' });
    }

    const currentQuestion = quiz.questions[quiz.currentQuestionIndex];
    const isCorrect = currentQuestion.options[answerIndex] === currentQuestion.correctAnswer;

    // Update participant score
    let participant = quiz.participants.find(p => p.user.toString() === userId);
    if (participant) {
      if (isCorrect) participant.score += 1;
    } else {
      quiz.participants.push({
        user: userId,
        score: isCorrect ? 1 : 0
      });
    }

    await quiz.save();
    res.json({ correct: isCorrect });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getQuiz = async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
    res.json(quiz);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

