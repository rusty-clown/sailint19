const express = require('express');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');

dotenv.config();
const app = express();

// Настройка CORS - только для API в development
if (process.env.NODE_ENV !== 'production') {
    app.use(cors({ origin: 'http://localhost:8000' }));
}

app.use(express.json());

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
    destination: './Uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Подключение к базе данных
const db = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: process.env.PORT,
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 10000, // 10 секунд таймаут
    ssl: {
        rejectUnauthorized: false
    },
    authPlugins: {
        mysql_clear_password: () => () => Buffer.from(process.env.MYSQL_PASSWORD + '\0')
    }
});

// Улучшенная проверка подключения
db.getConnection()
    .then(conn => {
        console.log('✅ Successfully connected to database');
        conn.release();
        // Запуск сервера только после успешного подключения к БД
        app.listen(process.env.PORT, () => {
            console.log(`🚀 Server running on http://localhost:${process.env.PORT}`);
        });
    })
    .catch(err => {
        console.error('❌ Database connection failed:', err);
        process.exit(1); // Завершаем процесс при ошибке подключения
    });

// Middleware для проверки токена
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token required' });
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// Регистрация
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    try {
        // Проверка, существует ли пользователь с таким email
        const [existingUsers] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Хэширование пароля
        const hashedPassword = await bcrypt.hash(password, 10);

        // Вставка нового пользователя в базу данных
        await db.query('INSERT INTO users (email, password) VALUES (?, ?)', [email, hashedPassword]);

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Вход
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    try {
        console.log('Login attempt with email:', email);

        // Поиск пользователя по email
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        console.log('Database query result:', users);

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = users[0];

        console.log('User found:', user);

        // Проверка пароля
        const isMatch = await bcrypt.compare(password, user.password);
        console.log('Password match:', isMatch);

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Генерация JWT токена
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        console.log('Generated token:', token);

        res.json({ token });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Получение текущего пользователя
app.get('/api/me', authenticateToken, async (req, res) => {
    try {
        const [users] = await db.query('SELECT id, email FROM users WHERE id = ?', [req.user.id]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(users[0]);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// --- Repairs Routes (защищенные) ---
app.get('/api/repairs', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const [rows] = await db.query('SELECT * FROM repairs LIMIT ? OFFSET ?', [limit, offset]);
        const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM repairs');

        res.json({ repairs: rows, total });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/repairs/:id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM repairs WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Repair not found' });
        }
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/repairs', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        const { brand, model, year, problem, status, price } = req.body;
        const image = req.file ? `/uploads/${req.file.filename}` : null;

        const [result] = await db.query(
            'INSERT INTO repairs (brand, model, year, problem, status, price, image) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [brand, model, year, problem, status, price, image]
        );
        res.status(201).json({ id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/repairs/:id', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        const { brand, model, year, problem, status, price } = req.body;
        const image = req.file ? `/uploads/${req.file.filename}` : req.body.image;

        await db.query(
            'UPDATE repairs SET brand = ?, model = ?, year = ?, problem = ?, status = ?, price = ?, image = ? WHERE id = ?',
            [brand, model, year, problem, status, price, image, req.params.id]
        );
        res.json({ message: 'Repair updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/repairs/:id', authenticateToken, async (req, res) => {
    try {
        await db.query('DELETE FROM repairs WHERE id = ?', [req.params.id]);
        res.json({ message: 'Repair deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Details Routes (защищенные) ---
app.get('/api/details', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const [rows] = await db.query('SELECT * FROM details LIMIT ? OFFSET ?', [limit, offset]);
        const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM details');

        res.json({ details: rows, total });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/details/:id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM details WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Detail not found' });
        }
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/details', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        const { name, description, price, quantity, is_available, weight } = req.body;
        const image = req.file ? `/uploads/${req.file.filename}` : null;

        const [result] = await db.query(
            'INSERT INTO details (name, description, price, quantity, image, is_available, weight) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, description, price, quantity, image, is_available === 'true', weight]
        );
        res.status(201).json({ id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/details/:id', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        const { name, description, price, quantity, is_available, weight } = req.body;
        const image = req.file ? `/uploads/${req.file.filename}` : req.body.image;

        await db.query(
            'UPDATE details SET name = ?, description = ?, price = ?, quantity = ?, image = ?, is_available = ?, weight = ? WHERE id = ?',
            [name, description, price, quantity, image, is_available === 'true', weight, req.params.id]
        );
        res.json({ message: 'Detail updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/details/:id', authenticateToken, async (req, res) => {
    try {
        await db.query('DELETE FROM details WHERE id = ?', [req.params.id]);
        res.json({ message: 'Detail deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Статические файлы для загрузок
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));

// Обслуживание статических файлов Vue.js приложения
app.use(express.static(path.join(__dirname, 'public')));

// Обработка всех остальных запросов для Vue Router
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});