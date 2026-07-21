"""La BlackBox: elige la actividad de cada ronda y controla el 'menace' del casino.

menace = cuán despierto está el casino. Sube con juego agresivo, combos de tragaperras y ciertos
eventos. A mayor menace: ruleta más letal, más eventos secretos, reveal del casino más siniestro,
y se habilita El Dueño.
"""

import random

from . import items

ACTIVITIES = ["OBJETOS", "SLOTS", "ROULETTE", "EVENT", "MARKET"]
ACT_META = {
    "OBJETOS":  ("📦", "OBJETOS"),
    "SLOTS":    ("🎰", "TRAGAPERRAS"),
    "ROULETTE": ("🔫", "RULETA RUSA"),
    "EVENT":    ("📼", "EVENTO"),
    "MARKET":   ("🛒", "MERCADO"),
}

# tragaperras
SLOT_SYMBOLS = ["🍒", "🔔", "⭐", "🎰", "💀", "📦", "👁"]
SLOT_WEIGHTS = [26, 22, 16, 8, 12, 10, 6]

# eventos rápidos (ocurren y terminan) — se muestran con un cartel (reveal)
EVENTS_NORMAL = ["tax", "chip_rain", "bombing", "chaos", "sabotage", "swap_inv", "jackpot"]
# eventos secretos (requieren menace): El Dueño y la subasta
EVENTS_SECRET = ["owner", "auction"]

PHONE_TEMPLATES = [
    "{p} está mintiendo.",
    "No apuestes esta ronda.",
    "Uno de ustedes ya está muerto.",
    "El próximo giro es una bomba.",
    "Confiá en {p}.",
    "La caja te eligió.",
    "Guardá el próximo objeto. No lo abras.",
    "{p} sabe algo que vos no.",
    "El Dueño está mirando.",
    "...(sólo estática)...",
    "Robale a {p} mientras puedas.",
    "Hay fichas para el que se anime primero.",
]

HINT_TEMPLATES = [
    "{p} tiene {hp} ❤ y {chips} fichas.",
    "{p} es quien más fichas tiene.",
    "{p} está al borde: le queda 1 ❤.",
    "Vigilá a {p}.",
]


class BoxAI:
    def __init__(self, seed=None):
        self.rng = random.Random(seed)
        self.menace = 0
        self.aggr = 0      # acciones agresivas acumuladas
        self.passive = 0   # acciones pasivas
        self.pending_bombs = 0   # bombas extra que mete el evento "Bombardeo"

    def record(self, kind):
        if kind in ("open", "pushTo", "pull", "use_offense", "spin"):
            self.aggr += 1
        elif kind in ("pocket", "stop", "skip"):
            self.passive += 1

    def bump_menace(self, n=1):
        self.menace = max(0, self.menace + n)

    def tick_menace(self):
        # el casino se despierta lento con el juego agresivo
        if self.aggr - self.passive > 4:
            self.bump_menace(1)
            self.aggr = self.passive = 0

    # -- elegir actividad ----------------------------------------------------
    def pick_activity(self, round_no, last):
        if round_no == 1:
            return "OBJETOS"
        m = self.menace
        weights = {
            "OBJETOS": 26,
            "SLOTS": 22 + m,
            "ROULETTE": 8 + m * 2,
            "EVENT": 20 + m,
            "MARKET": 16,
        }
        # cada 3-4 rondas empujar MERCADO para que puedan gastar
        if round_no % 4 == 0:
            weights["MARKET"] += 24
        if last in weights:
            weights[last] = max(3, weights[last] * 0.35)  # anti-repetición
        acts = list(weights.keys())
        w = [weights[a] for a in acts]
        return self.rng.choices(acts, weights=w, k=1)[0]

    # -- objetos de la ronda OBJETOS -----------------------------------------
    def spawn_objects(self, round_no, count):
        out = []
        # bombas extra del evento "Bombardeo"
        for _ in range(self.pending_bombs):
            out.append("bomba")
        self.pending_bombs = 0
        danger_p = min(0.5, 0.2 + self.menace * 0.03)
        for _ in range(count):
            if self.rng.random() < danger_p:
                out.append(self.rng.choice(items.DANGER_POOL))
            else:
                out.append(self.rng.choice(items.LOOT_POOL))
        self.rng.shuffle(out)
        return out

    # -- tragaperras ---------------------------------------------------------
    def spin_reels(self):
        return [self.rng.choices(SLOT_SYMBOLS, weights=SLOT_WEIGHTS, k=1)[0] for _ in range(3)]

    # -- eventos -------------------------------------------------------------
    def pick_event(self):
        pool = list(EVENTS_NORMAL)
        if self.menace >= 4 and self.rng.random() < min(0.5, 0.12 + self.menace * 0.03):
            pool = EVENTS_SECRET + pool
        return self.rng.choice(pool)

    # -- stock de mercado ----------------------------------------------------
    def market_stock(self):
        stock = []
        objs = self.rng.sample(items.LOOT_POOL, k=3)
        for o in objs:
            stock.append({"kind": "object", "id": o, "emoji": items.emoji(o),
                          "name": items.name(o), "cost": self.rng.choice([6, 8, 10]),
                          "desc": items.OBJECTS.get(o, {}).get("desc", "")})
        # a veces una reliquia
        from . import relics
        if self.rng.random() < 0.6:
            rid = self.rng.choice(relics.RELIC_IDS)
            m = relics.meta(rid)
            stock.append({"kind": "relic", "id": rid, "emoji": m["emoji"],
                          "name": m["name"], "cost": self.rng.choice([22, 28, 34]), "desc": m["desc"]})
        return stock
