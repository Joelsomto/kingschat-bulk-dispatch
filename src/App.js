


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
      const {  failed } = progressRef.current;
      const messageMetrics = getMessageMetrics();
      const uniqueProcessed = messageMetrics.successCount + messageMetrics.errorCount;
    const totalAttempts = Object.values(retryCounts).reduce((a, b) => a + b, 0);

    
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
  }, [retryCounts]);

//   const handleDispatch = useCallback(async (dmsg_id) => {
//     setError("");
//     setDispatching(true);
//     updateProgress(() => ({ current: 0, total: 0, success: 0, failed: 0 }));
//     setRetryCounts({});
//     setProcessedMessages(new Set());
//     resetMessageMetrics();

//     // Rate limiting configuration
//     const RATE_LIMIT = {
//         MESSAGE_DELAY_MS: 3000, // Base delay between messages
//         RETRY_DELAY_MS: 3000,   // Delay for retries
//         BATCH_DELAY_MS: 5000,   // Delay after each batch
//         MAX_RETRY_ATTEMPTS: 1,  // Max retry attempts
//         BATCH_SIZE: 10          // Messages per batch
//     };

//     try {
//         const batchData = await fetchDispatchBatch(dmsg_id);
//         let messages = prepareMessagesForDispatch(batchData);

//         messages = messages.map(msg => ({
//             ...msg,
//             body: msg.body
//                 .replace(/<kc_username>/g, msg.username)
//                 .replace(/<fullname>/g, msg.fullname),
//         }));

//         let remainingMessages = messages;
//         let attempt = 0;

//         updateProgress(prev => ({ ...prev, total: messages.length }));

//         while (remainingMessages.length > 0 && attempt < RATE_LIMIT.MAX_RETRY_ATTEMPTS) {
//             const currentBatch = remainingMessages.slice(0, RATE_LIMIT.BATCH_SIZE);
//             remainingMessages = remainingMessages.slice(RATE_LIMIT.BATCH_SIZE);

//             // Update retry counts
//             setRetryCounts(prev => {
//                 const newCounts = { ...prev };
//                 currentBatch.forEach(msg => {
//                     if (!processedMessages.has(msg.kc_id)) {
//                         newCounts[msg.kc_id] = (newCounts[msg.kc_id] || 0) + 1;
//                     }
//                 });
//                 return newCounts;
//             });

//             // Process current batch
//             for (const msg of currentBatch) {
//                 if (processedMessages.has(msg.kc_id)) continue;

//                 try {
//                     await new Promise(res => setTimeout(res, RATE_LIMIT.MESSAGE_DELAY_MS));
//                     const res = await sendMessage(accessToken, msg.kc_id, msg.body);

//                     if (res.success) {
//                         setProcessedMessages(prev => new Set(prev).add(msg.kc_id));
//                         updateProgress(prev => ({
//                             ...prev,
//                             current: prev.current + 1,
//                             success: prev.success + 1,
//                         }));
//                         continue;
//                     }
//                 } catch (err) {
//                     console.warn(`Error sending to ${msg.kc_id}:`, err.message);
//                 }

//                 const currentRetry = retryCounts[msg.kc_id] || 0;
//                 if (currentRetry < RATE_LIMIT.MAX_RETRY_ATTEMPTS) {
//                     remainingMessages.push(msg);
//                 } else {
//                     updateProgress(prev => ({
//                         ...prev,
//                         current: prev.current + 1,
//                         failed: prev.failed + 1,
//                     }));
//                 }
//             }

//             attempt++;
//             if (remainingMessages.length > 0) {
//               const delayAttempt = attempt; 
//               await new Promise(res => setTimeout(res, 
//                   delayAttempt === 1 ? RATE_LIMIT.BATCH_DELAY_MS : RATE_LIMIT.RETRY_DELAY_MS
//               ));
//           }
//         }

//         const finalStatus = await updateDispatchStatus(dmsg_id);
//         if (!finalStatus.success) throw new Error("Update failed");

//         sessionStorage.setItem(`dispatch_status_${dmsg_id}`, "completed");
//         sessionStorage.setItem(`dispatch_analytics_${dmsg_id}`, JSON.stringify({
//             success: progressRef.current.success,
//             failed: progressRef.current.failed,
//             retries: Object.values(retryCounts).filter(c => c > 1).length
//         }));
        
//         const newUrl = new URL(window.location.href);
//         newUrl.searchParams.set("start_dispatch", "2");
//         window.history.pushState({}, "", newUrl.toString());

//     } catch (err) {
//         setError(`Dispatch error: ${err.message}`);
//     } finally {
//         setDispatching(false);
//     }
// }, [accessToken, updateDispatchStatus, processedMessages, retryCounts]);
const handleDispatch = useCallback(async (dmsg_id) => {
  setError("");
  setDispatching(true);
  updateProgress({ current: 0, total: 0, success: 0, failed: 0 });
  setRetryCounts({});
  setProcessedMessages(new Set());
  resetMessageMetrics();

  // Enhanced rate limiting configuration
  const RATE_LIMIT = {
    MESSAGE_DELAY_MS: 2000,
    RETRY_DELAY_MS: 5000,
    BATCH_DELAY_MS: 10000,
    MAX_RETRY_ATTEMPTS: 2,
    BATCH_SIZE: 5,
    MAX_PARALLEL: 3
  };

  try {
    const batchData = await fetchDispatchBatch(dmsg_id);
    let messages = prepareMessagesForDispatch(batchData).map(msg => ({
      ...msg,
      body: msg.body.replace(/<kc_username>/g, msg.username)
                   .replace(/<fullname>/g, msg.fullname)
    }));

    updateProgress(prev => ({ ...prev, total: messages.length }));

    const processSingleMessage = async (msg, currentAttempt) => {
      try {
        await new Promise(res => setTimeout(res, RATE_LIMIT.MESSAGE_DELAY_MS));
        const res = await sendMessage(accessToken, msg.kc_id, msg.body);
        
        if (res.success) {
          setProcessedMessages(prev => new Set(prev).add(msg.kc_id));
          updateProgress(prev => ({
            ...prev,
            current: prev.current + 1,
            success: prev.success + 1,
          }));
          return true;
        }
      } catch (err) {
        console.warn(`Attempt ${currentAttempt+1} failed for ${msg.kc_id}:`, err.message);
      }
      return false;
    };

    const processMessageBatch = async (batch, currentAttempt) => {
      const parallelSlots = Math.min(RATE_LIMIT.MAX_PARALLEL, batch.length);
      const slotPromises = [];
      
      for (let slotIndex = 0; slotIndex < parallelSlots; slotIndex++) {
        slotPromises.push(
          (async () => {
            for (let msgIndex = slotIndex; msgIndex < batch.length; msgIndex += parallelSlots) {
              const msg = batch[msgIndex];
              if (processedMessages.has(msg.kc_id)) continue;
              
              const success = await processSingleMessage(msg, currentAttempt);
              if (!success) {
                return msg; // Return message for requeue
              }
            }
            return null;
          })()
        );
      }
      
      const results = await Promise.all(slotPromises);
      return results.filter(msg => msg !== null);
    };

    let messageQueue = [...messages];
    let attempt = 0;

    while (messageQueue.length > 0 && attempt <= RATE_LIMIT.MAX_RETRY_ATTEMPTS) {
      const currentBatch = messageQueue.splice(0, RATE_LIMIT.BATCH_SIZE);
      const failedMessages = await processMessageBatch(currentBatch, attempt);
      
      if (failedMessages.length > 0) {
        failedMessages.forEach(msg => {
          setRetryCounts(prev => ({
            ...prev,
            [msg.kc_id]: (prev[msg.kc_id] || 0) + 1
          }));
        });
        messageQueue.push(...failedMessages);
      }

      attempt++;
      if (messageQueue.length > 0) {
        const delayTime = attempt === 1 
          ? RATE_LIMIT.BATCH_DELAY_MS 
          : RATE_LIMIT.RETRY_DELAY_MS;
        await new Promise(res => setTimeout(res, delayTime));
      }
    }

    // Handle final failed messages
    const permanentFails = messageQueue.filter(msg => 
      (retryCounts[msg.kc_id] || 0) >= RATE_LIMIT.MAX_RETRY_ATTEMPTS
    );
    
    if (permanentFails.length > 0) {
      updateProgress(prev => ({
        ...prev,
        current: prev.current + permanentFails.length,
        failed: prev.failed + permanentFails.length,
      }));
    }

    // Final status update
    const finalStatus = await updateDispatchStatus(dmsg_id);
    if (!finalStatus.success) throw new Error("Update failed");

    // Enhanced analytics
    const metrics = getMessageMetrics();
    sessionStorage.setItem(`dispatch_analytics_${dmsg_id}`, JSON.stringify({
      users: {
        total: messages.length,
        success: progressRef.current.success,
        failed: progressRef.current.failed
      },
      api: {
        calls: metrics.successCount + metrics.errorCount,
        successes: metrics.successCount,
        errors: metrics.errorCount,
        successRate: Math.round((metrics.successCount / (metrics.successCount + metrics.errorCount)) * 100 || 0)
      },
      retries: Object.values(retryCounts).filter(c => c > 1).length
    }));

    // Update URL
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set("start_dispatch", "2");
    window.history.pushState({}, "", newUrl.toString());

  } catch (err) {
    setError(`Dispatch error: ${err.message}`);
    console.error('Dispatch failed:', err);
  } finally {
    setDispatching(false);
  }
}, [accessToken, updateDispatchStatus, processedMessages, retryCounts]);

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
    if (!progress.total || (dispatching && progress.current === 0)) return null;
    
    // Get the message send metrics
    const messageMetrics = getMessageMetrics();
    const metrics = getMessageMetrics();
console.log(`Final Message Metrics - Successes: ${metrics.successCount}, Errors: ${metrics.errorCount}`);
  
    return (
      <div style={{ marginTop: "20px", padding: "10px", border: "1px solid #ccc", borderRadius: "8px" }}>
        {progress.current >= progress.total && (
          <div style={{color: "#28a745", fontWeight: "bold", marginBottom: "10px"}}>
            {progress.failed > 0 ? "Dispatch Completed with Errors" : "Dispatch Successfully Completed"}
          </div>
        )}
        <h4>Dispatch Summary</h4>
        <p><strong>Total:</strong> {progress.total}</p>
        {/* <p style={{ color: "#28a745" }}><strong>Success:</strong> {progress.success}</p>
        <p style={{ color: "#dc3545" }}><strong>Failed:</strong> {progress.failed}</p> */}
        <p style={{ color: "#ffc107" }}><strong>Retried:</strong> {
          Object.values(retryCounts).filter(count => count > 1).length
        }</p>
        
        {/* Add the message send metrics */}
        <h4 style={{ marginTop: "15px" }}>Message Send Metrics</h4>
        <p style={{ color: "#28a745" }}><strong> Successes:</strong> {messageMetrics.successCount}</p>
        <p style={{ color: "#dc3545" }}><strong> Errors:</strong> {messageMetrics.errorCount}</p>
        
        <a href="https://kingslist.pro/messages" style={{ color: "#007bff", textDecoration: "underline" }}>
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