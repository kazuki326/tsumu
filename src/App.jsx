import { useEffect, useState } from "react";
import { api } from "./api";

export default function App(){
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [coins, setCoins] = useState("");
  const [history, setHistory] = useState([]);
  const [board, setBoard] = useState([]);
  const loggedIn = !!localStorage.getItem("token");

  const load = async () => {
    if (loggedIn){
      setHistory(await api.myCoins(14));
    }
    const b = await api.board();
    setBoard(b.board || []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [loggedIn]);

  const doAuth = async (mode) => {
    const res = mode==="register" ? await api.register(name, pin) : await api.login(name, pin);
    if (res.token){
      localStorage.setItem("token", res.token);
      setName(""); setPin("");
      await load();
    } else {
      alert(res.error || "failed");
    }
  };

  const submitCoins = async () => {
    const n = Number(coins);
    if (!Number.isInteger(n) || n < 0) return alert("0以上の整数で入力してね");
    const res = await api.postCoins(n);
    if (res.error) return alert(res.error);
    setCoins("");
    await load();
  };

  return (
    <div className="container">
      <h1>TSUMU COINS</h1>

      {!loggedIn ? (
        <div className="card">
          <h2>ログイン / 新規登録</h2>
          <input placeholder="名前" value={name} onChange={e=>setName(e.target.value)} />
          <input placeholder="PIN(4桁以上)" value={pin} onChange={e=>setPin(e.target.value)} />
          <div className="row">
            <button onClick={()=>doAuth("login")}>ログイン</button>
            <button onClick={()=>doAuth("register")}>新規登録</button>
          </div>
        </div>
      ) : (
        <div className="card">
          <h2>今日のコイン</h2>
          <input placeholder="コイン数" value={coins} onChange={e=>setCoins(e.target.value)} />
          <div className="row">
            <button onClick={submitCoins}>保存</button>
            <button className="ghost" onClick={()=>{ localStorage.removeItem("token"); location.reload(); }}>ログアウト</button>
          </div>
        </div>
      )}

      <div className="grid">
        <div className="card">
          <h3>自分の履歴（直近14日）</h3>
          <table>
            <thead><tr><th>日付</th><th>コイン</th><th>前日比</th></tr></thead>
            <tbody>
              {history.map(r=>(
                <tr key={r.date_ymd}>
                  <td>{r.date_ymd}</td>
                  <td>{r.coins.toLocaleString()}</td>
                  <td className={r.diff>=0?"pos":"neg"}>{r.diff>=0?`+${r.diff}`:r.diff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>今日のランキング（前日比）</h3>
          <ol>
            {board.map(b=>(
              <li key={b.name}>
                <span>{b.name}</span>
                <b className={b.diff>=0?"pos":"neg"}>{b.diff>=0?`+${b.diff}`:b.diff}</b>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <footer>API: {import.meta.env.VITE_API_BASE}</footer>
    </div>
  );
}
