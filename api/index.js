let app;
try {
    app = require('../backend/server.js');
} catch (e) {
    console.error("CRITICAL ERROR LOADING APP:", e);
    app = (req, res) => {
        res.status(500).json({ 
            error: 'Failed to load backend app', 
            message: e.message, 
            stack: e.stack 
        });
    };
}
module.exports = app;
