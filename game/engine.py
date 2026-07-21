"""Motor v2 (mixin de Room): la ronda es una RULETA de actividades.

Loop: LOBBY -> [ BET -> SPIN -> <ACTIVIDAD> -> PAYOUT -> CASINO ] * -> GAMEOVER
Actividades: OBJETOS, SLOTS, ROULETTE, EVENT, MARKET.
"""

import asyncio
import os
import time

from . import ai_box, items, relics


def _envf(name, default):
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


# Timers largos: que nadie sienta que lo apuran (se pueden bajar por env var).
BET_SECS = _envf("BB_BET_SECS", 45.0)
SPIN_SECS = _envf("BB_SPIN_SECS", 3.2)
CHOOSE_SECS = _envf("BB_CHOOSE_SECS", 90.0)
ROULETTE_SECS = _envf("BB_ROULETTE_SECS", 60.0)
SLOTS_SECS = _envf("BB_SLOTS_SECS", 60.0)
EVENT_SECS = _envf("BB_EVENT_SECS", 4.0)
MARKET_SECS = _envf("BB_MARKET_SECS", 90.0)
PAYOUT_PAUSE = _envf("BB_RESOLVE_PAUSE", 2.6)
CASINO_SECS = _envf("BB_CASINO_SECS", 2.2)
ROUND_CAP = int(_envf("BB_ROUND_CAP", 16))


class ResolveCtx:
    def __init__(self, room, user):
        self.room = room
        self.user = user
        self.rng = room.box.rng
        self.menace = room.box.menace

    def player(self, seat):
        return self.room.players.get(seat)

    def alive_others(self):
        return [p for p in self.room.players.values() if p.alive and p.seat != self.user.seat]

    def has_relic(self, player, rid):
        return relics.has(player, rid)

    def phone_line(self):
        t = self.rng.choice(ai_box.PHONE_TEMPLATES)
        o = self.rng.choice(self.alive_others()) if self.alive_others() else None
        return t.format(p=f"el Jugador {o.seat}" if o else "alguien")

    def hint_about(self, player):
        t = self.rng.choice(ai_box.HINT_TEMPLATES)
        rich = max(self.room.players.values(), key=lambda p: p.chips)
        if "más fichas" in t:
            player = rich
        return t.format(p=f"Jugador {player.seat} ({player.name})", hp=player.hp, chips=player.chips)


class GameLoop:
    # ------------- helpers -------------
    def alive_players(self):
        return [p for p in self.players.values() if p.alive]

    def alive_seats(self):
        return sorted(p.seat for p in self.players.values() if p.alive)

    def connected_alive(self):
        return [p for p in self.players.values() if p.alive and p.connected]

    async def sleep(self, s):
        await asyncio.sleep(s)

    def _ctx(self, user):
        return ResolveCtx(self, user)

    # ------------- arranque -------------
    def start_game(self, seed=None):
        self.box = ai_box.BoxAI(seed)
        self.started = True
        self.round_cap = ROUND_CAP
        self.round = 0
        self.pot = 0
        self.activity = None
        self.winner_seat = None
        self.log = []
        self.last_activity = None
        self.double_active = False
        for p in self.players.values():
            p.alive = True
            p.hp = items.START_HP
            p.chips = 20
            p.bet = 0
            p.ready = False
            p.inventory = []
            p.relics = []
            p.private_hints = []
            p.whisky = 0
        self.add_log("La BlackBox zumba. La CRT se enciende...")
        self._task = asyncio.create_task(self.run_game())
        self._bot_task = asyncio.create_task(self.run_bots())

    async def run_game(self):
        try:
            while len(self.alive_players()) > 1 and self.round < ROUND_CAP:
                await self.play_round()
            await self.finish_game()
        except asyncio.CancelledError:
            pass
        except Exception:  # noqa
            import traceback
            traceback.print_exc()
            await self.finish_game()

    # ------------- una ronda -------------
    async def play_round(self):
        self.round += 1
        self.box.tick_menace()
        # ingreso pasivo de reliquias
        for p in self.alive_players():
            inc = relics.round_income(p)
            if inc:
                p.chips += inc

        await self.bet_phase()
        await self.spin_phase()

        act = self.activity
        if act == "OBJETOS":
            await self.activity_objetos()
        elif act == "SLOTS":
            await self.activity_slots()
        elif act == "ROULETTE":
            await self.activity_roulette()
        elif act == "EVENT":
            await self.activity_event()
        elif act == "MARKET":
            await self.activity_market()

        await self.casino_flash()

    # ------------- BET -------------
    async def bet_phase(self):
        self.phase = "BET"
        self.activity = None
        self.pot = 0
        for p in self.players.values():
            p.bet = 0
            p.ready = False
        cap = 10 + self.round * 2
        self.bet_cap = cap
        self.bet_end = time.time() + BET_SECS
        await self.broadcast()
        end = self.bet_end
        while time.time() < end:
            ca = self.connected_alive()
            if ca and all(p.ready for p in ca):
                break
            await self.sleep(0.4)
            await self.broadcast()
        # cobrar antes al pozo
        for p in self.alive_players():
            b = max(0, min(p.bet, p.chips, cap))
            p.chips -= b
            self.pot += b
            p.ready = False
        if self.pot:
            self.add_log(f"Pozo de la ronda: {self.pot} fichas.")

    def set_bet(self, player, amount):
        if self.phase == "BET" and player.alive:
            try:
                player.bet = max(0, min(int(amount), self.bet_cap, player.chips))
            except (TypeError, ValueError):
                pass

    def set_ready(self, player, val):
        if self.phase in ("BET", "MARKET"):
            player.ready = bool(val)

    # ------------- SPIN -------------
    async def spin_phase(self):
        self.phase = "SPIN"
        self.activity = self.box.pick_activity(self.round, self.last_activity)
        self.last_activity = self.activity
        emo, label = ai_box.ACT_META[self.activity]
        self.add_log(f"La ruleta gira... y cae en {emo} {label}.")
        await self.broadcast()
        await self.sleep(SPIN_SECS)

    # ------------- OBJETOS -------------
    async def activity_objetos(self):
        count = min(5, 2 + self.round)
        objs = self.box.spawn_objects(self.round, count)
        start = self.alive_seats()
        base = (self.round - 1) % max(1, len(start))
        for i, otype in enumerate(objs):
            if len(self.alive_players()) <= 1:
                break
            alive = self.alive_seats()
            holder_seat = alive[(base + i) % len(alive)]
            await self._run_object(holder_seat, otype, len(objs) - i)
        self.settle_pot()
        await self.broadcast()
        await self.sleep(PAYOUT_PAUSE)

    def settle_pot(self):
        """Reparte el pozo restante entre los sobrevivientes (recompensa por sobrevivir)."""
        surv = self.alive_players()
        if self.pot and surv:
            share = self.pot // len(surv)
            if self.double_active:
                share *= 2
                self.double_active = False
            if share:
                for p in surv:
                    p.chips += share
                self.add_log(f"Pozo repartido: +{share} fichas a cada sobreviviente.")
        self.pot = 0

    async def _run_object(self, holder_seat, otype, left):
        danger = items.is_danger(otype)
        self.phase = "OBJETOS"
        self.current = {
            "holder_seat": holder_seat,
            "otype": otype,
            "danger": danger,
            "pushes_left": max(1, len(self.alive_seats()) - 1),
            "timer_end": time.time() + CHOOSE_SECS,
            "items_left": left,
        }
        await self.broadcast()
        while True:
            holder = self.players[holder_seat]
            if not holder.connected or not holder.alive:
                break
            self.current["holder_seat"] = holder_seat
            self.current["timer_end"] = time.time() + CHOOSE_SECS
            self._doll_watch(holder_seat)
            await self.broadcast()
            action = await self.wait_decision(holder_seat, CHOOSE_SECS)
            kind = action.get("kind")
            if kind == "pushTo" and self.current["pushes_left"] > 0:
                tp = self.players.get(action.get("targetSeat"))
                if tp and tp.alive and tp.connected and tp.seat != holder_seat:
                    self.box.record("pushTo")
                    # objeto CERRADO: el log NO revela qué era (blind)
                    self.add_log(f"{holder.name} le pasó el objeto cerrado a {tp.name}.")
                    holder_seat = tp.seat
                    self.current["pushes_left"] -= 1
                    continue
                continue
            # abrir / timeout -> se resuelve en la cara del que lo tiene
            self.box.record("open")
            break
        self.phase = "OBJETOS"
        holder = self.players[holder_seat]
        res = items.resolve_open(otype, self._ctx(holder))
        self.current = None
        self.apply_result(res)
        await self.broadcast_reveal([res])
        await self.sleep(PAYOUT_PAUSE * 0.7)

    async def wait_decision(self, seat, secs):
        loop = asyncio.get_event_loop()
        fut = loop.create_future()
        self._decision = {"seat": seat, "future": fut}
        try:
            return await asyncio.wait_for(fut, timeout=secs)
        except asyncio.TimeoutError:
            return {"kind": "timeout"}
        finally:
            self._decision = None

    def submit_decision(self, seat, action):
        d = self._decision
        if d and d["seat"] == seat and not d["future"].done():
            d["future"].set_result(action)

    # ------------- BOTS (jugadores controlados por el server, para probar) -------------
    async def run_bots(self):
        """Loop paralelo que hace jugar a los bots en cada fase."""
        self._bot_pending_key = None
        self._bot_pending_at = 0.0
        try:
            while self.started:
                await self.sleep(0.5)
                if any(getattr(p, "is_bot", False) for p in self.players.values()):
                    self._bots_act()
                    await self.broadcast()
        except asyncio.CancelledError:
            pass
        except Exception:  # noqa
            import traceback
            traceback.print_exc()

    def _bots_act(self):
        rng = self.box.rng if self.box else None
        if rng is None:
            return
        now = time.time()
        bots = [p for p in self.players.values() if getattr(p, "is_bot", False) and p.alive]
        if not bots:
            return
        phase = self.phase

        if phase == "BET":
            for b in bots:
                if not b.ready:
                    self.set_bet(b, rng.randint(0, min(self.bet_cap, b.chips)))
                    b.ready = True
        elif phase == "MARKET":
            for b in bots:
                if not b.ready:
                    if self.market and rng.random() < 0.55:
                        opts = [o for o in self.market["stock"]
                                if o["cost"] <= b.chips and o["id"] not in self.market["sold"]]
                        if opts:
                            # preferir reliquias si hay presupuesto
                            relics_opts = [o for o in opts if o["kind"] == "relic"]
                            if relics_opts and b.chips >= min(o["cost"] for o in relics_opts):
                                o = rng.choice(relics_opts)
                            else:
                                o = rng.choice(opts)
                            self.market_buy(b, f"{o['kind']}:{o['id']}")
                    b.ready = True
        elif phase == "SLOTS":
            for b in bots:
                if not getattr(b, "slot_done", False):
                    self._do_spin(b)
        elif phase == "EVENT" and self.event and self.event.get("id") == "auction":
            for b in bots:
                if b.seat not in self.event.get("bids", {}) and rng.random() < 0.55:
                    self.event_bid(b, rng.randint(1, max(1, min(15, b.chips))))

        # decisión puntual pedida a un asiento concreto (OBJETOS / ROULETTE)
        d = self._decision
        if d and not d["future"].done():
            b = self.players.get(d["seat"])
            if b and getattr(b, "is_bot", False):
                key = (d["seat"], id(d["future"]))
                if self._bot_pending_key != key:
                    self._bot_pending_key = key
                    self._bot_pending_at = now + rng.uniform(0.8, 1.9)  # "pensar"
                elif now >= self._bot_pending_at:
                    self.submit_decision(d["seat"], self._bot_decide(b, rng))

    def _bot_decide(self, bot, rng):
        if self.phase == "ROULETTE" and self.roulette:
            chambers = self.roulette.get("chambers", 6)
            reward = self.roulette.get("reward", 0)
            # probabilidad de plantarse: más miedo a menos recámaras
            stop_prob = 0.32 + (6 - chambers) * 0.09
            # si el premio es muy alto, los bots se la juegan más
            if reward > 100:
                stop_prob -= 0.12
            elif reward > 60:
                stop_prob -= 0.06
            # si el bot tiene whisky, se la juega más (tiene salvoconducto)
            if getattr(bot, "whisky", 0) > 0:
                stop_prob -= 0.15
            # si al bot le queda 1 HP, huye
            if bot.hp <= 1:
                stop_prob += 0.15
            stop_prob = max(0.05, min(0.95, stop_prob))
            if rng.random() < stop_prob:
                return {"kind": "stop"}
            return {"kind": "pull"}
        if self.phase == "OBJETOS" and self.current:
            # los bots también juegan A CIEGAS: no saben si es trampa o premio.
            # Deciden por miedo: más casino despierto o menos vida -> más pasan.
            pushes = self.current.get("pushes_left", 0)
            others = [s for s in self.alive_seats() if s != bot.seat]
            fear = 0.26 + self.box.menace * 0.03 + (0.22 if bot.hp <= 1 else 0.0)
            if pushes > 0 and others and rng.random() < min(0.7, fear):
                return {"kind": "pushTo", "targetSeat": rng.choice(others)}
            return {"kind": "open"}
        return {"kind": "stop"}

    # ------------- SLOTS -------------
    async def activity_slots(self):
        self.phase = "SLOTS"
        self.slots = {"results": {}, "timer_end": time.time() + SLOTS_SECS}
        for p in self.players.values():
            p.slot_done = False
        await self.broadcast()
        end = self.slots["timer_end"]
        while time.time() < end:
            ca = self.connected_alive()
            if ca and all(p.slot_done for p in ca):
                break
            await self.sleep(0.3)
        # auto-girar a los que no giraron
        for p in self.alive_players():
            if not p.slot_done:
                self._do_spin(p)
        self.settle_pot()
        await self.broadcast()
        await self.sleep(PAYOUT_PAUSE)
        self.slots = None

    def slot_spin(self, player):
        if self.phase == "SLOTS" and player.alive and not getattr(player, "slot_done", False):
            self._do_spin(player)
            asyncio.create_task(self.broadcast())

    def _do_spin(self, player):
        player.slot_done = True
        reels = self.box.spin_reels()
        res = self._eval_slots(player, reels)
        # Mano del Tahúr: un reroll si salió mal
        if res["tone"] == "bad" and relics.has_reroll(player) and not getattr(player, "_rerolled", False):
            player._rerolled = True
            reels = self.box.spin_reels()
            res = self._eval_slots(player, reels)
            res["publicText"] = "🤞 " + res["publicText"]
        self.slots["results"][player.seat] = {"reels": reels, "tone": res["tone"],
                                              "text": res["publicText"]}
        self.apply_result(res)

    def _eval_slots(self, player, reels):
        nm = player.name
        s = player.seat
        c = {reels.count(x): x for x in set(reels)}
        rng = self.box.rng
        if 3 in [reels.count(x) for x in set(reels)]:
            sym = reels[0]
            if sym == "🎰":
                n = self.round * 8 + 30
                if self.double_active:
                    n *= 2; self.double_active = False
                return items.result(f"🎰🎰🎰 ¡JACKPOT de {nm}! +{n} fichas", "good",
                                    chipDelta={s: n}, emoji="🎰", name="Jackpot")
            if sym == "💀":
                return items.result(f"💀💀💀 {nm} despertó al casino. −2 ❤", "bad",
                                    hpDelta={s: -2}, menace=2, emoji="💀", name="Calaveras")
            if sym == "👁":
                rid = rng.choice(relics.RELIC_IDS)
                m = relics.meta(rid)
                self._give_relic(player, rid)
                return items.result(f"👁👁👁 {nm} ganó una reliquia: {m['name']} {m['emoji']}",
                                    "good", emoji="👁", name="Reliquia")
            if sym == "📦":
                g = rng.choice(items.LOOT_POOL)
                return items.result(f"📦📦📦 {nm} ganó {items.name(g)} {items.emoji(g)}", "good",
                                    give={s: g}, emoji="📦", name="Objeto")
            n = rng.randint(18, 30)
            return items.result(f"{sym}{sym}{sym} {nm} +{n} fichas", "good",
                                chipDelta={s: n}, emoji=sym, name="Trío")
        # dos iguales
        pair = next((x for x in set(reels) if reels.count(x) == 2), None)
        if pair == "💀":
            return items.result(f"{''.join(reels)} {nm} rozó la muerte. −1 ❤", "bad",
                                hpDelta={s: -1}, emoji="💀", name="Dos calaveras")
        if pair == "📦":
            g = rng.choice(items.LOOT_POOL)
            return items.result(f"{''.join(reels)} {nm} sacó {items.name(g)} {items.emoji(g)}",
                                "good", give={s: g}, emoji="📦", name="Objeto")
        if pair:
            n = rng.randint(8, 15)
            return items.result(f"{''.join(reels)} {nm} +{n} fichas", "good", chipDelta={s: n},
                                emoji=pair, name="Par")
        if "👁" in reels:
            return items.result(f"{''.join(reels)} {nm} sintió que algo lo mira.", "weird",
                                menace=1, emoji="👁", name="Ojo")
        return items.result(f"{''.join(reels)} {nm} no ganó nada.", "weird", emoji="🎰", name="Nada")

    # ------------- ROULETTE -------------
    async def activity_roulette(self):
        self.phase = "ROULETTE"
        chambers = 6
        brave = self.pot + self.round * 5
        self.pot = 0
        active = [p.seat for p in self.alive_players()]
        stopped, pulled = set(), set()
        self.roulette = {"holder_seat": None, "chambers": chambers, "reward": brave,
                         "timer_end": 0, "in": list(active)}
        order = list(active)
        idx = 0
        guard = 0
        while guard < len(order) * 3:
            guard += 1
            live = [s for s in order if s in [p.seat for p in self.alive_players()]
                    and s not in stopped]
            if not live:
                break
            seat = live[idx % len(live)]
            holder = self.players[seat]
            if not holder.connected:
                stopped.add(seat); idx += 1; continue
            self.roulette.update({"holder_seat": seat, "chambers": chambers,
                                 "reward": brave, "timer_end": time.time() + ROULETTE_SECS})
            self._doll_watch(seat)
            await self.broadcast()
            action = await self.wait_decision(seat, ROULETTE_SECS)
            kind = action.get("kind")
            if kind == "pull":
                self.box.record("pull")
                hit = self.box.rng.random() < (1.0 / chambers)
                if hit and (getattr(holder, "whisky", 0) > 0 or relics.has_reroll(holder)):
                    # whisky/tahúr salva del disparo
                    if getattr(holder, "whisky", 0) > 0:
                        holder.whisky -= 1
                    self.add_log(f"🥃 {holder.name} tenía la mano firme. Clic... y sobrevivió.")
                    hit = False
                if hit:
                    holder.alive = False
                    holder.hp = 0
                    self.add_log(f"🔫💥 {holder.name} apretó el gatillo. BANG.")
                    await self.broadcast_reveal([items.result(
                        f"🔫 {holder.name} no sobrevivió a la ruleta.", "bad", emoji="🔫", name="Ruleta")])
                    break
                else:
                    brave += 8
                    pulled.add(seat)
                    chambers = max(2, chambers - 1)
                    self.add_log(f"🔫 {holder.name} apretó... clic. Sigue vivo. (+premio)")
                    await self.broadcast()
            else:  # stop / timeout
                self.box.record("stop")
                stopped.add(seat)
                self.add_log(f"{holder.name} se plantó.")
            idx += 1
        winners = [self.players[s] for s in pulled if self.players[s].alive]
        if winners:
            share = brave // len(winners)
            for w in winners:
                w.chips += share
            self.add_log(f"Valientes de la ruleta: +{share} fichas.")
        elif brave and self.alive_players():
            share = brave // len(self.alive_players())
            for p in self.alive_players():
                p.chips += share
            self.add_log(f"Ruleta terminó. +{share} fichas devueltas a los sobrevivientes.")
        self.roulette = None
        await self.broadcast()
        await self.sleep(PAYOUT_PAUSE)

    # ------------- EVENT -------------
    async def activity_event(self):
        self.phase = "EVENT"
        ev = self.box.pick_event()
        self.event = {"id": ev, "timer_end": time.time() + EVENT_SECS}
        rng = self.box.rng
        await self.broadcast()

        # eventos secretos con su propio flujo
        if ev == "owner":
            await self.owner_event(); self.settle_pot(); self.event = None; return
        if ev == "auction":
            await self.auction_event(); self.settle_pot(); self.event = None; return

        await self.sleep(0.8)   # deja ver el ícono del evento en la CRT

        if ev == "tax":
            lines = []
            for p in self.alive_players():
                loss = int(p.chips * 0.25)
                p.chips -= loss
                if loss:
                    lines.append(f"{p.name} −{loss}")
            txt = "💸 IMPUESTOS: la BlackBox se queda con el 25% de las fichas."
            if lines:
                txt += " " + ", ".join(lines) + "."
            res = items.result(txt, "bad", emoji="💸", name="Impuestos")
        elif ev == "chip_rain":
            for p in self.alive_players():
                p.chips += rng.randint(8, 16)
            res = items.result("🎁 LLUVIA DE FICHAS: caen fichas del cielo para todos.", "good",
                               emoji="🎁", name="Lluvia de Fichas")
        elif ev == "bombing":
            n = rng.randint(2, 4)
            self.box.pending_bombs += n
            self.box.bump_menace(1)
            res = items.result(f"💣 BOMBARDEO: la BlackBox carga {n} bombas de más para el próximo tablero.",
                               "bad", emoji="💣", name="Bombardeo")
        elif ev == "chaos":
            parts = []
            for p in self.alive_players():
                roll = rng.randint(1, 6)
                if roll == 1:
                    p.hp = max(0, p.hp - 1)
                    if p.hp <= 0:
                        p.alive = False
                        self.add_log(f"☠ {p.name} quedó fuera.")
                    parts.append(f"{p.name}🎲{roll} −1❤")
                elif roll == 2:
                    loss = min(p.chips, rng.randint(4, 10)); p.chips -= loss
                    parts.append(f"{p.name}🎲{roll} −{loss}")
                elif roll == 3:
                    g = rng.randint(6, 12); p.chips += g
                    parts.append(f"{p.name}🎲{roll} +{g}")
                elif roll == 4:
                    p.hp = min(items.MAX_HP, p.hp + 1)
                    parts.append(f"{p.name}🎲{roll} +1❤")
                elif roll == 5:
                    it = rng.choice(items.LOOT_POOL); self._give(p, it)
                    parts.append(f"{p.name}🎲{roll} {items.emoji(it)}")
                else:
                    parts.append(f"{p.name}🎲{roll} —")
            res = items.result("🎲 CAOS: todos tiran el dado. " + " · ".join(parts), "weird",
                               emoji="🎲", name="Caos")
        elif ev == "sabotage":
            alive = self.alive_players()
            pool = []
            for p in alive:
                pool.extend(p.inventory); p.inventory = []
            rng.shuffle(pool)
            i = 0
            for obj in pool:
                for _ in range(len(alive)):
                    p = alive[i % len(alive)]; i += 1
                    if len(p.inventory) < items.INVENTORY_CAP:
                        p.inventory.append(obj); break
            res = items.result("🧨 SABOTAJE: los objetos ocultos cambiaron de dueño.", "weird",
                               emoji="🧨", name="Sabotaje")
        elif ev == "swap_inv":
            moved = self._pass_one_object()
            res = items.result("🎭 INTERCAMBIO: cada uno le pasó un objeto al de al lado."
                               if moved else "🎭 INTERCAMBIO: nadie tenía objetos para pasar.",
                               "weird", emoji="🎭", name="Intercambio")
        elif ev == "jackpot":
            self.double_active = True
            res = items.result("🎰 JACKPOT: la próxima recompensa de la BlackBox vale DOBLE.",
                               "good", emoji="🎰", name="Jackpot")
        else:
            res = items.result("📼 El casino parpadea... y nada.", "weird", emoji="📼", name="Evento")

        self.add_log(res["publicText"])
        self.settle_pot()
        await self.broadcast_reveal([res])
        await self.sleep(PAYOUT_PAUSE)
        self.event = None

    def _pass_one_object(self):
        """Cada jugador vivo le pasa UN objeto al azar al siguiente."""
        rng = self.box.rng
        alive = self.alive_players()
        if len(alive) < 2:
            return 0
        taken = [p.inventory.pop(rng.randrange(len(p.inventory))) if p.inventory else None
                 for p in alive]
        moved = 0
        for i, p in enumerate(alive):
            obj = taken[i - 1]      # el del jugador anterior
            if obj is None:
                continue
            if len(p.inventory) < items.INVENTORY_CAP:
                p.inventory.append(obj); moved += 1
            else:
                alive[i - 1].inventory.append(obj)   # sin espacio: devolver
        return moved

    def _swap_seats(self):
        players = list(self.players.values())
        seats = sorted(self.players.keys())
        self.box.rng.shuffle(players)
        self.players = {}
        for seat, p in zip(seats, players):
            p.seat = seat
            self.players[seat] = p
        if self.host_seat not in self.players:
            self.host_seat = min(self.players)

    def _swap_inventories(self):
        alive = self.alive_players()
        if len(alive) < 2:
            return
        invs = [p.inventory for p in alive]
        invs = invs[-1:] + invs[:-1]
        for p, inv in zip(alive, invs):
            p.inventory = inv

    async def auction_event(self):
        from . import relics as R
        rid = self.box.rng.choice(R.RELIC_IDS)
        m = R.meta(rid)
        self.add_log(f"📼 EVENTO SECRETO: subasta de {m['name']} {m['emoji']}.")
        self.event = {"id": "auction", "prize": {"emoji": m["emoji"], "name": m["name"]},
                      "bids": {}, "timer_end": time.time() + 45}
        for p in self.players.values():
            p.ready = False
        await self.broadcast()
        end = self.event["timer_end"]
        while time.time() < end:
            await self.sleep(0.4)
            await self.broadcast()
        bids = self.event.get("bids", {})
        if bids:
            win_seat = max(bids, key=lambda s: bids[s])
            amount = min(bids[win_seat], self.players[win_seat].chips)
            self.players[win_seat].chips -= amount
            self._give_relic(self.players[win_seat], rid)
            self.add_log(f"{self.players[win_seat].name} ganó la subasta por {amount} fichas.")
        else:
            self.add_log("Nadie ofertó. El Dueño se lleva la reliquia.")

    def event_bid(self, player, amount):
        if self.phase == "EVENT" and self.event and self.event.get("id") == "auction" and player.alive:
            try:
                self.event.setdefault("bids", {})[player.seat] = max(0, min(int(amount), player.chips))
            except (TypeError, ValueError):
                pass

    # ------------- MARKET -------------
    async def activity_market(self):
        self.phase = "MARKET"
        # devolver el ante (no se juega el pozo en mercado)
        for p in self.alive_players():
            if p.bet:
                p.chips += p.bet
        self.pot = 0
        stock = self.box.market_stock()
        self.market = {"stock": stock, "timer_end": time.time() + MARKET_SECS, "sold": []}
        for p in self.players.values():
            p.ready = False
        self.add_log("🛒 MERCADO: aparece el vendedor.")
        await self.broadcast()
        end = self.market["timer_end"]
        while time.time() < end:
            ca = self.connected_alive()
            if ca and all(p.ready for p in ca):
                break
            await self.sleep(0.4)
            await self.broadcast()
        self.market = None
        for p in self.players.values():
            p.ready = False
        await self.broadcast()

    def market_buy(self, player, offer_id):
        if self.phase != "MARKET" or not self.market or not player.alive:
            return
        offer = next((o for o in self.market["stock"]
                      if f"{o['kind']}:{o['id']}" == offer_id), None)
        if not offer or player.chips < offer["cost"]:
            return
        if offer["id"] in self.market["sold"]:
            return
        player.chips -= offer["cost"]
        if offer["kind"] == "object":
            if self._give(player, offer["id"]):
                self.add_log(f"{player.name} compró {offer['name']} {offer['emoji']}.")
        else:
            self._give_relic(player, offer["id"])
            self.add_log(f"{player.name} compró la reliquia {offer['name']} {offer['emoji']}.")
        self.market["sold"].append(offer["id"])

    # ------------- USAR objeto de inventario -------------
    def use_inventory(self, player, uid, target):
        if self.phase in ("SPIN", "CASINO", "GAMEOVER", "LOBBY") or not player.alive:
            return
        obj = next((o for o in player.inventory if o["uid"] == uid), None)
        if not obj:
            return
        player.inventory.remove(obj)
        res = items.use_object(obj["type"], self._ctx(player), target)
        if obj["type"] in ("bomba", "dinamita", "jeringa", "iman", "vhs"):
            self.box.record("use_offense")
        self.apply_result(res)
        asyncio.create_task(self.broadcast_reveal([res]))

    # ------------- EL DUEÑO -------------
    async def owner_event(self):
        self.phase = "EVENT"
        self.event = {"id": "owner", "timer_end": time.time() + 5, "text": "EL DUEÑO se sienta a la mesa."}
        self.add_log("⚠ EL DUEÑO. El casino entero se detuvo.")
        await self.broadcast()
        await self.sleep(2.2)
        rng = self.box.rng
        roll = rng.random()
        victim = rng.choice(self.alive_players())
        if roll < 0.3:
            rid = rng.choice(relics.RELIC_IDS)
            m = relics.meta(rid)
            self._give_relic(victim, rid)
            self.add_log(f"🖐 El Dueño le regaló {m['name']} {m['emoji']} a {victim.name}.")
        elif roll < 0.55:
            self.box.bump_menace(3)
            for p in self.alive_players():
                p.chips = max(0, p.chips - 5)
            self.add_log("🖐 El Dueño cambió las reglas. Impuesto de 5 fichas a todos.")
        elif roll < 0.82:
            victim.hp = max(0, victim.hp - 1)
            if victim.inventory:
                victim.inventory.pop()
            if victim.hp <= 0:
                victim.alive = False
            self.add_log(f"🖐 El Dueño le cortó una mano a {victim.name}. −1 ❤ y pierde un objeto.")
        else:
            self.add_log("🖐 El Dueño miró a todos... y se fue sin hacer nada.")
        await self.broadcast()
        await self.sleep(PAYOUT_PAUSE)

    # ------------- CASINO flash -------------
    async def casino_flash(self):
        if len(self.alive_players()) <= 1:
            return
        self.phase = "CASINO"
        await self.broadcast()
        await self.sleep(CASINO_SECS)

    # ------------- aplicar resultado -------------
    def _give(self, player, otype):
        if len(player.inventory) >= items.INVENTORY_CAP:
            return False
        self._obj_uid = getattr(self, "_obj_uid", 0) + 1
        player.inventory.append({"uid": self._obj_uid, "type": otype})
        return True

    def _give_relic(self, player, rid):
        if rid not in player.relics:
            player.relics.append(rid)

    # ------------- MUÑECA MALDITA -------------
    def _doll_watch(self, current_seat):
        """En el turno de current_seat, cualquier OTRO dueño de la Muñeca puede,
        al azar, asustarlo (jumpscare) y robarle una reliquia al azar."""
        if not self.box:
            return
        rng = self.box.rng
        victim = self.players.get(current_seat)
        if not victim or not victim.alive:
            return
        for owner in self.alive_players():
            if owner.seat == current_seat or not relics.has(owner, "muneca"):
                continue
            if rng.random() >= 0.15:      # ~15% por turno y por muñeca
                continue
            stealable = [r for r in victim.relics if r != "muneca"]
            stolen = None
            if stealable:
                stolen = rng.choice(stealable)
                victim.relics.remove(stolen)
                self._give_relic(owner, stolen)
            if victim.conn and not victim.conn.closed:
                asyncio.create_task(victim.conn.send(
                    {"t": "jumpscare", "by": owner.seat, "byName": owner.name}))
            if stolen:
                m = relics.meta(stolen)
                self.add_log(f"🪆 La Muñeca de {owner.name} asustó a {victim.name} y le arrebató "
                             f"{m['name']} {m['emoji']}.")
            else:
                self.add_log(f"🪆 La Muñeca de {owner.name} clavó los ojos en {victim.name}. Un escalofrío.")
            break   # una sola muñeca actúa por turno

    def apply_result(self, res):
        for seat, d in res.get("hpDelta", {}).items():
            p = self.players.get(seat)
            if not p or not p.alive:
                continue
            if d < 0:
                d = relics.damage_taken(p, d)
            p.hp = max(0, min(items.MAX_HP, p.hp + d))
            if p.hp <= 0:
                p.alive = False
                self.add_log(f"☠ {p.name} quedó fuera.")
        for seat, d in res.get("chipDelta", {}).items():
            p = self.players.get(seat)
            if p:
                p.chips = max(0, p.chips + d)
        for seat, txt in res.get("hints", {}).items():
            p = self.players.get(seat)
            if p:
                p.private_hints.append(txt)
        for seat, line in res.get("phone", {}).items():
            p = self.players.get(seat)
            if p and p.conn:
                asyncio.create_task(p.conn.send({"t": "phone", "line": line}))
                p.private_hints.append("☎️ " + line)
        for seat, otype in res.get("give", {}).items():
            p = self.players.get(seat)
            if p:
                self._give(p, otype)
        st = res.get("steal")
        if st:
            frm, to = st
            src, dst = self.players.get(frm), self.players.get(to)
            if src and dst and src.inventory and len(dst.inventory) < items.INVENTORY_CAP:
                dst.inventory.append(src.inventory.pop(self.box.rng.randrange(len(src.inventory))))
        for seat in res.get("shield", []):
            p = self.players.get(seat)
            if p:
                p.shield = True
        for seat, secs in res.get("glitch", {}).items():
            p = self.players.get(seat)
            if p and p.conn:
                asyncio.create_task(p.conn.send({"t": "glitch", "secs": secs}))
        if res.get("menace"):
            self.box.bump_menace(res["menace"])
        if res.get("publicText"):
            self.add_log(res["publicText"])

    # ------------- fin -------------
    async def finish_game(self):
        alive = self.alive_players()
        if len(alive) == 1:
            self.winner_seat = alive[0].seat
        elif self.players:
            self.winner_seat = max(self.players.values(), key=lambda p: p.chips).seat
        self.phase = "GAMEOVER"
        self.current = None
        self.slots = self.roulette = self.market = self.event = None
        self.started = False
        if self.winner_seat is not None:
            self.add_log(f"🏆 Gana {self.players[self.winner_seat].name}.")
        await self.broadcast()
