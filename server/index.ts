import express from 'express';

const app = express();
const PORT = 3000;

app.use(express.json());

// Phase 2: POST /transition/:name NDJSON stream route will go here

app.get('/', (_req, res) => {
  res.send('<h1>StateSurface dev server</h1>');
});

app.listen(PORT, () => {
  console.log(`StateSurface dev server running at http://localhost:${PORT}`);
});
