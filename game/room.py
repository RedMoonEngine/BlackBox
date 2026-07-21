"""Salas, jugadores y ruteo de mensajes (v2 casino roguelike)."""

import asyncio
import random

from . import items, protocol
from .engine import GameLoop

MAX_SEATS = 8


BOT_NAMES = ["Rojo", "Vera", "Cuervo", "Nix", "Sombra", "Gato", "Toro", "Lupe"]


class Player:
    def __init__(self, seat, name, conn, is_bot=False):
        self.seat = seat
        self.name = name
        self.conn = conn          # None en los bots
        self.is_bot = is_bot
        self.alive = True
        self.hp = items.START_HP
        self.chips = 20
        self.bet = 0
        self.ready = False
        self.connected = True
        self.inventory = []       # [{uid, type}]
        self.relics = []          # [relic_id]
        self.private_hints = []
        # transitorios
        self.whisky = 0
        self.shield = False
        self.slot_done = False
        self._rerolled = False


class Room(GameLoop):
    def __init__(self, code):
        self.code = code
        self.players = {}
        self.host_seat = None
        self.box = None
        self.phase = "LOBBY"
        self.round = 0
        self.pot = 0
        self.bet_cap = 10
        self.activity = None
        self.last_activity = None
        self.double_active = False
        self.current = None
        self.slots = None
        self.roulette = None
        self.market = None
        self.event = None
        self.log = []
        self.winner_seat = None
        self.started = False
        self._decision = None
        self._obj_uid = 0
        self._task = None

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

    def human_count(self):
        """Jugadores reales conectados (los bots tienen conn=None)."""
        return sum(1 for p in self.players.values() if p.connected and p.conn is not None)

    def add_bot(self):
        seat = self.free_seat()
        if seat is None or self.started:
            return
        used = {p.name for p in self.players.values()}
        name = next((f"🤖 {n}" for n in BOT_NAMES if f"🤖 {n}" not in used), f"🤖 Bot{seat}")
        self.players[seat] = Player(seat, name, None, is_bot=True)

    def remove_bot(self):
        for seat in sorted(self.players, reverse=True):
            if getattr(self.players[seat], "is_bot", False):
                self.players.pop(seat)
                return

    async def broadcast(self):
        tasks = [p.conn.send(protocol.build_state(self, p))
                 for p in self.players.values() if p.connected and p.conn and not p.conn.closed]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def broadcast_reveal(self, reveals):
        payload = [{"emoji": r.get("emoji", "❓"), "name": r.get("name", ""),
                    "text": r["publicText"], "tone": r["tone"]} for r in reveals]
        tasks = [p.conn.send({"t": "reveal", "reveals": payload})
                 for p in self.players.values() if p.connected and p.conn and not p.conn.closed]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        await self.broadcast()


class Hub:
    def __init__(self):
        self.rooms = {}

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

    async def on_message(self, conn, msg):
        t = msg.get("t")
        if t == "join":
            await self._join(conn, msg)
            return
        player = conn.player
        if player is None:
            return
        room = self._room_of(player)
        if room is None:
            return

        if t == "start":
            if room.host_seat == player.seat and not room.started and room.connected_count() >= 2:
                room.start_game()
            elif room.connected_count() < 2:
                await conn.send({"t": "error", "msg": "Hacen falta al menos 2 jugadores (podés agregar bots)."})
        elif t == "addbot":
            if room.host_seat == player.seat and not room.started:
                room.add_bot()
                await room.broadcast()
        elif t == "removebot":
            if room.host_seat == player.seat and not room.started:
                room.remove_bot()
                await room.broadcast()
        elif t == "bet":
            room.set_bet(player, msg.get("amount", 0))
            await room.broadcast()
        elif t == "ready":
            room.set_ready(player, msg.get("value", True))
            await room.broadcast()
        elif t == "action":
            room.submit_decision(player.seat, {
                "kind": msg.get("kind"), "targetSeat": msg.get("targetSeat")})
        elif t == "spin":
            room.slot_spin(player)
        elif t == "use":
            room.use_inventory(player, msg.get("uid"), msg.get("target"))
        elif t == "buy":
            room.market_buy(player, msg.get("id"))
            await room.broadcast()
        elif t == "bid":
            room.event_bid(player, msg.get("amount", 0))
            await room.broadcast()
        elif t == "again":
            if room.host_seat == player.seat and not room.started:
                self._reset_room(room)
                await room.broadcast()
        elif t == "chat":
            text = str(msg.get("msg", ""))[:120]
            if text:
                room.add_log(f"💬 {player.name}: {text}")
                await room.broadcast()

    def _reset_room(self, room):
        room.phase = "LOBBY"
        room.winner_seat = None
        room.round = 0
        room.pot = 0
        room.activity = None
        room.last_activity = None
        room.log = []
        for p in room.players.values():
            p.alive = True
            p.hp = items.START_HP
            p.chips = 20
            p.bet = 0
            p.inventory = []
            p.relics = []
            p.private_hints = []
            p.ready = False
            p.whisky = 0
            p.shield = False

    async def _join(self, conn, msg):
        name = str(msg.get("name", "")).strip()[:16] or "Anónimo"
        room = self.get_or_create(msg.get("room"))
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
            await conn.send({"t": "error", "msg": "La sala está llena."})
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
        room.submit_decision(player.seat, {"kind": "stop"})
        if not room.started:
            room.players.pop(player.seat, None)
            room.add_log(f"{player.name} se fue.")
            if room.host_seat == player.seat:
                room.host_seat = min(room.players) if room.players else None
        else:
            room.add_log(f"{player.name} se desconectó.")
        # la sala se cierra cuando no queda ningún HUMANO (los bots no cuentan)
        if room.human_count() == 0:
            if room._task:
                room._task.cancel()
            if getattr(room, "_bot_task", None):
                room._bot_task.cancel()
            self.rooms.pop(room.code, None)
            return
        await room.broadcast()

    def _room_of(self, player):
        for room in self.rooms.values():
            if room.players.get(player.seat) is player:
                return room
        return None
