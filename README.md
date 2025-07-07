# Caspar Manager

**Caspar Manager** é uma solução leve (Node.js + React) para roteamento IP (matriz N×M) e controle de **CasparCG Server** em produções ao vivo. Ele:

- Consome feeds SRT/RTMP/WebRTC via **FFmpeg/GStreamer** em contêineres dedicados.
- Permite patch‑matrix instantâneo (`route://`) e comandos de playback no Caspar.
- Expõe API REST **CRUD** completa de *inputs* e *outputs* (com metadado `UMD`).
- Fornece **WebSocket** (Socket.IO) para monitoramento em tempo real.
- Persiste configurações em `config.json` para *autostart*.

> **Stack resumida:** Node.js · Express · Socket.IO · casparcg-connection · Docker

---

## 📑 Sumário

1. [Arquitetura](#arquitetura)
2. [Requisitos](#requisitos)
3. [Instalação Rápida (Docker)](#instalação-rápida-docker)
4. [Modo Dev](#modo-dev)
5. [API REST](#api-rest)
6. [Eventos WebSocket](#eventos-websocket)
7. [Formato `config.json`](#formato-configjson)
8. [Roadmap](#roadmap)
9. [Licença](#licença)

---

## Arquitetura

```text
┌────────────┐    REST  /  WS      ┌──────────────┐   PLAY / ROUTE  ┌──────────────┐
│  Frontend  │◀──────────────────▶│ CasparManager │◀───────────────▶│  CasparCG     │
│  React UI  │                    │   (Node.js)   │   AMCP 5250     │   Server      │
└────────────┘                    └──────────────┘                  └─────┬────────┘
                                                                               │ NDI
                                                                               ▼
                                                                       Switchers / OBS
```

- **FFmpeg / GStreamer** containers escutam portas SRT/RTMP e expõem **NDI** para Caspar.
- Caspar Manager armazena *inputs*/*outputs*; UI controla `PLAY`, `STOP`, `LOADBG`, `ROUTE`.

---

## Requisitos

| Software           | Versão mínima | Observação                |
|--------------------|---------------|---------------------------|
| Node.js            | 18 LTS        | Backend / scripts         |
| Docker + Compose   | 20.10 / v2    | Execução em contêineres   |
| CasparCG Server    | 2.4 LTS       | Canal NDI consumer nativo |
| NDI SDK            | 5.x+          | Necessário para FFmpeg ND |

> **OBS:** Para produção sem GUI, use `xvfb` no contêiner do Caspar.

---

## Instalação Rápida (Docker)

1. Clone o repositório:
   ```bash
   git clone https://github.com/<org>/caspar-manager.git
   cd caspar-manager
   ```

2. Ajuste `.env` se necessário (porta, host do Caspar).

3. Suba tudo:
   ```bash
   docker compose up -d
   ```

4. Acesse `http://localhost:3000` para UI e API.

---

## Modo Dev

```bash
# backend
cd server && npm i && npm run dev

# frontend (em outra aba)
cd client && npm i && npm start
```

Backend roda em `localhost:3000`, frontend em `localhost:5173` (Vite).

---

## API REST

### Playback
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/play` | `{"channel":1,"layer":10,"file":"remote_srt","loop":false}` |
| POST | `/api/stop` | `{"channel":1,"layer":10}` |
| POST | `/api/clear` | `{"channel":1}` |
| POST | `/api/loadbg` | `{"channel":1,"layer":20,"file":"branding.mov","auto":true}` |
| POST | `/api/route` | `{"channel":1,"layer":10,"source":"remote_srt"}` |

### CRUD Inputs / Outputs
| Método | Endpoint | Payload |
|--------|----------|---------|
| GET | `/api/config` | List completo |
| GET | `/api/config/inputs` | Somente inputs |
| GET | `/api/config/outputs` | Somente outputs |
| POST | `/api/config/input` | `{"id":"remote_srt","type":"ndi","source":"remote_srt","label":"SRT Remoto","umd":"Cam01"}` |
| PUT | `/api/config/input/:id` | Update parcial |
| DELETE | `/api/config/input/:id` | Remove |

> Mesma lógica para `/output` (`target` em vez de `source`).

### Health
```
GET /api/health → { "status":"ok", "casparConnected":true }
```

---

## Eventos WebSocket

- URL: `ws://<host>:3000`
- Namespace: padrão (Socket.IO default)

| `type`           | Payload                              | Origem |
|------------------|--------------------------------------+--------|
| `connected`      | —                                    | CasparCG onConnect |
| `disconnected`   | —                                    | CasparCG onDisconnect |
| `play`/`stop`    | `{channel, layer, file?}`            | API action |
| `route`          | `{channel, layer, source}`           | API action |
| `input:add`      | `{id}`                               | CRUD |
| `input:update`   | `{id}`                               | CRUD |
| `input:delete`   | `{id}`                               | CRUD |
| `output:*`       | idem                                 | CRUD |

Exemplo cliente:
```js
import { io } from 'socket.io-client';
const socket = io('http://localhost:3000');

socket.on('caspar', evt => {
  console.log('[WS]', evt.type, evt);
});
```

---

## Formato `config.json`

```json
{
  "inputs": [
    {
      "id": "remote_srt",
      "type": "ndi",
      "source": "remote_srt",
      "label": "SRT Remoto HQ",
      "umd": "CAM 01"
    }
  ],
  "outputs": [
    {
      "id": "program_srt",
      "type": "srt",
      "target": "srt://dest:9000",
      "label": "PGM > Encoder"
    }
  ]
}
```
- **`umd`**: alias a ser mostrado no multiview.
- Alterações via API persistem nesse arquivo.

---

## Roadmap

- [ ] Componente React **Matriz N×M** drag‑and‑drop.
- [ ] Thumbnails NDI em tempo real.
- [ ] Presets / playlists.
- [ ] Login simples (JWT).

---

## Licença

MIT © 2025 Roberto Brito
