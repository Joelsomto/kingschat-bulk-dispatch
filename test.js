// ... (previous imports and constants remain the same)

function App() {
  // ... (previous state declarations remain the same)

  // Check for dispatch parameters on component mount


  // ... (handleLogin and verifySession remain the same)

  const handleDispatch = useCallback(async (dmsg_id) => {
    // Check if already completed
    if (sessionStorage.getItem(`dispatch_completed_${dmsg_id}`) === "done") {
      return;
    }

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
        // ... (rest of the dispatch logic remains the same)
      }
  
      const finalStatus = await updateDispatchStatus(dmsg_id);
      if (!finalStatus.success) {
        throw new Error("Failed to update dispatch status");
      }
  
      // Mark as completed in session storage
      sessionStorage.setItem(`dispatch_completed_${dmsg_id}`, "done");
      
      // Update URL parameter
      if (window.history.pushState) {
        const newUrl = new URL(window.location);
        newUrl.searchParams.set('start_dispatch', '2');
        window.history.pushState({}, '', newUrl);
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
  }, [accessToken, dispatchId, updateDispatchStatus, processedMessages, retryCounts]);

  // Single dispatch trigger effect
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const dmsg_id = urlParams.get("dmsg_id");
    const start = urlParams.get("start_dispatch");

    if (isLoggedIn && dmsg_id && start === "1" && !dispatching) {
      // Check session storage to prevent re-dispatch
      if (sessionStorage.getItem(`dispatch_completed_${dmsg_id}`) !== "done") {
        handleDispatch(dmsg_id);
      }
    }
  }, [isLoggedIn, dispatching, handleDispatch]);

  // ... (rest of the component remains the same)
}