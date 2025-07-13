const SystemConfig = require('../models/SystemConfig');

exports.getAllConfigs = async (req, res) => {
  try {
    const configs = await SystemConfig.find();
    res.json(configs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};



exports.createConfig = async (req, res) => {
  const config = new SystemConfig(req.body);
  try {
    const newConfig = await config.save();
    res.status(201).json(newConfig);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const updatedConfig = await SystemConfig.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updatedConfig) return res.status(404).json({ message: 'Config not found' });
    res.json(updatedConfig);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.deleteConfig = async (req, res) => {
  try {
    const deletedConfig = await SystemConfig.findByIdAndDelete(req.params.id);
    if (!deletedConfig) return res.status(404).json({ message: 'Config not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};