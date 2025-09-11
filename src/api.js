const BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";
const getToken = () => localStorage.getItem("token");
const authHeader = () => ({ Authorization: `Bearer ${getToken()}` });

export const api = {
  async register(name, pin){
    const r = await fetch(`${BASE}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, pin })
    });
    return r.json();
  },
  async login(name, pin){
    const r = await fetch(`${BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, pin })
    });
    return r.json();
  },
  async postCoins(coins){
    const r = await fetch(`${BASE}/api/coins`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ coins })
    });
    return r.json();
  },
  async myCoins(days=30){
    const r = await fetch(`${BASE}/api/coins?days=${days}`, { headers: { ...authHeader() } });
    return r.json();
  },
  async board(date){
    const r = await fetch(`${BASE}/api/board${date?`?date=${date}`:""}`);
    return r.json();
  }
};
