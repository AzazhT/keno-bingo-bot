const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// የውሂብ ማከማቻዎች
const registeredUsers = {};      
let bingoTakenNumbers = {};     
let bingoDrawnNumbers = [];      
let bingoTimer = 30;             

const activeKenoTickets = [];    
let kenoDrawnNumbers = [];       
let kenoTimer = 60;              

// --- የቢንጎ ቆጣሪ ---
setInterval(() => {
  bingoTimer--;
  if (bingoTimer <= 0) {
    bingoTimer = 30;
    bingoTakenNumbers = {}; 
    bingoDrawnNumbers = [];
    io.emit('bingoGameReset');
  }

  let nextNum;
  do {
    nextNum = Math.floor(Math.random() * 75) + 1;
  } while (bingoDrawnNumbers.includes(nextNum));

  bingoDrawnNumbers.push(nextNum);
  io.emit('bingoNewNumberCall', { number: nextNum, drawnList: bingoDrawnNumbers, timer: bingoTimer });
}, 1000);

// --- የኬኖ ቆጣሪ ---
setInterval(() => {
  kenoTimer--;
  if (kenoTimer <= 0) {
    kenoTimer = 60;
    kenoDrawnNumbers = [];
    activeKenoTickets.length = 0;
    io.emit('kenoGameReset');
  }
  io.emit('kenoTimerUpdate', kenoTimer);
}, 1000);

io.on('connection', (socket) => {
  console.log('ተጫዋች ተገናኝቷል:', socket.id);

  socket.on('registerUser', (userData) => {
    if (!userData || !userData.id) return;
    const tgId = String(userData.id);

    if (!registeredUsers[tgId]) {
      registeredUsers[tgId] = {
        id: tgId,
        name: userData.first_name || "ተጫዋች",
        balance: userData.balance || 100.00,
        socketId: socket.id
      };
    } else {
      registeredUsers[tgId].socketId = socket.id;
      if (userData.balance) {
        registeredUsers[tgId].balance = userData.balance;
      }
    }

    socket.emit('userData', {
      user: registeredUsers[tgId],
      bingoTakenNumbers: bingoTakenNumbers,
      bingoDrawnNumbers: bingoDrawnNumbers,
      kenoDrawnNumbers: kenoDrawnNumbers,
      activeKenoTickets: activeKenoTickets
    });
  });

  socket.on('selectBingoNumber', (data) => {
    const { tgId, number } = data;
    const user = registeredUsers[String(tgId)];

    if (!user) return socket.emit('errorMsg', 'እባክዎ መጀመሪያ ይመዝገቡ!');
    if (bingoTakenNumbers[number]) return socket.emit('errorMsg', 'ይህ ቁጥር ቀድሞ ተይዟል!');

    bingoTakenNumbers[number] = String(tgId);

    io.emit('bingoNumberTaken', {
      number: number,
      tgId: String(tgId),
      userName: user.name,
      takenNumbersMap: bingoTakenNumbers
    });
  });

  socket.on('buyTicket', (data) => {
    const user = registeredUsers[String(data.userId)];
    if (!user) return socket.emit('errorMsg', 'ተጠቃሚው አልተገኘም!');

    if (user.balance < data.bet) {
      return socket.emit('errorMsg', 'ባላንስዎ በቂ አይደለም!');
    }

    user.balance -= data.bet;
    socket.emit('balanceUpdated', user.balance);

    const newTicket = {
      userId: user.id,
      userName: user.name,
      numbers: data.numbers,
      bet: data.bet,
      maxWin: data.maxWin,
      hitsCount: 0
    };

    activeKenoTickets.push(newTicket);
    socket.emit('ticketBoughtSuccess');
    io.emit('updateActiveKenoTickets', activeKenoTickets);
  });

  socket.on('disconnect', () => {
    console.log('ተጫዋች ወጥቷል:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
