/*
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const PORT = process.env.PORT || 3000;

// handle data in a nice way
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// static path
const publicPath = path.resolve(`${__dirname}/public`);
const socketioPath = path.resolve(`${__dirname}/node_modules/socket.io-client/dist`);

// set your static server
app.use(express.static(publicPath));
app.use(express.static(socketioPath));

// views
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/index.html'));
});

// start listening
const server = app.listen(PORT);
console.log('Server is running localhost on port: ' + PORT);
*/

const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const https = require('https');
const PORT = process.env.PORT || 3000;

// handle data in a nice way
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// static path
const publicPath = path.resolve(`${__dirname}/public`);
const socketioPath = path.resolve(`${__dirname}/node_modules/socket.io-client/dist`);

// set your static server
app.use(express.static(publicPath));
app.use(express.static(socketioPath));

// views
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/index.html'));
});

// create https server
const key = fs.readFileSync(`${__dirname}/key.pem`);
const cert = fs.readFileSync(`${__dirname}/cert.pem`);
const server = https.createServer({key: key, cert: cert }, app);

// start listening
server.listen(PORT, () => { 
  console.log(`Server is running localhost on port: ${PORT}`) 
});

// socket.io
const io = require('socket.io')({
  // "transports": ["xhr-polling"],
  // "polling duration": 0
}).listen(server);

let clients = {};

// socket setup
io.on('connection', client => {
  console.log('User ' + client.id + ' connected, there are ' + io.engine.clientsCount + ' clients connected');

  // add a new client indexed by his id
  clients[client.id] = {
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 0]
  }

  // SENDERS (client.emit(): sending to sender-client only, io.sockets.emit(): send to all connected clients)

  // make sure to send clients, his ID, and a list of all keys
  client.emit('introduction', clients, client.id, Object.keys(clients));

  // send to all existing clients when a new user is connected
  io.sockets.emit('newUserConnected', clients[client.id], io.engine.clientsCount, client.id);

  client.on('move', (data) => {
    if (clients[client.id]) {
      clients[client.id].position = data[0];
      clients[client.id].quaternion = data[1];
    }
    client.emit('userMoves', clients); // send back to the sender
  });

  // handle the disconnection
  client.on('disconnect', () => {
    delete clients[client.id];
    io.sockets.emit('userDisconnected', client.id);
    console.log('User ' + client.id + ' diconnected, there are ' + io.engine.clientsCount + ' clients connected');
  });
});