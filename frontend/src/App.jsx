import { useEffect, useState } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

async function request(path, { token, ...options } = {}) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("The API returned an invalid response");
  }

  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }

  return data;
}

function App() {
  const [apiStatus, setApiStatus] = useState("Checking");
  const [mode, setMode] = useState("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [entries, setEntries] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [destinationAccountNo, setDestinationAccountNo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDescription, setTransferDescription] = useState("");
  const [adjustment, setAdjustment] = useState({
    accountId: "",
    type: "CREDIT",
    amount: "",
    description: ""
  });
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let active = true;

    fetch(`${API_BASE}/health`)
      .then((response) => {
        if (!response.ok) throw new Error("Health request failed");
        return response.json();
      })
      .then((data) => {
        if (active) setApiStatus(data.status === "healthy" ? "Connected" : "Unavailable");
      })
      .catch(() => {
        if (active) setApiStatus("Disconnected");
      });

    return () => {
      active = false;
    };
  }, []);

  const loadDashboard = async (activeToken, user) => {
    setIsLoading(true);
    try {
      if (user.role === "ADMIN") {
        const [userData, accountData, logData] = await Promise.all([
          request("/api/admin/users", { token: activeToken }),
          request("/api/admin/accounts", { token: activeToken }),
          request("/api/admin/audit-logs", { token: activeToken })
        ]);
        setUsers(userData.users);
        setAccounts(accountData.accounts);
        setAuditLogs(logData.logs);
        setAdjustment((current) => ({
          ...current,
          accountId: current.accountId || accountData.accounts[0]?.id || ""
        }));
      } else {
        const accountData = await request("/api/accounts", { token: activeToken });
        setAccounts(accountData.accounts);
        const firstAccountId = accountData.accounts[0]?.id || "";
        setSelectedAccountId((current) => current || firstAccountId);
        if (firstAccountId) {
          const ledgerData = await request(`/api/accounts/${firstAccountId}/ledger`, {
            token: activeToken
          });
          setEntries(ledgerData.entries);
        } else {
          setEntries([]);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuth = async (event) => {
    event.preventDefault();
    setMessage("");
    setIsLoading(true);

    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body = mode === "register" ? { name, email, password } : { email, password };
      const data = await request(endpoint, {
        method: "POST",
        body: JSON.stringify(body)
      });

      setPassword("");
      setName("");
      setEmail("");

      if (mode === "register") {
        setMessage(data.message);
        return;
      }

      setToken(data.token);
      setCurrentUser(data.user);
      await loadDashboard(data.token, data.user);
      setMessage(data.message);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshDashboard = async () => {
    if (!token || !currentUser) return;
    setMessage("");

    try {
      await loadDashboard(token, currentUser);
      setMessage("Information refreshed.");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const openAccount = async () => {
    setMessage("");
    try {
      const data = await request("/api/accounts", {
        method: "POST",
        token,
        body: JSON.stringify({})
      });
      setSelectedAccountId(data.account.id);
      await loadDashboard(token, currentUser);
      setMessage(data.message);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const loadLedger = async (accountId) => {
    setSelectedAccountId(accountId);
    try {
      const data = await request(`/api/accounts/${accountId}/ledger`, { token });
      setEntries(data.entries);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const makeTransfer = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const data = await request(`/api/accounts/${selectedAccountId}/transfers`, {
        method: "POST",
        token,
        body: JSON.stringify({
          destinationAccountNo,
          amount: transferAmount,
          description: transferDescription
        })
      });
      setDestinationAccountNo("");
      setTransferAmount("");
      setTransferDescription("");
      await loadDashboard(token, currentUser);
      setMessage(`${data.message}. Reference: ${data.referenceId}`);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const updateUserStatus = async (user) => {
    setMessage("");
    const action = user.status === "PENDING" ? "approve" : "suspend";

    try {
      const data = await request(`/api/admin/users/${user.id}/${action}`, {
        method: "PATCH",
        token
      });
      await loadDashboard(token, currentUser);
      setMessage(data.message);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const recordAdjustment = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const data = await request(
        `/api/admin/accounts/${adjustment.accountId}/adjustments`,
        {
          method: "POST",
          token,
          body: JSON.stringify({
            type: adjustment.type,
            amount: adjustment.amount,
            description: adjustment.description
          })
        }
      );
      setAdjustment((current) => ({ ...current, amount: "", description: "" }));
      await loadDashboard(token, currentUser);
      setMessage(`${data.message}. Reference: ${data.referenceId}`);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const logOut = () => {
    setToken("");
    setCurrentUser(null);
    setAccounts([]);
    setUsers([]);
    setAuditLogs([]);
    setEntries([]);
    setSelectedAccountId("");
    setMessage("You have been logged out.");
  };

  return (
    <div className="app-shell">
      <header className="navbar">
        <div>
          <h2>BalanceVault</h2>
          <span>Secure account management</span>
        </div>
        <div className="nav-actions">
          <span className={`status-pill ${apiStatus === "Connected" ? "online" : ""}`}>
            API {apiStatus}
          </span>
          {currentUser && (
            <button type="button" className="nav-button" onClick={logOut}>
              Log out
            </button>
          )}
        </div>
      </header>

      <main className="dashboard">
        <section className="hero-panel">
          <p className="welcome">BALANCEVAULT · ACCOUNT & LEDGER</p>
          <h1>Money movement with a ledger you can prove.</h1>
          <p className="description">
            Accounts start with pending onboarding. Approved users can transfer
            funds, while every completed movement is recorded against both
            accounts and included in the audit trail.
          </p>
        </section>

        {message && (
          <div className="message" role="status" aria-live="polite">
            {message}
          </div>
        )}

        {!currentUser ? (
          <section className="panel auth-panel">
            <div className="toggle-row" role="tablist" aria-label="Authentication">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "register"}
                className={mode === "register" ? "active" : ""}
                onClick={() => setMode("register")}
              >
                Create account
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                className={mode === "login" ? "active" : ""}
                onClick={() => setMode("login")}
              >
                Log in
              </button>
            </div>

            <form onSubmit={handleAuth} className="auth-form">
              {mode === "register" && (
                <label>
                  Full name
                  <input
                    autoComplete="name"
                    maxLength={100}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </label>
              )}
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  minLength={8}
                  maxLength={72}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              <button type="submit" className="primary-btn" disabled={isLoading}>
                {isLoading ? "Please wait..." : mode === "register" ? "Register" : "Log in"}
              </button>
            </form>
            <p className="helper-text">
              Registrations require administrator approval before sign-in.
            </p>
          </section>
        ) : (
          <section className="workspace">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{currentUser.role.replace("_", " ")}</p>
                <h2>Hello, {currentUser.name}</h2>
                <p className="muted">{currentUser.email}</p>
              </div>
              <button
                type="button"
                className="secondary-btn"
                onClick={refreshDashboard}
                disabled={isLoading}
              >
                Refresh
              </button>
            </div>

            {currentUser.role === "ADMIN" ? (
              <div className="content-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h3>Account holders</h3>
                    <span className="count-badge">{users.length}</span>
                  </div>
                  {users.length === 0 ? (
                    <p className="muted">No account holders registered yet.</p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Status</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map((user) => (
                            <tr key={user.id}>
                              <td>{user.name}</td>
                              <td>{user.email}</td>
                              <td><span className={`badge ${user.status.toLowerCase()}`}>{user.status}</span></td>
                              <td>
                                {user.status !== "SUSPENDED" && (
                                  <button
                                    type="button"
                                    className="text-button"
                                    onClick={() => updateUserStatus(user)}
                                  >
                                    {user.status === "PENDING" ? "Approve" : "Suspend"}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="panel">
                  <div className="panel-heading">
                    <h3>Accounts</h3>
                    <span className="count-badge">{accounts.length}</span>
                  </div>
                  {accounts.length === 0 ? (
                    <p className="muted">Approved account holders will appear here.</p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Owner</th>
                            <th>Account number</th>
                            <th>Balance (INR)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {accounts.map((account) => (
                            <tr key={account.id}>
                              <td>{account.user.name}</td>
                              <td>{account.accountNo}</td>
                              <td>{account.balance}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="panel">
                  <h3>Record account adjustment</h3>
                  <p className="muted">
                    Administrative credits and debits are also written to the ledger.
                  </p>
                  <form className="auth-form compact-form" onSubmit={recordAdjustment}>
                    <label>
                      Account
                      <select
                        value={adjustment.accountId}
                        onChange={(event) =>
                          setAdjustment({ ...adjustment, accountId: event.target.value })
                        }
                        required
                      >
                        <option value="" disabled>Select an account</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.accountNo} · {account.user.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Type
                      <select
                        value={adjustment.type}
                        onChange={(event) =>
                          setAdjustment({ ...adjustment, type: event.target.value })
                        }
                      >
                        <option value="CREDIT">Credit</option>
                        <option value="DEBIT">Debit</option>
                      </select>
                    </label>
                    <label>
                      Amount (INR)
                      <input
                        inputMode="decimal"
                        value={adjustment.amount}
                        onChange={(event) =>
                          setAdjustment({ ...adjustment, amount: event.target.value })
                        }
                        placeholder="0.00"
                        required
                      />
                    </label>
                    <label>
                      Reason
                      <input
                        maxLength={160}
                        value={adjustment.description}
                        onChange={(event) =>
                          setAdjustment({ ...adjustment, description: event.target.value })
                        }
                        required
                      />
                    </label>
                    <button className="primary-btn" type="submit" disabled={!accounts.length}>
                      Record adjustment
                    </button>
                  </form>
                </section>

                <section className="panel">
                  <div className="panel-heading">
                    <h3>Audit trail</h3>
                    <span className="count-badge">Latest {auditLogs.length}</span>
                  </div>
                  {auditLogs.length === 0 ? (
                    <p className="muted">No audit events have been recorded.</p>
                  ) : (
                    <ul className="audit-list">
                      {auditLogs.map((log) => (
                        <li key={log.id}>
                          <div>
                            <strong>{log.action.replaceAll("_", " ")}</strong>
                            <span>{log.actor?.name || "System"} · {log.actor?.email || "System"}</span>
                          </div>
                          <time dateTime={log.createdAt}>
                            {new Date(log.createdAt).toLocaleString()}
                          </time>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            ) : (
              <div className="content-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h3>Your accounts</h3>
                    <button type="button" className="text-button" onClick={openAccount}>
                      Open account
                    </button>
                  </div>
                  {accounts.length === 0 ? (
                    <p className="muted">No accounts are open yet.</p>
                  ) : (
                    <div className="account-list">
                      {accounts.map((account) => (
                        <button
                          type="button"
                          className={`account-card ${selectedAccountId === account.id ? "selected" : ""}`}
                          key={account.id}
                          onClick={() => loadLedger(account.id)}
                        >
                          <span>Account ···· {account.accountNo.slice(-4)}</span>
                          <strong>₹{account.balance}</strong>
                          <small>{account.status} · Full number {account.accountNo}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <section className="panel">
                  <h3>Transfer funds</h3>
                  <p className="muted">
                    Transfers are atomic: both account balances and ledger entries update together.
                  </p>
                  <form className="auth-form compact-form" onSubmit={makeTransfer}>
                    <label>
                      From account
                      <select
                        value={selectedAccountId}
                        onChange={(event) => loadLedger(event.target.value)}
                        required
                      >
                        <option value="" disabled>Select an account</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.accountNo} · ₹{account.balance}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Recipient account number
                      <input
                        inputMode="numeric"
                        pattern="[0-9]{14}"
                        maxLength={14}
                        value={destinationAccountNo}
                        onChange={(event) => setDestinationAccountNo(event.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Amount (INR)
                      <input
                        inputMode="decimal"
                        value={transferAmount}
                        onChange={(event) => setTransferAmount(event.target.value)}
                        placeholder="0.00"
                        required
                      />
                    </label>
                    <label>
                      Note (optional)
                      <input
                        maxLength={160}
                        value={transferDescription}
                        onChange={(event) => setTransferDescription(event.target.value)}
                      />
                    </label>
                    <button
                      className="primary-btn"
                      type="submit"
                      disabled={!accounts.length || !selectedAccountId}
                    >
                      Send transfer
                    </button>
                  </form>
                </section>

                <section className="panel ledger-panel">
                  <h3>Account ledger</h3>
                  {entries.length === 0 ? (
                    <p className="muted">No ledger entries for this account yet.</p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Amount</th>
                            <th>Description</th>
                            <th>Reference</th>
                            <th>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entries.map((entry) => (
                            <tr key={entry.id}>
                              <td><span className={`badge ${entry.type.toLowerCase()}`}>{entry.type}</span></td>
                              <td>₹{entry.amount}</td>
                              <td>{entry.description || "—"}</td>
                              <td className="reference">{entry.referenceId || "—"}</td>
                              <td>{new Date(entry.createdAt).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            )}
          </section>
        )}
      </main>
      <footer className="footer">
        Demonstration application using synthetic data only. Not for real funds.
      </footer>
    </div>
  );
}

export default App;
