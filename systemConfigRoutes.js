const express = require('express');
const router = express.Router();
const controller = require('../controllers/systemConfigController');

router.get('/getall', controller.getAllConfigs);
router.post('/add', controller.createConfig);
router.put('/:id', controller.updateConfig);
router.delete('/delete/:id', controller.deleteConfig);

module.exports = router;
