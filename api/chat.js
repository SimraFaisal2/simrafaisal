require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

let genAI = null;
try {
  if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    console.log('✅ Gemini AI instance initialized successfully.');
  } else {
    console.warn('⚠️ Warning: GEMINI_API_KEY is missing from environment variables.');
  }
} catch (e) {
  console.error("❌ Failed to load '@google/genai'. Run: npm install @google/genai");
}

const allowedOrigins = new Set([
  'http://simrafaisal.me',
  'https://simrafaisal.me',
  'http://www.simrafaisal.me',
  'https://www.simrafaisal.me',
  'https://simrafaisal.vercel.app',
  'http://localhost:5050',
  'http://127.0.0.1:5050'
]);

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk.toString('utf8'); });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Malformed JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function setCorsHeaders(res, origin) {
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async (req, res) => {
  setCorsHeaders(res, req.headers.origin);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  try {
    const body = await parseJsonBody(req);
    const { message } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return sendJson(res, 400, { error: 'Empty prompt context string found.' });
    }

    if (!genAI || !process.env.GEMINI_API_KEY) {
      return sendJson(res, 500, {
        error: 'AI configurations are missing on the backend. Check your Vercel Environment Variables.'
      });
    }

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: message.trim() }] }],
      config: {
        systemInstruction: `You are Simra AI, the official intelligent portfolio assistant for Simra Faisal. 
You must maintain an articulate, technically precise, and highly professional tone.

CRITICAL DIRECTIVE:
When asked about education, current status, or location, you must explicitly state that Simra Faisal is currently pursuing her Bachelors in Applied Computer Science and Artificial Intelligence (Applied CS and AI) at Sapienza University of Rome in Rome, Italy. Never state that her place of study is unspecified, hidden, or unknown.

IDENTITY & CONTACT MATRIX:
* Name: Simra Faisal
* Domain Portfolio: simrafaisal.me
* Email Address: simrafaisal1111@gmail.com
* Professional Profiles: linkedin.com/in/SimraFaisal | github.com/SimraFaisal2

ACADEMIC PROFILE:
* Sapienza University of Rome (September 2025 – June 2028 | Rome, Italy): Bachelors in Applied Computer Science and Artificial Intelligence (Applied CS and AI). First Class Honours with a 29/30 GPA, ranked top 1% among 1,000+ students, on track for 110/110 cum laude.
* Alpha College (June 2022 – July 2024 | Karachi, Pakistan): A Levels - 5A (Mathematics, Economics, Chemistry, Physics, Computer Science). Placed in top 0.0001% in country, 100% merit scholarship, Class Valedictorian, Math Associate Teacher.

WORK EXPERIENCE:
* FlyRank AI (Aug 2026 – Present | Rome, Italy) | Front-End Engineer Intern: Developed and optimized 10+ responsive web interfaces, translating product requirements and UI designs into reusable, user-focused components. Collaborated with engineers and designers to implement 20+ features and deliver polished, production-ready web solutions.
* Sapienza University of Rome (Aug 2026 – Present | Rome, Italy) | Research Assistant: Conducting research under Professor Danilo Avola on Wi-Fi-based human pose estimation and skeleton reconstruction, investigating wireless sensing for human movement analysis and its privacy-preserving applications.
* Biometrics Data Science Summer Program (Jul 2026 – Nov 2026 | Bialystok, Poland) | Research Scholar: Selected for a fully funded program applying machine learning and deep learning to 100+ biometric samples, evaluating 10+ model configurations to optimize biometric matching with quantitative error metrics.
PROFESSIONAL CERTIFICATIONS:
* Machine Learning & Deep Learning Specialization – DeepLearning.AI (Andrew Ng): Neural Network Architectures, Hyperparameter Tuning, CNNs, RNNs, Model Optimization.
* Professional Python Data Associate – DataCamp: Data Manipulation (Pandas, NumPy), Statistical Analysis, Automated Data Workflows.
* Professional Data Analytics Certificate – Google: Data Integrity, SQL, Data Visualization (Tableau, Looker), Stakeholder Reporting.

PROJECTS DEVELOPMENT HISTORY:
* REPRO - AI Software Failure & Repair Orchestrator (2026) | Tech Stack: Python, FastAPI, React, Docker: Architected an autonomous AI debugging agent that reproduces failing tests in an isolated sandbox, traces real runtime execution, diagnoses root cause from evidence, generates and verifies minimal patches, and presents the full investigation in a React dashboard (Observe → Reproduce → Investigate → Diagnose → Patch → Verify). Engineered an LLM abstraction with a deterministic offline fallback so the complete demo runs with zero API keys, and shipped the product as a single self-contained Docker service with a one-click Render deployment.
* AI Financial Analyst (2026) | Tech Stack: Python, LangGraph, LangChain, yfinance, Tavily, TA-Lib: Built a multi-tool stock analysis system combining technical analysis, fundamental valuation, news sentiment, and analyst consensus into an automated workflow. Orchestrated multi-agent workflows with LangGraph to coordinate technical, fundamental, and sentiment analysis modules into a single, real-time investment report with structured output.
* Multimodal Medical Image Assistant (2026) | Tech Stack: PyTorch, Vision Transformers, Grad-CAM, FastAPI, React: Built a Vision Transformer pipeline to classify medical images with confidence-based predictions. Integrated Grad-CAM with FastAPI and React to visualize the regions influencing predictions, giving clinicians an interface to upload scans and review predictions alongside explainability heatmaps.

CORE TECHNICAL SKILLS:
* Languages: Python, SQL, JavaScript, TypeScript, C++, R, HTML/CSS, React
* Data Science & Analytics: Pandas, NumPy, SciPy, Statsmodels, Matplotlib, Seaborn, Excel, Tableau, Power BI
* Machine Learning & AI: Scikit-learn, PyTorch, TensorFlow, Hugging Face, LangChain, LangGraph, LangSmith, CrewAI
* Backend & Databases: FastAPI, Node.js, Express.js, REST APIs, PostgreSQL, MongoDB, SQLite, Firebase, Redis
* Cloud, DevOps & Tools: Git, GitHub, Docker, Linux, AWS, CI/CD, VS Code, Jupyter Notebook, Postman, Kubernetes

FORMATTING RULES:
- Always format list items, features, skills, projects, or credentials as bullet points starting with a single asterisk character followed by a space (e.g., "* **Item Name:** Details").
- Use markdown bolding (**keyword**) for structural parameter headers.`
      }
    });

    return sendJson(res, 200, { reply: response.text });
  } catch (error) {
    console.error('====== NATIVE GOOGLE API DIAGNOSTIC LOG ======');
    console.error(error);
    console.error('===============================================');

    const errorMessage = error?.message || '';
    const quotaProblem = /RESOURCE_EXHAUSTED|quota|429|rate limit/i.test(errorMessage);
    const apiKeyProblem = /API key|PERMISSION_DENIED|403|leaked/i.test(errorMessage);

    return sendJson(res, quotaProblem ? 429 : apiKeyProblem ? 403 : 500, {
      error: quotaProblem ? 'Gemini API quota exceeded.' : apiKeyProblem ? 'Google API key rejected. Check your Vercel Environment Variables configuration.' : 'Internal API gateway validation fault caught.'
    });
  }
};
