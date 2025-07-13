const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 5000;

// GPIO setup (simulated for non-RPi environments)
let RELAY_PIN = 17;
let isDoorLocked = true;

// Middleware
app.use(express.json());

// HTTP API endpoint
app.get('/open', (req, res) => {
    unlockDoor();
    res.json({ status: 'success', message: 'Door unlocked' });
});

// Socket.io connection
io.on('connection', (socket) => {
    console.log('New client connected');
    
    socket.on('unlock_door', () => {
        unlockDoor();
        socket.emit('door_status', { locked: false });
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

function unlockDoor() {
    console.log('Unlocking door...');
    isDoorLocked = false;
    
    // For Raspberry Pi
    try {
        exec(`gpio -g mode ${RELAY_PIN} out`);
        exec(`gpio -g write ${RELAY_PIN} 1`);
        console.log('GPIO command sent to unlock door');
        
        // Lock door after 5 seconds
        setTimeout(() => {
            exec(`gpio -g write ${RELAY_PIN} 0`);
            isDoorLocked = true;
            console.log('Door automatically locked after 5 seconds');
            io.emit('door_status', { locked: true });
        }, 5000);
    } catch (error) {
        console.error('GPIO error:', error);
        // Simulate behavior if not on Raspberry Pi
        setTimeout(() => {
            isDoorLocked = true;
            io.emit('door_status', { locked: true });
        }, 5000);
    }
}

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});