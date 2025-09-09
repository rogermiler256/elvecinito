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

// Nombre fijo del modelo y agente
const MODEL_NAME = "vecinito-model";
const AGENTE = "el-vecinito";

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

  if (!chatHistories[userId]) {
    chatHistories[userId] = [];
  }
  chatHistories[userId].push({ role: 'user', content: prompt });

  // Cargar prompt base del ModelFile
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

    // Procesar como streaming para no imprimir JSON crudo
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

    // Limpiar texto entre asteriscos
    fullResponse = fullResponse.replace(/\*[^*]+\*/g, '').trim();

    // Guardar en historial
    chatHistories[userId].push({ role: 'assistant', content: fullResponse });

    // Mostrar solo la respuesta final en consola
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
