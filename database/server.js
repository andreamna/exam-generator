// server.js
const express    = require('express');
const session    = require('express-session');
const bodyParser = require('body-parser');
const bcrypt     = require('bcrypt');
const path       = require('path');
const fs         = require('fs');
const sqlite3    = require('sqlite3').verbose();
const multer     = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 10;

// Ensure upload directories exist
['uploads/lectures','uploads/exams','uploads/submissions'].forEach(dir=>{
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer storage config
const storage = multer.diskStorage({
  destination: (req,file,cb) => {
    let dest = 'uploads/lectures';
    if (file.fieldname === 'examTemplate') dest = 'uploads/exams';
    if (file.fieldname === 'submission')   dest = 'uploads/submissions';
    cb(null, dest);
  },
  filename: (req,file,cb) => {
    const name = Date.now() + '-' + file.originalname;
    cb(null, name);
  }
});
const upload = multer({ storage });

// --- Database setup ---
const db = new sqlite3.Database(path.join(__dirname, 'data.db'), err => {
  if (err) throw err;
  console.log('Connected to SQLite');
});
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      passwordHash TEXT NOT NULL
    )`);
  db.run(`
    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      graderId TEXT NOT NULL,
      studentId TEXT NOT NULL,
      studentName TEXT NOT NULL,
      score REAL NOT NULL,
      date TEXT NOT NULL,
      FOREIGN KEY(graderId) REFERENCES users(id)
    )`);
  db.run(`
    CREATE TABLE IF NOT EXISTS lectures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uploaderId TEXT NOT NULL,
      filename TEXT NOT NULL,
      path TEXT NOT NULL,
      uploadDate TEXT NOT NULL,
      FOREIGN KEY(uploaderId) REFERENCES users(id)
    )`);
  db.run(`
    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creatorId TEXT NOT NULL,
      filename TEXT NOT NULL,
      path TEXT NOT NULL,
      createDate TEXT NOT NULL,
      FOREIGN KEY(creatorId) REFERENCES users(id)
    )`);
  db.run(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      examId INTEGER NOT NULL,
      questionText TEXT NOT NULL,
      type TEXT NOT NULL,
      maxScore REAL,
      FOREIGN KEY(examId) REFERENCES exams(id)
    )`);
  db.run(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      examId INTEGER NOT NULL,
      studentId TEXT NOT NULL,
      studentName TEXT NOT NULL,
      filename TEXT NOT NULL,
      path TEXT NOT NULL,
      submitDate TEXT NOT NULL,
      FOREIGN KEY(examId) REFERENCES exams(id)
    )`);
});

app.use(bodyParser.json());
app.use(session({
  secret: 'replace_with_a_secure_secret',
  resave: false,
  saveUninitialized: true,
}));

// Serve static front-end & uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// --- Signup ---
app.post('/signup', (req, res) => {
  const { id, name, password, confirm } = req.body;
  if (!id || !name || !password || !confirm)
    return res.status(400).json({ error: 'All fields required' });
  if (password !== confirm)
    return res.status(400).json({ error: 'Passwords must match' });
  db.get(`SELECT id FROM users WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) return res.status(400).json({ error: 'ID taken' });
    bcrypt.hash(password, SALT_ROUNDS, (err, hash) => {
      if (err) return res.status(500).json({ error: err.message });
      db.run(`INSERT INTO users (id,name,passwordHash) VALUES (?,?,?)`,
        [id, name, hash],
        err => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ ok: true });
        }
      );
    });
  });
});

// --- Login ---
app.post('/login', (req, res) => {
  const { id, password } = req.body;
  if (!id || !password)
    return res.status(400).json({ error: 'ID+password required' });
  db.get(`SELECT id,name,passwordHash FROM users WHERE id = ?`, [id], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    bcrypt.compare(password, user.passwordHash, (err, match) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!match) return res.status(401).json({ error: 'Invalid credentials' });
      req.session.user = { id: user.id, name: user.name };
      res.json({ ok: true, user: req.session.user });
    });
  });
});

// --- Logout & Auth status ---
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ ok: true });
  });
});
app.get('/auth-status', (req, res) => {
  res.json({ user: req.session.user || null });
});

// --- Upload lecture materials ---
app.post('/upload-lectures', upload.array('lectureFiles', 10), (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const date = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO lectures (uploaderId,filename,path,uploadDate)
    VALUES (?,?,?,?)
  `);
  req.files.forEach(file => {
    stmt.run(req.session.user.id, file.originalname, file.path, date);
  });
  stmt.finalize(err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

// --- List lecture files ---
app.get('/lectures', (req, res) => {
  db.all(`SELECT id,uploaderId,filename,path,uploadDate FROM lectures`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- Delete a lecture file ---
app.delete('/lectures/:id', (req, res) => {
  const id = req.params.id;
  db.get(`SELECT path FROM lectures WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Not found' });
    fs.unlink(row.path, () => {
      db.run(`DELETE FROM lectures WHERE id = ?`, [id], err => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
      });
    });
  });
});

// --- Upload exam template ---
app.post('/upload-exam', upload.single('examTemplate'), (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const date = new Date().toISOString();
  db.run(`
    INSERT INTO exams (creatorId,filename,path,createDate)
    VALUES (?,?,?,?)
  `, [req.session.user.id, req.file.originalname, req.file.path, date],
  err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

// --- List exam templates ---
app.get('/exams', (req, res) => {
  db.all(`SELECT id,creatorId,filename,path,createDate FROM exams`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- Submit student paper ---
app.post('/upload-submission', upload.single('submission'), (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const { examId, studentId, studentName } = req.body;
  const date = new Date().toISOString();
  db.run(`
    INSERT INTO submissions
      (examId,studentId,studentName,filename,path,submitDate)
    VALUES (?,?,?,?,?,?)
  `, [examId, studentId, studentName,
        req.file.originalname, req.file.path, date],
  err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

// --- List submissions for an exam ---
app.get('/submissions/:examId', (req, res) => {
  db.all(`
    SELECT id,studentId,studentName,filename,path,submitDate
    FROM submissions
    WHERE examId = ?
  `, [req.params.examId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- Submit a single grade ---
app.post('/submit-score', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const { studentId, studentName, score } = req.body;
  if (!studentId||!studentName||score==null)
    return res.status(400).json({ error: 'Missing fields' });
  const date = new Date().toISOString();
  db.run(`
    INSERT INTO grades (graderId,studentId,studentName,score,date)
    VALUES (?,?,?,?,?)
  `, [req.session.user.id, studentId, studentName, score, date],
  err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

// --- Fetch previous grades ---
app.get('/scores', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  db.all(`
    SELECT studentId,studentName,score,date
    FROM grades
    WHERE graderId = ?
    ORDER BY date DESC
  `, [req.session.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- AI-powered batch grading endpoint ---
app.post('/grade-batch', upload.fields([
  { name:'template',      maxCount:1 },
  { name:'answerKey',     maxCount:1 },
  { name:'studentPapers', maxCount:100 }
]), async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error:'Not logged in' });

  // STUB: Replace with your AI logic
  const papers = req.files['studentPapers'] || [];
  const results = papers.map(f => ({
    studentId:   'extracted-id',
    studentName: 'extracted-name',
    score:       Math.floor(Math.random()*101),
    paperUrl:    '/' + f.path.replace(/\\/g,'/')
  }));

  // Persist those grades
  const date = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO grades (graderId,studentId,studentName,score,date)
    VALUES (?,?,?,?,?)
  `);
  results.forEach(r => {
    stmt.run(req.session.user.id, r.studentId, r.studentName, r.score, date);
  });
  stmt.finalize();

  res.json(results);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
