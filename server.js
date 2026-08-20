const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ፋይሎቹ ያሉበትን ፎልደር በግልጽ ማሳየት
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let users = {};
let activeTickets = [];
let drawnNumbers = [];
let totalPlayersCount = 4325;
let timer = 60;

// የኬኖ ሰዓት ቆጣሪ እና ኳስ ማውጣት
setInterval(() => {
  timer--;
  if (timer <= 0) {
    timer = 60;
    drawnNumbers = [];
    activeTickets = [];
    io.emit('gameReset');
  } else if (timer <= 50 && drawnNumbers.length < 20) {
    let available = [];
    for (let i = 1; i <= 80; i++) {
      if (!drawnNumbers.includes(i)) available.push(i);
    }
    if (available.length > 0) {
      let randNum = available[Math.floor(Math.random() * available.length)];
      drawnNumbers.push(randNum);

      activeTickets.forEach(t => {
        if (t.numbers.includes(randNum)) {
          t.hitsCount = (t.hitsCount || 0) + 1;
        }
      });

      io.emit('newDrawnNumber', { number: randNum, drawnList: drawnNumbers });
      io.emit('updateActiveTickets', activeTickets);
    }
  }
  io.emit('timerUpdate', timer);
}, 1000);

io.on('connection', (socket) => {
  console.log('ተጠቃሚ ተገናኝቷል:', socket.id);

  socket.on('registerUser', (userData) => {
    if (!users[userData.id]) {
      users[userData.id] = {
        id: userData.id,
        name: userData.first_name,
        balance: 100.00
      };
      totalPlayersCount++;
    }

    socket.user_id = userData.id;
    socket.emit('userData', {
      user: users[userData.id],
      drawnNumbers: drawnNumbers,
      activeTickets: activeTickets,
      totalPlayersCount: totalPlayersCount
    });

    io.emit('updateLiveStats', { totalPlayersCount: totalPlayersCount });
  });

  socket.on('buyTicket', (data) => {
    let user = users[data.userId];
    if (!user) return socket.emit('errorMsg', 'ተጠቃሚው አልተገኘም!');
    if (user.balance < data.bet) return socket.emit('errorMsg', 'የሂሳብ ሚዛን በቂ አይደለም!');

    user.balance -= data.bet;
    socket.emit('balanceUpdated', user.balance);

    let newTicket = {
      id: Math.random().toString(36).substring(2, 9),
      userId: data.userId,
      userName: user.name,
      numbers: data.numbers,
      bet: data.bet,
      maxWin: data.maxWin,
      hitsCount: 0
    };

    activeTickets.push(newTicket);
    socket.emit('ticketBoughtSuccess');
    io.emit('updateActiveTickets', activeTickets);
  });

  socket.on('bingo_winner', (data) => {
    let user = users[data.userId];
    if (user) {
      user.balance += data.winAmount;
      io.to(socket.id).emit('balanceUpdated', user.balance);
      socket.emit('infoMsg', `እንኳን ደስ አሎት! የ ${data.winAmount} ETB ቢንጎ አሸናፊ ሆነዋል!`);
    }
  });

  socket.on('verifyAndDeposit', (data) => {
    let user = users[data.userId];
    if (user) {
      user.balance += data.amount;
      socket.emit('balanceUpdated', user.balance);
      socket.emit('infoMsg', `ሂሳብዎ በ ${data.amount} ETB ተሞልቷል!`);
    }
  });

  socket.on('requestWithdraw', (data) => {
    let user = users[data.userId];
    if (user && user.balance >= data.amount) {
      user.balance -= data.amount;
      socket.emit('balanceUpdated', user.balance);
      socket.emit('infoMsg', `የ ${data.amount} ETB ወጪ ጥያቄዎ ተቀባይነት አግኝቷል!`);
    } else {
      socket.emit('errorMsg', 'በቂ ባላንስ የለዎትም!');
    }
  });

  socket.on('disconnect', () => {
    console.log('ተጠቃሚ ወጥቷል:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ሰርቨሩ በፖርት ${PORT} እየሰራ ነው...`);
});
