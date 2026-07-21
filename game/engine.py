"""Motor de ronda: maquina de estados async (mixin usado por Room).

Fases: LOBBY -> DEAL -> CHOOSE -> RESOLVE -> (repite por objeto) -> PAYOUT -> SHOP
-> (escala) -> ... -> GAMEOVER.
"""

import asyncio
import os
import time

from . import ai_box, items


def _envf(name, default):
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


# Tiempos (segundos). Se pueden acortar por env para testear el loop rapido.
CHOOSE_SECS = _envf("BB_CHOOSE_SECS", 12.0)
RESOLVE_PAUSE = _envf("BB_RESOLVE_PAUSE", 3.0)
DEAL_PAUSE = _envf("BB_DEAL_PAUSE", 2.2)
SHOP_SECS = _envf("BB_SHOP_SECS", 22.0)

SHOP_OFFERS = [
    {"id": "peek",    "emoji": "👁", "name": "Ojo",   "cost": 12,
     "desc": "Token: ves el TIPO de un objeto que no sostenés."},
    {"id": "magnet",  "emoji": "🧲", "name": "Imán",  "cost": 15,
     "desc": "Ahora: robás 6 🪙 al que más tiene."},
    {"id": "trash",   "emoji": "🗑", "name": "Tacho", "cost": 10,
     "desc": "Token: como sostenedor, tirás el objeto sin abrirlo."},
    {"id": "reorder", "emoji": "🔄", "name": "Girar", "cost": 8,
     "desc": "Token: como sostenedor, sacudís y re-mezclás la caja."},
    {"id": "dup",     "emoji": "💀", "name": "Doble", "cost": 18,
     "desc": "Token: tu próxima apertura cuenta DOBLE (bueno o malo)."},
]
_OFFER_BY_ID = {o["id"]: o for o in SHOP_OFFERS}


# --------------------------------------------------------------------------- #
# Contexto de resolucion (lo consumen los resolvers de items.py)
# --------------------------------------------------------------------------- #
class ResolveCtx:
    def __init__(self, room, user, last_item_type, next_item_type):
        self.room = room
        self.user = user
        self.rng = room.box.rng
        self.bias = room.box.bias()
        self.last_item_type = last_item_type
        self.next_item_type = next_item_type

    def _alive_others(self):
        return [p for p in self.room.players.values() if p.alive and p.seat != self.user.seat]

    def random_other(self):
        others = self._alive_others()
        return self.rng.choice(others) if others else None

    def random_item_type(self):
        return self.room.box.random_item_type(self.room.round)

    def hint_about(self, player):
        tmpl = self.rng.choice(ai_box.HINT_TEMPLATES)
        who = f"Jugador {player.seat} ({player.name})"
        # el 'mas rico' se calcula de verdad
        richest = max(self.room.players.values(), key=lambda p: p.coins)
        if "{coins}" in tmpl and "más monedas" in tmpl:
            who = f"Jugador {richest.seat} ({richest.name})"
            player = richest
        return tmpl.format(p=who, hp=player.hp, coins=player.coins)

    def phone_line(self):
        tmpl = self.rng.choice(ai_box.PHONE_TEMPLATES)
        other = self.random_other()
        who = f"el Jugador {other.seat}" if other else "alguien"
        return tmpl.format(p=who)


# --------------------------------------------------------------------------- #
# Mixin con la logica de juego (Room hereda de esto)
# --------------------------------------------------------------------------- #
class GameLoop:
    # helpers que Room provee: self.players, self.box, self.broadcast(), self.add_log(),
    # self.current, self.phase, self.round, self.box_size, self.corruption, self.shop,
    # self.winner_seat, self.started, self._decision, self._pending_shuffle, self._next_mystery()

    # -- helpers -------------------------------------------------------------
    def alive_players(self):
        return [p for p in self.players.values() if p.alive]

    def alive_seats(self):
        return sorted(p.seat for p in self.players.values() if p.alive)

    def connected_alive(self):
        return [p for p in self.players.values() if p.alive and p.connected]

    async def sleep(self, secs):
        await asyncio.sleep(secs)

    # -- arranque ------------------------------------------------------------
    def start_game(self, seed=None):
        self.box = ai_box.BoxAI(seed)
        self.started = True
        self.round = 0
        self.corruption = 0
        self.winner_seat = None
        self.log = []
        for p in self.players.values():
            p.alive = True
            p.hp = items.START_HP
            p.coins = 0
            p.ready = False
            p.upgrades = {}
            p.private_hints = []
        self.add_log("La caja negra zumba. Se abre la ranura...")
        self._task = asyncio.create_task(self.run_game())

    async def run_game(self):
        try:
            while True:
                if len(self.alive_players()) <= 1:
                    break
                await self.play_round()
                if len(self.alive_players()) <= 1:
                    break
            await self.finish_game()
        except asyncio.CancelledError:
            pass
        except Exception:  # noqa
            import traceback
            traceback.print_exc()
            await self.finish_game()

    # -- una ronda -----------------------------------------------------------
    async def play_round(self):
        self.round += 1
        self.box_size = min(8, 3 + self.round)
        self.corruption += 1
        count = min(6, 1 + self.round)

        items_list = self.box.generate_round(self.round, count)
        if self._pending_shuffle:
            self.box.rng.shuffle(items_list)
            self._pending_shuffle = False

        self.phase = "DEAL"
        self.current = None
        self.shop = None
        self.add_log(f"— Ronda {self.round} — la caja escupe {count} objeto(s).")
        await self.broadcast()
        await self.sleep(DEAL_PAUSE)

        start_seats = self.alive_seats()
        start_idx = (self.round - 1) % max(1, len(start_seats))

        i = 0
        while i < len(items_list):
            if len(self.alive_players()) <= 1:
                break
            alive = self.alive_seats()
            first = alive[(start_idx + i) % len(alive)]
            last_type = items_list[i - 1] if i > 0 else None
            next_type = items_list[i + 1] if i + 1 < len(items_list) else None
            await self.run_item(first, items_list[i], last_type, next_type,
                                remaining=len(items_list) - i)
            if self._pending_shuffle:
                rest = items_list[i + 1:]
                self.box.rng.shuffle(rest)
                items_list[i + 1:] = rest
                self._pending_shuffle = False
            i += 1

        if len(self.alive_players()) > 1:
            await self.payout()
            await self.shop_phase()

    # -- un objeto (hot potato) ---------------------------------------------
    async def run_item(self, first_seat, item_type, last_type, next_type, remaining):
        holder_seat = first_seat
        self.current = {
            "holder_seat": holder_seat,
            "item_type": item_type,           # SECRETO: nunca sale en la vista publica
            "pushes_left": max(1, len(self.alive_seats()) - 1),
            "timer_end": time.time() + CHOOSE_SECS,
            "items_left": remaining,
            "mystery_id": self._next_mystery(),
            "revealed_to": set(),
        }
        self.phase = "CHOOSE"
        self._apply_peeks()
        await self.broadcast()

        while True:
            holder = self.players[holder_seat]
            if not holder.connected or not holder.alive:
                break  # abandono/muerte -> apertura forzada
            self.current["holder_seat"] = holder_seat
            self.current["timer_end"] = time.time() + CHOOSE_SECS
            await self.broadcast()

            action = await self.wait_decision(holder_seat, CHOOSE_SECS)
            kind = action.get("kind")

            if kind == "pushTo" and self.current["pushes_left"] > 0:
                tgt = action.get("targetSeat")
                tp = self.players.get(tgt)
                if tp and tp.alive and tp.connected and tgt != holder_seat:
                    self.box.record(holder_seat, "pushTo")
                    self.add_log(f"{holder.name} le empujó el objeto a {tp.name}.")
                    holder_seat = tgt
                    self.current["pushes_left"] -= 1
                    continue
                continue  # push invalido: seguir esperando

            if kind == "trash" and holder.upgrades.get("trash", 0) > 0:
                holder.upgrades["trash"] -= 1
                self.box.record(holder_seat, "use")
                self.add_log(f"🗑 {holder.name} tiró el objeto sin abrirlo.")
                self.current = None
                self.phase = "RESOLVE"
                await self.broadcast()
                await self.sleep(1.2)
                return

            if kind == "reorder" and holder.upgrades.get("reorder", 0) > 0:
                holder.upgrades["reorder"] -= 1
                self._pending_shuffle = True
                self.add_log(f"🔄 {holder.name} sacudió la caja.")
                continue

            # use / timeout / desconexion
            self.box.record(holder_seat, "use")
            break

        self.phase = "RESOLVE"
        holder = self.players[holder_seat]
        await self.broadcast()
        reveals = self.resolve_and_apply(holder, item_type, last_type, next_type)
        self.current = None
        await self.broadcast_reveal(reveals)
        await self.sleep(RESOLVE_PAUSE)

    async def wait_decision(self, seat, secs):
        loop = asyncio.get_event_loop()
        fut = loop.create_future()
        self._decision = {"seat": seat, "future": fut}
        try:
            return await asyncio.wait_for(fut, timeout=secs)
        except asyncio.TimeoutError:
            return {"kind": "use", "auto": True}
        finally:
            self._decision = None

    def submit_decision(self, seat, action):
        d = self._decision
        if d and d["seat"] == seat and not d["future"].done():
            d["future"].set_result(action)

    # -- peeks (👁) ----------------------------------------------------------
    def _apply_peeks(self):
        if not self.current:
            return
        holder = self.current["holder_seat"]
        for p in self.players.values():
            if p.seat == holder or not p.alive or not p.connected:
                continue
            if p.upgrades.get("peek", 0) > 0 and p.seat not in self.current["revealed_to"]:
                p.upgrades["peek"] -= 1
                self.current["revealed_to"].add(p.seat)

    # -- resolucion de efectos ----------------------------------------------
    def resolve_and_apply(self, holder, item_type, last_type, next_type, depth=0):
        ctx = ResolveCtx(self, holder, last_type, next_type)
        res = items.resolve(item_type, ctx)

        if depth == 0 and holder.upgrades.get("dup", 0) > 0:
            holder.upgrades["dup"] -= 1
            res["hpDelta"] = {s: d * 2 for s, d in res["hpDelta"].items()}
            res["coinDelta"] = {s: d * 2 for s, d in res["coinDelta"].items()}
            res["publicText"] += "  (💀 DOBLE)"

        self.apply_result(res)
        reveals = [res]
        if res.get("shuffle"):
            self._pending_shuffle = True
        spawn = res.get("spawn")
        if spawn and depth < 2:
            reveals += self.resolve_and_apply(holder, spawn, item_type, next_type, depth + 1)
        return reveals

    def apply_result(self, res):
        for seat, d in res["hpDelta"].items():
            p = self.players.get(seat)
            if not p or not p.alive:
                continue
            p.hp = max(0, min(items.MAX_HP, p.hp + d))
            if p.hp <= 0:
                p.alive = False
                self.add_log(f"☠ {p.name} quedó fuera.")
        for seat, d in res["coinDelta"].items():
            p = self.players.get(seat)
            if p:
                p.coins = max(0, p.coins + d)
        for seat, hint in res["privateHints"].items():
            p = self.players.get(seat)
            if p:
                p.private_hints.append(hint)
        for seat, line in res["phone"].items():
            p = self.players.get(seat)
            if p and p.conn:
                asyncio.create_task(p.conn.send({"t": "phone", "line": line}))
                p.private_hints.append("☎️ " + line)
        self.add_log(res["publicText"])

    # -- payout / shop / fin -------------------------------------------------
    async def payout(self):
        self.phase = "PAYOUT"
        amount = 3 + self.round
        for p in self.alive_players():
            p.coins += amount
        self.add_log(f"Sobrevivientes: +{amount} 🪙 cada uno.")
        await self.broadcast()
        await self.sleep(RESOLVE_PAUSE)

    async def shop_phase(self):
        self.phase = "SHOP"
        for p in self.players.values():
            p.ready = False
        self.shop = {"offers": SHOP_OFFERS, "timer_end": time.time() + SHOP_SECS, "ready": set()}
        await self.broadcast()
        end = self.shop["timer_end"]
        while time.time() < end:
            ca = self.connected_alive()
            if ca and all(p.ready for p in ca):
                break
            await self.sleep(0.5)
            await self.broadcast()
        self.shop = None
        for p in self.players.values():
            p.ready = False

    def try_buy(self, player, offer_id):
        if self.phase != "SHOP" or not self.shop:
            return
        offer = _OFFER_BY_ID.get(offer_id)
        if not offer or player.coins < offer["cost"] or not player.alive:
            return
        player.coins -= offer["cost"]
        if offer_id == "magnet":
            others = [p for p in self.players.values()
                      if p.seat != player.seat and p.alive]
            if others:
                rich = max(others, key=lambda p: p.coins)
                steal = min(6, rich.coins)
                rich.coins -= steal
                player.coins += steal
                self.add_log(f"🧲 {player.name} le robó {steal} 🪙 a {rich.name}.")
        else:
            player.upgrades[offer_id] = player.upgrades.get(offer_id, 0) + 1
            self.add_log(f"{player.name} compró {offer['name']} {offer['emoji']}.")

    def set_ready(self, player, val):
        if self.phase == "SHOP" and self.shop is not None:
            player.ready = bool(val)
            if val:
                self.shop["ready"].add(player.seat)
            else:
                self.shop["ready"].discard(player.seat)

    async def finish_game(self):
        alive = self.alive_players()
        if len(alive) == 1:
            self.winner_seat = alive[0].seat
        elif self.players:
            self.winner_seat = max(self.players.values(), key=lambda p: p.coins).seat
        else:
            self.winner_seat = None
        self.phase = "GAMEOVER"
        self.current = None
        self.shop = None
        self.started = False
        if self.winner_seat is not None:
            self.add_log(f"🏆 Gana {self.players[self.winner_seat].name}.")
        await self.broadcast()
