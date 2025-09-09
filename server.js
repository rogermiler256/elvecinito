// 📦 Dependencias principales
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import chalk from "chalk";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const app = express();
const port = process.env.PORT || 3000;

// 🗂️ Historial de chats y buffers
const chatHistories = {};
const userTimers = {};
const userBuffers = {};
const userResponses = {};
const shownImages = {};

// 📌 Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

/* ------------------------- Manejo de imágenes -------------------------- */
function getAllImages(dirPath, relativePath = "") {
  if (!fs.existsSync(dirPath)) return [];
  let results = [];
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const relPath = path.join(relativePath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      results = results.concat(getAllImages(fullPath, relPath));
    } else if (/\.(jpg|jpeg|png|gif|webp|png)$/i.test(file)) {
      results.push(`/imagenes/${relPath.replace(/\\/g, "/")}`);
    }
  }
  return results;
}

function getRandomImages(userId, folder = "productos", count = 1) {
  if (!shownImages[userId]) {
    shownImages[userId] = [];
  }

  const allImages = getAllImages(
    path.join(__dirname, "public", "imagenes", folder),
    folder
  );

  const used = shownImages[userId];
  const available = allImages.filter((img) => !used.includes(img));
  let pool = available.length ? available : [...allImages];
  if (!available.length) shownImages[userId] = [];

  const selected = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const index = Math.floor(Math.random() * pool.length);
    selected.push(pool.splice(index, 1)[0]);
  }
  shownImages[userId].push(...selected);
  return selected;
}

/* ---------------------------- API imágenes ---------------------------- */
app.get("/api/imagenes", (req, res) => {
  const cantidad = parseInt(req.query.count) || 1;
  const imagenes = getRandomImages("anon", "productos", cantidad);
  res.json({ imagenes });
});

app.use(
  "/imagenes",
  express.static(path.join(__dirname, "public", "imagenes"))
);

/* -------------------------- Endpoint principal ------------------------ */
app.post("/chat", async (req, res) => {
  const { prompt, userId, agent } = req.body;
  if (!prompt || !userId || !agent) {
    return res.status(400).json({ error: "Faltan datos en la solicitud" });
  }

  if (!chatHistories[userId]) chatHistories[userId] = [];
  if (!userBuffers[userId]) userBuffers[userId] = [];
  userBuffers[userId].push(prompt);

  if (userResponses[userId]) {
    try {
      userResponses[userId].json({ waiting: true });
    } catch {}
  }
  userResponses[userId] = res;

  if (userTimers[userId]) clearTimeout(userTimers[userId]);

  userTimers[userId] = setTimeout(async () => {
    const combinedPrompt = userBuffers[userId].join("\n");
    userBuffers[userId] = [];
    chatHistories[userId].push({ role: "user", content: combinedPrompt });

    console.log(
      chalk.gray(`[${new Date().toLocaleTimeString()}] 👤 Usuario: `) +
        chalk.white(combinedPrompt)
    );

    let systemPrompt = "";
    try {
      const modelFilePath = path.join(__dirname, `${agent}-ModelFile.txt`);
      systemPrompt = fs.readFileSync(modelFilePath, "utf8");
    } catch {
      return userResponses[userId]?.status(500).json({
        error: `No se pudo cargar configuración de ${agent}`,
      });
    }

    try {
      // Llamada a Groq
      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: [
              { role: "system", content: systemPrompt },
              ...chatHistories[userId],
            ],
          }),
        }
      );

      const data = await response.json();
      let fullResponse = "";
      if (data.choices && data.choices.length > 0) {
        fullResponse = data.choices.map((c) => c.message.content).join("\n");
      }

      fullResponse = fullResponse.replace(/\*[^*]+\*/g, "").trim();
      chatHistories[userId].push({ role: "assistant", content: fullResponse });

      let imagenesExtra = [];
      if (
        /(foto|imagen|ver|muestra|enséñame|producto|quiero|otra|sí|si)/i.test(
          combinedPrompt
        )
      ) {
        imagenesExtra = getRandomImages(userId, "productos", 1);
      }

      console.log(
        chalk.gray(`[${new Date().toLocaleTimeString()}] 🤖 El Vecinito: `) +
          chalk.yellow(fullResponse) +
          (imagenesExtra.length
            ? chalk.red(` [📸 ${imagenesExtra.length} img]`)
            : "")
      );

      userResponses[userId]?.json({
        response: fullResponse || "El Vecinito no respondió...",
        imagenes: imagenesExtra,
        visto: true,
        escribiendo: true,
      });

      delete userResponses[userId];
    } catch (error) {
      console.error("❌ Error en /chat:", error);
      userResponses[userId]?.json({
        response: "No se pudo conectar con Groq. Pero aquí tienes productos.",
        imagenes: getRandomImages(userId, "productos", 1),
        visto: true,
        escribiendo: false,
        error: error.message,
      });
      delete userResponses[userId];
    }
  }, 8000);
});

/* ---------------------------- Index.html ----------------------------- */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* --------------------------- Inicializar servidor -------------------- */
app.listen(port, () => {
  console.log(
    chalk.green.bold(`🚀 Servidor corriendo en:`),
    chalk.cyan(`http://localhost:${port}`)
  );
});
