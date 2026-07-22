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
    "muneca": {"emoji": "🪆", "name": "Muñeca Maldita",
               "desc": "Se sienta a tu lado y vigila. En el turno de OTRO puede pegarle un susto y robarle una reliquia al azar."},
    "tarot": {"emoji": "🃏", "name": "Cartas del Tarot",
              "desc": "USALA para robar una carta de un MAZO compartido y finito. El destino siempre cobra su deuda."},
    # Maldición permanente que SÓLO reparte THE DEVIL — no aparece en los pools.
    "maldito": {"emoji": "🔥", "name": "Maldición del Diablo",
                "desc": "El precio del Diablo: −3 fichas al empezar cada ronda. No la pediste."},
}

# Reliquias OBTENIBLES al azar (slots/subasta/dueño/mercado). 'maldito' queda afuera.
RELIC_IDS = [k for k in RELICS if k != "maldito"]


def has(player, relic_id):
    return relic_id in getattr(player, "relics", [])


def meta(relic_id):
    return RELICS.get(relic_id, {"emoji": "❔", "name": relic_id, "desc": ""})


# -- hooks ---------------------------------------------------------------------
def round_income(player):
    """Fichas (o penalización) al empezar la ronda."""
    inc = 0
    if has(player, "diente"):
        inc += 3
    if has(player, "maldito"):
        inc -= 3        # el precio del Diablo
    return inc


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
