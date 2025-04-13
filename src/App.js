

// import React, { useState, useEffect, useRef, useCallback } from "react";
// import { login, sendMessage } from "./services/kingschat";
// import {
//   fetchDispatchBatch,
//   prepareMessagesForDispatch,
// } from "./services/dispatchService";

// // Constants
// const MAX_RETRY_ATTEMPTS = 1;
// const MESSAGE_DELAY_MS = 1000;
// const RETRY_DELAY_MS = 1000;

// function App() {
//   const [isLoggedIn, setIsLoggedIn] = useState(() => {
//     return localStorage.getItem("kc_session") !== null;
//   });
//   const [accessToken, setAccessToken] = useState(() => {
//     const session = localStorage.getItem("kc_session");
//     return session ? JSON.parse(session).accessToken : "";
//   });
//   const [dispatching, setDispatching] = useState(false);
//   const [error, setError] = useState("");
//   const [dispatchId, setDispatchId] = useState("");
//   const [progress, setProgress] = useState({
//     current: 0,
//     total: 0,
//     success: 0,
//     failed: 0,
//   });
//   const [retryCounts, setRetryCounts] = useState({});
//   const [processedMessages, setProcessedMessages] = useState(new Set());
//   const progressRef = useRef(progress);

//   const updateProgress = (updateFn) => {
//     setProgress(prev => {
//       const updated = updateFn(prev);
//       progressRef.current = updated;
//       return updated;
//     });
//   };

//   useEffect(() => {
//     const urlParams = new URLSearchParams(window.location.search);
//     const dmsg_id = urlParams.get("dmsg_id");
//     const start = urlParams.get("start_dispatch");

//     if (dmsg_id) {
//       setDispatchId(dmsg_id);
//       if (start === "1") {
//         const dispatchStatus = sessionStorage.getItem(`dispatch_status_${dmsg_id}`);
//         if (!dispatchStatus || dispatchStatus !== "completed") {
//           sessionStorage.setItem(`dispatch_status_${dmsg_id}`, "in_progress");
//         }
//       }
//     }

//     // Load saved analytics if available
//     const savedAnalytics = sessionStorage.getItem(`dispatch_analytics_${dmsg_id}`);
//     if (savedAnalytics) {
//       const { success, failed } = JSON.parse(savedAnalytics);
//       updateProgress(prev => ({ ...prev, success, failed }));
//     }
//   }, []);

//   const handleLogin = useCallback(async () => {
//     setError("");
//     try {
//       const authResponse = await login();

//       const sessionData = {
//         accessToken: authResponse.accessToken,
//         refreshToken: authResponse.refreshToken || "",
//         expiresIn: authResponse.expiresIn || 3600,
//         timestamp: Date.now(),
//       };
//       localStorage.setItem("kc_session", JSON.stringify(sessionData));

//       setAccessToken(authResponse.accessToken);
//       setIsLoggedIn(true);

//       const form = document.createElement("form");
//       form.method = "POST";
//       form.action = "https://kingslist.pro/callback";

//       const addField = (name, value) => {
//         const input = document.createElement("input");
//         input.type = "hidden";
//         input.name = name;
//         input.value = value;
//         form.appendChild(input);
//       };

//       addField("accessToken", authResponse.accessToken);
//       addField("refreshToken", authResponse.refreshToken || "");
//       addField("expiresIn", authResponse.expiresIn || 3600);

//       document.body.appendChild(form);
//       form.submit();
//     } catch (err) {
//       setError("Failed to log in. Please try again.");
//       console.error("Login error:", err);
//     }
//   }, []);

//   useEffect(() => {
//     const verifySession = async () => {
//       const session = localStorage.getItem("kc_session");
//       if (!session) return;

//       try {
//         const sessionData = JSON.parse(session);
//         const response = await fetch(
//           "https://kingslist.pro/app/default/api/verify_session.php",
//           {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({ accessToken: sessionData.accessToken }),
//           }
//         );

//         if (response.ok) {
//           const data = await response.json();
//           if (data.valid) {
//             setAccessToken(sessionData.accessToken);
//             setIsLoggedIn(true);
//           } else {
//             localStorage.removeItem("kc_session");
//           }
//         }
//       } catch (err) {
//         console.error("Session verification failed:", err);
//         localStorage.removeItem("kc_session");
//       }
//     };

//     verifySession();
//   }, []);

//   const updateDispatchStatus = useCallback(async (dmsg_id) => {
//     try {
//       const { success, failed } = progressRef.current;
//       const uniqueProcessed = processedMessages.size;
//       const totalAttempts = Object.values(retryCounts).reduce((a, b) => a + b, 0);

//       const response = await fetch(
//         "https://kingslist.pro/app/default/api/updateDispatchCount.php",
//         {
//           method: "POST",
//           credentials: "include",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify({
//             dmsg_id,
//             dispatch_count: uniqueProcessed,
//             attempts: totalAttempts,
//             status: failed > 0 && uniqueProcessed < progressRef.current.total ? 1 : 2,
//           }),
//         }
//       );

//       const data = await response.json();
//       if (!data.success) throw new Error(data.error || "Failed to update status");
//       return data;
//     } catch (error) {
//       console.error("Status update failed:", error);
//       throw error;
//     }
//   }, [retryCounts, processedMessages]);

//   const handleDispatch = useCallback(async (dmsg_id) => {
//     setError("");
//     setDispatching(true);
//     updateProgress(() => ({ current: 0, total: 0, success: 0, failed: 0 }));
//     setRetryCounts({});
//     setProcessedMessages(new Set());

//     // Rate limiting configuration
//     const RATE_LIMIT = {
//         MESSAGE_DELAY_MS: 1500, // Base delay between messages
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
//                 await new Promise(res => setTimeout(res, 
//                     attempt === 1 ? RATE_LIMIT.BATCH_DELAY_MS : RATE_LIMIT.RETRY_DELAY_MS
//                 ));
//             }
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

//   useEffect(() => {
//     const urlParams = new URLSearchParams(window.location.search);
//     const dmsg_id = urlParams.get("dmsg_id");
//     const start = urlParams.get("start_dispatch");
//     const status = sessionStorage.getItem(`dispatch_status_${dmsg_id}`);

//     if (
//       isLoggedIn &&
//       dmsg_id &&
//       !dispatching &&
//       start === "1" &&
//       status === "in_progress"
//     ) {
//       handleDispatch(dmsg_id);
//     }
//   }, [isLoggedIn, dispatching, handleDispatch]);

//   // Helper: Visual Progress Bar
//   const ProgressBar = () => {
//     if (!progress.total) return null;
//     const percent = (progress.current / progress.total) * 100;
//     return (
//       <div style={{ marginTop: "10px", background: "#e0e0e0", borderRadius: "8px", height: "20px" }}>
//         <div
//           style={{
//             width: `${percent}%`,
//             background: percent === 100 ? "#28a745" : "#007bff",
//             height: "100%",
//             borderRadius: "8px",
//             transition: "width 0.3s ease-in-out",
//           }}
//         />
//       </div>
//     );
//   };

//   const DispatchAnalytics = () => {
//     if (!progress.total || (dispatching && progress.current === 0)) return null;
  
//     return (
//       <div style={{ marginTop: "20px", padding: "10px", border: "1px solid #ccc", borderRadius: "8px" }}>
//         {progress.current >= progress.total && (
//           <div style={{color: "#28a745", fontWeight: "bold", marginBottom: "10px"}}>
//             {progress.failed > 0 ? "Dispatch Completed with Errors" : "Dispatch Successfully Completed"}
//           </div>
//         )}
//         <h4>Dispatch Summary</h4>
//         <p><strong>Total:</strong> {progress.total}</p>
//         <p style={{ color: "#28a745" }}><strong>Success:</strong> {progress.success}</p>
//         <p style={{ color: "#dc3545" }}><strong>Failed:</strong> {progress.failed}</p>
//         <p style={{ color: "#ffc107" }}><strong>Retried:</strong> {
//           Object.values(retryCounts).filter(count => count > 1).length
//         }</p>
//         <a href="https://kingslist.pro/messages" style={{ color: "#007bff", textDecoration: "underline" }}>
//           Go to Messages Page
//         </a>
//       </div>
//     );
//   };

//   return (
//     <div style={{ padding: "30px", maxWidth: "600px", margin: "auto", fontFamily: "sans-serif" }}>
//       <h2 style={{ color: "#2a2a2a" }}>Kingslist Portal</h2>
//       <p>Welcome! Log in with KingsChat to begin dispatching your message batch.</p>

//       {error && (
//         <div style={{ background: "#ffe0e0", padding: "10px", borderRadius: "5px", color: "#b00020" }}>
//           {error}
//         </div>
//       )}

//       {!isLoggedIn ? (
//         <button
//           onClick={handleLogin}
//           style={{
//             padding: "10px 20px",
//             background: "#007bff",
//             color: "white",
//             border: "none",
//             borderRadius: "5px",
//             cursor: "pointer",
//             fontWeight: "bold",
//           }}
//         >
//           Log in with KingsChat
//         </button>
//       ) : (
//         <div>
//           {dispatching && (
//             <div style={{ margin: "20px 0", color: "#28a745" }}>
//               Dispatching... {progress.current} / {progress.total} (
//               {progress.success} success, {progress.failed} failed)
//               <ProgressBar />
//             </div>
//           )}

//           <DispatchAnalytics />

//           {!dispatching && dispatchId && (
//             <button
//               onClick={() => handleDispatch(dispatchId)}
//               style={{
//                 padding: "10px 20px",
//                 background: "#28a745",
//                 color: "white",
//                 border: "none",
//                 borderRadius: "5px",
//                 cursor: "pointer",
//                 fontWeight: "bold",
//               }}
//             >
//               Start Dispatch
//             </button>
//           )}
//         </div>
//       )}
//     </div>
//   );
// }

// export default App;







import React, { useState, useEffect, useRef, useCallback } from "react";
import { login, sendMessage } from "./services/kingschat";
import {
  fetchDispatchBatch,
  prepareMessagesForDispatch,
} from "./services/dispatchService";

// Enhanced Constants with Rate Limiting Configuration
const RATE_LIMIT_CONFIG = {
  BASE_DELAY_MS: 1500,
  MAX_RETRY_ATTEMPTS: 3,
  BATCH_SIZE: 5,
  RETRY_EXPONENTIAL_BACKOFF: true,
  MAX_RETRY_DELAY_MS: 30000,
  STATUS_UPDATE_INTERVAL: 5000,
};

function App() {
  // State Management
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem("kc_session") !== null;
  });
  const [accessToken, setAccessToken] = useState(() => {
    const session = localStorage.getItem("kc_session");
    return session ? JSON.parse(session).accessToken : "";
  });
  const [dispatching, setDispatching] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");
  const [dispatchId, setDispatchId] = useState("");
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    success: 0,
    failed: 0,
    rateLimited: 0,
  });
  const [retryCounts, setRetryCounts] = useState({});
  const [processedMessages, setProcessedMessages] = useState(new Set());
  const [logs, setLogs] = useState([]);
  const progressRef = useRef(progress);
  const dispatchRef = useRef(null);

  // Refs for control
  const abortControllerRef = useRef(new AbortController());

  // Helper Functions
  const addLog = (message, type = "info") => {
    setLogs(prev => [
      { timestamp: new Date().toISOString(), message, type },
      ...prev.slice(0, 100), // Keep last 100 logs
    ]);
  };

  const updateProgress = (updateFn) => {
    setProgress(prev => {
      const updated = updateFn(prev);
      progressRef.current = updated;
      return updated;
    });
  };

  const calculateDelay = (attempt) => {
    if (!RATE_LIMIT_CONFIG.RETRY_EXPONENTIAL_BACKOFF) {
      return RATE_LIMIT_CONFIG.BASE_DELAY_MS;
    }
    const delay = Math.min(
      RATE_LIMIT_CONFIG.BASE_DELAY_MS * Math.pow(2, attempt),
      RATE_LIMIT_CONFIG.MAX_RETRY_DELAY_MS
    );
    return delay;
  };

  // Core Functions
  const handleLogin = useCallback(async () => {
    setError("");
    addLog("Initiating login process...");
    try {
      const authResponse = await login();
      addLog("Login successful, storing session");

      const sessionData = {
        accessToken: authResponse.accessToken,
        refreshToken: authResponse.refreshToken || "",
        expiresIn: authResponse.expiresIn || 3600,
        timestamp: Date.now(),
      };
      localStorage.setItem("kc_session", JSON.stringify(sessionData));

      setAccessToken(authResponse.accessToken);
      setIsLoggedIn(true);
      addLog("Session established successfully");

      // Submit to callback URL
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
      addLog(`Login failed: ${err.message}`, "error");
      setError("Failed to log in. Please try again.");
      console.error("Login error:", err);
    }
  }, []);

  const updateDispatchStatus = useCallback(
    async (dmsg_id, forceComplete = false) => {
      try {
        const { success, failed, rateLimited } = progressRef.current;
        const uniqueProcessed = processedMessages.size;
        const totalAttempts = Object.values(retryCounts).reduce((a, b) => a + b, 0);

        // Determine if dispatch should be marked as complete
        const isComplete =
          forceComplete ||
          (uniqueProcessed >= progressRef.current.total && failed === 0) ||
          (failed > 0 && uniqueProcessed + failed >= progressRef.current.total);

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
              status: isComplete ? 2 : 1, // 2 = complete, 1 = in progress
              rate_limited: rateLimited,
            }),
            signal: abortControllerRef.current.signal,
          }
        );

        const data = await response.json();
        if (!data.success) throw new Error(data.error || "Failed to update status");
        
        addLog(`Status updated: ${isComplete ? "Complete" : "In Progress"}`, 
               isComplete ? "success" : "info");
        return data;
      } catch (error) {
        addLog(`Status update failed: ${error.message}`, "error");
        console.error("Status update failed:", error);
        throw error;
      }
    },
    [retryCounts, processedMessages]
  );

  const handleDispatch = useCallback(
    async (dmsg_id) => {
      if (dispatching) return;
      
      setError("");
      setDispatching(true);
      setPaused(false);
      updateProgress(() => ({ current: 0, total: 0, success: 0, failed: 0, rateLimited: 0 }));
      setRetryCounts({});
      setProcessedMessages(new Set());
      addLog(`Starting dispatch for message ID: ${dmsg_id}`);

      try {
        // Fetch batch data
        const batchData = await fetchDispatchBatch(dmsg_id);
        addLog(`Fetched batch data with ${batchData.messages?.length || 0} messages`);
        
        // Use actual messages length since total_recipients might be incorrect
        const totalMessages = batchData.messages?.length || 0;
        if (totalMessages === 0) {
          throw new Error("No messages available for dispatch");
        }

        let messages = prepareMessagesForDispatch(batchData).map(msg => ({
          ...msg,
          body: msg.body
            .replace(/<kc_username>/g, msg.username)
            .replace(/<fullname>/g, msg.fullname),
        }));

        updateProgress(prev => ({ ...prev, total: totalMessages }));
        addLog(`Prepared ${messages.length} messages for dispatch`);

        let remainingMessages = [...messages];
        let currentBatch = [];
        let attempt = 0;

        // Main dispatch loop
        while (remainingMessages.length > 0 && !abortControllerRef.current.signal.aborted) {
          if (paused) {
            await new Promise(resolve => {
              const interval = setInterval(() => {
                if (!paused) {
                  clearInterval(interval);
                  resolve();
                }
              }, 1000);
            });
            continue;
          }

          // Get next batch
          currentBatch = remainingMessages.slice(0, RATE_LIMIT_CONFIG.BATCH_SIZE);
          const batchToProcess = currentBatch;
          remainingMessages = remainingMessages.slice(RATE_LIMIT_CONFIG.BATCH_SIZE);

          // Update retry counts
          setRetryCounts(prev => {
            const newCounts = { ...prev };
            batchToProcess.forEach(msg => {
              newCounts[msg.kc_id] = (newCounts[msg.kc_id] || 0) + 1;
            });
            return newCounts;
          });

          // Process current batch
          for (const msg of currentBatch) {
            if (processedMessages.has(msg.kc_id)) continue;
            if (abortControllerRef.current.signal.aborted) break;

            const retryCount = retryCounts[msg.kc_id] || 0;
            const delay = calculateDelay(retryCount - 1);

            try {
              await new Promise(resolve => setTimeout(resolve, delay));
              addLog(`Sending to ${msg.kc_id} (attempt ${retryCount})`, "info");

              const res = await sendMessage(
                accessToken,
                msg.kc_id,
                msg.body,
                abortControllerRef.current.signal
              );

              if (res.success) {
                setProcessedMessages(prev => new Set(prev).add(msg.kc_id));
                updateProgress(prev => ({
                  ...prev,
                  current: prev.current + 1,
                  success: prev.success + 1,
                }));
                addLog(`Successfully sent to ${msg.kc_id}`, "success");
                continue;
              }
            } catch (err) {
              const errorMsg = `Error sending to ${msg.kc_id}: ${err.message}`;
              addLog(errorMsg, "error");
              console.warn(errorMsg);

              if (err.response?.status === 429) {
                updateProgress(prev => ({
                  ...prev,
                  rateLimited: prev.rateLimited + 1,
                }));
                addLog(`Rate limited for ${msg.kc_id}, will retry`, "warning");
              }
            }

            // Handle retry or failure
            if (retryCount < RATE_LIMIT_CONFIG.MAX_RETRY_ATTEMPTS) {
              remainingMessages.unshift(msg); // Add back to front of queue
            } else {
              updateProgress(prev => ({
                ...prev,
                current: prev.current + 1,
                failed: prev.failed + 1,
              }));
              addLog(`Max retries reached for ${msg.kc_id}`, "error");
            }
          }

          // Periodic status update
          if (attempt % 3 === 0) {
            await updateDispatchStatus(dmsg_id);
          }

          attempt++;
        }

        // Final status update
        const finalStatus = await updateDispatchStatus(dmsg_id, true);
        if (!finalStatus.success) throw new Error("Final status update failed");

        sessionStorage.setItem(`dispatch_status_${dmsg_id}`, "completed");
        sessionStorage.setItem(
          `dispatch_analytics_${dmsg_id}`,
          JSON.stringify({
            success: progressRef.current.success,
            failed: progressRef.current.failed,
            rateLimited: progressRef.current.rateLimited,
            retries: Object.values(retryCounts).filter(c => c > 1).length,
          })
        );

        addLog(
          `Dispatch completed: ${progressRef.current.success} success, ${progressRef.current.failed} failed`,
          progressRef.current.failed > 0 ? "warning" : "success"
        );

        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set("start_dispatch", "2");
        window.history.pushState({}, "", newUrl.toString());
      } catch (err) {
        addLog(`Dispatch error: ${err.message}`, "error");
        setError(`Dispatch error: ${err.message}`);
      } finally {
        setDispatching(false);
        abortControllerRef.current = new AbortController(); // Reset abort controller
      }
    },
    [accessToken, updateDispatchStatus, processedMessages, retryCounts, paused, dispatching]
  );

  const handlePauseResume = () => {
    if (paused) {
      setPaused(false);
      addLog("Dispatch resumed", "info");
    } else {
      setPaused(true);
      addLog("Dispatch paused", "warning");
    }
  };

  const handleCancel = () => {
    abortControllerRef.current.abort();
    setDispatching(false);
    setPaused(false);
    addLog("Dispatch cancelled by user", "error");
  };

  // Effects
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const dmsg_id = urlParams.get("dmsg_id");
    const start = urlParams.get("start_dispatch");
    const status = sessionStorage.getItem(`dispatch_status_${dmsg_id}`);

    if (isLoggedIn && dmsg_id && !dispatching && start === "1" && status !== "completed") {
      sessionStorage.setItem(`dispatch_status_${dmsg_id}`, "in_progress");
      handleDispatch(dmsg_id);
    }

    return () => {
      abortControllerRef.current.abort();
    };
  }, [isLoggedIn, dispatching, handleDispatch]);

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
            addLog("Session verified successfully", "success");
          } else {
            localStorage.removeItem("kc_session");
            addLog("Session invalid", "warning");
          }
        }
      } catch (err) {
        addLog(`Session verification failed: ${err.message}`, "error");
        console.error("Session verification failed:", err);
        localStorage.removeItem("kc_session");
      }
    };

    verifySession();
  }, []);

  // UI Components
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

    return (
      <div style={{ marginTop: "20px", padding: "15px", border: "1px solid #ddd", borderRadius: "8px", background: "#f9f9f9" }}>
        {progress.current >= progress.total && (
          <div style={{ color: progress.failed > 0 ? "#ffc107" : "#28a745", fontWeight: "bold", marginBottom: "10px" }}>
            {progress.failed > 0 ? "Dispatch Completed with Errors" : "Dispatch Successfully Completed"}
          </div>
        )}
        <h4 style={{ marginBottom: "15px", borderBottom: "1px solid #eee", paddingBottom: "5px" }}>Dispatch Summary</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
          <div><strong>Total:</strong> {progress.total}</div>
          <div style={{ color: "#28a745" }}><strong>Success:</strong> {progress.success}</div>
          <div style={{ color: "#dc3545" }}><strong>Failed:</strong> {progress.failed}</div>
          <div style={{ color: "#ffc107" }}><strong>Retried:</strong> {Object.values(retryCounts).filter(count => count > 1).length}</div>
          <div style={{ color: "#fd7e14" }}><strong>Rate Limited:</strong> {progress.rateLimited}</div>
          <div><strong>Progress:</strong> {Math.round((progress.current / progress.total) * 100)}%</div>
        </div>
        <div style={{ marginTop: "15px" }}>
          <a 
            href="https://kingslist.pro/messages" 
            style={{ 
              display: "inline-block",
              padding: "8px 15px",
              background: "#007bff",
              color: "white",
              borderRadius: "5px",
              textDecoration: "none",
              fontWeight: "bold"
            }}
          >
            Go to Messages Page
          </a>
        </div>
      </div>
    );
  };

  const LogViewer = () => {
    if (logs.length === 0) return null;
    
    return (
      <div style={{ 
        marginTop: "20px",
        maxHeight: "200px",
        overflowY: "auto",
        border: "1px solid #ddd",
        borderRadius: "8px",
        padding: "10px",
        background: "#f5f5f5"
      }}>
        <h5 style={{ marginBottom: "10px" }}>Activity Log</h5>
        <div style={{ fontFamily: "monospace", fontSize: "12px" }}>
          {logs.map((log, index) => (
            <div 
              key={index} 
              style={{ 
                marginBottom: "5px",
                color: log.type === "error" ? "#dc3545" : 
                      log.type === "warning" ? "#ffc107" : 
                      log.type === "success" ? "#28a745" : "#6c757d"
              }}
            >
              [{new Date(log.timestamp).toLocaleTimeString()}] {log.message}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ 
      padding: "30px", 
      maxWidth: "800px", 
      margin: "auto", 
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" 
    }}>
      <h2 style={{ color: "#2a2a2a", marginBottom: "20px" }}>Kingslist Dispatch Portal</h2>
      <p style={{ marginBottom: "20px" }}>Welcome! Log in with KingsChat to begin dispatching your message batch.</p>

      {error && (
        <div style={{ 
          background: "#ffe0e0", 
          padding: "15px", 
          borderRadius: "5px", 
          color: "#b00020",
          marginBottom: "20px",
          borderLeft: "4px solid #b00020"
        }}>
          {error}
        </div>
      )}

      {!isLoggedIn ? (
        <button
          onClick={handleLogin}
          style={{
            padding: "12px 25px",
            background: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "16px",
            transition: "background 0.3s",
            ":hover": {
              background: "#0056b3",
            }
          }}
        >
          Log in with KingsChat
        </button>
      ) : (
        <div>
          {dispatching && (
            <div style={{ 
              margin: "20px 0", 
              padding: "15px",
              background: "#f8f9fa",
              borderRadius: "8px",
              border: "1px solid #ddd"
            }}>
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between",
                marginBottom: "10px"
              }}>
                <div style={{ color: "#28a745", fontWeight: "bold" }}>
                  Dispatching... {progress.current} / {progress.total}
                </div>
                <div>
                  <span style={{ color: "#28a745" }}>{progress.success} success</span>,{" "}
                  <span style={{ color: "#dc3545" }}>{progress.failed} failed</span>
                </div>
              </div>
              <ProgressBar />
              
              <div style={{ 
                display: "flex", 
                gap: "10px",
                marginTop: "15px"
              }}>
                <button
                  onClick={handlePauseResume}
                  style={{
                    padding: "8px 15px",
                    background: paused ? "#28a745" : "#ffc107",
                    color: "white",
                    border: "none",
                    borderRadius: "5px",
                    cursor: "pointer",
                    fontWeight: "bold"
                  }}
                >
                  {paused ? "Resume" : "Pause"}
                </button>
                <button
                  onClick={handleCancel}
                  style={{
                    padding: "8px 15px",
                    background: "#dc3545",
                    color: "white",
                    border: "none",
                    borderRadius: "5px",
                    cursor: "pointer",
                    fontWeight: "bold"
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <DispatchAnalytics />
          <LogViewer />

          {!dispatching && dispatchId && (
            <div style={{ marginTop: "20px" }}>
              <button
                onClick={() => handleDispatch(dispatchId)}
                style={{
                  padding: "12px 25px",
                  background: "#28a745",
                  color: "white",
                  border: "none",
                  borderRadius: "5px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "16px"
                }}
              >
                Start Dispatch
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;