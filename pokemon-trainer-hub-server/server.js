require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');

const jwtCheck = require('./middleware/auth');
const pokemonRouter = require('./routes/pokemon');
const teamRouter = require('./routes/team');
const profileRouter = require('./routes/profile');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Test route — just to confirm the server is alive
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Pokemon Trainer Hub API is running!' });
});

// Day 1 smoke-test route — proves a valid Auth0 access token is accepted
app.get('/api/private', jwtCheck, (req, res) => {
  res.json({ message: 'Token verified — you are authenticated!' });
});

app.use('/api/pokemon', pokemonRouter);
app.use('/api/team', teamRouter);
app.use('/api/profile', profileRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
