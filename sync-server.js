const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json());

const DB_FILE = path.join(__dirname, 'data', 'state.json');
function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch(e) { return { tasks: [], optionals: [] }; }
}
function writeDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/state', (req, res) => { res.json(readDB()); });

app.put('/api/state', (req, res) => {
  try { writeDB(req.body); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/tasks/:id', (req, res) => {
  const db = readDB();
  const idx = db.tasks.findIndex(t => t.id == req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'not found' });
  Object.assign(db.tasks[idx], req.body);
  writeDB(db);
  res.json(db.tasks[idx]);
});

app.put('/api/tasks/:taskId/sub-items/:subId', (req, res) => {
  const db = readDB();
  const t = db.tasks.find(t => t.id == req.params.taskId);
  if (!t || !t.sub_items) return res.status(404).json({ error: 'not found' });
  let subs = typeof t.sub_items === 'string' ? JSON.parse(t.sub_items) : t.sub_items;
  const s = subs.find(s => s.id == req.params.subId);
  if (!s) return res.status(404).json({ error: 'not found' });
  s.completed = req.body.completed;
  t.sub_items = JSON.stringify(subs);
  t.completed = subs.every(s => s.completed) ? 1 : 0;
  writeDB(db);
  res.json({ ok: true });
});

app.put('/api/optional-items/:id', (req, res) => {
  const db = readDB();
  const idx = db.optionals.findIndex(o => o.id == req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'not found' });
  Object.assign(db.optionals[idx], req.body);
  writeDB(db);
  res.json(db.optionals[idx]);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Sync server on port ' + PORT));
