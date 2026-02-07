import express from 'express';
import { getTransition } from './transition.js';
import { validateStateFrame } from '../shared/protocol.js';
import { encodeFrame } from '../shared/ndjson.js';
import { fillHState, buildStateScript } from './ssr.js';
import { createSSRRenderer } from './ssrRenderer.js';
import { registerDemoTransitions } from '../demo/transitions.js';
import { registerDemoTemplates } from '../demo/templates.js';
import { demoLayout } from '../demo/layout.js';

const app = express();
const PORT = 3000;

app.use(express.json());

// Register demo transitions and templates
registerDemoTransitions();
registerDemoTemplates();

// POST /transition/:name — NDJSON streaming endpoint
app.post('/transition/:name', async (req, res) => {
  const handler = getTransition(req.params.name);

  if (!handler) {
    res.status(404).json({ error: `Transition "${req.params.name}" not found` });
    return;
  }

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Transfer-Encoding', 'chunked');

  try {
    const gen = handler(req.body ?? {});

    for await (const frame of gen) {
      // Validate before streaming
      const result = validateStateFrame(frame);
      if (!result.valid) {
        const errorFrame = encodeFrame({
          type: 'error',
          message: `Invalid frame: ${result.reason}`,
        });
        res.write(errorFrame);
        break;
      }

      res.write(encodeFrame(frame));

      if (frame.type === 'done') break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown server error';
    res.write(encodeFrame({ type: 'error', message }));
  }

  res.end();
});

// SSR demo page — serves initial article load with SSR-filled anchors
function renderDemoPage(): string {
  const initialStates: Record<string, any> = {
    'page:header': { title: 'Blog', nav: 'article' },
    'page:content': {
      loading: false,
      articleId: 1,
      title: 'Article #1',
      body: 'This is the content of article 1. Server-rendered on initial load.',
    },
  };

  const renderer = createSSRRenderer();
  const stateScript = buildStateScript(initialStates);
  const shell = demoLayout('', stateScript);
  return fillHState(shell, initialStates, renderer);
}

app.get('/', (_req, res) => {
  res.send(renderDemoPage());
});

// Dev server with Vite middleware for client-side TS
async function startDev() {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

  // Vite handles client TS/JS module serving
  app.use(vite.middlewares);

  app.listen(PORT, () => {
    console.log(`StateSurface dev server running at http://localhost:${PORT}`);
    console.log(`  Debug overlay: http://localhost:${PORT}/?debug=1`);
  });
}

// Only listen when run directly (not imported for testing)
if (process.env.NODE_ENV !== 'test') {
  startDev();
}

export { app };
