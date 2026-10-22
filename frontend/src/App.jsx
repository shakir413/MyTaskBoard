import { useEffect, useState } from "react";

// Relative URL: works locally (Vite proxy) AND on AWS (CloudFront routes /api/* to EC2)
const API = "/api";

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [health, setHealth] = useState(null);
  const [error, setError] = useState("");

  async function loadAll() {
    try {
      const [h, t] = await Promise.all([
        fetch(`${API}/health`).then((r) => r.json()),
        fetch(`${API}/tasks`).then((r) => r.json()),
      ]);
      setHealth(h);
      setTasks(Array.isArray(t) ? t : []);
      setError("");
    } catch {
      setHealth({ status: "error", database: "unreachable" });
      setError("Can't reach the server. Check that the backend is running.");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function addTask(e) {
    e.preventDefault();
    if (!title.trim()) return;
    await fetch(`${API}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setTitle("");
    loadAll();
  }

  async function toggle(id) {
    await fetch(`${API}/tasks/${id}`, { method: "PUT" });
    loadAll();
  }

  async function remove(id) {
    await fetch(`${API}/tasks/${id}`, { method: "DELETE" });
    loadAll();
  }

  const ok = health?.status === "ok";

  return (
    <main className="page">
      <header className="top">
        <h1>Taskboard</h1>
        <div className={`status ${ok ? "up" : "down"}`}>
          <span className="dot" />
          {health === null ? "Checking..." : ok ? "API and database connected" : "Backend not reachable"}
        </div>
      </header>

      <form className="add" onSubmit={addTask}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          aria-label="New task"
        />
        <button type="submit">Add task</button>
      </form>

      {error && <p className="error">{error}</p>}

      <ul className="list">
        {tasks.length === 0 && !error && <li className="empty">No tasks yet. Add your first one above.</li>}
        {tasks.map((t) => (
          <li key={t.id} className={t.done ? "done" : ""}>
            <label>
              <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} />
              <span>{t.title}</span>
            </label>
            <button className="ghost" onClick={() => remove(t.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </main>
  );
}
