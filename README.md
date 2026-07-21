# BLACK BOX 📼🎰

> "Una caja vieja encontrada en un depósito militar. Cada vez que alguien la abre,
> alguien sale ganando... y otro no."

Juego web **multiplayer** — **casino roguelike social** (terror + humor), estética **PS1**,
primera persona, **2 a 6 jugadores** alrededor de una única mesa. En el centro está la **BlackBox**:
una máquina con pantalla CRT que **controla todo**.

Cada ronda:
1. Apostás **fichas** (a ciegas) al **pozo**.
2. La BlackBox **gira** su ruleta y elige una **actividad**.
3. Se juega esa actividad.
4. Se reparten premios/castigos.
5. Entre rondas, por 2 segundos, **se enciende el casino**: ves un salón de demonios jugando
   alrededor... y vuelve la oscuridad.

**Actividades** (props 3D animados, no menús):
- 📦 **OBJETOS** — la caja escupe objetos; los **abrís** (¿bomba?), los **guardás** al inventario, o
  se los **empujás** a otro mintiendo.
- 🎰 **TRAGAPERRAS** — una tragaperras flota hacia vos; **tirás la palanca arrastrando el mouse**.
- 🔫 **RULETA RUSA** — un revólver se te acerca; hacés **click en el gatillo** o te **plantás**.
- 📼 **EVENTO** — pasa cualquier cosa (apagón, lluvia de fichas, un monstruo, subasta, y el raro
  **EL DUEÑO** que detiene el casino).
- 🛒 **MERCADO** — un **maletín cae del cielo** y se abre revelando objetos y **reliquias** en 3D.

**Sistemas roguelike:** fichas, apuesta, **inventario** de consumibles (bomba, whisky, llave,
jeringa, teléfono, imán, VHS…), **reliquias permanentes** (Ojo del Vidente, Diente de Oro, Cuernos
de Satán, Mano del Tahúr, Máscara de los Horrores) y el **menace** ("el casino despierta"): cuanto
más agresivos juegan, peores objetos y más eventos secretos.

Todo es **procedural** (modelos 3D hechos en código, sin assets externos). No hay que instalar nada
más que Python 3; Three.js viene vendorizado en `public/vendor/`.

## Correr

```bash
cd BlackBox
python3 server.py
```

Abrí **http://localhost:8080**. Dejá el código de sala vacío para **crear** una (te da un código de
4 letras) o pegá el de un amigo para **unirte**. Con 2 a 6 jugadores, el anfitrión (★) toca
**ABRIR LA CAJA**.

- Otro puerto: `PORT=9000 python3 server.py`
- Con amigos en la LAN: compartiles `http://TU_IP:8080`. Por internet: exponé el puerto (port-forward
  o un túnel tipo `cloudflared`/`ngrok`).

## Tuneo (variables de entorno)

`PORT` (8080) y los tiempos de fase: `BB_BET_SECS`, `BB_SPIN_SECS`, `BB_CHOOSE_SECS`,
`BB_ROULETTE_SECS`, `BB_SLOTS_SECS`, `BB_EVENT_SECS`, `BB_MARKET_SECS`, `BB_RESOLVE_PAUSE`,
`BB_CASINO_SECS`, `BB_ROUND_CAP`.

## Arquitectura

- **`server.py`** — servidor autoritativo en **Python puro (solo stdlib)**: sirve `public/` y hace de
  servidor WebSocket (handshake + framing a mano) en `/ws`. Los efectos ocultos viven **solo** acá.
- **`game/`** — lógica del juego:
  - `room.py` (salas/jugadores/ruteo), `engine.py` (loop BET→SPIN→ACTIVIDAD→PAYOUT→CASINO + las 5
    actividades + El Dueño), `items.py` (objetos y sus efectos), `ai_box.py` (ruleta de actividades,
    tragaperras, eventos, menace), `relics.py` (reliquias con hooks), `protocol.py` (vista por-jugador).
- **`public/`** — cliente Three.js sin build:
  - `js/scene.js` `models.js` `items3d.js` — escena PS1 + **props 3D animados** (tragaperras con
    palanca arrastrable, revólver con gatillo, maletín que cae y se abre, CRT animada, reveal del casino).
  - `js/ui.js` `net.js` `audio.js` `main.js` — HUD/paneles, WebSocket, audio, orquestación.
  - `vendor/three.module.js` — Three.js r160 vendorizado (sin CDN).

## Estado

v2 jugable: 5 actividades con props 3D animados, fichas/apuesta/pozo, inventario, 5 reliquias,
menace, reveal del casino y El Dueño.
Pendiente (post-v2): 🃏 PÓKER, 🕹 ARCADE, clickear objetos del maletín para comprar, más
reliquias/objetos/eventos, persistencia, balance fino.
