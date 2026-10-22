require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { pool, initDb } = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// Health check: tells us the server AND database are alive
app.get("/api/health", async (req, res) => {
  try {
    const r = await pool.query("SELECT NOW() AS time");
    res.json({ status: "ok", database: "connected", time: r.rows[0].time });
  } catch (err) {
    res.status(500).json({ status: "error", database: "unreachable", message: err.message });
  }
});

// READ all tasks
app.get("/api/tasks", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM tasks ORDER BY id DESC");
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE a task
app.post("/api/tasks", async (req, res) => {
  const title = (req.body.title || "").trim();
  if (!title) return res.status(400).json({ error: "Title is required" });
  try {
    const r = await pool.query("INSERT INTO tasks (title) VALUES ($1) RETURNING *", [title]);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE (toggle done)
app.put("/api/tasks/:id", async (req, res) => {
  try {
    const r = await pool.query(
      "UPDATE tasks SET done = NOT done WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Task not found" });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE
app.delete("/api/tasks/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM tasks WHERE id = $1", [req.params.id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;

initDb()
  .then(() => app.listen(PORT, () => console.log(`API running on port ${PORT}`)))
  .catch((err) => {
    console.error("Could not connect to database:", err.message);
    process.exit(1);
  });
