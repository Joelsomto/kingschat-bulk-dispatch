


import React, { useState, useEffect, useRef, useCallback } from "react";
import { login, sendMessage, getMessageMetrics, resetMessageMetrics , refreshToken} from "./services/kingschat";
import {
  fetchDispatchBatch,
  prepareMessagesForDispatch,
} from "./services/dispatchService";



function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem("kc_session") !== null;
  });
  const [accessToken, setAccessToken] = useState(() => {
    const session = localStorage.getItem("kc_session");
    return session ? JSON.parse(session).accessToken : "";
  });
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState("");
  const [dispatchId, setDispatchId] = useState("");
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    success: 0,
    failed: 0,
  });
  const [retryCounts, setRetryCounts] = useState({});
  const [processedMessages, setProcessedMessages] = useState(new Set());
  const progressRef = useRef(progress);

  const updateProgress = (updateFn) => {
    setProgress(prev => {
      const updated = updateFn(prev);
      progressRef.current = updated;
      return updated;
    });
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const dmsg_id = urlParams.get("dmsg_id");
    const start = urlParams.get("start_dispatch");

    if (dmsg_id) {
      setDispatchId(dmsg_id);
      if (start === "1") {
        const dispatchStatus = sessionStorage.getItem(`dispatch_status_${dmsg_id}`);
        if (!dispatchStatus || dispatchStatus !== "completed") {
          sessionStorage.setItem(`dispatch_status_${dmsg_id}`, "in_progress");
        }
      }
    }

    // Load saved analytics if available
    const savedAnalytics = sessionStorage.getItem(`dispatch_analytics_${dmsg_id}`);
    if (savedAnalytics) {
      const { success, failed } = JSON.parse(savedAnalytics);
      updateProgress(prev => ({ ...prev, success, failed }));
    }
  }, []);

  const handleLogin = useCallback(async () => {
    setError("");
    try {
      const authResponse = await login();

      const sessionData = {
        accessToken: authResponse.accessToken,
        refreshToken: authResponse.refreshToken || "",
        expiresIn: authResponse.expiresIn || 3600,
        timestamp: Date.now(),
      };
      localStorage.setItem("kc_session", JSON.stringify(sessionData));

      setAccessToken(authResponse.accessToken);
      setIsLoggedIn(true);

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
    }
  }, []);

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
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken: sessionData.accessToken }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.valid) {
            setAccessToken(sessionData.accessToken);
            setIsLoggedIn(true);
          } else {
            localStorage.removeItem("kc_session");
          }
        }
      } catch (err) {
        console.error("Session verification failed:", err);
        localStorage.removeItem("kc_session");
      }
    };

    verifySession();
  }, []);

  const updateDispatchStatus = useCallback(async (dmsg_id) => {
    try {
      const messageMetrics = getMessageMetrics();
      const response = await fetch(
        "https://kingslist.pro/app/default/api/updateDispatchCount.php",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dmsg_id,
            dispatch_count: messageMetrics.successCount,
            attempts: messageMetrics.totalProcessed,
            status: messageMetrics.errorCount > 0 ? 1 : 2,
          }),
        }
      );
  
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Failed to update status");
      return data;
    } catch (error) {
      console.error("Status update failed:", error);
      throw error;
    }
  }, []);

 
  
  // Memoize sendMessageWithTokenRecovery to prevent recreation on every render
  const sendMessageWithTokenRecovery = useCallback(async (msg, dmsg_id) => {
    let currentToken = accessToken;
    let retries = 0;
    const maxRetries = 2;
  
    while (retries < maxRetries) {
      try {
        await new Promise(res => setTimeout(res, 500)); // Small delay between sends
        const result = await sendMessage(currentToken, msg.kc_id, msg.body);
        return result;
      } catch (error) {
        if (error.message.includes('token') || error.message.includes('expired')) {
          console.log('Token expired, attempting refresh...');
          try {
            const session = JSON.parse(localStorage.getItem("kc_session"));
            const newToken = await refreshToken(session.refreshToken);
            
            const updatedSession = {
              ...session,
              accessToken: newToken.accessToken,
              refreshToken: newToken.refreshToken || session.refreshToken,
              timestamp: Date.now()
            };
            
            localStorage.setItem("kc_session", JSON.stringify(updatedSession));
            setAccessToken(newToken.accessToken);
            currentToken = newToken.accessToken;
            retries++;
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
            throw error;
          }
        } else {
          throw error;
        }
      }
    }
    throw new Error('Failed after token refresh attempts');
  }, [accessToken]); // Only depends on accessToken
  
  // Memoize processMessagesWithRetry with all required dependencies
  const processMessagesWithRetry = useCallback(async (messages, dmsg_id, isRetry) => {
    const RATE_LIMIT = {
      MESSAGE_DELAY_MS: 2000,
      BATCH_SIZE: 5,
      MAX_RETRY_ATTEMPTS: 2
    };
  
    let remainingMessages = [...messages];
    let attempt = 0;
  
    while (remainingMessages.length > 0 && attempt < RATE_LIMIT.MAX_RETRY_ATTEMPTS) {
      const currentBatch = remainingMessages.slice(0, RATE_LIMIT.BATCH_SIZE);
      remainingMessages = remainingMessages.slice(RATE_LIMIT.BATCH_SIZE);
  
      // Process batch with token recovery
      const results = await Promise.allSettled(
        currentBatch.map(msg => 
          sendMessageWithTokenRecovery(msg, dmsg_id)
            .then(() => ({ success: true, msg }))
            .catch(e => ({ success: false, msg, error: e }))
        )
      );
  
      // Update processed messages and retry counts
      const successful = results.filter(r => r.value.success);
      const failed = results.filter(r => !r.value.success);
  
      setProcessedMessages(prev => {
        const newSet = new Set(prev);
        successful.forEach(({ value }) => newSet.add(value.msg.kc_id));
        return newSet;
      });
  
      setRetryCounts(prev => {
        const newCounts = { ...prev };
        currentBatch.forEach(msg => {
          newCounts[msg.kc_id] = (newCounts[msg.kc_id] || 0) + 1;
        });
        return newCounts;
      });
  
      // Update progress from metrics
      const metrics = getMessageMetrics();
      updateProgress(prev => ({
        ...prev,
        current: metrics.totalProcessed,
        success: metrics.successCount,
        failed: metrics.errorCount
      }));
  
      // Prepare for next attempt
      if (failed.length > 0) {
        remainingMessages = [...remainingMessages, ...failed.map(f => f.value.msg)];
      }
  
      attempt++;
      if (remainingMessages.length > 0) {
        await new Promise(res => setTimeout(res, RATE_LIMIT.MESSAGE_DELAY_MS));
      }
    }
  }, [sendMessageWithTokenRecovery]); // Depends on the memoized sendMessageWithTokenRecovery
  
  // Main dispatch function with all required dependencies
  const handleDispatch = useCallback(async (dmsg_id, isRetry = false) => {
    setError("");
    setDispatching(true);
    
    if (!isRetry) {
      updateProgress(() => ({ current: 0, total: 0, success: 0, failed: 0 }));
      setRetryCounts({});
      setProcessedMessages(new Set());
      resetMessageMetrics();
    }
  
    try {
      const batchData = await fetchDispatchBatch(dmsg_id);
      let messages = prepareMessagesForDispatch(batchData);
  
      // If this is a retry, only process messages that had errors and weren't processed
      if (isRetry) {
        const metrics = getMessageMetrics();
        if (metrics.errorCount === 0) {
          throw new Error("No failed messages to retry");
        }
        messages = messages.filter(msg => 
          !processedMessages.has(msg.kc_id) && 
          (retryCounts[msg.kc_id] || 0) < 2
        );
      }
  
      messages = messages.map(msg => ({
        ...msg,
        body: msg.body
          .replace(/<kc_username>/g, msg.username)
          .replace(/<fullname>/g, msg.fullname),
      }));
  
      updateProgress(prev => ({ 
        ...prev, 
        total: isRetry ? messages.length : messages.length 
      }));
  
      // Process messages with retry logic
      await processMessagesWithRetry(messages, dmsg_id, isRetry);
  
      const finalStatus = await updateDispatchStatus(dmsg_id);
      if (!finalStatus.success) throw new Error("Update failed");
  
      sessionStorage.setItem(`dispatch_status_${dmsg_id}`, "completed");
      sessionStorage.setItem(`dispatch_analytics_${dmsg_id}`, JSON.stringify({
        success: getMessageMetrics().successCount,
        failed: getMessageMetrics().errorCount,
        retries: Object.values(retryCounts).filter(c => c > 1).length
      }));
  
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set("start_dispatch", "2");
      window.history.pushState({}, "", newUrl.toString());
  
    } catch (err) {
      setError(`Dispatch error: ${err.message}`);
    } finally {
      setDispatching(false);
    }
  }, [

    updateDispatchStatus, 
    processMessagesWithRetry, 
    processedMessages, 
    retryCounts
  ]);



// Enhanced token management in App component
const [tokenRefreshInterval, setTokenRefreshInterval] = useState(null);

const startTokenRefresh = useCallback(() => {
  // Clear any existing interval
  if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);

  const interval = setInterval(async () => {
    const session = localStorage.getItem("kc_session");
    if (!session) return;

    const sessionData = JSON.parse(session);
    try {
      const newToken = await refreshToken(sessionData.refreshToken);
      const updatedSession = {
        ...sessionData,
        accessToken: newToken.accessToken,
        refreshToken: newToken.refreshToken || sessionData.refreshToken,
        timestamp: Date.now()
      };
      localStorage.setItem("kc_session", JSON.stringify(updatedSession));
      setAccessToken(newToken.accessToken);
      console.log('Token refreshed successfully');
    } catch (error) {
      console.error("Token refresh failed:", error);
      clearInterval(interval);
      localStorage.removeItem("kc_session");
      setIsLoggedIn(false);
    }
  }, 15000); // Refresh every 15 seconds to prevent expiration

  setTokenRefreshInterval(interval);
  return interval;
}, [tokenRefreshInterval]);

useEffect(() => {
  if (isLoggedIn) {
    const interval = startTokenRefresh();
    return () => clearInterval(interval);
  }
}, [isLoggedIn, startTokenRefresh]);


  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const dmsg_id = urlParams.get("dmsg_id");
    const start = urlParams.get("start_dispatch");
    const status = sessionStorage.getItem(`dispatch_status_${dmsg_id}`);

    if (
      isLoggedIn &&
      dmsg_id &&
      !dispatching &&
      start === "1" &&
      status === "in_progress"
    ) {
      handleDispatch(dmsg_id);
    }
  }, [isLoggedIn, dispatching, handleDispatch]);

  // Helper: Visual Progress Bar
  const ProgressBar = () => {
    if (!progress.total) return null;
    const percent = (progress.current / progress.total) * 100;
    return (
      <div style={{ marginTop: "10px", background: "#e0e0e0", borderRadius: "8px", height: "20px" }}>
        <div
          style={{
            width: `${percent}%`,
            background: percent === 100 ? "#28a745" : "#007bff",
            height: "100%",
            borderRadius: "8px",
            transition: "width 0.3s ease-in-out",
          }}
        />
      </div>
    );
  };

  const DispatchAnalytics = () => {
    const metrics = getMessageMetrics();
    
    if (!progress.total || (dispatching && progress.current === 0)) return null;
  
    return (
      <div style={{ marginTop: "20px", padding: "10px", border: "1px solid #ccc", borderRadius: "8px" }}>
        {progress.current >= progress.total && (
          <div style={{color: "#28a745", fontWeight: "bold", marginBottom: "10px"}}>
            {metrics.errorCount > 0 ? "Dispatch Completed with Errors" : "Dispatch Successfully Completed"}
          </div>
        )}
        <h4>Dispatch Summary</h4>
        <p><strong>Total:</strong> {progress.total}</p>
        <p style={{ color: "#28a745" }}><strong>Success:</strong> {metrics.successCount}</p>
        <p style={{ color: "#dc3545" }}><strong>Failed:</strong> {metrics.errorCount}</p>
        <p style={{ color: "#ffc107" }}><strong>Success Rate:</strong> {metrics.successRate.toFixed(1)}%</p>
        
        {metrics.errorCount > 0 && (
          <div>
            <button
              onClick={() => handleDispatch(dispatchId, true)}
              style={{
                padding: "10px 20px",
                background: "#ffc107",
                color: "black",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
                fontWeight: "bold",
                marginTop: "10px"
              }}
            >
              Retry Failed Messages ({metrics.errorCount})
            </button>
            <p style={{ color: "#dc3545", marginTop: "5px" }}>
              Click to retry {metrics.errorCount} failed message(s)
            </p>
          </div>
        )}
        
        <a href="https://kingslist.pro/messages" style={{ 
          display: "block", 
          marginTop: "15px",
          color: "#007bff", 
          textDecoration: "underline" 
        }}>
          Go to Messages Page
        </a>
      </div>
    );
  };

  return (
    <div style={{ padding: "30px", maxWidth: "600px", margin: "auto", fontFamily: "sans-serif" }}>
      <h2 style={{ color: "#2a2a2a" }}>Kingslist Portal</h2>
      <p>Welcome! Log in with KingsChat to begin dispatching your message batch.</p>

      {error && (
        <div style={{ background: "#ffe0e0", padding: "10px", borderRadius: "5px", color: "#b00020" }}>
          {error}
        </div>
      )}

      {!isLoggedIn ? (
        <button
          onClick={handleLogin}
          style={{
            padding: "10px 20px",
            background: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Log in with KingsChat
        </button>
      ) : (
        <div>
          {dispatching && (
            <div style={{ margin: "20px 0", color: "#28a745" }}>
              Dispatching... {progress.current} / {progress.total} (
              {progress.success} success, {progress.failed} failed)
              <ProgressBar />
            </div>
          )}

          <DispatchAnalytics />

          {!dispatching && dispatchId && (
            <button
              onClick={() => handleDispatch(dispatchId)}
              style={{
                padding: "10px 20px",
                background: "#28a745",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Start Dispatch
            </button>
          )}

        </div>
      )}
    </div>
  );
}

export default App;