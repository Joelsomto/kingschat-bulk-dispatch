// ... [imports and constants remain unchanged]

function App() {
  // ... [states and refs remain unchanged]

  // Sync progressRef with setProgress
  const updateProgress = (updateFn) => {
    setProgress(prev => {
      const updated = updateFn(prev);
      progressRef.current = updated;
      return updated;
    });
  };

  // ... [useEffect for URL params remains unchanged]

  const handleDispatch = useCallback(async (dmsg_id) => {
    setError("");
    setDispatching(true);
    updateProgress(() => ({ current: 0, total: 0, success: 0, failed: 0 }));
    setRetryCounts({});
    setProcessedMessages(new Set());

    try {
      const batchData = await fetchDispatchBatch(dmsg_id);
      let messages = prepareMessagesForDispatch(batchData);

      messages = messages.map(msg => ({
        ...msg,
        body: msg.body
          .replace(/<kc_username>/g, msg.username)
          .replace(/<fullname>/g, msg.fullname),
      }));

      let remainingMessages = messages;
      let attempt = 0;

      updateProgress(prev => ({ ...prev, total: messages.length }));

      while (remainingMessages.length > 0 && attempt < MAX_RETRY_ATTEMPTS) {
        const currentBatch = [...remainingMessages];
        remainingMessages = [];

        for (const msg of currentBatch) {
          if (processedMessages.has(msg.kc_id)) continue;

          try {
            await new Promise(res => setTimeout(res, MESSAGE_DELAY_MS));
            const res = await sendMessage(accessToken, msg.kc_id, msg.body);

            if (res.success) {
              setProcessedMessages(prev => new Set(prev).add(msg.kc_id));
              updateProgress(prev => ({
                ...prev,
                current: prev.current + 1,
                success: prev.success + 1,
              }));
              continue;
            }
          } catch (err) {
            console.warn(`Error sending to ${msg.kc_id}:`, err.message);
          }

          const currentRetry = retryCounts[msg.kc_id] || 0;
          if (currentRetry + 1 < MAX_RETRY_ATTEMPTS) {
            remainingMessages.push(msg);
          } else {
            updateProgress(prev => ({
              ...prev,
              current: prev.current + 1,
              failed: prev.failed + 1,
            }));
          }

          setRetryCounts(prev => ({
            ...prev,
            [msg.kc_id]: (prev[msg.kc_id] || 0) + 1,
          }));
        }

        attempt++;
        if (remainingMessages.length > 0 && attempt < MAX_RETRY_ATTEMPTS) {
          await new Promise(res => setTimeout(res, RETRY_DELAY_MS));
        }
      }

      const finalStatus = await updateDispatchStatus(dmsg_id);
      if (!finalStatus.success) throw new Error("Update failed");

      sessionStorage.setItem(`dispatch_status_${dmsg_id}`, "completed");
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set("start_dispatch", "2");
      window.history.pushState({}, "", newUrl.toString());

    } catch (err) {
      setError(`Dispatch error: ${err.message}`);
    } finally {
      setDispatching(false);
    }
  }, [accessToken, updateDispatchStatus, processedMessages]);

  // ... [rest of the code remains unchanged — ProgressBar, DispatchAnalytics, UI return]

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
