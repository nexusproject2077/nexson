/* ============================================
   NexSon – Backend API
   Express + MongoDB + JWT Authentication
   ============================================ */

require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const jwt      = require('jsonwebtoken');
const User     = require('./models/User');

const app  = express();
const PORT = process.env.PORT || 3001;

/* ── Middleware ── */
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));

/* ── JWT helpers ── */
const signToken = (userId) => jwt.sign(
  { id: userId },
  process.env.JWT_SECRET || 'nexson_dev_secret_change_in_production',
  { expiresIn: '30d' }
);

const verifyToken = (token) => jwt.verify(
  token,
  process.env.JWT_SECRET || 'nexson_dev_secret_change_in_production'
);

/* ── Auth middleware ── */
const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Non authentifié' });
  }
  try {
    const decoded = verifyToken(authHeader.slice(7));
    req.userId = decoded.id;
    next();
  } catch {
    res.status(401).json({ message: 'Token invalide ou expiré' });
  }
};

/* ═══════════════════════════════════════════
   ROUTES
═══════════════════════════════════════════ */

/* ── Health check ── */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'NexSon API', version: '1.0.0' });
});

/* ── Register ── */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Tous les champs sont requis' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ message: 'Un compte existe déjà avec cet email' });
    }

    const user = await User.create({ name, email, password });
    const token = signToken(user._id);

    res.status(201).json({
      message: 'Compte créé avec succès',
      token,
      user: user.toSafeObject(),
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const message = Object.values(err.errors).map(e => e.message).join(', ');
      return res.status(400).json({ message });
    }
    console.error('Register error:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

/* ── Login ── */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email et mot de passe requis' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    const isValid = await user.comparePassword(password);
    if (!isValid) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    const token = signToken(user._id);

    res.json({
      message: 'Connexion réussie',
      token,
      user: user.toSafeObject(),
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

/* ── Get current user ── */
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });
    res.json({ user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

/* ── Update profile ── */
app.patch('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const { name, avatar } = req.body;
    const updates = {};
    if (name) updates.name = name.trim();
    if (avatar !== undefined) updates.avatar = avatar;

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

    res.json({ user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

/* ── Change password ── */
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Les deux mots de passe sont requis' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Le nouveau mot de passe doit faire au moins 6 caractères' });
    }

    const user = await User.findById(req.userId).select('+password');
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) return res.status(401).json({ message: 'Mot de passe actuel incorrect' });

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Mot de passe mis à jour avec succès' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

/* ── 404 handler ── */
app.use((req, res) => {
  res.status(404).json({ message: 'Route introuvable' });
});

/* ── Error handler ── */
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Erreur interne du serveur' });
});

/* ═══════════════════════════════════════════
   DATABASE CONNECTION & START
═══════════════════════════════════════════ */
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nexson';

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✓ MongoDB connected');
    app.listen(PORT, () => {
      console.log(`✓ NexSon API running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('✗ MongoDB connection failed:', err.message);
    process.exit(1);
  });

module.exports = app;
