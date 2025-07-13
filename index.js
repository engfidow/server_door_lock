const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 5001;

// GPIO setup (simulated for non-RPi environments)
let RELAY_PIN = 17;
let isDoorLocked = true;

// Middleware
app.use(express.json());

// HTTP API endpoints
app.get('/open', (req, res) => {
    unlockDoor();
    res.json({ status: 'success', message: 'Door unlocked' });
});

app.get('/lock', (req, res) => {
    lockDoor();
    res.json({ status: 'success', message: 'Door locked' });
});

// Socket.io connection
io.on('connection', (socket) => {
    console.log('New client connected');
    
    // Send current status when client connects
    socket.emit('door_status', { locked: isDoorLocked });
    
    socket.on('unlock_door', () => {
        unlockDoor();
    });
    
    socket.on('lock_door', () => {
        lockDoor();
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

function unlockDoor() {
    if (isDoorLocked) {
        console.log('Unlocking door...');
        isDoorLocked = false;
        
        // For Raspberry Pi
        try {
            exec(`gpio -g mode ${RELAY_PIN} out`);
            exec(`gpio -g write ${RELAY_PIN} 1`);
            console.log('GPIO command sent to unlock door');
        } catch (error) {
            console.error('GPIO error:', error);
        }
        
        // Notify all clients
        io.emit('door_status', { locked: false });
    }
}

function lockDoor() {
    if (!isDoorLocked) {
        console.log('Locking door...');
        isDoorLocked = true;
        
        // For Raspberry Pi
        try {
            exec(`gpio -g write ${RELAY_PIN} 0`);
            console.log('GPIO command sent to lock door');
        } catch (error) {
            console.error('GPIO error:', error);
        }
        
        // Notify all clients
        io.emit('door_status', { locked: true });
    }
}

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});