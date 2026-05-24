const { spawn } = require("child_process");
const express = require("express");
const { WebSocketServer } = require("ws");
const http = require("http");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Health check endpoint for deployment services (Railway/Render)
app.get("/health", (req, res) => {
  res.status(200).send("Resign Backend is healthy");
});

// The path to the compiled Resign engine
const ENGINE_PATH = path.resolve(__dirname, "../../resign");
const STOCKFISH_PATH =
  [
    process.env.STOCKFISH_PATH,
    "/opt/homebrew/bin/stockfish",
    "/usr/games/stockfish",
    "/usr/bin/stockfish",
  ].find((candidate) => candidate && fs.existsSync(candidate)) || null;

// Keep track of connected clients to broadcast engine output
const clients = new Set();

function getEnginePath(engineId) {
  if (engineId === "resign") return ENGINE_PATH;
  if (engineId === "stockfish") return STOCKFISH_PATH;
  return null;
}

function queryBestMove(engineId, moves, movetime) {
  const enginePath = getEnginePath(engineId);

  if (!enginePath) {
    return Promise.reject(
      new Error(`${engineId} is unavailable on this backend`),
    );
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(enginePath, [], {
      cwd: path.dirname(enginePath),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buffer = "";
    let settled = false;
    let ready = false;

    const timeout = setTimeout(
      () => {
        if (!settled) {
          settled = true;
          proc.kill("SIGKILL");
          reject(new Error(`${engineId} timed out while searching`));
        }
      },
      Math.max(Number(movetime) + 8000, 12000),
    );

    const cleanup = () => {
      clearTimeout(timeout);
      if (!proc.killed) {
        proc.kill("SIGKILL");
      }
    };

    proc.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        if (line === "uciok") {
          proc.stdin.write("setoption name Threads value 1\n");
          proc.stdin.write("setoption name Hash value 64\n");
          proc.stdin.write("isready\n");
          continue;
        }

        if (line === "readyok" && !ready) {
          ready = true;
          const moveSuffix = moves.length ? ` moves ${moves.join(" ")}` : "";
          proc.stdin.write(`position startpos${moveSuffix}\n`);
          proc.stdin.write(`go movetime ${movetime}\n`);
          continue;
        }

        if (line.startsWith("bestmove ")) {
          if (!settled) {
            settled = true;
            cleanup();
            resolve(line.split(/\s+/)[1]);
          }
          return;
        }
      }
    });

    proc.on("error", (error) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(error);
      }
    });

    proc.on("close", () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error(`${engineId} closed before returning a move`));
      }
    });

    proc.stdin.write("uci\n");
  });
}

wss.on("connection", (ws) => {
  console.log("Frontend connected.");
  clients.add(ws);

  // Spawn a fresh engine instance for this connection
  // For a simple implementation, we spawn one engine globally, but let's do it per connection or globally.
  // Actually, one global engine instance is better for a single user.

  ws.on("message", (message) => {
    const cmd = message.toString();
    if (cmd.startsWith("__DUEL_MOVE__ ")) {
      const [, engineId = "", movetimeRaw = "250", ...moves] = cmd
        .trim()
        .split(/\s+/);
      queryBestMove(engineId, moves, Number(movetimeRaw) || 250)
        .then((bestmove) => {
          if (ws.readyState === 1) {
            ws.send(`duelmove ${engineId} ${bestmove}\n`);
          }
        })
        .catch((error) => {
          if (ws.readyState === 1) {
            const prefix = /unavailable/i.test(error.message)
              ? "duelunavailable"
              : "duelerror";
            ws.send(`${prefix} ${error.message}\n`);
          }
        });
      return;
    }
    console.log(`[Frontend -> Engine] ${cmd}`);
    if (engine && !engine.killed) {
      engine.stdin.write(cmd + "\n");
    }
  });

  ws.on("close", () => {
    console.log("Frontend disconnected.");
    clients.delete(ws);
  });
});

// Global Engine Instance
let engine = null;

function startEngine() {
  console.log(`Starting Resign engine at: ${ENGINE_PATH}`);
  engine = spawn(ENGINE_PATH);

  engine.stdout.on("data", (data) => {
    const output = data.toString();
    console.log(`[Engine -> Frontend] ${output.trim()}`);

    // Broadcast to all connected WebSockets
    for (const client of clients) {
      if (client.readyState === 1) {
        // WebSocket.OPEN
        client.send(output);
      }
    }
  });

  engine.stderr.on("data", (data) => {
    console.error(`[Engine Error] ${data.toString()}`);
  });

  engine.on("close", (code) => {
    console.log(`Engine exited with code ${code}. Restarting...`);
    startEngine();
  });
}

startEngine();

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Resign Backend running on port ${PORT}`);
});
