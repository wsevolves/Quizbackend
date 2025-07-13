const Quiz = require('../models/Quiz');
const User = require('../models/User');
const SystemConfig = require('../models/SystemConfig');

const QUIZ_STATES = {
    WAITING: 'waiting',
    QUESTION: 'question',
    ANSWER: 'answer',
    FINISHED: 'finished'
};

let io;
let currentQuiz = null;
let currentQuestionIndex = -1;
let quizState = QUIZ_STATES.WAITING;
let timer = null;
let timeLeft = 0;
let users = {};


let systemConfig = {
    quizRules: {
        answerTimeLimit: 8,
        fastAnswerThreshold: 5
    },
    settings: {
        correctAnswerBase: 10,
        fastAnswerBonus: 15,
        incorrectAnswerPenalty: -10,
        timeoutPenalty: 10,
        initialPoints: 100
    }
};

function formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

function initialize(socketIo) {
    io = socketIo;

    loadSystemConfig().then(() => {
        checkScheduledQuizzes();
        setInterval(checkScheduledQuizzes, 5000);
    });

    io.on('connection', (socket) => {
        console.log(`New client connected: ${socket.id}`);

        socket.on('requestState', () => {
            if (currentQuiz) {
                socket.emit('stateUpdate', getCurrentState());
            } else {
                socket.emit('waiting', { message: "No active quiz" });
            }
        });

        socket.on('joinQuiz', handleJoinQuiz(socket));
        socket.on('submitAnswer', handleSubmitAnswer(socket));
        socket.on('disconnect', handleDisconnect(socket));
    });
}

function getCurrentState() {
    return {
        state: quizState,
        quiz: currentQuiz ? {
            id: currentQuiz._id,
            title: currentQuiz.title,
            currentQuestionIndex,
            totalQuestions: currentQuiz.questions.length
        } : null,
        question: currentQuiz ? currentQuiz.questions[currentQuestionIndex] : null,
        currentQuestionIndex,
        totalQuestions: currentQuiz ? currentQuiz.questions.length : 0,
        timeLeft,
        config: {
            questionTime: currentQuiz?.timeLimitPerQuestion || 15,
            answerTime: systemConfig.quizRules.answerTimeLimit
        }
    };
}

async function startQuiz(quizId) {
    try {
        currentQuiz = await Quiz.findById(quizId);
        if (!currentQuiz) {
            throw new Error('Quiz not found');
        }

        quizState = QUIZ_STATES.QUESTION;
        currentQuestionIndex = 0;
        timeLeft = currentQuiz.timeLimitPerQuestion;
        users = {};

        await currentQuiz.updateOne({
            currentQuestionIndex: 0
        });

        startTimer();
        sendQuestion();

    } catch (err) {
        console.error('Error starting quiz:', err);
        resetQuizState();
    }
}

function resetQuizState() {
    quizState = QUIZ_STATES.WAITING;
    currentQuiz = null;
    currentQuestionIndex = -1;
    timeLeft = 0;
    clearInterval(timer);
}

function sendQuestion() {
    if (!currentQuiz || currentQuestionIndex < 0) return;

    const question = currentQuiz.questions[currentQuestionIndex];
    const stateUpdate = {
        ...getCurrentState(),
        totalQuestions: currentQuiz.questions.length,
        action: 'newQuestion'
    };

    io.emit('question', stateUpdate);
    console.log(`Sent question ${currentQuestionIndex + 1}/${currentQuiz.questions.length}`);
}



async function nextQuestion() {
    currentQuestionIndex++;
    if (currentQuestionIndex < currentQuiz.questions.length) {
        currentQuiz.currentQuestionIndex = currentQuestionIndex;
        await currentQuiz.save();

        quizState = QUIZ_STATES.QUESTION;
        timeLeft = currentQuiz.timeLimitPerQuestion;
        sendQuestion();
    } else {
        await endQuiz();
    }
}

function startTimer() {
    clearInterval(timer);
    timer = setInterval(async () => {
        timeLeft--;

        // Only send timer updates to joined users
        Object.keys(users).forEach(socketId => {
            io.to(socketId).emit('timerUpdate', { timeLeft, state: quizState });
        });

        if (timeLeft <= 0) {
            if (quizState === QUIZ_STATES.QUESTION) {
                startAnswerTime();
            } else if (quizState === QUIZ_STATES.ANSWER) {
                await handleTimeout();
                await nextQuestion();
            }
        }
    }, 1000);
}




function startAnswerTime() {
    quizState = QUIZ_STATES.ANSWER;
    timeLeft = systemConfig.quizRules.answerTimeLimit;
    io.emit('stateChange', {
        state: quizState,
        timeLeft: timeLeft
    });
}

async function handleTimeout() {
    const unansweredUsers = Object.values(users).filter(user =>
        !user.answers[currentQuestionIndex]
    );

    for (const user of unansweredUsers) {
        const penalty = systemConfig.settings.timeoutPenalty;
        user.points = (user.points || systemConfig.settings.initialPoints) - penalty;


    }
}

// async function endQuiz() {
//     try {
//         if (!currentQuiz) return;

//         const quizId = currentQuiz._id;

//         // Get participant data
//         const participants = Object.values(users).map(user => ({
//             userId: user._id,
//             name: user.name,
//             score: user.score,
//             pointsEarned: user.answers.reduce((sum, answer) => sum + (answer?.pointsEarned || 0), 0)
//         }));

//         // Update quiz with participant data
//         await Quiz.findByIdAndUpdate(quizId, {
//             $set: {
//                 isLive: false,
//                 currentQuestionIndex: -1,
//                 completed: true,
//                 endedAt: new Date(),
//                 participants: participants
//             }
//         });

//         // Send final results only to participants
//         Object.keys(users).forEach(socketId => {
//             io.to(socketId).emit('quizEnd', {
//                 message: "Quiz has ended!",
//                 leaderboard: participants
//                     .sort((a, b) => b.score - a.score || b.pointsEarned - a.pointsEarned)
//                     .map(p => ({
//                         name: p.name,
//                         score: p.score,
//                         points: p.pointsEarned
//                     }))
//             });
//         });

//         console.log(`Quiz ended with ${participants.length} participants`);
//         resetQuizState();

//     } catch (err) {
//         console.error('Error ending quiz:', err);
//         resetQuizState();
//     }
// }
async function endQuiz() {
    try {
        if (!currentQuiz) return;

        const quizId = currentQuiz._id;
        console.log(`Finalizing quiz ${quizId}`);

        const participantIds = Object.values(users).map(user => user._id);

        await Quiz.findByIdAndUpdate(quizId, {
            $set: {
                isLive: false,
                currentQuestionIndex: -1,
                completed: true,
                endedAt: new Date(),
                participants: participantIds
            }
        });

        Object.keys(users).forEach(socketId => {
            io.to(socketId).emit('quizEnd', {
                message: "Quiz has ended!",
                scores: Object.values(users).map(user => ({
                    userId: user.userId,
                    name: user.name,
                    score: user.score,
                    points: user.points
                }))
            });
        });

        resetQuizState();
        console.log('Quiz completed successfully');

    } catch (err) {
        console.error('Error ending quiz:', err);
        resetQuizState();
    }
}



function resetQuizState() {
    quizState = QUIZ_STATES.WAITING;
    currentQuiz = null;
    currentQuestionIndex = -1;
    timeLeft = 0;
    users = {};

    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    console.log('Quiz state reset to default');
}

async function checkScheduledQuizzes() {
    try {
        if (currentQuiz) {
            console.log('Quiz already in progress, skipping schedule check');
            return;
        }

        const now = new Date();
        const currentTime = now.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
        const currentDate = formatDate(now);

        console.log(`Checking scheduled quizzes at ${currentDate} ${currentTime}`);


        const quiz = await Quiz.findOneAndUpdate(
            {
                date: currentDate,
                time: { $lte: currentTime },
                isLive: false,
                completed: false,
                $or: [
                    { startedAt: { $exists: false } },
                    { startedAt: null }
                ]
            },
            {
                $set: {
                    isLive: true,
                    startedAt: new Date()
                }
            },
            {
                sort: { time: 1 },
                new: true
            }
        );

        if (quiz) {
            console.log(`Starting quiz: ${quiz.title} at ${quiz.time}`);
            await startQuiz(quiz._id);
        } else {
            console.log('No quizzes to start at this time');
        }
    } catch (err) {
        console.error('Error checking scheduled quizzes:', err);
    }
}

async function loadSystemConfig() {
    try {
        const config = await SystemConfig.findOne().sort({ date: -1 });
        if (config) {
            systemConfig = config;
            console.log('System config loaded:', systemConfig);
        }
    } catch (err) {
        console.error('Error loading system config:', err);
    }
}



function handleJoinQuiz(socket) {
    return async (userData) => {
        try {
            const dbUser = await User.findById(userData.userId);
            if (!dbUser) {
                socket.emit('error', { message: 'User not found' });
                return;
            }

            // Check if user already joined (prevent duplicate joins)
            const alreadyJoined = Object.values(users).some(u => u._id.toString() === dbUser._id.toString());
            if (alreadyJoined) {
                socket.emit('error', { message: 'You have already joined this quiz' });
                return;
            }

            users[socket.id] = {
                id: socket.id,
                userId: userData.userId,
                _id: dbUser._id, // Store MongoDB _id
                name: dbUser.username,
                score: 0,
                points: dbUser.points,
                answers: Array(currentQuiz?.questions.length).fill(null) // Initialize answers array
            };

            if (currentQuiz && currentQuiz.isLive) {
                socket.emit('stateUpdate', getCurrentState());
            } else {
                socket.emit('waiting', { message: "Waiting for quiz to start..." });
            }

            console.log(`User ${dbUser.username} (${dbUser._id}) joined the quiz`);

        } catch (err) {
            console.error('Error joining quiz:', err);
            socket.emit('error', { message: 'Error joining quiz' });
        }
    };
}






function handleSubmitAnswer(socket) {
    return async (data) => {
        try {
            // Basic validation checks
            if (quizState !== QUIZ_STATES.QUESTION || !currentQuiz) {
                console.log('Answer submission rejected - not in question state');
                return;
            }

            const user = users[socket.id];
            if (!user) {
                console.log('Answer submission rejected - user not found');
                socket.emit('error', { message: 'You must join the quiz first' });
                return;
            }

            // Check if already answered this question
            if (user.answers[currentQuestionIndex] !== null) {
                console.log(`User ${user.name} already answered question ${currentQuestionIndex}`);
                socket.emit('error', { message: 'You have already answered this question' });
                return;
            }

            const question = currentQuiz.questions[currentQuestionIndex];
            const answerTime = systemConfig.quizRules.answerTimeLimit - timeLeft;

            // Handle timeout case (no answer submitted)
            if (data.answer === null || data.answer === undefined) {
                const penalty = Math.abs(systemConfig.settings.timeoutPenalty);
                const newPoints = Math.max(0, user.points - penalty);

                // Update user in database
                await User.findByIdAndUpdate(user._id, {
                    $inc: { points: -penalty },
                    $push: {
                        wallet: {
                            type: 'debit',
                            amount: penalty,
                            reason: 'Timeout penalty',
                            date: new Date().toISOString()
                        }
                    }
                });

                // Update local user state
                user.answers[currentQuestionIndex] = {
                    answer: null,
                    isCorrect: false,
                    pointsEarned: -penalty,
                    timestamp: new Date()
                };
                user.points = newPoints;

                socket.emit('answerResult', {
                    isCorrect: false,
                    pointsEarned: -penalty,
                    transactionReason: 'Timeout penalty'
                });

                console.log(`Timeout penalty applied to ${user.name}`);
                return;
            }

            // Handle normal answer submission
            const isCorrect = data.answer === question.correctAnswer;
            const isFast = answerTime <= systemConfig.quizRules.fastAnswerThreshold;

            let pointsEarned = isCorrect
                ? systemConfig.settings.correctAnswerBase
                : systemConfig.settings.incorrectAnswerPenalty;

            // Apply fast answer bonus if applicable
            if (isCorrect && isFast) {
                pointsEarned += systemConfig.settings.fastAnswerBonus;
            }

            // Ensure points don't go below zero
            const newPoints = Math.max(0, user.points + pointsEarned);

            // Update user in database
            await User.findByIdAndUpdate(user._id, {
                $inc: { points: pointsEarned },
                $push: {
                    wallet: {
                        type: pointsEarned > 0 ? 'credit' : 'debit',
                        amount: Math.abs(pointsEarned),
                        reason: isCorrect
                            ? (isFast ? 'Fast correct answer' : 'Correct answer')
                            : 'Incorrect answer',
                        date: new Date().toISOString()
                    }
                }
            });

            // Update local user state
            user.answers[currentQuestionIndex] = {
                answer: data.answer,
                isCorrect,
                pointsEarned,
                timestamp: new Date()
            };
            user.score += isCorrect ? 1 : 0;
            user.points = newPoints;

            // Prepare response based on answer type
            let transactionReason;
            if (isCorrect) {
                transactionReason = isFast ? 'Fast correct answer' : 'Correct answer';
            } else {
                transactionReason = 'Incorrect answer';
            }

            socket.emit('answerResult', {
                isCorrect,
                pointsEarned,
                transactionReason,
                correctAnswer: question.correctAnswer // Send correct answer for reference
            });

            console.log(`Answer recorded for ${user.name}: ${isCorrect ? 'CORRECT' : 'INCORRECT'} ${isFast ? '(FAST)' : ''}`);

        } catch (err) {
            console.error('Error processing answer:', err);
            socket.emit('error', { message: 'Error processing your answer' });
        }
    };
}





function handleDisconnect(socket) {
    return () => {
        console.log('Client disconnected:', socket.id);
        delete users[socket.id];
    };
}

async function getAllQuizzes(req, res) {
    try {
        const quizzes = await Quiz.find();
        res.json(quizzes);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
}



async function getQuizById(req, res) {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
        res.json(quiz);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
}

async function getUserById(req, res) {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
}

module.exports = {
    initialize,
    getAllQuizzes,
    getQuizById,
    getUserById
};