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
  const progressRef = useRef(progress);

  // Check for dispatch parameters on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const dmsg_id = urlParams.get("dmsg_id");
    const start = urlParams.get("start_dispatch");

    if (dmsg_id) {
      setDispatchId(dmsg_id);
      // Only set to auto-dispatch if start_dispatch=1 and not completed
      if (start === "1") {
        const dispatchStatus = sessionStorage.getItem(`dispatch_status_${dmsg_id}`);
        if (!dispatchStatus || dispatchStatus !== "completed") {
          sessionStorage.setItem(`dispatch_status_${dmsg_id}`, "in_progress");
        }
      }
    }
  }, []);

  // ... [keep all other existing functions unchanged until handleDispatch]

  const handleDispatch = useCallback(async (dmsg_id) => {
    setError("");
    setDispatching(true);
    setProgress({ current: 0, total: 0, success: 0, failed: 0 });
    progressRef.current = { current: 0, total: 0, success: 0, failed: 0 };
    setRetryCounts({});
    setProcessedMessages(new Set());
  
    try {
      const batchData = await fetchDispatchBatch(dmsg_id);
      let messages = prepareMessagesForDispatch(batchData);
      
      // Replace placeholders in message bodies
      messages = messages.map(msg => ({
        ...msg,
        body: msg.body
          .replace(/<kc_username>/g, msg.username)
          .replace(/<fullname>/g, msg.fullname)
      }));
  
      let remainingMessages = messages.filter(msg => !processedMessages.has(msg.kc_id));
      let attempt = 0;
  
      setProgress(prev => ({
        ...prev,
        total: messages.length
      }));
  
      while (remainingMessages.length > 0 && attempt < MAX_RETRY_ATTEMPTS) {
        const currentBatch = [...remainingMessages];
        remainingMessages = [];
        
        for (const msg of currentBatch) {
          if (processedMessages.has(msg.kc_id)) continue;
  
          try {
            await new Promise(resolve => setTimeout(resolve, MESSAGE_DELAY_MS));
            const response = await sendMessage(accessToken, msg.kc_id, msg.body);
            
            if (response.success) {
              setProcessedMessages(prev => new Set(prev).add(msg.kc_id));
              setProgress(prev => ({
                ...prev,
                current: prev.current + 1,
                success: prev.success + 1
              }));
            } else {
              throw new Error("Message send failed");
            }
            
            setRetryCounts(prev => ({
              ...prev,
              [msg.kc_id]: (prev[msg.kc_id] || 0) + 1
            }));
          } catch (err) {
            if (attempt < MAX_RETRY_ATTEMPTS - 1) {
              remainingMessages.push(msg);
            } else {
              setProgress(prev => ({
                ...prev,
                current: prev.current + 1,
                failed: prev.failed + 1
              }));
            }
            
            setRetryCounts(prev => ({
              ...prev,
              [msg.kc_id]: (prev[msg.kc_id] || 0) + 1
            }));
          }
        }
  
        attempt++;
        
        if (remainingMessages.length > 0 && attempt < MAX_RETRY_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
  
      const finalStatus = await updateDispatchStatus(dmsg_id);
      if (!finalStatus.success) {
        throw new Error("Failed to update dispatch status");
      }
  
      // Update URL parameter after successful dispatch
      if (window.history.pushState) {
        const newUrl = new URL(window.location);
        newUrl.searchParams.set('start_dispatch', '2');
        window.history.pushState({}, '', newUrl);
      }
  
      // Mark dispatch as completed in session storage
      sessionStorage.setItem(`dispatch_status_${dmsg_id}`, "completed");
  
      if (!dispatchId) {
        alert(
          `Processed ${messages.length} messages with ${MAX_RETRY_ATTEMPTS} attempts\n` +
          `Success: ${progressRef.current.success}\n` +
          `Failed: ${progressRef.current.failed}\n` +
          `Total attempts: ${Object.values(retryCounts).reduce((a, b) => a + b, 0)}`
        );
      }
    } catch (err) {
      setError(`Dispatch failed: ${err.message}`);
      console.error("Dispatch error:", err);
    } finally {
      setDispatching(false);
    }
  }, [accessToken, dispatchId, updateDispatchStatus, processedMessages, retryCounts]);
  
  // Auto-start dispatch when both logged in and ID is present
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const dmsg_id = urlParams.get('dmsg_id');
    const start = urlParams.get('start_dispatch');
    
    if (isLoggedIn && dmsg_id && !dispatching && start === '1') {
      const dispatchStatus = sessionStorage.getItem(`dispatch_status_${dmsg_id}`);
      if (!dispatchStatus || dispatchStatus === "in_progress") {
        handleDispatch(dmsg_id);
      }
    }
  }, [isLoggedIn, dispatching, handleDispatch]);

  // ... [keep all remaining code unchanged]
}

export default App;