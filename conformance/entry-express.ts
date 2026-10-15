import express from 'express';
import { fixture } from './fixture.js';
import { surface } from '../engine/adapters/express.js';
const app = express();
app.use(surface({ ...fixture(), staticDir: 'conformance/public' }));
app.listen(Number(process.env.PORT ?? 3400));
