const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = process.env.PORT || 5001;
let isDoorLocked = true;
const RELAY_PIN = 17;

// Improved GPIO control
function gpioWrite(pin, value) {
  return new Promise((resolve, reject) => {
    exec(`gpio -g mode ${pin} out && gpio -g write ${pin} ${value}`, 
      (error, stdout, stderr) => {
        if (error) {
          console.error(`GPIO error: ${error.message}`);
          reject(error);
        } else {
          resolve();
        }
      }
    );
  });
}

// HTTP API endpoints
app.get('/open', async (req, res) => {
  try {
    await unlockDoor();
    res.json({ status: 'success', message: 'Door unlocked', locked: false });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/lock', async (req, res) => {
  try {
    await lockDoor();
    res.json({ status: 'success', message: 'Door locked', locked: true });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Socket.io connection with enhanced stability
io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);
  
  // Send current status
  socket.emit('door_status', { locked: isDoorLocked });
  
  // Heartbeat monitoring
  socket.on('ping', (cb) => cb());
  
  socket.on('unlock_door', async () => {
    try {
      await unlockDoor();
    } catch (error) {
      console.error('Unlock error:', error);
    }
  });
  
  socket.on('lock_door', async () => {
    try {
      await lockDoor();
    } catch (error) {
      console.error('Lock error:', error);
    }
  });
  
  socket.on('disconnect', (reason) => {
    console.log(`Client disconnected: ${socket.id} (${reason})`);
  });
});

async function unlockDoor() {
  if (isDoorLocked) {
    console.log('Unlocking door...');
    try {
      await gpioWrite(RELAY_PIN, 1);
      isDoorLocked = false;
      console.log('Door unlocked');
      io.emit('door_status', { locked: false });
    } catch (error) {
      console.error('Unlock failed:', error);
      throw error;
    }
  }
}

async function lockDoor() {
  if (!isDoorLocked) {
    console.log('Locking door...');
    try {
      await gpioWrite(RELAY_PIN, 0);
      isDoorLocked = true;
      console.log('Door locked');
      io.emit('door_status', { locked: true });
    } catch (error) {
      console.error('Lock failed:', error);
      throw error;
    }
  }
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});