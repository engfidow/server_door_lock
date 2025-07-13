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
const isRaspberryPi = fs.existsSync('/proc/device-tree/model');

async function controlGpio(pin, value) {
  return new Promise((resolve, reject) => {
    if (!isRaspberryPi) {
      console.log(`Simulating GPIO ${pin} = ${value}`);
      resolve();
      return;
    }

    exec(`gpio -v`, (error) => {
      if (error) {
        console.log('Using Python fallback');
        exec(`python3 -c "import RPi.GPIO as GPIO; GPIO.setmode(GPIO.BCM); GPIO.setup(${pin}, GPIO.OUT); GPIO.output(${pin}, ${value})"`,
          (pyError) => pyError ? reject(new Error(pyError.message)) : resolve()
        );
      } else {
        exec(`gpio -g mode ${pin} out && gpio -g write ${pin} ${value}`,
          (gpioError) => gpioError ? reject(new Error(gpioError.message)) : resolve()
        );
      }
    });
  });
}

app.get('/open', async (req, res) => {
  try {
    await controlGpio(RELAY_PIN, 1);
    isDoorLocked = false;
    io.emit('door_status', { locked: false, source: 'http' });
    res.json({ status: 'success', message: 'Door unlocked', locked: false });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/lock', async (req, res) => {
  try {
    await controlGpio(RELAY_PIN, 0);
    isDoorLocked = true;
    io.emit('door_status', { locked: true, source: 'http' });
    res.json({ status: 'success', message: 'Door locked', locked: true });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);
  socket.emit('door_status', { locked: isDoorLocked, source: 'server' });

  socket.on('unlock_door', async () => {
    try {
      await controlGpio(RELAY_PIN, 1);
      isDoorLocked = false;
      io.emit('door_status', { locked: false, source: socket.id });
    } catch (error) {
      socket.emit('operation_error', { operation: 'unlock', error: error.message });
    }
  });

  socket.on('lock_door', async () => {
    try {
      await controlGpio(RELAY_PIN, 0);
      isDoorLocked = true;
      io.emit('door_status', { locked: true, source: socket.id });
    } catch (error) {
      socket.emit('operation_error', { operation: 'lock', error: error.message });
    }
  });
});

server.listen(PORT, () => console.log(`Server running on ${PORT}`));
