import express from 'express';
import { getTransition } from './transition.js';
import { validateStateFrame } from '../shared/protocol.js';
import { encodeFrame } from '../shared/ndjson.js';

const app = express();
const PORT = 3000;

app.use(express.json());

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

app.get('/', (_req, res) => {
  res.send('<h1>StateSurface dev server</h1>');
});

// Only listen when run directly (not imported for testing)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`StateSurface dev server running at http://localhost:${PORT}`);
  });
}

export { app };
