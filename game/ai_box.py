"""La caja: RNG sembrada, generacion de objetos y la heuristica 'la caja aprende'.

La caja tiene una IA muy simple: mira como juega la sala.
  - Si todos empujan/dudan mucho (sala pasiva y repetitiva) -> sesga hacia PEORES objetos.
  - Si todos abren/usan rapido (sala agresiva)             -> sesga hacia MAS recompensas.
Ese sesgo (bias) lo consumen los resolvers de items.py.
"""

import random

from . import items

# Frases del telefono. {p} = referencia a otro jugador. Mezcla verdad / mentira / ruido.
# El engine elige y rellena; el jugador NUNCA sabe si es verdad.
PHONE_TEMPLATES = [
    "{p} está mintiendo.",
    "No abras la próxima caja.",
    "Uno de ustedes ya está muerto.",
    "El próximo objeto es una bomba.",
    "Confiá en {p}. Es lo único que te queda.",
    "La caja te eligió.",
    "Pasá el siguiente objeto. No lo abras vos.",
    "{p} sabe algo que vos no.",
    "Quedan menos de los que pensás.",
    "El teléfono volverá a sonar. No atiendas.",
    "Mentiles a todos en la próxima ronda.",
    "Hay monedas escondidas para el que abra primero.",
    "...(sólo estática)...",
    "El que te pasó esto quería verte explotar.",
]

# Plantillas de hint privado (revelar info sobre otro jugador).
HINT_TEMPLATES = [
    "{p} tiene {hp} ❤ y {coins} 🪙.",
    "{p} es quien más monedas tiene ahora mismo.",
    "{p} está al borde: le queda 1 ❤.",
    "Vigilá a {p}.",
]


class BoxAI:
    def __init__(self, seed=None):
        self.rng = random.Random(seed)
        self.uses = 0          # objetos abiertos/usados
        self.pushes = 0        # objetos empujados a otro
        self.actions_by_seat = {}  # seat -> [kinds] para medir 'todos juegan igual'

    # -- registro de comportamiento ------------------------------------------
    def record(self, seat, kind):
        if kind == "use":
            self.uses += 1
        elif kind == "pushTo":
            self.pushes += 1
        self.actions_by_seat.setdefault(seat, []).append(kind)

    def bias(self):
        """Devuelve el sesgo en [-0.6, 0.6]. + = mas recompensas, - = peor."""
        total = self.uses + self.pushes
        if total < 3:
            return 0.0
        aggression = self.uses / total  # 0 (todo pasivo) .. 1 (todo agresivo)
        b = (aggression - 0.5) * 1.2
        # penalizacion extra si TODOS juegan igual (poca variedad global)
        if total >= 6:
            all_kinds = [k for ks in self.actions_by_seat.values() for k in ks]
            share_use = sum(1 for k in all_kinds if k == "use") / len(all_kinds)
            if share_use < 0.15 or share_use > 0.85:  # monotono
                b -= 0.15
        return max(-0.6, min(0.6, b))

    # -- generacion de objetos -----------------------------------------------
    def _pool_for_round(self, round_no):
        key = min(3, max(1, round_no))
        return items.UNLOCK_BY_ROUND[key]

    def random_item_type(self, round_no):
        return self.rng.choice(self._pool_for_round(round_no))

    def generate_round(self, round_no, count):
        """Lista de tipos de objeto para la ronda. La caja crece: mas objetos por ronda."""
        pool = self._pool_for_round(round_no)
        b = self.bias()
        # con sesgo negativo, aparecen mas bombas; con positivo, mas monedas.
        weights = []
        for t in pool:
            w = 1.0
            if t in ("bomb",):
                w = max(0.2, 1.0 - b * 1.2)
            elif t in ("coins", "syringe", "key"):
                w = max(0.2, 1.0 + b * 0.8)
            weights.append(w)
        out = []
        for _ in range(count):
            out.append(self.rng.choices(pool, weights=weights, k=1)[0])
        return out
