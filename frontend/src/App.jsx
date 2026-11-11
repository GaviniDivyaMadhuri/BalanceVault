
import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [apiStatus, setApiStatus] = useState("Checking...");

  useEffect(() => {
    fetch("http://localhost:5000/health")
      .then((response) => {
        if (!response.ok) {
          throw new Error("API request failed");
        }
        return response.json();
      })
      .then((data) => {
        setApiStatus(
          data.status === "healthy" ? "Connected" : "Unavailable"
        );
      })
      .catch(() => {
        setApiStatus("Disconnected");
      });
  }, []);

  return (
    <div className="app">
      <header className="navbar">
        <h2>BalanceVault</h2>
        <span>Secure Account Management</span>
      </header>

      <main className="dashboard">
        <p className="welcome">WELCOME TO BALANCEVAULT</p>
        <h1>Manage your accounts with confidence.</h1>
        <p className="description">
          A secure platform for account management, controlled access,
          and transparent financial records.
        </p>

        <div className="status-card">
          <h3>Backend Connection</h3>
          <p>API Status: <strong>{apiStatus}</strong></p>
          <p>Backend URL: localhost:5000</p>
        </div>
      </main>
    </div>
  );
}

export default App;
