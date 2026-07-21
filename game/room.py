"""Salas, jugadores y ruteo de mensajes.

Room hereda el motor de juego (GameLoop). Hub mantiene las salas por codigo y
despacha los mensajes que llegan por WebSocket.
"""

import asyncio
import random
import string

from . import items, protocol
from .engine import GameLoop

MAX_SEATS = 8


class Player:
    def __init__(self, seat, name, conn):
        self.seat = seat
        self.name = name
        self.conn = conn
        self.alive = True
        self.hp = items.START_HP
        self.coins = 0
        self.ready = False
        self.connected = True
        self.upgrades = {}
        self.private_hints = []


class Room(GameLoop):
    def __init__(self, code):
        self.code = code
        self.players = {}          # seat -> Player
        self.host_seat = None
        self.box = None
        self.phase = "LOBBY"
        self.round = 0
        self.box_size = 3
        self.corruption = 0
        self.current = None
        self.shop = None
        self.log = []
        self.winner_seat = None
        self.started = False
        self._decision = None
        self._mystery = 0
        self._pending_shuffle = False
        self._task = None

    # -- helpers -------------------------------------------------------------
    def _next_mystery(self):
        self._mystery += 1
        return self._mystery

    def add_log(self, text):
        self.log.append(text)
        if len(self.log) > 60:
            self.log = self.log[-60:]

    def free_seat(self):
        for s in range(1, MAX_SEATS + 1):
            if s not in self.players:
                return s
        return None

    def connected_count(self):
        return sum(1 for p in self.players.values() if p.connected)

    async def broadcast(self):
        tasks = []
        for p in self.players.values():
            if p.connected and p.conn and not p.conn.closed:
                tasks.append(p.conn.send(protocol.build_state(self, p)))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def broadcast_reveal(self, reveals):
        payload = [
            {"type": r["itemType"], "emoji": r["emoji"], "name": r["name"],
             "text": r["publicText"], "tone": r["tone"]}
            for r in reveals
        ]
        tasks = []
        for p in self.players.values():
            if p.connected and p.conn and not p.conn.closed:
                tasks.append(p.conn.send({"t": "reveal", "reveals": payload}))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        await self.broadcast()


class Hub:
    def __init__(self):
        self.rooms = {}  # code -> Room

    def _new_code(self):
        while True:
            code = "".join(random.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(4))
            if code not in self.rooms:
                return code

    def get_or_create(self, code):
        code = (code or "").strip().upper()
        if not code:
            code = self._new_code()
        room = self.rooms.get(code)
        if room is None:
            room = Room(code)
            self.rooms[code] = room
        return room

    # -- entrada de mensajes -------------------------------------------------
    async def on_message(self, conn, msg):
        t = msg.get("t")
        if t == "join":
            await self._join(conn, msg)
            return
        player = conn.player
        if player is None:
            await conn.send({"t": "error", "msg": "Unite a una sala primero."})
            return
        room = self._room_of(player)
        if room is None:
            return

        if t == "start":
            if room.host_seat == player.seat and not room.started and room.connected_count() >= 2:
                room.start_game()
            elif room.connected_count() < 2:
                await conn.send({"t": "error", "msg": "Hacen falta al menos 2 jugadores."})
        elif t == "action":
            room.submit_decision(player.seat, {
                "kind": msg.get("kind"),
                "targetSeat": msg.get("targetSeat"),
            })
        elif t == "buy":
            room.try_buy(player, msg.get("id"))
            await room.broadcast()
        elif t == "ready":
            room.set_ready(player, msg.get("value", True))
            await room.broadcast()
        elif t == "again":
            if room.host_seat == player.seat and not room.started:
                room.phase = "LOBBY"
                room.winner_seat = None
                room.round = 0
                room.corruption = 0
                room.log = []
                for p in room.players.values():
                    p.alive = True
                    p.hp = items.START_HP
                    p.coins = 0
                    p.upgrades = {}
                    p.private_hints = []
                    p.ready = False
                await room.broadcast()
        elif t == "chat":
            text = str(msg.get("msg", ""))[:120]
            if text:
                room.add_log(f"💬 {player.name}: {text}")
                await room.broadcast()

    async def _join(self, conn, msg):
        name = str(msg.get("name", "")).strip()[:16] or "Anónimo"
        room = self.get_or_create(msg.get("room"))

        # reconexion: mismo nombre, asiento marcado desconectado
        if room.started:
            for p in room.players.values():
                if not p.connected and p.name == name:
                    p.conn = conn
                    p.connected = True
                    conn.player = p
                    room.add_log(f"{p.name} volvió a la mesa.")
                    await conn.send({"t": "joined", "seat": p.seat, "code": room.code})
                    await room.broadcast()
                    return
            await conn.send({"t": "error", "msg": "La partida ya empezó en esa sala."})
            return

        seat = room.free_seat()
        if seat is None:
            await conn.send({"t": "error", "msg": "La sala está llena (8)."})
            return
        player = Player(seat, name, conn)
        room.players[seat] = player
        conn.player = player
        if room.host_seat is None:
            room.host_seat = seat
        room.add_log(f"{name} se sentó a la mesa.")
        await conn.send({"t": "joined", "seat": seat, "code": room.code})
        await room.broadcast()

    async def on_disconnect(self, conn):
        player = conn.player
        if player is None:
            return
        room = self._room_of(player)
        if room is None:
            return
        player.connected = False

        # si estaba decidiendo, apertura forzada
        room.submit_decision(player.seat, {"kind": "use", "auto": True, "disconnect": True})

        if not room.started:
            # en lobby: liberar el asiento
            room.players.pop(player.seat, None)
            room.add_log(f"{player.name} se fue.")
            if room.host_seat == player.seat:
                room.host_seat = min(room.players) if room.players else None
        else:
            room.add_log(f"{player.name} se desconectó.")

        if room.connected_count() == 0:
            if room._task:
                room._task.cancel()
            self.rooms.pop(room.code, None)
            return
        await room.broadcast()

    def _room_of(self, player):
        for room in self.rooms.values():
            if room.players.get(player.seat) is player:
                return room
        return None
