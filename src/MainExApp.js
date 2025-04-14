import React, { useState, useRef } from "react";
import { login, sendMessage } from "./services/kingschat";
import { fetchDispatchBatch, prepareMessagesForDispatch } from "./services/dispatchService";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    success: 0,
    failed: 0
  });
  const progressRef = useRef(progress);

  const handleLogin = async () => {
    setError("");
    try {
      const authResponse = await login();
      setAccessToken(authResponse.accessToken);
      setIsLoggedIn(true);
    } catch (err) {
      setError("Failed to log in. Please try again.");
      console.error("Login error:", err);
    }
  };

const updateDispatchStatus = async (dmsg_id) => {
    try {
      const { success, failed } = progressRef.current;
      const totalProcessed = success + failed;

      const response = await fetch(
        "https://kingslist.pro/app/default/api/updateDispatchCount.php",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dmsg_id,
            dispatch_count: totalProcessed,
            status: failed > 0 ? 1 : 2,
          }),
        }
      );

      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      if (!data.success)
        throw new Error(data.error || "Failed to update dispatch status");

      return data;
    } catch (error) {
      console.error("Status update failed:", error);
      throw error;
    }
  };

  const handleDispatch = async (dmsg_id) => {
    setError("");
    setDispatching(true);
    setProgress({ current: 0, total: 0, success: 0, failed: 0 });
    progressRef.current = { current: 0, total: 0, success: 0, failed: 0 };

    try {
      // 1. Fetch batch data
      const batchData = await fetchDispatchBatch(dmsg_id);
      const messages = prepareMessagesForDispatch(batchData);

      setProgress((prev) => {
        const newState = { ...prev, total: messages.length };
        progressRef.current = newState;
        return newState;
      });

      // 2. Process messages
      const results = { success: 0, failed: 0 };

      for (const [index, msg] of messages.entries()) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 300));
          await sendMessage(accessToken, msg.kc_id, msg.body);
          results.success++;

          setProgress((prev) => {
            const newState = {
              ...prev,
              current: index + 1,
              success: results.success,
              failed: results.failed,
            };
            progressRef.current = newState;
            return newState;
          });
        } catch (err) {
          results.failed++;

          setProgress((prev) => {
            const newState = {
              ...prev,
              current: index + 1,
              success: results.success,
              failed: results.failed,
            };
            progressRef.current = newState;
            return newState;
          });
        }
      }

      // 3. Update dispatch status with final counts
      await updateDispatchStatus(dmsg_id);

      alert(
        `Processed ${results.success + results.failed} messages\n` +
          `Success: ${results.success}\n` +
          `Failed: ${results.failed}`
      );
    } catch (err) {
      setError(`Dispatch failed: ${err.message}`);
      console.error("Dispatch error:", err);
    } finally {
      setDispatching(false);
    }
  };


  return (
    <div style={{ padding: "20px", maxWidth: "500px", margin: "0 auto" }}>
      <h1>KingsChat Messenger</h1>

      {error && (
        <div style={{ 
          color: "red", 
          padding: "10px",
          marginBottom: "15px",
          background: "#ffecec",
          borderRadius: "5px"
        }}>
          {error}
        </div>
      )}

      {!isLoggedIn ? (
        <button 
          onClick={handleLogin} 
          style={{ 
            ...buttonStyle,
            background: "#28a745"
          }}
        >
          Log in with KingsChat
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          <button 
            onClick={() => handleDispatch(239)} 
            style={buttonStyle} 
            disabled={dispatching}
          >
            {dispatching ? (
              <>
                <span style={{
                  display: "inline-block",
                  width: "1rem",
                  height: "1rem",
                  border: "2px solid transparent",
                  borderTopColor: "white",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                  marginRight: "0.5rem"
                }}></span>
                Dispatching ({progress.current}/{progress.total})
              </>
            ) : "Dispatch Messages"}
          </button>

          {dispatching && (
            <div>
              <div style={{ 
                height: "10px", 
                background: "#e9ecef", 
                borderRadius: "5px",
                marginBottom: "5px"
              }}>
                <div 
                  style={{ 
                    height: "100%", 
                    width: `${(progress.current / progress.total) * 100}%`, 
                    background: progress.current === progress.total ? 
                      (progress.failed > 0 ? "#ffc107" : "#28a745") : "#007bff",
                    borderRadius: "5px",
                    transition: "width 0.3s"
                  }} 
                />
              </div>
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between",
                fontSize: "0.8rem"
              }}>
                <span>Success: {progress.success}</span>
                <span>Failed: {progress.failed}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const buttonStyle = {
  padding: "10px 20px",
  background: "#007bff",
  color: "white",
  border: "none",
  borderRadius: "5px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center
};

export default App;
