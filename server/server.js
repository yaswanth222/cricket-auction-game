const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "..", "public")));

const rooms = new Map();

const PLAYERS = [
  ["Virat Kohli","🇮🇳","Batter","2012–Present"],
  ["Rohit Sharma","🇮🇳","Batter","2012–Present"],
  ["MS Dhoni","🇮🇳","WK-Batter","2012–2019"],
  ["Ravindra Jadeja","🇮🇳","All-rounder","2012–Present"],
  ["Hardik Pandya","🇮🇳","All-rounder","2016–Present"],
  ["Jasprit Bumrah","🇮🇳","Bowler","2016–Present"],
  ["Suryakumar Yadav","🇮🇳","Batter","2012–Present"],
  ["KL Rahul","🇮🇳","WK-Batter","2014–Present"],
  ["Rishabh Pant","🇮🇳","WK-Batter","2018–Present"],
  ["Shikhar Dhawan","🇮🇳","Batter","2012–2023"],
  ["Yuzvendra Chahal","🇮🇳","Bowler","2016–Present"],
  ["Mohammed Shami","🇮🇳","Bowler","2012–Present"],
  ["Faf du Plessis","🇿🇦","Batter","2012–Present"],
  ["AB de Villiers","🇿🇦","WK-Batter","2012–2018"],
  ["Quinton de Kock","🇿🇦","WK-Batter","2012–Present"],
  ["Dale Steyn","🇿🇦","Bowler","2012–2019"],
  ["Kagiso Rabada","🇿🇦","Bowler","2015–Present"],
  ["David Warner","🇦🇺","Batter","2012–2024"],
  ["Steve Smith","🇦🇺","Batter","2012–Present"],
  ["Glenn Maxwell","🇦🇺","All-rounder","2012–Present"],
  ["Mitchell Starc","🇦🇺","Bowler","2012–Present"],
  ["Pat Cummins","🇦🇺","Bowler","2012–Present"],
  ["Jos Buttler","🏴","WK-Batter","2012–Present"],
  ["Joe Root","🏴","Batter","2012–Present"],
  ["Ben Stokes","🏴","All-rounder","2012–Present"],
  ["Jofra Archer","🏴","Bowler","2019–Present"],
  ["Jonny Bairstow","🏴","WK-Batter","2012–Present"],
  ["Kane Williamson","🇳🇿","Batter","2012–Present"],
  ["Trent Boult","🇳🇿","Bowler","2012–Present"],
  ["Brendon McCullum","🇳🇿","WK-Batter","2012–2019"],
  ["Lasith Malinga","🇱🇰","Bowler","2012–2020"],
  ["Angelo Mathews","🇱🇰","All-rounder","2012–Present"],
  ["Mahela Jayawardene","🇱🇰","Batter","2012–2015"],
  ["Rashid Khan","🇦🇫","Bowler","2015–Present"],
  ["Mohammad Nabi","🇦🇫","All-rounder","2012–Present"],
  ["Andre Russell","🇯🇲","All-rounder","2012–Present"],
  ["Chris Gayle","🇯🇲","Batter","2012–2022"],
  ["Sunil Narine","🇹🇹","Bowler","2012–Present"],
  ["Kieron Pollard","🇹🇹","All-rounder","2012–2022"]
];

// User requested no Pakistan/Bangladesh, so filter them out.
const ELIGIBLE = PLAYERS.filter(p => !["🇵🇰","🇧🇩"].includes(p[1]));
const MAX_SQUAD = 10;
const isWK = p => /WK-Batter/i.test(p[2]);

function code() {
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s="";
  do { s=""; for(let i=0;i<5;i++) s+=chars[Math.floor(Math.random()*chars.length)]; }
  while(rooms.has(s));
  return s;
}
function shuffled10() {
  const a=[...ELIGIBLE];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a.slice(0,30);
}
function publicState(r){
  return {
    room:r.code, phase:r.phase, playersConnected:r.players.length,
    current:r.current, round:r.round, bid:r.bid, bidder:r.bidder,
    budgets:r.budgets, squads:r.squads, sold:r.sold, skipped:r.skipped,
    message:r.message, winner:r.winner
  };
}
function emitRoom(r){ io.to(r.code).emit("state", publicState(r)); }

io.on("connection", socket => {
  socket.on("createRoom", (_, cb) => {
    const c=code();
    const r={code:c,phase:"lobby",players:[],host:null,current:null,round:0,bid:0,bidder:null,
      budgets:{1:20,2:20},squads:{1:[],2:[]},sold:[],skipped:[],playersPool:shuffled10(),
      message:"Waiting for Player 2.",winner:null};
    rooms.set(c,r);
    r.players.push({id:socket.id,num:1});
    r.host=socket.id; socket.join(c); socket.data.room=c; socket.data.num=1;
    cb({ok:true,room:c,num:1}); emitRoom(r);
  });

  socket.on("joinRoom",(raw,cb)=>{
    const c=String(raw||"").trim().toUpperCase();
    const r=rooms.get(c);
    if(!r) return cb({ok:false,error:"Room not found."});
    if(r.players.length>=2) return cb({ok:false,error:"Room is full."});
    r.players.push({id:socket.id,num:2}); socket.join(c); socket.data.room=c; socket.data.num=2;
    cb({ok:true,room:c,num:2}); r.message="Both players connected. Host can start.";
    emitRoom(r);
  });

  socket.on("start",()=>{
    const r=rooms.get(socket.data.room);
    if(!r || socket.id!==r.host || r.players.length!==2 || r.phase!=="lobby") return;
    r.phase="auction"; r.round=1; r.current=r.playersPool[0]; r.bid=0; r.bidder=null;
    r.message="Player 1 or Player 2 may bid. Base price ₹1.";
    emitRoom(r);
  });

  socket.on("bid",()=>{
    const r=rooms.get(socket.data.room), n=socket.data.num;
    if(!r || r.phase!=="auction" || !r.current) return;
    const next=r.bid===0?1:r.bid+0.5;
    if(r.bidder===n) return;
    if(r.squads[n].length>=MAX_SQUAD) return socket.emit("errorMsg","Your squad already has 10 players.");
    if(next>r.budgets[n]) return socket.emit("errorMsg","You cannot afford that bid.");
    r.bid=Math.round(next*2)/2; r.bidder=n;
    r.message=`Player ${n} bids ₹${r.bid}.`;
    emitRoom(r);
  });

  socket.on("skip",()=>{
    const r=rooms.get(socket.data.room);
    if(!r || r.phase!=="auction") return;
    r.skipped.push({round:r.round,player:r.current});
    r.message=`${r.current[0]} skipped.`;
    advance(r);
  });

  socket.on("sell",()=>{
    const r=rooms.get(socket.data.room);
    if(!r || r.phase!=="auction" || !r.bidder) return;
    const n=r.bidder, price=r.bid;
    if(price>r.budgets[n]) return;
    if(r.squads[n].length>=MAX_SQUAD) return socket.emit("errorMsg","Your squad already has 10 players.");
    r.budgets[n]-=price;
    r.squads[n].push({player:r.current,price});
    r.sold.push({round:r.round,player:r.current,to:n,price});
    r.message=`SOLD: ${r.current[0]} to Player ${n} for ₹${price}.`;
    advance(r);
  });

  socket.on("reset",()=>{
    const r=rooms.get(socket.data.room);
    if(!r || socket.id!==r.host) return;
    r.phase="lobby"; r.round=0; r.current=null; r.bid=0; r.bidder=null;
    r.budgets={1:20,2:20}; r.squads={1:[],2:[]}; r.sold=[]; r.skipped=[]; r.playersPool=shuffled10(); r.winner=null;
    r.message="New auction ready.";
    emitRoom(r);
  });

  socket.on("disconnect",()=>{
    const c=socket.data.room, r=rooms.get(c);
    if(!r) return;
    r.players=r.players.filter(x=>x.id!==socket.id);
    if(r.players.length===0) rooms.delete(c);
    else { r.message="A player disconnected."; emitRoom(r); }
  });
});

function advance(r){
  if(r.round>=30){
    const missingWK=[1,2].filter(n=>!r.squads[n].some(x=>isWK(x.player)));
    if(missingWK.length){
      r.phase="auction";
      r.current=null;
      r.bid=0; r.bidder=null;
      r.message=`Auction complete, but Player ${missingWK.join(" and Player ")} must still have a wicketkeeper. Use the remaining budget to acquire a WK if one is offered.`;
      emitRoom(r); return;
    }
    r.phase="match_ready"; r.current=null;
    r.message="Auction complete. Both squads have a wicketkeeper. Each squad may contain up to 10 players.";
    emitRoom(r); return;
  }
  r.round++; r.current=r.playersPool[r.round-1]; r.bid=0; r.bidder=null;
  r.message=`Player ${r.round} of 30. Base price ₹1.`;
  emitRoom(r);
}

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`Cricket Auction running on port ${PORT}`));
