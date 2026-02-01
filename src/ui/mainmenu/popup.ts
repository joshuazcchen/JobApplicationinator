document.getElementById('scanBtn')?.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { action: "scrape" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("connection failed:", chrome.runtime.lastError.message);
      alert("error 3: page grab failed");
      return; 
    }
    if (response && response.data) {
      chrome.storage.local.set({ 'scrapedContent': response.data }, () => {
          console.log("saved. (200)");
      });
      chrome.sidePanel.open({ windowId: tab.windowId });
      
      window.close();
    }
  });
});