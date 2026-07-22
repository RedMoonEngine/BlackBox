"""Cartas del Tarot — reliquia-evento con un MAZO COMPARTIDO y finito por partida.

Cada carta usada se descarta: genera tensión sobre qué queda ("ya salió The Death…",
"todavía falta The Devil"). THE STAR roba OTRA carta y puede encadenar (⭐→⭐→☀️).
Los efectos se aplican en engine.py (`_tarot_apply`); acá viven los datos y el mazo.
"""


CARDS = {
    "sun": {"emoji": "☀️", "name": "THE SUN", "quote": "Incluso en el infierno existe la luz.",
            "effect": "Recuperás toda la vida y ganás fichas.", "tone": "good", "img": "TheSun"},
    "death": {"emoji": "💀", "name": "THE DEATH", "quote": "Todo termina. Incluso la suerte.",
              "effect": "Un jugador pierde una reliquia al azar.", "tone": "bad", "img": "TheDeath"},
    "fool": {"emoji": "🤡", "name": "THE FOOL", "quote": "La locura también es un camino.",
             "effect": "Caos: a cada uno le pasa algo al azar. Nadie sabe qué.", "tone": "weird", "img": "TheFool"},
    "wheel": {"emoji": "🎡", "name": "WHEEL OF FORTUNE", "quote": "Lo que hoy sube, mañana cae.",
              "effect": "Se barajan fichas y objetos entre todos.", "tone": "weird", "img": "WheelOfFortune"},
    "hermit": {"emoji": "🧙", "name": "THE HERMIT", "quote": "Quien observa, sobrevive.",
               "effect": "Se revela TODA la info oculta durante esta ronda.", "tone": "good", "img": "TheHermit"},
    "emperor": {"emoji": "👑", "name": "THE EMPEROR", "quote": "El rey toma lo que desea.",
                "effect": "Duplicás tus fichas actuales.", "tone": "good", "img": "TheEmperor"},
    "moon": {"emoji": "🌙", "name": "THE MOON", "quote": "Nada es lo que parece.",
             "effect": "Esta ronda nadie ve nada… ni el Ojo del Vidente.", "tone": "weird", "img": "TheMoon"},
    "devil": {"emoji": "😈", "name": "THE DEVIL", "quote": "Todo tiene un precio.",
              "effect": "Recompensa enorme… y una Maldición permanente.", "tone": "bad", "img": "TheDevil"},
    "star": {"emoji": "⭐", "name": "THE STAR", "quote": "Todavía queda esperanza.",
             "effect": "Robás inmediatamente otra carta del Tarot.", "tone": "good", "img": "TheStar"},
}

# Composición del mazo: una de cada efecto + VARIAS STAR (para permitir cadenas
# ⭐→⭐→…). Las 8 cartas de efecto son únicas -> "qué queda" es la tensión.
DECK_TEMPLATE = ["sun", "death", "fool", "wheel", "hermit", "emperor", "moon", "devil",
                 "star", "star", "star"]


def new_deck(rng):
    deck = list(DECK_TEMPLATE)
    rng.shuffle(deck)
    return deck


def meta(cid):
    return CARDS.get(cid, {"emoji": "🃏", "name": cid, "quote": "", "effect": "", "tone": "weird", "img": ""})
