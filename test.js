import React, { useState, useEffect, useRef, useCallback } from "react";
import { login, sendMessage } from "./services/kingschat";
import { fetchDispatchBatch, prepareMessagesForDispatch } from "./services/dispatchService";

// ... (previous constants and state declarations remain the same)

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
          
          // Send the personalized message
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
}, [accessToken, dispatchId, updateDispatchStatus, processedMessages,retryCounts]);

// ... (rest of the component remains the same)