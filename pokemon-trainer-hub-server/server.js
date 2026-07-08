require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const { auth } = require('express-oauth2-jwt-bearer');
const { PrismaMssql } = require('@prisma/adapter-mssql');
const { PrismaClient } = require('@prisma/client');

const app = express();
const PORT = 3000;

const adapter = new PrismaMssql(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

app.use(cors());
app.use(express.json());

const jwtCheck = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  tokenSigningAlg: 'RS256',
});

// Test route — just to confirm the server is alive
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Pokemon Trainer Hub API is running!' });
});

// Day 1 smoke-test route — proves a valid Auth0 access token is accepted
app.get('/api/private', jwtCheck, (req, res) => {
  res.json({ message: 'Token verified — you are authenticated!' });
});

// Returns the current user's Trainer Profile, or 404 if not created yet
app.get('/api/profile', jwtCheck, async (req, res) => {
  const profile = await prisma.trainerProfile.findUnique({
    where: { auth0UserId: req.auth.payload.sub },
  });

  if (!profile) {
    return res.status(404).json({ message: 'No profile found for this user.' });
  }

  res.json(profile);
});

// Creates or updates the current user's Trainer Profile
app.post('/api/profile', jwtCheck, async (req, res) => {
  const { trainerName, favoriteType, experienceLevel, firstName, lastName, dateOfBirth, country } =
    req.body;

  if (
    !trainerName ||
    !favoriteType ||
    !experienceLevel ||
    !firstName ||
    !lastName ||
    !dateOfBirth ||
    !country
  ) {
    return res.status(400).json({
      message:
        'trainerName, favoriteType, experienceLevel, firstName, lastName, dateOfBirth and country are all required.',
    });
  }

  const data = {
    trainerName,
    favoriteType,
    experienceLevel,
    firstName,
    lastName,
    dateOfBirth: new Date(dateOfBirth),
    country,
  };

  const profile = await prisma.trainerProfile.upsert({
    where: { auth0UserId: req.auth.payload.sub },
    update: data,
    create: { auth0UserId: req.auth.payload.sub, ...data },
  });

  res.json(profile);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});