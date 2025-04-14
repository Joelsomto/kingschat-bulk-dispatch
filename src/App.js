


import React, { useState, useEffect, useRef, useCallback } from "react";
import { login, sendMessage, getMessageMetrics, resetMessageMetrics } from "./services/kingschat";
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
const [justLoggedIn, setJustLoggedIn] = useState(false);

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

 // Add handleDispatch to dependencies

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
      const { success, failed } = progressRef.current;
      const uniqueProcessed = processedMessages.size;
      const totalAttempts = Object.values(retryCounts).reduce((a, b) => a + b, 0);
console.log(success);

      const response = await fetch(
        "https://kingslist.pro/app/default/api/updateDispatchCount.php",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dmsg_id,
            dispatch_count: uniqueProcessed,
            attempts: totalAttempts,
            status: failed > 0 && uniqueProcessed < progressRef.current.total ? 1 : 2,
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
  }, [retryCounts, processedMessages]);

// Move handleDispatch before handleLogin
// const handleDispatch = useCallback(async (dmsg_id) => {
//   setError("");
//   setDispatching(true);
//   updateProgress(() => ({ current: 0, total: 0, success: 0, failed: 0 }));
//   setRetryCounts({});
//   setProcessedMessages(new Set());
//   resetMessageMetrics();

//   // Rate limiting configuration
//   const RATE_LIMIT = {
//     MESSAGE_DELAY_MS: 3000,
//     RETRY_DELAY_MS: 3000,
//     BATCH_DELAY_MS: 5000,
//     MAX_RETRY_ATTEMPTS: 1,
//     BATCH_SIZE: 10
//   };

//   try {
//     const batchData = await fetchDispatchBatch(dmsg_id);
//     let messages = prepareMessagesForDispatch(batchData);

//     messages = messages.map(msg => ({
//       ...msg,
//       body: msg.body
//         .replace(/<kc_username>/g, msg.username)
//         .replace(/<fullname>/g, msg.fullname),
//     }));

//     let remainingMessages = messages;
//     let attempt = 0;

//     updateProgress(prev => ({ ...prev, total: messages.length }));

//     while (remainingMessages.length > 0 && attempt < RATE_LIMIT.MAX_RETRY_ATTEMPTS) {
//       const currentBatch = remainingMessages.slice(0, RATE_LIMIT.BATCH_SIZE);
//       remainingMessages = remainingMessages.slice(RATE_LIMIT.BATCH_SIZE);

//       setRetryCounts(prev => {
//         const newCounts = { ...prev };
//         currentBatch.forEach(msg => {
//           if (!processedMessages.has(msg.kc_id)) {
//             newCounts[msg.kc_id] = (newCounts[msg.kc_id] || 0) + 1;
//           }
//         });
//         return newCounts;
//       });

//       for (const msg of currentBatch) {
//         if (processedMessages.has(msg.kc_id)) continue;

//         try {
//           await new Promise(res => setTimeout(res, RATE_LIMIT.MESSAGE_DELAY_MS));
//           const res = await sendMessage(accessToken, msg.kc_id, msg.body);

//           if (res.success) {
//             setProcessedMessages(prev => new Set(prev).add(msg.kc_id));
//             updateProgress(prev => ({
//               ...prev,
//               current: prev.current + 1,
//               success: prev.success + 1,
//             }));
//             continue;
//           }
//         } catch (err) {
//           console.warn(`Error sending to ${msg.kc_id}:`, err.message);
//         }

//         const currentRetry = retryCounts[msg.kc_id] || 0;
//         if (currentRetry < RATE_LIMIT.MAX_RETRY_ATTEMPTS) {
//           remainingMessages.push(msg);
//         } else {
//           updateProgress(prev => ({
//             ...prev,
//             current: prev.current + 1,
//             failed: prev.failed + 1,
//           }));
//         }
//       }

//       attempt++;
//       if (remainingMessages.length > 0) {
//         const delayAttempt = attempt; 
//         await new Promise(res => setTimeout(res, 
//           delayAttempt === 1 ? RATE_LIMIT.BATCH_DELAY_MS : RATE_LIMIT.RETRY_DELAY_MS
//         ));
//       }
//     }

//     const finalStatus = await updateDispatchStatus(dmsg_id);
//     if (!finalStatus.success) throw new Error("Update failed");

//     sessionStorage.setItem(`dispatch_status_${dmsg_id}`, "completed");
//     sessionStorage.setItem(`dispatch_analytics_${dmsg_id}`, JSON.stringify({
//       success: progressRef.current.success,
//       failed: progressRef.current.failed,
//       retries: Object.values(retryCounts).filter(c => c > 1).length
//     }));
    
//     const newUrl = new URL(window.location.href);
//     newUrl.searchParams.set("start_dispatch", "2");
//     window.history.pushState({}, "", newUrl.toString());

//   } catch (err) {
//     setError(`Dispatch error: ${err.message}`);
//   } finally {
//     setDispatching(false);
//     setJustLoggedIn(false); // Reset the flag when dispatch completes
//   }
// }, [accessToken, updateDispatchStatus, processedMessages, retryCounts]);

const handleDispatch = useCallback(async (dmsg_id) => {
  setError("");
  setDispatching(true);
  updateProgress({ current: 0, total: 0, success: 0, failed: 0 });
  setRetryCounts({});
  setProcessedMessages(new Set());
  resetMessageMetrics();

  // Rate limiting configuration
  const RATE_LIMIT = {
    MESSAGE_DELAY_MS: 3000,
    RETRY_DELAY_MS: 3000,
    BATCH_DELAY_MS: 5000,
    MAX_RETRY_ATTEMPTS: 1,
    BATCH_SIZE: 10
  };

  // Helper function for delay
  const delay = (ms) => new Promise(res => setTimeout(res, ms));

  try {
    const batchData = await fetchDispatchBatch(dmsg_id);
    let messages = prepareMessagesForDispatch(batchData).map(msg => ({
      ...msg,
      body: msg.body
        .replace(/<kc_username>/g, msg.username)
        .replace(/<fullname>/g, msg.fullname),
    }));

    updateProgress(prev => ({ ...prev, total: messages.length }));

    const messageQueue = [...messages];
    let attempt = 0;

    while (messageQueue.length > 0 && attempt <= RATE_LIMIT.MAX_RETRY_ATTEMPTS) {
      const currentBatch = messageQueue.splice(0, RATE_LIMIT.BATCH_SIZE);
      const batchResults = [];

      // Process batch in parallel
      for (const msg of currentBatch) {
        if (processedMessages.has(msg.kc_id)) continue;

        try {
          await delay(RATE_LIMIT.MESSAGE_DELAY_MS);
          const res = await sendMessage(accessToken, msg.kc_id, msg.body);

          if (res.success) {
            setProcessedMessages(prev => new Set(prev).add(msg.kc_id));
            updateProgress(prev => ({
              ...prev,
              current: prev.current + 1,
              success: prev.success + 1,
            }));
            batchResults.push({ success: true, msg });
            continue;
          }
        } catch (err) {
          console.warn(`Error sending to ${msg.kc_id}:`, err.message);
        }

        batchResults.push({ success: false, msg });
      }

      // Handle retries
      const failedMessages = batchResults
        .filter(result => !result.success)
        .map(result => result.msg);

      setRetryCounts(prev => {
        const newCounts = { ...prev };
        failedMessages.forEach(msg => {
          newCounts[msg.kc_id] = (newCounts[msg.kc_id] || 0) + 1;
        });
        return newCounts;
      });

      // Requeue failed messages if under retry limit
      const requeueMessages = failedMessages.filter(msg => 
        (retryCounts[msg.kc_id] || 0) < RATE_LIMIT.MAX_RETRY_ATTEMPTS
      );
      messageQueue.push(...requeueMessages);

      // Mark permanently failed messages
      const permanentFails = failedMessages.filter(msg => 
        (retryCounts[msg.kc_id] || 0) >= RATE_LIMIT.MAX_RETRY_ATTEMPTS
      );
      if (permanentFails.length > 0) {
        updateProgress(prev => ({
          ...prev,
          current: prev.current + permanentFails.length,
          failed: prev.failed + permanentFails.length,
        }));
      }

      attempt++;
      if (messageQueue.length > 0) {
        const delayTime = attempt === 1 
          ? RATE_LIMIT.BATCH_DELAY_MS 
          : RATE_LIMIT.RETRY_DELAY_MS;
        await delay(delayTime);
      }
    }

    const finalStatus = await updateDispatchStatus(dmsg_id);
    if (!finalStatus.success) throw new Error("Update failed");

    sessionStorage.setItem(`dispatch_status_${dmsg_id}`, "completed");
    sessionStorage.setItem(`dispatch_analytics_${dmsg_id}`, JSON.stringify({
      success: progressRef.current.success,
      failed: progressRef.current.failed,
      retries: Object.values(retryCounts).filter(c => c > 1).length
    }));
    
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set("start_dispatch", "2");
    window.history.pushState({}, "", newUrl.toString());

  } catch (err) {
    setError(`Dispatch error: ${err.message}`);
  } finally {
    setDispatching(false);
    setJustLoggedIn(false);
  }
}, [accessToken, updateDispatchStatus, processedMessages, retryCounts]);

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
    setJustLoggedIn(true);

    const urlParams = new URLSearchParams(window.location.search);
    const dmsg_id = urlParams.get("dmsg_id");
    const startDispatch = urlParams.get("start_dispatch");

    if (dmsg_id && startDispatch === "1") {
      handleDispatch(dmsg_id);
    } else {
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
    }
  } catch (err) {
    setError("Failed to log in. Please try again.");
    console.error("Login error:", err);
  }
}, [handleDispatch]);

// Update the useEffect to use justLoggedIn
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
    status === "in_progress" &&
    !justLoggedIn  // Now properly using the justLoggedIn state
  ) {
    handleDispatch(dmsg_id);
  }
}, [isLoggedIn, dispatching, handleDispatch, justLoggedIn]);

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
      status === "in_progress" &&
      !window.justLoggedIn
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
    if (!progress.total) return null;
    
    const messageMetrics = getMessageMetrics();
    const totalProcessed = progress.success + progress.failed;
    const pending = progress.total - totalProcessed;
  
    return (
      <div style={{ marginTop: "20px", padding: "10px", border: "1px solid #ccc", borderRadius: "8px" }}>
        <h4>Dispatch Summary</h4>
        <p><strong>Total:</strong> {progress.total}</p>
        <p style={{ color: "#28a745" }}><strong>Success:</strong> {progress.success}</p>
        <p style={{ color: "#dc3545" }}><strong>Failed:</strong> {progress.failed}</p>
        {pending > 0 && <p style={{ color: "#ffc107" }}><strong>Pending:</strong> {pending}</p>}
        
        <h4 style={{ marginTop: "15px" }}>API Call Metrics</h4>
        <p><strong>Total API Calls:</strong> {messageMetrics.successCount + messageMetrics.errorCount}</p>
        <p style={{ color: "#28a745" }}><strong>Successes:</strong> {messageMetrics.successCount}</p>
        <p style={{ color: "#dc3545" }}><strong>Errors:</strong> {messageMetrics.errorCount}</p>
        <p><strong>Success Rate:</strong> {Math.round((messageMetrics.successCount/(messageMetrics.successCount + messageMetrics.errorCount)) * 100)}%</p>
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