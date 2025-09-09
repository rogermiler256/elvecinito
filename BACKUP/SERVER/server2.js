import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import readline from 'readline';

const app = express();
const port = 3000;
const chatHistories = {};

// Configuración de rutas
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(express.json());

// Función para leer imágenes por tamaño
function getImagesBySize(size = null) {
  const sizes = size ? [size] : ['pequeño', 'mediano', 'grande'];
  let images = [];

  sizes.forEach(s => {
    const dirPath = path.join(__dirname, 'public', 'imagenes', 'productos', s);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      const sizeImages = files
        .filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file))
        .map(file => `/imagenes/productos/${s}/${file}`);
      images.push(...sizeImages);
    }
  });

  return images;
}

// Endpoint: todas las imágenes
app.get('/imagenes', (req, res) => {
  res.json({ images: getImagesBySize() });
});

// Endpoint: imágenes por tamaño
app.get('/imagenes/:size', (req, res) => {
  const size = req.params.size.toLowerCase();
  const validSizes = ['pequeño', 'mediano', 'grande'];

  if (!validSizes.includes(size)) {
    return res.status(400).json({ error: 'Tamaño inválido' });
  }

  res.json({ images: getImagesBySize(size) });
});


// Nombre fijo del modelo y agente
const MODEL_NAME = "vecinito-model";
const AGENTE = "el-vecinito";

// Palabras clave para mostrar productos
const PRODUCT_KEYWORDS = ["kit", "botiquin", "producto"];

// Endpoint de chat (solo El Vecinito)
app.post('/chat', async (req, res) => {
  const { prompt, userId } = req.body;

  if (!prompt || !userId) {
    return res.status(400).json({ error: 'Faltan datos: prompt y userId son requeridos' });
  }

  console.log(chalk.blue.bold('\n📨 Prompt del usuario:'));
  console.log(chalk.white(`   ${prompt}`));
  console.log(chalk.cyan.bold('\n🤖 Modelo usado:'), chalk.magenta(MODEL_NAME));
  console.log(chalk.magenta.bold('👤 Agente:'), chalk.yellow(AGENTE));
  console.log(chalk.green.bold('\n💬 Procesando respuesta...\n'));

  const lowerPrompt = prompt.toLowerCase();

  // 📌 Si el usuario menciona productos, devolver imágenes directamente
  if (PRODUCT_KEYWORDS.some(word => lowerPrompt.includes(word))) {
    // Palabras clave de tamaño
    const SIZE_KEYWORDS = {
      pequeño: 'pequeño',
      pequeno: 'pequeño', // por si no usa la ñ
      mediano: 'mediano',
      grande: 'grande'
    };

    let selectedSize = null;

    // Detectar si el prompt contiene un tamaño específico
    for (const key in SIZE_KEYWORDS) {
      if (lowerPrompt.includes(key)) {
        selectedSize = SIZE_KEYWORDS[key];
        break;
      }
    }

    let images = [];

    try {
      if (selectedSize) {
        // 📌 Mostrar solo productos de un tamaño específico
        const dirPath = path.join(__dirname, 'public', 'imagenes', 'productos', selectedSize);
        if (fs.existsSync(dirPath)) {
          const files = fs.readdirSync(dirPath);
          images = files
            .filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file))
            .map(file => `/imagenes/productos/${selectedSize}/${file}`);
        } else {
          console.warn(`⚠️ Carpeta no encontrada: ${dirPath}`);
        }
      } else {
        // 📌 Mostrar todos los productos (pequeño, mediano y grande)
        const sizes = ['pequeño', 'mediano', 'grande'];
        sizes.forEach(size => {
          const dirPath = path.join(__dirname, 'public', 'imagenes', 'productos', size);
          if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath);
            const sizeImages = files
              .filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file))
              .map(file => `/imagenes/productos/${size}/${file}`);
            images.push(...sizeImages);
          } else {
            console.warn(`⚠️ Carpeta no encontrada: ${dirPath}`);
          }
        });
      }
    } catch (error) {
      console.error("❌ Error leyendo carpetas de productos:", error);
    }

    return res.json({
      response: selectedSize
        ? `Aquí tienes nuestros productos tamaño ${selectedSize}:`
        : "Aquí tienes todos nuestros kits y botiquines disponibles:",
      images
    });
  }

  // 📌 Guardar historial
  if (!chatHistories[userId]) {
    chatHistories[userId] = [];
  }
  chatHistories[userId].push({ role: 'user', content: prompt });

  // 📌 Cargar prompt base del ModelFile
  let systemPrompt = '';
  try {
    const modelFilePath = path.join(__dirname, `${AGENTE}-ModelFile.txt`);
    systemPrompt = fs.readFileSync(modelFilePath, 'utf8');
  } catch (err) {
    console.error(`❌ No se pudo leer el ModelFile de ${AGENTE}:`, err);
    return res.status(500).json({ error: `No se pudo cargar configuración de ${AGENTE}` });
  }

  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          { role: 'system', content: systemPrompt },
          ...chatHistories[userId]
        ]
      })
    });

    let fullResponse = '';
    const rl = readline.createInterface({
      input: response.body,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.message?.content) {
          fullResponse += parsed.message.content;
        }
      } catch {
        // ignorar líneas que no sean JSON
      }
    }

    if (!fullResponse) {
      console.log(chalk.red.bold('\n❌ No se obtuvo respuesta válida del modelo.\n'));
      return res.status(500).json({ error: "No se pudo construir respuesta del modelo" });
    }

    fullResponse = fullResponse.replace(/\*[^*]+\*/g, '').trim();

    chatHistories[userId].push({ role: 'assistant', content: fullResponse });

    console.log(chalk.green.bold('\n✅ Respuesta generada:\n'));
    console.log(chalk.white(fullResponse));
    console.log(chalk.yellow('\n───────────────────────────────'));

    res.json({ response: fullResponse });

  } catch (error) {
    console.error('❌ Error en /chat:', error);
    res.status(500).json({ error: 'Error al comunicarse con Ollama' });
  }
});

// Servir index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(chalk.green.bold(`🚀 Servidor corriendo en:`), chalk.cyan(`http://localhost:${port}\n`));
});
