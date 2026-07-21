"""Catalogo de objetos y resolucion de efectos OCULTOS.

Regla de oro: el efecto real de un objeto se decide aca, en el servidor, recien
al RESOLVER (usar/abrir). El cliente nunca lo recibe antes. La etiqueta que ven
los demas es solo "un objeto misterioso"; el que lo sostiene ve el TIPO
(radio, bomba, ...) pero no el efecto.
"""

# --------------------------------------------------------------------------- #
# Constantes de balance
# --------------------------------------------------------------------------- #
START_HP = 2
MAX_HP = 3

# tipos de objeto -> (emoji, nombre visible)
ITEM_TYPES = {
    "vhs":      ("📼", "VHS"),
    "key":      ("🔑", "Llave"),
    "bomb":     ("💣", "Bomba"),
    "syringe":  ("💉", "Jeringa"),
    "coins":    ("🪙", "Monedas"),
    "radio":    ("📻", "Radio"),
    "phone":    ("☎️", "Teléfono"),
    "smallbox": ("📦", "Caja chica"),
}

# que tipos existen segun cuan "grande" es la caja (round/boxSize).
# la caja empieza chica y va abriendo compartimentos.
UNLOCK_BY_ROUND = {
    1: ["coins", "bomb", "radio", "syringe"],
    2: ["coins", "bomb", "radio", "syringe", "key", "phone"],
    3: ["coins", "bomb", "radio", "syringe", "key", "phone", "vhs", "smallbox"],
}


def emoji(item_type):
    return ITEM_TYPES.get(item_type, ("❓", "???"))[0]


def label(item_type):
    return ITEM_TYPES.get(item_type, ("❓", "???"))[1]


# --------------------------------------------------------------------------- #
# Helpers de resolucion
# --------------------------------------------------------------------------- #
def _weighted(rng, bias, options):
    """options: lista de (weight, quality, fn). quality in {good,bad,neutral}.

    'bias' (aggro de la sala, -0.6..0.6) sube lo bueno y baja lo malo cuando es
    positivo (sala agresiva -> mas recompensas), y al reves cuando es negativo
    (sala pasiva/repetitiva -> peores objetos).
    """
    adj = []
    for w, quality, fn in options:
        m = 1.0
        if quality == "good":
            m = max(0.05, 1.0 + bias * 0.9)
        elif quality == "bad":
            m = max(0.05, 1.0 - bias * 0.9)
        adj.append((w * m, fn))
    total = sum(w for w, _ in adj)
    r = rng.uniform(0, total)
    acc = 0.0
    for w, fn in adj:
        acc += w
        if r <= acc:
            return fn()
    return adj[-1][1]()


def _result(ctx, item_type, effect_id, text, tone, **extra):
    res = {
        "itemType": item_type,
        "emoji": emoji(item_type),
        "name": label(item_type),
        "effectId": effect_id,
        "publicText": text,
        "tone": tone,          # good | bad | weird | info
        "hpDelta": {},         # {seat: delta}
        "coinDelta": {},       # {seat: delta}
        "privateHints": {},    # {seat: texto}
        "phone": {},           # {seat: linea}
        "spawn": None,         # tipo de objeto a encadenar (queda en manos del user)
    }
    res.update(extra)
    return res


# --------------------------------------------------------------------------- #
# Resolvers por tipo
# --------------------------------------------------------------------------- #
def _radio(ctx):
    u = ctx.user
    name = u.name

    def money():
        n = ctx.rng.randint(6, 12)
        return _result(ctx, "radio", "money", f"La radio de {name} escupió monedas. +{n} 🪙",
                       "good", coinDelta={u.seat: n})

    def explode():
        return _result(ctx, "radio", "explode", f"La radio de {name} explotó. −1 ❤",
                       "bad", hpDelta={u.seat: -1})

    def reveal():
        other = ctx.random_other()
        if other is None:
            return money()
        hint = ctx.hint_about(other)
        return _result(ctx, "radio", "reveal",
                       f"La radio de {name} sintonizó una frecuencia... (info privada)",
                       "info", privateHints={u.seat: hint})

    def copy():
        last = ctx.last_item_type or "coins"
        return _result(ctx, "radio", "copy",
                       f"La radio de {name} imitó al último objeto: {label(last)}.",
                       "weird", spawn=last)

    return _weighted(ctx.rng, ctx.bias, [
        (30, "good", money),
        (28, "bad", explode),
        (22, "neutral", reveal),
        (20, "neutral", copy),
    ])


def _bomb(ctx):
    u = ctx.user
    name = u.name

    def boom():
        return _result(ctx, "bomb", "boom", f"💥 La bomba de {name} detonó. −2 ❤",
                       "bad", hpDelta={u.seat: -2})

    def small():
        return _result(ctx, "bomb", "boom_small", f"💥 La bomba de {name} detonó. −1 ❤",
                       "bad", hpDelta={u.seat: -1})

    def dud():
        return _result(ctx, "bomb", "dud", f"La bomba de {name} era un dud. Nada pasó.",
                       "weird")

    def shrapnel():
        other = ctx.random_other()
        hp = {u.seat: -1}
        txt = f"💥 Metralla de la bomba de {name}. −1 ❤"
        if other is not None:
            hp[other.seat] = -1
            txt += f" (también hirió a {other.name})"
        return _result(ctx, "bomb", "shrapnel", txt, "bad", hpDelta=hp)

    return _weighted(ctx.rng, ctx.bias, [
        (30, "bad", boom),
        (26, "bad", small),
        (26, "good", dud),
        (18, "bad", shrapnel),
    ])


def _coins(ctx):
    u = ctx.user
    name = u.name

    def small():
        n = ctx.rng.randint(4, 7)
        return _result(ctx, "coins", "small", f"{name} juntó {n} 🪙", "good",
                       coinDelta={u.seat: n})

    def jackpot():
        n = ctx.rng.randint(13, 20)
        return _result(ctx, "coins", "jackpot", f"💰 ¡Jackpot! {name} juntó {n} 🪙", "good",
                       coinDelta={u.seat: n})

    def fake():
        return _result(ctx, "coins", "fake", f"Las monedas de {name} eran falsas. Nada.",
                       "weird")

    def trap():
        return _result(ctx, "coins", "trap",
                       f"Las monedas de {name} estaban trucadas. −1 ❤", "bad",
                       hpDelta={u.seat: -1})

    return _weighted(ctx.rng, ctx.bias, [
        (34, "good", small),
        (16, "good", jackpot),
        (26, "neutral", fake),
        (24, "bad", trap),
    ])


def _key(ctx):
    u = ctx.user
    name = u.name

    def unlock():
        n = ctx.rng.randint(7, 12)
        return _result(ctx, "key", "unlock",
                       f"{name} abrió un compartimento. +{n} 🪙", "good",
                       coinDelta={u.seat: n})

    def token():
        n = ctx.rng.randint(3, 5)
        return _result(ctx, "key", "token",
                       f"{name} abrió una caja fuerte chica. +{n} 🪙", "good",
                       coinDelta={u.seat: n})

    def rusty():
        return _result(ctx, "key", "rusty", f"La llave de {name} estaba oxidada. Nada.",
                       "weird")

    return _weighted(ctx.rng, ctx.bias, [
        (34, "good", unlock),
        (34, "good", token),
        (32, "neutral", rusty),
    ])


def _syringe(ctx):
    u = ctx.user
    name = u.name

    def heal():
        if u.hp >= MAX_HP:
            n = ctx.rng.randint(3, 6)
            return _result(ctx, "syringe", "heal_full",
                           f"{name} ya estaba a tope. La jeringa dio +{n} 🪙", "good",
                           coinDelta={u.seat: n})
        return _result(ctx, "syringe", "heal", f"{name} se curó. +1 ❤", "good",
                       hpDelta={u.seat: +1})

    def poison():
        return _result(ctx, "syringe", "poison", f"La jeringa de {name} era veneno. −1 ❤",
                       "bad", hpDelta={u.seat: -1})

    def adrenaline():
        n = ctx.rng.randint(5, 9)
        return _result(ctx, "syringe", "adrenaline",
                       f"Adrenalina para {name}. +{n} 🪙", "good", coinDelta={u.seat: n})

    return _weighted(ctx.rng, ctx.bias, [
        (36, "good", heal),
        (30, "bad", poison),
        (24, "good", adrenaline),
    ])


def _vhs(ctx):
    u = ctx.user
    name = u.name

    def static():
        return _result(ctx, "vhs", "static",
                       f"El VHS de {name} sólo mostró estática.", "weird")

    def shuffle():
        return _result(ctx, "vhs", "shuffle",
                       f"📼 El VHS de {name} mezcló lo que queda en la caja.", "weird",
                       spawn=None, shuffle=True)

    def glimpse():
        nxt = ctx.next_item_type
        hint = (f"El próximo objeto de la caja es: {label(nxt)}."
                if nxt else "No hay más objetos esta ronda.")
        return _result(ctx, "vhs", "glimpse",
                       f"El VHS de {name} adelantó imágenes... (info privada)", "info",
                       privateHints={u.seat: hint})

    def rewind():
        if u.hp < MAX_HP:
            return _result(ctx, "vhs", "rewind",
                           f"El VHS rebobinó a {name}. +1 ❤", "good", hpDelta={u.seat: +1})
        n = ctx.rng.randint(4, 8)
        return _result(ctx, "vhs", "rewind",
                       f"El VHS rebobinó a {name}. +{n} 🪙", "good", coinDelta={u.seat: n})

    return _weighted(ctx.rng, ctx.bias, [
        (26, "neutral", static),
        (24, "neutral", shuffle),
        (26, "info", glimpse),
        (24, "good", rewind),
    ])


def _phone(ctx):
    """Atender el telefono: mensaje privado (verdad/mentira/ruido). Sin efecto mecanico."""
    u = ctx.user
    line = ctx.phone_line()
    return _result(ctx, "phone", "answer",
                   f"{u.name} atendió el teléfono... y se quedó callado.", "info",
                   phone={u.seat: line})


def _smallbox(ctx):
    u = ctx.user
    name = u.name

    def nested():
        nxt = ctx.random_item_type()
        return _result(ctx, "smallbox", "nested",
                       f"📦 Dentro de la caja de {name} había otro objeto...", "weird",
                       spawn=nxt)

    def coins():
        n = ctx.rng.randint(4, 8)
        return _result(ctx, "smallbox", "coins",
                       f"La caja de {name} tenía {n} 🪙", "good", coinDelta={u.seat: n})

    def bomb():
        return _result(ctx, "smallbox", "bomb",
                       f"💥 Dentro de la caja de {name} había una bomba. −1 ❤", "bad",
                       hpDelta={u.seat: -1})

    return _weighted(ctx.rng, ctx.bias, [
        (34, "neutral", nested),
        (34, "good", coins),
        (32, "bad", bomb),
    ])


_RESOLVERS = {
    "radio": _radio,
    "bomb": _bomb,
    "coins": _coins,
    "key": _key,
    "syringe": _syringe,
    "vhs": _vhs,
    "phone": _phone,
    "smallbox": _smallbox,
}


def resolve(item_type, ctx):
    """Resuelve el efecto oculto de 'item_type' usando el contexto de la ronda."""
    fn = _RESOLVERS.get(item_type, _coins)
    return fn(ctx)
