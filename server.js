const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// PostgreSQL connection
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER, 
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'postgres',
    port: process.env.DB_PORT,
    logging: console.log
  }
);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// User Model - FIXED
const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  // FIXED: Removed invalid 'db' field or corrected it
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('publisher', 'user'),
    defaultValue: 'user'
  },
  profile: {
    type: DataTypes.JSON, // FIXED: Changed 'json' to 'JSON'
    defaultValue: {}
  }
}, {
  tableName: 'users'
});

// Content Model (Supports multiple types) - FIXED
const Content = sequelize.define('Content', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('newspaper', 'journal', 'article', 'video_script'),
    allowNull: false
  },
  category: {
    type: DataTypes.STRING
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  status: {
    type: DataTypes.ENUM('draft', 'published', 'archived'), // FIXED: 'archieved' to 'archived'
    defaultValue: 'draft'
  },
  featuredImage: {
    type: DataTypes.STRING
  },
  videoUrl: {
    type: DataTypes.STRING
  },
  readTime: {
    type: DataTypes.INTEGER,
  },
  views: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  // ADDED: publisherId field for the relationship
  publisherId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'contents'
});

// Relationships - FIXED variable names
User.hasMany(Content, { foreignKey: 'publisherId' });
Content.belongsTo(User, { foreignKey: 'publisherId' });

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required'});
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Publisher Middleware
const requirePublisher = (req, res, next) => {
  if (req.user.role !== 'publisher') {
    return res.status(403).json({error: 'Publisher access required'});
  }
  next();
};

// Test PostgreSQL connection
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to PostgreSQL successfully!');
    
    const [results] = await sequelize.query('SELECT version()');
    console.log('📊 PostgreSQL Version:', results[0].version);
    
  } catch (error) {
    console.log('❌ PostgreSQL connection error:', error.message);
  }
}

// Sync database
async function syncDatabase() {
  try {
    await sequelize.sync({ force: false });
    console.log('✅ Database tables synced successfully!');
    
    // Create default admin publisher
    const existingPublisher = await User.findOne({ where: { role: 'publisher' } });
    if (!existingPublisher) {
      const hashedPassword = await bcrypt.hash('publisher123', 10);
      await User.create({
        username: 'admin',
        email: 'admin@news.com',
        password: hashedPassword,
        role: 'publisher'
      });
      console.log('✅ Default publisher created (admin/publisher123)');
    }
  } catch (error) {
    console.log('❌ Database sync error:', error);
  }
}

// Initialize database
async function initializeDatabase() {
  await testConnection();
  await syncDatabase();
}

initializeDatabase();

// Routes

// Home route
app.get('/', (req, res) => {
  res.json({
    message: 'News Publishing Platform API is running!',
    features: ['User Registration', 'Publisher Dashboard', 'Multiple Content Types', 'JWT Authentication'],
    status: 'Active'
  });
});

// Auth Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, role = 'user' } = req.body;
    
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      role
    });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Content Routes - Public
app.get('/api/contents', async (req, res) => {
  try {
    const { type, category, page = 1, limit = 10 } = req.query;
    
    const where = { status: 'published' };
    if (type) where.type = type;
    if (category) where.category = category;

    const offset = (page - 1) * limit;
    
    const contents = await Content.findAll({
      where,
      include: [{
        model: User,
        attributes: ['id', 'username', 'profile']
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json(contents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/contents/:id', async (req, res) => {
  try {
    const content = await Content.findOne({
      where: { 
        id: req.params.id,
        status: 'published'
      },
      include: [{
        model: User,
        attributes: ['id', 'username', 'profile']
      }]
    });

    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    // Increment view count
    await content.increment('views');

    res.json(content);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Publisher Routes - Protected
app.get('/api/publisher/contents', authenticateToken, requirePublisher, async (req, res) => {
  try {
    const contents = await Content.findAll({
      where: { publisherId: req.user.id },
      order: [['createdAt', 'DESC']]
    });
    res.json(contents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/publisher/contents', authenticateToken, requirePublisher, async (req, res) => {
  try {
    const { title, content, type, category, tags, featuredImage, videoUrl, readTime } = req.body;
    
    const newContent = await Content.create({
      title,
      content,
      type,
      category,
      tags: tags || [],
      featuredImage,
      videoUrl,
      readTime,
      publisherId: req.user.id
    });

    res.status(201).json(newContent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/publisher/contents/:id', authenticateToken, requirePublisher, async (req, res) => {
  try {
    const content = await Content.findOne({
      where: { 
        id: req.params.id,
        publisherId: req.user.id
      }
    });

    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    await content.update(req.body);
    res.json(content);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/publisher/contents/:id/publish', authenticateToken, requirePublisher, async (req, res) => {
  try {
    const content = await Content.findOne({
      where: { 
        id: req.params.id,
        publisherId: req.user.id
      }
    });

    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    await content.update({ status: 'published' });
    res.json({ message: 'Content published successfully', content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User Profile
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 News Backend Server running on port ${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}`);
  console.log(`📝 Documentation: http://localhost:${PORT}/`);
});