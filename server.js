// ========================
// 📌 Importación de módulos
// ========================
import express from 'express';        // Framework para crear el servidor HTTP
import cors from 'cors';              // Middleware para permitir peticiones desde otros orígenes
import fetch from 'node-fetch';       // Para hacer solicitudes HTTP desde el backend
import chalk from 'chalk';            // Para darle color y estilo a los logs en consola
import path from 'path';               // Manejo de rutas del sistema
import { fileURLToPath } from 'url';   // Obtener __dirname en módulos ES
import fs from 'fs';                   // Manejo de archivos y carpetas
import readline from 'readline';       // Leer streams línea por línea

// ========================
// 📌 Configuración básica
// ========================
const app = express();
const port = 3000;
const chatHistories = {};              // Guardar historial de conversaciones por usuario
const lastSizeByUser = {};             // Guardar último tamaño de producto solicitado por usuario

// ========================
// 📌 Configuración de rutas absolutas
// ========================
const __filename = fileURLToPath(import.meta.url); // Ruta del archivo actual
const __dirname = path.dirname(__filename);        // Directorio del archivo actual

// ========================
// 📌 Middlewares
// ========================
app.use(express.static(path.join(__dirname, 'public'))); // Servir archivos estáticos desde /public
app.use(cors());                                         // Permitir peticiones externas
app.use(express.json());                                 // Parsear JSON en peticiones

// ========================
// 📌 Función para leer imágenes según el tamaño
// ========================
function getImagesBySize(size = null) {
  const sizes = size ? [size] : ['pequeño', 'mediano', 'grande'];
  let images = [];

  sizes.forEach(s => {
    const dirPath = path.join(__dirname, 'public', 'imagenes', 'productos', s);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      const sizeImages = files
        .filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file)) // Filtra solo imágenes
        .map(file => `/imagenes/productos/${s}/${file}`);    // Crea rutas accesibles
      images.push(...sizeImages);
    }
  });

  return images;
}

// ========================
// 📌 Endpoints para obtener imágenes
// ========================

// Obtener todas las imágenes sin importar el tamaño
app.get('/imagenes', (req, res) => {
  res.json({ images: getImagesBySize() });
});

// Obtener imágenes filtradas por tamaño específico
app.get('/imagenes/:size', (req, res) => {
  const size = req.params.size.toLowerCase();
  const validSizes = ['pequeño', 'mediano', 'grande'];

  if (!validSizes.includes(size)) {
    return res.status(400).json({ error: 'Tamaño inválido' });
  }

  res.json({ images: getImagesBySize(size) });
});

// ========================
// 📌 Configuración del agente y modelo IA
// ========================
const MODEL_NAME = "vecinito-model"; // Nombre del modelo en Ollama
const AGENTE = "el-vecinito";        // Nombre del asistente

// Palabras clave que activan la búsqueda de productos
const PRODUCT_KEYWORDS = ["kit", "kits", "botiquin", "botiquines", "producto"];

// ========================
// 📌 Endpoint principal de chat
// ========================
app.post('/chat', async (req, res) => {
  const { prompt, userId } = req.body; // prompt: texto del usuario, userId: ID único del cliente

  // Validar datos requeridos
  if (!prompt || !userId) {
    return res.status(400).json({ error: 'Faltan datos: prompt y userId son requeridos' });
  }

  // 📌 Mostrar información en consola
  console.log(chalk.blue.bold('\n📨 Prompt del usuario:'));
  console.log(chalk.white(`   ${prompt}`));
  console.log(chalk.cyan.bold('\n🤖 Modelo usado:'), chalk.magenta(MODEL_NAME));
  console.log(chalk.magenta.bold('👤 Agente:'), chalk.yellow(AGENTE));
  console.log(chalk.green.bold('\n💬 Procesando respuesta...\n'));

  const lowerPrompt = prompt.toLowerCase();

  // =========================================================
  // 📌 Si el usuario menciona productos, devolver imágenes
  // =========================================================
  if (PRODUCT_KEYWORDS.some(word => lowerPrompt.includes(word))) {

    // 🕒 Retraso simulado antes de enviar la respuesta (2 segundos)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Posibles palabras clave para tamaños
    const SIZE_KEYWORDS = {
      pequeño: 'pequeño',
      pequeno: 'pequeño',
      mediano: 'mediano',
      grande: 'grande'
    };

    let selectedSize = null;

    // Detectar si el prompt incluye un tamaño específico
    for (const key in SIZE_KEYWORDS) {
      if (lowerPrompt.includes(key)) {
        selectedSize = SIZE_KEYWORDS[key];
        lastSizeByUser[userId] = selectedSize; // Guardar el último tamaño usado
        break;
      }
    }

    // Si no se menciona tamaño pero hay uno guardado, usarlo
    if (!selectedSize && lastSizeByUser[userId]) {
      selectedSize = lastSizeByUser[userId];
    }

    let images = [];

    try {
      if (selectedSize) {
        // 📂 Leer imágenes de un tamaño específico
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
        // 📂 Leer imágenes de todos los tamaños
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

    // 📤 Enviar respuesta con imágenes
    return res.json({
      response: selectedSize
        ? `Claro veci...Aquí tienes nuestros productos tamaño ${selectedSize}:`
        : "Claro veci..Aquí tienes todos nuestros kits y botiquines disponibles:",
      images
    });
  }

  // ========================
  // 📌 Si no pide productos, enviar a la IA
  // ========================

  // Crear historial de chat si no existe
  if (!chatHistories[userId]) {
    chatHistories[userId] = [];
  }
  chatHistories[userId].push({ role: 'user', content: prompt });

  // Leer prompt base del archivo de configuración del agente
  let systemPrompt = '';
  try {
    const modelFilePath = path.join(__dirname, `${AGENTE}-ModelFile.txt`);
    systemPrompt = fs.readFileSync(modelFilePath, 'utf8');
  } catch (err) {
    console.error(`❌ No se pudo leer el ModelFile de ${AGENTE}:`, err);
    return res.status(500).json({ error: `No se pudo cargar configuración de ${AGENTE}` });
  }

  try {
    // Llamada al modelo de IA en Ollama
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

    // 📥 Procesar respuesta de Ollama en streaming
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
        // Ignorar líneas que no sean JSON
      }
    }

    if (!fullResponse) {
      console.log(chalk.red.bold('\n❌ No se obtuvo respuesta válida del modelo.\n'));
      return res.status(500).json({ error: "No se pudo construir respuesta del modelo" });
    }

    // Limpiar texto de caracteres no deseados
    fullResponse = fullResponse.replace(/\*[^*]+\*/g, '').trim();

    // Guardar respuesta en historial
    chatHistories[userId].push({ role: 'assistant', content: fullResponse });

    // Mostrar respuesta en consola
    console.log(chalk.green.bold('\n✅ Respuesta generada:\n'));
    console.log(chalk.white(fullResponse));
    console.log(chalk.yellow('\n───────────────────────────────'));

    // 📤 Enviar respuesta al cliente
    res.json({ response: fullResponse });

  } catch (error) {
    console.error('❌ Error en /chat:', error);
    res.status(500).json({ error: 'Error al comunicarse con Ollama' });
  }
});

// ========================
// 📌 Servir index.html en la raíz
// ========================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ========================
// 📌 Iniciar servidor
// ========================
app.listen(port, () => {
  console.log(chalk.green.bold(`🚀 Servidor corriendo en:`), chalk.cyan(`http://localhost:${port}\n`));
});
