// Add this state to track if dispatch has been initiated
const [dispatchInitiated, setDispatchInitiated] = useState(false);

// Modify your useEffect that starts the dispatch

// Modify your handleDispatch to reset the initiated flag when done
const handleDispatch = useCallback(async (dmsg_id) => {
  if (dispatching) return;
  
  setError("");
  setDispatching(true);
  setPaused(false);
  updateProgress(() => ({ current: 0, total: 0, success: 0, failed: 0, rateLimited: 0 }));
  setRetryCounts({});
  setProcessedMessages(new Set());
  addLog(`Starting dispatch for message ID: ${dmsg_id}`);

  try {
    // ... rest of your dispatch logic ...

  } catch (err) {
    if (err.name !== 'AbortError') {
      addLog(`Dispatch error: ${err.message}`, "error");
      setError(`Dispatch error: ${err.message}`);
    }
  } finally {
    setDispatching(false);
    setDispatchInitiated(false); // Reset the initiated flag
  }
}, [accessToken, updateDispatchStatus, processedMessages, retryCounts, paused, dispatching]);