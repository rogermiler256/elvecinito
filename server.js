// ========================
// 📌 Importación de módulos
// ========================
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import chalk from "chalk";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// ========================
// 📌 Configuración básica
// ========================
const app = express();
const chatHistories = {};
const lastSizeByUser = {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========================
// 📌 Middlewares
// ========================
app.use(express.static(path.join(__dirname, "public")));
app.use(
  cors({
    origin: ["https://elvecinito.onrender.com", "http://localhost:3000"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.options("*", cors());
app.use(express.json());

// ========================
// 📌 Función para leer imágenes
// ========================
function getImagesBySize(size = null) {
  const sizes = size ? [size] : ["pequeño", "mediano", "grande"];
  let images = [];

  sizes.forEach((s) => {
    const dirPath = path.join(__dirname, "public", "imagenes", "productos", s);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      const sizeImages = files
        .filter((file) => /\.(jpg|jpeg|png|gif)$/i.test(file))
        .map((file) => `/imagenes/productos/${s}/${file}`);
      images.push(...sizeImages);
    }
  });

  return images;
}

// ========================
// 📌 Rutas para imágenes
// ========================
app.get("/imagenes", (req, res) => {
  res.json({ images: getImagesBySize() });
});

app.get("/imagenes/:size", (req, res) => {
  const size = req.params.size.toLowerCase();
  const validSizes = ["pequeño", "mediano", "grande"];

  if (!validSizes.includes(size)) {
    return res.status(400).json({ error: "Tamaño inválido" });
  }

  res.json({ images: getImagesBySize(size) });
});

// ========================
// 📌 Configuración del agente IA
// ========================
const AGENTE = "el-vecinito";
const PRODUCT_KEYWORDS = ["kit", "kits", "botiquin", "botiquines", "producto"];

// ========================
// 📌 Endpoint principal de chat
// ========================
app.post("/chat", async (req, res) => {
  const { prompt, userId } = req.body;

  if (!prompt || !userId) {
    return res
      .status(400)
      .json({ error: "Faltan datos: prompt y userId son requeridos" });
  }

  console.log(chalk.blue.bold("\n📨 Prompt del usuario:"));
  console.log(chalk.white(`   ${prompt}`));

  const lowerPrompt = prompt.toLowerCase();

  // --- Si pide productos ---
  if (PRODUCT_KEYWORDS.some((word) => lowerPrompt.includes(word))) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const SIZE_KEYWORDS = {
      pequeño: "pequeño",
      pequeno: "pequeño",
      mediano: "mediano",
      grande: "grande",
    };

    let selectedSize = null;
    for (const key in SIZE_KEYWORDS) {
      if (lowerPrompt.includes(key)) {
        selectedSize = SIZE_KEYWORDS[key];
        lastSizeByUser[userId] = selectedSize;
        break;
      }
    }

    if (!selectedSize && lastSizeByUser[userId]) {
      selectedSize = lastSizeByUser[userId];
    }

    let images = [];
    try {
      if (selectedSize) {
        const dirPath = path.join(
          __dirname,
          "public",
          "imagenes",
          "productos",
          selectedSize
        );
        if (fs.existsSync(dirPath)) {
          const files = fs.readdirSync(dirPath);
          images = files
            .filter((file) => /\.(jpg|jpeg|png|gif)$/i.test(file))
            .map((file) => `/imagenes/productos/${selectedSize}/${file}`);
        }
      } else {
        const sizes = ["pequeño", "mediano", "grande"];
        sizes.forEach((size) => {
          const dirPath = path.join(
            __dirname,
            "public",
            "imagenes",
            "productos",
            size
          );
          if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath);
            const sizeImages = files
              .filter((file) => /\.(jpg|jpeg|png|gif)$/i.test(file))
              .map((file) => `/imagenes/productos/${size}/${file}`);
            images.push(...sizeImages);
          }
        });
      }
    } catch (error) {
      console.error("❌ Error leyendo carpetas de productos:", error);
    }

    return res.json({
      response: selectedSize
        ? `Claro veci...Aquí tienes nuestros productos tamaño ${selectedSize}:`
        : "Claro veci..Aquí tienes todos nuestros kits y botiquines disponibles:",
      images,
    });
  }

  // --- Si no pide productos ---
  if (!chatHistories[userId]) {
    chatHistories[userId] = [];
  }
  chatHistories[userId].push({ role: "user", content: prompt });

  let systemPrompt = "";
  try {
    const modelFilePath = path.join(__dirname, `${AGENTE}-ModelFile.txt`);
    systemPrompt = fs.readFileSync(modelFilePath, "utf8");
  } catch (err) {
    console.error(`❌ No se pudo leer el ModelFile de ${AGENTE}:`, err);
    return res
      .status(500)
      .json({ error: `No se pudo cargar configuración de ${AGENTE}` });
  }

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-4-scou", // ✅ tu modelo en Groq
          messages: [
            { role: "system", content: systemPrompt },
            ...chatHistories[userId],
          ],
        }),
      }
    );

    const data = await response.json();

    if (!data.choices || data.choices.length === 0) {
      return res
        .status(500)
        .json({ error: "No se recibió respuesta del modelo" });
    }

    const fullResponse = data.choices[0].message.content;
    chatHistories[userId].push({ role: "assistant", content: fullResponse });

    return res.json({ response: fullResponse });
  } catch (error) {
    console.error("❌ Error en /chat:", error);
    return res.status(500).json({ error: "Error al comunicarse con Groq" });
  }
});

// ========================
// 📌 Servir index.html en la raíz
// ========================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ========================
// 📌 Iniciar servidor
// ========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(
    chalk.green.bold("🚀 Servidor corriendo en:"),
    chalk.cyan(`http://localhost:${PORT}\n`)
  );
});
