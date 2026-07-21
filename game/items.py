"""Objetos consumibles: catalogo, apertura (ABRIR) y uso activo (USAR desde inventario).

Dos roles:
  - Objetos PELIGROSOS / ocultos (bomba, dinamita, caja sospechosa, maldición): en OBJETOS se
    ABREN ahora (riesgo público) o se EMPUJAN a otro. No se pueden guardar "vivos".
  - Objetos LOOT (whisky, llave, dado, jeringa, teléfono, bolsa, linterna, imán, comodín, VHS):
    se GUARDAN al inventario y se USAN después, cuando el contexto lo permite.

La regla de oro se mantiene: el efecto de lo oculto se decide en el server al resolver.
"""

# --------------------------------------------------------------------------- #
# Balance
# --------------------------------------------------------------------------- #
START_HP = 3
MAX_HP = 4
INVENTORY_CAP = 6

# tipo -> metadata
#   danger: se ABRE/EMPUJA en OBJETOS (no se guarda vivo)
#   hidden: no se sabe el efecto hasta resolver
#   use:    tiene uso activo desde el inventario
#   target: el uso pide objetivo ("self", "other", "any")
OBJECTS = {
    "bomba":       {"emoji": "💣", "name": "Bomba",         "danger": True,  "hidden": False, "use": False},
    "dinamita":    {"emoji": "🧨", "name": "Dinamita",      "danger": True,  "hidden": False, "use": False},
    "sospechosa":  {"emoji": "📦", "name": "Caja sospechosa","danger": True, "hidden": True,  "use": False},
    "maldicion":   {"emoji": "🕯️", "name": "Maldición",      "danger": True,  "hidden": True,  "use": False},

    "whisky":      {"emoji": "🥃", "name": "Whisky",   "use": True,  "target": "self",  "desc": "Ganás una recarga: reroll de un mal resultado de azar."},
    "llave":       {"emoji": "🔑", "name": "Llave",    "use": True,  "target": "self",  "desc": "Abrís un compartimento: +fichas."},
    "dado":        {"emoji": "🎲", "name": "Dado",     "use": True,  "target": "self",  "desc": "Tirás: puede ir bien o mal."},
    "jeringa":     {"emoji": "💉", "name": "Jeringa",  "use": True,  "target": "any",   "desc": "A vos: +1 ❤. A otro: veneno −1 ❤."},
    "telefono":    {"emoji": "☎️", "name": "Teléfono", "use": True,  "target": "self",  "desc": "Atendés: una voz dice algo... ¿verdad o mentira?"},
    "bolsa":       {"emoji": "👝", "name": "Bolsa de fichas","use": True,"target": "self","desc": "Fichas sueltas: +fichas."},
    "linterna":    {"emoji": "🔦", "name": "Linterna", "use": True,  "target": "self",  "desc": "Ves objetos ocultos y te protege del próximo monstruo."},
    "iman":        {"emoji": "🧲", "name": "Imán",     "use": True,  "target": "other", "desc": "Le robás un objeto (o fichas) a alguien."},
    "comodin":     {"emoji": "🃏", "name": "Comodín",  "use": True,  "target": "self",  "desc": "Se transforma en otro objeto al azar."},
    "vhs":         {"emoji": "📼", "name": "VHS",      "use": True,  "target": "other", "desc": "Le metés estática y glitch a la pantalla de alguien."},
}

# --- roles (para el sistema "a ciegas") ---
#   TRAP: al ABRIR te lastima a vos (querés pasarlo).
#   BOON: al ABRIR te da algo bueno YA (fichas / vida).
#   TOOL: al ABRIR va a tu INVENTARIO para usar cuando quieras.
# Como los objetos llegan CERRADOS, no sabés cuál es: por eso pasar (regalar) uno
# tiene sentido — puede ser una bomba disfrazada de regalo.
TRAP_POOL = ["bomba", "dinamita", "maldicion", "sospechosa"]
BOON_POOL = ["llave", "bolsa", "dado"]
TOOL_POOL = ["whisky", "jeringa", "telefono", "linterna", "iman", "comodin", "vhs"]

# aliases que usa el resto del motor
LOOT_POOL = BOON_POOL + TOOL_POOL      # lo "no peligroso" (slots, caos, comodín…)
DANGER_POOL = TRAP_POOL


def emoji(t):
    return OBJECTS.get(t, {}).get("emoji", "❓")


def name(t):
    return OBJECTS.get(t, {}).get("name", "???")


def is_danger(t):
    return OBJECTS.get(t, {}).get("danger", False)


def is_hidden(t):
    return OBJECTS.get(t, {}).get("hidden", False)


def has_use(t):
    return OBJECTS.get(t, {}).get("use", False)


def target_kind(t):
    return OBJECTS.get(t, {}).get("target", "self")


# --------------------------------------------------------------------------- #
# Resultado
# --------------------------------------------------------------------------- #
def result(text, tone, **extra):
    r = {
        "publicText": text,
        "tone": tone,               # good | bad | weird | info
        "hpDelta": {},              # {seat: delta}
        "chipDelta": {},            # {seat: delta}
        "hints": {},                # {seat: texto privado}
        "phone": {},                # {seat: linea}
        "give": {},                 # {seat: object_type}  -> al inventario
        "steal": None,              # (from_seat, to_seat)
        "shield": [],               # [seat]  protegido del proximo monstruo
        "glitch": {},               # {seat: secs}
        "reveal_hidden": [],        # [seat]  ve objetos ocultos
        "menace": 0,                # sube el nivel del casino
        "emoji": "❓", "name": "",  # para el reveal
    }
    r.update(extra)
    return r


def _w(rng, menace, options):
    """options: (weight, quality, fn). quality good|bad|neutral. menace + -> peor."""
    adj = []
    for wt, q, fn in options:
        m = 1.0
        if q == "good":
            m = max(0.05, 1.0 - menace * 0.06)
        elif q == "bad":
            m = max(0.05, 1.0 + menace * 0.08)
        adj.append((wt * m, fn))
    total = sum(w for w, _ in adj)
    r = rng.uniform(0, total)
    acc = 0
    for w, fn in adj:
        acc += w
        if r <= acc:
            return fn()
    return adj[-1][1]()


# --------------------------------------------------------------------------- #
# ABRIR (objetos peligrosos / ocultos)
# --------------------------------------------------------------------------- #
def resolve_open(t, ctx):
    """ABRIR un objeto CERRADO. El que lo abre se come el resultado:
       TRAP -> lo lastima | BOON -> premio instantáneo | TOOL -> va a su inventario."""
    u = ctx.user
    nm = u.name
    rng = ctx.rng
    men = ctx.menace

    # ---------------- TRAMPAS (querías no abrirlas) ----------------
    if t == "bomba":
        def boom():
            dmg = 2 if ctx.has_relic(u, "cuernos") else 1
            return result(f"💥 ¡Era una BOMBA! Le explota a {nm}. −{dmg} ❤", "bad",
                          hpDelta={u.seat: -dmg}, emoji="💣", name="Bomba")

        def dud():
            return result(f"💣 Era una bomba… pero estaba desactivada. {nm} zafó.", "weird",
                          emoji="💣", name="Bomba (dud)")
        return _w(rng, men, [(68, "bad", boom), (32, "good", dud)])

    if t == "dinamita":
        others = ctx.alive_others()
        hp = {u.seat: -2}
        txt = f"🧨 ¡DINAMITA! {nm} se lleva el estallido. −2 ❤"
        if others:
            v = rng.choice(others)
            hp[v.seat] = -1
            txt += f" y una esquirla hiere a {v.name} (−1 ❤)"
        return result(txt, "bad", hpDelta=hp, emoji="🧨", name="Dinamita")

    if t == "maldicion":
        def curse_hp():
            return result(f"🕯️ Una MALDICIÓN cae sobre {nm}. −1 ❤", "bad", hpDelta={u.seat: -1},
                          menace=1, emoji="🕯️", name="Maldición")

        def curse_chips():
            n = min(u.chips, rng.randint(5, 12))
            return result(f"🕯️ La maldición se traga {n} fichas de {nm}.", "bad",
                          chipDelta={u.seat: -n}, menace=1, emoji="🕯️", name="Maldición")

        def backfire():
            return result(f"🕯️ La maldición se deshizo en humo. Nada.", "weird",
                          emoji="🕯️", name="Maldición")
        return _w(rng, men, [(44, "bad", curse_hp), (38, "bad", curse_chips), (18, "good", backfire)])

    if t == "sospechosa":   # el verdadero comodín: puede ser tesoro o trampa
        def coins():
            n = rng.randint(10, 20)
            return result(f"📦 La caja sospechosa de {nm} estaba llena de fichas: +{n}.", "good",
                          chipDelta={u.seat: n}, emoji="📦", name="Caja sospechosa")

        def trap():
            return result(f"📦 La caja sospechosa de {nm} tenía un resorte con púas. −1 ❤", "bad",
                          hpDelta={u.seat: -1}, emoji="📦", name="Caja sospechosa")

        def tool():
            g = rng.choice(TOOL_POOL)
            return result(f"📦 De la caja de {nm} salió una herramienta: {name(g)} {emoji(g)}.", "good",
                          give={u.seat: g}, emoji="📦", name="Caja sospechosa")
        return _w(rng, men, [(40, "good", coins), (34, "bad", trap), (26, "neutral", tool)])

    # ---------------- PREMIOS instantáneos ----------------
    if t == "llave":
        n = rng.randint(9, 15)
        return result(f"🔑 {nm} abrió la caja fuerte del casino: +{n} fichas.", "good",
                      chipDelta={u.seat: n}, emoji="🔑", name="Llave")

    if t == "bolsa":
        n = rng.randint(7, 13)
        return result(f"👝 {nm} vació la bolsa de fichas: +{n}.", "good",
                      chipDelta={u.seat: n}, emoji="👝", name="Bolsa de fichas")

    if t == "dado":
        if rng.random() < 0.6:
            n = rng.randint(8, 14)
            return result(f"🎲 {nm} tiró el dado y salió bien: +{n} fichas.", "good",
                          chipDelta={u.seat: n}, emoji="🎲", name="Dado")
        return result(f"🎲 {nm} tiró el dado y salió mal. −1 ❤", "bad", hpDelta={u.seat: -1},
                      emoji="🎲", name="Dado")

    # ---------------- HERRAMIENTAS (van al inventario para usar cuando quieras) ----------------
    return result(f"🎁 {nm} desenvolvió una herramienta: {name(t)} {emoji(t)}. Guardala y usala en el momento justo.",
                  "good", give={u.seat: t}, emoji=emoji(t), name=name(t))


# --------------------------------------------------------------------------- #
# USAR (objeto de loot desde el inventario)
# --------------------------------------------------------------------------- #
def use_object(t, ctx, target):
    u = ctx.user
    nm = u.name
    rng = ctx.rng
    tp = ctx.player(target) if target is not None else None

    if t == "whisky":
        u.whisky = getattr(u, "whisky", 0) + 1
        return result(f"🥃 {nm} se toma un whisky. Mano firme (reroll listo).", "good",
                      emoji="🥃", name="Whisky")

    if t == "llave":
        n = rng.randint(6, 11)
        return result(f"🔑 {nm} abrió un compartimento. +{n} fichas.", "good",
                      chipDelta={u.seat: n}, emoji="🔑", name="Llave")

    if t == "dado":
        if rng.random() < 0.55:
            n = rng.randint(6, 12)
            return result(f"🎲 {nm} tiró y salió +{n} fichas.", "good", chipDelta={u.seat: n},
                          emoji="🎲", name="Dado")
        return result(f"🎲 {nm} tiró y perdió. −1 ❤", "bad", hpDelta={u.seat: -1},
                      emoji="🎲", name="Dado")

    if t == "jeringa":
        if tp is None or tp.seat == u.seat:
            return result(f"💉 {nm} se inyecta. +1 ❤", "good", hpDelta={u.seat: +1},
                          emoji="💉", name="Jeringa")
        return result(f"💉 {nm} envenenó a {tp.name}. −1 ❤", "bad", hpDelta={tp.seat: -1},
                      emoji="💉", name="Jeringa")

    if t == "telefono":
        line = ctx.phone_line()
        return result(f"☎️ {nm} atendió el teléfono...", "info", phone={u.seat: line},
                      emoji="☎️", name="Teléfono")

    if t == "bolsa":
        n = rng.randint(5, 12)
        return result(f"👝 {nm} vació la bolsa. +{n} fichas.", "good", chipDelta={u.seat: n},
                      emoji="👝", name="Bolsa de fichas")

    if t == "linterna":
        return result(f"🔦 {nm} encendió la linterna.", "info", shield=[u.seat],
                      reveal_hidden=[u.seat], emoji="🔦", name="Linterna")

    if t == "iman":
        if tp is None or tp.seat == u.seat:
            return result(f"🧲 El imán de {nm} no agarró nada.", "weird", emoji="🧲", name="Imán")
        if tp.inventory:
            return result(f"🧲 {nm} le robó un objeto a {tp.name}.", "good",
                          steal=(tp.seat, u.seat), emoji="🧲", name="Imán")
        n = min(tp.chips, rng.randint(3, 7))
        return result(f"🧲 {nm} le robó {n} fichas a {tp.name}.", "good",
                      chipDelta={u.seat: n, tp.seat: -n}, emoji="🧲", name="Imán")

    if t == "comodin":
        g = rng.choice(LOOT_POOL)
        return result(f"🃏 El comodín de {nm} se volvió {name(g)} {emoji(g)}.", "weird",
                      give={u.seat: g}, emoji="🃏", name="Comodín")

    if t == "vhs":
        if tp is None or tp.seat == u.seat:
            return result(f"📼 {nm} miró el VHS: pura estática.", "weird", glitch={u.seat: 4},
                          emoji="📼", name="VHS")
        return result(f"📼 {nm} le metió estática a la pantalla de {tp.name}.", "weird",
                      glitch={tp.seat: 5}, emoji="📼", name="VHS")

    return result(f"{nm} usó {name(t)}.", "weird", emoji=emoji(t), name=name(t))
