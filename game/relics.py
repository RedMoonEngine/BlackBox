"""Reliquias permanentes: pasivas que cambian reglas. Se consultan vía hooks.

El engine llama a estas funciones en los puntos clave. Cada Player tiene `relics` (lista de ids).
"""

RELICS = {
    "ojo": {"emoji": "👁", "name": "Ojo del Vidente",
            "desc": "Ves las fichas y el inventario de todos, incluso con Máscara."},
    "diente": {"emoji": "🦷", "name": "Diente de Oro",
               "desc": "+3 fichas al inicio de cada ronda."},
    "cuernos": {"emoji": "😈", "name": "Cuernos de Satán",
                "desc": "Tus bombas pegan más; recibís 1 menos de daño."},
    "tahur": {"emoji": "🤞", "name": "Mano del Tahúr",
              "desc": "Reroll de un mal resultado de azar por ronda."},
    "mascara": {"emoji": "🎭", "name": "Máscara de los Horrores",
                "desc": "Los demás no ven tus fichas ni tu inventario."},
}

RELIC_IDS = list(RELICS.keys())


def has(player, relic_id):
    return relic_id in getattr(player, "relics", [])


def meta(relic_id):
    return RELICS.get(relic_id, {"emoji": "❔", "name": relic_id, "desc": ""})


# -- hooks ---------------------------------------------------------------------
def round_income(player):
    """Fichas pasivas al empezar la ronda."""
    return 3 if has(player, "diente") else 0


def damage_taken(player, base):
    """Modifica el daño que RECIBE el jugador (Cuernos aguanta 1)."""
    if base < 0 and has(player, "cuernos"):
        return min(0, base + 1)
    return base


def sees_all(player):
    """Ve la info oculta de los demás (contrarresta la Máscara)."""
    return has(player, "ojo")


def has_reroll(player):
    return has(player, "tahur")


def hides_info(player):
    return has(player, "mascara")
