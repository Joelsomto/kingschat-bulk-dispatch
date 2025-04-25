import React, { useState, useEffect } from "react";
import { login } from "./services/kingschat";

function LoginForm() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem("kc_session") !== null;
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const authResponse = await login();

      const sessionData = {
        accessToken: authResponse.accessToken,
        refreshToken: authResponse.refreshToken || "",
        expiresIn: authResponse.expiresIn || 3600,
        timestamp: Date.now(),
      };
      localStorage.setItem("kc_session", JSON.stringify(sessionData));
      setIsLoggedIn(true);

      // Redirect to callback URL with tokens
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "https://kingslist.pro/callback";

      const addField = (name, value) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      };

      addField("accessToken", authResponse.accessToken);
      addField("refreshToken", authResponse.refreshToken || "");
      addField("expiresIn", authResponse.expiresIn || 3600);

      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      setError("Failed to log in. Please try again.");
      console.error("Login error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const verifySession = async () => {
      const session = localStorage.getItem("kc_session");
      if (!session) return;
  
      try {
        const sessionData = JSON.parse(session);
        const response = await fetch(
          "https://kingslist.pro/app/default/api/verify_session.php",
          {
            method: "POST",
            credentials: 'include',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accessToken: sessionData.accessToken,
              refreshToken: sessionData.refreshToken
            }),
          }
        );
  
        if (response.ok) {
          const data = await response.json();
          if (!data.valid) {
            localStorage.removeItem("kc_session");
            setIsLoggedIn(false);
          } else if (data.newToken) {
            const updatedSession = {
              ...sessionData,
              accessToken: data.newToken,
              timestamp: Date.now()
            };
            localStorage.setItem("kc_session", JSON.stringify(updatedSession));
          }
        }
      } catch (err) {
        console.error("Session verification failed:", err);
        localStorage.removeItem("kc_session");
        setIsLoggedIn(false);
      }
    };
  
    verifySession();
    const interval = setInterval(verifySession, 300000); // Check every 5 minutes
    return () => clearInterval(interval);
  }, []);

  if (isLoggedIn) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>Welcome Back!</h2>
          <p>You are already logged in.</p>
          <button 
            className="auth-button"
            onClick={() => {
              localStorage.removeItem("kc_session");
              setIsLoggedIn(false);
            }}
          >
            Log Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Login with KingsChat</h2>
        <p>Connect your KingsChat account to continue</p>
        
        {error && <div className="auth-error">{error}</div>}

        <button
          className="auth-button"
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="spinner"></span>
              Connecting...
            </>
          ) : (
            "Login with KingsChat"
          )}
        </button>
      </div>
    </div>
  );
}

export default LoginForm;