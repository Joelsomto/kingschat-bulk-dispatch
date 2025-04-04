// import React, { useState, useEffect, useRef, useCallback } from "react";
// import { login, sendMessage } from "./services/kingschat";
// import {
//   fetchDispatchBatch,
//   prepareMessagesForDispatch,
// } from "./services/dispatchService";

// // Constants
// const MAX_RETRY_ATTEMPTS = 2;
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
//   const progressRef = useRef(progress);

//   // Check for dispatch parameters on component mount
//   useEffect(() => {
//     const urlParams = new URLSearchParams(window.location.search);
//     const dmsg_id = urlParams.get("dmsg_id");
//     const start = urlParams.get("start_dispatch");

//     if (dmsg_id) {
//       setDispatchId(dmsg_id);
//       // Only set to auto-dispatch if start_dispatch=1 and not completed
//       if (start === "1") {
//         const dispatchStatus = sessionStorage.getItem(`dispatch_status_${dmsg_id}`);
//         if (!dispatchStatus || dispatchStatus !== "completed") {
//           sessionStorage.setItem(`dispatch_status_${dmsg_id}`, "in_progress");
//         }
//       }
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

//   // Check session validity on component mount
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
//             headers: {
//               "Content-Type": "application/json",
//             },
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

//   const updateDispatchStatus = useCallback(
//     async (dmsg_id) => {
//       try {
//         const { success, failed } = progressRef.current;
//         const totalProcessed = success + failed;
//         const totalAttempts = Object.values(retryCounts).reduce(
//           (a, b) => a + b,
//           0
//         );

//         const response = await fetch(
//           "https://kingslist.pro/app/default/api/updateDispatchCount.php",
//           {
//             method: "POST",
//             credentials: "include",
//             headers: {
//               "Content-Type": "application/json",
//             },
//             body: JSON.stringify({
//               dmsg_id,
//               dispatch_count: totalProcessed,
//               attempts: totalAttempts,
//               status: failed > 0 ? 1 : 2,
//             }),
//           }
//         );

//         if (!response.ok)
//           throw new Error(`HTTP error! status: ${response.status}`);
//         const data = await response.json();
//         if (!data.success)
//           throw new Error(data.error || "Failed to update dispatch status");
//         return data;
//       } catch (error) {
//         console.error("Status update failed:", error);
//         throw error;
//       }
//     },
//     [retryCounts]
//   );

//   const [processedMessages, setProcessedMessages] = useState(new Set()); // Track processed messages

  
//   const handleDispatch = useCallback(async (dmsg_id) => {
//     setError("");
//     setDispatching(true);
//     setProgress({ current: 0, total: 0, success: 0, failed: 0 });
//     progressRef.current = { current: 0, total: 0, success: 0, failed: 0 };
//     setRetryCounts({});
//     setProcessedMessages(new Set());
  
//     try {
//       const batchData = await fetchDispatchBatch(dmsg_id);
//       let messages = prepareMessagesForDispatch(batchData);
      
//       // Replace placeholders in message bodies
//       messages = messages.map(msg => ({
//         ...msg,
//         body: msg.body
//           .replace(/<kc_username>/g, msg.username)
//           .replace(/<fullname>/g, msg.fullname)
//       }));
  
//       let remainingMessages = messages.filter(msg => !processedMessages.has(msg.kc_id));
//       let attempt = 0;
  
//       setProgress(prev => ({
//         ...prev,
//         total: messages.length
//       }));
  
//       while (remainingMessages.length > 0 && attempt < MAX_RETRY_ATTEMPTS) {
//         const currentBatch = [...remainingMessages];
//         remainingMessages = [];
        
//         for (const msg of currentBatch) {
//           if (processedMessages.has(msg.kc_id)) continue;
  
//           try {
//             await new Promise(resolve => setTimeout(resolve, MESSAGE_DELAY_MS));
//             const response = await sendMessage(accessToken, msg.kc_id, msg.body);
            
//             if (response.success) {
//               setProcessedMessages(prev => new Set(prev).add(msg.kc_id));
//               setProgress(prev => ({
//                 ...prev,
//                 current: prev.current + 1,
//                 success: prev.success + 1
//               }));
//             } else {
//               throw new Error("Message send failed");
//             }
            
//             setRetryCounts(prev => ({
//               ...prev,
//               [msg.kc_id]: (prev[msg.kc_id] || 0) + 1
//             }));
//           } catch (err) {
//             if (attempt < MAX_RETRY_ATTEMPTS - 1) {
//               remainingMessages.push(msg);
//             } else {
//               setProgress(prev => ({
//                 ...prev,
//                 current: prev.current + 1,
//                 failed: prev.failed + 1
//               }));
//             }
            
//             setRetryCounts(prev => ({
//               ...prev,
//               [msg.kc_id]: (prev[msg.kc_id] || 0) + 1
//             }));
//           }
//         }
  
//         attempt++;
        
//         if (remainingMessages.length > 0 && attempt < MAX_RETRY_ATTEMPTS) {
//           await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
//         }
//       }
  
//       const finalStatus = await updateDispatchStatus(dmsg_id);
//       if (!finalStatus.success) {
//         throw new Error("Failed to update dispatch status");
//       }
  
//       // Update URL parameter after successful dispatch
//       if (window.history.pushState) {
//         const newUrl = new URL(window.location);
//         newUrl.searchParams.set('start_dispatch', '2');
//         window.history.pushState({}, '', newUrl);
//       }
  
//       // Mark dispatch as completed in session storage
//       sessionStorage.setItem(`dispatch_status_${dmsg_id}`, "completed");
  
//       if (!dispatchId) {
//         alert(
//           `Processed ${messages.length} messages with ${MAX_RETRY_ATTEMPTS} attempts\n` +
//           `Success: ${progressRef.current.success}\n` +
//           `Failed: ${progressRef.current.failed}\n` +
//           `Total attempts: ${Object.values(retryCounts).reduce((a, b) => a + b, 0)}`
//         );
//       }
//     } catch (err) {
//       setError(`Dispatch failed: ${err.message}`);
//       console.error("Dispatch error:", err);
//     } finally {
//       setDispatching(false);
//     }
//   }, [accessToken, dispatchId, updateDispatchStatus, processedMessages, retryCounts]);
  
//   // Auto-start dispatch when both logged in and ID is present
//   useEffect(() => {
//     const urlParams = new URLSearchParams(window.location.search);
//     const dmsg_id = urlParams.get('dmsg_id');
//     const start = urlParams.get('start_dispatch');
    
//     if (isLoggedIn && dmsg_id && !dispatching && start === '1') {
//       const dispatchStatus = sessionStorage.getItem(`dispatch_status_${dmsg_id}`);
//       if (!dispatchStatus || dispatchStatus === "in_progress") {
//         handleDispatch(dmsg_id);
//       }
//     }
//   }, [isLoggedIn, dispatching, handleDispatch]);

//   // Auto-start dispatch when both logged in and ID is present
//   useEffect(() => {
//     if (isLoggedIn && dispatchId && !dispatching) {
//       handleDispatch(dispatchId);
//     }
//   }, [isLoggedIn, dispatchId, dispatching, handleDispatch]);

//   return (
//     <div style={{ padding: "20px", maxWidth: "500px", margin: "0 auto" }}>
//       <h4 class="text-muted mb-3 mt-3">Welcome to Kingslist Portal. Please log in below to get started.</h4>


//       {error && (
//         <div
//           style={{
//             color: "red",
//             padding: "10px",
//             marginBottom: "15px",
//             background: "#ffecec",
//             borderRadius: "5px",
//           }}
//         >
//           {error}
//         </div>
//       )}

//       {!isLoggedIn ? (
//         <button
//           onClick={handleLogin}
//           style={{
//             padding: "10px 20px",
//             background: "#28a745",
//             color: "white",
//             border: "none",
//             borderRadius: "5px",
//             cursor: "pointer",
//           }}
//         >
//           Log in with KingsChat
//         </button>
//       ) : (
//         <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
//           {!dispatchId && (
//             <button
//               onClick={() => handleDispatch(239)}
//               style={{
//                 padding: "10px 20px",
//                 background: "#007bff",
//                 color: "white",
//                 border: "none",
//                 borderRadius: "5px",
//                 cursor: "pointer",
//                 display: "flex",
//                 alignItems: "center",
//                 justifyContent: "center",
//               }}
//               disabled={dispatching}
//             >
//               {dispatching ? (
//                 <>
//                   <span
//                     style={{
//                       display: "inline-block",
//                       width: "1rem",
//                       height: "1rem",
//                       border: "2px solid transparent",
//                       borderTopColor: "white",
//                       borderRadius: "50%",
//                       animation: "spin 1s linear infinite",
//                       marginRight: "0.5rem",
//                     }}
//                   ></span>
//                   Dispatching ({progress.current}/{progress.total})
//                 </>
//               ) : (
//                 "Dispatch Messages"
//               )}
//             </button>
//           )}
//           <a
//             href="https://kingslist.pro/messages"
//             target="_blank"
//             rel="noopener noreferrer"
//             style={{
//               padding: "10px 20px",
//               background: "#6c757d",
//               color: "white",
//               border: "none",
//               borderRadius: "5px",
//               cursor: "pointer",
//               textDecoration: "none",
//               textAlign: "center",
//             }}
//           >
//             View Messages
//           </a>
//           {dispatchId && (
//             <div
//               style={{
//                 background: "#f8f9fa",
//                 padding: "10px",
//                 borderRadius: "5px",
//               }}
//             >
//               <h3>Processing Dispatch: {dispatchId}</h3>
//               {dispatching ? (
//                 <p>
//                   Status: Dispatching (Attempt{" "}
//                   {Math.max(1, Math.floor(Object.values(retryCounts)[0] || 0))}{" "}
//                   of {MAX_RETRY_ATTEMPTS})
//                 </p>
//               ) : (
//                 <p>
//                   Status:{" "}
//                   {progress.failed > 0
//                     ? "Completed with errors"
//                     : "Successfully completed"}
//                 </p>
//               )}
//             </div>
//           )}

//           {dispatching && (
//             <div>
//               <div
//                 style={{
//                   height: "10px",
//                   background: "#e9ecef",
//                   borderRadius: "5px",
//                   marginBottom: "5px",
//                 }}
//               >
//                 <div
//                   style={{
//                     height: "100%",
//                     width: `${(progress.current / progress.total) * 100}%`,
//                     background:
//                       progress.current === progress.total
//                         ? progress.failed > 0
//                           ? "#ffc107"
//                           : "#28a745"
//                         : "#007bff",
//                     borderRadius: "5px",
//                     transition: "width 0.3s",
//                   }}
//                 />
//               </div>
//               <div
//                 style={{
//                   display: "flex",
//                   justifyContent: "space-between",
//                   fontSize: "0.8rem",
//                 }}
//               >
//                 <span>Success: {progress.success}</span>
//                 <span>Failed: {progress.failed}</span>
//                 <span>
//                   Attempts:{" "}
//                   {Object.values(retryCounts).reduce((a, b) => a + b, 0)}
//                 </span>
//               </div>
//             </div>
//           )}
//         </div>
//       )}

//       <style>{`
//         @keyframes spin {
//           to { transform: rotate(360deg); }
//         }
//       `}</style>
//     </div>
//   );
// }











import React, { useState, useEffect, useRef, useCallback } from "react";
import { login, sendMessage } from "./services/kingschat";
import {
  fetchDispatchBatch,
  prepareMessagesForDispatch,
} from "./services/dispatchService";

// Constants
const MAX_RETRY_ATTEMPTS = 2;
const MESSAGE_DELAY_MS = 1000;
const RETRY_DELAY_MS = 1000;

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
  const [messageStatuses, setMessageStatuses] = useState({});
  const progressRef = useRef(progress);

  // Update progress with ref synchronization
  const updateProgress = (updateFn) => {
    setProgress(prev => {
      const updated = updateFn(prev);
      progressRef.current = updated;
      return updated;
    });
  };

  // Initialize from URL params
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
  }, []);

  // Login handler
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
      setError("Failed to log in. Please try again.");
      console.error("Login error:", err);
    }
  }, []);

  // Verify session on mount
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

  // Update dispatch status with accurate counts
  const updateDispatchStatus = useCallback(async (dmsg_id) => {
    try {
      const { success, failed } = progressRef.current;
      const totalProcessed = success + failed;
      const totalAttempts = Object.values(retryCounts).reduce((a, b) => a + b, 0);

      // Calculate actual success/fail counts from message statuses
      const actualSuccess = Object.values(messageStatuses).filter(
        status => status === "success"
      ).length;
      const actualFailed = Object.values(messageStatuses).filter(
        status => status === "failed"
      ).length;

      const response = await fetch(
        "https://kingslist.pro/app/default/api/updateDispatchCount.php",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dmsg_id,
            dispatch_count: totalProcessed,
            attempts: totalAttempts,
            status: actualFailed > 0 ? 1 : 2,
            success_count: actualSuccess,
            failed_count: actualFailed,
          }),
        }
      );

      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Failed to update status");
      
      // Verify the counts match
      if (data.success_count !== actualSuccess || data.failed_count !== actualFailed) {
        console.warn("Count mismatch between client and server", {
          client: { actualSuccess, actualFailed },
          server: data
        });
      }
      
      return data;
    } catch (error) {
      console.error("Status update failed:", error);
      throw error;
    }
  }, [retryCounts, messageStatuses]);

  // Main dispatch function with improved tracking
  const handleDispatch = useCallback(async (dmsg_id) => {
    setError("");
    setDispatching(true);
    updateProgress(() => ({ current: 0, total: 0, success: 0, failed: 0 }));
    setRetryCounts({});
    setMessageStatuses({});

    try {
      const batchData = await fetchDispatchBatch(dmsg_id);
      let messages = prepareMessagesForDispatch(batchData);

      // Process message templates
      messages = messages.map(msg => ({
        ...msg,
        body: msg.body
          .replace(/<kc_username>/g, msg.username)
          .replace(/<fullname>/g, msg.fullname),
      }));

      updateProgress(prev => ({ ...prev, total: messages.length }));

      let remainingMessages = [...messages];
      let attempt = 0;

      while (remainingMessages.length > 0 && attempt < MAX_RETRY_ATTEMPTS) {
        const currentBatch = [...remainingMessages];
        remainingMessages = [];

        for (const msg of currentBatch) {
          // Skip if already succeeded
          if (messageStatuses[msg.kc_id] === "success") continue;

          try {
            await new Promise(res => setTimeout(res, MESSAGE_DELAY_MS));
            
            // Track attempt
            setRetryCounts(prev => ({
              ...prev,
              [msg.kc_id]: (prev[msg.kc_id] || 0) + 1,
            }));

            const res = await sendMessage(accessToken, msg.kc_id, msg.body);
            
            if (res.success) {
              // Mark as successful
              setMessageStatuses(prev => ({
                ...prev,
                [msg.kc_id]: "success"
              }));
              updateProgress(prev => ({
                ...prev,
                current: prev.current + 1,
                success: prev.success + 1,
              }));
              continue;
            }
            
            // If not successful but no error thrown
            throw new Error("API returned unsuccessful response");
          } catch (err) {
            console.warn(`Error sending to ${msg.kc_id}:`, err.message);
            
            // Check if we should retry
            const currentRetry = retryCounts[msg.kc_id] || 0;
            if (currentRetry + 1 < MAX_RETRY_ATTEMPTS) {
              remainingMessages.push(msg);
            } else {
              // Final failure
              setMessageStatuses(prev => ({
                ...prev,
                [msg.kc_id]: "failed"
              }));
              updateProgress(prev => ({
                ...prev,
                current: prev.current + 1,
                failed: prev.failed + 1,
              }));
            }
          }
        }

        attempt++;
        if (remainingMessages.length > 0 && attempt < MAX_RETRY_ATTEMPTS) {
          await new Promise(res => setTimeout(res, RETRY_DELAY_MS));
        }
      }

      // Final status update with accurate counts
      const finalStatus = await updateDispatchStatus(dmsg_id);
      if (!finalStatus.success) throw new Error("Final status update failed");

      // Mark as completed
      sessionStorage.setItem(`dispatch_status_${dmsg_id}`, "completed");
      
      // Update URL
      if (window.history.pushState) {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set("start_dispatch", "2");
        window.history.pushState({}, "", newUrl.toString());
      }

    } catch (err) {
      setError(`Dispatch error: ${err.message}`);
      console.error("Dispatch failed:", err);
    } finally {
      setDispatching(false);
    }
  }, [accessToken, updateDispatchStatus, retryCounts, messageStatuses]);

  // Auto-start dispatch when conditions are met
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

  // UI Components
  const ProgressBar = () => {
    if (!progress.total) return null;
    const percent = (progress.current / progress.total) * 100;
    return (
      <div style={{ marginTop: "10px", background: "#e0e0e0", borderRadius: "8px", height: "20px" }}>
        <div
          style={{
            width: `${percent}%`,
            background: progress.failed > 0 ? "#ffc107" : "#28a745",
            height: "100%",
            borderRadius: "8px",
            transition: "width 0.3s ease-in-out",
          }}
        />
      </div>
    );
  };

  const DispatchAnalytics = () => {
    if (!progress.total || progress.current !== progress.total) return null;
  
    return (
      <div style={{ 
        marginTop: "20px", 
        padding: "15px", 
        border: "1px solid #ddd",
        borderRadius: "8px",
        background: "#f8f9fa"
      }}>
        <h4 style={{ marginTop: 0 }}>Dispatch Summary</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
          <div>
            <p style={{ margin: "5px 0", fontWeight: "bold" }}>Total Messages:</p>
            <p style={{ margin: "5px 0" }}>{progress.total}</p>
          </div>
          <div>
            <p style={{ margin: "5px 0", fontWeight: "bold", color: "#28a745" }}>Successful:</p>
            <p style={{ margin: "5px 0", color: "#28a745" }}>{progress.success}</p>
          </div>
          <div>
            <p style={{ margin: "5px 0", fontWeight: "bold", color: "#dc3545" }}>Failed:</p>
            <p style={{ margin: "5px 0", color: "#dc3545" }}>{progress.failed}</p>
          </div>
          <div>
            <p style={{ margin: "5px 0", fontWeight: "bold", color: "#ffc107" }}>Retried:</p>
            <p style={{ margin: "5px 0", color: "#ffc107" }}>
              {Object.values(retryCounts).filter(count => count > 1).length}
            </p>
          </div>
        </div>
        <a 
          href="https://kingslist.pro/app/default/messages" 
          style={{
            display: "inline-block",
            marginTop: "15px",
            padding: "8px 15px",
            background: "#007bff",
            color: "white",
            borderRadius: "4px",
            textDecoration: "none"
          }}
        >
          View Messages
        </a>
      </div>
    );
  };

  return (
    <div style={{ 
      padding: "30px", 
      maxWidth: "600px", 
      margin: "auto", 
      fontFamily: "sans-serif",
      boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
      borderRadius: "8px"
    }}>
      <h2 style={{ color: "#2a2a2a", marginTop: 0 }}>KingsChat Dispatch Portal</h2>
      
      {error && (
        <div style={{ 
          background: "#ffe0e0", 
          padding: "10px", 
          borderRadius: "5px", 
          color: "#b00020",
          marginBottom: "20px"
        }}>
          {error}
        </div>
      )}

      {!isLoggedIn ? (
        <div style={{ textAlign: "center" }}>
          <button
            onClick={handleLogin}
            style={{
              padding: "12px 24px",
              background: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "16px"
            }}
          >
            Log in with KingsChat
          </button>
        </div>
      ) : (
        <div>
          {dispatching && (
            <div style={{ 
              margin: "20px 0", 
              padding: "15px",
              background: "#f8f9fa",
              borderRadius: "8px"
            }}>
              <h4 style={{ marginTop: 0 }}>Dispatching Messages</h4>
              <p>
                Progress: {progress.current} of {progress.total}
                <br />
                <span style={{ color: "#28a745" }}>Success: {progress.success}</span>
                {" | "}
                <span style={{ color: "#dc3545" }}>Failed: {progress.failed}</span>
              </p>
              <ProgressBar />
            </div>
          )}

          <DispatchAnalytics />

          {!dispatching && dispatchId && (
            <div style={{ textAlign: "center", marginTop: "20px" }}>
              <button
                onClick={() => handleDispatch(dispatchId)}
                style={{
                  padding: "12px 24px",
                  background: "#28a745",
                  color: "white",
                  border: "none",
                  borderRadius: "5px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "16px"
                }}
                disabled={dispatching}
              >
                {dispatching ? "Dispatching..." : "Start Dispatch"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;