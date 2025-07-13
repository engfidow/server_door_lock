const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { exec } = require('child_process');
const fs = require('fs');

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

// Check if running on Raspberry Pi
const isRaspberryPi = fs.existsSync('/proc/device-tree/model');

// Improved GPIO control with multiple fallbacks
async function controlGpio(pin, value) {
  return new Promise((resolve, reject) => {
    if (!isRaspberryPi) {
      console.log(`Simulating GPIO ${pin} set to ${value}`);
      resolve();
      return;
    }

    // Try gpio command first
    exec(`gpio -v`, (error) => {
      if (error) {
        // Fallback to Python if gpio command not found
        console.log('Using Python fallback for GPIO control');
        exec(`python3 -c "import RPi.GPIO as GPIO; GPIO.setmode(GPIO.BCM); GPIO.setup(${pin}, GPIO.OUT); GPIO.output(${pin}, ${value});"`, 
          (pyError) => {
            if (pyError) {
              reject(new Error(`GPIO control failed: ${pyError.message}`));
            } else {
              resolve();
            }
          }
        );
      } else {
        // Use gpio command if available
        exec(`gpio -g mode ${pin} out && gpio -g write ${pin} ${value}`, 
          (gpioError) => {
            if (gpioError) {
              reject(new Error(`GPIO command failed: ${gpioError.message}`));
            } else {
              resolve();
            }
          }
        );
      }
    });
  });
}

// HTTP API endpoints
app.get('/open', async (req, res) => {
  try {
    await controlGpio(RELAY_PIN, 1);
    isDoorLocked = false;
   
    io.emit('door_status', { locked: false, source: 'api' });

    res.json({ status: 'success', message: 'Door unlocked', locked: false });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: error.message,
      suggestion: 'Ensure GPIO tools are installed or running on Raspberry Pi'
    });
  }
});

app.get('/lock', async (req, res) => {
  try {
    await controlGpio(RELAY_PIN, 0);
    isDoorLocked = true;
    
    io.emit('door_status', { locked: false, source: 'api' });

    res.json({ status: 'success', message: 'Door locked', locked: true });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: error.message,
      suggestion: 'Ensure GPIO tools are installed or running on Raspberry Pi'
    });
  }
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  socket.emit('door_status', { locked: isDoorLocked, source: 'socket' });
  
  socket.on('ping', (cb) => cb());
  
  socket.on('unlock_door', async () => {
  try {
    await controlGpio(RELAY_PIN, 1);
    isDoorLocked = false;
    io.emit('door_status', { locked: false, source: 'flutter' }); // <- Fix here
  } catch (error) {
    socket.emit('operation_error', {
      operation: 'unlock',
      error: error.message
    });
  }
});

socket.on('lock_door', async () => {
  try {
    await controlGpio(RELAY_PIN, 0);
    isDoorLocked = true;
    io.emit('door_status', { locked: true, source: 'flutter' }); // <- Fix here
  } catch (error) {
    socket.emit('operation_error', {
      operation: 'lock',
      error: error.message
    });
  }
});

  
  socket.on('disconnect', (reason) => {
    console.log(`Client disconnected: ${socket.id} (${reason})`);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Raspberry Pi detected: ${isRaspberryPi}`);
});