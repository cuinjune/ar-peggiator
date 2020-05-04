////////////////////////////////////////////////////////////////////////////////
// server
////////////////////////////////////////////////////////////////////////////////

const shouldUseHttps = true;
const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const data = JSON.parse(fs.readFileSync('db/data.json'));
const app = express();
const http = shouldUseHttps ? null : require('http');
const https = shouldUseHttps ? require('https') : null;
const PORT = process.env.PORT || 3000;
const { v4: uuidv4 } = require('uuid');

// handle data in a nice way
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// static path
const publicPath = path.resolve(`${__dirname}/public`);
const emscriptenPath = path.resolve(`${publicPath}/emscripten`);
const pdPath = path.resolve(`${emscriptenPath}/pd`);
const socketioPath = path.resolve(`${__dirname}/node_modules/socket.io-client/dist`);

// set your static server
app.use(express.static(publicPath));
app.use(express.static(emscriptenPath));
app.use(express.static(pdPath));
app.use(express.static(socketioPath));

// views
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/index.html'));
});

// create http/https server
const key = shouldUseHttps ? fs.readFileSync(`${__dirname}/key.pem`) : null;
const cert = shouldUseHttps ? fs.readFileSync(`${__dirname}/cert.pem`) : null;
const server = shouldUseHttps ? https.createServer({ key: key, cert: cert }, app) : http.createServer(app);

// start listening
server.listen(PORT, () => {
  console.log(`Server is running localhost on port: ${PORT}`)
});

////////////////////////////////////////////////////////////////////////////////
// http requests
////////////////////////////////////////////////////////////////////////////////

// get note data
app.get("/api/data/notes", async (req, res) => {
  res.json(data.notes);
});

// add a note to data
app.post("/api/data/notes", (req, res) => {
  data.notes.push({ id: uuidv4(), hue: req.body.hue, position: req.body.position });
  res.json(data.notes);
});

// edit the existing note
app.put("/api/data/notes/:id", (req, res) => {
  const index = data.notes.findIndex(note => note.id === req.params.id);
  if (index != -1) {
    data.notes[index] = { id: req.params.id, hue: req.body.hue, position: req.body.position };
  }
  res.json(data.notes);
});

// delete a note from data
app.delete("/api/data/notes/:id", (req, res) => {
  const index = data.notes.findIndex(note => note.id === req.params.id);
  if (index != -1) {
    data.notes.splice(index, 1);
  }
  res.json(data.notes);
});

////////////////////////////////////////////////////////////////////////////////
// socket.io
////////////////////////////////////////////////////////////////////////////////

const io = require('socket.io')({
  // "transports": ["xhr-polling"],
  // "polling duration": 0
}).listen(server);

// clients object
const clients = {};

// used for assigning different hue values to clients
const hueInterval = 0.108;
let hue = -hueInterval;

// socket setup
io.on('connection', client => {
  console.log('User ' + client.id + ' connected, there are ' + io.engine.clientsCount + ' clients connected');

  // add a new client indexed by his id
  clients[client.id] = {
    hue: (hue += hueInterval) % 1,
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 0]
  }

  ////////////////////////////////////////////////////////////////////////////////
  // senders (client.emit: send to sender client only, io.sockets.emit: send to all connected clients)
  ////////////////////////////////////////////////////////////////////////////////

  // make sure to send clients, his ID, and a list of all keys
  client.emit('introduction', clients, client.id, Object.keys(clients));

  // update everyone that the number of users has changed
  io.sockets.emit('newUserConnected', clients[client.id], io.engine.clientsCount, client.id);

  // send the hue value to myself
  client.emit('setHue', clients[client.id].hue);

  // send the current notes data to myself
  client.emit('updateNotes', data.notes);

  ////////////////////////////////////////////////////////////////////////////////
  // receivers 
  ////////////////////////////////////////////////////////////////////////////////

  client.on('playerMoved', (_data) => {
    if (clients[client.id]) {
      clients[client.id].position = _data[0];
      clients[client.id].quaternion = _data[1];
      client.emit('updateClientMoves', clients); // send back to the sender
    }
  });

  client.on('addNote', (_data) => {
    if (clients[client.id]) {
      const _id = uuidv4();
      const _position = _data;
      // apply hue gradation based on y position
      const _hue = clients[client.id].hue + _position[1] * hueInterval * 0.5;
      data.notes.push({ id: _id, hue: _hue, position: _position });
      
      // send the added note id to myself
      client.emit('addedNoteID', _id); // send back to the sender

      // update everyone that notes has been updated
      io.sockets.emit('updateNotes', data.notes);
    }
  });

  client.on('eraseNotes', (_data) => {
    if (clients[client.id]) {
      for (let i = 0; i < _data.length; i++) {
        const index = data.notes.map(function (note) { return note.id; }).indexOf(_data[i]);
        if (index != -1) {
          data.notes.splice(index, 1);
        }
      }
      // update everyone that notes has been updated
      io.sockets.emit('updateNotes', data.notes);
    }
  });

  // handle the disconnection
  client.on('disconnect', () => {
    delete clients[client.id];
    io.sockets.emit('userDisconnected', client.id);
    console.log('User ' + client.id + ' diconnected, there are ' + io.engine.clientsCount + ' clients connected');
  });
});

////////////////////////////////////////////////////////////////////////////////
// exit handler 
////////////////////////////////////////////////////////////////////////////////

// so the program will not close instantly
process.stdin.resume();

// do something before exit
function exitHandler(options, exitCode) {
  if (options.cleanup) {
    console.log("\nwriting 'db/data.json' file");
    fs.writeFileSync('db/data.json', JSON.stringify(data, null, 2));
  }
  if (options.exit) process.exit();
}

// do something when app is closing
process.on('exit', exitHandler.bind(null, { cleanup: true }));

// catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, { exit: true }));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, { exit: true }));
process.on('SIGUSR2', exitHandler.bind(null, { exit: true }));

// catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, { exit: true }));