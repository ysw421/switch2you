const express = require('express');
const path = require('path');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);


const Config = require('./server/config.json');
const Player = require('./server/Player.js');
const Room = require('./server/Room.js');


// 설정 불러오기
Player.MaxCount = Config.playerMaxNum;
Room.MaxCount = Config.roomMaxNum;


const port = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'test')));
http.listen(port, function (){
    console.log('listening on : http://localhost:' + port);
});


/**
 * Player객체 또는 배열을 받고, 공유에 필요한 데이터들만 뽑아 반환합니다.
 * @param {Player[]} players 
 * @returns 
 */
function getPlayerInfo(players) {
    const infoFilter = (player) => { return {'id': player.id, 'name': player.name, 'role': player.role} }
    if (Array.isArray(players))
        return players.map(infoFilter);
    else
        return infoFilter(players);
}

function getRoomInfo(rooms) {
    const infoFilter = (room) => {return {'id': room.id, 'name': room.name, 'ownerName': room.owner.name, 'passwordExist': room.password ? true : false, 'playerCount': room.players.length, 'playing': room.playing}}
    if (Array.isArray(rooms))
        return rooms.map(infoFilter);
    else
        return infoFilter(rooms);
}

function checkData(...args) {
    for (const element of args) {
        let ok = false;
        for (let i = 1; i < element.length; i++)
            if (element[i] === 'int') {
                if (Number.isInteger(element[0])) ok = true;
            } else if (element[i] === 'number' || element[i] === 'string' || element[i] === 'boolean') {
                if (typeof element[0] === element[i]) ok = true;
            } else
                if (element[0] === element[i]) ok = true;
        if (!ok) return false;
    };
    return true;
}


// 소켓 코드
io.on('connection', (socket) => {

    // Player(세션) 추가
    const player = new Player(); // 접속한 플레이어(세션) 마다 생성
    if (!player) { // 서버가 꽉찼다면
        io.to(socket.id).emit("server full");
        socket.disconnect();
    }
    player.socketId = socket.id;
    socket.emit('connected', player.id); // 연결 응답 신호 전송
    console.log('user connected: ', player.socketId, player.id);


    // Player 연결 끊김
    socket.on('disconnect', () => {
        const room = player.room;
        if (room){
            const result = player.leaveRoom();
            if (result !== 'no join room' && result) io.to(room.id).emit('owner change', room.owner.id);
            if (room.players.length > 0) io.to(room.id).emit('player leaved', player.id);
        }
        player.delete();
        socket.disconnect();
        console.log('user disconnected: ', player.socketId, player.id);
    });


    // 방 생성
    socket.on('create room', (playerName, roomName, public, password) => { // 1. 방 참가 이벤트가 들어오면
        if (!checkData([playerName, 'string'], [roomName, 'string'], [public, 'boolean'], [password, 'string', false])) {
            socket.emit('wrong data');
            return false;
        } else if (player.room) { // 2. 모든 조건을 확인 후 확정이 나면
            socket.emit('already join room');
            return false;
        }

        player.update(playerName); // 3. 입력한 (남에게 보여지는) 정보를 업데이트 + 실제 작업 진행
        const room = new Room(player, roomName, public, password);
        socket.join(room.id); // 4. room 관련 처리하고 소켓신호 보내기
        socket.emit('room joined', getRoomInfo(room), getPlayerInfo(player.room.players));
        console.log(Room.Instances);
    })


    // 방 참가
    socket.on('join room', (playerName, roomId, password) => {
        if (!checkData([playerName, 'string'], [roomId, 'int'], [roomId, 'roomId'])) {
            socket.emit('wrong data');
            return false;
        } else if (!Room.Instances[roomId]) {
            socket.emit('no room');
            return false;
        }

        const result = player.joinRoom(Room.Instances[roomId], password);
        if (result) {
            socket.emit(result);
            return false;
        }
        player.update(playerName);
        io.to(player.room.id).emit('player joined', getPlayerInfo(player));
        socket.join(player.room.id);
        socket.emit('room joined', getRoomInfo(player.room), getPlayerInfo(player.room.players));
        console.log(Room.Instances);
    })


    // 랜덤 방 매칭
    socket.on('join random room', (playerName) => {
        if (player.room) {
            socket.emit('already join room');
            return false;
        }

        // 공개 빈 방 탐색
        for (const room of Room.Instances) {
            if (!room.public || room.players.length > 8 || room.playing) continue; // 비공개거나, 꽉찾거나, 게임중이면 건너뛰기
            player.update(playerName);
            player.joinRoom(room);
            io.to(room.id).emit('player joined', getPlayerInfo(player));
            socket.join(room.id);
            socket.emit('room joined', getRoomInfo(player.room), getPlayerInfo(player.room.players));
            break;
        }

        // 없다면 방 생성
        if (!player.room) {
            player.update(playerName);
            const room = new Room(player);
            socket.join(room.id);
            socket.emit('room joined', getRoomInfo(player.room), getPlayerInfo(player.room.players));
        }
    })


    // 방 퇴장
    socket.on('leave room', () => {
        if (!player.room) {
            socket.emit('no join room');
            return false;
        }
        const room = player.room;
        const result = player.leaveRoom();
        if (result === 'no join room') {
            socket.emit('no join room');
            return false;
        }

        socket.emit('room leaved');
        socket.leave(room.id);
        if (result) io.to(room.id).emit('owner changed', room.owner.id); // 방장이 바뀌었다면
        if (room.players.length > 0) io.to(room.id).emit('player leaved', player.id);
    })


    // 방 목록
    socket.on('get room list', (page) => {
        if (player.room) {
            socket.emit('already join room');
            return false;
        }

        const showNum = 4; // test용. page당 보여지는 방의 개수
        const roomList = Object.values(Room.Publics);
        let maxIndex = page * 4;
        if (page * 4 > roomList.length) maxIndex = roomList.length;
        socket.emit('room list', Math.ceil(roomList.length / showNum), getRoomInfo(Object.values(Room.Publics).slice(page * 4 - 4, maxIndex)));
    })


    // 방장 이전. targetId는 방장이 이전될 플레이어의 id.
    socket.on('change owner', (targetId) => {
        const target = Player.Instances[targetId]; // target이 없는경우에도 no permission
        const result = player.giveOwner(target);
        if (result) {
            socket.emit(result);
            return false;
        }
        io.to(player.room.id).emit('owner changed', targetId);
    })


    // 강제 퇴장
    socket.on('forced leave room', (targetId) => {
        const target = Player.Instances[targetId]; // target이 없는경우에도 no permission
        if (player.role !== 'owner' || player.room !== target.room) socket.emit('no permission');
        target.leaveRoom();
        io.to(player.room.id).emit('player leaved', targetId);
    })


    /**
    

    socket.on('map change', function (value) {
        Room.MapId[PlayerRoomId] = (Room.MapId[PlayerRoomId] + value + MapData.typeCount) % MapData.typeCount;
        io.to(PlayerRoomId).emit('map change', Room.MapId[PlayerRoomId]);
    })

    // 여기서부터 인게임 코드
    socket.on('start game', function () {
        RoomMg.StartGame(PlayerRoomId);
        io.to(PlayerRoomId).emit('start game', Room.PlayerLiveStates[PlayerRoomId], Room.LiveCounts[PlayerRoomId], Room.PlayerXs[PlayerRoomId], Room.PlayerYs[PlayerRoomId], Room.PlayerSightRanges[PlayerRoomId], Room.TaggerIds[PlayerRoomId], Room.Map[PlayerRoomId]);
    })

    socket.on('client update', function (PlayerDx, PlayerDy, PlayerBoost) {
        if (Room.PlayerLiveStates[PlayerRoomId][PlayerRoomNum] === 0) {
            return;
        }
        Room.PlayerDxs[PlayerRoomId][PlayerRoomNum] += PlayerDx;
        Room.PlayerDys[PlayerRoomId][PlayerRoomNum] += PlayerDy;
        Room.PlayerBoosts[PlayerRoomId][PlayerRoomNum] = PlayerBoost;
    })

    socket.on('change challenge', function (TargetId) {
        io.to(PlayerRoomId).emit('change challenge', PlayerId, TargetId);
        Room.PlayerGameStats[PlayerRoomId][PlayerRoomNum][2] += 1;
        if (RoomMg.CheckTouch(PlayerId, Room.TaggerIds[PlayerRoomId], (TaggerChaRad + CharRad) * 1000)) {
            Room.TaggerIds[PlayerRoomId] = TargetId;
            Room.TaggerChangeTime[PlayerRoomId] = Date.now();
            io.to(PlayerRoomId).emit('change tagger', TargetId);
            Room.PlayerGameStats[PlayerRoomId][PlayerRoomNum][1] += 1;
        }
    })

    socket.on('emoji',function(what){
        io.to(PlayerRoomId).emit('emoji',PlayerId,what);
    })
    */

});